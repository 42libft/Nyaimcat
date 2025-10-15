import {
  ChannelType,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { logger } from "../../utils/logger";

const data = new SlashCommandBuilder()
  .setName("roles")
  .setDescription("ロール配布パネルを管理します");

data.setDMPermission(false);
data.addSubcommand((sub) =>
  sub
    .setName("post")
    .setDescription("ロールパネルを投稿または更新します")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("投稿先チャンネル。省略時は設定値を使用します")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
);

const ensureGuildMember = async (
  interaction: ChatInputCommandInteraction
): Promise<GuildMember> => {
  if (interaction.member instanceof GuildMember) {
    return interaction.member;
  }

  if (!interaction.guild) {
    throw new Error("ギルドコンテキストでのみ利用できます");
  }

  return interaction.guild.members.fetch(interaction.user.id);
};

const hasManagePermission = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const memberPermissions = interaction.memberPermissions;

  if (memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return true;
  }

  const staffRoleIds = context.config.roleAssignments?.staffRoleIds ?? [];

  if (!staffRoleIds.length) {
    return false;
  }

  try {
    const member = await ensureGuildMember(interaction);
    return staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("rolesコマンドの権限確認に失敗しました", { message });
    return false;
  }
};

const handlePost = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  if (!context.config.roles) {
    await interaction.reply({
      content: "ロールパネルの設定が存在しません。ダッシュボードから保存してください。",
      ephemeral: true,
    });
    return;
  }

  if (!(await hasManagePermission(interaction, context))) {
    await interaction.reply({
      content: "この操作を実行する権限が不足しています。",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel("channel");

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await context.rolesManager.publish({
      executorId: interaction.user.id,
      channelId: channel?.id ?? null,
    });

    const guildId = interaction.guildId ?? "";
    const link = `https://discord.com/channels/${guildId}/${result.message.channelId}/${result.message.id}`;
    const channelMention = `<#${result.message.channelId}>`;
    const updateHint = context.config.roles?.message_id
      ? ""
      : `\nメッセージID: ${result.message.id} を config.roles.message_id に設定すると更新が容易になります。`;

    await interaction.editReply({
      content: `${
        result.created ? "ロールパネルを新規投稿しました。" : "ロールパネルを更新しました。"
      }\n投稿先: ${channelMention}\nメッセージリンク: ${link}${updateHint}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await interaction.editReply({
      content: `投稿に失敗しました: ${message}`,
    });
  }
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  if (!interaction.guild) {
    await interaction.reply({
      content: "ギルド内でのみ使用してください。",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "post") {
    await handlePost(interaction, context);
    return;
  }

  await interaction.reply({
    content: "未対応のサブコマンドです。",
    ephemeral: true,
  });
};

export const rolesCommand: SlashCommandModule = {
  data,
  execute,
};
