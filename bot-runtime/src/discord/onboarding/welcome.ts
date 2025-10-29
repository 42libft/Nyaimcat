import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
} from "discord.js";

import type {
  BotConfig,
  WelcomeCardConfig,
  WelcomeConfig,
} from "../../config";
import { logger } from "../../utils/logger";
import { createTemplateValues, fillTemplate } from "./templateHelpers";
import type { TemplateValues } from "./types";
import { renderWelcomeCard } from "./welcomeCard";

export const WELCOME_ROLES_BUTTON_ID = "onboarding:roles_jump";

const DEFAULT_MESSAGE_TEMPLATE = "{{mention}}";
const DEFAULT_EMBED_TITLE = "ようこそ、{{username}} さん！";
const DEFAULT_EMBED_DESCRIPTION =
  "Nyaimlabへようこそ！\nあなたは **#{{member_index}}** 人目のメンバーです。";

type BuildWelcomeMessageOptions = {
  member: GuildMember;
  config: BotConfig;
  memberIndex: number;
};

const buildDefaultDescription = (values: TemplateValues) => {
  const lines = [
    "Nyaimlabへようこそ！",
    `あなたは **#${values["member_index"] ?? values["memberIndex"]}** 人目のメンバーです。`,
  ];

  if (values["roles_channel_mention"] ?? values.rolesChannelMention) {
    lines.push(
      `ロールの設定は ${
        values["roles_channel_mention"] ?? values.rolesChannelMention
      } から行えます。`
    );
  }

  if (values["guide_url"] ?? values.guideUrl) {
    lines.push(
      `サーバーガイドはこちら: ${values["guide_url"] ?? values.guideUrl}`
    );
  }

  return lines.join("\n");
};

const chunkButtons = (
  buttons: ButtonBuilder[]
): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (let index = 0; index < buttons.length; index += 5) {
    const slice = buttons.slice(index, index + 5);
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        ...slice
      )
    );
  }

  return rows;
};

const resolveCustomButtons = (
  welcomeConfig: WelcomeConfig | undefined,
  guildId: string
) => {
  const entries = welcomeConfig?.buttons ?? [];

  return entries
    .map((entry) => {
      const label = entry.label.trim();
      const value = entry.value.trim();
      if (!label || !value) {
        return null;
      }

      const button = new ButtonBuilder().setLabel(label);

      if (entry.target === "url") {
        try {
          // Throws if URL is invalid
          const url = new URL(value);
          button.setStyle(ButtonStyle.Link).setURL(url.toString());
          return button;
        } catch (error) {
          if (/^\d+$/.test(value)) {
            const channelUrl = `https://discord.com/channels/${guildId}/${value}`;
            button.setStyle(ButtonStyle.Link).setURL(channelUrl);
            logger.warn(
              "URL ボタンにチャンネルと思われる値が指定されたため、チャンネルへのリンクとして扱います",
              { label, value }
            );
            return button;
          }
          const message =
            error instanceof Error ? error.message : String(error);
          logger.warn("無効なURLボタンのためスキップします", {
            label,
            value,
            message,
          });
          return null;
        }
      }

      if (!/^\d+$/.test(value)) {
        logger.warn("チャンネルボタンの値が数値ではないためスキップします", {
          label,
          value,
        });
        return null;
      }

      const channelUrl = `https://discord.com/channels/${guildId}/${value}`;
      button.setStyle(ButtonStyle.Link).setURL(channelUrl);
      return button;
    })
    .filter((button): button is ButtonBuilder => Boolean(button));
};

const buildButtons = (
  config: BotConfig,
  member: GuildMember
): ActionRowBuilder<MessageActionRowComponentBuilder>[] | undefined => {
  const buttons: ButtonBuilder[] = [];

  buttons.push(...resolveCustomButtons(config.welcome, member.guild.id));

  if (config.onboarding.guideUrl) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(config.onboarding.guideLabel)
        .setURL(config.onboarding.guideUrl)
    );
  }

  const rolesChannelId =
    config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  if (rolesChannelId) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel(config.onboarding.rolesButtonLabel)
        .setCustomId(WELCOME_ROLES_BUTTON_ID)
    );
  }

  if (buttons.length === 0) {
    return undefined;
  }

  return chunkButtons(buttons);
};

const resolveMessageContent = (
  welcomeConfig: WelcomeConfig | undefined,
  values: TemplateValues
) => {
  const template =
    welcomeConfig?.message_template?.trim() || DEFAULT_MESSAGE_TEMPLATE;
  const resolved = fillTemplate(template, values).trim();
  return resolved.length > 0 ? resolved : undefined;
};

const resolveJoinTimezone = (
  config: BotConfig,
  welcomeConfig: WelcomeConfig | undefined
) => welcomeConfig?.join_timezone ?? config.onboarding.timezone ?? "Asia/Tokyo";

const buildEmbedMessage = (
  member: GuildMember,
  config: BotConfig,
  welcomeConfig: WelcomeConfig | undefined,
  templateValues: TemplateValues,
  content: string | undefined,
  memberIndex: number
): MessageCreateOptions => {
  const embed = new EmbedBuilder().setColor(0x5865f2);

  const titleTemplate =
    welcomeConfig?.title_template?.trim() || DEFAULT_EMBED_TITLE;
  const title = fillTemplate(titleTemplate, templateValues).trim();
  embed.setTitle(
    title || `ようこそ、${member.displayName ?? member.user.username} さん！`
  );

  const descriptionTemplate =
    welcomeConfig?.description_template?.trim() ||
    config.embeds.welcomeTemplate ||
    DEFAULT_EMBED_DESCRIPTION;
  const description = fillTemplate(descriptionTemplate, templateValues).trim();
  embed.setDescription(
    description || buildDefaultDescription(templateValues)
  );

  const timezone = resolveJoinTimezone(config, welcomeConfig);
  const joinFieldLabel = welcomeConfig?.join_field_label?.trim() || "加入日時";

  const formattedJoinDate = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(member.joinedAt ?? new Date());

  embed.addFields({
    name: `${joinFieldLabel} (${timezone})`,
    value: formattedJoinDate,
  });

  const footerText =
    welcomeConfig?.footer_text?.trim() || member.guild.name || "Nyaimlab";
  embed.setFooter({ text: footerText });

  const avatarUrl = member.user.displayAvatarURL({ size: 256 });
  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  const message: MessageCreateOptions = {
    content,
    embeds: [embed],
  };

  const components = buildButtons(config, member);
  if (components) {
    message.components = components;
  }

  return message;
};

const buildCardMessage = async (
  member: GuildMember,
  config: BotConfig,
  cardConfig: WelcomeCardConfig,
  templateValues: TemplateValues,
  content: string | undefined
): Promise<MessageCreateOptions> => {
  const avatarUrl =
    member.user.displayAvatarURL({ extension: "png", size: 512 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";

  const title = fillTemplate(cardConfig.title_template, templateValues).trim();
  const subtitle = fillTemplate(
    cardConfig.subtitle_template,
    templateValues
  ).trim();
  const body = cardConfig.body_template
    ? fillTemplate(cardConfig.body_template, templateValues).trim()
    : undefined;

  const buffer = await renderWelcomeCard({
    cardConfig,
    avatarUrl,
    text: {
      title: title || fillTemplate(DEFAULT_EMBED_TITLE, templateValues),
      subtitle:
        subtitle ||
        `Member #${
          templateValues["member_index"] ?? templateValues.memberIndex
        }`,
      body,
    },
  });

  const attachment = new AttachmentBuilder(buffer, {
    name: `welcome-card-${member.id}.png`,
  });

  const message: MessageCreateOptions = {
    content,
    files: [attachment],
  };

  const components = buildButtons(config, member);
  if (components) {
    message.components = components;
  }

  return message;
};

export const buildWelcomeMessage = async ({
  member,
  config,
  memberIndex,
}: BuildWelcomeMessageOptions): Promise<MessageCreateOptions> => {
  const welcomeConfig = config.welcome;

  const rolesChannelId =
    config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  const templateValues = createTemplateValues({
    username: member.user.username ?? member.displayName,
    displayName: member.displayName,
    mention: member.toString(),
    guildName: member.guild.name,
    memberIndex,
    rolesChannelId,
    guideUrl: config.onboarding.guideUrl,
    staffRoleIds: config.roleAssignments?.staffRoleIds,
  });

  const content = resolveMessageContent(welcomeConfig, templateValues);
  const mode = welcomeConfig?.mode ?? "embed";

  if (mode === "card" && welcomeConfig?.card) {
    try {
      return await buildCardMessage(
        member,
        config,
        welcomeConfig.card,
        templateValues,
        content
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      logger.error("歓迎カードの生成に失敗したため、Embed モードへフォールバックします", {
        error: message,
        memberId: member.id,
      });
    }
  }

  return buildEmbedMessage(
    member,
    config,
    welcomeConfig,
    templateValues,
    content,
    memberIndex
  );
};

export const createRolesJumpResponse = (
  config: BotConfig
) => {
  const rolesChannelId =
    config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  if (!rolesChannelId) {
    return {
      content: "ロールチャンネルが設定されていません。運営にお問い合わせください。",
      flags: MessageFlags.Ephemeral,
    } as const;
  }

  return {
    content: `ロールの設定はこちらをご確認ください → <#${rolesChannelId}>`,
    flags: MessageFlags.Ephemeral,
  } as const;
};

export const formatDmMessage = (
  member: GuildMember,
  config: BotConfig,
  memberIndex: number
) => {
  const rolesChannelId =
    config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  const templateValues = createTemplateValues({
    username: member.user.username ?? member.displayName,
    displayName: member.displayName,
    mention: member.toString(),
    guildName: member.guild.name,
    memberIndex,
    rolesChannelId,
    guideUrl: config.onboarding.guideUrl,
    staffRoleIds: config.roleAssignments?.staffRoleIds,
  });

  const template =
    config.onboarding.dm.template ??
    `ようこそ、{{username}} さん！\n\n` +
      `参加ありがとうございます。まずはサーバーガイドを確認し、必要なロールを取得してください。\n` +
      (templateValues.guideUrl
        ? `ガイド: {{guideUrl}}\n`
        : "") +
      (templateValues.rolesChannelMention
        ? `ロール: {{rolesChannelMention}}\n`
        : "") +
      (templateValues.staffRoleMentions
        ? `困ったときは {{staffRoleMentions}} までご相談ください。\n`
        : "") +
      `分からないことがあれば運営までお気軽にどうぞ！`;

  return fillTemplate(template, templateValues);
};

export const buildDmFallbackMessage = (
  member: GuildMember,
  config: BotConfig,
  memberIndex: number
) => {
  const rolesChannelId =
    config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  const templateValues = createTemplateValues({
    username: member.user.username ?? member.displayName,
    displayName: member.displayName,
    mention: member.toString(),
    guildName: member.guild.name,
    memberIndex,
    rolesChannelId,
    guideUrl: config.onboarding.guideUrl,
    staffRoleIds: config.roleAssignments?.staffRoleIds,
  });

  const defaultTemplate = templateValues.staffRoleMentions
    ? `{{username}} さんへのDMが送信できませんでした。{{staffRoleMentions}} の皆さん、代替案内をお願いします。`
    : `{{username}} さんへのDMが送信できませんでした。こちらのスレッドで案内を行ってください。`;

  const template = config.onboarding.dm.fallbackMessage ?? defaultTemplate;

  return fillTemplate(template, templateValues);
};
