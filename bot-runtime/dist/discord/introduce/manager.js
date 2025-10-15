"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTRODUCE_MODAL_ID = exports.IntroduceManager = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../utils/logger");
const INTRODUCE_MODAL_ID = "introduce:submit";
exports.INTRODUCE_MODAL_ID = INTRODUCE_MODAL_ID;
const isTextChannel = (channel) => {
    if (!channel) {
        return false;
    }
    return (typeof channel === "object" &&
        channel !== null &&
        "isTextBased" in channel &&
        typeof channel.isTextBased === "function" &&
        channel.isTextBased());
};
class IntroduceManager {
    constructor(auditLogger, config) {
        this.auditLogger = auditLogger;
        this.config = config;
    }
    updateConfig(config) {
        this.config = config;
    }
    async openModal(interaction) {
        const introduceConfig = this.getIntroduceConfig();
        if (!introduceConfig) {
            await interaction.reply({
                content: "自己紹介の設定が存在しません。運営にお問い合わせください。",
                ephemeral: true,
            });
            return;
        }
        const modal = this.buildModal();
        if (!modal) {
            await interaction.reply({
                content: "自己紹介フォームが未設定のため、投稿できません。",
                ephemeral: true,
            });
            return;
        }
        await interaction.showModal(modal);
    }
    async handleModalSubmit(interaction) {
        if (interaction.customId !== INTRODUCE_MODAL_ID) {
            return;
        }
        const introduceConfig = this.getIntroduceConfig();
        const schema = this.getSchema();
        if (!introduceConfig || !interaction.guild) {
            await interaction.reply({
                content: "現在自己紹介は利用できません。",
                ephemeral: true,
            });
            return;
        }
        const channelId = introduceConfig.channel_id ?? this.config.channels.introduce ?? null;
        if (!channelId) {
            await interaction.reply({
                content: "投稿先チャンネルが設定されていません。運営にお問い合わせください。",
                ephemeral: true,
            });
            return;
        }
        try {
            const channel = await interaction.client.channels.fetch(channelId);
            if (!isTextChannel(channel)) {
                throw new Error("指定されたチャンネルに投稿できません");
            }
            const member = interaction.member instanceof discord_js_1.GuildMember
                ? interaction.member
                : await interaction.guild.members.fetch(interaction.user.id);
            const fields = this.collectSubmissionValues(interaction, schema);
            const embed = this.buildEmbed(member, introduceConfig, fields);
            const content = this.buildMessageContent(introduceConfig, member, fields);
            const message = await channel.send({
                content,
                embeds: [embed],
                allowedMentions: { parse: ["users", "roles"], users: [member.id] },
            });
            await interaction.reply({
                content: `自己紹介を <#${channelId}> に投稿しました。`,
                ephemeral: true,
            });
            await this.auditLogger.log({
                action: "introduce.post",
                status: "success",
                details: {
                    userId: member.id,
                    channelId,
                    messageId: message.id,
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("自己紹介の投稿に失敗しました", { message });
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: `自己紹介の投稿に失敗しました: ${message}`,
                    ephemeral: true,
                });
            }
            else {
                await interaction.reply({
                    content: `自己紹介の投稿に失敗しました: ${message}`,
                    ephemeral: true,
                });
            }
            await this.auditLogger.log({
                action: "introduce.post",
                status: "failure",
                description: message,
                details: {
                    userId: interaction.user.id,
                    channelId,
                },
            });
        }
    }
    getIntroduceConfig() {
        return this.config.introduce ?? null;
    }
    getSchema() {
        return this.config.introduce_schema ?? null;
    }
    buildModal() {
        const schema = this.getSchema();
        const introduceConfig = this.getIntroduceConfig();
        if (!schema || !introduceConfig) {
            return null;
        }
        const fields = schema.fields.filter((field) => field.enabled !== false);
        if (!fields.length) {
            return null;
        }
        const modal = new discord_js_1.ModalBuilder()
            .setCustomId(INTRODUCE_MODAL_ID)
            .setTitle(introduceConfig.embed_title ?? "自己紹介");
        const limitedFields = fields.slice(0, 5);
        for (const field of limitedFields) {
            const input = new discord_js_1.TextInputBuilder()
                .setCustomId(field.field_id)
                .setLabel(field.label.slice(0, 45))
                .setRequired(field.required ?? true)
                .setStyle(field.max_length && field.max_length <= 100
                ? discord_js_1.TextInputStyle.Short
                : discord_js_1.TextInputStyle.Paragraph)
                .setMaxLength(field.max_length ?? 300);
            if (field.placeholder) {
                input.setPlaceholder(field.placeholder);
            }
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(input));
        }
        return modal;
    }
    collectSubmissionValues(interaction, schema) {
        const result = {};
        const fields = schema?.fields?.filter((field) => field.enabled !== false) ?? [];
        for (const field of fields.slice(0, 5)) {
            const value = interaction.fields.getTextInputValue(field.field_id) ?? "";
            result[field.field_id] = value.trim();
        }
        return result;
    }
    buildEmbed(member, config, values) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(config.embed_title ?? "自己紹介")
            .setColor(0x5865f2)
            .setTimestamp(new Date())
            .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
            .setFooter(config.footer_text
            ? { text: config.footer_text }
            : { text: member.guild.name });
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
        const avatarUrl = member.user.displayAvatarURL({ size: 256 });
        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }
        return embed;
    }
    buildMessageContent(config, member, values) {
        const mentions = [member.toString()];
        for (const roleId of config.mention_role_ids ?? []) {
            mentions.push(`<@&${roleId}>`);
        }
        return mentions.join(" ");
    }
}
exports.IntroduceManager = IntroduceManager;
//# sourceMappingURL=manager.js.map