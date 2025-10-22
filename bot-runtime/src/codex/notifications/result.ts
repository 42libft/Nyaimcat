import type { RESTPostAPIChannelMessageJSONBody, APIEmbed, RawFile } from "discord.js";

import { logger } from "../../utils/logger";
import type { CodexRunnerResult } from "../runner";
import type { DiscordActions } from "../discordActions";
import { buildLogAttachments } from "./attachments";
import {
  DEFAULT_STDERR_LIMIT,
  DEFAULT_STDOUT_LIMIT,
  MAX_MESSAGE_CONTENT_LENGTH,
  MAX_STDOUT_PUBLIC_CHUNKS,
} from "./constants";
import { resolveDiscordActions } from "./actions";
import { resolveNotifyChannelId } from "./channel";
import {
  buildFollowUpComponents,
  chunkText,
  determineStatus,
  formatLogSnippet,
  formatRetryDetails,
  resolvePriority,
  toRelativeRepositoryPath,
} from "./shared";
import type { NotifyRunOptions, BuildNotificationOptions } from "./types";

export type BuildRunNotificationResult = {
  content: string;
  embeds: APIEmbed[];
  components: RESTPostAPIChannelMessageJSONBody["components"];
  files: RawFile[];
  attachmentsSummary: string[];
};

const resolveLimit = (
  explicit: number | undefined,
  envVar: string,
  fallback: number
) => {
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return explicit;
  }

  const parsed = Number.parseInt(process.env[envVar] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const buildRunNotification = (
  result: CodexRunnerResult,
  options: BuildNotificationOptions = {}
): BuildRunNotificationResult => {
  const stdoutLimit = resolveLimit(
    options.stdoutLimit,
    "CODEX_DISCORD_NOTIFY_STDOUT_LIMIT",
    DEFAULT_STDOUT_LIMIT
  );
  const stderrLimit = resolveLimit(
    options.stderrLimit,
    "CODEX_DISCORD_NOTIFY_STDERR_LIMIT",
    DEFAULT_STDERR_LIMIT
  );

  const status = determineStatus(result);
  const priority = resolvePriority(result.task.metadata.priority);
  const historyPath = options.includeHistoryLink === false
    ? null
    : toRelativeRepositoryPath(result.historyPath);

  const embed: APIEmbed = {
    title: `Codex 実行結果: ${status.label}`,
    color: status.color,
    fields: [
      {
        name: "タスク",
        value: result.task.metadata.title,
      },
      {
        name: "ファイル",
        value: `\`${result.task.filename}\``,
        inline: true,
      },
      {
        name: "優先度",
        value: priority,
        inline: true,
      },
      {
        name: "所要時間",
        value: `${result.durationMs} ms`,
        inline: true,
      },
    ],
    footer: {
      text: `Run ID: ${result.runId}`,
    },
    timestamp: new Date().toISOString(),
  };

  const exitInfo = typeof result.exitCode === "number"
    ? `${result.exitCode} (signal=${result.signal ?? "none"})`
    : `(null) (signal=${result.signal ?? "none"})`;

  embed.fields?.push({
    name: "終了コード",
    value: exitInfo,
    inline: true,
  });

  if (result.retry && result.retry.performedRetries > 0) {
    embed.fields?.push({
      name: "自動リトライ",
      value: formatRetryDetails(result.retry),
    });
  }

  if (historyPath) {
    embed.fields?.push({
      name: "履歴",
      value: `\`${historyPath}\``,
    });
  }

  if (result.fileChanges.length > 0) {
    const changeLines = result.fileChanges.slice(0, 5).map((change) => {
      const statusLabel = change.status.trim() || "?";
      if (change.originalPath && change.originalPath !== change.path) {
        return `\`${statusLabel}\` \`${change.originalPath}\` → \`${change.path}\``;
      }
      return `\`${statusLabel}\` \`${change.path}\``;
    });

    if (result.fileChanges.length > 5) {
      changeLines.push(`…他 ${result.fileChanges.length - 5} 件`);
    }

    embed.fields?.push({
      name: "変更ファイル",
      value: changeLines.join("\n").slice(0, 1024) || "(省略)",
    });
  } else {
    embed.fields?.push({
      name: "変更ファイル",
      value: "なし",
      inline: true,
    });
  }

  const stdoutSnippet = formatLogSnippet(result.stdout, stdoutLimit);
  if (stdoutSnippet) {
    embed.fields?.push({
      name: "STDOUT",
      value: stdoutSnippet.slice(0, 1024),
    });
  }

  const stderrSnippet = formatLogSnippet(result.stderr, stderrLimit);
  if (stderrSnippet) {
    embed.fields?.push({
      name: "STDERR",
      value: stderrSnippet.slice(0, 1024),
    });
  }

  const attachments = buildLogAttachments(result);
  const attachmentNames = attachments
    .map((file) => file.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  if (attachmentNames.length > 0) {
    embed.fields?.push({
      name: "添付ログ",
      value: attachmentNames.map((name) => `\`${name}\``).join("\n"),
    });
  }

  const content =
    status.label.startsWith("✅")
      ? "Codex 実行が完了しました。"
      : "Codex 実行で問題が発生しました。";

  return {
    content,
    embeds: [embed],
    components: buildFollowUpComponents(result.runId),
    files: attachments,
    attachmentsSummary: attachmentNames,
  };
};

const formatStdoutMessage = (chunk: string, index: number, total: number) => {
  const header =
    total > 1
      ? `**Codex 応答 (${index + 1}/${total})**`
      : "**Codex 応答**";

  return [header, "```", chunk, "```"].join("\n");
};

const sendStdoutMessages = async (
  actions: DiscordActions,
  channelId: string,
  result: CodexRunnerResult,
  attachmentNames: string[],
) => {
  const stdout = result.stdout.trim();
  if (!stdout) {
    return;
  }

  const chunks = chunkText(stdout, MAX_MESSAGE_CONTENT_LENGTH);
  const totalChunks = chunks.length;
  const publicChunks = chunks.slice(0, MAX_STDOUT_PUBLIC_CHUNKS);

  for (const [index, chunk] of publicChunks.entries()) {
    const content = formatStdoutMessage(chunk, index, totalChunks);
    await actions.publishMessage(channelId, { content });
  }

  if (totalChunks > publicChunks.length) {
    const remaining = totalChunks - publicChunks.length;
    const lines = [
      `Codex 応答は全 ${totalChunks} チャンクあります。残り ${remaining} チャンクは添付ファイルからご確認ください。`,
    ];

    if (attachmentNames.length > 0) {
      lines.push(
        "",
        "添付ファイル一覧:",
        ...attachmentNames.map((name) => `- \`${name}\``)
      );
    }

    await actions.publishMessage(channelId, {
      content: lines.join("\n"),
    });
  }
};

export const notifyRunResult = async (
  result: CodexRunnerResult,
  options: NotifyRunOptions = {}
) => {
  const channelId = resolveNotifyChannelId(options);

  if (!channelId) {
    logger.debug("Discord 通知チャンネルが設定されていないため通知をスキップします", {
      runId: result.runId,
    });
    return;
  }

  let actions = options.actions;
  if (!actions) {
    actions = resolveDiscordActions(
      options,
      "DiscordActions の初期化に失敗したため通知をスキップします",
      { runId: result.runId }
    );

    if (!actions) {
      return;
    }

    options = { ...options, actions };
  }

  try {
    const payload = buildRunNotification(result, options);
    await actions.publishMessage(channelId, {
      content: payload.content,
      embeds: payload.embeds,
      components: payload.components,
      files: payload.files,
    });

    try {
      await sendStdoutMessages(actions, channelId, result, payload.attachmentsSummary);
    } catch (detailError) {
      logger.warn("Codex 応答全文の送信に失敗しました", {
        runId: result.runId,
        channelId,
        error:
          detailError instanceof Error
            ? detailError.message
            : String(detailError),
      });
    }
  } catch (error) {
    logger.error("Codex 実行結果の通知に失敗しました", {
      runId: result.runId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
