import { ButtonInteraction, Client, Message, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import type { BotConfig } from "../../config";
import type { AuditLogger } from "../auditLogger";
declare const VERIFY_BUTTON_ID = "verify:grant";
type PublishOptions = {
    executorId: string;
    channelId?: string | null;
};
type PublishResult = {
    message: Message;
    created: boolean;
};
export declare class VerifyManager {
    private readonly client;
    private readonly auditLogger;
    private config;
    constructor(client: Client, auditLogger: AuditLogger, config: BotConfig);
    updateConfig(config: BotConfig): void;
    get buttonId(): string;
    publish(options: PublishOptions): Promise<PublishResult>;
    handleButton(interaction: ButtonInteraction): Promise<void>;
    handleReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void>;
    private buildMessagePayload;
    private getVerifyConfig;
    private grantRole;
    private applyRole;
}
export { VERIFY_BUTTON_ID };
//# sourceMappingURL=manager.d.ts.map