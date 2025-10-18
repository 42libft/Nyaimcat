"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHealthHistoryRecords = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../tasks/paths");
const logger_1 = require("../utils/logger");
const isReportRecord = (record) => record.type === "report";
const isResolutionRecord = (record) => record.type === "resolve";
const parseHistoryRecord = (filePath, content) => {
    let raw;
    try {
        raw = JSON.parse(content);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`JSON の解析に失敗しました: ${message}`);
    }
    if (!raw || typeof raw !== "object") {
        throw new Error("ヘルス履歴の JSON にオブジェクト形式のレコードが含まれていません。");
    }
    const parsed = raw;
    if (isReportRecord(parsed) || isResolutionRecord(parsed)) {
        return { filePath, record: parsed };
    }
    throw new Error("ヘルス履歴レコードの type フィールドが不正です。");
};
const readHistoryFile = async (fileName) => {
    const filePath = path_1.default.join(paths_1.HEALTH_HISTORY_DIR, fileName);
    try {
        const content = await fs_1.promises.readFile(filePath, "utf-8");
        const parsed = parseHistoryRecord(filePath, content);
        return { ok: true, value: parsed };
    }
    catch (error) {
        const code = error?.code;
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
const compareRecordedAt = (a, b) => {
    const getSortKey = (entry) => {
        const raw = entry.record.type === "report"
            ? entry.record.recorded_at ?? entry.record.issue.detectedAt
            : entry.record.recorded_at ?? entry.record.issue.detectedAt;
        const date = raw ? new Date(raw) : null;
        if (date && !Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
        return path_1.default.basename(entry.filePath);
    };
    return getSortKey(a).localeCompare(getSortKey(b));
};
const loadHealthHistoryRecords = async () => {
    let entries;
    try {
        entries = await fs_1.promises.readdir(paths_1.HEALTH_HISTORY_DIR);
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return { records: [], skipped: [] };
        }
        throw error;
    }
    const results = [];
    const skipped = [];
    for (const entry of entries) {
        if (!entry.toLowerCase().endsWith(".json")) {
            continue;
        }
        const record = await readHistoryFile(entry);
        if (record.ok) {
            results.push(record.value);
        }
        else {
            skipped.push({
                filePath: record.filePath,
                reason: record.reason,
            });
            logger_1.logger.warn("ヘルス履歴ファイルの読み込みをスキップしました", {
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
exports.loadHealthHistoryRecords = loadHealthHistoryRecords;
//# sourceMappingURL=historyReader.js.map