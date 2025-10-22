import {
  type APIAllowedMentions,
  ChannelType,
  type ChatInputCommandInteraction,
  type DMChannel,
  type GuildTextBasedChannel,
  type Message,
  type TextBasedChannel,
  ThreadAutoArchiveDuration,
  type ThreadChannel,
} from "discord.js";

import type { AuditLogger } from "../discord/auditLogger";
import type { EntryJobResult, EntryScheduler, DispatchTime } from "./entryScheduler";
import { computeRunAt, formatDateTimeInZone } from "./entryScheduler";
import { logger } from "../utils/logger";
import { AccountManagerError } from "./accountManager";
import type { EsclEnvironment, ResolvedEntryAccount } from "./environment";

const ALLOWED_MENTIONS: APIAllowedMentions = { parse: [] };
const TIMEZONE = "Asia/Tokyo";

const THREAD_NAME_MAX = 100;

const safeFilenameComponent = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "").trim();

type ProgressTarget = GuildTextBasedChannel | ThreadChannel | DMChannel;

const toProgressTarget = (
  channel: TextBasedChannel | null | undefined
): ProgressTarget | null => {
  if (!channel) {
    return null;
  }

  if (typeof (channel as ProgressTarget).send === "function") {
    return channel as ProgressTarget;
  }

  return null;
};

const formatDuration = (milliseconds: number) => {
  if (milliseconds <= 0) {
    return "0秒";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}時間`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}分`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}秒`);
  }
  return parts.join(" ");
};

const formatEntryResult = (result: EntryJobResult) => {
  const icon = result.ok ? "✅" : "❌";
  const status =
    result.statusCode !== null ? `status=${result.statusCode}` : "status=不明";
  const lines = [
    `${icon} ${result.summary}`,
    `- ${status}`,
    `- 試行回数: ${result.attempts}`,
  ];

  if (result.detail) {
    lines.push(`- 詳細: ${result.detail}`);
  }

  return lines.join("\n");
};

const parseDispatchTime = (value: string | null): DispatchTime | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const segments = trimmed.split(":");
  if (segments.length !== 2) {
    throw new EntryCommandError("応募時刻は `HH:MM` 形式で指定してください。");
  }

  const hour = Number(segments[0]);
  const minute = Number(segments[1]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new EntryCommandError("応募時刻は 00:00〜23:59 の範囲で指定してください。");
  }

  return { hour, minute };
};

const parseEventDate = (value: string) => {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new EntryCommandError("日付は `YYYY-MM-DD` 形式で指定してください。");
  }
  return trimmed;
};

export class EntryCommandError extends Error {
  readonly ephemeral: boolean;

  constructor(message: string, options?: { ephemeral?: boolean }) {
    super(message);
    this.name = "EntryCommandError";
    this.ephemeral = options?.ephemeral ?? true;
  }
}

type EntryCommandHandlerOptions = {
  interaction: ChatInputCommandInteraction;
  scheduler: EntryScheduler;
  environment: EsclEnvironment;
  auditLogger: AuditLogger;
};

export class EntryCommandHandler {
  private readonly interaction: ChatInputCommandInteraction;
  private readonly scheduler: EntryScheduler;
  private readonly environment: EsclEnvironment;
  private readonly auditLogger: AuditLogger;
  private headerLines: string[] = [];
  private progressTargets: ProgressTarget[] = [];
  private rootMessage: Message | null = null;

  constructor(options: EntryCommandHandlerOptions) {
    this.interaction = options.interaction;
    this.scheduler = options.scheduler;
    this.environment = options.environment;
    this.auditLogger = options.auditLogger;
  }

  async scheduleEntry({
    eventDate,
    scrimId,
    teamId,
    dispatchAt,
    accountId,
  }: {
    eventDate: string;
    scrimId: number;
    teamId: number | null;
    dispatchAt: string | null;
    accountId: string | null;
  }) {
    const validatedDate = parseEventDate(eventDate);
    const dispatchTime = parseDispatchTime(dispatchAt);
    const resolved = await this.resolveEntryAccount({
      teamId,
      accountId,
    });

    const now = new Date();
    const runAt = computeRunAt(validatedDate, TIMEZONE, dispatchTime);
    const runAtDisplay = formatDateTimeInZone(runAt, TIMEZONE);
    const remaining = runAt.getTime() - now.getTime();
    const immediate = remaining <= 0;

    const lines = [
      "📝 応募予約を登録します。",
      `- 開催日: ${validatedDate} (応募送信 ${runAtDisplay})`,
      `- scrim_id: ${scrimId}`,
      `- team_id: ${resolved.teamId} (${this.describeTeamSource(resolved)})`,
    ];

    const accountSummary = this.describeAccount(resolved);
    if (accountSummary) {
      lines.push(`- アカウント: ${accountSummary}`);
    }

    if (immediate) {
      lines.push("- ⚠️ 実行時刻を過ぎているため即時送信を試みます。");
    } else {
      lines.push(`- 実行まで残り: ${formatDuration(remaining)}`);
    }

    lines.push("- モード: 予約送信 (最大3回リトライ)");
    this.headerLines = [...lines];

    this.rootMessage = await this.interaction.reply({
      content: lines.join("\n"),
      allowedMentions: ALLOWED_MENTIONS,
      fetchReply: true,
    });

    await this.prepareProgressTargets(validatedDate, scrimId);

    const scheduleOptions: Parameters<EntryScheduler["scheduleEntry"]>[0] = {
      userId: this.interaction.user.id,
      scrimId,
      teamId: resolved.teamId,
      entryDate: validatedDate,
      logHook: (text) => this.sendProgress(text),
      resultHook: (result) => this.handleResult(result),
      now,
    };

    if (dispatchTime) {
      scheduleOptions.dispatchTime = dispatchTime;
    }

    if (resolved.accountContext) {
      scheduleOptions.accountContext = resolved.accountContext;
    }

    try {
      const metadata = await this.scheduler.scheduleEntry(scheduleOptions);

      this.headerLines.push(`- ジョブID: \`${metadata.jobId}\``);
      await this.interaction.editReply({
        content: this.headerLines.join("\n"),
        allowedMentions: ALLOWED_MENTIONS,
      });

      await this.sendProgress(
        `ジョブID \`${metadata.jobId}\` を登録しました。実行予定: ${runAtDisplay}`
      );

      await this.auditLogger.log({
        action: "escl.entry.schedule",
        status: "success",
        details: {
          jobId: metadata.jobId,
          scrimId,
          teamId: resolved.teamId,
          entryDate: validatedDate,
          dispatchAt: dispatchTime
            ? `${dispatchTime.hour.toString().padStart(2, "0")}:${dispatchTime.minute
                .toString()
                .padStart(2, "0")}`
            : "00:00",
          accountId: resolved.accountId,
          accountLabel: resolved.accountLabel,
          authSource: resolved.source,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("応募ジョブのスケジュールに失敗しました", {
        message,
        scrimId,
        teamId: resolved.teamId,
      });
      await this.sendProgress(
        "❌ 応募ジョブの登録に失敗しました。後ほど再度お試しください。"
      );

      await this.auditLogger.log({
        action: "escl.entry.schedule",
        status: "failure",
        description: message,
        details: {
          scrimId,
          teamId: resolved.teamId,
          entryDate: validatedDate,
          accountId: resolved.accountId,
          accountLabel: resolved.accountLabel,
          authSource: resolved.source,
        },
      });
    }
  }

  async runImmediately({
    eventDate,
    scrimId,
    teamId,
    accountId,
  }: {
    eventDate: string;
    scrimId: number;
    teamId: number | null;
    accountId: string | null;
  }) {
    const validatedDate = parseEventDate(eventDate);
    const resolved = await this.resolveEntryAccount({
      teamId,
      accountId,
    });
    const now = new Date();

    const lines = [
      "📝 応募を即時送信します。",
      `- 開催日: ${validatedDate}`,
      `- scrim_id: ${scrimId}`,
      `- team_id: ${resolved.teamId} (${this.describeTeamSource(resolved)})`,
      "- モード: 即時送信 (リトライなし)",
    ];

    const accountSummary = this.describeAccount(resolved);
    if (accountSummary) {
      lines.push(`- アカウント: ${accountSummary}`);
    }

    this.headerLines = [...lines];

    this.rootMessage = await this.interaction.reply({
      content: lines.join("\n"),
      allowedMentions: ALLOWED_MENTIONS,
      fetchReply: true,
    });

    await this.prepareProgressTargets(validatedDate, scrimId);

    try {
      const result = await this.scheduler.runEntryImmediately({
        userId: this.interaction.user.id,
        scrimId,
        teamId: resolved.teamId,
        entryDate: validatedDate,
        logHook: (text) => this.sendProgress(text),
        resultHook: (jobResult) => this.handleResult(jobResult),
        now,
        ...(resolved.accountContext
          ? { accountContext: resolved.accountContext }
          : {}),
      });

      const status = result.ok ? "成功" : "失敗";
      const statusCode = result.statusCode ?? "不明";
      this.headerLines.push(`- 結果: ${status} (status=${statusCode})`);
      await this.interaction.editReply({
        content: this.headerLines.join("\n"),
        allowedMentions: ALLOWED_MENTIONS,
      });

      await this.auditLogger.log({
        action: "escl.entry.immediate",
        status: result.ok ? "success" : "failure",
        description: result.summary,
        details: {
          scrimId,
          teamId: resolved.teamId,
          statusCode: result.statusCode,
          accountId: resolved.accountId,
          accountLabel: resolved.accountLabel,
          authSource: resolved.source,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("応募の即時送信に失敗しました", {
        message,
        scrimId,
        teamId: resolved.teamId,
      });
      await this.sendProgress(
        "❌ 応募の送信に失敗しました。後ほど再度お試しください。"
      );

      await this.auditLogger.log({
        action: "escl.entry.immediate",
        status: "failure",
        description: message,
        details: {
          scrimId,
          teamId: resolved.teamId,
          accountId: resolved.accountId,
          accountLabel: resolved.accountLabel,
          authSource: resolved.source,
        },
      });
    }
  }

  private async prepareProgressTargets(eventDate: string, scrimId: number) {
    const channel = this.interaction.channel;
    const targets: ProgressTarget[] = [];
    let fallback: ProgressTarget | null = null;

    const primary = toProgressTarget(channel);

    if (channel && channel.isThread()) {
      if (primary) {
        targets.push(primary);
      }
      this.progressTargets = targets;
      return;
    }

    if (primary) {
      fallback = primary;
    }

    if (channel && channel.isTextBased() && channel.type !== ChannelType.DM && this.rootMessage) {
      const baseName = `entry-${eventDate}-scrim${scrimId}`;
      const threadName =
        safeFilenameComponent(baseName).slice(0, THREAD_NAME_MAX) || "entry-progress";

      try {
        const thread = await this.rootMessage.startThread({
          name: threadName,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          reason: "ESCL entry progress",
        });

        targets.push(thread);

        await thread.send({
          content: "応募ジョブの進捗をこのスレッドで共有します。",
          allowedMentions: ALLOWED_MENTIONS,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("応募進捗スレッドの作成に失敗しました", {
          message,
          channelId: channel.id,
        });
      }
    }

    if (fallback && !targets.includes(fallback)) {
      targets.push(fallback);

      const isThreadChannel =
        fallback.type === ChannelType.PublicThread ||
        fallback.type === ChannelType.PrivateThread ||
        fallback.type === ChannelType.AnnouncementThread;

      if (!isThreadChannel) {
        try {
          await this.interaction.followUp({
            content: "⚠️ スレッドを作成できなかったため、このチャンネルで進捗を共有します。",
            allowedMentions: ALLOWED_MENTIONS,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("応募進捗フォールバック通知の送信に失敗しました", {
            message,
          });
        }
      }
    }

    this.progressTargets = targets;
  }

  private async sendProgress(message: string) {
    for (const target of this.progressTargets) {
      try {
        await target.send({ content: message, allowedMentions: ALLOWED_MENTIONS });
        return;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        logger.warn("応募進捗メッセージの送信に失敗しました", {
          message,
          targetId: target.id,
          error: text,
        });
      }
    }

    logger.warn("応募進捗メッセージの送信先が見つかりませんでした", {
      message,
    });
  }

  private async handleResult(result: EntryJobResult) {
    await this.sendProgress(formatEntryResult(result));
  }

  private async resolveEntryAccount(params: {
    teamId: number | null;
    accountId: string | null;
  }): Promise<ResolvedEntryAccount> {
    try {
      return await this.environment.resolveAccountForEntry({
        userId: this.interaction.user.id,
        accountId: params.accountId,
        allowLegacyEnv: true,
        teamIdOverride: params.teamId,
      });
    } catch (error) {
      if (error instanceof EntryCommandError) {
        throw error;
      }

      if (error instanceof AccountManagerError) {
        throw new EntryCommandError(error.message);
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error("応募資格情報の解決に失敗しました", {
        message,
        userId: this.interaction.user.id,
      });
      throw new EntryCommandError(
        "応募に利用する資格情報を解決できませんでした。後ほど再度お試しください。"
      );
    }
  }

  private describeTeamSource(resolved: ResolvedEntryAccount) {
    if (resolved.source === "account") {
      if (resolved.accountLabel) {
        return resolved.accountLabel;
      }
      if (resolved.accountId) {
        return `アカウント ${resolved.accountId}`;
      }
      return "アカウント登録値";
    }
    return "レガシー設定";
  }

  private describeAccount(resolved: ResolvedEntryAccount) {
    if (resolved.accountId) {
      return resolved.accountLabel
        ? `${resolved.accountLabel} (${resolved.accountId})`
        : resolved.accountId;
    }

    if (resolved.source === "legacy") {
      return "レガシー (ESCL_JWT)";
    }

    return null;
  }
}
