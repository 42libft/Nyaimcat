export const FOLLOW_UP_BUTTON_PREFIX = "codex:followup:button:";
export const FOLLOW_UP_MODAL_PREFIX = "codex:followup:modal:";

export type FollowUpButtonPayload = {
  runId: string;
};

export type FollowUpModalPayload = {
  runId: string;
  requesterId: string;
};

export const buildFollowUpButtonId = (runId: string): string => {
  return `${FOLLOW_UP_BUTTON_PREFIX}${runId}`;
};

export const parseFollowUpButtonId = (
  customId: string
): FollowUpButtonPayload | null => {
  if (!customId.startsWith(FOLLOW_UP_BUTTON_PREFIX)) {
    return null;
  }

  const runId = customId.substring(FOLLOW_UP_BUTTON_PREFIX.length).trim();
  if (!runId) {
    return null;
  }

  return { runId };
};

export const buildFollowUpModalId = (
  runId: string,
  requesterId: string
): string => {
  return `${FOLLOW_UP_MODAL_PREFIX}${runId}:${requesterId}`;
};

export const parseFollowUpModalId = (
  customId: string
): FollowUpModalPayload | null => {
  if (!customId.startsWith(FOLLOW_UP_MODAL_PREFIX)) {
    return null;
  }

  const payload = customId.substring(FOLLOW_UP_MODAL_PREFIX.length);
  const [runId, requesterId] = payload.split(":");

  if (!runId || !requesterId) {
    return null;
  }

  return {
    runId,
    requesterId,
  };
};

export const FOLLOW_UP_MODAL_TITLE_INPUT_ID = "title";
export const FOLLOW_UP_MODAL_SUMMARY_INPUT_ID = "summary";
export const FOLLOW_UP_MODAL_DETAILS_INPUT_ID = "details";
