export declare const FOLLOW_UP_BUTTON_PREFIX = "codex:followup:button:";
export declare const FOLLOW_UP_MODAL_PREFIX = "codex:followup:modal:";
export type FollowUpButtonPayload = {
    runId: string;
};
export type FollowUpModalPayload = {
    runId: string;
    requesterId: string;
};
export declare const buildFollowUpButtonId: (runId: string) => string;
export declare const parseFollowUpButtonId: (customId: string) => FollowUpButtonPayload | null;
export declare const buildFollowUpModalId: (runId: string, requesterId: string) => string;
export declare const parseFollowUpModalId: (customId: string) => FollowUpModalPayload | null;
export declare const FOLLOW_UP_MODAL_TITLE_INPUT_ID = "title";
export declare const FOLLOW_UP_MODAL_SUMMARY_INPUT_ID = "summary";
export declare const FOLLOW_UP_MODAL_DETAILS_INPUT_ID = "details";
//# sourceMappingURL=followUp.d.ts.map