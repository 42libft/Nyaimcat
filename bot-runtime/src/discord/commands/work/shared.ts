import type {
  CodexQueueItem,
  CodexQueueSnapshot,
} from "../../../codex/executionQueue";

export const PROMPT_PREVIEW_LIMIT = 1200;
export const WORK_SELECT_MENU_PREFIX = "codex:work:start:select:";
export const SELECTION_SESSION_TTL_MS = 5 * 60 * 1000;
export const MAX_SELECT_OPTIONS = 25;

const WORK_START_ERROR_HEADER =
  "申し訳ありません、Codex 実行キューへの登録に失敗しました。";
const WORK_ERROR_GUIDANCE_LINES = [
  "",
  "⚙️ トラブルシュート:",
  "- `docs/codex/operations.md` の「Slash コマンドのエラーメッセージとトラブルシュート」を確認してください。",
  "- 監査ログと `tasks/runs/failures/` の記録を参照し、必要に応じて `/work status` で現在のキュー状況を確認してから再実行してください。",
];

export const buildWorkStartErrorMessage = (reason: string) =>
  [WORK_START_ERROR_HEADER, `理由: ${reason}`, ...WORK_ERROR_GUIDANCE_LINES].join("\n");

export const STATUS_LABELS: Record<CodexQueueItem["status"], string> = {
  pending: "保留中",
  running: "実行中",
  succeeded: "完了",
  failed: "失敗",
  cancelled: "キャンセル済み",
};

export const formatTimestamp = (value: string | undefined) => {
  if (!value) {
    return "-";
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
  if (value.startsWith("exit_code_")) {
    return `終了コード ${value.slice("exit_code_".length)}`;
  }
  if (value.startsWith("signal_")) {
    return `シグナル ${value.slice("signal_".length)}`;
  }
  return value;
};

const formatRetrySummary = (item: CodexQueueItem) => {
  const retry = item.retry;
  if (!retry) {
    return null;
  }

  const lines: string[] = [];

  if (retry.attempts > 0 || retry.maxAttempts > 0) {
    lines.push(`試行回数: ${retry.attempts} / 最大 ${retry.maxAttempts}`);
  }

  if (retry.performedRetries > 0) {
    const maxRetries = Math.max(0, retry.maxAttempts - 1);
    const reasons = retry.reasons.map(describeRetryReason).join(", ");
    const reasonLabel = reasons.length > 0 ? ` (理由: ${reasons})` : "";
    lines.push(
      `自動リトライ: ${retry.performedRetries}回 / 上限 ${maxRetries}回${reasonLabel}`
    );
  }

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n");
};

export const summarizeQueueItem = (item: CodexQueueItem): string => {
  const status = STATUS_LABELS[item.status] ?? item.status;
  const lines = [
    `状態: ${status}`,
    `キューID: \`${item.id}\``,
    `ファイル: \`${item.filename}\``,
    `受付: ${formatTimestamp(item.requestedAt)}`,
  ];

  if (item.startedAt) {
    lines.push(`開始: ${formatTimestamp(item.startedAt)}`);
  }

  if (item.finishedAt) {
    lines.push(`終了: ${formatTimestamp(item.finishedAt)}`);
  }

  if (item.result) {
    const exitCode =
      item.result.exitCode !== null ? String(item.result.exitCode) : "(null)";
    lines.push(`Run ID: \`${item.result.runId}\``);
    lines.push(`終了コード: ${exitCode}`);
    lines.push(`タイムアウト: ${item.result.timedOut ? "はい" : "いいえ"}`);
    lines.push(`変更ファイル: ${item.result.fileChanges.length}件`);
  }

  const retrySummary = formatRetrySummary(item);
  if (retrySummary) {
    lines.push(retrySummary);
  }

  if (item.error) {
    lines.push(`エラー: ${item.error.message}`);
  }

  if (item.cancelRequested) {
    lines.push("キャンセル要求: 済み");
  }

  return lines.join("\n");
};

export const summarizeQueueSnapshot = (snapshot: CodexQueueSnapshot) => {
  const lines: string[] = [];

  if (snapshot.active) {
    lines.push("**実行中**");
    lines.push(summarizeQueueItem(snapshot.active));
  } else {
    lines.push("**実行中**\nなし");
  }

  if (snapshot.pending.length > 0) {
    lines.push("");
    lines.push(`**待機中 (${snapshot.pending.length}件)**`);
    snapshot.pending.slice(0, 5).forEach((item: CodexQueueItem, index: number) => {
      const status = STATUS_LABELS[item.status] ?? item.status;
      lines.push(
        `${index + 1}. [${status}] \`${item.filename}\` (ID: \`${item.id}\`)`
      );
    });
    if (snapshot.pending.length > 5) {
      lines.push(`…他 ${snapshot.pending.length - 5} 件`);
    }
  } else {
    lines.push("");
    lines.push("**待機中**\nなし");
  }

  if (snapshot.history.length > 0) {
    lines.push("");
    lines.push("**直近履歴**");
    snapshot.history.slice(0, 5).forEach((item: CodexQueueItem) => {
      const status = STATUS_LABELS[item.status] ?? item.status;
      const finished = item.finishedAt ? formatTimestamp(item.finishedAt) : "-";
      lines.push(`[${status}] \`${item.filename}\` (終了: ${finished}) / ID: \`${item.id}\``);
    });
  } else {
    lines.push("");
    lines.push("**直近履歴**\nなし");
  }

  return lines.join("\n");
};
