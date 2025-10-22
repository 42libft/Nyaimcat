import { loadHealthHistoryRecords } from "./historyReader";
import { healthRegistry, type HealthIssue } from "./registry";
import { logger } from "../utils/logger";

const collectActiveIssuesFromHistory = async () => {
  const { records } = await loadHealthHistoryRecords();

  if (records.length === 0) {
    return new Map<string, HealthIssue>();
  }

  const active = new Map<string, HealthIssue>();

  for (const entry of records) {
    if (entry.record.type === "report") {
      active.set(entry.record.issue.id, entry.record.issue);
      continue;
    }

    if (entry.record.type === "resolve") {
      active.delete(entry.record.issue.id);
    }
  }

  return active;
};

export const rehydrateHealthRegistryFromHistory = async () => {
  const activeIssues = await collectActiveIssuesFromHistory();

  if (activeIssues.size === 0) {
    return 0;
  }

  let rehydratedCount = 0;

  for (const issue of activeIssues.values()) {
    const reported = healthRegistry.report(issue);
    if (reported) {
      rehydratedCount += 1;
    }
  }

  if (rehydratedCount > 0) {
    logger.debug("ヘルスレジストリを履歴から再構築しました", {
      issueCount: rehydratedCount,
    });
  }

  return rehydratedCount;
};
