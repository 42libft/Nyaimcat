"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const alerts_1 = require("../alerts");
const registry_1 = require("../registry");
const clearRegistry = () => {
    for (const issue of registry_1.healthRegistry.list()) {
        registry_1.healthRegistry.resolve(issue.id);
    }
};
const waitForAsyncTasks = () => new Promise((resolve) => {
    setImmediate(resolve);
});
const resetEnv = () => {
    delete process.env.CODEX_DISCORD_HEALTH_ALERT_CHANNEL;
    delete process.env.CODEX_DISCORD_FAILURE_ALERT_CHANNEL;
    delete process.env.CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL;
    delete process.env.CODEX_DISCORD_NOTIFY_CHANNEL;
};
node_test_1.default.afterEach(() => {
    (0, alerts_1.__resetHealthAlertsTestingState)();
    clearRegistry();
    resetEnv();
});
(0, node_test_1.default)("新規ヘルス警告を検出した際に通知と履歴記録を実行する", async () => {
    process.env.CODEX_DISCORD_NOTIFY_CHANNEL = "channel-1";
    const reports = [];
    const published = [];
    (0, alerts_1.__setHealthHistoryRecordersForTesting)({
        recordReport: async (issue, context) => {
            reports.push({ issue, context });
        },
    });
    (0, alerts_1.__setDiscordActionsFactoryForTesting)(() => ({
        publishMessage: async (channelId, payload) => {
            published.push({ channelId, payload });
        },
    }));
    const cleanup = (0, alerts_1.initializeHealthAlerts)();
    const issue = {
        id: "queue-failure",
        level: "error",
        message: "Codex 実行キューが停止しました",
        detectedAt: "2024-01-05T12:34:56.000Z",
        details: { reason: "timeout" },
    };
    registry_1.healthRegistry.report(issue);
    await waitForAsyncTasks();
    strict_1.default.strictEqual(reports.length, 1);
    const recordedReport = reports[0];
    strict_1.default.strictEqual(recordedReport.context.change, "created");
    strict_1.default.strictEqual(recordedReport.context.previous, null);
    strict_1.default.strictEqual(published.length, 1);
    const reportMessage = published[0];
    strict_1.default.strictEqual(reportMessage.channelId, "channel-1");
    strict_1.default.ok(reportMessage.payload.content?.includes("ヘルスチェック警告を検出しました"));
    const embed = reportMessage.payload.embeds?.[0];
    strict_1.default.ok(embed, "通知には少なくとも 1 件の Embed が含まれるべきです");
    const reportEmbed = embed;
    strict_1.default.strictEqual(reportEmbed.description, issue.message);
    const summaryField = reportEmbed.fields?.find((field) => field.name === "現在のヘルス警告");
    strict_1.default.ok(summaryField);
    const reportSummaryField = summaryField;
    strict_1.default.ok(reportSummaryField.value?.includes(issue.message));
    cleanup();
});
(0, node_test_1.default)("ヘルス警告の解消時に通知と履歴記録を実行する", async () => {
    process.env.CODEX_DISCORD_NOTIFY_CHANNEL = "channel-2";
    const resolutions = [];
    const published = [];
    (0, alerts_1.__setHealthHistoryRecordersForTesting)({
        recordReport: async () => undefined,
        recordResolution: async (issue) => {
            resolutions.push(issue);
        },
    });
    (0, alerts_1.__setDiscordActionsFactoryForTesting)(() => ({
        publishMessage: async (channelId, payload) => {
            published.push({ channelId, payload });
        },
    }));
    const cleanup = (0, alerts_1.initializeHealthAlerts)();
    const issue = {
        id: "queue-recovered",
        level: "warning",
        message: "Codex 実行キューの一時的な遅延を検知しました",
        detectedAt: "2024-01-06T09:30:00.000Z",
    };
    registry_1.healthRegistry.report(issue);
    await waitForAsyncTasks();
    registry_1.healthRegistry.resolve(issue.id);
    await waitForAsyncTasks();
    strict_1.default.strictEqual(resolutions.length, 1);
    const resolvedIssue = resolutions[0];
    strict_1.default.strictEqual(resolvedIssue.id, issue.id);
    strict_1.default.strictEqual(published.length, 2);
    const resolutionMessage = published[1];
    strict_1.default.strictEqual(resolutionMessage.channelId, "channel-2");
    strict_1.default.ok(resolutionMessage.payload.content?.includes("ヘルスチェック警告が解消されました"));
    const embed = resolutionMessage.payload.embeds?.[0];
    strict_1.default.ok(embed);
    const resolutionEmbed = embed;
    const remainingField = resolutionEmbed.fields?.find((field) => field.name === "残りのヘルス警告");
    strict_1.default.ok(remainingField);
    const resolutionSummary = remainingField;
    strict_1.default.ok(resolutionSummary.value?.includes("残りのヘルス警告はありません。"));
    cleanup();
});
//# sourceMappingURL=alerts.test.js.map