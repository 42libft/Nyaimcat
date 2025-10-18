"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const summary_1 = require("../summary");
const registry_1 = require("../registry");
const clearRegistry = () => {
    for (const issue of registry_1.healthRegistry.list()) {
        registry_1.healthRegistry.resolve(issue.id);
    }
};
(0, node_test_1.default)("collectHealthIssueSummary returns empty result when no issues are registered", (t) => {
    t.after(clearRegistry);
    clearRegistry();
    const result = (0, summary_1.collectHealthIssueSummary)();
    strict_1.default.strictEqual(result.total, 0);
    strict_1.default.deepStrictEqual(result.lines, []);
});
(0, node_test_1.default)("collectHealthIssueSummary sorts issues and respects the limit", (t) => {
    t.after(clearRegistry);
    clearRegistry();
    const base = Date.parse("2024-01-01T00:00:00.000Z");
    const issueInputs = [
        {
            id: "warn-1",
            level: "warning",
            message: "Disk usage exceeds 70%",
            detectedAt: new Date(base + 1000).toISOString(),
        },
        {
            id: "error-1",
            level: "error",
            message: "Codex queue worker crashed",
            detectedAt: new Date(base + 2000).toISOString(),
        },
        {
            id: "warn-2",
            level: "warning",
            message: "Pending runs exceed threshold",
            detectedAt: new Date(base + 3000).toISOString(),
        },
        {
            id: "error-2",
            level: "error",
            message: "Discord API rate limit hit",
            detectedAt: new Date(base + 4000).toISOString(),
        },
    ];
    issueInputs.forEach((issue) => {
        registry_1.healthRegistry.report(issue);
    });
    const result = (0, summary_1.collectHealthIssueSummary)(3);
    strict_1.default.strictEqual(result.total, issueInputs.length);
    strict_1.default.strictEqual(result.lines.length, 4);
    const firstLine = result.lines[0];
    const secondLine = result.lines[1];
    const thirdLine = result.lines[2];
    const overflowFromFullLimit = result.lines[3];
    strict_1.default.ok(firstLine.startsWith("🛑 Codex queue worker crashed"));
    strict_1.default.ok(secondLine.startsWith("🛑 Discord API rate limit hit"), "second line should contain the remaining error issue");
    strict_1.default.ok(thirdLine.startsWith("⚠️ Disk usage exceeds 70%"));
    strict_1.default.ok(overflowFromFullLimit.startsWith("…他 1 件のヘルス警告があります。"));
    const extended = (0, summary_1.collectHealthIssueSummary)(2);
    strict_1.default.strictEqual(extended.lines.length, 3);
    const overflowLine = extended.lines[2];
    strict_1.default.ok(overflowLine.startsWith("…他 2 件のヘルス警告があります。"));
});
//# sourceMappingURL=summary.test.js.map