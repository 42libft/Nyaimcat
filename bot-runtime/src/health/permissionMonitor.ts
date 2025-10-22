import {
  ChannelType,
  PermissionsBitField,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
} from "discord.js";

import type { BotConfig } from "../config";
import { healthRegistry } from "./registry";
import { logger } from "../utils/logger";

const GUILD_ACCESS_ISSUE_ID = "discord.guild.access";
const MANAGE_ROLES_ISSUE_ID = "discord.permissions.manageRoles";
const CHANNEL_ISSUE_PREFIX = "discord.permissions.channel";
const ROLE_HIERARCHY_ISSUE_PREFIX = "discord.permissions.roleHierarchy";

const guildFetchFailureReasons = new Map<string, string>();

type PermissionRequirement = {
  flag: bigint;
  label: string;
};

type ChannelRequirement = {
  labels: Set<string>;
  permissions: Set<PermissionRequirement>;
};

const PERMISSIONS = {
  ViewChannel: {
    flag: PermissionsBitField.Flags.ViewChannel,
    label: "ViewChannel",
  },
  SendMessages: {
    flag: PermissionsBitField.Flags.SendMessages,
    label: "SendMessages",
  },
  EmbedLinks: {
    flag: PermissionsBitField.Flags.EmbedLinks,
    label: "EmbedLinks",
  },
  AddReactions: {
    flag: PermissionsBitField.Flags.AddReactions,
    label: "AddReactions",
  },
  ReadMessageHistory: {
    flag: PermissionsBitField.Flags.ReadMessageHistory,
    label: "ReadMessageHistory",
  },
} as const;

const BASE_TEXT_PERMISSIONS: PermissionRequirement[] = [
  PERMISSIONS.ViewChannel,
  PERMISSIONS.SendMessages,
  PERMISSIONS.EmbedLinks,
];

const HEARTBEAT_INTERVAL_MS = Number(
  process.env.HEALTH_PERMISSION_CHECK_INTERVAL_MS ?? "300000"
);

const normalizeInterval = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : 300_000;

const resolveGuild = async (
  client: Client,
  guildId: string
): Promise<Guild | null> => {
  try {
    const cached = client.guilds.cache.get(guildId);
    if (cached) {
      guildFetchFailureReasons.delete(guildId);
      return cached;
    }
    const fetched = await client.guilds.fetch(guildId);
    guildFetchFailureReasons.delete(guildId);
    return fetched;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const previous = guildFetchFailureReasons.get(guildId);
    if (previous !== message) {
      logger.warn("ギルド情報の取得に失敗しました", {
        guildId,
        error: message,
      });
    }
    guildFetchFailureReasons.set(guildId, message);
    return null;
  }
};

const resolveSelfMember = async (
  guild: Guild
): Promise<GuildMember | null> => {
  if (guild.members.me) {
    return guild.members.me;
  }

  const user = guild.client.user;
  if (!user) {
    return null;
  }

  try {
    const fetched = await guild.members.fetch(user.id);
    return fetched;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Bot メンバー情報の取得に失敗しました", {
      guildId: guild.id,
      error: message,
    });
    return null;
  }
};

const buildChannelRequirements = (config: BotConfig) => {
  const requirements = new Map<string, ChannelRequirement>();

  const register = (
    channelId: string | null | undefined,
    label: string,
    perms: PermissionRequirement[]
  ) => {
    if (!channelId || channelId.trim().length === 0) {
      return;
    }

    const key = channelId.trim();
    const existing = requirements.get(key);
    if (existing) {
      existing.labels.add(label);
      for (const perm of perms) {
        existing.permissions.add(perm);
      }
      return;
    }

    requirements.set(key, {
      labels: new Set([label]),
      permissions: new Set(perms),
    });
  };

  const channelEntries: Array<[string | null | undefined, string]> = [
    [config.channels.auditLog ?? null, "監査ログチャンネル"],
    [config.channels.welcome ?? null, "Welcome チャンネル"],
    [config.channels.verify ?? null, "Verify チャンネル"],
    [config.channels.introduce ?? null, "自己紹介チャンネル"],
    [config.channels.rolesPanel ?? null, "ロールパネルチャンネル"],
    [config.channels.guideline ?? null, "ガイドラインチャンネル"],
    [config.onboarding?.rolesChannelId ?? null, "オンボーディング: ロール案内"],
    [config.verify?.channel_id ?? null, "`verify` 設定チャンネル"],
    [config.roles?.channel_id ?? null, "`roles` 設定チャンネル"],
    [config.introduce?.channel_id ?? null, "`introduce` 投稿チャンネル"],
  ];

  for (const [channelId, label] of channelEntries) {
    register(channelId, label, BASE_TEXT_PERMISSIONS);
  }

  if (config.verify?.mode === "reaction") {
    const channelId =
      config.verify?.channel_id ?? config.channels.verify ?? null;
    register(channelId, "`verify` リアクション運用", [
      PERMISSIONS.AddReactions,
      PERMISSIONS.ReadMessageHistory,
    ]);
  }

  return requirements;
};

const collectRoleIds = (config: BotConfig) => {
  const ids = new Set<string>();

  if (config.verify?.role_id) {
    ids.add(config.verify.role_id);
  }

  if (Array.isArray(config.roles?.roles)) {
    for (const role of config.roles.roles) {
      if (role.role_id) {
        ids.add(role.role_id);
      }
    }
  }

  if (Array.isArray(config.roleAssignments?.autoAssign)) {
    for (const item of config.roleAssignments.autoAssign) {
      if (item.id) {
        ids.add(item.id);
      }
    }
  }

  if (Array.isArray(config.roleAssignments?.reactions)) {
    for (const item of config.roleAssignments.reactions) {
      if (item.id) {
        ids.add(item.id);
      }
    }
  }

  if (Array.isArray(config.introduce?.mention_role_ids)) {
    for (const id of config.introduce.mention_role_ids) {
      if (id) {
        ids.add(id);
      }
    }
  }

  if (Array.isArray(config.roleAssignments?.staffRoleIds)) {
    for (const id of config.roleAssignments.staffRoleIds) {
      if (id) {
        ids.add(id);
      }
    }
  }

  return ids;
};

const buildChannelIssueId = (channelId: string) =>
  `${CHANNEL_ISSUE_PREFIX}.${channelId}`;

const buildRoleIssueId = (roleId: string) =>
  `${ROLE_HIERARCHY_ISSUE_PREFIX}.${roleId}`;

export class PermissionMonitor {
  private config: BotConfig;
  private intervalHandle: NodeJS.Timeout | null = null;
  private checking = false;
  private started = false;

  constructor(private readonly client: Client, config: BotConfig) {
    this.config = config;
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    void this.evaluate();

    const interval = normalizeInterval(HEARTBEAT_INTERVAL_MS);
    this.intervalHandle = setInterval(() => {
      void this.evaluate();
    }, interval);

    if (typeof this.intervalHandle.unref === "function") {
      this.intervalHandle.unref();
    }
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.started = false;
  }

  updateConfig(config: BotConfig) {
    this.config = config;
    void this.evaluate();
  }

  private async evaluate() {
    if (this.checking) {
      return;
    }

    if (!this.client.isReady() || !this.client.user) {
      return;
    }

    const guildId = this.config.guild?.id;
    if (!guildId) {
      return;
    }

    this.checking = true;

    try {
      const guild = await resolveGuild(this.client, guildId);
      if (!guild) {
        const lastFailure = guildFetchFailureReasons.get(guildId);
        const reason = lastFailure
          ? /Unknown Guild/i.test(lastFailure)
            ?
              'Discord API から "Unknown Guild" が返されました。Bot が対象ギルドに参加しているか、`config.guild.id` が正しいか確認してください。'
            : `ギルド情報の取得に失敗しました: ${lastFailure}`
          : "ギルド情報の取得に失敗しました。";

        this.reportGuildAccessIssue(guildId, reason);
        return;
      }

      const me = await resolveSelfMember(guild);
      if (!me) {
        this.reportGuildAccessIssue(
          guildId,
          "Bot メンバー情報を取得できませんでした。"
        );
        return;
      }

      this.clearGuildAccessIssue();

      this.evaluateGuildPermissions(me);
      await this.evaluateChannels(guild, me);
      await this.evaluateRoleHierarchy(guild, me);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("権限ヘルスチェックで予期しないエラーが発生しました", { message });
    } finally {
      this.checking = false;
    }
  }

  private reportGuildAccessIssue(guildId: string, reason: string) {
    healthRegistry.report({
      id: GUILD_ACCESS_ISSUE_ID,
      level: "error",
      message:
        "Bot が対象ギルドの情報を取得できません。トークンや参加状況を確認してください。",
      details: {
        guildId,
        reason,
      },
    });
  }

  private clearGuildAccessIssue() {
    healthRegistry.resolve(GUILD_ACCESS_ISSUE_ID);
  }

  private evaluateGuildPermissions(me: GuildMember) {
    if (
      !me.permissions.has(PermissionsBitField.Flags.ManageRoles, true)
    ) {
      healthRegistry.report({
        id: MANAGE_ROLES_ISSUE_ID,
        level: "error",
        message:
          "Bot に `ManageRoles` 権限がありません。ロール付与系機能が動作しません。",
        details: {
          userId: me.id,
        },
      });
      return;
    }

    healthRegistry.resolve(MANAGE_ROLES_ISSUE_ID);
  }

  private async evaluateChannels(guild: Guild, me: GuildMember) {
    const requirements = buildChannelRequirements(this.config);

    if (requirements.size === 0) {
      return;
    }

    for (const [channelId, requirement] of requirements.entries()) {
      const issueId = buildChannelIssueId(channelId);

      let channel: GuildBasedChannel | null = null;
      try {
        channel = await guild.channels.fetch(channelId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        healthRegistry.report({
          id: issueId,
          level: "error",
          message:
            "Bot が必要なチャンネルを取得できません。存在や権限を確認してください。",
          details: {
            channelId,
            labels: Array.from(requirement.labels),
            error: message,
          },
        });
        continue;
      }

      if (!channel) {
        healthRegistry.report({
          id: issueId,
          level: "error",
          message:
            "Bot が必要なチャンネルを取得できません。存在や権限を確認してください。",
          details: {
            channelId,
            labels: Array.from(requirement.labels),
            error: "fetch returned null",
          },
        });
        continue;
      }

      if (!channel.isTextBased() || channel.type === ChannelType.DM) {
        healthRegistry.report({
          id: issueId,
          level: "error",
          message:
            "設定されたチャンネルがテキストチャンネルではありません。設定を見直してください。",
          details: {
            channelId,
            channelType: channel.type,
            labels: Array.from(requirement.labels),
          },
        });
        continue;
      }

      const permissions = channel.permissionsFor(me);
      if (!permissions) {
        healthRegistry.report({
          id: issueId,
          level: "error",
          message:
            "Bot がチャンネルの権限情報を取得できません。ギルド権限を確認してください。",
          details: {
            channelId,
            labels: Array.from(requirement.labels),
          },
        });
        continue;
      }

      const missing = Array.from(requirement.permissions).filter(
        (permission) => !permissions.has(permission.flag, true)
      );

      if (missing.length > 0) {
        healthRegistry.report({
          id: issueId,
          level: "error",
          message:
            "Bot に必要なチャンネル権限が不足しています。ロールやチャンネル権限を見直してください。",
          details: {
            channelId,
            channelName: channel.name ?? null,
            labels: Array.from(requirement.labels),
            missingPermissions: missing.map((item) => item.label),
          },
        });
        continue;
      }

      healthRegistry.resolve(issueId);
    }
  }

  private async evaluateRoleHierarchy(guild: Guild, me: GuildMember) {
    const roleIds = collectRoleIds(this.config);
    if (roleIds.size === 0) {
      return;
    }

    const highest = me.roles.highest;

    for (const roleId of roleIds) {
      const issueId = buildRoleIssueId(roleId);
      const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));

      if (!role) {
        healthRegistry.report({
          id: issueId,
          level: "warning",
          message:
            "設定で参照しているロールが見つかりません。ID が正しいか確認してください。",
          details: {
            roleId,
          },
        });
        continue;
      }

      if (highest.comparePositionTo(role) <= 0) {
        healthRegistry.report({
          id: issueId,
          level: "error",
          message:
            "Bot のロール階層が不足しているため指定ロールを付与できません。Bot ロールを上位に配置してください。",
          details: {
            roleId: role.id,
            roleName: role.name,
            botRoleId: highest.id,
            botRoleName: highest.name,
          },
        });
        continue;
      }

      healthRegistry.resolve(issueId);
    }
  }
}
