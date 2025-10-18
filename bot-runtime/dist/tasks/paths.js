"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEALTH_HISTORY_DIR = exports.RUN_FAILURE_DIR = exports.RUN_HISTORY_DIR = exports.INBOX_DIR = exports.TASKS_ROOT = exports.REPO_ROOT = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const TASKS_DIR_NAME = "tasks";
const resolveRepoRoot = () => {
    const candidates = [
        process.cwd(),
        path_1.default.resolve(process.cwd(), ".."),
        __dirname,
        path_1.default.resolve(__dirname, ".."),
        path_1.default.resolve(__dirname, "..", ".."),
        path_1.default.resolve(__dirname, "..", "..", ".."),
        path_1.default.resolve(__dirname, "..", "..", "..", ".."),
    ];
    const visited = new Set();
    for (const candidate of candidates) {
        const normalized = path_1.default.resolve(candidate);
        if (visited.has(normalized)) {
            continue;
        }
        visited.add(normalized);
        const tasksPath = path_1.default.join(normalized, TASKS_DIR_NAME);
        if ((0, fs_1.existsSync)(tasksPath)) {
            return normalized;
        }
    }
    const repoFallback = path_1.default.resolve(__dirname, "..", "..", "..");
    return repoFallback;
};
exports.REPO_ROOT = resolveRepoRoot();
exports.TASKS_ROOT = path_1.default.join(exports.REPO_ROOT, TASKS_DIR_NAME);
exports.INBOX_DIR = path_1.default.join(exports.TASKS_ROOT, "inbox");
exports.RUN_HISTORY_DIR = path_1.default.join(exports.TASKS_ROOT, "runs");
exports.RUN_FAILURE_DIR = path_1.default.join(exports.RUN_HISTORY_DIR, "failures");
exports.HEALTH_HISTORY_DIR = path_1.default.join(exports.RUN_HISTORY_DIR, "health");
//# sourceMappingURL=paths.js.map