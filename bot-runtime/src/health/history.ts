import { promises as fs } from "fs";
import path from "path";

import type { HealthIssue, HealthIssueChangeContext } from "./registry";
import { HEALTH_HISTORY_DIR } from "../tasks/paths";
import { logger } from "../utils/logger";

export type HealthHistoryReportRecord = {
  type: "report";
  change: HealthIssueChangeContext["change"];
  issue: HealthIssue;
  previous: HealthIssue | null;
  recorded_at: string;
};

export type HealthHistoryResolutionRecord = {
  type: "resolve";
  issue: HealthIssue;
  recorded_at: string;
};

export type HealthHistoryRecord =
  | HealthHistoryReportRecord
  | HealthHistoryResolutionRecord;

const ensureHistoryDirectory = async () => {
  await fs.mkdir(HEALTH_HISTORY_DIR, { recursive: true });
};

const sanitizeForFilename = (value: string, fallback: string) => {
  const normalized = value.replace(/[^a-z0-9_-]/gi, "-");
  const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed.length > 0 ? collapsed : fallback;
};

const buildFilename = (issueId: string, suffix: string) => {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const slug = sanitizeForFilename(issueId, "issue");
  return `${timestamp}-${slug}-${suffix}.json`;
};

const writeHistoryRecord = async (
  issueId: string,
  suffix: string,
  record: HealthHistoryRecord
) => {
  try {
    await ensureHistoryDirectory();
    const filename = buildFilename(issueId, suffix);
    const filePath = path.join(HEALTH_HISTORY_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
  } catch (error) {
    logger.warn("ヘルスチェック履歴の書き込みに失敗しました", {
      issueId,
      suffix,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const recordHealthIssueReport = async (
  issue: HealthIssue,
  context: HealthIssueChangeContext
) => {
  const record: HealthHistoryReportRecord = {
    type: "report",
    change: context.change,
    issue,
    previous: context.previous,
    recorded_at: new Date().toISOString(),
  };

  const suffix = `report-${context.change}`;
  await writeHistoryRecord(issue.id, suffix, record);
};

export const recordHealthIssueResolution = async (issue: HealthIssue) => {
  const record: HealthHistoryResolutionRecord = {
    type: "resolve",
    issue,
    recorded_at: new Date().toISOString(),
  };

  await writeHistoryRecord(issue.id, "resolve", record);
};
