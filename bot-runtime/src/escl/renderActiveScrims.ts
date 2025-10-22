type ScrimEntry = Record<string, unknown>;

const SCRIM_KEYS = [
  "scrims",
  "scrimList",
  "scrim_list",
  "items",
  "data",
  "result",
  "payload",
] as const;

const toArray = (value: unknown): ScrimEntry[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is ScrimEntry =>
        entry !== null && typeof entry === "object" && !Array.isArray(entry)
    );
  }

  if (value && typeof value === "object") {
    return extractEntries(value as Record<string, unknown>);
  }

  return [];
};

const extractEntries = (payload: Record<string, unknown>): ScrimEntry[] => {
  for (const key of SCRIM_KEYS) {
    if (!(key in payload)) {
      continue;
    }
    const value = payload[key];
    const entries = toArray(value);
    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
};

const getText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

export const renderActiveScrims = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return "アクティブなスクリム情報が取得できませんでした。";
  }

  const entries = extractEntries(payload as Record<string, unknown>);

  if (!entries.length) {
    return "アクティブなスクリム情報が取得できませんでした。";
  }

  const lines: string[] = [];

  entries.slice(0, 10).forEach((entry, index) => {
    const scrimId =
      entry.scrimId ??
      entry.id ??
      entry.scrim_id ??
      entry.scrimID ??
      entry.scrimid;
    const title =
      getText(entry.title) ??
      getText(entry.name) ??
      getText(entry.scrimName) ??
      getText(entry.scrimTitle);
    const entryStart =
      getText(entry.entryStartAt) ??
      getText(entry.entryStart) ??
      getText(entry.entry_start_at);
    const startAt =
      getText(entry.startAt) ??
      getText(entry.start) ??
      getText(entry.start_at);

    const segments = [
      `${index + 1}. scrim_id=${scrimId ?? "不明"}`,
      title ?? "タイトル不明",
    ];

    if (entryStart) {
      segments.push(`受付開始: ${entryStart}`);
    }
    if (startAt) {
      segments.push(`開催: ${startAt}`);
    }

    lines.push(segments.join(" | "));
  });

  if (entries.length > 10) {
    lines.push(`...ほか ${entries.length - 10} 件`);
  }

  return lines.join("\n");
};
