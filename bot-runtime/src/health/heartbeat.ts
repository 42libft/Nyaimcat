import type { DiscordActions } from "../codex/discordActions";
import { createDiscordActionsFromEnv } from "../codex/discordActions";
import { collectHealthIssueSummary } from "./summary";
import { healthRegistry } from "./registry";
import { logger } from "../utils/logger";

const resolveHealthAlertChannelId = () =>
  process.env.CODEX_DISCORD_HEALTH_ALERT_CHANNEL ??
  process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL ??
  process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL ??
  process.env.CODEX_DISCORD_NOTIFY_CHANNEL ??
  null;

const isEnabled = () => {
  const raw = process.env.HEALTH_HEARTBEAT_ENABLED;
  if (!raw) {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "on", "yes"].includes(normalized);
};

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_REPEAT_SUPPRESS_MS = 6 * 60 * 60 * 1000;

const resolveInterval = () => {
  const raw = process.env.HEALTH_HEARTBEAT_INTERVAL_MS;
  if (!raw) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTERVAL_MS;
  }
  return parsed;
};

const resolveRepeatSuppressMs = () => {
  const raw = process.env.HEALTH_HEARTBEAT_REPEAT_SUPPRESS_MS;
  if (!raw) {
    return DEFAULT_REPEAT_SUPPRESS_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REPEAT_SUPPRESS_MS;
  }
  return parsed;
};

type PublishMessageArgs = Parameters<DiscordActions["publishMessage"]>;

let cachedActions: DiscordActions | null = null;

const getDiscordActions = () => {
  if (cachedActions) {
    return cachedActions;
  }

  try {
    cachedActions = createDiscordActionsFromEnv();
    return cachedActions;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(
      "ヘルス心拍の DiscordActions 初期化に失敗したため通知をスキップします",
      { message }
    );
    cachedActions = null;
    return null;
  }
};

const formatHeartbeatMessage = () => {
  const summary = collectHealthIssueSummary(5);

  if (summary.total === 0) {
    return null;
  }

  const lines = [
    "⏰ 定期ヘルスチェック: 以下の警告が継続しています。",
    ...summary.lines.map((line) => `- ${line}`),
  ];

  return lines.join("\n");
};

export class HealthHeartbeat {
  private started = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private posting = false;
  private lastMessage: { content: string; timestamp: number } | null = null;

  start() {
    if (this.started || !isEnabled()) {
      return;
    }

    this.started = true;
    void this.dispatch();

    const interval = resolveInterval();
    this.intervalHandle = setInterval(() => {
      void this.dispatch();
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

  private async dispatch() {
    if (this.posting) {
      return;
    }

    const channelId = resolveHealthAlertChannelId();
    if (!channelId) {
      return;
    }

    const message = formatHeartbeatMessage();
    if (!message) {
      return;
    }

    const suppressMs = resolveRepeatSuppressMs();
    if (
      this.lastMessage &&
      this.lastMessage.content === message &&
      Date.now() - this.lastMessage.timestamp < suppressMs
    ) {
      return;
    }

    const actions = getDiscordActions();
    if (!actions) {
      return;
    }

    this.posting = true;
    try {
      await actions.publishMessage(channelId, {
        content: message,
      } as PublishMessageArgs[1]);
      this.lastMessage = { content: message, timestamp: Date.now() };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      logger.warn("ヘルス心拍通知の送信に失敗しました", {
        channelId,
        error: text,
      });
    } finally {
      this.posting = false;
    }
  }
}
