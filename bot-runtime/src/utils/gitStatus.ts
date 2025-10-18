import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type GitStatusEntry = {
  path: string;
  status: string;
  originalPath?: string | null;
};

const parseStatusTokens = (output: string): GitStatusEntry[] => {
  if (!output) {
    return [];
  }

  const tokens = output.split("\0");
  const entries: GitStatusEntry[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    if (token.length < 3) {
      continue;
    }

    const status = token.slice(0, 2);
    const separator = token[2];
    if (separator !== " ") {
      continue;
    }

    let path = token.slice(3);
    let originalPath: string | null | undefined;

    if (
      (status.startsWith("R") || status.startsWith("C")) &&
      index + 1 < tokens.length
    ) {
      originalPath = path;
      path = tokens[index + 1] ?? path;
      index++;
    }

    const entry: GitStatusEntry = {
      path,
      status,
    };

    if (originalPath !== undefined) {
      entry.originalPath = originalPath ?? null;
    }

    entries.push(entry);
  }

  return entries;
};

export const getGitStatusEntries = async (
  cwd: string
): Promise<GitStatusEntry[]> => {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain", "-z"],
    {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  return parseStatusTokens(stdout ?? "");
};

export const diffGitStatusEntries = (
  before: GitStatusEntry[],
  after: GitStatusEntry[]
): GitStatusEntry[] => {
  if (before.length === 0) {
    return after.slice();
  }

  const beforeMap = new Map(before.map((entry) => [entry.path, entry]));
  const diff: GitStatusEntry[] = [];

  for (const entry of after) {
    const previous = beforeMap.get(entry.path);
    if (!previous) {
      diff.push(entry);
      continue;
    }

    if (
      previous.status !== entry.status ||
      previous.originalPath !== entry.originalPath
    ) {
      diff.push(entry);
    }
  }

  return diff;
};
