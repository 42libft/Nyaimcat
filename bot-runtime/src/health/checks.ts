import type { BotConfig } from "../config";
import { createDiscordActionsFromEnv } from "../codex/discordActions";
import { logger } from "../utils/logger";
import { healthRegistry } from "./registry";

const AUDIT_CHANNEL_ISSUE_ID = "discord.auditLogChannel.missing";
const CODEX_NOTIFY_CHANNEL_ISSUE_ID = "codex.notifyChannel.missing";
const DISCORD_ACTIONS_ISSUE_ID = "codex.discordActions.initialization_failed";

export const evaluateAuditLogChannel = (config: BotConfig) => {
  const channelId = config.channels.auditLog ?? null;

  if (!channelId) {
    const reported = healthRegistry.report({
      id: AUDIT_CHANNEL_ISSUE_ID,
      level: "warning",
      message: "監査ログチャンネルが未設定です。`config.channels.auditLog` を確認してください。",
      details: {
        configuredValue: channelId,
      },
    });

    if (reported) {
      logger.warn(
        "監査ログチャンネルが未設定です。config.channels.auditLog を設定して監査ログを有効化してください。"
      );
    }
    return;
  }

  const resolved = healthRegistry.resolve(AUDIT_CHANNEL_ISSUE_ID);
  if (resolved) {
    logger.info("監査ログチャンネル設定が検出されました。ヘルスチェック警告を解消します", {
      channelId,
    });
  }
};

const getCodexNotificationEnv = () => ({
  CODEX_DISCORD_NOTIFY_CHANNEL:
    process.env.CODEX_DISCORD_NOTIFY_CHANNEL ?? null,
  CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL:
    process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL ?? null,
  CODEX_DISCORD_FAILURE_ALERT_CHANNEL:
    process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL ?? null,
});

export const evaluateCodexNotificationSettings = () => {
  const envSnapshot = getCodexNotificationEnv();
  const hasAnyChannel =
    Boolean(envSnapshot.CODEX_DISCORD_NOTIFY_CHANNEL) ||
    Boolean(envSnapshot.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL) ||
    Boolean(envSnapshot.CODEX_DISCORD_FAILURE_ALERT_CHANNEL);

  if (!hasAnyChannel) {
    const reported = healthRegistry.report({
      id: CODEX_NOTIFY_CHANNEL_ISSUE_ID,
      level: "warning",
      message:
        "Codex 通知チャンネルが未設定です。`CODEX_DISCORD_NOTIFY_CHANNEL` などの環境変数を確認してください。",
      details: envSnapshot,
    });

    if (reported) {
      logger.warn(
        "Codex 通知チャンネル設定が見つからなかったためヘルスチェック警告を報告しました。",
        envSnapshot
      );
    }
    return;
  }

  const resolved = healthRegistry.resolve(CODEX_NOTIFY_CHANNEL_ISSUE_ID);
  if (resolved) {
    logger.info("Codex 通知チャンネル設定が検出されたためヘルスチェック警告を解消しました", {
      configuredChannels: envSnapshot,
    });
  }
};

export const recordDiscordActionsInitFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  const reported = healthRegistry.report({
    id: DISCORD_ACTIONS_ISSUE_ID,
    level: "error",
    message:
      "DiscordActions の初期化に失敗しました。トークンや許可チャンネルの設定を確認してください。",
    details: {
      error: message,
    },
  });

  if (reported) {
    logger.warn(
      "DiscordActions の初期化失敗をヘルスチェック警告として報告しました",
      { error: message }
    );
  }
};

export const clearDiscordActionsInitIssue = () => {
  const resolved = healthRegistry.resolve(DISCORD_ACTIONS_ISSUE_ID);
  if (resolved) {
    logger.info(
      "DiscordActions の初期化が成功したためヘルスチェック警告を解消しました"
    );
  }
};

export const evaluateDiscordActionsHealth = () => {
  try {
    createDiscordActionsFromEnv();
    clearDiscordActionsInitIssue();
  } catch (error) {
    recordDiscordActionsInitFailure(error);
  }
};
