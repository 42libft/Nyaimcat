import { ChatInputCommandInteraction, ModalSubmitInteraction, type Attachment } from "discord.js";
import type { BotConfig } from "../../config";
import type { AuditLogger } from "../auditLogger";
declare const INTRODUCE_MODAL_ID = "introduce:submit";
export declare class IntroduceManager {
    private readonly auditLogger;
    private config;
    private readonly pendingSubmissions;
    constructor(auditLogger: AuditLogger, config: BotConfig);
    updateConfig(config: BotConfig): void;
    openModal(interaction: ChatInputCommandInteraction, options?: {
        imageAttachment?: Attachment;
    }): Promise<void>;
    handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void>;
    private getIntroduceConfig;
    private getSchema;
    private buildModalId;
    private buildModal;
    private collectSubmissionValues;
    private buildEmbed;
    private safeErrorReply;
    private buildMessageContent;
    private storePendingSubmission;
    private consumePendingSubmission;
    private cleanupPendingSubmissions;
    private normalizeImageAttachment;
    private resolveImageExtension;
}
export { INTRODUCE_MODAL_ID };
//# sourceMappingURL=manager.d.ts.map