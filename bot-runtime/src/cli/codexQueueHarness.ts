#!/usr/bin/env node
import { exit } from "process";

import { runCodexQueueHarness } from "../codex/testing/queueHarness";

const main = async () => {
  const result = await runCodexQueueHarness();

  for (const scenario of result.scenarios) {
    if (scenario.success) {
      console.log(`✅ ${scenario.scenario}`);
      continue;
    }

    console.error(`❌ ${scenario.scenario}`);
    if (scenario.message) {
      console.error(`   ↳ ${scenario.message}`);
    }
  }

  if (!result.success) {
    exit(1);
  }
};

void main();
