import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";

import { logger } from "../utils/logger";
import { ZodError, type ZodIssue } from "zod";
import { BotConfig, ConfigSchema } from "./schema";

export type ConfigLoadSuccess = {
  ok: true;
  path: string;
  config: BotConfig;
};

export type ConfigLoadFailure = {
  ok: false;
  path: string;
  message: string;
  issues?: ZodIssue[];
};

export type ConfigLoadResult = ConfigLoadSuccess | ConfigLoadFailure;

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "config.yaml");

const readFile = async (filePath: string): Promise<string> => {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`設定ファイルの読み込みに失敗しました: ${message}`);
  }
};

const parseYaml = (raw: string) => {
  try {
    return yaml.load(raw, { json: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`YAMLのパースに失敗しました: ${message}`);
  }
};

const validateConfig = (data: unknown): BotConfig => ConfigSchema.parse(data);

export const loadConfig = async (customPath?: string): Promise<ConfigLoadResult> => {
  const filePath = customPath
    ? path.resolve(process.cwd(), customPath)
    : DEFAULT_CONFIG_PATH;

  try {
    const rawContent = await readFile(filePath);
    const rawConfig = parseYaml(rawContent);
    const config = validateConfig(rawConfig);

    logger.info("設定ファイルを読み込みました", {
      path: filePath,
    });

    return { ok: true, path: filePath, config } satisfies ConfigLoadSuccess;
  } catch (error) {
    const isZodError = error instanceof ZodError;
    const message = error instanceof Error ? error.message : String(error);
    const issues = isZodError ? error.issues : undefined;

    logger.error("設定ファイルの読み込みに失敗しました", {
      path: filePath,
      message,
      issues,
    });

    const failure: ConfigLoadFailure = {
      ok: false,
      path: filePath,
      message,
    };

    if (issues) {
      failure.issues = issues;
    }

    return failure;
  }
};

export const requireConfig = async (customPath?: string): Promise<BotConfig> => {
  const result = await loadConfig(customPath);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.config;
};
