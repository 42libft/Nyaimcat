# Nyaimlab Bot 引き継ぎ設計メモ

依頼者から受領した要件をもとに、Discordサーバー「Nyaimlab」で運用する自動化Botと、それをGitHub Pagesフロントエンドから管理するための設計指針を整理する。Mee6代替として歓迎導線・ロール配布・自己紹介・監査ログを統合管理し、将来的な競技活動支援（スクリム補助）に拡張しやすい構造を目指す。

---

## 1. プロジェクト概要
- **対象サーバー**: Discord「Nyaimlab」（guild.idで指定）
- **目的**: 新規参加者のオンボーディングとロール配布を自動化し、サーバー活性化と運営工数削減を両立する。
- **コンセプト**: Mee6互換の基本機能＋独自フロー（Verify、自己紹介、スクリム管理）。
- **運用ポリシー**: Bot機能・コマンドはGitHub Pages上の管理UIから設定・更新できること。設定は`config.yaml`等に集約し、PRレビュー／履歴管理可能にする。

---

## 2. 成果物スコープ
### 必須成果物
1. **Discord Botランタイム**
   - Node.js（discord.js v14想定）ベース。
   - slash command登録／イベントリスナー（guildMemberAdd, interactionCreate, messageReactionAdd等）。
   - 設定ファイルを定期的にPullしホットリロード可能。
2. **GitHub Pages管理フロントエンド**
   - Vite + Reactで構築。
   - 設定フォームとプレビューを提供し、Yamlを生成→GitHub API経由でリポジトリにPR作成。
   - 運用者は個人PATをフロントに入力（LocalStorage保存）し、Pagesから直接PRを起票。
3. **監査・ログ基盤**
   - Botが行う重要操作は`#audit_log`にJSON形式で送信。
   - 失敗ログはフロントでも参照できるよう、S3/Firestore等の外部ストレージへ送信 or GitHub Issuesに記録（初期はDiscordチャンネルログのみでも可）。

### 将来拡張（MVP後）
- スクリム補助ワークフロー。
- 多言語対応（i18n）とPostgresなど永続DBへの移行。

---

## 3. アーキテクチャ概要
```
┌─────────────────────┐      ┌─────────────────────┐
│ Github Pages (React) │─────▶│ Github REST API      │
│  - Config UI          │◀────│  - Config repo (yaml)│
│  - Log viewer (optional) │   └────────▲────────────┘
└─────────▲──────────┘                │
          │                             │定期Pull/PR
          │設定PR                        │
          │                             ▼
┌─────────┴──────────┐      ┌────────────────────┐
│ Discord Bot (Node)  │─────▶│ Discord Guild       │
│  - Slash commands    │◀────│ - channels/roles    │
│  - Event listeners   │      │ - interactions      │
│  - Audit logging     │      └────────────────────┘
└─────────────────────┘
```
- BotはGitHubリポジトリの`config.yaml`と追加定義（NGワード、自己紹介テンプレなど）を定期ポーリングし、変更があればリロード。
- Pagesフロントは設定フォーム→Yaml生成→`/repos/{owner}/{repo}/pulls` APIでPRを作成（Draft対応）。
- コマンドの構成（ボタン列、選択リスト）は設定ファイルの配列定義から自動生成する。

---

## 4. 設定ファイル仕様
`config.yaml`（ルート直下）を想定。環境変数（TOKENなど）はSecretsに保持し、configにはID・URL・表示文言のみ含める。

```yaml
guild:
  id: "1234567890"
channels:
  welcome: "#welcome"
  verify_panel: "#verify"
  roles_panel: "#roles"
  introductions: "#自己紹介"
  audit_log: "#audit_log"
  fallback_notice: "#welcome" # DM失敗時のスレッド作成先
notion:
  guidelines_url: "https://..."
features:
  count_bots_in_member_count: false
  verify_mode: "button" # or "reaction"
roles:
  verified: "@Verified"
  selectable:
    - key: "apex"
      label: "Apex"
      role: "@Apex"
    - key: "vrchat"
      label: "VRChat"
      role: "@VRChat"
    - key: "games"
      label: "その他ゲーム"
      role: "@Games"
    - key: "global"
      label: "Global"
      role: "@Global"
  optional:
    - key: "streamer"
      label: "配信者"
      role: "@Streamer"
    - key: "creator"
      label: "クリエイター"
      role: "@Creator"
introductions:
  maxCharacters:
    name: 32
    comment: 200
  imageAttachment:
    allow: true
  ngWords: ["spamword1", "spamword2"]
verify:
  messageId: null # PR後にBotが書き戻す
  button:
    label: "Verify"
    style: "primary"
  reactionEmoji: "✅"
locales:
  timezone: "Asia/Tokyo"
```

- Botは設定値をバリデーションし、Discord APIとの齟齬（存在しないIDなど）を検知した場合はエラーを出してPRでコメント。
- ログや自己紹介テンプレートなど、構造が複雑化する場合は`config/`配下にモジュール分割。

---

## 5. フロントエンド（Github Pages）設計
### 5.1 技術構成
- React + TypeScript + Vite（既存リポジトリを流用可）。
- UIコンポーネント: Chakra UI or custom minimal components。
- YAML生成: `js-yaml`。
- GitHub API連携: `@octokit/rest`（user PAT入力必須）。
- 認証: PATはブラウザLocalStorageに暗号化保存、利用時に`Authorization: token`ヘッダーを付与。

### 5.2 画面構成
1. **Dashboard**
   - 現在の設定ファイルを読み込みサマリ表示（fetch raw GitHub）。
   - 最近の監査ログ一覧（DiscordのWebhookログを取得 or 代替案：GitHub Issue APIから取得）。
2. **Welcome & Onboarding**
   - Welcome Embedプレビュー（アバター＋タイトル＋説明文）。
   - Botを含む人数カウントのトグル。
   - Notionリンク入力フィールド、ロールジャンプ先チャンネル選択。
3. **Verify 設定**
   - モード（ボタン / リアクション）切替UI。
   - 役職紐付け、メッセージプレビュー。
   - `/verify post`コマンドの構成→送信テキスト生成。
4. **ロール配布**
   - selectable / optional のドラッグ＆ドロップ並び替え。
   - UIスタイル（buttons / select）のトグル。
   - プレビュー（Discord風コンポーネント）。
5. **自己紹介フォーム**
   - 入力項目のON/OFFと文字数上限設定。
   - NGワードリスト編集。
   - Embedプレビュー＋画像添付可否設定。
6. **スクリム補助（将来タブ）**
   - 参加希望テンプレート、通知チャンネル設定、集計周期など。
7. **YAML差分 & PR 作成**
   - 変更を差分表示（Monaco Editor diffなど）。
   - コミットメッセージ／PRタイトル自動生成（例: `chore(config): update verify panel to buttons`）。
   - Draft/Ready for reviewの選択。マージ先ブランチは`main`固定。

### 5.3 運用フロー
1. Pagesサイトにアクセス→PATを入力してログイン。
2. 既存設定を読み込み、フォームで編集。
3. 「プレビュー」でEmbedやボタンを確認。
4. 「差分を確認」でYaml diffをレビュー。
5. 「PRを作成」でGitHubにDraft PRを自動生成。
6. メンテナはPRをレビュー→Merge→Botが自動リロード→Discordに反映。

---

## 6. Discord機能詳細設計
### 6.1 Welcome Embed
- イベント: `guildMemberAdd`
- 処理:
  1. メンバーインデックス算出（`guild.memberCount`基準、Bot含む／除外は`features.count_bots_in_member_count`）。
  2. Embed組み立て:
     - サムネイル: `member.user.displayAvatarURL({ size: 256 })`
     - タイトル: `ようこそ、{username} さん！`
     - 説明: `あなたは **#{memberIndex}** 人目のメンバーです。`
     - フィールド: `加入日時 (JST)` → `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', ... })`
     - フッター: `Nyaimlab`
  3. ボタンコンポーネント:
     - `ButtonStyle.Link`でNotionガイド。
     - `ButtonStyle.Primary`でロール付与チャンネルへのジャンプ（`customId`で`ROLES_JUMP`→`interaction.reply({ ephemeral: true, content: 'こちらへどうぞ → <#channelId>' })`）。
  4. Post: `channels.welcome`
  5. 成功/失敗を#audit_logにJSONで記録。

### 6.2 ガイドライン自動DM
- `guildMemberAdd`時にDM送信。
- メッセージ本文は設定ファイルのテンプレート（変数: `{notionUrl}`, `{roles_panel}`など）。
- 送信失敗時:
  1. `audit_log`に`{"event":"DM_FAILED","userId":"...","reason":"Cannot send messages to this user"}`を送信。
  2. `#welcome`のスレッド（`threadChannel = await welcomeMessage.startThread(...)`）に代替案内。
- 冪等性: DM送信前に`member.user.dmChannel`確認、エラー種別ごとにリトライ上限1回。

### 6.3 Verify 機能 `/verify post`
- Slashコマンド: `verify post channel:<#> [mode]`
- モード:
  - `button`: `ButtonStyle.Success`で「Verify」ボタン。
  - `reaction`: メッセージ投稿後にBotがリアクション付与。
- 押下時:
  - `guild.members.fetch(user.id)`→`member.roles.add(roles.verified)`。
  - 役職付与に失敗した場合の`DiscordAPIError`を捕捉し監査ログ。
- 冪等性:
  - 既にロール保持→リアクションは削除しない。ボタン押下時は`reply({ ephemeral: true, content: 'すでに認証済みです。' })`。
  - 役職削除時は`guildMemberRemove`で監査ログ。
- 監査ログ例:
  ```json
  {"event":"VERIFY_GRANTED","userId":"...","roleId":"...","timestamp":"2025-02-22T12:00:00+09:00"}
  ```

### 6.4 ロール配布 `/roles post`
- Slashコマンド: `roles post channel:<#> style:<buttons|select>`
- 設定ファイルの`roles.selectable`と`roles.optional`を読み込みUI生成。
- `style=buttons`: 最大5個/行。カテゴリごとにActionRow分割。
- `style=select`: セレクトメニューをカテゴリごとに分け、optionalはトグル可（`minValues=0`）。
- 付与/剥奪:
  - ユーザーがボタン/セレクト操作→`interaction.member.roles.add/remove`。
  - DiscordのRole階層エラー発生時は`interaction.reply({ ephemeral: true, content: 'ロール階層の設定により付与できません。運営に連絡してください。' })`。
- 監査ログ:
  - 成功: `ROLE_UPDATED`
  - 失敗: `ROLE_UPDATE_FAILED`（`reason`含む）。

### 6.5 自己紹介 `/introduce`
- Slashコマンド→Modal表示（`ModalBuilder` + `TextInputBuilder`）。
- 入力項目:
  1. 名前（ShortText, required, max=32）
  2. 年齢（ShortText, optional, numericバリデ）
  3. 出身国（ShortText, required）
  4. 日本語レベル（StringSelect）
  5. 英語レベル（StringSelect）
  6. 好きな食べ物（Paragraph, optional）
  7. ゲーム情報（Paragraph, optional）
  8. 一言コメント（Paragraph, required, max=200）
- 提出後処理:
  - 入力値をバリデーション（文字数、禁止ワード→`introductions.ngWords`）。
  - 画像添付オプション: `/introduce image:<attachment>`など別サブコマンド or Modal後のfollow-up。
  - #自己紹介 へEmbed投稿。サムネイル＝ユーザーアイコン。
- 監査ログ: `INTRODUCTION_POSTED`（ユーザーIDとメッセージIDを含む）。

### 6.6 スクリム補助（将来）
- 日曜Cron（例: Cloud Scheduler → Bot HTTP endpoint）。
- コマンド `/scrim schedule` で翌週分の日程生成。
- 参加希望を`/scrim join`で登録→Firestore/Sheetsに保存。
- 毎日0時に参加候補（3人組）を計算→#マネージャーに通知。
- 参加者に`/scrim confirm`で出欠確認。
- MVP段階では設計のみ記録、実装はフェーズ2。

---

## 7. 監査ログ設計
- すべてJSON文字列で送信し、フォーマット統一。
- 最低限のフィールド: `event`, `userId`, `executorId`（Bot操作の場合はBot ID）, `timestamp`, `metadata`。
- 例:
  ```json
  {
    "event": "ROLE_UPDATE_FAILED",
    "userId": "123",
    "executorId": "bot",
    "timestamp": "2025-02-22T10:30:00+09:00",
    "metadata": {
      "roleId": "456",
      "error": "Missing Permissions"
    }
  }
  ```
- フロントエンドでJSONを整形表示し、フィルタリングを提供。

---

## 8. 冪等性とエラーハンドリング指針
- すべてのコマンドは多重実行時に状態が壊れないようにする。
  - 役職付与は`member.roles.cache.has(roleId)`でチェック。
  - Welcomeメッセージ重複防止: メンバーJoin時に`welcome`チャンネルで直近1分以内のBot投稿を確認。
  - Modal送信は`interaction.deferReply({ ephemeral: true })`→成功後`editReply`。
- Discord APIエラー分類:
  - `MissingPermissions`/`Hierarchy`: ユーザーへ案内し、監査ログ。
  - `UnknownChannel`: 設定値不一致→監査ログ＋管理者にMention（Optional webhook）。
  - DM失敗: `CannotSendMessagesToThisUser`で識別。
- リトライ戦略: 非致命的エラーは指数バックオフ（最大3回）。

---

## 9. 拡張性・将来対応
- **i18n**: 文字列リソースを`locales/ja.json`などに分離。フロントは言語トグル、Botは`config.defaultLocale`で切替。
- **データベース移行**: 参加履歴・自己紹介ログをPostgresへ保存する設計に備え、データアクセス層を抽象化。
- **Observability**: 長期的には外部監視（Sentry, Datadog）を導入。
- **CI/CD**: GitHub ActionsでLint/Test。PagesビルドとBotデプロイを分離。

---

## 10. 実装ロードマップ
1. **M1: 基盤整備**
   - Botプロジェクト雛形（discord.js, dotenv）。
   - `config.yaml`ローダー＋型定義。
   - Github Pagesフロント雛形＋PATログイン。
2. **M2: オンボーディング機能**
   - Welcome Embed + DMフロー + 監査ログ出力。
   - フロントでEmbedプレビューとテンプレ編集。
3. **M3: Verify & ロール配布**
   - `/verify`, `/roles`コマンド実装。
   - フロントでロール一覧編集＆PR生成。
4. **M4: 自己紹介モジュール**
   - `/introduce`モーダル＋NGワードチェック。
   - フロントで文字数・NGワード編集。
5. **M5: ログビュー & 運用改善**
   - 監査ログ閲覧UI。
   - バックアップ（S3/Firestore等）設計。
6. **M6: スクリム補助設計→実装検討**
   - 要件再確認→Cron/通知ロジック試作。

---

## 11. リスクと対応
| リスク | 内容 | 対応策 |
| --- | --- | --- |
| PAT管理 | Github Pages上でPATを扱う必要がある | PATは読み取り＋PR作成権限のみ。LocalStorage暗号化＆明示的なログアウト機能を実装。 |
| Discord権限 | Botのロール階層が不足すると付与失敗 | 導入ドキュメントで「Botロールを最上位に配置」する手順を明記。 |
| 設定同期遅延 | PRマージ後にBotへ反映が遅れる | Bot側でWebhooks（GitHub→Bot） or 60秒ポーリングで対応。 |
| DM拒否率 | 新規メンバーがDM拒否しているケース | 代替案内（#welcomeスレッド）と監査ログでフォロー。 |
| 拡張機能の複雑化 | スクリムやi18n導入で設定肥大化 | `config/`ディレクトリで機能別ファイル分割＋Zodなどで型検証。 |

---

## 12. 次のアクション（運用者向け）
1. Bot用Discordアプリケーション作成→TOKEN発行。
2. 設定リポジトリを準備（`config.yaml`初期テンプレをコミット）。
3. Github Pagesサイトをホストし、PATスコープ（`repo`）を持つトークンで動作確認。
4. Welcome／Verify／Rolesの文言確定。NotionガイドURL・チャンネルIDを取得。
5. 自己紹介テンプレ（NGワード含む）を確定させ、運用ガイドを書面化。

---

この設計メモを起点に、開発・運用担当へ具体的なタスクと設定値の引き継ぎを行う。
