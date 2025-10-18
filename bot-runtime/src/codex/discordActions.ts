import {
  REST,
  Routes,
  type APIEmbed,
  type APIAllowedMentions,
  type RESTPostAPIChannelMessageJSONBody,
  type RESTPostAPIChannelMessageResult,
  type RawFile,
} from "discord.js";

import { logger } from "../utils/logger";

export type DiscordActionsConfig = {
  token: string;
  allowedChannelIds: string[];
  defaultAllowedMentions?: APIAllowedMentions;
  restVersion?: string;
};

export type PublishMessageOptions = {
  content?: string;
  embeds?: APIEmbed[];
  allowedMentions?: APIAllowedMentions;
  components?: RESTPostAPIChannelMessageJSONBody["components"];
  flags?: RESTPostAPIChannelMessageJSONBody["flags"];
  files?: RawFile[];
};

const WILDCARD_CHANNEL = "*";

const sanitizeChannelIds = (ids: string[]): string[] => {
  const unique = Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );

  return unique;
};

const hasMessageBody = (payload: PublishMessageOptions): boolean => {
  if (payload.content && payload.content.trim().length > 0) {
    return true;
  }

  if (payload.embeds && payload.embeds.length > 0) {
    return true;
  }

  if (payload.components && payload.components.length > 0) {
    return true;
  }

  if (payload.files && payload.files.length > 0) {
    return true;
  }

  return false;
};

export class DiscordActions {
  private readonly rest: REST;
  private readonly allowedChannelIds: Set<string>;
  private readonly defaultAllowedMentions: APIAllowedMentions | undefined;
  private readonly allowAllChannels: boolean;

  constructor(config: DiscordActionsConfig) {
    if (!config.token || config.token.length === 0) {
      throw new Error("DiscordActions を初期化するには token が必要です。");
    }

    const channelIds = sanitizeChannelIds(config.allowedChannelIds);
    if (channelIds.length === 0) {
      throw new Error("DiscordActions には最低 1 件の許可チャンネル ID が必要です。");
    }

    this.rest = new REST({ version: config.restVersion ?? "10" }).setToken(config.token);
    this.allowAllChannels = channelIds.includes(WILDCARD_CHANNEL);
    this.allowedChannelIds = new Set(
      this.allowAllChannels ? channelIds.filter((id) => id !== WILDCARD_CHANNEL) : channelIds
    );
    this.defaultAllowedMentions =
      config.defaultAllowedMentions ?? { parse: [] };
  }

  getAllowedChannels() {
    if (this.allowAllChannels) {
      return [WILDCARD_CHANNEL, ...this.allowedChannelIds];
    }
    return Array.from(this.allowedChannelIds);
  }

  isChannelAllowed(channelId: string) {
    return this.allowAllChannels || this.allowedChannelIds.has(channelId);
  }

  private ensureChannelAllowed(channelId: string) {
    if (!this.isChannelAllowed(channelId)) {
      throw new Error(
        `チャンネル ${channelId} は Codex 実行許可リストに登録されていません。`
      );
    }
  }

  async publishMessage(channelId: string, payload: PublishMessageOptions) {
    this.ensureChannelAllowed(channelId);

    if (!hasMessageBody(payload)) {
      throw new Error("content / embeds / components / files のいずれかが必要です。");
    }

    const body: RESTPostAPIChannelMessageJSONBody = {
      content: payload.content,
      embeds: payload.embeds,
      allowed_mentions: payload.allowedMentions ?? this.defaultAllowedMentions,
      components: payload.components,
      flags: payload.flags,
    };

    logger.info("Discord への投稿を実行します", {
      channelId,
      hasContent: Boolean(body.content && body.content.length > 0),
      embedCount: body.embeds?.length ?? 0,
      componentCount: body.components?.length ?? 0,
      fileCount: payload.files?.length ?? 0,
    });

    try {
      const result = (await this.rest.post(Routes.channelMessages(channelId), {
        body,
        files: payload.files,
      })) as RESTPostAPIChannelMessageResult;

      logger.info("Discord への投稿が完了しました", {
        channelId,
        messageId: result.id,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Discord への投稿に失敗しました", {
        channelId,
        error: message,
      });
      throw error;
    }
  }
}

const splitEnvList = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const loadDiscordActionsConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): DiscordActionsConfig => {
  const token = env.CODEX_DISCORD_TOKEN ?? env.DISCORD_TOKEN ?? "";

  const allowedChannelIds = splitEnvList(env.CODEX_DISCORD_ALLOWED_CHANNELS);

  const allowedUsers = splitEnvList(env.CODEX_DISCORD_ALLOWED_USERS);
  const allowedRoles = splitEnvList(env.CODEX_DISCORD_ALLOWED_ROLES);

  const defaultAllowedMentions: APIAllowedMentions | undefined =
    allowedUsers.length > 0 || allowedRoles.length > 0
      ? { parse: [], users: allowedUsers, roles: allowedRoles }
      : undefined;

  const restVersion = env.CODEX_DISCORD_REST_VERSION;

  const config: DiscordActionsConfig = {
    token,
    allowedChannelIds,
  };

  if (defaultAllowedMentions) {
    config.defaultAllowedMentions = defaultAllowedMentions;
  }

  if (restVersion) {
    config.restVersion = restVersion;
  }

  return config;
};

export const createDiscordActionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env
) => {
  const config = loadDiscordActionsConfigFromEnv(env);
  return new DiscordActions(config);
};
