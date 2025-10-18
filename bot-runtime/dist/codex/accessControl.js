"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCodexCommandAccess = exports.getCodexAccessConfig = exports.loadCodexAccessConfig = void 0;
const discord_js_1 = require("discord.js");
const settings_1 = require("./settings");
const splitIdList = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
};
const loadCodexAccessConfig = (env = process.env) => {
    const allowedUserIds = new Set(splitIdList(env.CODEX_COMMAND_ALLOWED_USER_IDS));
    const allowedRoleIds = new Set(splitIdList(env.CODEX_COMMAND_ALLOWED_ROLE_IDS));
    const requireManageGuild = (0, settings_1.parseBooleanSetting)(env.CODEX_COMMAND_REQUIRE_MANAGE_GUILD, true);
    return {
        allowedUserIds,
        allowedRoleIds,
        requireManageGuild,
    };
};
exports.loadCodexAccessConfig = loadCodexAccessConfig;
const codexAccessConfig = (0, exports.loadCodexAccessConfig)();
const getCodexAccessConfig = () => codexAccessConfig;
exports.getCodexAccessConfig = getCodexAccessConfig;
const extractRoleIds = (member) => {
    if (!member) {
        return [];
    }
    if (member instanceof discord_js_1.GuildMember) {
        return Array.from(member.roles.cache.keys());
    }
    const apiMember = member;
    if (Array.isArray(apiMember.roles)) {
        return apiMember.roles.map((role) => role.trim());
    }
    const roles = member.roles;
    if (Array.isArray(roles)) {
        return roles
            .map((role) => {
            if (typeof role === "string") {
                return role.trim();
            }
            return "";
        })
            .filter((role) => role.length > 0);
    }
    return [];
};
const checkCodexCommandAccess = (interaction) => {
    if (!interaction.inGuild()) {
        return {
            ok: false,
            reason: "guild_only",
            message: "このコマンドはサーバー内でのみ使用できます。",
        };
    }
    const config = (0, exports.getCodexAccessConfig)();
    const hasManageGuild = interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageGuild) ?? false;
    const hasAllowlist = config.allowedUserIds.size > 0 || config.allowedRoleIds.size > 0;
    const roleIds = hasAllowlist ? extractRoleIds(interaction.member) : [];
    if (hasAllowlist &&
        (config.allowedUserIds.has(interaction.user.id) ||
            roleIds.some((roleId) => config.allowedRoleIds.has(roleId)))) {
        return { ok: true };
    }
    if (config.requireManageGuild && !hasManageGuild) {
        return {
            ok: false,
            reason: "missing_manage_guild",
            message: "このコマンドを実行するには「サーバーを管理」権限が必要です。管理者に権限付与をご確認ください。",
        };
    }
    if (!hasAllowlist) {
        return { ok: true };
    }
    return {
        ok: false,
        reason: "allowlist",
        message: "このコマンドは Codex チーム向けに制限されています。許可されたロールまたはユーザーに追加されているか確認してください。",
    };
};
exports.checkCodexCommandAccess = checkCodexCommandAccess;
//# sourceMappingURL=accessControl.js.map