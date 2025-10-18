import { promises as fs } from "fs";
import path from "path";

import type { RecordedRun, RecordedRunFailure } from "./history";
import { RUN_FAILURE_DIR, RUN_HISTORY_DIR, REPO_ROOT } from "../tasks/paths";
import { logger } from "../utils/logger";
import {
  createDiscordActionsFromEnv,
  type DiscordActions,
} from "./discordActions";
import {
  clearDiscordActionsInitIssue,
  recordDiscordActionsInitFailure,
} from "../health/checks";

type FailureMonitorConfig = {
  threshold: number;
  windowMs: number;
  minRuns: number;
  minFailures: number;
  cooldownMs: number;
};

type SuccessRecord = {
  timestamp: number;
  filePath: string;
};

type FailureRecord = {
  timestamp: number;
  filePath: string;
  queueId: string | null;
  errorMessage: string | null;
};

type FailureStats = {
  totalRuns: number;
  failures: FailureRecord[];
  successes: SuccessRecord[];
  failureRate: number;
  windowStart: number;
  windowEnd: number;
};

const ALERT_COLOR = 0xe74c3c;

const parseInteger = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFloatOrFallback = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveConfigFromEnv = (): FailureMonitorConfig => {
  const threshold = Math.max(
    0,
    Math.min(
      1,
      parseFloatOrFallback(process.env.CODEX_FAILURE_ALERT_THRESHOLD, 0.5)
    )
  );
  const windowMinutes = Math.max(
    1,
    parseInteger(process.env.CODEX_FAILURE_ALERT_WINDOW_MINUTES, 60)
  );
  const minRuns = Math.max(
    1,
    parseInteger(process.env.CODEX_FAILURE_ALERT_MIN_RUNS, 5)
  );
  const minFailures = Math.max(
    1,
    parseInteger(process.env.CODEX_FAILURE_ALERT_MIN_FAILURES, 3)
  );
  const cooldownMinutes = Math.max(
    1,
    parseInteger(process.env.CODEX_FAILURE_ALERT_COOLDOWN_MINUTES, 30)
  );

  return {
    threshold,
    windowMs: windowMinutes * 60 * 1000,
    minRuns,
    minFailures,
    cooldownMs: cooldownMinutes * 60 * 1000,
  };
};

const truncate = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
};

const resolveAlertChannelId = () =>
  process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL ??
  process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL ??
  process.env.CODEX_DISCORD_NOTIFY_CHANNEL ??
  null;

export class CodexFailureMonitor {
  private readonly config: FailureMonitorConfig;
  private lastAlertAt: number | null = null;
  private lastAlertKey: string | null = null;

  constructor(config: FailureMonitorConfig = resolveConfigFromEnv()) {
    this.config = config;
  }

  async evaluate(): Promise<void> {
    try {
      const stats = await this.collectStats();
      if (!stats) {
        return;
      }

      const totalRuns = stats.totalRuns;
      const failureCount = stats.failures.length;
      const successCount = stats.successes.length;

      if (totalRuns < this.config.minRuns) {
        return;
      }

      if (failureCount < this.config.minFailures) {
        return;
      }

      if (stats.failureRate < this.config.threshold) {
        return;
      }

      const now = Date.now();
      if (
        this.lastAlertAt &&
        now - this.lastAlertAt < this.config.cooldownMs
      ) {
        logger.debug("Codex 失敗率アラートをクールダウン中のためスキップします", {
          windowMinutes: Math.round(this.config.windowMs / 60000),
          failureRate: stats.failureRate,
        });
        return;
      }

      const latestFailurePath =
        stats.failures[0]?.filePath ?? "(unknown-failure-path)";
      const alertKey = `${failureCount}:${successCount}:${latestFailurePath}`;
      if (this.lastAlertKey === alertKey) {
        logger.debug("Codex 失敗率アラートは直近と同一条件のためスキップします", {
          alertKey,
        });
        return;
      }

      const sent = await this.dispatchAlert(stats);
      if (sent) {
        this.lastAlertAt = now;
        this.lastAlertKey = alertKey;
      }
    } catch (error) {
      logger.warn("Codex 失敗率モニタリング処理でエラーが発生しました", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async collectStats(): Promise<FailureStats | null> {
    const windowEnd = Date.now();
    const windowStart = windowEnd - this.config.windowMs;

    const [successes, failures] = await Promise.all([
      this.loadSuccessRecords(windowStart),
      this.loadFailureRecords(windowStart),
    ]);

    if (successes.length === 0 && failures.length === 0) {
      return null;
    }

    const totalRuns = successes.length + failures.length;
    const failureRate = failureCountToRate(failures.length, totalRuns);

    const orderedFailures = [...failures].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    return {
      totalRuns,
      failures: orderedFailures,
      successes,
      failureRate,
      windowStart,
      windowEnd,
    };
  }

  private async loadSuccessRecords(windowStart: number) {
    const records: SuccessRecord[] = [];
    const entries = await this.readDirSafe(RUN_HISTORY_DIR);

    for (const entry of entries) {
      if (entry.isDirectory()) {
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(RUN_HISTORY_DIR, entry.name);
      const parsed = await this.parseSuccess(filePath);
      if (!parsed) {
        continue;
      }

      const timestamp = Date.parse(parsed.executed_at);
      if (!Number.isFinite(timestamp)) {
        continue;
      }

      if (timestamp < windowStart) {
        continue;
      }

      records.push({
        timestamp,
        filePath,
      });
    }

    return records;
  }

  private async loadFailureRecords(windowStart: number) {
    const records: FailureRecord[] = [];
    const entries = await this.readDirSafe(RUN_FAILURE_DIR);

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(RUN_FAILURE_DIR, entry.name);
      const parsed = await this.parseFailure(filePath);
      if (!parsed) {
        continue;
      }

      const timestamp = Date.parse(parsed.recorded_at);
      if (!Number.isFinite(timestamp) || timestamp < windowStart) {
        continue;
      }

      records.push({
        timestamp,
        filePath,
        queueId: parsed.queue_id ?? null,
        errorMessage: parsed.error?.message ?? null,
      });
    }

    return records;
  }

  private async readDirSafe(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async parseSuccess(filePath: string): Promise<RecordedRun | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as RecordedRun;
    } catch (error) {
      logger.warn("Codex 成功履歴の解析に失敗しました", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async parseFailure(filePath: string): Promise<RecordedRunFailure | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as RecordedRunFailure;
    } catch (error) {
      logger.warn("Codex 失敗履歴の解析に失敗しました", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async dispatchAlert(stats: FailureStats): Promise<boolean> {
    const channelId = resolveAlertChannelId();
    if (!channelId) {
      logger.warn("Codex 失敗率アラートの送信先チャンネルが未設定のため通知をスキップします");
      return false;
    }

    let actions: DiscordActions;
    try {
      actions = createDiscordActionsFromEnv();
      clearDiscordActionsInitIssue();
    } catch (error) {
      logger.warn("DiscordActions の初期化に失敗したため Codex 失敗率アラートを送信できません", {
        error: error instanceof Error ? error.message : String(error),
      });
      recordDiscordActionsInitFailure(error);
      return false;
    }

    const windowMinutes = Math.round(this.config.windowMs / 60000);
    const failureRatePercent = (stats.failureRate * 100).toFixed(1);
    const failuresPreview = stats.failures.slice(0, 3).map((failure) => {
      const queue = failure.queueId ? `\`${failure.queueId}\`` : "(不明)";
      const when = new Date(failure.timestamp).toISOString();
      const reason = failure.errorMessage
        ? truncate(failure.errorMessage, 140)
        : "(理由未取得)";
      const relative = this.toRelativePath(failure.filePath);
      return `• ${queue} @ ${when}\n  理由: ${reason}\n  ログ: \`${relative}\``;
    });

    const embedFields = [
      {
        name: "監視ウィンドウ",
        value: `過去 ${windowMinutes} 分`,
        inline: true,
      },
      {
        name: "失敗率",
        value: `${failureRatePercent}% (${stats.failures.length}/${stats.totalRuns})`,
        inline: true,
      },
      {
        name: "閾値",
        value: `${(this.config.threshold * 100).toFixed(1)}% / 最低失敗数 ${this.config.minFailures}`,
        inline: true,
      },
    ];

    if (failuresPreview.length > 0) {
      embedFields.push({
        name: "最新の失敗",
        value: failuresPreview.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    const embed = {
      title: "Codex 実行の失敗率が閾値を超えています",
      color: ALERT_COLOR,
      description: [
        "過去の Codex 実行で失敗が集中しています。",
        "`/work status` や `tasks/runs/failures/` を確認し、原因の調査と対応をお願いします。",
      ].join("\n"),
      fields: embedFields,
      timestamp: new Date().toISOString(),
    };

    try {
      await actions.publishMessage(channelId, {
        content: "⚠️ Codex 実行失敗率がしきい値を超えました。",
        embeds: [embed],
      });
      logger.warn("Codex 失敗率アラートを送信しました", {
        channelId,
        failureRate: stats.failureRate,
        failures: stats.failures.length,
        totalRuns: stats.totalRuns,
      });
      return true;
    } catch (error) {
      logger.error("Codex 失敗率アラートの送信に失敗しました", {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private toRelativePath(filePath: string) {
    try {
      const relative = path.relative(REPO_ROOT, filePath);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative;
      }
    } catch {
      /* noop */
    }
    return filePath;
  }
}

const failureCountToRate = (failures: number, total: number) => {
  if (total <= 0) {
    return 0;
  }
  return failures / total;
};

export const codexFailureMonitor = new CodexFailureMonitor();
