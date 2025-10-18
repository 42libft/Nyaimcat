#!/usr/bin/env node
import { exit } from "process";

import {
  deleteTaskFile,
  listTaskFiles,
  readTaskFile,
  updateTaskMetadata,
  validateTask,
  type TaskMetadataUpdateOptions,
} from "../tasks/inbox";
import { PRIORITY_LABELS } from "../discord/commands/task";

const usage = `タスク inbox 管理ツール

使用方法:
  npm run task-inbox -- list
  npm run task-inbox -- show <filename>
  npm run task-inbox -- delete <filename> --force
  npm run task-inbox -- validate [filename] [--json]
  npm run task-inbox -- update <filename> [--title <value>] [--priority <low|normal|high>] [--summary <value>] [--clear-summary] [--sync-summary] [--created-at <iso>] [--clear-created-at] [--author-id <id>] [--author-tag <tag>] [--clear-author] [--channel-id <id>] [--clear-channel] [--interaction-id <id>] [--clear-interaction]
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

const command = process.argv[2];

const runList = async () => {
  const tasks = await listTaskFiles();

  if (tasks.length === 0) {
    logInfo("Inbox に登録されたタスクはありません。");
    return;
  }

  console.log(`Inbox に ${tasks.length} 件のタスクが見つかりました。`);
  console.log("----------------------------------------");
  for (const task of tasks) {
    const priorityLabel = PRIORITY_LABELS[task.metadata.priority] ?? task.metadata.priority;
    const createdAt = task.metadata.created_at ?? "(日時未記録)";
    const summary = task.metadata.summary?.replace(/\s+/g, " ") ?? "(概要未入力)";

    console.log(`- ${task.filename}`);
    console.log(`  タイトル : ${task.metadata.title}`);
    console.log(`  優先度   : ${priorityLabel}`);
    console.log(`  受付日時 : ${createdAt}`);
    console.log(`  概要     : ${summary.slice(0, 120)}`);
    console.log("");
  }
};

const runShow = async (filename: string | undefined) => {
  if (!filename) {
    logError("show コマンドにはファイル名が必要です。");
    console.log(usage);
    exit(1);
  }

  try {
    const task = await readTaskFile(filename);
    const priorityLabel = PRIORITY_LABELS[task.metadata.priority] ?? task.metadata.priority;

    console.log(`ファイル名: ${task.filename}`);
    console.log(`パス      : ${task.filePath}`);
    console.log(`タイトル  : ${task.metadata.title}`);
    console.log(`優先度    : ${priorityLabel}`);
    console.log(`作成日時  : ${task.metadata.created_at ?? "(日時未記録)"}`);
    console.log(`依頼者    : ${task.metadata.author?.tag ?? task.metadata.author?.id ?? "(不明)"}`);
    console.log(`チャンネル: ${task.metadata.channel_id ?? "(不明)"}`);
    console.log("----------------------------------------");
    console.log(task.body);
  } catch (error) {
    logError(
      error instanceof Error
        ? error.message
        : "タスクファイルの読み込み中に不明なエラーが発生しました。"
    );
    exit(1);
  }
};

const runDelete = async (filename: string | undefined, force: boolean) => {
  if (!filename) {
    logError("delete コマンドにはファイル名が必要です。");
    console.log(usage);
    exit(1);
  }

  if (!force) {
    logError("削除には --force フラグが必要です。取り扱いに注意してください。");
    exit(1);
  }

  try {
    await deleteTaskFile(filename);
    logInfo(`${filename} を削除しました。`);
  } catch (error) {
    logError(
      error instanceof Error
        ? error.message
        : "タスクファイルの削除中に不明なエラーが発生しました。"
    );
    exit(1);
  }
};

const runValidate = async (args: string[]) => {
  let targetFilename: string | undefined;
  let outputJson = false;

  for (const arg of args) {
    if (arg === "--json") {
      outputJson = true;
      continue;
    }

    if (!targetFilename) {
      targetFilename = arg;
      continue;
    }

    logWarn(`不明な引数をスキップします: ${arg}`);
  }

  try {
    const tasks = targetFilename
      ? [await readTaskFile(targetFilename)]
      : await listTaskFiles();

    if (tasks.length === 0) {
      logInfo("検査対象となるタスクはありません。");
      return;
    }

    const reports = tasks.map((task) => ({
      filename: task.filename,
      issues: validateTask(task),
    }));

    const errorCount = reports.reduce(
      (count, report) =>
        count + report.issues.filter((issue) => issue.level === "error").length,
      0
    );
    const warningCount = reports.reduce(
      (count, report) =>
        count + report.issues.filter((issue) => issue.level === "warning").length,
      0
    );

    if (outputJson) {
      console.log(JSON.stringify(reports, null, 2));
    } else {
      for (const report of reports) {
        console.log(`- ${report.filename}`);

        if (report.issues.length === 0) {
          console.log("  ✅ 問題は見つかりませんでした。");
        } else {
          for (const issue of report.issues) {
            const symbol = issue.level === "error" ? "❌" : "⚠️";
            const field = issue.field ? ` [${issue.field}]` : "";
            console.log(`  ${symbol}${field} ${issue.message}`);
          }
        }

        console.log("");
      }

      console.log(`エラー: ${errorCount} 件 / 警告: ${warningCount} 件`);
      if (errorCount === 0) {
        logInfo("検査が完了しました。");
      }
    }

    if (errorCount > 0) {
      exit(1);
    }
  } catch (error) {
    logError(
      error instanceof Error
        ? error.message
        : "バリデーション検査中に不明なエラーが発生しました。"
    );
    exit(1);
  }
};

const runUpdate = async (filename: string | undefined, args: string[]) => {
  if (!filename) {
    logError("update コマンドにはファイル名が必要です。");
    console.log(usage);
    exit(1);
  }

  const options: TaskMetadataUpdateOptions = {};

  const readNextValue = (index: number, label: string) => {
    const value = args[index];
    if (value === undefined) {
      logError(`${label} には値が必要です。`);
      exit(1);
    }
    return value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--title": {
        const value = readNextValue(++i, "--title");
        options.title = value;
        break;
      }
      case "--priority": {
        const value = readNextValue(++i, "--priority");
        if (value !== "low" && value !== "normal" && value !== "high") {
          logError("--priority には low / normal / high のいずれかを指定してください。");
          exit(1);
        }
        options.priority = value;
        break;
      }
      case "--summary": {
        const value = readNextValue(++i, "--summary");
        options.summary = value;
        break;
      }
      case "--clear-summary":
        options.summary = null;
        break;
      case "--sync-summary":
        options.summaryFromBody = true;
        break;
      case "--created-at": {
        const value = readNextValue(++i, "--created-at");
        options.createdAt = value;
        break;
      }
      case "--clear-created-at":
        options.createdAt = null;
        break;
      case "--author-id": {
        const value = readNextValue(++i, "--author-id");
        options.authorId = value;
        break;
      }
      case "--author-tag": {
        const value = readNextValue(++i, "--author-tag");
        options.authorTag = value;
        break;
      }
      case "--clear-author":
        options.authorId = null;
        options.authorTag = null;
        break;
      case "--channel-id": {
        const value = readNextValue(++i, "--channel-id");
        options.channelId = value;
        break;
      }
      case "--clear-channel":
        options.channelId = null;
        break;
      case "--interaction-id": {
        const value = readNextValue(++i, "--interaction-id");
        options.interactionId = value;
        break;
      }
      case "--clear-interaction":
        options.interactionId = null;
        break;
      default:
        logWarn(`不明なオプションをスキップします: ${arg}`);
        break;
    }
  }

  if (
    options.summaryFromBody &&
    Object.prototype.hasOwnProperty.call(options, "summary")
  ) {
    logWarn("--sync-summary と --summary が同時に指定されたため、--summary を優先します。");
  }

  try {
    const result = await updateTaskMetadata(filename, options);
    const task = result.task;

    logInfo(`${filename} のメタデータを更新しました。`);
    console.log(
      `  タイトル : ${task.metadata.title}`
    );
    console.log(
      `  優先度   : ${PRIORITY_LABELS[task.metadata.priority] ?? task.metadata.priority}`
    );

    const summaryRaw = task.metadata.summary ?? "(未設定)";
    const summaryPreview =
      summaryRaw.length > 120 ? `${summaryRaw.slice(0, 120)}…` : summaryRaw;
    console.log(`  summary : ${summaryPreview}`);
    console.log(`  作成日時 : ${task.metadata.created_at ?? "(未設定)"}`);

    if (task.metadata.author) {
      const tag = task.metadata.author.tag ?? "(タグ未設定)";
      const id = task.metadata.author.id ?? "(ID未設定)";
      console.log(`  依頼者   : ${tag} / ${id}`);
    } else {
      console.log("  依頼者   : (未設定)");
    }

    console.log(`  チャンネル: ${task.metadata.channel_id ?? "(未設定)"}`);
    console.log(`  Interaction: ${task.metadata.interaction_id ?? "(未設定)"}`);

    if (result.summarySyncedFromBody) {
      logInfo("本文の概要セクションから summary を同期しました。");
    }

    const issues = validateTask(task);
    if (issues.length > 0) {
      console.log("");
      console.log("現在のバリデーション結果:");
      for (const issue of issues) {
        const symbol = issue.level === "error" ? "❌" : "⚠️";
        const field = issue.field ? ` [${issue.field}]` : "";
        console.log(`  ${symbol}${field} ${issue.message}`);
      }
    }

    const hasErrors = issues.some((issue) => issue.level === "error");
    if (hasErrors) {
      logWarn("エラーが残っています。追加の修正を行ってください。");
      exit(1);
    }

    if (issues.some((issue) => issue.level === "warning")) {
      logWarn("警告が残っています。必要に応じて確認してください。");
    }
  } catch (error) {
    logError(
      error instanceof Error
        ? error.message
        : "メタデータ更新中に不明なエラーが発生しました。"
    );
    exit(1);
  }
};

const main = async () => {
  switch (command) {
    case "list":
      await runList();
      break;
    case "show":
      await runShow(process.argv[3]);
      break;
    case "delete":
      await runDelete(process.argv[3], process.argv.includes("--force"));
      break;
    case "validate":
      await runValidate(process.argv.slice(3));
      break;
    case "update":
      await runUpdate(process.argv[3], process.argv.slice(4));
      break;
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
    error instanceof Error ? error.message : "タスク管理ツールの実行中に不明なエラーが発生しました。"
  );
  exit(1);
});
