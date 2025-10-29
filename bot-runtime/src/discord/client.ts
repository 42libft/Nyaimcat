import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type PartialGuildMember,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type ModalSubmitInteraction,
  type Message,
  type User,
} from "discord.js";

import type { BotConfig, RagConfig } from "../config";
import { createEsclEnvironment, EsclEnvironment } from "../escl/environment";
import { logger } from "../utils/logger";
import {
  buildCommandCollection,
  commandModules,
} from "./commands/index";
import { handleWorkStartSelect } from "./commands/work";
import { handleEsclAccountModalSubmit } from "./commands/esclAccount";
import type { CommandExecuteContext, SlashCommandModule } from "./commands/types";
import { AuditLogger } from "./auditLogger";
import { OnboardingManager } from "./onboarding/manager";
import { VerifyManager } from "./verify/manager";
import { RolesPanelManager } from "./roles/manager";
import { IntroduceManager } from "./introduce/manager";
import { CodexFollowUpManager } from "./codex/followUpManager";
import { PresenceManager } from "./presenceManager";
import { PermissionMonitor } from "../health/permissionMonitor";
import { RagClient, type RagMessageEvent, type RagMode } from "../rag/client";

export type DiscordClientOptions = {
  token: string;
  clientId: string;
  guildId?: string;
  config: BotConfig;
  syncCommands?: boolean;
};

const buildIntentList = () => [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
];

const PARTIALS = [
  Partials.Message,
  Partials.Channel,
  Partials.Reaction,
  Partials.GuildMember,
];

export class DiscordRuntime {
  private readonly token: string;
  private readonly clientId: string;
  private readonly guildId: string | undefined;
  private readonly syncCommands: boolean;
  private readonly rest: REST;
  private client: Client;
  private commands: Collection<string, SlashCommandModule>;
  private config: BotConfig;
  private auditLogger: AuditLogger;
  private onboarding: OnboardingManager;
  private verifyManager: VerifyManager;
  private rolesManager: RolesPanelManager;
  private introduceManager: IntroduceManager;
  private codexFollowUpManager: CodexFollowUpManager;
  private presenceManager: PresenceManager;
  private permissionMonitor: PermissionMonitor;
  private escl: EsclEnvironment;
  private ragClient: RagClient;
  private ragConfig: RagConfig | null;
  private ragExcludedChannels: Set<string>;
  private handledMentionMessageQueue: string[];
  private handledMentionMessageSet: Set<string>;

  constructor(options: DiscordClientOptions) {
    this.token = options.token;
    this.clientId = options.clientId;
    this.guildId = options.guildId;
    this.config = options.config;
    this.syncCommands = options.syncCommands ?? true;

    this.client = new Client({
      intents: buildIntentList(),
      partials: PARTIALS,
    });

    this.rest = new REST({ version: "10" }).setToken(this.token);
    this.commands = buildCommandCollection();
    this.auditLogger = new AuditLogger(this.client, this.config);
    this.codexFollowUpManager = new CodexFollowUpManager(this.auditLogger);
    this.onboarding = new OnboardingManager(this.client, this.auditLogger, this.config);
    this.verifyManager = new VerifyManager(this.client, this.auditLogger, this.config);
    this.rolesManager = new RolesPanelManager(
      this.client,
      this.auditLogger,
      this.config
    );
    this.introduceManager = new IntroduceManager(this.auditLogger, this.config);
    this.presenceManager = new PresenceManager(this.client);
    this.permissionMonitor = new PermissionMonitor(this.client, this.config);
    this.escl = createEsclEnvironment();
    this.ragClient = new RagClient();
    this.ragConfig = null;
    this.ragExcludedChannels = new Set();
    this.handledMentionMessageQueue = [];
    this.handledMentionMessageSet = new Set();
    this.syncRagConfig(this.config);
  }

  async start() {
    try {
      await this.escl.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ESCL 環境の初期化に失敗しました", { message });
      throw error;
    }

    if (this.syncCommands) {
      await this.registerSlashCommands();
    } else {
      logger.info("Slash Command 同期をスキップします (syncCommands=false)");
    }
    this.registerEventHandlers();

    await this.client.login(this.token);
    await this.auditLogger.log({
      action: "bot.startup",
      status: "success",
      description: "Botプロセスが正常に起動しました",
      details: {
        clientId: this.clientId,
        guildId: this.guildId ?? null,
      },
    });
  }

  applyConfigUpdate(
    config: BotConfig,
    context?: { changedSections?: string[]; hash?: string }
  ) {
    this.config = config;
    this.auditLogger.updateConfig(config);
    this.onboarding.updateConfig(config);
    this.verifyManager.updateConfig(config);
    this.rolesManager.updateConfig(config);
    this.introduceManager.updateConfig(config);
    void this.presenceManager.refresh();
    this.permissionMonitor.updateConfig(config);
    this.syncRagConfig(config);

    logger.debug("DiscordRuntime 設定を更新しました", {
      changedSections: context?.changedSections ?? [],
      hash: context?.hash,
    });

    void this.auditLogger.log({
      action: "config.update",
      status: "info",
      details: {
        changedSections: context?.changedSections ?? [],
        hash: context?.hash ?? null,
      },
    });
  }

  private syncRagConfig(config: BotConfig) {
    this.ragConfig = config.rag ?? null;
    this.ragExcludedChannels = new Set(
      this.ragConfig?.short_term.excluded_channels ?? []
    );
  }

  private markMentionHandled(messageId: string) {
    if (this.handledMentionMessageSet.has(messageId)) {
      return;
    }
    this.handledMentionMessageSet.add(messageId);
    this.handledMentionMessageQueue.push(messageId);
    if (this.handledMentionMessageQueue.length > 500) {
      const oldest = this.handledMentionMessageQueue.shift();
      if (oldest) {
        this.handledMentionMessageSet.delete(oldest);
      }
    }
  }

  getClient() {
    return this.client;
  }

  private registerEventHandlers() {
    this.client.on("ready", () => {
      if (!this.client.user) {
        return;
      }

      this.presenceManager.start();
      this.permissionMonitor.start();

      logger.info("Discord クライアントが起動しました", {
        user: this.client.user.tag,
        id: this.client.user.id,
      });

      void this.auditLogger.log({
        action: "client.ready",
        status: "success",
        details: {
          userTag: this.client.user.tag,
          userId: this.client.user.id,
        },
      });
    });

    this.client.on("guildMemberAdd", (member: GuildMember) => {
      logger.info("新規メンバーを検知しました", {
        memberId: member.id,
        guildId: member.guild.id,
      });

      void this.auditLogger.log({
        action: "member.join",
        status: "info",
        details: {
          memberId: member.id,
          guildId: member.guild.id,
        },
      });

      void this.onboarding.handleMemberJoin(member).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("オンボーディング処理中に予期しないエラーが発生しました", {
          memberId: member.id,
          message,
        });
      });
    });

    this.client.on("guildMemberRemove", async (member) => {
      const guildId =
        "guild" in member && member.guild
          ? member.guild.id
          : this.config.guild.id;

      logger.info("メンバー退会を検知しました", {
        memberId: member.id,
        guildId,
      });

      let hadVerifyRole = false;

      try {
        hadVerifyRole = await this.verifyManager.handleMemberRemove(member);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Verify退会処理でエラーが発生しました", {
          memberId: member.id,
          message,
        });
      }

      void this.auditLogger.log({
        action: "member.leave",
        status: "info",
        details: {
          memberId: member.id,
          guildId,
          hadVerifyRole,
        },
      });
    });

    this.client.on(
      "guildMemberUpdate",
      async (
        oldMember: GuildMember | PartialGuildMember,
        newMember: GuildMember
      ) => {
        try {
          const revoked = await this.verifyManager.handleMemberUpdate(
            oldMember,
            newMember
          );

          if (revoked) {
            logger.info("Verifyロールが剥奪されました", {
              memberId: newMember.id,
              guildId: newMember.guild.id,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("Verifyロール剥奪監査でエラーが発生しました", {
            memberId: newMember.id,
            message,
          });
        }
      }
    );

    this.client.on("messageCreate", (message) => {
      void this.forwardMessageToRag(message);
    });

    this.client.on(
      "messageReactionAdd",
      async (
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser
      ) => {
        try {
          await this.verifyManager.handleReactionAdd(reaction, user);
          await this.rolesManager.handleReactionAdd(reaction, user);

          const fullReaction = reaction.partial
            ? await reaction.fetch()
            : reaction;
          const fullUser = user.partial ? await user.fetch() : user;

          logger.debug("リアクション追加イベント", {
            emoji: fullReaction.emoji.toString(),
            messageId: fullReaction.message.id,
            userId: fullUser.id,
          });

          void this.auditLogger.log({
            action: "reaction.add",
            status: "info",
            details: {
              emoji: fullReaction.emoji.toString(),
              messageId: fullReaction.message.id,
              userId: fullUser.id,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("リアクション情報の取得に失敗しました", { message });
        }
      }
    );

    this.client.on(
      "messageReactionRemove",
      async (
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser
      ) => {
        try {
          await this.rolesManager.handleReactionRemove(reaction, user);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("リアクション削除処理でエラーが発生しました", { message });
        }
      }
    );

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton()) {
        const handled = await this.codexFollowUpManager.handleButton(interaction);
        if (handled) {
          return;
        }
        await this.onboarding.handleInteraction(interaction);
        await this.verifyManager.handleButton(interaction);
        await this.rolesManager.handleButton(interaction);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const handled = await handleWorkStartSelect(
          interaction,
          this.buildCommandContext()
        );
        if (handled) {
          return;
        }
        await this.rolesManager.handleSelect(interaction);
        return;
      }

      if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        const handled = await this.codexFollowUpManager.handleModalSubmit(interaction);
        if (handled) {
          return;
        }
        const modalHandled = await this.handleEsclAccountModal(interaction);
        if (modalHandled) {
          return;
        }
        await this.introduceManager.handleModalSubmit(interaction);
        return;
      }

      if (!interaction.isChatInputCommand()) {
        return;
      }

      await this.handleChatCommand(interaction);
    });
  }

  private async registerSlashCommands() {
    const commandsPayload = commandModules.map((command) => command.data.toJSON());

    try {
      if (this.guildId) {
        await this.rest.put(
          Routes.applicationGuildCommands(this.clientId, this.guildId),
          { body: commandsPayload }
        );
        logger.info("ギルド向けSlash Commandを同期しました", {
          commandCount: commandsPayload.length,
          guildId: this.guildId,
        });
      } else {
        await this.rest.put(Routes.applicationCommands(this.clientId), {
          body: commandsPayload,
        });
        logger.info("グローバルSlash Commandを同期しました", {
          commandCount: commandsPayload.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Slash Command登録に失敗しました", { message });
      throw error;
    }
  }

  private buildCommandContext(): CommandExecuteContext {
    return {
      config: this.config,
      client: this.client,
      auditLogger: this.auditLogger,
      verifyManager: this.verifyManager,
      rolesManager: this.rolesManager,
      introduceManager: this.introduceManager,
      escl: this.escl,
      ragClient: this.ragClient,
    };
  }

  private async handleChatCommand(interaction: ChatInputCommandInteraction) {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      logger.warn("未登録のSlash Commandが呼び出されました", {
        name: interaction.commandName,
      });
      await interaction.reply({
        content: "このコマンドは現在利用できません。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await command.execute(interaction, this.buildCommandContext());
      await this.auditLogger.log({
        action: "command.execute",
        status: "success",
        details: {
          command: command.data.name,
          userId: interaction.user.id,
          guildId: interaction.guildId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Slash Command実行中にエラーが発生しました", {
        name: command.data.name,
        message,
      });

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: "コマンド実行中にエラーが発生しました。",
            flags: MessageFlags.Ephemeral,
          });
        } else if (interaction.isRepliable()) {
          await interaction.reply({
            content: "コマンド実行中にエラーが発生しました。",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (responseError) {
        const responseMessage =
          responseError instanceof Error ? responseError.message : String(responseError);
        logger.warn("エラー通知の送信に失敗しました", {
          name: command.data.name,
          message: responseMessage,
        });
      }

      await this.auditLogger.log({
        action: "command.execute",
        status: "failure",
        description: message,
        details: {
          command: command.data.name,
          userId: interaction.user.id,
          guildId: interaction.guildId,
        },
      });
    }
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction) {
    const command = this.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      try {
        await interaction.respond([]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug("オートコンプリート応答に失敗しました", { message });
      }
      return;
    }

    try {
      await command.autocomplete(interaction, this.buildCommandContext());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Autocomplete ハンドラでエラーが発生しました", {
        command: interaction.commandName,
        message,
      });
      try {
        await interaction.respond([]);
      } catch (respondError) {
        const respondMessage =
          respondError instanceof Error ? respondError.message : String(respondError);
        logger.debug("オートコンプリートのフォールバック応答に失敗しました", {
          command: interaction.commandName,
          message: respondMessage,
        });
      }
    }
  }

  private async forwardMessageToRag(message: Message) {
    if (!message.inGuild()) {
      return;
    }
    if (message.author.bot) {
      return;
    }

    let resolved = message;
    if (message.partial) {
      try {
        resolved = await message.fetch();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.debug("メッセージのフェッチに失敗したため RAG 連携をスキップします", {
          messageId: message.id,
          reason: msg,
        });
        return;
      }
    }

    const content = resolved.content?.trim();
    if (!content) {
      return;
    }

    const clientUser = this.client.user;
    const tags: string[] = [];

    if (clientUser && resolved.mentions.users.has(clientUser.id)) {
      tags.push("mention");
    }

    if (
      "isThread" in resolved.channel &&
      typeof resolved.channel.isThread === "function" &&
      resolved.channel.isThread()
    ) {
      tags.push("thread");
    }

    if (resolved.reference) {
      tags.push("reply");
    }

    if (content.includes("?")) {
      tags.push("question");
    }

    const probableMode: RagMode | undefined = tags.includes("question") ? "help" : undefined;

    const eventBase: RagMessageEvent = {
      message_id: resolved.id,
      guild_id: resolved.guildId,
      channel_id: resolved.channelId,
      author_id: resolved.author.id,
      content,
      timestamp: resolved.createdAt.toISOString(),
      is_mention: tags.includes("mention"),
      tags,
    };

    const event: RagMessageEvent =
      probableMode !== undefined
        ? { ...eventBase, probable_mode: probableMode }
        : eventBase;

    const isExcluded = this.ragExcludedChannels.has(resolved.channelId);

    try {
      if (!isExcluded) {
        await this.ragClient.postMessage(event);
      } else {
        logger.debug("RAG へのメッセージ送信をスキップします (除外チャンネル)", {
          channelId: resolved.channelId,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug("RAG サービスへのメッセージ送信に失敗しました", {
        messageId: resolved.id,
        channelId: resolved.channelId,
        reason: msg,
      });
    }

    if (event.is_mention) {
      await this.respondToMention(resolved);
    }
  }

  private async respondToMention(message: Message) {
    const clientUser = this.client.user;
    if (!clientUser) {
      return;
    }
    if (!message.inGuild()) {
      return;
    }
    if (!message.mentions.users.has(clientUser.id)) {
      return;
    }
    if (!message.channel.isTextBased()) {
      return;
    }
    if (this.handledMentionMessageSet.has(message.id)) {
      return;
    }
    this.markMentionHandled(message.id);

    const hasExistingReply = await this.hasExistingMentionReply(message, clientUser);
    if (hasExistingReply) {
      logger.debug("既に同じメッセージへの返信が存在するためスキップします", {
        messageId: message.id,
      });
      return;
    }

    const normalizeContent = (value?: string | null) =>
      typeof value === "string" ? value.trim() : "";

    let replyToMessageId = message.reference?.messageId ?? null;
    const userMessageContent =
      normalizeContent(message.cleanContent) || normalizeContent(message.content);
    let prompt = userMessageContent;

    if (replyToMessageId) {
      try {
        const referenced = await message.fetchReference();
        replyToMessageId = referenced.id;

        const referencedContent =
          normalizeContent(referenced.cleanContent) ||
          normalizeContent(referenced.content);

        if (referencedContent || userMessageContent) {
          const authorName =
            referenced.author?.globalName ??
            referenced.author?.username ??
            (referenced.author
              ? `${referenced.author.username}#${referenced.author.discriminator}`
              : null);

          const sections = [
            "以下の会話内容を踏まえて返答してください。",
            `${authorName ? `${authorName} のメッセージ` : "参照メッセージ"}:\n${referencedContent || "(本文なし)"}`,
            `ユーザーの返信:\n${userMessageContent || "(本文なし)"}`,
          ];

          prompt = sections.join("\n\n");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.debug("返信元メッセージの取得に失敗したため、現在のメッセージのみで応答します", {
          messageId: message.id,
          replyToMessageId,
          reason: msg,
        });
      }
    }

    if (!prompt) {
      return;
    }

    try {
      const channel = message.channel;
      if (
        "sendTyping" in channel &&
        typeof channel.sendTyping === "function"
      ) {
        await channel.sendTyping();
      }
      const defaultMode: RagMode = this.ragConfig?.feelings.default_mode ?? "chat";
      const response = await this.ragClient.chat({
        prompt,
        mode: defaultMode,
        channelId: message.channelId,
        guildId: message.guildId,
        userId: message.author.id,
        includeRecent: true,
        maxContextMessages: 20,
      });

      const replyText = response.reply?.trim();
      if (!replyText) {
        return;
      }

      const alreadyReplied = await this.hasExistingMentionReply(message, clientUser);
      if (alreadyReplied) {
        logger.debug("返信生成中に別インスタンスが応答したためスキップします", {
          messageId: message.id,
        });
        return;
      }

      await message.reply({
        content: replyText,
        allowedMentions: { repliedUser: false },
      });

      await this.auditLogger.log({
        action: "rag.reply",
        status: "success",
        details: {
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId,
          usedContextMessages: response.used_context.length,
          replyToMessageId,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn("メンション応答の生成に失敗しました", {
        messageId: message.id,
        channelId: message.channelId,
        reason: msg,
      });

      await this.auditLogger.log({
        action: "rag.reply",
        status: "failure",
        description: msg,
        details: {
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId,
          replyToMessageId,
        },
      });
    }
  }

  private async hasExistingMentionReply(message: Message, clientUser: User) {
    if (!message.channel.isTextBased()) {
      return false;
    }

    try {
      const recent = await message.channel.messages.fetch({ limit: 20 });
      for (const candidate of recent.values()) {
        if (candidate.author.id !== clientUser.id) {
          continue;
        }
        if (candidate.reference?.messageId === message.id) {
          return true;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug("既存返信の確認に失敗しました", {
        messageId: message.id,
        reason: msg,
      });
    }

    return false;
  }

  private async handleEsclAccountModal(
    interaction: ModalSubmitInteraction
  ): Promise<boolean> {
    const handled = await handleEsclAccountModalSubmit(
      interaction,
      this.buildCommandContext()
    );
    return handled;
  }
}
