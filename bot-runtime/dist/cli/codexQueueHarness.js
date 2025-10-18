#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process_1 = require("process");
const queueHarness_1 = require("../codex/testing/queueHarness");
const main = async () => {
    const result = await (0, queueHarness_1.runCodexQueueHarness)();
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
        (0, process_1.exit)(1);
    }
};
void main();
//# sourceMappingURL=codexQueueHarness.js.map