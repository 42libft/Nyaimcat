"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEsclVersion = exports.runEsclXlsx = exports.runEsclCsv = void 0;
const child_process_1 = require("child_process");
const node_path_1 = __importDefault(require("node:path"));
const PYTHON_BIN = process.env.ESCL_PYTHON_BIN ??
    process.env.PYTHON ??
    process.env.PYTHON_BIN ??
    "python3";
const PROJECT_ROOT = node_path_1.default.resolve(__dirname, "../../..");
const parsePayload = (raw) => {
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`ESCL CLIからの出力を解析できませんでした: ${error.message}\n${raw}`);
    }
};
const runCli = async (args) => {
    return await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(PYTHON_BIN, ["-m", "src.esclbot.cli", ...args], {
            cwd: PROJECT_ROOT,
            env: process.env,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            reject(new Error(`ESCL CLIの起動に失敗しました (${error instanceof Error ? error.message : String(error)})`));
        });
        child.on("close", (code) => {
            if (!stdout.trim() && stderr.trim()) {
                reject(new Error(`ESCL CLIがエラー終了しました (code=${code}): ${stderr.trim()}`));
                return;
            }
            try {
                const payload = parsePayload(stdout.trim());
                if (!payload.ok) {
                    reject(new Error(payload.error));
                    return;
                }
                resolve(payload);
            }
            catch (error) {
                reject(error);
            }
        });
    });
};
const runEsclCsv = async (parentUrl, group) => {
    const payload = await runCli([
        "csv",
        parentUrl,
        ...(group ? ["--group", group] : []),
    ]);
    if (!("filename" in payload) || !("content" in payload)) {
        throw new Error("ESCL CLIから期待した応答が得られませんでした。");
    }
    return {
        filename: payload.filename,
        buffer: Buffer.from(payload.content, "base64"),
    };
};
exports.runEsclCsv = runEsclCsv;
const runEsclXlsx = async (parentUrl, group) => {
    const payload = await runCli([
        "xlsx",
        parentUrl,
        ...(group ? ["--group", group] : []),
    ]);
    if (!("filename" in payload) || !("content" in payload)) {
        throw new Error("ESCL CLIから期待した応答が得られませんでした。");
    }
    return {
        filename: payload.filename,
        buffer: Buffer.from(payload.content, "base64"),
    };
};
exports.runEsclXlsx = runEsclXlsx;
const runEsclVersion = async () => {
    const payload = await runCli(["version"]);
    if (!("version" in payload)) {
        throw new Error("ESCL CLIからバージョン情報が取得できませんでした。");
    }
    return payload.version;
};
exports.runEsclVersion = runEsclVersion;
//# sourceMappingURL=esclCli.js.map