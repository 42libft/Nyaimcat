import type { Client, PresenceData } from "discord.js";

import { logger } from "../utils/logger";

type PresenceBuilder = () => PresenceData | null | undefined;

export class PresenceManager {
  private started = false;
  private presenceBuilder: PresenceBuilder | undefined = () => ({
    status: "online",
    activities: [],
  });

  constructor(private readonly client: Client) {}

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    void this.refresh();
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;
  }

  async refresh() {
    if (!this.started || !this.client.isReady() || !this.client.user) {
      return;
    }

    const presence = this.presenceBuilder?.();

    if (!presence) {
      return;
    }

    try {
      await this.client.user.setPresence(presence);
      logger.debug("Discord プレゼンスを更新しました", {
        status: presence.status,
        activity:
          presence.activities?.[0]?.state ??
          presence.activities?.[0]?.name ??
          null,
      });
    } catch (error) {
      logger.warn("Discord プレゼンス更新に失敗しました", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 外部からプレゼンス構築ロジックを差し替えられるようにしておく。
  setPresenceBuilder(builder?: PresenceBuilder) {
    this.presenceBuilder = builder;

    if (this.started) {
      void this.refresh();
    }
  }
}
