import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";

import type { CommandExecuteContext, SlashCommandModule } from "./types";
import type {
  RagMode,
  RagHealth,
  RagMemoryPruneResult,
} from "../../rag/client";

const TEXT_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
] as const;

const isFetchableChannel = (channel: unknown): channel is GuildTextBasedChannel =>
  typeof channel === "object" &&
  channel !== null &&
  "isTextBased" in channel &&
  typeof (channel as GuildTextBasedChannel).isTextBased === "function" &&
  (channel as GuildTextBasedChannel).isTextBased() &&
  "messages" in channel;

const builder = new SlashCommandBuilder()
  .setName("rag")
  .setDescription("RAG サービスとの連携操作を行います")
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("RAG サービスの稼働状況を表示します")
  )
  .addSubcommand((sub) =>
    sub
      .setName("mode")
      .setDescription("メンション時の応答モードを切り替えます")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("応答モード (help/coach/chat)")
          .setRequired(true)
          .addChoices(
            { name: "ヘルプ", value: "help" },
            { name: "コーチ", value: "coach" },
            { name: "チャット", value: "chat" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("feeling")
      .setDescription("感情・発話頻度パラメータを調整します")
      .addNumberOption((option) =>
        option
          .setName("excitement")
          .setDescription("興奮度 (0.0-1.0)")
          .setMinValue(0)
          .setMaxValue(1)
      )
      .addNumberOption((option) =>
        option
          .setName("empathy")
          .setDescription("共感度 (0.0-1.0)")
          .setMinValue(0)
          .setMaxValue(1)
      )
      .addNumberOption((option) =>
        option
          .setName("probability")
          .setDescription("自発発話の基本確率 (0.0-1.0)")
          .setMinValue(0)
          .setMaxValue(1)
      )
      .addNumberOption((option) =>
        option
          .setName("cooldown")
          .setDescription("自発発話のクールダウン (分)")
          .setMinValue(0)
      )
  );

builder.addSubcommand((sub) =>
  sub
    .setName("ingest")
    .setDescription("指定チャンネルの履歴を RAG に取り込みます（最大100件）")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("取り込み対象のチャンネル")
        .setRequired(true)
        .addChannelTypes(...TEXT_CHANNEL_TYPES)
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("最大取得件数（1-100）")
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("過去何日分まで遡るか（指定しない場合は制限なし）")
        .setMinValue(1)
        .setMaxValue(365)
    )
);

builder.addSubcommandGroup((group) =>
  group
    .setName("memo")
    .setDescription("Markdown メモを RAG に登録します")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("タイトルと本文を入力してメモを登録します")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("メモのタイトル")
            .setRequired(true)
            .setMaxLength(128)
        )
        .addStringOption((option) =>
          option
            .setName("content")
            .setDescription("メモの本文（最大2000文字）")
            .setRequired(true)
            .setMaxLength(2000)
        )
        .addStringOption((option) =>
          option
            .setName("tags")
            .setDescription("カンマ区切りでタグを指定（例: aim,コーチング）")
            .setMaxLength(200)
        )
    )
);

builder.addSubcommandGroup((group) =>
  group
    .setName("memory")
    .setDescription("短期記憶やログのメンテナンスを行います")
    .addSubcommand((sub) =>
      sub
        .setName("prune")
        .setDescription("指定日数より古いメッセージ記憶を削除します")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("何日より古い記憶を間引くか（1-365）")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(365)
        )
    )
);

const formatStatus = (health: RagHealth) => {
  const formatNumber = (value: unknown) =>
    typeof value === "number" ? value.toFixed(2) : "未設定";

  const memorySize =
    health.memory && typeof health.memory.size === "number"
      ? health.memory.size
      : 0;
  const cooldownText =
    typeof health.cooldown_minutes === "number"
      ? `${health.cooldown_minutes.toFixed(1)} 分`
      : "未設定";

  const lines = [
    `モード: **${health.mode ?? "不明"}**`,
    `興奮度: ${formatNumber(health.excitement)}`,
    `共感度: ${formatNumber(health.empathy)}`,
    `基本確率: ${formatNumber(health.probability)}`,
    `クールダウン: ${cooldownText}`,
    `直近メモリ: ${memorySize} 件`,
    `Chroma: ${health.chroma_ready ? "Ready" : "Disabled"}`,
    `読み込み済みドキュメント: ${health.loaded_documents ?? 0} 件`,
  ];

  if (health.last_reply_at) {
    lines.push(`最終応答: ${health.last_reply_at}`);
  }
  if (Array.isArray(health.excluded_channels)) {
    lines.push(`除外チャンネル: ${health.excluded_channels.length} 件`);
  }

  return lines.join("\n");
};

const formatPruneResult = (result: RagMemoryPruneResult) =>
  [
    `短期記憶: ${result.removed_short_term} 件`,
    `Chroma: ${result.removed_chroma} 件`,
  ].join("\n");

const execute = async (
  interaction: ChatInputCommandInteraction,
  context: CommandExecuteContext
) => {
  await interaction.deferReply({ ephemeral: true });

  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  try {
    if (group === "memo" && subcommand === "add") {
      const title = interaction.options.getString("title", true);
      const content = interaction.options.getString("content", true);
      const tagsRaw = interaction.options.getString("tags");
      const tags =
        tagsRaw?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];

      await context.ragClient.registerMemo({
        title,
        content,
        tags,
      });

      await interaction.editReply({
        content: `メモ **${title}** を登録しました。（タグ: ${
          tags.length ? tags.join(", ") : "なし"
        }）`,
      });
      return;
    }

    if (group === "memory" && subcommand === "prune") {
      const days = interaction.options.getInteger("days", true);
      const result = await context.ragClient.pruneMemory({ days });

      const summary = formatPruneResult(result);
      await interaction.editReply({
        content: `過去 **${days} 日** より古い記憶を整理しました。\n${summary}`,
      });
      return;
    }

    if (subcommand === "status") {
      const health = await context.ragClient.getHealth();
      await interaction.editReply({
        content: formatStatus(health),
      });
      return;
    }

    if (subcommand === "mode") {
      const mode = interaction.options.getString("type", true) as RagMode;
      await context.ragClient.switchMode({ mode });
      const health = await context.ragClient.getHealth();
      await interaction.editReply({
        content: `応答モードを **${mode}** に変更しました。\n\n${formatStatus(
          health
        )}`,
      });
      return;
    }

    if (subcommand === "feeling") {
      const excitement = interaction.options.getNumber("excitement");
      const empathy = interaction.options.getNumber("empathy");
      const probability = interaction.options.getNumber("probability");
      const cooldown = interaction.options.getNumber("cooldown");

      if (
        excitement === null &&
        empathy === null &&
        probability === null &&
        cooldown === null
      ) {
        await interaction.editReply({
          content: "調整するパラメータを最低1つは指定してください。",
        });
        return;
      }

      await context.ragClient.adjustFeeling({
        excitement: excitement ?? undefined,
        empathy: empathy ?? undefined,
        probability: probability ?? undefined,
        cooldown_minutes: cooldown ?? undefined,
      });

      const health = await context.ragClient.getHealth();
      await interaction.editReply({
        content: `感情パラメータを更新しました。\n\n${formatStatus(
          health
        )}`,
      });
      return;
    }

    if (subcommand === "ingest") {
      const channel = interaction.options.getChannel("channel", true, TEXT_CHANNEL_TYPES);
      const limit = interaction.options.getInteger("limit") ?? 100;
      const days = interaction.options.getInteger("days");

      if (!isFetchableChannel(channel)) {
        await interaction.editReply({
          content: "テキストチャンネル以外は取り込み対象にできません。",
        });
        return;
      }

      let fetched;
      try {
        fetched = await channel.messages.fetch({ limit });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await interaction.editReply({
          content: `メッセージの取得に失敗しました: ${message}`,
        });
        return;
      }
      const cutoff =
        days !== null
          ? Date.now() - days * 24 * 60 * 60 * 1000
          : undefined;

      const clientUser = context.client.user;
      const filtered = fetched
        .filter((message) => {
          if (!message.content?.trim()) {
            return false;
          }
          if (message.author.bot) {
            return false;
          }
          if (cutoff && message.createdTimestamp < cutoff) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let successCount = 0;
      for (const message of filtered.values()) {
        try {
          await context.ragClient.postMessage({
            message_id: message.id,
            guild_id: message.guildId ?? interaction.guildId ?? "unknown",
            channel_id: message.channelId,
            author_id: message.author.id,
            content: message.content,
            timestamp: new Date(message.createdTimestamp).toISOString(),
            is_mention: clientUser ? message.mentions.users.has(clientUser.id) : false,
            tags: [],
          });
          successCount += 1;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          await context.auditLogger.log({
            action: "rag.ingest.error",
            status: "error",
            details: {
              messageId: message.id,
              channelId: message.channelId,
              reason: msg,
            },
          });
        }
      }

      await interaction.editReply({
        content: `${channel} から ${successCount} 件のメッセージを取り込みました。`,
      });
      return;
    }

    await interaction.editReply({
      content: `未対応のサブコマンドです: ${subcommand}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await interaction.editReply({
      content: `RAG サービスとの通信に失敗しました: ${message}`,
    });
  }
};

export const ragCommand: SlashCommandModule = {
  data: builder,
  execute,
};
