import { promises as fs } from "fs";
import path from "path";

import {
  type HealthHistoryRecord,
  type HealthHistoryReportRecord,
  type HealthHistoryResolutionRecord,
} from "./history";
import { HEALTH_HISTORY_DIR } from "../tasks/paths";
import { logger } from "../utils/logger";

export type HealthHistoryRecordWithPath = {
  filePath: string;
  record: HealthHistoryRecord;
};

export type SkippedHealthHistoryFile = {
  filePath: string;
  reason: string;
};

const isReportRecord = (
  record: HealthHistoryRecord
): record is HealthHistoryReportRecord => record.type === "report";

const isResolutionRecord = (
  record: HealthHistoryRecord
): record is HealthHistoryResolutionRecord => record.type === "resolve";

const parseHistoryRecord = (
  filePath: string,
  content: string
): HealthHistoryRecordWithPath => {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(`JSON の解析に失敗しました: ${message}`);
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("ヘルス履歴の JSON にオブジェクト形式のレコードが含まれていません。");
  }

  const parsed = raw as HealthHistoryRecord;

  if (isReportRecord(parsed) || isResolutionRecord(parsed)) {
    return { filePath, record: parsed };
  }

  throw new Error("ヘルス履歴レコードの type フィールドが不正です。");
};

type HistoryFileReadResult =
  | { ok: true; value: HealthHistoryRecordWithPath }
  | { ok: false; filePath: string; reason: string };

const readHistoryFile = async (
  fileName: string
): Promise<HistoryFileReadResult> => {
  const filePath = path.join(HEALTH_HISTORY_DIR, fileName);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = parseHistoryRecord(filePath, content);
    return { ok: true, value: parsed };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return {
        ok: false,
        filePath,
        reason: "ファイルが存在しません。",
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      filePath,
      reason: message,
    };
  }
};

const compareRecordedAt = (
  a: HealthHistoryRecordWithPath,
  b: HealthHistoryRecordWithPath
) => {
  const getSortKey = (entry: HealthHistoryRecordWithPath) => {
    const raw =
      entry.record.type === "report"
        ? entry.record.recorded_at ?? entry.record.issue.detectedAt
        : entry.record.recorded_at ?? entry.record.issue.detectedAt;

    const date = raw ? new Date(raw) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }

    return path.basename(entry.filePath);
  };

  return getSortKey(a).localeCompare(getSortKey(b));
};

export const loadHealthHistoryRecords = async (): Promise<{
  records: HealthHistoryRecordWithPath[];
  skipped: SkippedHealthHistoryFile[];
}> => {
  let entries: string[];
  try {
    entries = await fs.readdir(HEALTH_HISTORY_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { records: [], skipped: [] };
    }
    throw error;
  }

  const results: HealthHistoryRecordWithPath[] = [];
  const skipped: SkippedHealthHistoryFile[] = [];

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".json")) {
      continue;
    }

    const record = await readHistoryFile(entry);
    if (record.ok) {
      results.push(record.value);
    } else {
      skipped.push({
        filePath: record.filePath,
        reason: record.reason,
      });
      logger.warn("ヘルス履歴ファイルの読み込みをスキップしました", {
        filePath: record.filePath,
        reason: record.reason,
      });
    }
  }

  return {
    records: results.sort(compareRecordedAt),
    skipped,
  };
};
