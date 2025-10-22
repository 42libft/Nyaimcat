import { randomUUID } from "crypto";

import { SELECTION_SESSION_TTL_MS } from "./shared";

export type WorkSelectionSessionData = {
  userId: string;
  skipNotify: boolean;
  selectedNotifyChannelId?: string;
  commandChannelId?: string;
  updateDocsOption?: boolean;
  effectiveUpdateDocs: boolean;
  allowedFilenames: string[];
};

export type WorkSelectionContext = WorkSelectionSessionData & {
  createdAt: number;
};

const workSelectionSessions = new Map<string, WorkSelectionContext>();

const isExpired = (session: WorkSelectionContext) =>
  Date.now() - session.createdAt > SELECTION_SESSION_TTL_MS;

const pruneSelectionSessions = () => {
  for (const [key, session] of workSelectionSessions) {
    if (isExpired(session)) {
      workSelectionSessions.delete(key);
    }
  }
};

export const createSelectionSession = (
  data: WorkSelectionSessionData
): string => {
  pruneSelectionSessions();
  const sessionId = randomUUID();
  workSelectionSessions.set(sessionId, {
    ...data,
    createdAt: Date.now(),
  });
  return sessionId;
};

export const getSelectionSession = (
  sessionId: string
): WorkSelectionContext | null => {
  pruneSelectionSessions();
  const session = workSelectionSessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (isExpired(session)) {
    workSelectionSessions.delete(sessionId);
    return null;
  }

  return session;
};

export const deleteSelectionSession = (sessionId: string) => {
  workSelectionSessions.delete(sessionId);
};
