"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDiscordActionsFromEnv = exports.loadDiscordActionsConfigFromEnv = exports.DiscordActions = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../utils/logger");
const WILDCARD_CHANNEL = "*";
const sanitizeChannelIds = (ids) => {
    const unique = Array.from(new Set(ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0)));
    return unique;
};
const hasMessageBody = (payload) => {
    if (payload.content && payload.content.trim().length > 0) {
        return true;
    }
    if (payload.embeds && payload.embeds.length > 0) {
        return true;
    }
    if (payload.components && payload.components.length > 0) {
        return true;
    }
    if (payload.files && payload.files.length > 0) {
        return true;
    }
    return false;
};
class DiscordActions {
    constructor(config) {
        if (!config.token || config.token.length === 0) {
            throw new Error("DiscordActions を初期化するには token が必要です。");
        }
        const channelIds = sanitizeChannelIds(config.allowedChannelIds);
        if (channelIds.length === 0) {
            throw new Error("DiscordActions には最低 1 件の許可チャンネル ID が必要です。");
        }
        this.rest = new discord_js_1.REST({ version: config.restVersion ?? "10" }).setToken(config.token);
        this.allowAllChannels = channelIds.includes(WILDCARD_CHANNEL);
        this.allowedChannelIds = new Set(this.allowAllChannels ? channelIds.filter((id) => id !== WILDCARD_CHANNEL) : channelIds);
        this.defaultAllowedMentions =
            config.defaultAllowedMentions ?? { parse: [] };
    }
    getAllowedChannels() {
        if (this.allowAllChannels) {
            return [WILDCARD_CHANNEL, ...this.allowedChannelIds];
        }
        return Array.from(this.allowedChannelIds);
    }
    isChannelAllowed(channelId) {
        return this.allowAllChannels || this.allowedChannelIds.has(channelId);
    }
    ensureChannelAllowed(channelId) {
        if (!this.isChannelAllowed(channelId)) {
            throw new Error(`チャンネル ${channelId} は Codex 実行許可リストに登録されていません。`);
        }
    }
    async publishMessage(channelId, payload) {
        this.ensureChannelAllowed(channelId);
        if (!hasMessageBody(payload)) {
            throw new Error("content / embeds / components / files のいずれかが必要です。");
        }
        const body = {
            content: payload.content,
            embeds: payload.embeds,
            allowed_mentions: payload.allowedMentions ?? this.defaultAllowedMentions,
            components: payload.components,
            flags: payload.flags,
        };
        logger_1.logger.info("Discord への投稿を実行します", {
            channelId,
            hasContent: Boolean(body.content && body.content.length > 0),
            embedCount: body.embeds?.length ?? 0,
            componentCount: body.components?.length ?? 0,
            fileCount: payload.files?.length ?? 0,
        });
        try {
            const result = (await this.rest.post(discord_js_1.Routes.channelMessages(channelId), {
                body,
                files: payload.files,
            }));
            logger_1.logger.info("Discord への投稿が完了しました", {
                channelId,
                messageId: result.id,
            });
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Discord への投稿に失敗しました", {
                channelId,
                error: message,
            });
            throw error;
        }
    }
}
exports.DiscordActions = DiscordActions;
const splitEnvList = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
};
const loadDiscordActionsConfigFromEnv = (env = process.env) => {
    const token = env.CODEX_DISCORD_TOKEN ?? env.DISCORD_TOKEN ?? "";
    const allowedChannelIds = splitEnvList(env.CODEX_DISCORD_ALLOWED_CHANNELS);
    const allowedUsers = splitEnvList(env.CODEX_DISCORD_ALLOWED_USERS);
    const allowedRoles = splitEnvList(env.CODEX_DISCORD_ALLOWED_ROLES);
    const defaultAllowedMentions = allowedUsers.length > 0 || allowedRoles.length > 0
        ? { parse: [], users: allowedUsers, roles: allowedRoles }
        : undefined;
    const restVersion = env.CODEX_DISCORD_REST_VERSION;
    const config = {
        token,
        allowedChannelIds,
    };
    if (defaultAllowedMentions) {
        config.defaultAllowedMentions = defaultAllowedMentions;
    }
    if (restVersion) {
        config.restVersion = restVersion;
    }
    return config;
};
exports.loadDiscordActionsConfigFromEnv = loadDiscordActionsConfigFromEnv;
const createDiscordActionsFromEnv = (env = process.env) => {
    const config = (0, exports.loadDiscordActionsConfigFromEnv)(env);
    return new DiscordActions(config);
};
exports.createDiscordActionsFromEnv = createDiscordActionsFromEnv;
//# sourceMappingURL=discordActions.js.map