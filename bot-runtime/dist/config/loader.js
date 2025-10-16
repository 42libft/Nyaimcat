"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireConfig = exports.loadConfig = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const logger_1 = require("../utils/logger");
const zod_1 = require("zod");
const schema_1 = require("./schema");
const DEFAULT_CONFIG_PATH = path_1.default.resolve(process.cwd(), "config", "config.yaml");
const readFile = async (filePath) => {
    try {
        return await fs_1.promises.readFile(filePath, "utf-8");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`設定ファイルの読み込みに失敗しました: ${message}`);
    }
};
const parseYaml = (raw) => {
    try {
        return js_yaml_1.default.load(raw, { json: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`YAMLのパースに失敗しました: ${message}`);
    }
};
const validateConfig = (data) => schema_1.ConfigSchema.parse(data);
const loadConfig = async (customPath, options = {}) => {
    const filePath = customPath
        ? path_1.default.resolve(process.cwd(), customPath)
        : DEFAULT_CONFIG_PATH;
    const emitSuccessLog = options.logSuccess ?? true;
    const successLogLevel = options.successLogLevel ?? "info";
    try {
        const rawContent = await readFile(filePath);
        const rawConfig = parseYaml(rawContent);
        const config = validateConfig(rawConfig);
        if (emitSuccessLog) {
            const meta = { path: filePath };
            if (successLogLevel === "debug") {
                logger_1.logger.debug("設定ファイルを読み込みました", meta);
            }
            else {
                logger_1.logger.info("設定ファイルを読み込みました", meta);
            }
        }
        return { ok: true, path: filePath, config };
    }
    catch (error) {
        const isZodError = error instanceof zod_1.ZodError;
        const message = error instanceof Error ? error.message : String(error);
        const issues = isZodError ? error.issues : undefined;
        logger_1.logger.error("設定ファイルの読み込みに失敗しました", {
            path: filePath,
            message,
            issues,
        });
        const failure = {
            ok: false,
            path: filePath,
            message,
        };
        if (issues) {
            failure.issues = issues;
        }
        return failure;
    }
};
exports.loadConfig = loadConfig;
const requireConfig = async (customPath) => {
    const result = await (0, exports.loadConfig)(customPath);
    if (!result.ok) {
        throw new Error(result.message);
    }
    return result.config;
};
exports.requireConfig = requireConfig;
//# sourceMappingURL=loader.js.map