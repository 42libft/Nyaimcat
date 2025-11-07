#!/usr/bin/env node
import process from "process";

import { loadConfig } from "../config/loader";

const formatIssue = (issuePath: Array<string | number> | undefined) => {
  if (!issuePath || issuePath.length === 0) {
    return "(root)";
  }
  return issuePath.join(".");
};

const main = async () => {
  const customPath = process.argv[2];
  const result = await loadConfig(customPath, {
    logSuccess: false,
    successLogLevel: "debug",
  });

  if (result.ok) {
    console.log(`✅ 設定ファイルを検証しました: ${result.path}`);
    process.exit(0);
  }

  console.error(`❌ 設定ファイルの検証に失敗しました: ${result.path}`);
  console.error(result.message);
  if (result.issues && result.issues.length > 0) {
    const first = result.issues[0];
    if (first) {
      console.error(
        `  - ${formatIssue(first.path as Array<string | number>)}: ${
          first.message
        }`
      );
    }
    if (result.issues.length > 1) {
      console.error(`  ...他 ${result.issues.length - 1} 件`);
    }
  }
  process.exit(1);
};

main().catch((error) => {
  console.error("設定検証コマンドの実行に失敗しました:", error);
  process.exit(1);
});
