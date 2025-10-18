import { existsSync } from "fs";
import path from "path";

const TASKS_DIR_NAME = "tasks";

const resolveRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    __dirname,
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
    path.resolve(__dirname, "..", "..", "..", ".."),
  ];

  const visited = new Set<string>();
  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (visited.has(normalized)) {
      continue;
    }
    visited.add(normalized);

    const tasksPath = path.join(normalized, TASKS_DIR_NAME);
    if (existsSync(tasksPath)) {
      return normalized;
    }
  }

  const repoFallback = path.resolve(__dirname, "..", "..", "..");
  return repoFallback;
};

export const REPO_ROOT = resolveRepoRoot();
export const TASKS_ROOT = path.join(REPO_ROOT, TASKS_DIR_NAME);
export const INBOX_DIR = path.join(TASKS_ROOT, "inbox");
export const RUN_HISTORY_DIR = path.join(TASKS_ROOT, "runs");
export const RUN_FAILURE_DIR = path.join(RUN_HISTORY_DIR, "failures");
export const HEALTH_HISTORY_DIR = path.join(RUN_HISTORY_DIR, "health");
