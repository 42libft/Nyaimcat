"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingManager = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../utils/logger");
const welcome_1 = require("./welcome");
const templateHelpers_1 = require("./templateHelpers");
const DM_DISABLED_CODES = new Set([50007]);
class OnboardingManager {
    constructor(client, auditLogger, config) {
        this.client = client;
        this.auditLogger = auditLogger;
        this.config = config;
    }
    updateConfig(config) {
        this.config = config;
    }
    async handleMemberJoin(member) {
        if (!this.config.features.welcomeMessage) {
            logger_1.logger.debug("welcomeMessage機能が無効化されているため、オンボーディング処理をスキップします");
            return;
        }
        const welcomeChannelId = this.config.channels.welcome;
        if (!welcomeChannelId) {
            logger_1.logger.warn("welcomeチャンネルが設定されていないため、歓迎メッセージを送信できません", {
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
            logger_1.logger.error("welcomeチャンネルがテキストチャンネルではありません", {
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
        const messageOptions = await (0, welcome_1.buildWelcomeMessage)({
            member,
            config: this.config,
            memberIndex,
        });
        let sentMessage;
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("歓迎メッセージの送信に失敗しました", {
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
            logger_1.logger.debug("オンボーディングDM機能は無効化されています", {
                memberId: member.id,
            });
            return;
        }
        await this.sendDirectMessage(member, memberIndex, sentMessage);
    }
    async handleInteraction(interaction) {
        if (interaction.customId !== welcome_1.WELCOME_ROLES_BUTTON_ID) {
            return;
        }
        const response = (0, welcome_1.createRolesJumpResponse)(this.config);
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("ロール案内ボタンの応答に失敗しました", {
                message,
                userId: interaction.user.id,
            });
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({
                    content: "内部エラーにより案内を表示できませんでした。",
                    flags: discord_js_1.MessageFlags.Ephemeral,
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
    async computeMemberIndex(member) {
        const mode = this.config.welcome?.member_index_mode ??
            (this.config.features.countBotsInMemberCount
                ? "include_bots"
                : "exclude_bots");
        if (mode === "include_bots") {
            return member.guild.memberCount;
        }
        try {
            const members = await member.guild.members.fetch();
            const humans = members.filter((m) => !m.user.bot);
            return humans.size;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn("メンバー数の取得に失敗したため、既知のカウントを利用します", {
                message,
                guildId: member.guild.id,
            });
            return member.guild.memberCount;
        }
    }
    async sendDirectMessage(member, memberIndex, welcomeMessage) {
        const content = (0, welcome_1.formatDmMessage)(member, this.config, memberIndex);
        try {
            await member.send({ content });
            await this.auditLogger.log({
                action: "onboarding.dm",
                status: "success",
                details: {
                    memberId: member.id,
                },
            });
        }
        catch (error) {
            const isDiscordError = typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "number";
            const code = isDiscordError
                ? Number(error.code)
                : undefined;
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn("オンボーディングDMの送信に失敗しました", {
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
    async createFallbackThread(member, memberIndex, message) {
        const fallbackMessage = (0, welcome_1.buildDmFallbackMessage)(member, this.config, memberIndex);
        try {
            const thread = await message.startThread({
                name: this.buildThreadName(member, memberIndex),
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
        }
        catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("DM失敗時のフォールバックスレッド作成に失敗しました", {
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
    buildThreadName(member, memberIndex) {
        const template = this.config.welcome?.thread_name_template;
        if (template) {
            const rolesChannelId = this.config.onboarding.rolesChannelId ?? this.config.channels.rolesPanel;
            const values = (0, templateHelpers_1.createTemplateValues)({
                username: member.user.username ?? member.displayName,
                displayName: member.displayName,
                mention: member.toString(),
                guildName: member.guild.name,
                memberIndex,
                rolesChannelId,
                guideUrl: this.config.onboarding.guideUrl,
                staffRoleIds: this.config.roleAssignments?.staffRoleIds,
            });
            const resolved = (0, templateHelpers_1.fillTemplate)(template, values).trim();
            if (resolved) {
                return resolved.length > 90 ? `${resolved.slice(0, 87)}...` : resolved;
            }
        }
        const base = `${member.displayName}-onboarding`;
        return base.length > 90 ? `${base.slice(0, 87)}...` : base;
    }
    isGuildTextChannel(channel) {
        if (!channel) {
            return false;
        }
        if (!channel.isTextBased()) {
            return false;
        }
        if ("guild" in channel &&
            channel.guild &&
            channel.type !== discord_js_1.ChannelType.GuildVoice) {
            return true;
        }
        return false;
    }
}
exports.OnboardingManager = OnboardingManager;
//# sourceMappingURL=manager.js.map