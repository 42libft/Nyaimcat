import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type GuildMember,
  type PartialGuildMember,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";

import type { BotConfig } from "../config";
import { logger } from "../utils/logger";
import {
  buildCommandCollection,
  commandModules,
} from "./commands/index";
import { handleWorkStartSelect } from "./commands/work";
import type { CommandExecuteContext, SlashCommandModule } from "./commands/types";
import { AuditLogger } from "./auditLogger";
import { OnboardingManager } from "./onboarding/manager";
import { VerifyManager } from "./verify/manager";
import { RolesPanelManager } from "./roles/manager";
import { IntroduceManager } from "./introduce/manager";
import { CodexFollowUpManager } from "./codex/followUpManager";
import { PresenceManager } from "./presenceManager";

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
  }

  async start() {
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

  getClient() {
    return this.client;
  }

  private registerEventHandlers() {
    this.client.on("ready", () => {
      if (!this.client.user) {
        return;
      }

      this.presenceManager.start();

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

      if (interaction.isModalSubmit()) {
        const handled = await this.codexFollowUpManager.handleModalSubmit(interaction);
        if (handled) {
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
        ephemeral: true,
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
            ephemeral: true,
          });
        } else if (interaction.isRepliable()) {
          await interaction.reply({
            content: "コマンド実行中にエラーが発生しました。",
            ephemeral: true,
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
}
