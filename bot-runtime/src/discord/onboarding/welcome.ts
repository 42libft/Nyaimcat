import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
} from "discord.js";

import type { BotConfig } from "../../config";

export const WELCOME_ROLES_BUTTON_ID = "onboarding:roles_jump";

type TemplateValues = Record<string, string>;

const fillTemplate = (template: string, values: TemplateValues) =>
  template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const replacement = values[key];
    return typeof replacement === "string" ? replacement : match;
  });

const buildStaffRoleMentions = (config: BotConfig) => {
  const staffRoles = config.roles?.staffRoleIds ?? [];

  if (!staffRoles.length) {
    return "";
  }

  return staffRoles.map((roleId) => `<@&${roleId}>`).join(" ");
};

const buildDefaultDescription = (values: TemplateValues) => {
  const lines = [
    `Nyaimlabへようこそ！`,
    `あなたは **#${values.memberIndex}** 人目のメンバーです。`,
  ];

  if (values.rolesChannelMention) {
    lines.push(
      `ロールの設定は ${values.rolesChannelMention} から行えます。`
    );
  }

  if (values.guideUrl) {
    lines.push(`サーバーガイドはこちら: ${values.guideUrl}`);
  }

  return lines.join("\n");
};

type BuildWelcomeMessageOptions = {
  member: GuildMember;
  config: BotConfig;
  memberIndex: number;
};

const buildButtons = (
  config: BotConfig
): ActionRowBuilder<MessageActionRowComponentBuilder>[] | undefined => {
  const buttons: ButtonBuilder[] = [];

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

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...buttons
    ),
  ];
};

export const buildWelcomeMessage = ({
  member,
  config,
  memberIndex,
}: BuildWelcomeMessageOptions): MessageCreateOptions => {
  const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;
  const timezone = config.onboarding.timezone ?? "Asia/Tokyo";

  const templateValues: TemplateValues = {
    username: member.displayName,
    mention: member.toString(),
    guildName: member.guild.name,
    memberIndex: memberIndex.toString(),
    rolesChannelMention: rolesChannelId ? `<#${rolesChannelId}>` : "",
    guideUrl: config.onboarding.guideUrl ?? "",
    staffRoleMentions: buildStaffRoleMentions(config),
  };

  const descriptionTemplate = config.embeds.welcomeTemplate;
  const description = descriptionTemplate
    ? fillTemplate(descriptionTemplate, templateValues)
    : buildDefaultDescription(templateValues);

  const formattedJoinDate = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(member.joinedAt ?? new Date());

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`ようこそ、${member.displayName} さん！`)
    .setDescription(description)
    .addFields({
      name: `加入日時 (${timezone})`,
      value: formattedJoinDate,
    })
    .setFooter({ text: member.guild.name });

  const avatarUrl = member.user.displayAvatarURL({ size: 256 });

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  const components = buildButtons(config);

  const message: MessageCreateOptions = {
    content: member.toString(),
    embeds: [embed],
  };

  if (components) {
    message.components = components;
  }

  return message;
};

export const createRolesJumpResponse = (
  config: BotConfig
) => {
  const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  if (!rolesChannelId) {
    return {
      content: "ロールチャンネルが設定されていません。運営にお問い合わせください。",
      ephemeral: true,
    } as const;
  }

  return {
    content: `ロールの設定はこちらをご確認ください → <#${rolesChannelId}>`,
    ephemeral: true,
  } as const;
};

export const formatDmMessage = (
  member: GuildMember,
  config: BotConfig,
  memberIndex: number
) => {
  const rolesChannelId = config.onboarding.rolesChannelId ?? config.channels.rolesPanel;

  const templateValues: TemplateValues = {
    username: member.displayName,
    mention: member.toString(),
    guildName: member.guild.name,
    memberIndex: memberIndex.toString(),
    rolesChannelMention: rolesChannelId ? `<#${rolesChannelId}>` : "",
    guideUrl: config.onboarding.guideUrl ?? "",
    staffRoleMentions: buildStaffRoleMentions(config),
  };

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
  const placeholders: TemplateValues = {
    username: member.displayName,
    mention: member.toString(),
    guildName: member.guild.name,
    memberIndex: memberIndex.toString(),
    rolesChannelMention: config.onboarding.rolesChannelId
      ? `<#${config.onboarding.rolesChannelId}>`
      : "",
    guideUrl: config.onboarding.guideUrl ?? "",
    staffRoleMentions: buildStaffRoleMentions(config),
  };

  const defaultTemplate = placeholders.staffRoleMentions
    ? `{{username}} さんへのDMが送信できませんでした。{{staffRoleMentions}} の皆さん、代替案内をお願いします。`
    : `{{username}} さんへのDMが送信できませんでした。こちらのスレッドで案内を行ってください。`;

  const template = config.onboarding.dm.fallbackMessage ?? defaultTemplate;

  return fillTemplate(template, placeholders);
};
