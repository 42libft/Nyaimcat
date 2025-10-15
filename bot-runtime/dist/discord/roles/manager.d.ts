import { ButtonInteraction, Client, Message, MessageReaction, PartialMessageReaction, PartialUser, StringSelectMenuInteraction, User } from "discord.js";
import type { BotConfig } from "../../config";
import type { AuditLogger } from "../auditLogger";
type PublishOptions = {
    executorId: string;
    channelId?: string | null;
};
type PublishResult = {
    message: Message;
    created: boolean;
};
export declare class RolesPanelManager {
    private readonly client;
    private readonly auditLogger;
    private config;
    private lastPublishedMessageId;
    constructor(client: Client, auditLogger: AuditLogger, config: BotConfig);
    updateConfig(config: BotConfig): void;
    publish(options: PublishOptions): Promise<PublishResult>;
    handleButton(interaction: ButtonInteraction): Promise<void>;
    handleSelect(interaction: StringSelectMenuInteraction): Promise<void>;
    handleReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void>;
    handleReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void>;
    private getRolesConfig;
    private getVisibleRoles;
    private buildMessagePayload;
    private syncReactionsIfNeeded;
    private buildReactionMap;
    private matchesTargetMessage;
    private resolveRoleIdForReaction;
    private updateMemberRole;
}
export {};
//# sourceMappingURL=manager.d.ts.map