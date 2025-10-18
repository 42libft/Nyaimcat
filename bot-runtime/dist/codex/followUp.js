"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOLLOW_UP_MODAL_DETAILS_INPUT_ID = exports.FOLLOW_UP_MODAL_SUMMARY_INPUT_ID = exports.FOLLOW_UP_MODAL_TITLE_INPUT_ID = exports.parseFollowUpModalId = exports.buildFollowUpModalId = exports.parseFollowUpButtonId = exports.buildFollowUpButtonId = exports.FOLLOW_UP_MODAL_PREFIX = exports.FOLLOW_UP_BUTTON_PREFIX = void 0;
exports.FOLLOW_UP_BUTTON_PREFIX = "codex:followup:button:";
exports.FOLLOW_UP_MODAL_PREFIX = "codex:followup:modal:";
const buildFollowUpButtonId = (runId) => {
    return `${exports.FOLLOW_UP_BUTTON_PREFIX}${runId}`;
};
exports.buildFollowUpButtonId = buildFollowUpButtonId;
const parseFollowUpButtonId = (customId) => {
    if (!customId.startsWith(exports.FOLLOW_UP_BUTTON_PREFIX)) {
        return null;
    }
    const runId = customId.substring(exports.FOLLOW_UP_BUTTON_PREFIX.length).trim();
    if (!runId) {
        return null;
    }
    return { runId };
};
exports.parseFollowUpButtonId = parseFollowUpButtonId;
const buildFollowUpModalId = (runId, requesterId) => {
    return `${exports.FOLLOW_UP_MODAL_PREFIX}${runId}:${requesterId}`;
};
exports.buildFollowUpModalId = buildFollowUpModalId;
const parseFollowUpModalId = (customId) => {
    if (!customId.startsWith(exports.FOLLOW_UP_MODAL_PREFIX)) {
        return null;
    }
    const payload = customId.substring(exports.FOLLOW_UP_MODAL_PREFIX.length);
    const [runId, requesterId] = payload.split(":");
    if (!runId || !requesterId) {
        return null;
    }
    return {
        runId,
        requesterId,
    };
};
exports.parseFollowUpModalId = parseFollowUpModalId;
exports.FOLLOW_UP_MODAL_TITLE_INPUT_ID = "title";
exports.FOLLOW_UP_MODAL_SUMMARY_INPUT_ID = "summary";
exports.FOLLOW_UP_MODAL_DETAILS_INPUT_ID = "details";
//# sourceMappingURL=followUp.js.map