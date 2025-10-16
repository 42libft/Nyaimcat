import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { promises as fs } from "fs";
import path from "path";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import { logger } from "../../utils/logger";

const FEEDBACK_ROOT = path.resolve(__dirname, "../../..", "feedback");
const BUG_DIR = path.join(FEEDBACK_ROOT, "bugs");
const IDEA_DIR = path.join(FEEDBACK_ROOT, "ideas");

const data = new SlashCommandBuilder()
  .setName("feedback")
  .setDescription("不具合報告やアイデアを送信します")
  .addSubcommand((sub) =>
    sub
      .setName("bug")
      .setDescription("不具合報告を送信します")
      .addStringOption((option) =>
        option.setName("title").setDescription("件名").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("detail")
          .setDescription("詳細な説明")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("steps")
          .setDescription("再現手順や補足情報があれば記入してください")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("idea")
      .setDescription("改善アイデアを送信します")
      .addStringOption((option) =>
        option.setName("title").setDescription("件名").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("detail")
          .setDescription("アイデアの内容を記入してください")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("impact")
          .setDescription("期待する効果や背景があれば記入してください")
          .setRequired(false)
      )
  )
  .setDMPermission(false);

type FeedbackSubcommand = "bug" | "idea";

type FeedbackPayload = {
  type: FeedbackSubcommand;
  title: string;
  detail: string;
  extra?: string | null;
};

const getTargetDirectory = (subcommand: FeedbackSubcommand) =>
  subcommand === "bug" ? BUG_DIR : IDEA_DIR;

const buildFilename = (title: string) => {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const normalized = title
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();

  const slug = normalized.length > 0 ? normalized.slice(0, 80) : "entry";

  return `${timestamp}-${slug}.md`;
};

const buildMarkdown = (
  payload: FeedbackPayload,
  interaction: ChatInputCommandInteraction
) => {
  const createdAt = new Date().toISOString();
  const typeLabel = payload.type === "bug" ? "不具合報告" : "アイデア";
  const lines = [
    `# ${payload.title}`,
    "",
    "## メタ情報",
    "",
    `- 種類: ${typeLabel}`,
    `- 投稿日: ${createdAt}`,
    `- 送信者: ${interaction.user.tag} (${interaction.user.id})`,
  ];

  if (interaction.channel) {
    lines.push(`- チャンネル: ${interaction.channel.id}`);
  }

  lines.push("", "## 詳細", "", payload.detail);

  if (payload.extra && payload.extra.length > 0) {
    lines.push("", "## 補足", "", payload.extra);
  }

  lines.push("", "---", "", "_このエントリはDiscord Slash Commandから自動生成されました。_");

  return lines.join("\n");
};

const ensureDirectory = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const saveFeedback = async (
  payload: FeedbackPayload,
  interaction: ChatInputCommandInteraction
) => {
  const directory = getTargetDirectory(payload.type);
  await ensureDirectory(directory);

  const filename = buildFilename(payload.title);
  const filePath = path.join(directory, filename);
  const content = buildMarkdown(payload, interaction);

  await fs.writeFile(filePath, content, "utf-8");

  return { filePath, filename };
};

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  const subcommand = interaction.options.getSubcommand() as FeedbackSubcommand;

  const title = interaction.options.getString("title", true);
  const detail = interaction.options.getString("detail", true);
  const extraOptionName = subcommand === "bug" ? "steps" : "impact";
  const extra = interaction.options.getString(extraOptionName, false);
  const errorResponse =
    "申し訳ありません、保存中にエラーが発生しました。時間をおいて再度お試しください。";
  const processingMessage =
    "フィードバックを受け付けました。保存処理を開始します…";

  let initialReplySent = false;

  try {
    await interaction.reply({
      content: processingMessage,
      flags: MessageFlags.Ephemeral,
    });
    initialReplySent = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof DiscordAPIError ? error.code : undefined;
    const conflict =
      error instanceof DiscordAPIError &&
      (code === RESTJSONErrorCodes.UnknownInteraction ||
        code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged);

    const logFn = conflict ? logger.debug : logger.warn;

    logFn("フィードバック応答の初期化に失敗しました", {
      message,
      code,
      subcommand,
      interactionId: interaction.id,
    });

    if (!conflict) {
      await context.auditLogger.log({
        action: `feedback.${subcommand}`,
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

    return;
  }

  try {
    const result = await saveFeedback(
      {
        type: subcommand,
        title,
        detail,
        extra,
      },
      interaction
    );

    if (initialReplySent) {
      await interaction.editReply({
        content: [
          "フィードバックありがとうございます！",
          `ファイル名: \`${result.filename}\``,
        ].join("\n"),
      });
    }

    await context.auditLogger.log({
      action: `feedback.${subcommand}`,
      status: "success",
      description: `${subcommand} を保存しました`,
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        filePath: result.filePath,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("フィードバックの保存に失敗しました", {
      message,
      subcommand,
    });

    try {
      if (initialReplySent) {
        await interaction.editReply({ content: errorResponse });
      }
    } catch (responseError) {
      const responseMessage =
        responseError instanceof Error ? responseError.message : String(responseError);
      logger.warn("エラー通知の送信に失敗しました", {
        name: "feedback",
        message: responseMessage,
      });
    }

    await context.auditLogger.log({
      action: `feedback.${subcommand}`,
      status: "failure",
      description: "フィードバックの保存に失敗しました",
      details: {
        userId: interaction.user.id,
        channelId: interaction.channel?.id ?? null,
        error: message,
      },
    });
  }
};

export const feedbackCommand: SlashCommandModule = {
  data,
  execute,
};
