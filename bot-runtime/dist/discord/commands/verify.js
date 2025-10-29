"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCommand = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../utils/logger");
const data = new discord_js_1.SlashCommandBuilder()
    .setName("verify")
    .setDescription("認証パネルや動作を管理します");
data.setDMPermission(false);
data.addSubcommand((sub) => sub
    .setName("post")
    .setDescription("Verifyパネルを投稿または更新します")
    .addChannelOption((option) => option
    .setName("channel")
    .setDescription("投稿先のチャンネル。省略時は設定値を使用します")
    .addChannelTypes(discord_js_1.ChannelType.GuildText, discord_js_1.ChannelType.GuildAnnouncement)
    .setRequired(false)));
const ensureGuildMember = async (interaction) => {
    if (interaction.member && interaction.member instanceof discord_js_1.GuildMember) {
        return interaction.member;
    }
    if (!interaction.guild) {
        throw new Error("ギルドコンテキストでのみ利用できます");
    }
    return interaction.guild.members.fetch(interaction.user.id);
};
const hasManagePermission = async (interaction, context) => {
    const memberPermissions = interaction.memberPermissions;
    if (memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageGuild)) {
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
        logger_1.logger.warn("verifyコマンドの権限確認に失敗しました", { message });
        return false;
    }
};
const handlePost = async (interaction, context) => {
    if (!context.config.verify) {
        await interaction.reply({
            content: "verify設定が存在しません。ダッシュボードから保存してください。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!(await hasManagePermission(interaction, context))) {
        await interaction.reply({
            content: "この操作を実行する権限が不足しています。",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const channel = interaction.options.getChannel("channel");
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    try {
        const result = await context.verifyManager.publish({
            executorId: interaction.user.id,
            channelId: channel?.id ?? null,
        });
        const guildId = interaction.guildId ?? "";
        const link = `https://discord.com/channels/${guildId}/${result.message.channelId}/${result.message.id}`;
        const channelMention = `<#${result.message.channelId}>`;
        const updateHint = context.config.verify?.message_id
            ? ""
            : `\nメッセージID: ${result.message.id} を config.verify.message_id に設定すると更新が容易になります。`;
        await interaction.editReply({
            content: `${result.created ? "認証メッセージを新規投稿しました。" : "認証メッセージを更新しました。"}\n投稿先: ${channelMention}\nメッセージリンク: ${link}${updateHint}`,
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
exports.verifyCommand = {
    data,
    execute,
};
//# sourceMappingURL=verify.js.map