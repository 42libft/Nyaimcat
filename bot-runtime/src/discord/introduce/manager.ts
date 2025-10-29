import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  GuildTextBasedChannel,
  MessageCreateOptions,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
} from "discord.js";

import type { BotConfig, IntroduceConfig, IntroduceSchemaConfig } from "../../config";
import { logger } from "../../utils/logger";
import type { AuditLogger } from "../auditLogger";

const INTRODUCE_MODAL_ID = "introduce:submit";

const isTextChannel = (channel: unknown): channel is GuildTextBasedChannel => {
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

type PendingIntroduceImage = {
  url: string;
  uploadName: string;
};

type PendingIntroduceSubmission = {
  userId: string;
  createdAt: number;
  image?: PendingIntroduceImage;
};

const MODAL_ID_PREFIX = `${INTRODUCE_MODAL_ID}:`;
const PENDING_TTL_MS = 5 * 60 * 1000;
const VALID_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export class IntroduceManager {
  private config: BotConfig;
  private readonly pendingSubmissions = new Map<string, PendingIntroduceSubmission>();

  constructor(private readonly auditLogger: AuditLogger, config: BotConfig) {
    this.config = config;
  }

  updateConfig(config: BotConfig) {
    this.config = config;
  }

  async openModal(
    interaction: ChatInputCommandInteraction,
    options?: { imageAttachment?: Attachment }
  ) {
    const introduceConfig = this.getIntroduceConfig();

    if (!introduceConfig) {
      await interaction.reply({
        content: "自己紹介の設定が存在しません。運営にお問い合わせください。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modalId = this.buildModalId(interaction.id);
    const modal = this.buildModal(modalId);

    if (!modal) {
      await interaction.reply({
        content: "自己紹介フォームが未設定のため、投稿できません。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    this.storePendingSubmission(modalId, interaction.user.id, options?.imageAttachment);

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction) {
    if (
      interaction.customId !== INTRODUCE_MODAL_ID &&
      !interaction.customId.startsWith(MODAL_ID_PREFIX)
    ) {
      return;
    }

    const pending = this.consumePendingSubmission(interaction.customId);
    const introduceConfig = this.getIntroduceConfig();
    const schema = this.getSchema();

    if (!introduceConfig || !interaction.guild) {
      await interaction.reply({
        content: "現在自己紹介は利用できません。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channelId =
      introduceConfig.channel_id ?? this.config.channels.introduce ?? null;

    if (!channelId) {
      await interaction.reply({
        content: "投稿先チャンネルが設定されていません。運営にお問い合わせください。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("自己紹介応答の確保に失敗しました", { message, channelId });
      await this.safeErrorReply(
        interaction,
        "自己紹介の投稿に失敗しました。もう一度お試しください。"
      );
      return;
    }

    try {
      const channel = await interaction.client.channels.fetch(channelId);

      if (!isTextChannel(channel)) {
        throw new Error("指定されたチャンネルに投稿できません");
      }

      const member =
        interaction.member instanceof GuildMember
          ? interaction.member
          : await interaction.guild.members.fetch(interaction.user.id);

      const fields = this.collectSubmissionValues(interaction, schema);
      const embed = this.buildEmbed(member, introduceConfig, fields, pending?.image);

      const content = this.buildMessageContent(introduceConfig, member, fields);
      const files =
        pending?.image !== undefined
          ? [{ attachment: pending.image.url, name: pending.image.uploadName }]
          : undefined;

      const messagePayload: MessageCreateOptions = {
        content,
        embeds: [embed],
        allowedMentions: {
          users: [member.id],
          roles: introduceConfig.mention_role_ids ?? [],
          repliedUser: false,
        },
      };

      if (files) {
        messagePayload.files = files;
      }

      const message = await channel.send(messagePayload);

      await interaction.editReply({
        content: `自己紹介を <#${channelId}> に投稿しました。`,
      });

      await this.auditLogger.log({
        action: "introduce.post",
        status: "success",
        details: {
          userId: member.id,
          channelId,
          messageId: message.id,
          customImage: Boolean(pending?.image),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("自己紹介の投稿に失敗しました", { message, channelId });

      await this.safeErrorReply(interaction, `自己紹介の投稿に失敗しました: ${message}`);

      await this.auditLogger.log({
        action: "introduce.post",
        status: "failure",
        description: message,
        details: {
          userId: interaction.user.id,
          channelId,
          customImage: Boolean(pending?.image),
        },
      });
    }
  }

  private getIntroduceConfig(): IntroduceConfig | null {
    return this.config.introduce ?? null;
  }

  private getSchema(): IntroduceSchemaConfig | null {
    return this.config.introduce_schema ?? null;
  }

  private buildModalId(interactionId: string) {
    return `${MODAL_ID_PREFIX}${interactionId}`;
  }

  private buildModal(modalId: string) {
    const schema = this.getSchema();
    const introduceConfig = this.getIntroduceConfig();

    if (!schema || !introduceConfig) {
      return null;
    }

    const fields = schema.fields.filter((field) => field.enabled !== false);

    if (!fields.length) {
      return null;
    }

    const modalTitle = (introduceConfig.embed_title ?? "").trim() || "自己紹介";
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(modalTitle);

    const limitedFields = fields.slice(0, 5);

    for (const field of limitedFields) {
      const input = new TextInputBuilder()
        .setCustomId(field.field_id)
        .setLabel(field.label.slice(0, 45))
        .setRequired(field.required ?? true)
        .setStyle(
          field.max_length && field.max_length <= 100
            ? TextInputStyle.Short
            : TextInputStyle.Paragraph
        )
        .setMaxLength(field.max_length ?? 300);

      if (field.placeholder) {
        input.setPlaceholder(field.placeholder);
      }

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    return modal;
  }

  private collectSubmissionValues(
    interaction: ModalSubmitInteraction,
    schema: IntroduceSchemaConfig | null
  ) {
    const result: Record<string, string> = {};

    const fields = schema?.fields?.filter((field) => field.enabled !== false) ?? [];

    for (const field of fields.slice(0, 5)) {
      const value = interaction.fields.getTextInputValue(field.field_id) ?? "";
      result[field.field_id] = value.trim();
    }

    return result;
  }

  private buildEmbed(
    member: GuildMember,
    config: IntroduceConfig,
    values: Record<string, string>,
    customImage?: PendingIntroduceImage
  ) {
    const embedTitle = (config.embed_title ?? "").trim();
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTimestamp(new Date())
      .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
      .setFooter(
        config.footer_text
          ? { text: config.footer_text }
          : { text: member.guild.name }
      );

    if (embedTitle) {
      embed.setTitle(embedTitle);
    }

    const schema = this.getSchema();
    const fields = schema?.fields?.filter((field) => field.enabled !== false) ?? [];

    for (const field of fields.slice(0, 5)) {
      const value = values[field.field_id];

      if (!value) {
        continue;
      }

      embed.addFields({
        name: field.label.slice(0, 45),
        value: value.slice(0, 1024),
        inline: false,
      });
    }

    if (customImage) {
      embed.setImage(`attachment://${customImage.uploadName}`);
    } else {
      const avatarUrl = member.user.displayAvatarURL({ size: 256 });

      if (avatarUrl) {
        embed.setThumbnail(avatarUrl);
      }
    }

    return embed;
  }

  private async safeErrorReply(
    interaction: ModalSubmitInteraction,
    content: string
  ) {
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content });
        return;
      }

      if (interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.isRepliable()) {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      const message =
        replyError instanceof Error ? replyError.message : String(replyError);
      logger.warn("自己紹介エラー応答の送信に失敗しました", { message });
    }
  }

  private buildMessageContent(
    config: IntroduceConfig,
    member: GuildMember,
    values: Record<string, string>
  ) {
    const mentions = [member.toString()];

    for (const roleId of config.mention_role_ids ?? []) {
      mentions.push(`<@&${roleId}>`);
    }

    return mentions.join(" ");
  }

  private storePendingSubmission(
    customId: string,
    userId: string,
    imageAttachment?: Attachment
  ) {
    this.cleanupPendingSubmissions();

    const submission: PendingIntroduceSubmission = {
      userId,
      createdAt: Date.now(),
    };

    if (imageAttachment) {
      submission.image = this.normalizeImageAttachment(imageAttachment);
    }

    this.pendingSubmissions.set(customId, submission);
  }

  private consumePendingSubmission(customId: string) {
    const pending = this.pendingSubmissions.get(customId);

    if (pending) {
      this.pendingSubmissions.delete(customId);
    }

    return pending;
  }

  private cleanupPendingSubmissions() {
    const now = Date.now();

    for (const [key, value] of this.pendingSubmissions.entries()) {
      if (now - value.createdAt > PENDING_TTL_MS) {
        this.pendingSubmissions.delete(key);
      }
    }
  }

  private normalizeImageAttachment(attachment: Attachment): PendingIntroduceImage {
    const originalName = attachment.name ?? "introduce-image";
    const sanitizedBase = originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40) || "introduce-image";

    const extension = this.resolveImageExtension(
      attachment.name,
      attachment.contentType ?? ""
    );

    return {
      url: attachment.url,
      uploadName: `${sanitizedBase}${extension}`,
    };
  }

  private resolveImageExtension(name: string | null | undefined, contentType: string) {
    const lowerName = name?.toLowerCase() ?? "";
    const inferredFromName = [...VALID_IMAGE_EXTENSIONS].find((ext) =>
      lowerName.endsWith(ext)
    );

    if (inferredFromName) {
      return inferredFromName;
    }

    if (contentType.startsWith("image/")) {
      if (contentType.includes("png")) {
        return ".png";
      }
      if (contentType.includes("jpeg") || contentType.includes("jpg")) {
        return ".jpg";
      }
      if (contentType.includes("gif")) {
        return ".gif";
      }
      if (contentType.includes("webp")) {
        return ".webp";
      }
    }

    return ".png";
  }
}

export { INTRODUCE_MODAL_ID };
