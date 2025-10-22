# タスクリスト

## ESCL スクリム自動エントリー Bot v2

### ゴール / Definition of Done
- `/set-team` でユーザーごとの `teamId` を永続化し、`/entry` で省略時に自動解決できる。
- `/entry` から ESCL API `CreateApplication` を **前日 0:00 (JST)** で送信でき、結果を Discord へ通知する。
- `ListActiveScrim` などの補助 API を叩き、`/list-active` で最新スクリム情報を提示できる。
- JWT・teamId 等の機密は `.env`・ローカルファイルに限定して取り扱い、ログへ出力しない。
- Discord ユーザーごとに複数の ESCL アカウント（teamId/JWT）を登録・切り替えでき、Bot が安全に保管・利用できる。

### 詳細要件メモ
- ESCL API エンドポイント
  - `CreateApplication`: `POST /user.v1.UserApplicationService/CreateApplication`
  - `GetApplications`: `POST /public.v1.PublicApplicationService/GetApplications`
  - `ListActiveScrim`: `POST /public.v1.PublicScrimService/ListActiveScrim`
- 認証ヘッダー: `Authorization: Bearer <JWT>` ほか `Origin` / `Referer` / `connect-protocol-version: 1` を必須とする。
- 応募スケジュールは **開催日の前日 0:00 JST** を基準とし、タイムゾーンは `Asia/Tokyo` で固定。
- JWT は AES-GCM 等で暗号化したストレージ（例: `data/escl_credentials.enc`）に保存し、`.env` の `ESCL_SECRET_KEY` を鍵として利用する。
- Slash コマンド経由での JWT 入力は DM モーダルで受け付け、登録・削除・一覧・デフォルト切り替えの監査ログを必ず残す。
- `ESCL_SECRET_KEY` は 32 バイトのランダムキー（Base64 もしくは Hex）を必須とし、起動時に不足・桁数不正なら警告して処理を停止する。再発行時は既存ファイルを新キーで再暗号化するローテーションコマンドを提供する。
- 暗号化ファイル形式: `{"version":1,"nonce":"<base64>","ciphertext":"<base64>","tag":"<base64>"}`。復号後の平文 JSON は以下構造を持つ。  
  ```json5
  {
    "meta": { "updatedAt": "<ISO8601>" },
    "accounts": {
      "<discordUserId>": {
        "defaultAccountId": "<uuid>|null",
        "accounts": {
          "<accountId>": {
            "label": "<string|null>",
            "teamId": <number>,
            "jwt": "<JWT>",
            "jwtFingerprint": "<base64>", // SHA-256(jwt)
            "status": "active" | "invalid" | "revoked",
            "createdAt": "<ISO8601>",
            "updatedAt": "<ISO8601>",
            "lastVerifiedAt": "<ISO8601|null>",
            "lastFailureAt": "<ISO8601|null>"
          }
        }
      }
    }
  }
  ```
- データ更新は一時ファイルへ書き出し後 `rename` でアトミックに差し替え、読み込み時は `status` に応じたフィルタリング・失効通知を行う。
- JWT 登録時は ESCL `UserService/Me` を叩いて検証し、成功したら `status=active`、401 なら登録拒否。既存アカウントが 401 を返した場合は `status=invalid` に落とし、利用者へ再登録を促す。

### 実装状況
- [x] Python Bot に `/set-team` `/list-active` `/entry` と応募スケジューラを実装済み（0.5 秒間隔で最大 3 回リトライ、任意時刻指定・即時送信 `/entry-now` 対応、進捗用スレッド、teamId 永続化、ユニットテスト `tests/test_entry_scheduler.py` 付き）。
- [x] Node.js ランタイムへ Slash コマンドを移植し、既存機能（CSV/XLSX, verify, introduce など）と共存させる。
- [x] 応募ジョブを永続化し、Bot 再起動後も予約を復元できるようにする（軽量なファイル永続化を想定。性能への影響も合わせて検証）。
- [x] Node 側で安定稼働を確認後、Python 側の `/entry` 系 Slash コマンドを無効化または削除して運用を一本化する（2025-10-18 Python コマンド無効化完了）。

### 追加要望（2025-10-18）
- [x] `/entry` に任意の時刻を指定できるオプション（例: `dispatch_at=HH:MM`）を追加し、未指定時は従来どおり前日 0:00 JST。
- [x] 応募を即時 1 回だけ送信する Slash コマンド（名称: `/entry-now`）を追加する。
- [x] リトライ回数を **3 回** へ調整し、429 などの待機ロジックも新設定に合わせる。
- [x] 上記変更を Node.js ランタイム移植計画へ反映し、移植完了後も同じ挙動を保証する。

### Exec Plan: ESCL スクリム自動エントリー Bot v2

#### 全体像
Python 版で成熟している応募フローに「任意時刻オプション」「即時実行コマンド」「リトライ最大 3 回」を追加し挙動を確定させたうえで、Node.js ランタイムへ移植して Slash コマンドを一本化する。再起動後も予約が維持されるよう軽量な永続化層を組み込み、更新点を README や運用手順に反映する。

#### 進捗状況
- [x] Python 実装と既存ユニットテストの現状確認
- [x] 任意時刻オプション／即時応募コマンド／リトライ 3 回を Python 版へ実装しテストを更新
- [x] Node.js への機能移植と Slash コマンド登録・権限確認
- [x] 応募ジョブ永続化方式（ファイル／SQLite 等）の検証と導入
- [ ] README・運用ドキュメントの更新とリリース手順整備
- [ ] ESCL アカウント多重管理（登録／暗号化保存／切り替えコマンド）の実装
- [ ] 暗号化ストアのユニットテスト（暗号化・復号・ローテーション・失効判定）とコマンド E2E テスト

#### 実装計画（詳細）
- **暗号化ストア** `bot-runtime/src/escl/credentialStore.ts` を新設し、AES-GCM(256bit) での保存・復号・キー検証・ローテーション (`rotate({ oldKey, newKey })`) を実装。TeamStore と同様に `load()` / `withWriteLock()` / 一時ファイル → `rename` でアトミック更新を行う。復号失敗時は `CredentialStoreError` で初期化を止める。
- **アカウント管理** `bot-runtime/src/escl/accountManager.ts` を追加し、登録（JWT 検証 + 指紋生成 + status=active）、一覧（ラベル/状態/デフォルト）、削除、デフォルト切替、401 検知時の `markInvalid`、再検証時の `markActive` を提供。登録時は `ESCLApiClient` による `UserService/Me` 呼び出しで `playerId`/`teamId` 整合チェックを行い、監査ログ入力を共通化する。
- **環境初期化** `EsclEnvironment` に `credentialStore` / `accountManager` を組み込み、`createApiClient(jwt: string)` と `resolveAccountForEntry({ userId, accountHint, allowLegacyEnv })` を提供。`ESCL_SECRET_KEY` 未設定時はレガシー単一 JWT モードで起動しつつ、新機能コマンドを無効化するガードを入れる。
- **Slash コマンド**
  - `/escl account register`（ギルドで実行→Bot が DM モーダル表示。入力: account_label, team_id, jwt。DM 内で処理し、結果はエフェメラル返信 + 監査ログ）  
  - `/escl account list`（自分の登録状況とデフォルト/状態をエフェメラル表示）  
  - `/escl account remove account:<autocomplete>`（削除確認後に実行）  
  - `/escl account set-default account:<autocomplete>`  
  - 監査ログアクションを `escl.account.*` 系で統一し、JWT 本文は記録しない。
- **既存コマンド拡張** `/entry` `/entry-now` `/list-active` に `account` オプション + オートコンプリートを追加。`EntryCommandHandler` は `accountManager` から `{ jwt, teamId, accountId, label }` を取得し、API クライアントをスコープ生成して実行。結果メッセージ/監査ログへ `accountId` と `label` を含める。
- **ジョブ永続化** `EntryJobStore` に `accountId`（nullable）と `jwtFingerprint` を追加し、保存時・復元時に検証。既存 JSON には `accountId` が無いので `null` としてロードし、レガシー環境変数 JWT を参照する互換モードを実装。`EntryScheduler` は実行時に最新の JWT を取得できない場合、ジョブを `failed` で落として通知する。
- **テスト**
  - `credentialStore.test.ts`: キー不一致・破損ファイル・ローテーション成功/失敗・並列書き込みのロック確認。
  - `accountManager.test.ts`: 登録時検証、status 遷移、デフォルト更新、401 応答時の `markInvalid`。API 呼び出しは `nock` でモック。
  - 既存 `/entry` 系テストを `account` 付きケースへ更新し、ジョブ永続化テストも `accountId` を含める。
  - コマンド E2E（discord.js の Mocks）でモーダル送信→登録→一覧→削除までのフローを確認。
- **補助 CLI** `scripts/escl/rotate_secret.ts`（仮）で `ESCL_SECRET_KEY` ローテーションと暗号化ファイル再生成を自動化し、ドキュメントから実行できるようにする。

#### 発見と驚き
- Python 版ではスケジューラ・進捗スレッド通知が実装済みだが、Node.js 側には該当コマンドが未登録で UI から利用できない。
- 応募ジョブはメモリ保持のみで、再起動すると予約が失われることが分かった。
- 複数メンバーが別アカウントで応募したいニーズがあり、単一 JWT 前提では運用が立ち行かない。

#### 決定ログ
- 2025-10-18: リトライ最大回数を 3 回へ縮小し、インターバル 0.5 秒は維持する方針を決定。
- 2025-10-18: Node.js へ移植後は Python 側の同名 Slash コマンドを無効化し運用を一本化する。
- 2025-10-18: Python Bot での `/set-team` `/list-active` `/entry` `/entry-now` 登録を停止し、応募系 Slash コマンドは Node.js のみ提供する。
- 2025-10-24: ESCL アカウントを Discord ユーザー単位で複数登録し、暗号化ストレージ＋再登録導線を実装する方針を決定。

#### To-Do
1. [x] Python 版の機能拡張とテスト更新
2. [x] Node.js 版コマンド実装・通知フローの調整
3. [x] ジョブ永続化レイヤーの設計・データ復元テスト
4. [x] README／運用ドキュメント・環境変数一覧の更新
5. [x] Python コマンド廃止（権限・デプロイ手順含む）
6. [x] ESCL アカウント管理コマンド（登録・一覧・削除・デフォルト切替）と暗号化ストレージ実装
7. [x] `/entry` `/entry-now` にアカウント指定オプションを追加し、デフォルト解決ロジックを拡張
8. [x] JWT 有効期限切れ検知と再登録促し／監査ログ連携
9. [x] `ESCL_SECRET_KEY` のローテーション・整合性チェック用 CLI を追加し、ドキュメントへ手順を反映

## Python ESCL コレクタ
- [x] `/escl_from_parent_csv`コマンド実装（6試合分の生データ出力）
- [x] `/escl_from_parent_xlsx`コマンド実装（ALL_GAMES／TEAM_TOTALS集計付き）
- [x] チーム／プレイヤー集計ロジックのリファイン（命中率再計算・小数整形）
- [x] Node.js ランタイム連携に向けた CLI 化と JSON 応答整備

## Discord Bot ランタイム（Node.js）

### 完了済み
- [x] discord.js v14ベースのランタイム基盤と設定ホットリロード
- [x] Welcome Embed／オンボーディングDM／フォールバックスレッド
- [x] 監査ログチャンネル連携とエラー監視
- [x] `/verify post`コマンド実装（ボタン／リアクション対応）
- [x] `/roles post`コマンド実装（ボタン・セレクト・リアクション対応）
- [x] `/introduce`モーダル・自己紹介投稿実装
- [x] `/feedback`コマンドによるローカルMarkdown保存
- [x] Verifyロール剥奪・退会時監査ログ整備（`verify.revoke`／`member.leave`記録）
- [x] `/escl_from_parent_csv`・`/escl_from_parent_xlsx`・`/version` ラッパー実装とPython CLI連携

### 未対応
- [ ] スクリム補助ワークフローの仕様確定と Bot 側実装（設定同期／通知／集計フロー）
- [ ] 起動時の権限バリデーションとヘルスチェックエンドポイント（Slash／定期）整備
- [ ] `/introduce`モーダル拡張（セレクト項目追加・NGワード検証・添付ファイル対応）
- [ ] 設定ファイルの静的検証と障害時の自動リカバリ手順（監査ログ連動）
- [ ] 低コスト常時稼働環境の確立（例: Render/Fly.io 無料枠 or 自宅常時起動マシン＋pm2）
- [ ] 稼働状況監視と通知（Slash `/status` / Webhook での停止検知）
- [ ] リアクション形式ロールパネルの絵文字未設定を検知して投稿を失敗させ、更新時は旧リアクションを除去
- [ ] オンボーディング人数カウントでギルド全件フェッチを避け、軽量なカウント方法に刷新
- [ ] 自己紹介フォームが5項目超過で保存されないよう API と Bot/ダッシュボード両方で制御

## 管理 API（FastAPI）

### 完了済み
- [x] welcome／guideline／verify／roles／introduce／scrims／settings の保存API実装
- [x] `/state.get`・`/audit.search`・`/audit.export`実装と監査ログ整備
- [x] スクリム設定保存／ドライラン (`/scrims.run`) と監査ログ連携

### 未対応
- [ ] 永続ストレージ層の実装（現在はインメモリ）
- [ ] Bot連携向けWebhook／外部通知インターフェース設計
- [ ] 監査ログエクスポートのフォーマット拡張とフィルタ強化（ユーザー／期間／イベント種別）

## 管理フロントエンド（GitHub Pages）

### 完了済み
- [x] Vite + ReactベースのUI雛形と認証フロー実装
- [x] 各設定タブ（Welcome／Guideline／Verify／Roles／Introduce／Scrims／Settings）実装
- [x] 監査ログビューア・YAML差分表示・GitHub PR起票フロー
- [x] スクリム設定タブからのドライラン実行リクエスト

### 未対応
- [ ] 自己紹介フォームUI拡張（セレクト／NGワード／添付設定）
- [ ] 入力バリデーション／プレビューの強化（設定diff事前チェック・必須項目ガード）
- [ ] 設定差分のレビューア向けサマリ生成（PR用テンプレート改善）
- [ ] 自己紹介フォーム項目が5件を超える場合のUI警告と保存前バリデーション

## インフラ／運用準備
- [x] 設定リポジトリ整備と`config.yaml`初期作成
- [ ] Bot用Secretsおよび権限管理手順整備
- [ ] Welcome／Verify／Roles文言とガイドライン確定
- [ ] テストギルドでのエンドツーエンド検証手順書作成
- [ ] ダッシュボードAPIとGitHubの同期自動化（Webhook／スクリプト）検討
- [ ] 障害時オペレーション手順（監査ログ確認／再起動／権限再同期）整備
