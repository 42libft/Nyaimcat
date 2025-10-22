import type { APIEmbed } from "discord.js";

import { logger } from "../../utils/logger";
import { resolveDiscordActions } from "./actions";
import { resolveNotifyChannelId } from "./channel";
import { FAILURE_COLOR } from "./constants";
import {
  formatLogSnippet,
  formatRetryDetails,
  formatTimestamp,
  resolvePriority,
  toRelativeRepositoryPath,
  truncateToLength,
} from "./shared";
import type { NotifyRunFailureContext, NotifyRunOptions } from "./types";

const buildFailureTimeline = (context: NotifyRunFailureContext) => {
  const queueItem = context.queueItem;
  if (!queueItem) {
    return null;
  }

  const lines: string[] = [];

  if (queueItem.requestedAt) {
    lines.push(`受付: ${formatTimestamp(queueItem.requestedAt)}`);
  }

  if (queueItem.startedAt) {
    lines.push(`開始: ${formatTimestamp(queueItem.startedAt)}`);
  }

  if (queueItem.finishedAt) {
    lines.push(`終了: ${formatTimestamp(queueItem.finishedAt)}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n").slice(0, 1024);
};

export const notifyRunFailure = async (
  context: NotifyRunFailureContext,
  options: NotifyRunOptions = {}
) => {
  const channelId = resolveNotifyChannelId(
    options,
    "CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL"
  );

  if (!channelId) {
    logger.debug("Codex 失敗通知チャンネルが設定されていないため通知をスキップします", {
      queueId: context.queueId,
      filename: context.task.filename,
    });
    return;
  }

  let actions = options.actions;
  if (!actions) {
    actions = resolveDiscordActions(
      options,
      "DiscordActions の初期化に失敗したため失敗通知をスキップします",
      {
        queueId: context.queueId,
        filename: context.task.filename,
      }
    );

    if (!actions) {
      return;
    }
  }

  const priority = resolvePriority(context.task.metadata.priority);
  const statusLabel = context.queueItem?.status ?? "failed";

  const embed: APIEmbed = {
    title: "Codex 実行でエラーが発生しました",
    color: FAILURE_COLOR,
    fields: [
      {
        name: "タスク",
        value: context.task.metadata.title,
      },
      {
        name: "ファイル",
        value: `\`${context.task.filename}\``,
        inline: true,
      },
      {
        name: "優先度",
        value: priority,
        inline: true,
      },
      {
        name: "キュー ID",
        value: `\`${context.queueId}\``,
      },
      {
        name: "ステータス",
        value: statusLabel,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  if (context.queueItem?.cancelRequested) {
    embed.fields?.push({
      name: "キャンセル要求",
      value: "はい",
      inline: true,
    });
  }

  const failureRetry = context.queueItem?.result?.retry;
  if (failureRetry && failureRetry.performedRetries > 0) {
    embed.fields?.push({
      name: "自動リトライ",
      value: formatRetryDetails(failureRetry),
    });
  }

  const timeline = buildFailureTimeline(context);
  if (timeline) {
    embed.fields?.push({
      name: "タイムライン",
      value: timeline,
    });
  }

  const errorMessage =
    context.error.message?.trim() ||
    context.queueItem?.error?.message ||
    "エラーメッセージが取得できませんでした。";

  const errorField =
    formatLogSnippet(errorMessage, 900) ??
    truncateToLength(errorMessage, 1024).text;

  embed.fields?.push({
    name: "エラー内容",
    value: errorField,
  });

  const stack = context.error.stack ?? context.queueItem?.error?.stack ?? null;
  if (stack) {
    const stackSnippet =
      formatLogSnippet(stack, 900) ?? truncateToLength(stack, 1024).text;
    embed.fields?.push({
      name: "スタックトレース",
      value: stackSnippet,
    });
  }

  if (context.failureRecordPath) {
    const relative = toRelativeRepositoryPath(context.failureRecordPath);
    embed.fields?.push({
      name: "失敗ログ",
      value: `\`${relative}\``,
    });
  }

  const content =
    "Codex 実行が内部エラーで停止しました。ログを確認し、必要に応じて再実行や調査をお願いします。";

  try {
    await actions.publishMessage(channelId, {
      content,
      embeds: [embed],
    });
  } catch (error) {
    logger.error("Codex 実行失敗の通知に失敗しました", {
      queueId: context.queueId,
      filename: context.task.filename,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
