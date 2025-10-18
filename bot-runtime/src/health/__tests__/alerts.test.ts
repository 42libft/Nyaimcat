import test from "node:test";
import assert from "node:assert/strict";
import type { APIEmbed } from "discord.js";

import {
  initializeHealthAlerts,
  __setDiscordActionsFactoryForTesting,
  __setHealthHistoryRecordersForTesting,
  __resetHealthAlertsTestingState,
} from "../alerts";
import {
  healthRegistry,
  type HealthIssue,
  type HealthIssueChangeContext,
} from "../registry";

type PublishedMessage = {
  channelId: string;
  payload: {
    content?: string;
    embeds?: APIEmbed[];
  };
};

const clearRegistry = () => {
  for (const issue of healthRegistry.list()) {
    healthRegistry.resolve(issue.id);
  }
};

const waitForAsyncTasks = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const resetEnv = () => {
  delete process.env.CODEX_DISCORD_HEALTH_ALERT_CHANNEL;
  delete process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL;
  delete process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL;
  delete process.env.CODEX_DISCORD_NOTIFY_CHANNEL;
};

test.afterEach(() => {
  __resetHealthAlertsTestingState();
  clearRegistry();
  resetEnv();
});

test("新規ヘルス警告を検出した際に通知と履歴記録を実行する", async () => {
  process.env.CODEX_DISCORD_NOTIFY_CHANNEL = "channel-1";

  const reports: {
    issue: HealthIssue;
    context: HealthIssueChangeContext;
  }[] = [];
  const published: PublishedMessage[] = [];

  __setHealthHistoryRecordersForTesting({
    recordReport: async (issue, context) => {
      reports.push({ issue, context });
    },
  });

  __setDiscordActionsFactoryForTesting(() => ({
    publishMessage: async (channelId, payload) => {
      published.push({ channelId, payload });
    },
  }));

  const cleanup = initializeHealthAlerts();

  const issue: HealthIssue = {
    id: "queue-failure",
    level: "error",
    message: "Codex 実行キューが停止しました",
    detectedAt: "2024-01-05T12:34:56.000Z",
    details: { reason: "timeout" },
  };

  healthRegistry.report(issue);
  await waitForAsyncTasks();

  assert.strictEqual(reports.length, 1);
  const recordedReport = reports[0]!;
  assert.strictEqual(recordedReport.context.change, "created");
  assert.strictEqual(recordedReport.context.previous, null);

  assert.strictEqual(published.length, 1);
  const reportMessage = published[0]!;
  assert.strictEqual(reportMessage.channelId, "channel-1");
  assert.ok(
    reportMessage.payload.content?.includes("ヘルスチェック警告を検出しました")
  );

  const embed = reportMessage.payload.embeds?.[0];
  assert.ok(embed, "通知には少なくとも 1 件の Embed が含まれるべきです");
  const reportEmbed = embed!;
  assert.strictEqual(reportEmbed.description, issue.message);

  const summaryField = reportEmbed.fields?.find(
    (field) => field.name === "現在のヘルス警告"
  );
  assert.ok(summaryField);
  const reportSummaryField = summaryField!;
  assert.ok(reportSummaryField.value?.includes(issue.message));

  cleanup();
});

test("ヘルス警告の解消時に通知と履歴記録を実行する", async () => {
  process.env.CODEX_DISCORD_NOTIFY_CHANNEL = "channel-2";

  const resolutions: HealthIssue[] = [];
  const published: PublishedMessage[] = [];

  __setHealthHistoryRecordersForTesting({
    recordReport: async () => undefined,
    recordResolution: async (issue) => {
      resolutions.push(issue);
    },
  });

  __setDiscordActionsFactoryForTesting(() => ({
    publishMessage: async (channelId, payload) => {
      published.push({ channelId, payload });
    },
  }));

  const cleanup = initializeHealthAlerts();

  const issue: HealthIssue = {
    id: "queue-recovered",
    level: "warning",
    message: "Codex 実行キューの一時的な遅延を検知しました",
    detectedAt: "2024-01-06T09:30:00.000Z",
  };

  healthRegistry.report(issue);
  await waitForAsyncTasks();

  healthRegistry.resolve(issue.id);
  await waitForAsyncTasks();

  assert.strictEqual(resolutions.length, 1);
  const resolvedIssue = resolutions[0]!;
  assert.strictEqual(resolvedIssue.id, issue.id);

  assert.strictEqual(published.length, 2);
  const resolutionMessage = published[1]!;
  assert.strictEqual(resolutionMessage.channelId, "channel-2");
  assert.ok(
    resolutionMessage.payload.content?.includes("ヘルスチェック警告が解消されました")
  );

  const embed = resolutionMessage.payload.embeds?.[0];
  assert.ok(embed);
  const resolutionEmbed = embed!;
  const remainingField = resolutionEmbed.fields?.find(
    (field) => field.name === "残りのヘルス警告"
  );
  assert.ok(remainingField);
  const resolutionSummary = remainingField!;
  assert.ok(
    resolutionSummary.value?.includes("残りのヘルス警告はありません。")
  );

  cleanup();
});
