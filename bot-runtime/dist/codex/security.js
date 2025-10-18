"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceCodexCliSafety = exports.getCodexCliSafetyConfig = exports.loadCodexCliSafetyConfig = void 0;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../tasks/paths");
const DEFAULT_ALLOWED_BINARIES = ["codex"];
const DEFAULT_ALLOWED_SUBCOMMANDS = ["", "exec"];
const DEFAULT_PATH_OPTION_NAMES = [
    "--plan",
    "--plans",
    "--task",
    "--tasks",
    "--docs",
    "--docs-path",
    "--docs-dir",
    "--workspace",
    "--workdir",
    "--cwd",
    "--root",
    "--repo",
    "--output",
    "--out",
];
const DEFAULT_PATH_OPTION_PATTERNS = [
    /^--?[a-z0-9-]*path$/i,
    /^--?[a-z0-9-]*paths$/i,
    /^--?[a-z0-9-]*dir$/i,
    /^--?[a-z0-9-]*dirs$/i,
    /^--?[a-z0-9-]*file$/i,
    /^--?[a-z0-9-]*files$/i,
    /^--?[a-z0-9-]*root$/i,
    /^--?[a-z0-9-]*roots$/i,
];
const splitList = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
};
const normalizeOptionName = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed === "--") {
        return trimmed;
    }
    if (trimmed.startsWith("-")) {
        return trimmed.toLowerCase();
    }
    return `--${trimmed.toLowerCase()}`;
};
const expandHome = (value) => {
    if (!value.startsWith("~")) {
        return value;
    }
    if (value === "~") {
        return os_1.default.homedir();
    }
    if (value.startsWith("~/")) {
        return path_1.default.join(os_1.default.homedir(), value.slice(2));
    }
    return value;
};
const resolvePathAgainstRepo = (value) => {
    const expanded = expandHome(value);
    if (path_1.default.isAbsolute(expanded)) {
        return path_1.default.resolve(expanded);
    }
    return path_1.default.resolve(paths_1.REPO_ROOT, expanded);
};
const unique = (values) => {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }
    return result;
};
const loadCodexCliSafetyConfig = (env = process.env) => {
    const allowedBinEntries = splitList(env.CODEX_CLI_ALLOWED_BINARIES);
    const allowedBinBasenames = new Set();
    const allowedBinPaths = new Set();
    const entries = allowedBinEntries.length > 0 ? allowedBinEntries : DEFAULT_ALLOWED_BINARIES;
    for (const entry of entries) {
        const trimmed = entry.trim();
        if (!trimmed) {
            continue;
        }
        if (trimmed.includes(path_1.default.sep) || trimmed.includes("/")) {
            const resolved = resolvePathAgainstRepo(trimmed);
            allowedBinPaths.add(resolved);
            allowedBinBasenames.add(path_1.default.basename(trimmed));
        }
        else {
            allowedBinBasenames.add(trimmed);
        }
    }
    const workdirEntries = splitList(env.CODEX_CLI_ALLOWED_WORKDIRS);
    const allowedWorkdirs = workdirEntries.length > 0
        ? unique(workdirEntries.map(resolvePathAgainstRepo))
        : [path_1.default.resolve(paths_1.REPO_ROOT)];
    const pathEntries = splitList(env.CODEX_CLI_ALLOWED_PATHS);
    const allowedPathRoots = pathEntries.length > 0
        ? unique(pathEntries.map(resolvePathAgainstRepo))
        : [...allowedWorkdirs];
    const subcommandEntries = splitList(env.CODEX_CLI_ALLOWED_SUBCOMMANDS);
    const allowedSubcommands = new Set((subcommandEntries.length > 0
        ? subcommandEntries
        : DEFAULT_ALLOWED_SUBCOMMANDS)
        .map((item) => item.toLowerCase())
        .map((item) => item.trim()));
    const blockedFlagEntries = splitList(env.CODEX_CLI_BLOCKED_FLAGS);
    const blockedFlags = new Set(blockedFlagEntries.map((item) => normalizeOptionName(item)));
    const pathOptionNameEntries = splitList(env.CODEX_CLI_PATH_OPTION_NAMES);
    const pathOptionNames = new Set([
        ...DEFAULT_PATH_OPTION_NAMES,
        ...pathOptionNameEntries,
    ].map((item) => normalizeOptionName(item)));
    const customPatternEntries = splitList(env.CODEX_CLI_PATH_OPTION_PATTERNS);
    const customPatterns = customPatternEntries
        .map((pattern) => {
        try {
            return new RegExp(pattern, "i");
        }
        catch {
            return null;
        }
    })
        .filter((item) => item instanceof RegExp);
    const pathOptionPatterns = [...DEFAULT_PATH_OPTION_PATTERNS, ...customPatterns];
    return {
        allowedBinBasenames,
        allowedBinPaths,
        allowedWorkdirs,
        allowedPathRoots,
        allowedSubcommands,
        blockedFlags,
        pathOptionNames,
        pathOptionPatterns,
    };
};
exports.loadCodexCliSafetyConfig = loadCodexCliSafetyConfig;
let cachedConfig = null;
const getCodexCliSafetyConfig = () => {
    if (!cachedConfig) {
        cachedConfig = (0, exports.loadCodexCliSafetyConfig)();
    }
    return cachedConfig;
};
exports.getCodexCliSafetyConfig = getCodexCliSafetyConfig;
const isSubPathOf = (target, root) => {
    const relative = path_1.default.relative(root, target);
    return relative === "" || (!relative.startsWith("..") && !path_1.default.isAbsolute(relative));
};
const ensureAllowedWorkdir = (cwd, config) => {
    const resolved = path_1.default.resolve(cwd);
    const ok = config.allowedWorkdirs.some((root) => isSubPathOf(resolved, root));
    if (!ok) {
        throw new Error(`Codex CLI の作業ディレクトリ「${resolved}」は許可範囲外です。環境変数 CODEX_CLI_ALLOWED_WORKDIRS を確認してください。`);
    }
    return resolved;
};
const ensureAllowedBin = (bin, cwd, config) => {
    const trimmed = bin.trim();
    if (trimmed.length === 0) {
        throw new Error("Codex CLI の実行バイナリが指定されていません。");
    }
    const baseName = path_1.default.basename(trimmed);
    if (config.allowedBinBasenames.has(trimmed) || config.allowedBinBasenames.has(baseName)) {
        return trimmed;
    }
    const resolvedCandidate = trimmed.includes(path_1.default.sep)
        ? path_1.default.resolve(cwd, trimmed)
        : path_1.default.isAbsolute(trimmed)
            ? path_1.default.resolve(trimmed)
            : null;
    if (resolvedCandidate && config.allowedBinPaths.has(resolvedCandidate)) {
        return resolvedCandidate;
    }
    if (config.allowedBinBasenames.size === 0 && config.allowedBinPaths.size === 0) {
        throw new Error("Codex CLI の許可バイナリが設定されていません。CODEX_CLI_ALLOWED_BINARIES を確認してください。");
    }
    throw new Error(`Codex CLI の実行バイナリ「${trimmed}」は許可リスト外です。環境変数 CODEX_CLI_ALLOWED_BINARIES を更新してください。`);
};
const getSubcommand = (args) => {
    for (const arg of args) {
        if (!arg) {
            continue;
        }
        if (arg === "--") {
            break;
        }
        if (!arg.startsWith("-")) {
            return arg;
        }
    }
    return "";
};
const parseOptionToken = (token) => {
    if (!token.startsWith("-") || token === "-") {
        return null;
    }
    if (token === "--") {
        return { name: token, value: null };
    }
    const equalIndex = token.indexOf("=");
    if (equalIndex === -1) {
        return { name: token, value: null };
    }
    const name = token.slice(0, equalIndex);
    const value = token.slice(equalIndex + 1);
    return { name, value };
};
const shouldCheckPathOption = (optionName, config) => {
    if (config.pathOptionNames.has(optionName)) {
        return true;
    }
    return config.pathOptionPatterns.some((pattern) => pattern.test(optionName));
};
const resolvePathCandidate = (value, cwd) => {
    const expanded = expandHome(value.trim());
    if (expanded.length === 0) {
        return expanded;
    }
    if (path_1.default.isAbsolute(expanded)) {
        return path_1.default.resolve(expanded);
    }
    return path_1.default.resolve(cwd, expanded);
};
const ensurePathWithinRoots = (value, label, cwd, config) => {
    if (value.length === 0) {
        throw new Error(`Codex CLI オプション「${label}」には空の値を指定できません。`);
    }
    const resolved = resolvePathCandidate(value, cwd);
    const ok = config.allowedPathRoots.some((root) => isSubPathOf(resolved, root));
    if (!ok) {
        throw new Error(`Codex CLI オプション「${label}」に指定されたパス「${resolved}」は許可範囲外です。CODEX_CLI_ALLOWED_PATHS を確認してください。`);
    }
};
const enforceCodexCliSafety = (command, config = (0, exports.getCodexCliSafetyConfig)()) => {
    const originalArgs = Array.isArray(command.args) ? [...command.args] : [];
    const sanitizedCwd = ensureAllowedWorkdir(command.cwd, config);
    const sanitizedBin = ensureAllowedBin(command.bin, sanitizedCwd, config);
    const subcommand = getSubcommand(originalArgs);
    const normalizedSubcommand = subcommand.toLowerCase();
    if (!config.allowedSubcommands.has(normalizedSubcommand)) {
        const label = subcommand ? `"${subcommand}"` : "(指定なし)";
        throw new Error(`Codex CLI のサブコマンド ${label} は許可されていません。CODEX_CLI_ALLOWED_SUBCOMMANDS を確認してください。`);
    }
    for (let index = 0; index < originalArgs.length; index++) {
        const token = originalArgs[index];
        if (token === "--") {
            break;
        }
        const option = parseOptionToken(token);
        if (!option) {
            continue;
        }
        const normalizedName = normalizeOptionName(option.name);
        if (config.blockedFlags.has(normalizedName)) {
            throw new Error(`Codex CLI オプション「${option.name}」はセキュリティ方針により無効化されています。`);
        }
        if (!shouldCheckPathOption(normalizedName, config)) {
            continue;
        }
        let value = option.value;
        let consumedNext = false;
        if (value === null || value.length === 0) {
            const nextToken = originalArgs[index + 1];
            if (!nextToken || nextToken.startsWith("-")) {
                throw new Error(`Codex CLI オプション「${option.name}」にはパスの値が必要です。`);
            }
            value = nextToken;
            consumedNext = true;
        }
        ensurePathWithinRoots(value, option.name, sanitizedCwd, config);
        if (consumedNext) {
            index++;
        }
    }
    return {
        bin: sanitizedBin,
        args: originalArgs,
        cwd: sanitizedCwd,
    };
};
exports.enforceCodexCliSafety = enforceCodexCliSafety;
//# sourceMappingURL=security.js.map