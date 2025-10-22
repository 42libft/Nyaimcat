import path from "path";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type RESTPostAPIChannelMessageJSONBody,
} from "discord.js";

import { PRIORITY_LABELS } from "../../discord/commands/task";
import { REPO_ROOT } from "../../tasks/paths";
import { buildFollowUpButtonId } from "../followUp";
import type { CodexRunnerResult } from "../runner";
import type { CodexQueueItem } from "../executionQueue";
import { SUCCESS_COLOR, FAILURE_COLOR, WARNING_COLOR } from "./constants";

const RETRY_REASON_PREFIX = {
  exitCode: "exit_code_",
  signal: "signal_",
};

export type StatusDescriptor = {
  label: string;
  color: number;
};

export const truncateToLength = (value: string, limit: number) => {
  if (value.length <= limit) {
    return { text: value, truncated: false };
  }

  return {
    text: value.slice(0, limit),
    truncated: true,
  };
};

export const formatLogSnippet = (log: string, limit: number) => {
  if (!log.trim()) {
    return null;
  }

  const { text, truncated } = truncateToLength(log.trim(), limit);
  const codeBlock = ["```", text, "```"].join("\n");

  return truncated ? `${codeBlock}\n...` : codeBlock;
};

export const resolvePriority = (priority: string) => {
  const label = (PRIORITY_LABELS as Record<string, string | undefined>)[priority];
  return label ?? priority;
};

export const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

const describeRetryReason = (value: string) => {
  if (value === "timeout") {
    return "タイムアウト検知";
  }

  if (value.startsWith(RETRY_REASON_PREFIX.exitCode)) {
    const code = value.slice(RETRY_REASON_PREFIX.exitCode.length);
    return `終了コード ${code}`;
  }

  if (value.startsWith(RETRY_REASON_PREFIX.signal)) {
    const signal = value.slice(RETRY_REASON_PREFIX.signal.length);
    return `シグナル ${signal}`;
  }

  return value;
};

export const formatRetryDetails = (retry: {
  attempts: number;
  maxAttempts: number;
  performedRetries: number;
  reasons: string[];
}) => {
  const maxRetries = Math.max(0, retry.maxAttempts - 1);
  const lines: string[] = [
    `試行回数: ${retry.attempts} / 最大 ${retry.maxAttempts}`,
    `自動リトライ: ${retry.performedRetries}回 / 上限 ${maxRetries}回`,
  ];

  if (retry.performedRetries > 0 && retry.reasons.length > 0) {
    const reasonLines = retry.reasons.map(
      (reason, index) => `${index + 1}. ${describeRetryReason(reason)}`
    );
    lines.push("理由:");
    lines.push(...reasonLines);
  }

  return lines.join("\n").slice(0, 1024);
};

export const determineStatus = (result: CodexRunnerResult): StatusDescriptor => {
  if (result.timedOut) {
    return {
      label: "⏱ タイムアウト",
      color: WARNING_COLOR,
    };
  }

  if (typeof result.exitCode === "number" && result.exitCode === 0) {
    return {
      label: "✅ 成功",
      color: SUCCESS_COLOR,
    };
  }

  if (typeof result.exitCode === "number") {
    return {
      label: `⚠️ 異常終了 (code=${result.exitCode})`,
      color: FAILURE_COLOR,
    };
  }

  return {
    label: `⚠️ 異常終了 (signal=${result.signal ?? "unknown"})`,
    color: FAILURE_COLOR,
  };
};

export const describeCancellationStage = (queueItem: CodexQueueItem | null | undefined) => {
  if (!queueItem) {
    return "キャンセル済み";
  }

  switch (queueItem.status) {
    case "cancelled":
      return queueItem.startedAt ? "実行中にキャンセル" : "開始前にキャンセル";
    case "pending":
      return "開始前にキャンセル";
    case "running":
      return "キャンセル要求中";
    case "failed":
      return "失敗扱いで終了";
    case "succeeded":
      return "完了済み";
    default:
      return queueItem.status;
  }
};

export const chunkText = (value: string, size: number): string[] => {
  if (size <= 0) {
    return [value];
  }

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }

  return chunks;
};

export const buildFollowUpComponents = (
  runId: string
): RESTPostAPIChannelMessageJSONBody["components"] => {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildFollowUpButtonId(runId))
      .setLabel("フォローアップを依頼")
      .setStyle(ButtonStyle.Primary)
  );

  return [row.toJSON()];
};

export const toRelativeRepositoryPath = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const relative = path.relative(REPO_ROOT, value);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative;
    }
  } catch {
    /* noop */
  }

  return value;
};
