import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { promises as fs } from "fs";
import path from "path";
import { dump as dumpYaml } from "js-yaml";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { logger } from "../../utils/logger";
import { ensureInboxDirectory } from "../../tasks/inbox";
import { INBOX_DIR } from "../../tasks/paths";

const MAX_FILENAME_LENGTH = 80;

const DEFAULT_ERROR_MESSAGE =
  "申し訳ありません、タスクの保存中にエラーが発生しました。時間をおいて再度お試しください。";
const INITIAL_REPLY_MESSAGE =
  "Codex 作業依頼を受け付けました。ファイルへの保存処理を開始します…";

export const PRIORITY_LABELS = {
  low: "低", 
  normal: "通常", 
  high: "高",
} as const;

type TaskPriority = keyof typeof PRIORITY_LABELS;

type TaskPayload = {
  title: string;
  summary: string | null;
  details: string | null;
  priority: TaskPriority;
};

const normalizeMultiline = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\r\n/g, "\n").trim();

  return normalized.length > 0 ? normalized : null;
};

const buildFilename = (title: string) => {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const normalized = title
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();

  const slug = normalized.length > 0 ? normalized.slice(0, MAX_FILENAME_LENGTH) : "task";

  return `${timestamp}-${slug}.md`;
};

const buildMarkdown = (
  payload: TaskPayload,
  interaction: ChatInputCommandInteraction
) => {
  const createdAt = new Date().toISOString();
  const metadata = {
    title: payload.title,
    priority: payload.priority,
    priority_label: PRIORITY_LABELS[payload.priority],
    summary: payload.summary,
    created_at: createdAt,
    author: {
      id: interaction.user.id,
      tag: interaction.user.tag,
    },
    channel_id: interaction.channel?.id ?? null,
    interaction_id: interaction.id,
  };

  const frontMatter = dumpYaml(metadata, { lineWidth: 120 }).trimEnd();

  const summaryBlock = payload.summary ?? "(概要未入力)";
  const detailsBlock = payload.details ?? "(詳細未入力)";

  return [
    "---",
    frontMatter,
    "---",
    "",
    "## 概要",
    "",
    summaryBlock,
    "",
    "## 詳細",
    "",
    detailsBlock,
    "",
    "---",
    "",
    "_このタスクはDiscord Slash Commandから自動生成されました。_",
  ].join("\n");
};

const saveTask = async (
  payload: TaskPayload,
  interaction: ChatInputCommandInteraction
) => {
  await ensureInboxDirectory();

  const filename = buildFilename(payload.title);
  const filePath = path.join(INBOX_DIR, filename);
  const content = buildMarkdown(payload, interaction);

  await fs.writeFile(filePath, content, "utf-8");

  return { filePath, filename };
};

const data = new SlashCommandBuilder()
  .setName("task")
  .setDescription("Codex 作業依頼に関するコマンドです")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("新しい Codex 作業依頼を登録します")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("タスクの件名")
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(150)
      )
      .addStringOption((option) =>
        option
          .setName("summary")
          .setDescription("100文字程度の概要を入力してください")
          .setRequired(false)
          .setMinLength(5)
          .setMaxLength(500)
      )
      .addStringOption((option) =>
        option
          .setName("details")
          .setDescription("詳細な依頼内容や背景を入力してください")
          .setRequired(false)
          .setMinLength(10)
          .setMaxLength(1900)
      )
      .addStringOption((option) =>
        option
          .setName("priority")
          .setDescription("このタスクの優先度")
          .setRequired(false)
          .addChoices(
            { name: "低 (バックログ)", value: "low" },
            { name: "通常", value: "normal" },
            { name: "高 (緊急)", value: "high" }
          )
      )
  )
  .setDMPermission(false);

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== "create") {
    await interaction.reply({
      content: "未対応のサブコマンドです。", 
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.options.getString("title", true);
  const summary = normalizeMultiline(interaction.options.getString("summary"));
  const details = normalizeMultiline(interaction.options.getString("details"));
  const priority = (interaction.options.getString("priority") as TaskPriority | null) ?? "normal";

  if (!summary && !details) {
    await interaction.reply({
      content: "概要または詳細のどちらか一方は必ず入力してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let initialReplySent = false;

  try {
    await interaction.reply({
      content: INITIAL_REPLY_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    initialReplySent = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof DiscordAPIError ? error.code : undefined;
    const alreadyAcknowledged =
      error instanceof DiscordAPIError &&
      (code === RESTJSONErrorCodes.UnknownInteraction ||
        code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged);

    const logFn = alreadyAcknowledged ? logger.debug : logger.warn;

    logFn("タスク作成コマンドの初期応答に失敗しました", {
      message,
      code,
      interactionId: interaction.id,
    });

    if (!alreadyAcknowledged) {
      await context.auditLogger.log({
        action: "task.create",
        status: "failure",
        description: "初期応答の送信に失敗しました",
        details: {
          userId: interaction.user.id,
          channelId: interaction.channel?.id ?? null,
          error: message,
          code,
        },
      });
    }

    if (!alreadyAcknowledged) {
      return;
    }
  }

  try {
    const result = await saveTask(
      {
        title,
        summary,
        details,
        priority,
      },
      interaction
    );

    if (initialReplySent) {
      await interaction.editReply({
        content: [
          "タスクを保存しました！",
          `ファイル名: \`${result.filename}\``,
          `優先度: ${PRIORITY_LABELS[priority]}`,
        ].join("\n"),
      });
    }

    await context.auditLogger.log({
      action: "task.create",
      status: "success",
      description: "Codex 作業依頼を保存しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        filePath: result.filePath,
        priority,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("タスクファイルの保存に失敗しました", {
      message,
      interactionId: interaction.id,
    });

    try {
      if (initialReplySent) {
        await interaction.editReply({ content: DEFAULT_ERROR_MESSAGE });
      }
    } catch (responseError) {
      const responseMessage =
        responseError instanceof Error ? responseError.message : String(responseError);
      logger.warn("エラー通知の編集に失敗しました", {
        message: responseMessage,
        interactionId: interaction.id,
      });
    }

    await context.auditLogger.log({
      action: "task.create",
      status: "failure",
      description: "タスクファイルの保存に失敗しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        error: message,
      },
    });
  }
};

export const taskCommand: SlashCommandModule = {
  data,
  execute,
};
