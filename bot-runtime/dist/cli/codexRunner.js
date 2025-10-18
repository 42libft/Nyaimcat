#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process_1 = require("process");
const promises_1 = require("readline/promises");
const task_1 = require("../discord/commands/task");
const inbox_1 = require("../tasks/inbox");
const runner_1 = require("../codex/runner");
const notifications_1 = require("../codex/notifications");
const docUpdates_1 = require("../codex/docUpdates");
const settings_1 = require("../codex/settings");
const usage = `Codex CLI ランナー

使用方法:
  npm run codex-runner -- list
  npm run codex-runner -- config
  npm run codex-runner -- run <filename> [--notify <channelId>] [--no-notify] [--history|--no-history] [--stdout-limit <n>] [--stderr-limit <n>] [--update-docs|--no-update-docs]
  npm run codex-runner -- pick [--notify <channelId>] [--no-notify] [--history|--no-history] [--stdout-limit <n>] [--stderr-limit <n>] [--update-docs|--no-update-docs]
`;
const logError = (message) => {
    console.error(`\u26a0\ufe0f ${message}`);
};
const logInfo = (message) => {
    console.log(`\u2139\ufe0f ${message}`);
};
const logWarn = (message) => {
    console.warn(`\u26a0\ufe0f ${message}`);
};
const formatPriority = (priority) => task_1.PRIORITY_LABELS[priority] ?? priority;
const printTaskList = async (withIndex = false) => {
    const tasks = await (0, inbox_1.listTaskFiles)();
    if (tasks.length === 0) {
        logInfo("Inbox に登録されたタスクはありません。");
        return tasks;
    }
    console.log(`Inbox に ${tasks.length} 件のタスクが見つかりました。`);
    console.log("----------------------------------------");
    tasks.forEach((task, index) => {
        const createdAt = task.metadata.created_at ?? "(日時未記録)";
        const summary = task.metadata.summary?.replace(/\s+/g, " ") ?? "(概要未入力)";
        const prefix = withIndex ? `[${index + 1}] ` : "- ";
        console.log(`${prefix}${task.filename}`);
        console.log(`  タイトル : ${task.metadata.title}`);
        console.log(`  優先度   : ${formatPriority(task.metadata.priority)}`);
        console.log(`  受付日時 : ${createdAt}`);
        console.log(`  概要     : ${summary.slice(0, 120)}`);
        console.log("");
    });
    return tasks;
};
const parseRunnerOptions = (args) => {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case "--notify":
            case "--notify-channel": {
                const value = args[i + 1];
                if (value) {
                    options.notifyChannel = value;
                    i++;
                }
                else {
                    logWarn("--notify にはチャンネル ID の指定が必要です。");
                }
                break;
            }
            case "--no-notify":
                options.notifyChannel = null;
                break;
            case "--no-history":
                options.recordHistory = false;
                break;
            case "--history":
                options.recordHistory = true;
                break;
            case "--stdout-limit": {
                const value = Number.parseInt(args[i + 1] ?? "", 10);
                if (Number.isFinite(value)) {
                    options.stdoutLimit = value;
                }
                else {
                    logWarn("--stdout-limit には数値を指定してください。");
                }
                i++;
                break;
            }
            case "--stderr-limit": {
                const value = Number.parseInt(args[i + 1] ?? "", 10);
                if (Number.isFinite(value)) {
                    options.stderrLimit = value;
                }
                else {
                    logWarn("--stderr-limit には数値を指定してください。");
                }
                i++;
                break;
            }
            case "--update-docs":
                options.updateDocs = true;
                break;
            case "--no-update-docs":
                options.updateDocs = false;
                break;
            default:
                logWarn(`不明なオプションをスキップします: ${arg}`);
                break;
        }
    }
    return options;
};
const runTask = async (filename, options) => {
    if (!filename || filename.trim().length === 0) {
        logError("run コマンドにはファイル名が必要です。");
        return 1;
    }
    try {
        const runnerOptions = {
            hooks: {
                onStdout: (chunk) => {
                    process_1.stdout.write(chunk);
                },
                onStderr: (chunk) => {
                    process_1.stderr.write(chunk);
                },
            },
        };
        if (typeof options.recordHistory === "boolean") {
            runnerOptions.recordHistory = options.recordHistory;
        }
        const result = await (0, runner_1.runCodexTask)(filename, runnerOptions);
        console.log("");
        console.log("----------------------------------------");
        console.log("Codex CLI 実行結果");
        console.log(`  実行 ID  : ${result.runId}`);
        console.log(`  ファイル : ${result.task.filename}`);
        console.log(`  終了コード: ${result.exitCode ?? "(null)"}`);
        console.log(`  シグナル : ${result.signal ?? "(none)"}`);
        console.log(`  所要時間 : ${result.durationMs} ms`);
        console.log(`  タイムアウト: ${result.timedOut ? "はい" : "いいえ"}`);
        if (result.historyPath) {
            console.log(`  履歴保存先: ${result.historyPath}`);
        }
        else {
            console.log("  履歴保存先: (未保存)");
        }
        if (result.fileChanges.length > 0) {
            console.log("  変更ファイル:");
            for (const change of result.fileChanges) {
                const label = change.status.trim() || "?";
                if (change.originalPath && change.originalPath !== change.path) {
                    console.log(`    - ${label} ${change.originalPath} -> ${change.path}`);
                }
                else {
                    console.log(`    - ${label} ${change.path}`);
                }
            }
        }
        else {
            console.log("  変更ファイル: (なし)");
        }
        const notifyOptions = {};
        if (options.notifyChannel !== undefined) {
            notifyOptions.channelId = options.notifyChannel;
        }
        if (typeof options.stdoutLimit === "number") {
            notifyOptions.stdoutLimit = options.stdoutLimit;
        }
        if (typeof options.stderrLimit === "number") {
            notifyOptions.stderrLimit = options.stderrLimit;
        }
        await (0, notifications_1.notifyRunResult)(result, notifyOptions);
        const updateDocsDefault = (0, settings_1.isDocsUpdateEnabledByDefault)();
        const shouldUpdateDocs = typeof options.updateDocs === "boolean" ? options.updateDocs : updateDocsDefault;
        if (shouldUpdateDocs) {
            try {
                await (0, docUpdates_1.updateDocumentsForRun)(result);
                logInfo("docs/plans.md および docs/task.md を更新しました。");
            }
            catch (error) {
                logWarn(`ドキュメント更新に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (result.timedOut) {
            return 124;
        }
        if (typeof result.exitCode === "number") {
            return result.exitCode;
        }
        if (result.signal) {
            return 1;
        }
        return 0;
    }
    catch (error) {
        logError(error instanceof Error
            ? error.message
            : "Codex CLI 実行中に不明なエラーが発生しました。");
        return 1;
    }
};
const runPick = async (options) => {
    const tasks = await printTaskList(true);
    if (tasks.length === 0) {
        return 0;
    }
    const rl = (0, promises_1.createInterface)({
        input: process_1.stdin,
        output: process_1.stdout,
    });
    try {
        const answer = await rl.question("実行するタスク番号を入力してください: ");
        const index = Number.parseInt(answer.trim(), 10);
        if (!Number.isFinite(index) || index < 1 || index > tasks.length) {
            logError("有効な番号を入力してください。");
            return 1;
        }
        const task = tasks[index - 1];
        if (!task) {
            logError("指定された番号に対応するタスクが見つかりませんでした。");
            return 1;
        }
        return await runTask(task.filename, options);
    }
    finally {
        rl.close();
    }
};
const showConfig = () => {
    const config = (0, runner_1.getDefaultCodexRunnerConfig)();
    console.log("Codex CLI デフォルト設定");
    console.log("----------------------------------------");
    console.log(`  コマンド : ${config.bin}`);
    console.log(`  引数     : ${config.args.length > 0 ? config.args.join(" ") : "(なし)"}`);
    console.log(`  作業ディレクトリ: ${config.cwd}`);
    console.log(`  タイムアウト  : ${config.timeoutMs} ms`);
};
const main = async () => {
    const command = process.argv[2];
    switch (command) {
        case "list":
            await printTaskList(false);
            break;
        case "config":
            showConfig();
            break;
        case "run": {
            const filename = process.argv[3] ?? "";
            const options = parseRunnerOptions(process.argv.slice(4));
            const exitCode = await runTask(filename, options);
            (0, process_1.exit)(exitCode);
            return;
        }
        case "pick": {
            const options = parseRunnerOptions(process.argv.slice(3));
            const exitCode = await runPick(options);
            (0, process_1.exit)(exitCode);
            return;
        }
        case "help":
        case undefined:
            console.log(usage);
            break;
        default:
            logError(`不明なコマンドです: ${command}`);
            console.log(usage);
            (0, process_1.exit)(1);
    }
};
main().catch((error) => {
    logError(error instanceof Error
        ? error.message
        : "Codex CLI ランナーの実行中に不明なエラーが発生しました。");
    (0, process_1.exit)(1);
});
//# sourceMappingURL=codexRunner.js.map