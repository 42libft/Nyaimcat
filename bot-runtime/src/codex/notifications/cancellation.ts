import type { APIEmbed } from "discord.js";

import { logger } from "../../utils/logger";
import { resolveDiscordActions } from "./actions";
import { resolveNotifyChannelId } from "./channel";
import { WARNING_COLOR } from "./constants";
import {
  describeCancellationStage,
  formatTimestamp,
  resolvePriority,
} from "./shared";
import type { NotifyRunCancellationContext, NotifyRunOptions } from "./types";

export const notifyRunCancellation = async (
  context: NotifyRunCancellationContext,
  options: NotifyRunOptions = {}
) => {
  const channelId = resolveNotifyChannelId(options);

  if (!channelId) {
    logger.debug("Discord 通知チャンネルが設定されていないためキャンセル通知をスキップします", {
      queueId: context.queueId,
      task: context.task.filename,
    });
    return;
  }

  let actions = options.actions;
  if (!actions) {
    actions = resolveDiscordActions(
      options,
      "DiscordActions の初期化に失敗したためキャンセル通知をスキップします",
      {
        queueId: context.queueId,
        task: context.task.filename,
      }
    );

    if (!actions) {
      return;
    }
  }

  const priority = resolvePriority(context.task.metadata.priority);
  const stageLabel = describeCancellationStage(context.queueItem);

  const embed: APIEmbed = {
    title: "Codex 実行がキャンセルされました",
    color: WARNING_COLOR,
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
        inline: true,
      },
      {
        name: "キャンセル種別",
        value: stageLabel,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  if (context.runId) {
    embed.fields?.push({
      name: "Run ID",
      value: `\`${context.runId}\``,
      inline: true,
    });
  }

  const timelineLines: string[] = [];
  const requestedAt = context.queueItem?.requestedAt
    ? formatTimestamp(context.queueItem.requestedAt)
    : null;
  const startedAt = context.queueItem?.startedAt
    ? formatTimestamp(context.queueItem.startedAt)
    : null;
  const finishedAt = context.queueItem?.finishedAt
    ? formatTimestamp(context.queueItem.finishedAt)
    : null;

  if (requestedAt) {
    timelineLines.push(`受付: ${requestedAt}`);
  }
  if (startedAt) {
    timelineLines.push(`開始: ${startedAt}`);
  }
  if (finishedAt) {
    timelineLines.push(`終了: ${finishedAt}`);
  }

  if (timelineLines.length > 0) {
    embed.fields?.push({
      name: "タイムライン",
      value: timelineLines.join("\n").slice(0, 1024),
    });
  }

  const reason = (context.reason ?? "").trim();
  if (reason.length > 0) {
    embed.fields?.push({
      name: "キャンセル理由",
      value: reason.slice(0, 1024),
    });
  }

  const content = "Codex 実行がキャンセルされました。";

  try {
    await actions.publishMessage(channelId, {
      content,
      embeds: [embed],
    });
  } catch (error) {
    logger.error("Codex 実行キャンセル通知の送信に失敗しました", {
      queueId: context.queueId,
      task: context.task.filename,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
