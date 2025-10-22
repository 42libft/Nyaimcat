import { ActivityType, type Client, type PresenceData } from "discord.js";

import { collectHealthIssueSummary } from "../health/summary";
import { healthRegistry } from "../health/registry";
import { logger } from "../utils/logger";

const MAX_STATE_LENGTH = 80;

const truncate = (value: string, limit: number) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

const stripPrefix = (line: string) => line.replace(/^[🛑⚠️]\s+/, "").trim();

const stripDetectedAt = (line: string) =>
  line.replace(/\s*\(検知:[^)]+\)\s*$/, "").trim();

export class PresenceManager {
  private unsubscribe: (() => void) | null = null;
  private started = false;

  constructor(private readonly client: Client) {}

  start() {
    if (this.started) {
      return;
    }

    this.unsubscribe = healthRegistry.subscribe({
      onReport: () => this.handleHealthChange(),
      onResolve: () => this.handleHealthChange(),
    });

    this.started = true;
    void this.refresh();
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
  }

  async refresh() {
    if (!this.started || !this.client.isReady() || !this.client.user) {
      return;
    }

    const presence = this.buildPresence();

    try {
      await this.client.user.setPresence(presence);
      logger.debug("Discord プレゼンスを更新しました", {
        status: presence.status,
        activity:
          presence.activities?.[0]?.state ??
          presence.activities?.[0]?.name ??
          null,
      });
    } catch (error) {
      logger.warn("Discord プレゼンス更新に失敗しました", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleHealthChange() {
    void this.refresh();
  }

  private buildPresence(): PresenceData {
    const issues = healthRegistry.list();

    if (issues.length === 0) {
      return {
        status: "online",
        activities: [
          {
            type: ActivityType.Custom,
            name: "Custom Status",
            state: "🟢 利用可能",
          },
        ],
      };
    }

    const hasError = issues.some((issue) => issue.level === "error");
    const prefix = hasError ? "🛑 障害対応中" : "⚠️ 警告中";
    const summary = collectHealthIssueSummary(1);
    const topLine = summary.lines[0]
      ? stripDetectedAt(stripPrefix(summary.lines[0]))
      : "";
    const countSuffix = summary.total > 1 ? ` (+${summary.total - 1})` : "";
    const stateBase =
      topLine.length > 0
        ? `${prefix} | ${topLine}${countSuffix}`
        : `${prefix}${countSuffix}`;
    const state = truncate(stateBase, MAX_STATE_LENGTH);

    return {
      status: hasError ? "dnd" : "idle",
      activities: [
        {
          type: ActivityType.Custom,
          name: "Custom Status",
          state,
        },
      ],
    };
  }
}
