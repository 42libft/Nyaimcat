import { Collection } from "discord.js";

import type { SlashCommandModule } from "./types";
import { introduceCommand } from "./introduce";
import { helpCommand } from "./help";
import { pingCommand } from "./ping";
import { rolesCommand } from "./roles";
import { verifyCommand } from "./verify";
import { versionCommand } from "./version";
import { esclFromParentCsvCommand } from "./esclCsv";
import { esclFromParentXlsxCommand } from "./esclXlsx";
import { feedbackCommand } from "./feedback";
import { taskCommand } from "./task";
import { workCommand } from "./work";
import { statusCommand } from "./status";

export const commandModules: SlashCommandModule[] = [
  helpCommand,
  versionCommand,
  esclFromParentCsvCommand,
  esclFromParentXlsxCommand,
  pingCommand,
  verifyCommand,
  rolesCommand,
  introduceCommand,
  feedbackCommand,
  taskCommand,
  workCommand,
  statusCommand,
];

export const buildCommandCollection = () => {
  const collection = new Collection<string, SlashCommandModule>();

  for (const command of commandModules) {
    collection.set(command.data.name, command);
  }

  return collection;
};
