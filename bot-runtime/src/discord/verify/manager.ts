import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  MessageFlags,
  MessageReaction,
  PartialGuildMember,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";

import type { BotConfig, VerifyConfig } from "../../config";
import { logger } from "../../utils/logger";
import type { AuditLogger } from "../auditLogger";

const VERIFY_BUTTON_ID = "verify:grant";
const DEFAULT_VERIFY_EMOJI = "✅";

const isSendable = (channel: unknown): channel is GuildTextBasedChannel => {
  if (!channel) {
    return false;
  }

  return (
    typeof channel === "object" &&
    channel !== null &&
    "isTextBased" in channel &&
    typeof (channel as { isTextBased?: unknown }).isTextBased === "function" &&
    (channel as GuildTextBasedChannel).isTextBased()
  );
};

const resolveEmojiString = (emoji: string | null | undefined) =>
  emoji && emoji.trim().length > 0 ? emoji.trim() : DEFAULT_VERIFY_EMOJI;

const reactionMatchesEmoji = (
  reaction: MessageReaction,
  expected: string
) => {
  if (!expected) {
    return false;
  }

  // Custom emoji specified as numeric ID
  if (/^\d+$/.test(expected)) {
    return reaction.emoji.id === expected;
  }

  // Exact match including unicode
  if (reaction.emoji.toString() === expected) {
    return true;
  }

  return reaction.emoji.name === expected;
};

type PublishOptions = {
  executorId: string;
  channelId?: string | null;
};

type PublishResult = {
  message: Message;
  created: boolean;
};

export class VerifyManager {
  private config: BotConfig;

  constructor(
    private readonly client: Client,
    private readonly auditLogger: AuditLogger,
    config: BotConfig
  ) {
    this.config = config;
  }

  updateConfig(config: BotConfig) {
    this.config = config;
  }

  get buttonId() {
    return VERIFY_BUTTON_ID;
  }

  async publish(options: PublishOptions): Promise<PublishResult> {
    const verifyConfig = this.getVerifyConfig();

    if (!verifyConfig) {
      throw new Error("verify設定が存在しません");
    }

    logger.debug("Verify publish invoked", {
      prompt: verifyConfig.prompt,
      mode: verifyConfig.mode,
      channelId: verifyConfig.channel_id,
      messageId: verifyConfig.message_id ?? null,
    });

    const channelId =
      options.channelId ??
      verifyConfig.channel_id ??
      this.config.channels.verify ??
      null;

    if (!channelId) {
      throw new Error("投稿先チャンネルが設定されていません");
    }

    const channel = await this.client.channels.fetch(channelId);

    if (!isSendable(channel)) {
      throw new Error("指定されたチャンネルにメッセージを送信できません");
    }

    const payload = this.buildMessagePayload(verifyConfig);

    let created = true;
    let message: Message | null = null;

    if (verifyConfig.message_id) {
      try {
        const existing = await channel.messages.fetch(verifyConfig.message_id);
        await existing.edit(payload);
        message = existing;
        created = false;
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        logger.warn("Verify対象メッセージを更新できなかったため新規投稿します", {
          error: messageText,
          messageId: verifyConfig.message_id,
          channelId,
        });
      }
    }

    if (!message) {
      message = await channel.send(payload);
      created = true;
    }

    if (!message) {
      throw new Error("Verifyメッセージの投稿に失敗しました");
    }

    if (verifyConfig.mode === "reaction") {
      const emoji = resolveEmojiString(verifyConfig.emoji);
      try {
        await message.react(emoji);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        logger.warn("Verifyメッセージへのリアクション付与に失敗しました", {
          message: messageText,
          channelId,
          messageId: message.id,
          emoji,
        });
      }
    }

    await this.auditLogger.log({
      action: "verify.post",
      status: "success",
      details: {
        channelId,
        messageId: message.id,
        mode: verifyConfig.mode,
        created,
        executorId: options.executorId,
      },
    });

    return { message, created };
  }

  async handleButton(interaction: ButtonInteraction) {
    if (interaction.customId !== VERIFY_BUTTON_ID) {
      return;
    }

    const verifyConfig = this.getVerifyConfig();

    if (!verifyConfig) {
      await this.replyEphemeral(
        interaction,
        "認証設定が見つかりません。運営にお問い合わせください。"
      );
      return;
    }

    if (verifyConfig.mode !== "button") {
      await this.replyEphemeral(interaction, "現在は反応式の認証が有効です。");
      return;
    }

    if (!interaction.guild) {
      await this.replyEphemeral(
        interaction,
        "ギルド外で実行されたため認証できません。"
      );
      return;
    }

    const member = interaction.member;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    if (!member || !(member instanceof GuildMember)) {
      const fetched = await interaction.guild.members.fetch(interaction.user.id);
      await this.grantRole(fetched, verifyConfig, interaction);
      return;
    }

    await this.grantRole(member, verifyConfig, interaction);
  }

  async handleReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ) {
    const verifyConfig = this.getVerifyConfig();

    if (!verifyConfig || verifyConfig.mode !== "reaction") {
      return;
    }

    if (user.id === this.client.user?.id) {
      return;
    }

    try {
      const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
      const fullUser = user.partial ? await user.fetch() : user;

      if (verifyConfig.message_id && fullReaction.message.id !== verifyConfig.message_id) {
        return;
      }

      const emoji = resolveEmojiString(verifyConfig.emoji);

      if (!reactionMatchesEmoji(fullReaction, emoji)) {
        return;
      }

      const guild = fullReaction.message.guild;

      if (!guild) {
        return;
      }

      const member = await guild.members.fetch(fullUser.id);

      await this.applyRole(member, verifyConfig, {
        reason: "reaction",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Verifyリアクション処理でエラーが発生しました", { message });
    }
  }

  async handleMemberRemove(
    member: GuildMember | PartialGuildMember
  ): Promise<boolean> {
    const verifyConfig = this.getVerifyConfig();

    if (!verifyConfig) {
      return false;
    }

    const roleId = verifyConfig.role_id;
    const hadRole = this.hasRole(member, roleId);

    if (!hadRole) {
      return false;
    }

    await this.auditLogger.log({
      action: "verify.revoke",
      status: "info",
      details: {
        userId: member.id,
        roleId,
        reason: "member_left",
        guildId:
          "guild" in member && member.guild
            ? member.guild.id
            : this.config.guild.id,
      },
    });

    return true;
  }

  async handleMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember
  ): Promise<boolean> {
    const verifyConfig = this.getVerifyConfig();

    if (!verifyConfig) {
      return false;
    }

    const roleId = verifyConfig.role_id;
    const hadBefore = this.hasRole(oldMember, roleId);
    const hasAfter = this.hasRole(newMember, roleId);

    if (!hadBefore || hasAfter) {
      return false;
    }

    await this.auditLogger.log({
      action: "verify.revoke",
      status: "info",
      details: {
        userId: newMember.id,
        roleId,
        reason: "role_removed",
        guildId: newMember.guild.id,
      },
    });

    return true;
  }

  private buildMessagePayload(verifyConfig: VerifyConfig) {
    if (verifyConfig.mode === "button") {
      const button = new ButtonBuilder()
        .setCustomId(VERIFY_BUTTON_ID)
        .setLabel("Verify")
        .setStyle(ButtonStyle.Success);

      const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
        button
      );

      return {
        content: verifyConfig.prompt,
        components: [components],
      } as const;
    }

    return {
      content: `${verifyConfig.prompt}\n\nリアクション${resolveEmojiString(
        verifyConfig.emoji
      )}を付けて認証を完了してください。`,
    } as const;
  }

  private getVerifyConfig(): VerifyConfig | null {
    return this.config.verify ?? null;
  }

  private hasRole(
    member: GuildMember | PartialGuildMember | null,
    roleId: string
  ): boolean {
    if (!member) {
      return false;
    }

    const roles = member.roles;

    if (!roles) {
      return false;
    }

    try {
      return roles.cache.has(roleId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug("ロール状態の確認に失敗しました", {
        roleId,
        message,
        memberId: member.id,
      });
      return false;
    }
  }

  private async replyEphemeral(
    interaction: ButtonInteraction,
    content: string
  ): Promise<void> {
    const payload = { content };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return;
    }

    await interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async grantRole(
    member: GuildMember,
    verifyConfig: VerifyConfig,
    interaction: ButtonInteraction
  ) {
    try {
      const applied = await this.applyRole(member, verifyConfig, {
        reason: "button",
        executorId: interaction.user.id,
      });

      const content = applied
        ? "認証が完了しました。ようこそ！"
        : "すでに認証済みです。";

      await this.replyEphemeral(interaction, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.replyEphemeral(interaction, `認証に失敗しました: ${message}`);
    }
  }

  private async applyRole(
    member: GuildMember,
    verifyConfig: VerifyConfig,
    context: { reason: "button" | "reaction"; executorId?: string }
  ) {
    const roleId = verifyConfig.role_id;

    if (member.roles.cache.has(roleId)) {
      if (context.reason === "button") {
        await this.auditLogger.log({
          action: "verify.grant",
          status: "info",
          description: "既に認証済みのメンバーです",
          details: {
            userId: member.id,
            roleId,
            reason: context.reason,
          },
        });
      }
      return false;
    }

    try {
      await member.roles.add(roleId, "Nyaimlab verify");

      await this.auditLogger.log({
        action: "verify.grant",
        status: "success",
        details: {
          userId: member.id,
          roleId,
          reason: context.reason,
          executorId: context.executorId ?? null,
        },
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.auditLogger.log({
        action: "verify.grant",
        status: "failure",
        description: message,
        details: {
          userId: member.id,
          roleId,
          reason: context.reason,
          executorId: context.executorId ?? null,
        },
      });

      throw error;
    }
  }
}

export { VERIFY_BUTTON_ID };
