import { type RawFile } from "discord.js";

import { logger } from "../../utils/logger";
import type { CodexRunnerResult } from "../runner";
import {
  DISCORD_ATTACHMENT_LIMIT_BYTES,
} from "./constants";

const buildStdoutAttachmentName = (runId: string) =>
  `codex-${runId}-stdout.txt`;
const buildStderrAttachmentName = (runId: string) =>
  `codex-${runId}-stderr.txt`;

const createTextAttachment = (
  name: string,
  content: string,
  context: { runId: string; kind: "stdout" | "stderr" }
): RawFile | null => {
  if (!content || content.length === 0) {
    return null;
  }

  const data = Buffer.from(content, "utf-8");

  if (data.length === 0) {
    return null;
  }

  if (data.length > DISCORD_ATTACHMENT_LIMIT_BYTES) {
    logger.warn("Codex ログの添付ファイルが Discord のサイズ制限を超えたためスキップします", {
      runId: context.runId,
      kind: context.kind,
      bytes: data.length,
    });
    return null;
  }

  return {
    name,
    data,
  };
};

export const buildLogAttachments = (result: CodexRunnerResult): RawFile[] => {
  const attachments: RawFile[] = [];

  const stdoutAttachment = createTextAttachment(
    buildStdoutAttachmentName(result.runId),
    result.stdout,
    { runId: result.runId, kind: "stdout" }
  );
  if (stdoutAttachment) {
    attachments.push(stdoutAttachment);
  }

  const stderrAttachment = createTextAttachment(
    buildStderrAttachmentName(result.runId),
    result.stderr,
    { runId: result.runId, kind: "stderr" }
  );
  if (stderrAttachment) {
    attachments.push(stderrAttachment);
  }

  return attachments;
};
