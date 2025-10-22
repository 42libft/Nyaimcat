import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

import type { CommandExecuteContext } from "../types";
import {
  codexWorkManager,
  type StartWorkOptions,
} from "../../../codex/workManager";
import { logger } from "../../../utils/logger";
import { buildPromptForTask } from "../../../codex/runner";
import { listTaskFiles, type TaskFile } from "../../../tasks/inbox";
import { isDocsUpdateEnabledByDefault } from "../../../codex/settings";
import {
  buildWorkStartErrorMessage,
  MAX_SELECT_OPTIONS,
  PROMPT_PREVIEW_LIMIT,
  STATUS_LABELS,
  WORK_SELECT_MENU_PREFIX,
} from "./shared";
import {
  createSelectionSession,
  deleteSelectionSession,
  getSelectionSession,
  type WorkSelectionSessionData,
} from "./selectionSession";

type WorkSelectionOptions = {
  skipNotify: boolean;
  selectedNotifyChannelId?: string;
  commandChannelId?: string;
  updateDocsOption?: boolean;
  effectiveUpdateDocs: boolean;
};

type WorkStartExecutionArgs = {
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction;
  context: CommandExecuteContext;
  filename: string;
  skipNotify: boolean;
  selectedNotifyChannelId?: string;
  commandChannelId?: string;
  updateDocsOption?: boolean;
  effectiveUpdateDocs: boolean;
};

const runWorkStartExecution = async (args: WorkStartExecutionArgs) => {
  const {
    interaction,
    context,
    filename,
    skipNotify,
    selectedNotifyChannelId,
    commandChannelId,
    updateDocsOption,
    effectiveUpdateDocs,
  } = args;

  const startOptions: StartWorkOptions = {
    filename,
  };

  if (skipNotify) {
    startOptions.notifyChannelId = null;
  } else if (selectedNotifyChannelId) {
    startOptions.notifyChannelId = selectedNotifyChannelId;
  } else if (commandChannelId) {
    startOptions.notifyChannelId = commandChannelId;
  }

  if (typeof updateDocsOption === "boolean") {
    startOptions.updateDocs = updateDocsOption;
  }

  const result = await codexWorkManager.startWork(startOptions);

  const snapshot = codexWorkManager.getQueueSnapshot();
  const queueItem =
    result.queueItem ?? codexWorkManager.getQueueItem(result.queueId);

  let positionMessage = "現在のステータスを取得できませんでした。";

  if (queueItem) {
    const statusLabel = STATUS_LABELS[queueItem.status] ?? queueItem.status;
    if (queueItem.status === "pending") {
      const index = snapshot.pending.findIndex((item) => item.id === queueItem.id);
      if (index >= 0) {
        positionMessage = `キュー位置: 待機列の ${index + 1} 番目 (${statusLabel})`;
      } else {
        positionMessage = `キュー状態: ${statusLabel}`;
      }
    } else if (queueItem.status === "running") {
      positionMessage = "キュー状態: 実行中";
    } else {
      positionMessage = `キュー状態: ${statusLabel}`;
    }
  }

  const notifySummary = skipNotify
    ? "通知: サイレント"
    : selectedNotifyChannelId
        ? `通知: <#${selectedNotifyChannelId}>`
        : commandChannelId
          ? `通知: <#${commandChannelId}> (自動)`
          : "通知: 既定設定";

  const docSummary = effectiveUpdateDocs
    ? "ドキュメント更新: 有効"
    : "ドキュメント更新: 無効";

  const lines = [
    "Codex 実行をキューに登録しました。",
    `キュー ID: \`${result.queueId}\``,
    `ファイル: \`${result.task.filename}\``,
    `タイトル: ${result.task.metadata.title}`,
    positionMessage,
    notifySummary,
    docSummary,
    "",
    "`/work status` で進捗を確認できます。",
  ];

  const prompt = buildPromptForTask(result.task).trim();
  const preview =
    prompt.length > PROMPT_PREVIEW_LIMIT
      ? `${prompt.slice(0, PROMPT_PREVIEW_LIMIT)}\n…(以降は省略されました)`
      : prompt || "(生成されたプロンプトは空でした)";

  const content = [
    ...lines,
    "",
    "送信するプロンプト:",
    "```markdown",
    preview,
    "```",
  ].join("\n");

  await context.auditLogger.log({
    action: "codex.work.start",
    status: "success",
    description: "Codex 実行をキューに登録しました",
    details: {
      userId: interaction.user.id,
      channelId: interaction.channel?.id ?? null,
      filename,
      queueId: result.queueId,
      notifyChannelId: skipNotify
        ? null
        : selectedNotifyChannelId ?? commandChannelId ?? "(default)",
      updateDocs: effectiveUpdateDocs,
    },
  });

  return content;
};

const presentWorkSelection = async (
  interaction: ChatInputCommandInteraction,
  options: WorkSelectionOptions
) => {
  const tasks = await listTaskFiles();

  if (tasks.length === 0) {
    await interaction.editReply({
      content: [
        "Inbox にタスクが見つかりませんでした。",
        "`/task create` でタスクを作成してから再度お試しください。",
      ].join("\n"),
      components: [],
    });
    return;
  }

  const limitedTasks = tasks.slice(0, MAX_SELECT_OPTIONS);

  const notifySummary = options.skipNotify
    ? "通知: サイレント"
    : options.selectedNotifyChannelId
        ? `通知: <#${options.selectedNotifyChannelId}>`
        : options.commandChannelId
          ? `通知: <#${options.commandChannelId}> (自動)`
          : "通知: 既定設定";

  const docSummary = options.effectiveUpdateDocs
    ? "ドキュメント更新: 有効"
    : "ドキュメント更新: 無効";

  const selectOptions = limitedTasks.map((task: TaskFile) => {
    const rawTitle = task.metadata.title ?? task.filename;
    const label = rawTitle.slice(0, 100) || task.filename.slice(0, 100);
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(task.filename);

    const summary = task.metadata.summary?.replace(/\s+/g, " ") ?? "(概要未入力)";
    option.setDescription(summary.slice(0, 100));

    return { option, filename: task.filename };
  });

  const allowedFilenames = selectOptions.map((item) => item.filename);

  const sessionPayload: WorkSelectionSessionData = {
    userId: interaction.user.id,
    skipNotify: options.skipNotify,
    effectiveUpdateDocs: options.effectiveUpdateDocs,
    allowedFilenames,
  };

  if (typeof options.updateDocsOption === "boolean") {
    sessionPayload.updateDocsOption = options.updateDocsOption;
  }
  if (options.selectedNotifyChannelId) {
    sessionPayload.selectedNotifyChannelId = options.selectedNotifyChannelId;
  }
  if (options.commandChannelId) {
    sessionPayload.commandChannelId = options.commandChannelId;
  }

  const sessionId = createSelectionSession(sessionPayload);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${WORK_SELECT_MENU_PREFIX}${sessionId}`)
    .setPlaceholder("実行するタスクを選択してください")
    .setMinValues(1)
    .setMaxValues(1);

  for (const { option } of selectOptions) {
    menu.addOptions(option);
  }

  const lines = [
    "実行するタスクを選択してください。",
    notifySummary,
    docSummary,
  ];

  if (tasks.length > limitedTasks.length) {
    lines.push(`先頭 ${limitedTasks.length} 件のみ表示しています。`);
  }

  lines.push(
    "",
    "選択すると Codex 実行が開始され、プロンプト内容がこのメッセージに表示されます。",
    "最新のタスクを自動で選ぶ場合は `latest:true` を指定してください。"
  );

  await interaction.editReply({
    content: lines.join("\n"),
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  });
};

export const handleWorkStart = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  await interaction.deferReply();

  const filenameInput = interaction.options.getString("filename");
  const latest = interaction.options.getBoolean("latest") ?? false;
  const notifyChannel = interaction.options.getChannel("notify_channel");
  const skipNotify = interaction.options.getBoolean("skip_notify") ?? false;
  const updateDocsOption = interaction.options.getBoolean("update_docs");

  const selectedNotifyChannelId = notifyChannel?.id ?? undefined;
  const commandChannel = interaction.channel;
  const commandChannelId =
    commandChannel &&
    "isTextBased" in commandChannel &&
    typeof commandChannel.isTextBased === "function" &&
    commandChannel.isTextBased()
      ? commandChannel.id
      : undefined;

  const effectiveUpdateDocs =
    typeof updateDocsOption === "boolean"
      ? updateDocsOption
      : isDocsUpdateEnabledByDefault();

  let resolvedFilename: string | null =
    filenameInput && filenameInput.trim().length > 0
      ? filenameInput.trim()
      : null;

  try {
    const buildExecutionArgs = (filename: string): WorkStartExecutionArgs => {
      const args: WorkStartExecutionArgs = {
        interaction,
        context,
        filename,
        skipNotify,
        effectiveUpdateDocs,
      };

      if (typeof updateDocsOption === "boolean") {
        args.updateDocsOption = updateDocsOption;
      }

      if (selectedNotifyChannelId) {
        args.selectedNotifyChannelId = selectedNotifyChannelId;
      } else if (commandChannelId) {
        args.commandChannelId = commandChannelId;
      }

      return args;
    };

    if (filenameInput && filenameInput.trim().length > 0) {
      const targetFilename = filenameInput.trim();
      resolvedFilename = targetFilename;

      const content = await runWorkStartExecution(buildExecutionArgs(targetFilename));
      await interaction.editReply({ content, components: [] });
      return;
    }

    if (latest) {
      const tasks = await listTaskFiles();
      if (tasks.length === 0) {
        await interaction.editReply({
          content: [
            "Inbox にタスクが見つかりませんでした。",
            "`/task create` でタスクを作成してから再度お試しください。",
          ].join("\n"),
        });
        return;
      }

      const latestTask = tasks[0];
      if (!latestTask) {
        await interaction.editReply({
          content: "タスクの取得に失敗しました。もう一度お試しください。",
        });
        return;
      }

      const targetFilename = latestTask.filename;
      resolvedFilename = targetFilename;

      const content = await runWorkStartExecution(buildExecutionArgs(targetFilename));
      await interaction.editReply({ content, components: [] });
      return;
    }

    const selectionOptions: WorkSelectionOptions = {
      skipNotify,
      effectiveUpdateDocs,
    };

    if (typeof updateDocsOption === "boolean") {
      selectionOptions.updateDocsOption = updateDocsOption;
    }

    if (selectedNotifyChannelId) {
      selectionOptions.selectedNotifyChannelId = selectedNotifyChannelId;
    } else if (commandChannelId) {
      selectionOptions.commandChannelId = commandChannelId;
    }

    await presentWorkSelection(interaction, selectionOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Codex 実行キューへの登録に失敗しました", {
      filename: filenameInput ?? "(未指定)",
      error: message,
    });

    await interaction.editReply({
      content: buildWorkStartErrorMessage(message),
      components: [],
    });

    await context.auditLogger.log({
      action: "codex.work.start",
      status: "failure",
      description: "Codex 実行キューへの登録に失敗しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        filename: resolvedFilename ?? filenameInput ?? "(未指定)",
        error: message,
      },
    });
  }
};

export const handleWorkStartSelect = async (
  interaction: StringSelectMenuInteraction,
  context: CommandExecuteContext
): Promise<boolean> => {
  if (!interaction.customId.startsWith(WORK_SELECT_MENU_PREFIX)) {
    return false;
  }

  const sessionId = interaction.customId.substring(WORK_SELECT_MENU_PREFIX.length);
  const session = getSelectionSession(sessionId);

  if (!session) {
    await interaction.reply({
      content: "この選択は有効期限が切れています。もう一度 `/work start` を実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: "この選択メニューはコマンドを実行したユーザーのみが利用できます。",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const filename = interaction.values[0];

  if (!filename || !session.allowedFilenames.includes(filename)) {
    await interaction.reply({
      content: "選択内容が無効です。再度 `/work start` を実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  deleteSelectionSession(sessionId);

  await interaction.deferUpdate();

  try {
    const execArgs: WorkStartExecutionArgs = {
      interaction,
      context,
      filename,
      skipNotify: session.skipNotify,
      effectiveUpdateDocs: session.effectiveUpdateDocs,
    };

    if (typeof session.updateDocsOption === "boolean") {
      execArgs.updateDocsOption = session.updateDocsOption;
    }
    if (session.selectedNotifyChannelId) {
      execArgs.selectedNotifyChannelId = session.selectedNotifyChannelId;
    } else if (session.commandChannelId) {
      execArgs.commandChannelId = session.commandChannelId;
    }

    const content = await runWorkStartExecution(execArgs);
    await interaction.editReply({ content, components: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Codex 実行キューへの登録に失敗しました", {
      filename,
      error: message,
    });

    await interaction.editReply({
      content: buildWorkStartErrorMessage(message),
      components: [],
    });

    await context.auditLogger.log({
      action: "codex.work.start",
      status: "failure",
      description: "Codex 実行キューへの登録に失敗しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        filename,
        error: message,
      },
    });
  }

  return true;
};
