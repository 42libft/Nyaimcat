import type { APIEmbed } from "discord.js";

import {
  type HealthIssue,
  type HealthIssueChangeContext,
  type HealthRegistryObserver,
  healthRegistry,
} from "./registry";
import { collectHealthIssueSummary } from "./summary";
import {
  createDiscordActionsFromEnv,
  type DiscordActions,
} from "../codex/discordActions";
import { logger } from "../utils/logger";
import {
  recordHealthIssueReport,
  recordHealthIssueResolution,
} from "./history";

const WARNING_COLOR = 0xf1c40f;
const ERROR_COLOR = 0xe74c3c;
const RESOLVED_COLOR = 0x2ecc71;

type PublishMessageArgs = Parameters<DiscordActions["publishMessage"]>;
type DiscordActionsLike = {
  publishMessage: (...args: PublishMessageArgs) => Promise<unknown>;
};
type DiscordActionsFactory = () => DiscordActionsLike;

let discordActionsFactory: DiscordActionsFactory | null = () =>
  createDiscordActionsFromEnv();
let recordReport = recordHealthIssueReport;
let recordResolution = recordHealthIssueResolution;

const truncate = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
};

const formatTimestamp = (value: string | undefined) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

const formatDetailValue = (value: unknown) => {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatDetails = (details: Record<string, unknown> | undefined) => {
  if (!details) {
    return null;
  }

  const entries = Object.entries(details);
  if (entries.length === 0) {
    return null;
  }

  const lines = entries.slice(0, 6).map(([key, value]) => {
    const rendered = formatDetailValue(value);
    return `${key}: ${rendered}`;
  });

  const body = lines.join("\n");
  return truncate(body, 1024);
};

const resolveHealthAlertChannelId = () =>
  process.env.CODEX_DISCORD_HEALTH_ALERT_CHANNEL ??
  process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL ??
  process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL ??
  process.env.CODEX_DISCORD_NOTIFY_CHANNEL ??
  null;
let cachedActions: DiscordActionsLike | null = null;

const getDiscordActions = () => {
  if (cachedActions) {
    return cachedActions;
  }

  if (!discordActionsFactory) {
    return null;
  }

  try {
    cachedActions = discordActionsFactory();
    return cachedActions;
  } catch (error) {
    logger.warn("DiscordActions の初期化に失敗したためヘルスチェック通知を送信できません", {
      error: error instanceof Error ? error.message : String(error),
    });
    cachedActions = null;
    return null;
  }
};

const buildIssueEmbed = (
  issue: HealthIssue,
  context: HealthIssueChangeContext
): APIEmbed => {
  const levelLabel = issue.level === "error" ? "エラー" : "警告";
  const color = issue.level === "error" ? ERROR_COLOR : WARNING_COLOR;
  const statusLabel =
    context.change === "created" ? "新規検知" : "内容更新を検知";

  const fields: NonNullable<APIEmbed["fields"]> = [
    {
      name: "レベル",
      value: levelLabel,
      inline: true,
    },
    {
      name: "状態",
      value: statusLabel,
      inline: true,
    },
    {
      name: "検知時刻",
      value: formatTimestamp(issue.detectedAt),
      inline: true,
    },
  ];

  const details = formatDetails(issue.details);
  if (details) {
    fields.push({
      name: "詳細",
      value: details,
      inline: false,
    });
  }

  const summary = collectHealthIssueSummary(5);
  if (summary.total > 0) {
    fields.push({
      name: "現在のヘルス警告",
      value: summary.lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  return {
    title: "ヘルスチェック警告を検出しました",
    description: issue.message,
    color,
    fields,
    timestamp: new Date().toISOString(),
  };
};

const buildResolutionEmbed = (issue: HealthIssue): APIEmbed => {
  const fields: NonNullable<APIEmbed["fields"]> = [
    {
      name: "以前のメッセージ",
      value: truncate(issue.message, 1024),
    },
    {
      name: "検知時刻",
      value: formatTimestamp(issue.detectedAt),
      inline: true,
    },
  ];

  if (issue.details) {
    const details = formatDetails(issue.details);
    if (details) {
      fields.push({
        name: "詳細",
        value: details,
        inline: false,
      });
    }
  }

  const summary = collectHealthIssueSummary(5);
  fields.push({
    name: "残りのヘルス警告",
    value:
      summary.total > 0
        ? summary.lines.join("\n").slice(0, 1024)
        : "残りのヘルス警告はありません。",
    inline: false,
  });

  return {
    title: "ヘルスチェック警告が解消されました",
    color: RESOLVED_COLOR,
    timestamp: new Date().toISOString(),
    fields,
  };
};

const dispatchReportNotification = async (
  issue: HealthIssue,
  context: HealthIssueChangeContext
) => {
  const channelId = resolveHealthAlertChannelId();
  if (!channelId) {
    logger.debug("ヘルスチェック通知チャンネルが未設定のため警告通知をスキップします", {
      issueId: issue.id,
      message: issue.message,
    });
    return;
  }

  const actions = getDiscordActions();
  if (!actions) {
    return;
  }

  const prefix = issue.level === "error" ? "🛑" : "⚠️";
  const content =
    context.change === "created"
      ? `${prefix} ヘルスチェック警告を検出しました。`
      : `${prefix} ヘルスチェック警告が更新されました。`;

  try {
    await actions.publishMessage(channelId, {
      content,
      embeds: [buildIssueEmbed(issue, context)],
    });
  } catch (error) {
    logger.error("ヘルスチェック警告の通知送信に失敗しました", {
      issueId: issue.id,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const dispatchResolutionNotification = async (issue: HealthIssue) => {
  const channelId = resolveHealthAlertChannelId();
  if (!channelId) {
    logger.debug(
      "ヘルスチェック通知チャンネルが未設定のため解消通知をスキップします",
      {
        issueId: issue.id,
      }
    );
    return;
  }

  const actions = getDiscordActions();
  if (!actions) {
    return;
  }

  try {
    await actions.publishMessage(channelId, {
      content: "✅ ヘルスチェック警告が解消されました。",
      embeds: [buildResolutionEmbed(issue)],
    });
  } catch (error) {
    logger.error("ヘルスチェック警告解消の通知送信に失敗しました", {
      issueId: issue.id,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

let initialized = false;
let unsubscribe: (() => void) | null = null;

export const initializeHealthAlerts = () => {
  if (initialized) {
    return unsubscribe ?? (() => undefined);
  }

  const observer: HealthRegistryObserver = {
    onReport: (issue, context) => {
      void recordReport(issue, context);
      void dispatchReportNotification(issue, context);
    },
    onResolve: (issue) => {
      void recordResolution(issue);
      void dispatchResolutionNotification(issue);
    },
  };

  unsubscribe = healthRegistry.subscribe(observer);
  initialized = true;

  logger.debug("ヘルスチェック通知オブザーバを初期化しました");

  return () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    initialized = false;
    cachedActions = null;
    resetTestingOverrides();
  };
};

function resetTestingOverrides() {
  discordActionsFactory = () => createDiscordActionsFromEnv();
  recordReport = recordHealthIssueReport;
  recordResolution = recordHealthIssueResolution;
}

/**
 * テスト専用: DiscordActions の生成を差し替えます。
 */
export const __setDiscordActionsFactoryForTesting = (
  factory: DiscordActionsFactory | null
) => {
  discordActionsFactory = factory;
  cachedActions = null;
};

/**
 * テスト専用: ヘルス履歴記録処理を差し替えます。
 */
export const __setHealthHistoryRecordersForTesting = (overrides: {
  recordReport?: typeof recordHealthIssueReport;
  recordResolution?: typeof recordHealthIssueResolution;
}) => {
  if (overrides.recordReport) {
    recordReport = overrides.recordReport;
  }
  if (overrides.recordResolution) {
    recordResolution = overrides.recordResolution;
  }
};

/**
 * テスト専用: 内部状態と差し替えを初期化します。
 */
export const __resetHealthAlertsTestingState = () => {
  cachedActions = null;
  resetTestingOverrides();
  initialized = false;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
};
