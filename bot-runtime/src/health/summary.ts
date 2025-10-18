import type { HealthIssue } from "./registry";
import { healthRegistry } from "./registry";

const formatTimestamp = (value: string | undefined) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

const formatIssueLine = (issue: HealthIssue) => {
  const prefix = issue.level === "error" ? "🛑" : "⚠️";
  const detected = formatTimestamp(issue.detectedAt);
  return `${prefix} ${issue.message} (検知: ${detected})`;
};

export const collectHealthIssueSummary = (limit = 3) => {
  const issues = healthRegistry.list();

  if (issues.length === 0) {
    return {
      total: 0,
      lines: [] as string[],
    };
  }

  const lines = issues.slice(0, Math.max(1, limit)).map(formatIssueLine);

  if (issues.length > limit) {
    lines.push(`…他 ${issues.length - limit} 件のヘルス警告があります。`);
  }

  return {
    total: issues.length,
    lines,
  };
};
