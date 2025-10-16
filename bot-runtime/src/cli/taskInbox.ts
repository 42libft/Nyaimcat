#!/usr/bin/env node
import { exit } from "process";

import { deleteTaskFile, listTaskFiles, readTaskFile } from "../tasks/inbox";
import { PRIORITY_LABELS } from "../discord/commands/task";

const usage = `タスク inbox 管理ツール

使用方法:
  npm run task-inbox -- list
  npm run task-inbox -- show <filename>
  npm run task-inbox -- delete <filename> --force
`;

const logError = (message: string) => {
  console.error(`\u26a0\ufe0f ${message}`);
};

const logInfo = (message: string) => {
  console.log(`\u2139\ufe0f ${message}`);
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
