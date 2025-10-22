#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const credentialStore_1 = require("../../src/escl/credentialStore");
const DEFAULT_CREDENTIAL_PATH = node_path_1.default.resolve(__dirname, "../../data/escl_credentials.enc");
const printUsage = () => {
    console.log(`ESCL 資格情報暗号化キーのローテーションツール\n\n`);
    console.log("Usage: ts-node scripts/escl/rotate_secret.ts --new-key <BASE64|HEX> [--old-key <BASE64|HEX>] [--file <PATH>]");
    console.log("  --new-key  : 必須。新しい ESCL_SECRET_KEY を Base64 / Hex / 32 文字 UTF-8 で指定します。");
    console.log("  --old-key  : 省略時は現在の環境変数 ESCL_SECRET_KEY を利用します。");
    console.log("  --file     : 省略時は data/escl_credentials.enc を対象とします。");
};
const parseArgs = (argv) => {
    let filePath = DEFAULT_CREDENTIAL_PATH;
    let oldKey = null;
    let newKey = null;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--file" || arg === "-f") {
            const value = argv[i + 1];
            if (!value) {
                throw new Error("--file オプションにはパスを指定してください。");
            }
            filePath = node_path_1.default.resolve(process.cwd(), value);
            i += 1;
            continue;
        }
        if (arg === "--old-key") {
            const value = argv[i + 1];
            if (!value) {
                throw new Error("--old-key オプションにはキーを指定してください。");
            }
            oldKey = value;
            i += 1;
            continue;
        }
        if (arg === "--new-key") {
            const value = argv[i + 1];
            if (!value) {
                throw new Error("--new-key オプションにはキーを指定してください。");
            }
            newKey = value;
            i += 1;
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            printUsage();
            process.exit(0);
        }
        throw new Error(`未知の引数です: ${arg}`);
    }
    const resolvedOldKey = oldKey ?? process.env.ESCL_SECRET_KEY ?? null;
    if (!resolvedOldKey) {
        throw new Error("旧キーが指定されていません。--old-key もしくは環境変数 ESCL_SECRET_KEY を設定してください。");
    }
    if (!newKey) {
        throw new Error("--new-key オプションは必須です。");
    }
    return {
        filePath,
        oldKey: resolvedOldKey,
        newKey,
    };
};
const main = async () => {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (!options) {
            printUsage();
            process.exit(1);
        }
        const oldKey = (0, credentialStore_1.parseSecretKey)(options.oldKey);
        const newKey = (0, credentialStore_1.parseSecretKey)(options.newKey);
        if (oldKey.equals(newKey)) {
            throw new Error("旧キーと新キーが同一です。異なるキーを指定してください。");
        }
        const store = new credentialStore_1.CredentialStore(options.filePath, oldKey);
        await store.rotate({ oldKey, newKey });
        console.log("✅ 資格情報ファイルの再暗号化が完了しました。");
        console.log("新しい ESCL_SECRET_KEY に更新し、Bot を再起動してください。");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ ローテーションに失敗しました: ${message}`);
        process.exit(1);
    }
};
void main();
//# sourceMappingURL=rotate_secret.js.map