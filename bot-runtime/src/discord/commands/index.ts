import { Collection } from "discord.js";

import type { SlashCommandModule } from "./types";
import { pingCommand } from "./ping";

export const commandModules: SlashCommandModule[] = [pingCommand];

export const buildCommandCollection = () => {
  const collection = new Collection<string, SlashCommandModule>();

  for (const command of commandModules) {
    collection.set(command.data.name, command);
  }

  return collection;
};
