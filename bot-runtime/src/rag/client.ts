import { URL } from "node:url";

export type RagMode = "help" | "coach" | "chat";

export type RagHealth = {
  mode?: RagMode | string;
  excitement?: number;
  empathy?: number;
  probability?: number;
  cooldown_minutes?: number;
  memory?: {
    size?: number;
    capacity?: number;
    latest_timestamp?: string | null;
  };
  chroma_ready?: boolean;
  loaded_documents?: number;
  last_reply_at?: string | null;
  excluded_channels?: string[];
};

export type RagChatQuery = {
  prompt: string;
  mode?: RagMode;
  channelId?: string;
  guildId?: string;
  userId?: string;
  includeRecent?: boolean;
  maxContextMessages?: number;
};

export type RagChatResponse = {
  reply: string;
  mode: RagMode;
  used_context: string[];
  knowledge_documents: string[];
  reasoning?: string | null;
};

export type RagMessageEvent = {
  message_id: string;
  guild_id: string;
  channel_id: string;
  author_id: string;
  content: string;
  timestamp: string;
  is_mention?: boolean;
  probable_mode?: RagMode;
  tags?: string[];
};

export type RagFeelingAdjust = {
  excitement?: number;
  empathy?: number;
  probability?: number;
  cooldown_minutes?: number;
};

export type RagModeSwitch = {
  mode: RagMode;
};

export type RagMemoRegistration = {
  title: string;
  content: string;
  tags?: string[];
  source_path?: string | null;
};

export type RagMemoryPruneRequest = {
  days: number;
};

export type RagMemoryPruneResult = {
  removed_short_term: number;
  removed_chroma: number;
};

export type RagClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8100";

export class RagClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RagClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env.RAG_SERVICE_BASE_URL ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `RAG service request failed: ${response.status} ${response.statusText} ${body}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async getHealth(): Promise<RagHealth> {
    return this.request<RagHealth>("/health");
  }

  async postMessage(event: RagMessageEvent): Promise<void> {
    await this.request<void>("/events/message", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  async chat(query: RagChatQuery): Promise<RagChatResponse> {
    const payload = {
      prompt: query.prompt,
      mode: query.mode ?? "chat",
      channel_id: query.channelId,
      guild_id: query.guildId,
      user_id: query.userId,
      include_recent: query.includeRecent ?? true,
      max_context_messages: query.maxContextMessages ?? 15,
    };

    return this.request<RagChatResponse>("/chat/query", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async adjustFeeling(options: RagFeelingAdjust): Promise<void> {
    await this.request<void>("/admin/feeling", {
      method: "POST",
      body: JSON.stringify(options),
    });
  }

  async switchMode(input: RagModeSwitch): Promise<void> {
    await this.request<void>("/admin/mode", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async registerMemo(input: RagMemoRegistration): Promise<void> {
    await this.request<void>("/admin/memo", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async pruneMemory(input: RagMemoryPruneRequest): Promise<RagMemoryPruneResult> {
    return this.request<RagMemoryPruneResult>("/admin/memory/prune", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
