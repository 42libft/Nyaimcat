"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffGitStatusEntries = exports.getGitStatusEntries = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const parseStatusTokens = (output) => {
    if (!output) {
        return [];
    }
    const tokens = output.split("\0");
    const entries = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) {
            continue;
        }
        if (token.length < 3) {
            continue;
        }
        const status = token.slice(0, 2);
        const separator = token[2];
        if (separator !== " ") {
            continue;
        }
        let path = token.slice(3);
        let originalPath;
        if ((status.startsWith("R") || status.startsWith("C")) &&
            index + 1 < tokens.length) {
            originalPath = path;
            path = tokens[index + 1] ?? path;
            index++;
        }
        const entry = {
            path,
            status,
        };
        if (originalPath !== undefined) {
            entry.originalPath = originalPath ?? null;
        }
        entries.push(entry);
    }
    return entries;
};
const getGitStatusEntries = async (cwd) => {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "-z"], {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
    });
    return parseStatusTokens(stdout ?? "");
};
exports.getGitStatusEntries = getGitStatusEntries;
const diffGitStatusEntries = (before, after) => {
    if (before.length === 0) {
        return after.slice();
    }
    const beforeMap = new Map(before.map((entry) => [entry.path, entry]));
    const diff = [];
    for (const entry of after) {
        const previous = beforeMap.get(entry.path);
        if (!previous) {
            diff.push(entry);
            continue;
        }
        if (previous.status !== entry.status ||
            previous.originalPath !== entry.originalPath) {
            diff.push(entry);
        }
    }
    return diff;
};
exports.diffGitStatusEntries = diffGitStatusEntries;
//# sourceMappingURL=gitStatus.js.map