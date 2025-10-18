#!/usr/bin/env node
import path from "path";
import { exit } from "process";

import type {
  HealthIssue,
  HealthIssueLevel,
} from "../health/registry";
import {
  loadHealthHistoryRecords,
  type HealthHistoryRecordWithPath,
  type SkippedHealthHistoryFile,
} from "../health/historyReader";

type TimelineChange = "created" | "updated" | "resolved";

type TimelineEntry = {
  issueId: string;
  kind: "report" | "resolve";
  change: TimelineChange;
  recordedAt: string | null;
  filePath: string;
  issue: HealthIssue;
  previous: HealthIssue | null;
};

type IssueAggregate = {
  id: string;
  level: HealthIssueLevel;
  message: string;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
  active: boolean;
  lastEvent: TimelineChange;
  reportCount: number;
  createdCount: number;
  updateCount: number;
  resolveCount: number;
  resolvedAt: string | null;
  lastFilePath: string | null;
  history: TimelineEntry[];
};

type AggregationResult = {
  issues: IssueAggregate[];
  issueMap: Map<string, IssueAggregate>;
  timeline: TimelineEntry[];
};

const usage = `ヘルス履歴ダッシュボード

使い方:
  npm run health-history -- summary
  npm run health-history -- detail <issue-id>
  npm run health-history -- timeline [--limit <件数>]

説明:
  summary   : ヘルスチェック問題の集計結果を表示します。
  detail    : 指定した issue-id の詳細タイムラインを表示します。
  timeline  : 直近のヘルスイベントを時系列で表示します（既定 20 件）。
`;

const reportSkippedFiles = (skipped: SkippedHealthHistoryFile[]) => {
  if (skipped.length === 0) {
    return;
  }

  console.warn(
    `\u26a0\ufe0f ${skipped.length} 件のヘルス履歴ファイルを読み込めなかったため、集計対象から除外しました。`
  );

  const preview = skipped.slice(0, 5);
  for (const item of preview) {
    const relativePath = path.relative(process.cwd(), item.filePath);
    console.warn(`  - ${relativePath}: ${item.reason}`);
  }

  if (skipped.length > preview.length) {
    console.warn(`  ...他 ${skipped.length - preview.length} 件`);
  }
};

const toIsoOrNull = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

const formatTimestamp = (value: string | null | undefined): string =>
  value ?? "-";

const levelPriority = (level: HealthIssueLevel) =>
  level === "error" ? 0 : 1;

const statusIcon = (issue: IssueAggregate) => {
  if (issue.active) {
    return issue.level === "error" ? "🟥" : "🟧";
  }
  if (issue.resolveCount > 0) {
    return "🟩";
  }
  return "⬜️";
};

const levelLabel = (level: HealthIssueLevel) =>
  level === "error" ? "エラー" : "警告";

const eventLabel = (entry: TimelineEntry) => {
  if (entry.kind === "resolve") {
    return "解消";
  }
  return entry.change === "created" ? "新規検知" : "内容更新";
};

const formatDetailValue = (value: unknown) => {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 120 ? `${json.slice(0, 117)}…` : json;
  } catch {
    return String(value);
  }
};

const formatDetails = (details: Record<string, unknown> | undefined) => {
  if (!details) {
    return null;
  }

  const entries = Object.entries(details);
  if (entries.length === 0) {
    return null;
  }

  const lines = entries.slice(0, 5).map(
    ([key, value]) => `${key}: ${formatDetailValue(value)}`
  );

  if (entries.length > 5) {
    lines.push(`…他 ${entries.length - 5} 件`);
  }

  return lines.join(" / ");
};

const aggregateHistory = (
  records: HealthHistoryRecordWithPath[]
): AggregationResult => {
  const issueMap = new Map<string, IssueAggregate>();
  const timeline: TimelineEntry[] = [];

  for (const entry of records) {
    const snapshot =
      entry.record.type === "report"
        ? entry.record.issue
        : entry.record.issue;
    const recordedAt = toIsoOrNull(entry.record.recorded_at);
    const detectedAt = toIsoOrNull(snapshot.detectedAt);
    const issueId = snapshot.id;

    let aggregate = issueMap.get(issueId);
    if (!aggregate) {
      aggregate = {
        id: issueId,
        level: snapshot.level,
        message: snapshot.message,
        firstRecordedAt: recordedAt,
        lastRecordedAt: recordedAt,
        firstDetectedAt: detectedAt,
        lastDetectedAt: detectedAt,
        active: true,
        lastEvent:
          entry.record.type === "report" ? entry.record.change : "resolved",
        reportCount: 0,
        createdCount: 0,
        updateCount: 0,
        resolveCount: 0,
        resolvedAt: null,
        lastFilePath: entry.filePath,
        history: [],
      };
      issueMap.set(issueId, aggregate);
    }

    if (!aggregate.firstRecordedAt && recordedAt) {
      aggregate.firstRecordedAt = recordedAt;
    }
    if (recordedAt) {
      aggregate.lastRecordedAt = recordedAt;
    }
    if (!aggregate.firstDetectedAt && detectedAt) {
      aggregate.firstDetectedAt = detectedAt;
    }
    if (detectedAt) {
      aggregate.lastDetectedAt = detectedAt;
    }

    aggregate.level = snapshot.level;
    aggregate.message = snapshot.message;
    aggregate.lastFilePath = entry.filePath;

    const timelineEntry: TimelineEntry = {
      issueId,
      kind: entry.record.type,
      change:
        entry.record.type === "report"
          ? entry.record.change
          : "resolved",
      recordedAt,
      filePath: entry.filePath,
      issue: snapshot,
      previous:
        entry.record.type === "report" ? entry.record.previous : null,
    };

    timeline.push(timelineEntry);
    aggregate.history.push(timelineEntry);

    if (entry.record.type === "report") {
      aggregate.reportCount += 1;
      if (entry.record.change === "created") {
        aggregate.createdCount += 1;
      } else {
        aggregate.updateCount += 1;
      }
      aggregate.lastEvent = entry.record.change;
      aggregate.active = true;
      aggregate.resolvedAt = null;
    } else {
      aggregate.resolveCount += 1;
      aggregate.lastEvent = "resolved";
      aggregate.active = false;
      if (recordedAt) {
        aggregate.resolvedAt = recordedAt;
      }
    }
  }

  const issues = Array.from(issueMap.values()).sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    const levelDiff = levelPriority(a.level) - levelPriority(b.level);
    if (levelDiff !== 0) {
      return levelDiff;
    }
    const aTime = a.lastRecordedAt ?? "";
    const bTime = b.lastRecordedAt ?? "";
    return bTime.localeCompare(aTime);
  });

  const timelineDescending = [...timeline].sort((a, b) => {
    const aKey = a.recordedAt ?? "";
    const bKey = b.recordedAt ?? "";
    return bKey.localeCompare(aKey);
  });

  return { issues, issueMap, timeline: timelineDescending };
};

const printIssueSummary = (issue: IssueAggregate) => {
  const icon = statusIcon(issue);
  const status = issue.active
    ? "未解消 (継続中)"
    : issue.resolveCount > 0
      ? `解消済み (${formatTimestamp(issue.resolvedAt)})`
      : "状態不明";
  const lastEventLabel =
    issue.lastEvent === "resolved"
      ? "解消"
      : issue.lastEvent === "created"
        ? "新規検知"
        : "内容更新";
  const fileLabel = issue.lastFilePath
    ? path.relative(process.cwd(), issue.lastFilePath)
    : "-";

  console.log(`${icon} ${issue.id}`);
  console.log(`  状態        : ${status}`);
  console.log(`  レベル      : ${levelLabel(issue.level)}`);
  console.log(`  初回検知    : ${formatTimestamp(issue.firstDetectedAt)}`);
  console.log(`  最新検知    : ${formatTimestamp(issue.lastDetectedAt)}`);
  console.log(`  最終イベント: ${lastEventLabel} (${formatTimestamp(issue.lastRecordedAt)})`);
  console.log(
    `  レポート数  : ${issue.reportCount} (新規 ${issue.createdCount} / 更新 ${issue.updateCount})`
  );
  console.log(`  解消回数    : ${issue.resolveCount}`);
  console.log(`  最終ファイル: ${fileLabel}`);
  console.log(`  メッセージ  : ${issue.message}`);
};

const runSummary = async () => {
  const { records, skipped } = await loadHealthHistoryRecords();
  reportSkippedFiles(skipped);

  if (records.length === 0) {
    console.log("ヘルス履歴はまだ記録されていません。");
    return;
  }

  const aggregation = aggregateHistory(records);
  if (aggregation.issues.length === 0) {
    console.log("解析対象となるヘルス履歴が見つかりませんでした。");
    return;
  }

  console.log(
    `ヘルスチェック履歴: ${aggregation.issues.length} 件の issue を集計しました。`
  );
  console.log("----------------------------------------");

  for (const issue of aggregation.issues) {
    printIssueSummary(issue);
    console.log("");
  }

  const activeCount = aggregation.issues.filter((issue) => issue.active).length;
  const resolvedCount =
    aggregation.issues.length - activeCount;

  console.log(
    `内訳: 継続中 ${activeCount} 件 / 解消済み ${resolvedCount} 件`
  );
};

const printUpdateDifferences = (entry: TimelineEntry) => {
  if (entry.kind !== "report" || entry.change !== "updated" || !entry.previous) {
    return;
  }

  const changes: string[] = [];
  if (entry.previous.level !== entry.issue.level) {
    changes.push(
      `レベル: ${levelLabel(entry.previous.level)} → ${levelLabel(entry.issue.level)}`
    );
  }
  if (entry.previous.message !== entry.issue.message) {
    changes.push("メッセージが更新されました。");
  }
  if (entry.previous.details && entry.issue.details) {
    const prevKeys = Object.keys(entry.previous.details);
    const nextKeys = Object.keys(entry.issue.details);
    if (prevKeys.length !== nextKeys.length) {
      changes.push("詳細フィールド数が変更されました。");
    }
  }

  if (changes.length > 0) {
    for (const change of changes) {
      console.log(`    変更      : ${change}`);
    }
  }
};

const printTimelineEntry = (entry: TimelineEntry) => {
  const recorded = formatTimestamp(entry.recordedAt);
  const label = eventLabel(entry);
  const fileLabel = path.relative(process.cwd(), entry.filePath);

  console.log(`- ${recorded} ${label}`);
  console.log(`    レベル    : ${levelLabel(entry.issue.level)}`);
  console.log(`    検知時刻  : ${formatTimestamp(entry.issue.detectedAt)}`);
  console.log(`    メッセージ: ${entry.issue.message}`);

  const details = formatDetails(entry.issue.details);
  if (details) {
    console.log(`    詳細      : ${details}`);
  }

  printUpdateDifferences(entry);
  console.log(`    履歴ファイル: ${fileLabel}`);
};

const runDetail = async (issueId: string | undefined) => {
  if (!issueId) {
    console.error("detail コマンドには issue-id の指定が必要です。");
    console.log(usage);
    exit(1);
  }

  const { records, skipped } = await loadHealthHistoryRecords();
  reportSkippedFiles(skipped);

  if (records.length === 0) {
    console.log("ヘルス履歴はまだ記録されていません。");
    exit(0);
  }

  const aggregation = aggregateHistory(records);
  const target = aggregation.issueMap.get(issueId);

  if (!target) {
    console.error(`指定された issue-id (${issueId}) の履歴は見つかりませんでした。`);
    if (aggregation.issues.length > 0) {
      console.log("利用可能な issue-id:");
      for (const issue of aggregation.issues.slice(0, 10)) {
        console.log(`  - ${issue.id}`);
      }
      if (aggregation.issues.length > 10) {
        console.log("  (他にも issue が存在します。summary コマンドを参照してください)");
      }
    }
    exit(1);
  }

  printIssueSummary(target);
  console.log("");
  console.log("タイムライン:");
  console.log("-------------");

  if (target.history.length === 0) {
    console.log("この issue の履歴イベントは記録されていません。");
    return;
  }

  for (const entry of target.history) {
    printTimelineEntry(entry);
    console.log("");
  }
};

const parseLimit = (args: string[], defaultValue: number) => {
  const index = args.indexOf("--limit");
  if (index === -1) {
    return defaultValue;
  }

  const raw = args[index + 1];
  if (!raw) {
    console.error("--limit オプションには数値を指定してください。");
    exit(1);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    console.error("--limit オプションは 1 以上の整数を指定してください。");
    exit(1);
  }

  return value;
};

const runTimeline = async (args: string[]) => {
  const limit = parseLimit(args, 20);
  const { records, skipped } = await loadHealthHistoryRecords();
  reportSkippedFiles(skipped);

  if (records.length === 0) {
    console.log("ヘルス履歴はまだ記録されていません。");
    return;
  }

  const aggregation = aggregateHistory(records);
  if (aggregation.timeline.length === 0) {
    console.log("ヘルスイベントの履歴が見つかりませんでした。");
    return;
  }

  console.log(`直近 ${Math.min(limit, aggregation.timeline.length)} 件のヘルスイベント:`);
  console.log("-------------");

  for (const entry of aggregation.timeline.slice(0, limit)) {
    const recorded = formatTimestamp(entry.recordedAt);
    const label = eventLabel(entry);
    const level = levelLabel(entry.issue.level);

    console.log(`- ${recorded} ${label} [${entry.issueId}] (${level})`);
    console.log(`    メッセージ: ${entry.issue.message}`);

    const details = formatDetails(entry.issue.details);
    if (details) {
      console.log(`    詳細      : ${details}`);
    }

    console.log(
      `    履歴ファイル: ${path.relative(process.cwd(), entry.filePath)}`
    );
    console.log("");
  }
};

const main = async () => {
  const command = process.argv[2] ?? "summary";
  const args = process.argv.slice(3);

  if (command === "summary") {
    await runSummary();
    return;
  }

  if (command === "detail") {
    await runDetail(args[0]);
    return;
  }

  if (command === "timeline") {
    await runTimeline(args);
    return;
  }

  if (command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  console.error(`不明なコマンドです: ${command}`);
  console.log(usage);
  exit(1);
};

main().catch((error) => {
  console.error("ヘルス履歴ダッシュボードの実行中にエラーが発生しました。", error);
  exit(1);
});
