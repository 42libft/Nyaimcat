#!/usr/bin/env node
import { exit, stderr, stdin, stdout } from "process";
import { createInterface } from "readline/promises";

import { PRIORITY_LABELS } from "../discord/commands/task";
import { listTaskFiles } from "../tasks/inbox";
import {
  getDefaultCodexRunnerConfig,
  runCodexTask,
} from "../codex/runner";
import { notifyRunResult } from "../codex/notifications";
import { updateDocumentsForRun } from "../codex/docUpdates";
import { isDocsUpdateEnabledByDefault } from "../codex/settings";

const usage = `Codex CLI ランナー

使用方法:
  npm run codex-runner -- list
  npm run codex-runner -- config
  npm run codex-runner -- run <filename> [--notify <channelId>] [--no-notify] [--history|--no-history] [--stdout-limit <n>] [--stderr-limit <n>] [--update-docs|--no-update-docs]
  npm run codex-runner -- pick [--notify <channelId>] [--no-notify] [--history|--no-history] [--stdout-limit <n>] [--stderr-limit <n>] [--update-docs|--no-update-docs]
`;

const logError = (message: string) => {
  console.error(`\u26a0\ufe0f ${message}`);
};

const logInfo = (message: string) => {
  console.log(`\u2139\ufe0f ${message}`);
};

const logWarn = (message: string) => {
  console.warn(`\u26a0\ufe0f ${message}`);
};

const formatPriority = (priority: keyof typeof PRIORITY_LABELS) =>
  PRIORITY_LABELS[priority] ?? priority;

const printTaskList = async (withIndex = false) => {
  const tasks = await listTaskFiles();

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

type RunnerCliOptions = {
  notifyChannel?: string | null;
  recordHistory?: boolean;
  stdoutLimit?: number;
  stderrLimit?: number;
  updateDocs?: boolean;
};

const parseRunnerOptions = (args: string[]): RunnerCliOptions => {
  const options: RunnerCliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--notify":
      case "--notify-channel": {
        const value = args[i + 1];
        if (value) {
          options.notifyChannel = value;
          i++;
        } else {
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
        } else {
          logWarn("--stdout-limit には数値を指定してください。");
        }
        i++;
        break;
      }
      case "--stderr-limit": {
        const value = Number.parseInt(args[i + 1] ?? "", 10);
        if (Number.isFinite(value)) {
          options.stderrLimit = value;
        } else {
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

const runTask = async (filename: string, options: RunnerCliOptions): Promise<number> => {
  if (!filename || filename.trim().length === 0) {
    logError("run コマンドにはファイル名が必要です。");
    return 1;
  }

  try {
    const runnerOptions: Parameters<typeof runCodexTask>[1] = {
      hooks: {
        onStdout: (chunk) => {
          stdout.write(chunk);
        },
        onStderr: (chunk) => {
          stderr.write(chunk);
        },
      },
    };

    if (typeof options.recordHistory === "boolean") {
      runnerOptions.recordHistory = options.recordHistory;
    }

    const result = await runCodexTask(filename, runnerOptions);

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
    } else {
      console.log("  履歴保存先: (未保存)");
    }

    if (result.fileChanges.length > 0) {
      console.log("  変更ファイル:");
      for (const change of result.fileChanges) {
        const label = change.status.trim() || "?";
        if (change.originalPath && change.originalPath !== change.path) {
          console.log(`    - ${label} ${change.originalPath} -> ${change.path}`);
        } else {
          console.log(`    - ${label} ${change.path}`);
        }
      }
    } else {
      console.log("  変更ファイル: (なし)");
    }

    const notifyOptions: Parameters<typeof notifyRunResult>[1] = {};

    if (options.notifyChannel !== undefined) {
      notifyOptions.channelId = options.notifyChannel;
    }
    if (typeof options.stdoutLimit === "number") {
      notifyOptions.stdoutLimit = options.stdoutLimit;
    }
    if (typeof options.stderrLimit === "number") {
      notifyOptions.stderrLimit = options.stderrLimit;
    }

    await notifyRunResult(result, notifyOptions);

    const updateDocsDefault = isDocsUpdateEnabledByDefault();
    const shouldUpdateDocs =
      typeof options.updateDocs === "boolean" ? options.updateDocs : updateDocsDefault;

    if (shouldUpdateDocs) {
      try {
        await updateDocumentsForRun(result);
        logInfo("docs/plans.md および docs/task.md を更新しました。");
      } catch (error) {
        logWarn(
          `ドキュメント更新に失敗しました: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
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
  } catch (error) {
    logError(
      error instanceof Error
        ? error.message
        : "Codex CLI 実行中に不明なエラーが発生しました。"
    );
    return 1;
  }
};

const runPick = async (options: RunnerCliOptions): Promise<number> => {
  const tasks = await printTaskList(true);

  if (tasks.length === 0) {
    return 0;
  }

  const rl = createInterface({
    input: stdin,
    output: stdout,
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
  } finally {
    rl.close();
  }
};

const showConfig = () => {
  const config = getDefaultCodexRunnerConfig();

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
      exit(exitCode);
      return;
    }
    case "pick": {
      const options = parseRunnerOptions(process.argv.slice(3));
      const exitCode = await runPick(options);
      exit(exitCode);
      return;
    }
    case "help":
    case undefined:
      console.log(usage);
      break;
    default:
      logError(`不明なコマンドです: ${command}`);
      console.log(usage);
      exit(1);
  }
};

main().catch((error) => {
  logError(
    error instanceof Error
      ? error.message
      : "Codex CLI ランナーの実行中に不明なエラーが発生しました。"
  );
  exit(1);
});
