import { spawn } from "child_process";
import path from "node:path";

const PYTHON_BIN =
  process.env.ESCL_PYTHON_BIN ??
  process.env.PYTHON ??
  process.env.PYTHON_BIN ??
  "python3";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

type CliPayload =
  | { ok: true; filename: string; content: string }
  | { ok: true; version: string }
  | { ok: false; error: string };

const parsePayload = (raw: string): CliPayload => {
  try {
    return JSON.parse(raw) as CliPayload;
  } catch (error) {
    throw new Error(
      `ESCL CLIからの出力を解析できませんでした: ${(error as Error).message}\n${raw}`
    );
  }
};

const runCli = async (args: string[]) => {
  return await new Promise<CliPayload>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, ["-m", "src.esclbot.cli", ...args], {
      cwd: PROJECT_ROOT,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `ESCL CLIの起動に失敗しました (${error instanceof Error ? error.message : String(
            error
          )})`
        )
      );
    });

    child.on("close", (code) => {
      if (!stdout.trim() && stderr.trim()) {
        reject(
          new Error(
            `ESCL CLIがエラー終了しました (code=${code}): ${stderr.trim()}`
          )
        );
        return;
      }

      try {
        const payload = parsePayload(stdout.trim());
        if (!payload.ok) {
          reject(new Error(payload.error));
          return;
        }
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
  });
};

export type EsclFileResult = {
  filename: string;
  buffer: Buffer;
};

export const runEsclCsv = async (
  parentUrl: string,
  group?: string | null
): Promise<EsclFileResult> => {
  const payload = await runCli([
    "csv",
    parentUrl,
    ...(group ? ["--group", group] : []),
  ]);

  if (!("filename" in payload) || !("content" in payload)) {
    throw new Error("ESCL CLIから期待した応答が得られませんでした。");
  }

  return {
    filename: payload.filename,
    buffer: Buffer.from(payload.content, "base64"),
  };
};

export const runEsclXlsx = async (
  parentUrl: string,
  group?: string | null
): Promise<EsclFileResult> => {
  const payload = await runCli([
    "xlsx",
    parentUrl,
    ...(group ? ["--group", group] : []),
  ]);

  if (!("filename" in payload) || !("content" in payload)) {
    throw new Error("ESCL CLIから期待した応答が得られませんでした。");
  }

  return {
    filename: payload.filename,
    buffer: Buffer.from(payload.content, "base64"),
  };
};

export const runEsclVersion = async (): Promise<string> => {
  const payload = await runCli(["version"]);
  if (!("version" in payload)) {
    throw new Error("ESCL CLIからバージョン情報が取得できませんでした。");
  }
  return payload.version;
};
