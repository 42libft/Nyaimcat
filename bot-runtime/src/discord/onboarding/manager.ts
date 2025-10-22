import {
  ButtonInteraction,
  Channel,
  ChannelType,
  Client,
  GuildMember,
  GuildTextBasedChannel,
  MessageFlags,
  Message,
} from "discord.js";

import type { BotConfig } from "../../config";
import { logger } from "../../utils/logger";
import { AuditLogger } from "../auditLogger";
import {
  WELCOME_ROLES_BUTTON_ID,
  buildDmFallbackMessage,
  buildWelcomeMessage,
  createRolesJumpResponse,
  formatDmMessage,
} from "./welcome";

const DM_DISABLED_CODES = new Set([50007]);

export class OnboardingManager {
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

  async handleMemberJoin(member: GuildMember) {
    if (!this.config.features.welcomeMessage) {
      logger.debug("welcomeMessage機能が無効化されているため、オンボーディング処理をスキップします");
      return;
    }

    const welcomeChannelId = this.config.channels.welcome;

    if (!welcomeChannelId) {
      logger.warn("welcomeチャンネルが設定されていないため、歓迎メッセージを送信できません", {
        memberId: member.id,
      });

      await this.auditLogger.log({
        action: "onboarding.welcome",
        status: "failure",
        description: "welcomeチャンネルが設定されていないため送信できませんでした",
        details: {
          memberId: member.id,
        },
      });

      return;
    }

    const channel = await this.client.channels.fetch(welcomeChannelId);

    if (!this.isGuildTextChannel(channel)) {
      logger.error("welcomeチャンネルがテキストチャンネルではありません", {
        channelId: welcomeChannelId,
      });

      await this.auditLogger.log({
        action: "onboarding.welcome",
        status: "failure",
        description: "welcomeチャンネルがテキストチャンネルではありません",
        details: {
          memberId: member.id,
          channelId: welcomeChannelId,
        },
      });

      return;
    }

    const targetChannel = channel;
    const memberIndex = await this.computeMemberIndex(member);
    const messageOptions = buildWelcomeMessage({
      member,
      config: this.config,
      memberIndex,
    });

    let sentMessage: Message;

    try {
      sentMessage = await targetChannel.send(messageOptions);

      await this.auditLogger.log({
        action: "onboarding.welcome",
        status: "success",
        details: {
          memberId: member.id,
          channelId: targetChannel.id,
          messageId: sentMessage.id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("歓迎メッセージの送信に失敗しました", {
        memberId: member.id,
        channelId: targetChannel.id,
        message,
      });

      await this.auditLogger.log({
        action: "onboarding.welcome",
        status: "failure",
        description: message,
        details: {
          memberId: member.id,
          channelId: targetChannel.id,
        },
      });

      return;
    }

    if (!this.config.onboarding.dm.enabled) {
      logger.debug("オンボーディングDM機能は無効化されています", {
        memberId: member.id,
      });
      return;
    }

    await this.sendDirectMessage(member, memberIndex, sentMessage);
  }

  async handleInteraction(interaction: ButtonInteraction) {
    if (interaction.customId !== WELCOME_ROLES_BUTTON_ID) {
      return;
    }

    const response = createRolesJumpResponse(this.config);

    try {
      await interaction.reply(response);

      await this.auditLogger.log({
        action: "onboarding.roles_jump",
        status: "success",
        details: {
          userId: interaction.user.id,
          guildId: interaction.guildId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ロール案内ボタンの応答に失敗しました", {
        message,
        userId: interaction.user.id,
      });

      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({
          content: "内部エラーにより案内を表示できませんでした。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await this.auditLogger.log({
        action: "onboarding.roles_jump",
        status: "failure",
        description: message,
        details: {
          userId: interaction.user.id,
          guildId: interaction.guildId,
        },
      });
    }
  }

  private async computeMemberIndex(member: GuildMember): Promise<number> {
    if (this.config.features.countBotsInMemberCount) {
      return member.guild.memberCount;
    }

    try {
      const members = await member.guild.members.fetch();
      const humans = members.filter((m) => !m.user.bot);
      return humans.size;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("メンバー数の取得に失敗したため、既知のカウントを利用します", {
        message,
        guildId: member.guild.id,
      });
      return member.guild.memberCount;
    }
  }

  private async sendDirectMessage(
    member: GuildMember,
    memberIndex: number,
    welcomeMessage: Message | null
  ) {
    const content = formatDmMessage(member, this.config, memberIndex);

    try {
      await member.send({ content });

      await this.auditLogger.log({
        action: "onboarding.dm",
        status: "success",
        details: {
          memberId: member.id,
        },
      });
    } catch (error) {
      const isDiscordError =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "number";

      const code = isDiscordError
        ? Number((error as { code: number }).code)
        : undefined;

      const message = error instanceof Error ? error.message : String(error);

      logger.warn("オンボーディングDMの送信に失敗しました", {
        memberId: member.id,
        code,
        message,
      });

      await this.auditLogger.log({
        action: "onboarding.dm",
        status: "failure",
        description: message,
        details: {
          memberId: member.id,
          code,
        },
      });

      if (welcomeMessage && DM_DISABLED_CODES.has(code ?? 0)) {
        await this.createFallbackThread(member, memberIndex, welcomeMessage);
      }
    }
  }

  private async createFallbackThread(
    member: GuildMember,
    memberIndex: number,
    message: Message
  ) {
    const fallbackMessage = buildDmFallbackMessage(
      member,
      this.config,
      memberIndex
    );

    try {
      const thread = await message.startThread({
        name: this.buildThreadName(member),
        autoArchiveDuration: 1440,
      });

      await thread.send({ content: fallbackMessage });

      await this.auditLogger.log({
        action: "onboarding.dm_fallback",
        status: "info",
        details: {
          memberId: member.id,
          threadId: thread.id,
        },
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error("DM失敗時のフォールバックスレッド作成に失敗しました", {
        memberId: member.id,
        message: messageText,
      });

      await this.auditLogger.log({
        action: "onboarding.dm_fallback",
        status: "failure",
        description: messageText,
        details: {
          memberId: member.id,
        },
      });
    }
  }

  private buildThreadName(member: GuildMember) {
    const base = `${member.displayName}-onboarding`;
    return base.length > 90 ? `${base.slice(0, 87)}...` : base;
  }

  private isGuildTextChannel(
    channel: Channel | null
  ): channel is GuildTextBasedChannel {
    if (!channel) {
      return false;
    }

    if (!channel.isTextBased()) {
      return false;
    }

    if (
      "guild" in channel &&
      channel.guild &&
      channel.type !== ChannelType.GuildVoice
    ) {
      return true;
    }

    return false;
  }
}
