import { promises as fs } from "fs";
import path from "path";
import { load as loadYaml } from "js-yaml";

import { INBOX_DIR } from "./paths";

export type TaskPriority = "low" | "normal" | "high";

export type TaskMetadata = {
  title: string;
  priority: TaskPriority;
  priority_label: string | null;
  summary: string | null;
  created_at: string | null;
  author: {
    id: string | null;
    tag: string | null;
  } | null;
  channel_id: string | null;
  interaction_id: string | null;
};

export type TaskFile = {
  filename: string;
  filePath: string;
  metadata: TaskMetadata;
  body: string;
};

const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const buildEmptyMetadata = (title = "件名未設定"): TaskMetadata => ({
  title,
  priority: "normal",
  priority_label: null,
  summary: null,
  created_at: null,
  author: null,
  channel_id: null,
  interaction_id: null,
});

const parsePriority = (value: unknown): TaskPriority => {
  if (value === "low" || value === "normal" || value === "high") {
    return value;
  }

  return "normal";
};

const parseNullableString = (value: unknown): string | null => {
  return typeof value === "string" && value.length > 0 ? value : null;
};

const parseAuthor = (value: unknown): TaskMetadata["author"] => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  const id = parseNullableString(record.id);
  const tag = parseNullableString(record.tag);

  if (!id && !tag) {
    return null;
  }

  return { id: id ?? null, tag: tag ?? null };
};

const parseMetadata = (value: unknown): TaskMetadata => {
  if (!value || typeof value !== "object") {
    return buildEmptyMetadata();
  }

  const record = value as Record<string, unknown>;

  const priority = parsePriority(record.priority);
  const priorityLabel = parseNullableString(record.priority_label);
  const summary = parseNullableString(record.summary);
  const createdAt = parseNullableString(record.created_at);
  const channelId = parseNullableString(record.channel_id);
  const interactionId = parseNullableString(record.interaction_id);

  const title =
    typeof record.title === "string" && record.title.length > 0 ? record.title : "件名未設定";

  const base = buildEmptyMetadata(title);

  return {
    ...base,
    priority,
    priority_label: priorityLabel,
    summary,
    created_at: createdAt,
    author: parseAuthor(record.author),
    channel_id: channelId,
    interaction_id: interactionId,
  };
};

export const ensureInboxDirectory = async () => {
  await fs.mkdir(INBOX_DIR, { recursive: true });
};

const resolveFilePath = (filename: string) => {
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("ファイル名にはパス区切り文字を含められません。");
  }

  return path.join(INBOX_DIR, filename);
};

export const readTaskFile = async (filename: string): Promise<TaskFile> => {
  await ensureInboxDirectory();

  const filePath = resolveFilePath(filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const match = raw.match(FRONT_MATTER_PATTERN);

  if (!match) {
    throw new Error("タスクファイルのフロントマターを解析できませんでした。");
  }

  const [, frontMatter, body] = match;
  const frontMatterContent = frontMatter ?? "";
  const parsedFrontMatter =
    frontMatterContent.length > 0 ? loadYaml(frontMatterContent) : undefined;
  const metadata = parseMetadata(parsedFrontMatter);

  return {
    filename,
    filePath,
    metadata,
    body: (body ?? "").trim(),
  };
};

export const listTaskFiles = async (): Promise<TaskFile[]> => {
  await ensureInboxDirectory();

  const entries = await fs.readdir(INBOX_DIR);
  const markdownFiles = entries.filter((entry) => entry.endsWith(".md"));

  const tasks = await Promise.all(
    markdownFiles.map(async (filename) => {
      try {
        return await readTaskFile(filename);
      } catch (error) {
        return {
          filename,
          filePath: resolveFilePath(filename),
          metadata: buildEmptyMetadata(filename),
          body: "",
        } satisfies TaskFile;
      }
    })
  );

  return tasks.sort((a, b) => {
    const createdA = a.metadata.created_at ?? "";
    const createdB = b.metadata.created_at ?? "";

    if (createdA && createdB) {
      return createdB.localeCompare(createdA);
    }

    return a.filename.localeCompare(b.filename);
  });
};

export const deleteTaskFile = async (filename: string) => {
  await ensureInboxDirectory();

  const filePath = resolveFilePath(filename);
  await fs.unlink(filePath);
};
