import type { Client, TextBasedChannel, TextChannel } from "discord.js";

import type { BotConfig } from "../config";
import { logger } from "../utils/logger";

export type AuditLogStatus = "success" | "failure" | "info";

export type AuditLogPayload = {
  action: string;
  status: AuditLogStatus;
  description?: string;
  details?: Record<string, unknown>;
};

type SendableChannel = TextBasedChannel & {
  send: TextChannel["send"];
};

const formatAuditMessage = (payload: AuditLogPayload) => {
  const body = {
    action: payload.action,
    status: payload.status,
    description: payload.description ?? null,
    details: payload.details ?? null,
    timestamp: new Date().toISOString(),
  };

  return `\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;
};

export class AuditLogger {
  private readonly client: Client;
  private channelId: string | null;
  private channel: SendableChannel | null = null;

  constructor(client: Client, config: BotConfig) {
    this.client = client;
    this.channelId = config.channels.auditLog ?? null;
  }

  updateConfig(config: BotConfig) {
    const nextChannelId = config.channels.auditLog ?? null;

    if (this.channelId !== nextChannelId) {
      this.channel = null;
    }

    this.channelId = nextChannelId;
  }

  async log(payload: AuditLogPayload) {
    if (!this.channelId) {
      logger.warn("監査ログチャンネルが設定されていないため、監査ログを送信できません");
      return;
    }

    try {
      const channel = await this.ensureChannel();

      if (!channel) {
        throw new Error("監査ログチャンネルの取得に失敗しました");
      }

      await channel.send({ content: formatAuditMessage(payload) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("監査ログの送信に失敗しました", {
        message,
        channelId: this.channelId,
      });
    }
  }

  private async ensureChannel(): Promise<SendableChannel | null> {
    if (this.channel) {
      return this.channel;
    }

    if (!this.channelId) {
      return null;
    }

    const fetched = await this.client.channels.fetch(this.channelId);

    if (!fetched || !fetched.isTextBased()) {
      return null;
    }

    const candidate = fetched as Partial<SendableChannel>;

    if (typeof candidate.send !== "function") {
      return null;
    }

    this.channel = candidate as SendableChannel;
    return this.channel;
  }
}
