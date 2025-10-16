import { existsSync } from "fs";
import path from "path";

const TASKS_DIR_NAME = "tasks";

const resolveRepoRoot = () => {
  const candidates = [
    path.resolve(process.cwd(), ".."),
    process.cwd(),
    path.resolve(__dirname, "..", "..", ".."),
    path.resolve(__dirname, "..", "..", "..", ".."),
  ];

  for (const candidate of candidates) {
    const tasksPath = path.join(candidate, TASKS_DIR_NAME);
    if (existsSync(tasksPath)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "..");
};

export const REPO_ROOT = resolveRepoRoot();
export const TASKS_ROOT = path.join(REPO_ROOT, TASKS_DIR_NAME);
export const INBOX_DIR = path.join(TASKS_ROOT, "inbox");
