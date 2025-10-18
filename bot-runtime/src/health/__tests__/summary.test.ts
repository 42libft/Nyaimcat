import test from "node:test";
import assert from "node:assert/strict";

import { collectHealthIssueSummary } from "../summary";
import { healthRegistry } from "../registry";

const clearRegistry = () => {
  for (const issue of healthRegistry.list()) {
    healthRegistry.resolve(issue.id);
  }
};

test("collectHealthIssueSummary returns empty result when no issues are registered", (t) => {
  t.after(clearRegistry);
  clearRegistry();

  const result = collectHealthIssueSummary();

  assert.strictEqual(result.total, 0);
  assert.deepStrictEqual(result.lines, []);
});

test("collectHealthIssueSummary sorts issues and respects the limit", (t) => {
  t.after(clearRegistry);
  clearRegistry();

  const base = Date.parse("2024-01-01T00:00:00.000Z");

  const issueInputs = [
    {
      id: "warn-1",
      level: "warning" as const,
      message: "Disk usage exceeds 70%",
      detectedAt: new Date(base + 1000).toISOString(),
    },
    {
      id: "error-1",
      level: "error" as const,
      message: "Codex queue worker crashed",
      detectedAt: new Date(base + 2000).toISOString(),
    },
    {
      id: "warn-2",
      level: "warning" as const,
      message: "Pending runs exceed threshold",
      detectedAt: new Date(base + 3000).toISOString(),
    },
    {
      id: "error-2",
      level: "error" as const,
      message: "Discord API rate limit hit",
      detectedAt: new Date(base + 4000).toISOString(),
    },
  ];

  issueInputs.forEach((issue) => {
    healthRegistry.report(issue);
  });

  const result = collectHealthIssueSummary(3);

  assert.strictEqual(result.total, issueInputs.length);

  assert.strictEqual(result.lines.length, 4);
  const firstLine = result.lines[0]!;
  const secondLine = result.lines[1]!;
  const thirdLine = result.lines[2]!;
  const overflowFromFullLimit = result.lines[3]!;
  assert.ok(firstLine.startsWith("🛑 Codex queue worker crashed"));
  assert.ok(
    secondLine.startsWith("🛑 Discord API rate limit hit"),
    "second line should contain the remaining error issue"
  );
  assert.ok(thirdLine.startsWith("⚠️ Disk usage exceeds 70%"));
  assert.ok(
    overflowFromFullLimit.startsWith("…他 1 件のヘルス警告があります。")
  );

  const extended = collectHealthIssueSummary(2);

  assert.strictEqual(extended.lines.length, 3);
  const overflowLine = extended.lines[2]!;
  assert.ok(overflowLine.startsWith("…他 2 件のヘルス警告があります。"));
});
