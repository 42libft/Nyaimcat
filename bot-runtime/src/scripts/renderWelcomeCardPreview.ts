#!/usr/bin/env node

import type { WelcomeCardConfig } from "../config";
import { renderWelcomeCard } from "../discord/onboarding/welcomeCard";
import {
  fillTemplate,
  createTemplateValues,
} from "../discord/onboarding/templateHelpers";
import type { TemplateValues } from "../discord/onboarding/types";

type PreviewInput =
  | {
      card: WelcomeCardConfig;
      templateValues: TemplateValues;
      avatarUrl?: string;
      assetsBasePath?: string;
    }
  | {
      card: WelcomeCardConfig;
      context: {
        username: string;
        displayName?: string;
        mention?: string;
        guildName: string;
        memberIndex: number;
        rolesChannelId?: string | null;
        guideUrl?: string | null;
        staffRoleIds?: string[] | null;
      };
      avatarUrl?: string;
      assetsBasePath?: string;
    };

const DEFAULT_AVATAR_URL =
  "https://cdn.discordapp.com/embed/avatars/0.png";

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const resolveTemplateValues = (input: PreviewInput): TemplateValues => {
  if ("templateValues" in input) {
    return input.templateValues;
  }

  return createTemplateValues(input.context);
};

const main = async () => {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      throw new Error("No preview payload received from stdin.");
    }

    const payload = JSON.parse(raw) as PreviewInput;
    const templateValues = resolveTemplateValues(payload);

    const title = fillTemplate(payload.card.title_template, templateValues);
    const subtitle = fillTemplate(
      payload.card.subtitle_template,
      templateValues
    );

    const body = payload.card.body_template
      ? fillTemplate(payload.card.body_template, templateValues)
      : undefined;

    const buffer = await renderWelcomeCard({
      cardConfig: payload.card,
      avatarUrl: payload.avatarUrl || DEFAULT_AVATAR_URL,
      assetsBasePath: payload.assetsBasePath,
      text: {
        title,
        subtitle,
        body,
      },
    });

    process.stdout.write(buffer.toString("base64"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

void main();
