"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordHealthIssueResolution = exports.recordHealthIssueReport = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../tasks/paths");
const logger_1 = require("../utils/logger");
const ensureHistoryDirectory = async () => {
    await fs_1.promises.mkdir(paths_1.HEALTH_HISTORY_DIR, { recursive: true });
};
const sanitizeForFilename = (value, fallback) => {
    const normalized = value.replace(/[^a-z0-9_-]/gi, "-");
    const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
    return collapsed.length > 0 ? collapsed : fallback;
};
const buildFilename = (issueId, suffix) => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const slug = sanitizeForFilename(issueId, "issue");
    return `${timestamp}-${slug}-${suffix}.json`;
};
const writeHistoryRecord = async (issueId, suffix, record) => {
    try {
        await ensureHistoryDirectory();
        const filename = buildFilename(issueId, suffix);
        const filePath = path_1.default.join(paths_1.HEALTH_HISTORY_DIR, filename);
        await fs_1.promises.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
    }
    catch (error) {
        logger_1.logger.warn("ヘルスチェック履歴の書き込みに失敗しました", {
            issueId,
            suffix,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
const recordHealthIssueReport = async (issue, context) => {
    const record = {
        type: "report",
        change: context.change,
        issue,
        previous: context.previous,
        recorded_at: new Date().toISOString(),
    };
    const suffix = `report-${context.change}`;
    await writeHistoryRecord(issue.id, suffix, record);
};
exports.recordHealthIssueReport = recordHealthIssueReport;
const recordHealthIssueResolution = async (issue) => {
    const record = {
        type: "resolve",
        issue,
        recorded_at: new Date().toISOString(),
    };
    await writeHistoryRecord(issue.id, "resolve", record);
};
exports.recordHealthIssueResolution = recordHealthIssueResolution;
//# sourceMappingURL=history.js.map