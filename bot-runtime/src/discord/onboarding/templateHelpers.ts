import type { TemplateValues } from "./types";

const TEMPLATE_PATTERN = /\{\{\s*([\w_]+)\s*\}\}|\{([\w_]+)\}/g;

export type TemplateContext = {
  username: string;
  displayName?: string;
  mention?: string;
  guildName: string;
  memberIndex: number;
  rolesChannelId?: string | null;
  guideUrl?: string | null;
  staffRoleIds?: string[] | null;
};

export const buildStaffRoleMentions = (
  staffRoleIds?: string[] | null
): string => {
  if (!staffRoleIds?.length) {
    return "";
  }

  return staffRoleIds.map((roleId) => `<@&${roleId}>`).join(" ");
};

const assignAliases = (
  values: TemplateValues,
  key: string,
  value: string
) => {
  values[key] = value;

  const snake = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  const camel =
    key.indexOf("_") >= 0
      ? key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
      : key;

  values[snake] = value;
  values[camel] = value;
};

export const createTemplateValues = (
  context: TemplateContext
): TemplateValues => {
  const values: TemplateValues = {};

  assignAliases(values, "username", context.displayName ?? context.username);
  assignAliases(values, "displayName", context.displayName ?? context.username);
  assignAliases(values, "mention", context.mention ?? "");
  assignAliases(values, "guildName", context.guildName);
  assignAliases(values, "memberIndex", context.memberIndex.toString());

  const staffRoleMentions = buildStaffRoleMentions(context.staffRoleIds);
  assignAliases(values, "staffRoleMentions", staffRoleMentions);

  const rolesChannelMention = context.rolesChannelId
    ? `<#${context.rolesChannelId}>`
    : "";
  assignAliases(values, "rolesChannelMention", rolesChannelMention);

  assignAliases(values, "guideUrl", context.guideUrl ?? "");

  return values;
};

export const fillTemplate = (
  template: string | null | undefined,
  values: TemplateValues
): string => {
  if (!template) {
    return "";
  }

  return template.replace(
    TEMPLATE_PATTERN,
    (match, key1: string | undefined, key2: string | undefined) => {
      const key = key1 ?? key2;
      if (!key) {
        return match;
      }
      const replacement = values[key];
      return typeof replacement === "string" ? replacement : match;
    }
  );
};
