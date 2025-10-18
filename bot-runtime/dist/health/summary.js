"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectHealthIssueSummary = void 0;
const registry_1 = require("./registry");
const formatTimestamp = (value) => {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toISOString();
};
const formatIssueLine = (issue) => {
    const prefix = issue.level === "error" ? "🛑" : "⚠️";
    const detected = formatTimestamp(issue.detectedAt);
    return `${prefix} ${issue.message} (検知: ${detected})`;
};
const collectHealthIssueSummary = (limit = 3) => {
    const issues = registry_1.healthRegistry.list();
    if (issues.length === 0) {
        return {
            total: 0,
            lines: [],
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
exports.collectHealthIssueSummary = collectHealthIssueSummary;
//# sourceMappingURL=summary.js.map