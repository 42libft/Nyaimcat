import { promises as fs } from "fs";
import path from "path";

import { PRIORITY_LABELS } from "../discord/commands/task";
import { logger } from "../utils/logger";
import { REPO_ROOT } from "../tasks/paths";
import type { CodexRunnerResult } from "./runner";
import type { GitStatusEntry } from "../utils/gitStatus";

const resolveDocPath = (
  value: string | undefined,
  defaultRelativePath: string
) => {
  if (value && value.trim().length > 0) {
    const trimmed = value.trim();
    return path.isAbsolute(trimmed)
      ? trimmed
      : path.join(REPO_ROOT, trimmed);
  }
  return path.join(REPO_ROOT, defaultRelativePath);
};

const PLANS_DOC_PATH = resolveDocPath(
  process.env.CODEX_DOCS_PLANS_PATH,
  path.join("docs", "codex", "plans.md")
);
const TASK_DOC_PATH = resolveDocPath(
  process.env.CODEX_DOCS_TASK_PATH,
  path.join("docs", "codex", "task.md")
);

const PLANS_HEADER = "## Codex 実行ログ";
const TASK_HEADER = "## Codex 実行履歴";

const ensureFile = async (filePath: string) => {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "", "utf-8");
  }
};

const formatStatusLabel = (result: CodexRunnerResult) => {
  if (result.timedOut) {
    return "タイムアウト";
  }

  if (typeof result.exitCode === "number") {
    if (result.exitCode === 0) {
      return "成功";
    }
    return `失敗(code=${result.exitCode})`;
  }

  if (result.signal) {
    return `失敗(signal=${result.signal})`;
  }

  return "結果不明";
};

const resolvePriorityLabel = (priority: string) => {
  const record = PRIORITY_LABELS as Record<string, string | undefined>;
  return record[priority] ?? priority;
};

const relativeHistoryPath = (result: CodexRunnerResult) => {
  if (!result.historyPath) {
    return null;
  }
  return path.relative(REPO_ROOT, result.historyPath);
};

const addEntryToSection = (content: string, header: string, entry: string) => {
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const trimmedHeader = header.trim();
  let headerIndex = lines.findIndex((line) => line.trim() === trimmedHeader);

  if (headerIndex === -1) {
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : undefined;
    if (lastLine && lastLine.trim().length > 0) {
      lines.push("");
    }
    lines.push(header);
    lines.push("");
    lines.push(entry);
  } else {
    let insertIndex = headerIndex + 1;
    while (insertIndex < lines.length && (lines[insertIndex] ?? "").trim() === "") {
      insertIndex++;
    }
    lines.splice(insertIndex, 0, entry);
  }

  return lines.join("\n").replace(/\s+$/u, "") + "\n";
};

const appendEntry = async (filePath: string, header: string, entry: string) => {
  await ensureFile(filePath);

  let content = "";
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    logger.warn("ドキュメント読み込みに失敗したため新規作成します", {
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const updated = addEntryToSection(content, header, entry);
  await fs.writeFile(filePath, updated, "utf-8");
};

const SECTIONS_PLACEHOLDER = "（未記入）";

const formatCommand = (result: CodexRunnerResult) => {
  const args = result.command.args ?? [];
  const joined = [result.command.bin, ...args].filter((part) => part && part.length > 0).join(" ");
  return joined.length > 0 ? joined : result.command.bin;
};

const formatDuration = (durationMs: number) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return `${durationMs} ms`;
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    const precision = seconds >= 10 ? 1 : 2;
    return `${seconds.toFixed(precision)} 秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  if (minutes < 60) {
    if (remainingSeconds < 1) {
      return `${minutes} 分`;
    }
    const precision = remainingSeconds >= 10 ? 1 : 2;
    return `${minutes} 分 ${remainingSeconds.toFixed(precision)} 秒`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} 時間`;
  }
  return `${hours} 時間 ${remainingMinutes} 分`;
};

const formatGitChange = (change: GitStatusEntry) => {
  const label = change.status.trim() || "?";
  if (change.originalPath && change.originalPath !== change.path) {
    return `${label} ${change.originalPath} -> ${change.path}`;
  }
  return `${label} ${change.path}`;
};

const buildPlansEntry = (result: CodexRunnerResult) => {
  const timestamp = new Date().toISOString();
  const status = formatStatusLabel(result);
  const priority = resolvePriorityLabel(result.task.metadata.priority);
  const history = relativeHistoryPath(result);
  const changeCount = result.fileChanges.length;
  const duration = formatDuration(result.durationMs);
  const command = formatCommand(result);

  const header = `### ${timestamp} | ${status} | ${result.task.metadata.title}`;

  const metaLines = [
    `- **Run ID**: ${result.runId}`,
    `- **タスクファイル**: \`${result.task.filename}\``,
    `- **優先度**: ${priority}`,
    `- **コマンド**: \`${command}\``,
    `- **所要時間**: ${duration}`,
    `- **変更ファイル数**: ${changeCount}件`,
  ];

  if (history) {
    metaLines.push(`- **履歴**: \`${history}\``);
  }

  if (changeCount > 0) {
    metaLines.push("- **変更ファイル一覧**:");
    metaLines.push(
      ...result.fileChanges.map((change) => `  - ${formatGitChange(change)}`)
    );
  } else {
    metaLines.push("- **変更ファイル一覧**: (なし)");
  }

  const sectionLines = [
    "",
    `- **全体像**: ${SECTIONS_PLACEHOLDER}`,
    `- **進捗状況**: ${SECTIONS_PLACEHOLDER}`,
    `- **発見事項**: ${SECTIONS_PLACEHOLDER}`,
    `- **決定事項**: ${SECTIONS_PLACEHOLDER}`,
    "",
  ];

  return [header, ...metaLines, ...sectionLines].join("\n");
};

const buildTaskEntry = (result: CodexRunnerResult) => {
  const timestamp = new Date().toISOString();
  const status = formatStatusLabel(result);
  const history = relativeHistoryPath(result);
  const summary = result.stdout.trim().split(/\r?\n/)[0] ?? "";
  const changeCount = result.fileChanges.length;

  const fragments = [
    `${timestamp}`,
    `ステータス: ${status}`,
    `Run ID: ${result.runId}`,
  ];

  if (history) {
    fragments.push(`履歴: \`${history}\``);
  }

  if (summary) {
    fragments.push(`メモ: ${summary.slice(0, 120)}`);
  }

  fragments.push(`変更ファイル: ${changeCount}件`);

  return `- ${fragments.join(" / ")}`;
};

export const updateDocumentsForRun = async (result: CodexRunnerResult) => {
  const plansEntry = buildPlansEntry(result);
  const taskEntry = buildTaskEntry(result);

  await appendEntry(PLANS_DOC_PATH, PLANS_HEADER, plansEntry);
  await appendEntry(TASK_DOC_PATH, TASK_HEADER, taskEntry);
};
