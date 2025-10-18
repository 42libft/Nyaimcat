"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpCommand = void 0;
const discord_js_1 = require("discord.js");
const helpCategoryConfigs = [
    {
        key: "server_overview",
        choiceName: "サーバー基本ガイド",
        title: "**サーバー基本ガイド**",
        summary: "サーバー参加から日常運用までの共通フロー",
        lines: [
            "- 参加直後は Verify パネルから認証を完了し、運営が固定したルールやガイドラインを確認してください。",
            "- 認証後に `/roles post` が設置したパネルで必要な通知ロールを取得し、`/introduce` で自己紹介を投稿するとコミュニケーションが円滑になります。",
            "- Codex 関連コマンドを使う前に、依頼内容・通知先・Docs 自動更新の扱いを関係者と合意しておくとトラブルを防げます。",
            "- 詳細な運用手順や最新の決定事項は `README.md` および `docs/` 配下のドキュメントを参照してください。",
        ],
    },
    {
        key: "codex_automation",
        choiceName: "Codex 自動化",
        title: "**Codex 自動化**",
        summary: "Codex CLI と実行キューの使い方",
        lines: [
            "- `/task create` で作業依頼を `tasks/inbox/` に Markdown として保存し、変更履歴を追跡します。",
            "- `/work start` で Codex CLI を起動し、通知チャンネルや Docs 追記の設定をオンデマンドで切り替えられます。",
            "- `/work status` と `/status` で実行キューや Bot の稼働状況を確認し、長時間実行や失敗時の切り分けに役立ててください。",
            "- 運用ルールや権限制御の詳細は `docs/codex_agent_tasks.md` と `docs/codex_agent_plan.md` を参照します。",
        ],
    },
    {
        key: "escl_data",
        choiceName: "ESCL データ取得",
        title: "**ESCL データ取得**",
        summary: "Scrim データを CSV/Excel で取得する方法",
        lines: [
            "- `/escl_from_parent_csv` と `/escl_from_parent_xlsx` は ESCL グループページの URL から 6 試合分のデータを直接取得します。",
            "- 生成されたファイルは Slash Command の返信としてアップロードされ、ALL_GAMES や TEAM_TOTALS を含みます。",
            "- `/version` で Python コレクタと Node ランタイムのバージョンを確認し、依存関係の更新判断に活用してください。",
        ],
    },
    {
        key: "onboarding_support",
        choiceName: "オンボーディング・運用支援",
        title: "**オンボーディング・運用支援**",
        summary: "参加者対応と日常運用のサポート機能",
        lines: [
            "- `/verify post` で認証パネルを投稿・更新し、参加者のアクセス制御を維持します。",
            "- `/roles post` で自己選択ロールパネルを配信し、通知カテゴリごとに案内できます。",
            "- `/introduce` はモーダルを開いて自己紹介を送信し、ダッシュボードで定義した入力スキーマが適用されます。",
            "- `/feedback bug|idea` で不具合報告や改善アイデアを Markdown として保存し、監査ログにも記録します。",
        ],
    },
    {
        key: "utility",
        choiceName: "ユーティリティ",
        title: "**ユーティリティ**",
        summary: "稼働確認やヘルプの再確認に使用します",
        lines: [
            "- `/ping` で Bot の WebSocket 応答時間を確認し、ネットワーク状態の手軽なチェックに使えます。",
            "- `/status` でメモリ使用量や Codex 実行キューの統計、ヘルスチェック警告をまとめて確認できます。",
            "- `/help` でこのヘルプを再表示し、`command` / `category` オプションで個別のトピックにアクセスできます。",
        ],
    },
];
const helpCategoryMap = new Map(helpCategoryConfigs.map((config) => [config.key, config]));
const helpCommandConfigs = [
    {
        key: "task.create",
        choiceName: "/task create",
        title: "**/task create**",
        summary: "Codex 作業依頼を Markdown として `tasks/inbox/` に保存します。",
        usage: [
            "`/task create title:<件名> [summary:<概要>] [details:<詳細>] [priority:<low|normal|high>]`",
        ],
        notes: [
            "概要または詳細のどちらか一方は必須です。",
            "保存されたファイル名は自動生成され、`/work start` で参照できます。",
        ],
    },
    {
        key: "work.start",
        choiceName: "/work start",
        title: "**/work start**",
        summary: "Codex CLI の実行キューにタスクを登録し、依頼を実行します。",
        usage: [
            "`/work start filename:<ファイル名>` — 特定の Markdown を指定して実行します。",
            "`/work start latest:true` — 最新のタスクファイルを自動選択します。",
            "オプション `[notify_channel]` `[skip_notify]` `[update_docs]` で通知先や Docs 追記を切り替えられます。",
        ],
        notes: [
            "キュー投入後はエフェメラル返信に Run ID や通知設定が表示されます。",
            "Docs 追記は既定値（環境変数または設定）を上書き可能です。",
        ],
    },
    {
        key: "work.status",
        choiceName: "/work status",
        title: "**/work status**",
        summary: "Codex 実行キュー全体、または個別 ID の進捗を確認します。",
        usage: [
            "`/work status` — キュー全体のサマリを表示します。",
            "`/work status queue_id:<ID>` — 特定のジョブ詳細（開始・終了時刻、結果）を表示します。",
        ],
        notes: [
            "ジョブ ID は `/work start` の返信や `/status` の履歴から取得できます。",
        ],
    },
    {
        key: "work.cancel",
        choiceName: "/work cancel",
        title: "**/work cancel**",
        summary: "待機中または実行中の Codex ジョブをキャンセルします。",
        usage: ["`/work cancel queue_id:<ID>`"],
        notes: [
            "キャンセル結果は Discord 通知や `tasks/runs/` の履歴に保存されます。",
            "実行中ジョブを停止した場合、再実行の可否を関係者と確認してください。",
        ],
    },
    {
        key: "status",
        choiceName: "/status",
        title: "**/status**",
        summary: "Bot 稼働状況と Codex 連携のヘルスサマリを確認します。",
        usage: ["`/status`"],
        notes: [
            "稼働時間・WebSocket Ping・メモリ使用量に加え、Codex 実行キューの最新履歴を表示します。",
            "`collectHealthIssueSummary` による警告一覧で設定漏れや連携失敗を早期検知できます。",
        ],
    },
    {
        key: "version",
        choiceName: "/version",
        title: "**/version**",
        summary: "Python ESCL コレクタと Node.js ランタイムのバージョンを表示します。",
        usage: ["`/version`"],
        notes: [
            "内部で `python -m src.esclbot.cli version` を実行し、ESCL Bot のバージョンを取得します。",
            "依存更新後の動作確認やリリース報告に活用できます。",
        ],
    },
    {
        key: "escl_from_parent_csv",
        choiceName: "/escl_from_parent_csv",
        title: "**/escl_from_parent_csv**",
        summary: "ESCL グループページから 6 試合分の CSV（ALL_GAMES 相当）を生成します。",
        usage: [
            "`/escl_from_parent_csv parent_url:<URL> [group:<グループ名>]`",
        ],
        notes: [
            "parent_url には `https://fightnt.escl.co.jp/scrims/...` のグループページを指定します。",
            "生成結果はコマンド実行チャンネルに添付ファイルとして返信されます。",
        ],
    },
    {
        key: "escl_from_parent_xlsx",
        choiceName: "/escl_from_parent_xlsx",
        title: "**/escl_from_parent_xlsx**",
        summary: "ESCL データを Excel 形式（GAME1..6 / ALL_GAMES / TEAM_TOTALS）で取得します。",
        usage: [
            "`/escl_from_parent_xlsx parent_url:<URL> [group:<グループ名>]`",
        ],
        notes: [
            "Excel 版は命中率やヘッドショット率を再計算し、集計シートを含みます。",
            "CSV 同様にダウンロード用ファイルが返信されます。",
        ],
    },
    {
        key: "verify.post",
        choiceName: "/verify post",
        title: "**/verify post**",
        summary: "Verify パネルを投稿または更新し、認証フローを管理します。",
        usage: [
            "`/verify post [channel:<チャンネル>]`",
        ],
        notes: [
            "ManageGuild 権限または設定されたスタッフロールが必要です。",
            "チャンネルを指定しない場合は設定ファイルの既定値を使用します。",
        ],
    },
    {
        key: "roles.post",
        choiceName: "/roles post",
        title: "**/roles post**",
        summary: "自己選択ロールパネルを投稿・更新し、通知カテゴリを配信します。",
        usage: [
            "`/roles post [channel:<チャンネル>]`",
        ],
        notes: [
            "ManageRoles 権限またはスタッフロールが必要です。",
            "投稿後はメッセージ ID を `config.roles.message_id` に設定すると更新が容易です。",
        ],
    },
    {
        key: "introduce",
        choiceName: "/introduce",
        title: "**/introduce**",
        summary: "自己紹介モーダルを開き、設定済みチャンネルへ投稿します。",
        usage: ["`/introduce`"],
        notes: [
            "モーダルの入力項目はダッシュボードで設定したスキーマに従います。",
            "投稿先チャンネルやメッセージ形式は introduceManager が管理します。",
        ],
    },
    {
        key: "feedback.bug",
        choiceName: "/feedback bug",
        title: "**/feedback bug**",
        summary: "不具合報告を受け付け、Markdown として保存します。",
        usage: [
            "`/feedback bug title:<件名> detail:<詳細> [steps:<再現手順>]`",
        ],
        notes: [
            "保存先は `feedback/bugs/` で、送信者・チャンネル・投稿時刻を自動で記録します。",
            "Discord API エラー時はユーザーへ再投稿ガイダンスを返します。",
        ],
    },
    {
        key: "feedback.idea",
        choiceName: "/feedback idea",
        title: "**/feedback idea**",
        summary: "改善アイデアを受け付け、Markdown として保存します。",
        usage: [
            "`/feedback idea title:<件名> detail:<内容> [impact:<期待効果>]`",
        ],
        notes: [
            "保存先は `feedback/ideas/` で、後からレビューできるよう自動整理されます。",
        ],
    },
    {
        key: "ping",
        choiceName: "/ping",
        title: "**/ping**",
        summary: "Bot の応答遅延を測定し、稼働状態を手早く確認します。",
        usage: ["`/ping`"],
        notes: [
            "返信はエフェメラルで、WebSocket レイテンシと往復時間を表示します。",
        ],
    },
    {
        key: "help",
        choiceName: "/help",
        title: "**/help**",
        summary: "このヘルプを表示し、カテゴリやコマンド単位の説明を確認します。",
        usage: [
            "`/help` — 概要と選択可能なカテゴリ・コマンドを表示します。",
            "`/help category:<カテゴリ>` — 指定カテゴリの詳細ガイドを表示します。",
            "`/help command:<コマンド>` — 特定の Slash コマンドに関する手順と補足を表示します。",
        ],
        notes: [
            "カテゴリとコマンドの同時指定時は、コマンド詳細が優先されます。",
            "追加の運用ノートは `README.md` や `docs/` を参照してください。",
        ],
    },
];
const helpCommandMap = new Map(helpCommandConfigs.map((config) => [config.key, config]));
const buildCategoryLines = (config) => {
    const lines = [config.title, ""];
    lines.push(...config.lines);
    return lines;
};
const buildCommandLines = (config) => {
    const lines = [config.title, "", `- 概要: ${config.summary}`];
    if (config.usage && config.usage.length > 0) {
        lines.push("", "**使い方**");
        for (const entry of config.usage) {
            lines.push(`- ${entry}`);
        }
    }
    if (config.notes && config.notes.length > 0) {
        lines.push("", "**補足**");
        for (const entry of config.notes) {
            lines.push(`- ${entry}`);
        }
    }
    return lines;
};
const buildDefaultLines = () => {
    const lines = [
        "Nyaimlab Bot のヘルプです。カテゴリやコマンドを指定して詳細を確認できます。",
        "",
        "**カテゴリ (category オプション)**",
    ];
    for (const config of helpCategoryConfigs) {
        lines.push(`- ${config.choiceName} — ${config.summary}`);
    }
    lines.push("", "**コマンド (command オプション)**");
    for (const config of helpCommandConfigs) {
        lines.push(`- ${config.choiceName} — ${config.summary}`);
    }
    lines.push("", "例: `/help command:work.start` で `/work start` の詳しい使い方を確認できます。", "詳細な運用手順は `README.md` や `docs/` 配下のドキュメントも併せて参照してください。");
    return lines;
};
const data = new discord_js_1.SlashCommandBuilder()
    .setName("help")
    .setDescription("Nyaimlab Bot のヘルプと使い方を表示します")
    .addStringOption((option) => option
    .setName("category")
    .setDescription("カテゴリ別ヘルプを表示します")
    .setRequired(false)
    .addChoices(...helpCategoryConfigs.map((config) => ({
    name: config.choiceName,
    value: config.key,
}))))
    .addStringOption((option) => option
    .setName("command")
    .setDescription("特定のコマンド詳細を表示します")
    .setRequired(false)
    .addChoices(...helpCommandConfigs.map((config) => ({
    name: config.choiceName,
    value: config.key,
}))))
    .setDMPermission(false);
const execute = async (interaction, _context) => {
    const commandKey = interaction.options.getString("command");
    const categoryKey = interaction.options.getString("category");
    let lines;
    if (commandKey) {
        const commandConfig = helpCommandMap.get(commandKey);
        lines = commandConfig ? buildCommandLines(commandConfig) : buildDefaultLines();
    }
    else if (categoryKey) {
        const categoryConfig = helpCategoryMap.get(categoryKey);
        lines = categoryConfig ? buildCategoryLines(categoryConfig) : buildDefaultLines();
    }
    else {
        lines = buildDefaultLines();
    }
    await interaction.reply({
        content: lines.join("\n"),
        ephemeral: true,
    });
};
exports.helpCommand = {
    data,
    execute,
};
//# sourceMappingURL=help.js.map