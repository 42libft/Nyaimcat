import {
  GuildMember,
  PermissionFlagsBits,
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction,
} from "discord.js";

import { parseBooleanSetting } from "./settings";

const splitIdList = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export type CodexAccessConfig = {
  allowedUserIds: Set<string>;
  allowedRoleIds: Set<string>;
  requireManageGuild: boolean;
};

export const loadCodexAccessConfig = (
  env: NodeJS.ProcessEnv = process.env
): CodexAccessConfig => {
  const allowedUserIds = new Set(splitIdList(env.CODEX_COMMAND_ALLOWED_USER_IDS));
  const allowedRoleIds = new Set(splitIdList(env.CODEX_COMMAND_ALLOWED_ROLE_IDS));
  const requireManageGuild = parseBooleanSetting(
    env.CODEX_COMMAND_REQUIRE_MANAGE_GUILD,
    true
  );

  return {
    allowedUserIds,
    allowedRoleIds,
    requireManageGuild,
  };
};

const codexAccessConfig = loadCodexAccessConfig();

export const getCodexAccessConfig = () => codexAccessConfig;

const extractRoleIds = (
  member: ChatInputCommandInteraction["member"]
): string[] => {
  if (!member) {
    return [];
  }

  if (member instanceof GuildMember) {
    return Array.from(member.roles.cache.keys());
  }

  const apiMember = member as APIInteractionGuildMember;
  if (Array.isArray(apiMember.roles)) {
    return apiMember.roles.map((role) => role.trim());
  }

  const roles = (member as { roles?: unknown }).roles;
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

export type CodexAccessCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "guild_only" | "missing_manage_guild" | "allowlist";
      message: string;
    };

export const checkCodexCommandAccess = (
  interaction: ChatInputCommandInteraction
): CodexAccessCheckResult => {
  if (!interaction.inGuild()) {
    return {
      ok: false,
      reason: "guild_only",
      message: "このコマンドはサーバー内でのみ使用できます。",
    };
  }

  const config = getCodexAccessConfig();
  const hasManageGuild =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

  const hasAllowlist =
    config.allowedUserIds.size > 0 || config.allowedRoleIds.size > 0;

  const roleIds = hasAllowlist ? extractRoleIds(interaction.member) : [];

  if (
    hasAllowlist &&
    (config.allowedUserIds.has(interaction.user.id) ||
      roleIds.some((roleId) => config.allowedRoleIds.has(roleId)))
  ) {
    return { ok: true };
  }

  if (config.requireManageGuild && !hasManageGuild) {
    return {
      ok: false,
      reason: "missing_manage_guild",
      message:
        "このコマンドを実行するには「サーバーを管理」権限が必要です。管理者に権限付与をご確認ください。",
    };
  }

  if (!hasAllowlist) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "allowlist",
    message:
      "このコマンドは Codex チーム向けに制限されています。許可されたロールまたはユーザーに追加されているか確認してください。",
  };
};
