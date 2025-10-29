"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rolesCommand = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../utils/logger");
const data = new discord_js_1.SlashCommandBuilder()
    .setName("roles")
    .setDescription("ロール配布パネルを管理します");
data.setDMPermission(false);
data.addSubcommand((sub) => sub
    .setName("post")
    .setDescription("ロールパネルを投稿または更新します")
    .addChannelOption((option) => option
    .setName("channel")
    .setDescription("投稿先チャンネル。省略時は設定値を使用します")
    .addChannelTypes(discord_js_1.ChannelType.GuildText, discord_js_1.ChannelType.GuildAnnouncement)
    .setRequired(false)));
const ensureGuildMember = async (interaction) => {
    if (interaction.member instanceof discord_js_1.GuildMember) {
        return interaction.member;
    }
    if (!interaction.guild) {
        throw new Error("ギルドコンテキストでのみ利用できます");
    }
    return interaction.guild.members.fetch(interaction.user.id);
};
const hasManagePermission = async (interaction, context) => {
    const memberPermissions = interaction.memberPermissions;
    if (memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageRoles)) {
        return true;
    }
    const staffRoleIds = context.config.roleAssignments?.staffRoleIds ?? [];
    if (!staffRoleIds.length) {
        return false;
    }
    try {
        const member = await ensureGuildMember(interaction);
        return staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger_1.logger.warn("rolesコマンドの権限確認に失敗しました", { message });
        return false;
    }
};
const handlePost = async (interaction, context) => {
    if (!context.config.roles) {
        await interaction.reply({
            content: "ロールパネルの設定が存在しません。ダッシュボードから保存してください。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    if (!(await hasManagePermission(interaction, context))) {
        await interaction.editReply({
            content: "この操作を実行する権限が不足しています。",
        });
        return;
    }
    const channel = interaction.options.getChannel("channel");
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
            content: `${result.created ? "ロールパネルを新規投稿しました。" : "ロールパネルを更新しました。"}\n投稿先: ${channelMention}\nメッセージリンク: ${link}${updateHint}`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await interaction.editReply({
            content: `投稿に失敗しました: ${message}`,
        });
    }
};
const execute = async (interaction, context) => {
    if (!interaction.guild) {
        await interaction.reply({
            content: "ギルド内でのみ使用してください。",
            flags: discord_js_1.MessageFlags.Ephemeral,
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
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
};
exports.rolesCommand = {
    data,
    execute,
};
//# sourceMappingURL=roles.js.map