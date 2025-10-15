import { Collection } from "discord.js";

import type { SlashCommandModule } from "./types";
import { introduceCommand } from "./introduce";
import { pingCommand } from "./ping";
import { rolesCommand } from "./roles";
import { verifyCommand } from "./verify";

export const commandModules: SlashCommandModule[] = [
  pingCommand,
  verifyCommand,
  rolesCommand,
  introduceCommand,
];

export const buildCommandCollection = () => {
  const collection = new Collection<string, SlashCommandModule>();

  for (const command of commandModules) {
    collection.set(command.data.name, command);
  }

  return collection;
};
