# Codex 運用ガイド

Codex 連携機能を安全かつ安定的に運用するための実務ガイドです。セキュリティガードの調整、失敗時の対応、Slash コマンドのトラブルシュートをここで一元管理します。

## セキュリティポリシーと承認フロー

### CLI 実行ガード
- 実行前ガードは `bot-runtime/src/codex/security.ts` で構成され、Codex CLI のバイナリ・作業ディレクトリ・参照パス・サブコマンドを検証します。
- 環境変数で許可範囲を調整できます。未設定の場合は最小権限（`codex` バイナリ／リポジトリ直下）で動作します。

| 設定項目 | 役割と既定値 | 更新時の承認ポイント |
| --- | --- | --- |
| `CODEX_CLI_ALLOWED_BINARIES` | 実行可能なバイナリ名またはパス。既定は `codex` のみ。 | バイナリ追加は PR ベースでレビューし、リスク評価と rollback 手順を AGENTS.md に追記してから反映する。 |
| `CODEX_CLI_ALLOWED_WORKDIRS` | 作業ディレクトリの許可リスト。既定はリポジトリルート。 | リポジトリ外を追加する場合はアクセス目的と保護策（読み取り専用等）を記録する。 |
| `CODEX_CLI_ALLOWED_PATHS` | CLI 引数で参照可能なパスルート。既定は `allowedWorkdirs` と同じ。 | 追加パスは最小単位で限定し、実ファイルのバックアップとアクセス監視を合わせて設定する。 |
| `CODEX_CLI_ALLOWED_SUBCOMMANDS` | 許可する Codex CLI サブコマンド。既定は `""`（デフォルト）と `exec`。 | 新規サブコマンドはドキュメント化された利用手順と危険フラグの洗い出し後に解放する。 |
| `CODEX_CLI_BLOCKED_FLAGS` | 使用禁止フラグを明示的に列挙。 | 危険操作が検知された場合は即座に追加し、監査ログに根拠を記録する。 |
| `CODEX_CLI_PATH_OPTION_NAMES` / `CODEX_CLI_PATH_OPTION_PATTERNS` | パス判定を強制するオプション名／正規表現の追加。 | 新しい CLI オプションの導入時に網羅性を確認する。 |

### Discord コマンド権限
- `bot-runtime/src/codex/accessControl.ts` のガードにより、`/work` / `/task` 系コマンドはギルド内＆許可ロールに限定されています。
- 主要パラメータ:
  - `CODEX_COMMAND_REQUIRE_MANAGE_GUILD`（既定: true）: `ManageGuild` 権限保持者に限定。
  - `CODEX_COMMAND_ALLOWED_USER_IDS` / `CODEX_COMMAND_ALLOWED_ROLE_IDS`: 明示的なホワイトリスト。
- 新たなユーザー／ロールを許可する際は、1) 申請理由を記録、2) 最低限必要な権限かを確認、3) 監査ログ用チャンネル（`config.channels.auditLog`）が稼働していることをチェック、の順で承認します。

### 作業承認プロセス
1. `tasks/inbox/` の依頼内容を `/task create` や CLI で確認し、危険操作が含まれないかレビューする。
2. 必要に応じて `docs/codex/plans.md` へ exec plan を作成し、想定される変更範囲と完了条件を共有する。
3. `/work start` を実行するユーザーは、実行前に `CODEX_CLI_ALLOWED_*` が最新であること、通知先チャンネルが許可リストに含まれることを確認する。
4. 実行後は監査チャンネルに送信された JSON ログを確認し、異常が無いかレビューする。
5. 許可リストの変更・例外許可を出した場合は、必ず `codex_agent_plan.md` の「発見事項と決定事項」に記録する。

## 失敗時対応と監視ルール

### 記録の場所
- 正常終了時は `tasks/runs/*.json` に履歴が保存され、`runId` と差分ファイル（`fileChanges`）が格納されます。
- 失敗時は `bot-runtime/src/codex/history.ts` によって `tasks/runs/failures/*.json` が生成され、キュー ID・エラーメッセージ・スタックトレース・開始／終了時刻が含まれます。
- 調査時は `jq` などで JSON を参照し、再現条件を洗い出してください。
- ヘルスチェックの警告履歴は `tasks/runs/health/*.json` に保存されます。`npm run health-history -- summary|detail|timeline` で集計結果やタイムラインを確認できます。

### リトライ／アラート方針
- **自動リトライ実装**
  - `CodexExecutionQueue` はタイムアウト検知または終了コード 130 / 137 を確認した場合に最大 1 回自動リトライします。再試行した理由は `queueItem.retry.reasons` と通知メッセージ、`/work status` で確認できます。
  - リトライ挙動の回帰チェック用に `npm run codex-queue-harness` を用意しました。タイムアウト／シグナル終了を模擬し、キュー履歴とリトライ理由の記録が期待通りか確認できます。
  - リトライ後も失敗した場合は `CodexRetryExhaustedError` として失敗扱いとなり、Discord 通知・監査ログ・`tasks/runs/failures/*.json` にリトライ回数と理由が記録されます。
  - Lint / テスト失敗など deterministic なエラーは即座に失敗として終了し、自動リトライは行いません。
- **手動フォローアップ手順**
  1. 失敗通知（Discord）の添付リンクから `tasks/runs/failures/<queueId>-*.json` を開き、`error.message` / `error.stack` と `retry` 情報を確認する。
  2. 再実行が必要な場合は `/work start` で再投入し、監査ログに原因と再実行理由（自動リトライ後の手動対応など）を必ず記録する。
  3. 再現性が高い障害は `CODEX_CLI_BLOCKED_FLAGS` や許可パス設定の見直し、依頼内容の分割など恒久対策を検討する。
- **失敗率アラート**
  - `CodexFailureMonitor` が `tasks/runs/*.json` / `tasks/runs/failures/*.json` を集計し、監視ウィンドウ内の失敗率が閾値を超えると Discord へアラートを送信します。
  - 既定値: 閾値 50%、監視ウィンドウ 60 分、最低実行数 5 件、最低失敗数 3 件、クールダウン 30 分。
  - 環境変数 `CODEX_FAILURE_ALERT_THRESHOLD` / `CODEX_FAILURE_ALERT_WINDOW_MINUTES` / `CODEX_FAILURE_ALERT_MIN_RUNS` / `CODEX_FAILURE_ALERT_MIN_FAILURES` / `CODEX_FAILURE_ALERT_COOLDOWN_MINUTES` で調整できます。
  - アラート送信先は `CODEX_DISCORD_FAILURE_ALERT_CHANNEL` → `CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL` → `CODEX_DISCORD_NOTIFY_CHANNEL` の順で解決されます。通知先を更新した際は許可チャンネル設定を忘れずに同期してください。

### 通知・監視設定
- `CODEX_DISCORD_NOTIFY_CHANNEL` により成功通知・通常通知先を固定できます。`CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL` を設定すると失敗通知だけを別チャンネルへ送れます。長時間実行時のフォローアップは `CODEX_DISCORD_LONGRUN_NOTIFY_*` で制御します。
- ヘルスチェック警告は `health/alerts.ts` が自動で検知し、`CODEX_DISCORD_HEALTH_ALERT_CHANNEL` → `CODEX_DISCORD_FAILURE_ALERT_CHANNEL` → `CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL` → `CODEX_DISCORD_NOTIFY_CHANNEL` の順で決まるチャンネルへ通知します。通知には検知状況と現在の警告サマリが含まれ、解消時にも同経路で報告します。
- `/status` コマンドのヘルスチェックに「Codex 通知チャンネル未設定」「DiscordActions 初期化失敗」を追加したため、設定漏れがあれば警告として表示されます。
- 失敗率アラートの通知先は `CODEX_DISCORD_FAILURE_ALERT_CHANNEL`（未設定時は失敗通知→通常通知へフォールバック）で指定します。アラート文面は監視ウィンドウ・失敗率・対象ファイルを含みます。
- 監査ログは `AuditLogger` が JSON を Discord チャンネルへ送信します。チャンネル未設定時は `logger.warn` が出るため、起動時ログで必ず確認してください。
- 運用ダッシュボードや外部監視へ転送する場合は、`CODEX_CLI_HISTORY_*` のログをポーリングするスクリプトを追加し、再利用可能なリポートを設計します。

## Slash コマンドのエラーメッセージとトラブルシュート

`bot-runtime/src/discord/commands/work.ts` などでユーザー向けのメッセージと監査ログが定義されています。代表的なケースと対処例は以下の通りです。

| メッセージ | 典型的な原因 | 対処 |
| --- | --- | --- |
| `このコマンドを実行するには「サーバーを管理」権限が必要です。` | `CODEX_COMMAND_REQUIRE_MANAGE_GUILD=true` で権限不足。 | 管理者が権限を付与するか、ホワイトリスト環境変数にユーザー／ロールを追加する。 |
| `Codex 実行キューへの登録に失敗しました。理由: ...` | タスクファイルの取得失敗、セーフティガードで拒否、実行キュー内部エラーなど。 | 監査ログと `tasks/runs/failures` を確認し、必要に応じて CLI 設定を更新。 |
| `指定されたキュー ID ... は見つかりませんでした。` | キュー ID の打ち間違い、既に完了済み。 | `/work status` を実行して最新の ID を確認。 |
| `キューの状態取得中にエラーが発生しました。` | 実行キューのスナップショット取得で例外、Redis など外部依存の断絶。 | `bot-runtime` のサーバーログと監査ログを確認し、キューサービスの再起動や依存復旧を行う。 |
| `この選択メニューはコマンドを実行したユーザーのみが利用できます。` | `/work start` の選択 UI を他ユーザーが操作。 | 当該ユーザーに再実行してもらう。 |

### 監査ログの活用
- すべての Slash コマンド結果は監査チャンネルに JSON で送信されます（`action` は `codex.work.start` など）。
- エラー時は `status: "failure"` と詳細 (`details.error`) が含まれるため、Discord 内で検索しやすい形式になっています。
- 監査ログ未送信が続いた場合は `AuditLogger` 設定を確認し、必要に応じて再起動時に `config.channels.auditLog` を再設定してください。

### トラブルシュートチェックリスト
1. ユーザー権限とホワイトリスト設定を確認する。
2. `tasks/inbox/` に対象ファイルが存在するか、メタデータが破損していないか `npm run task-inbox validate` で検証する。
3. `CODEX_CLI_ALLOWED_*` / `CODEX_CLI_BLOCKED_FLAGS` の変更履歴を確認し、未承認の更新が無いかを調べる。
4. 監査ログ・通知ログに残ったエラーコードを `docs/codex_agent_plan.md` の発見事項に追記し、恒久対応を検討する。

## 今後の改善メモ
- テストハーネス `npm run codex-queue-harness` を CI や定期ジョブに組み込み、リトライ分岐の回帰を自動化する。
- ヘルス通知を外部監視ツール（例: PagerDuty / Opsgenie）へ中継する仕組みを検討し、Discord 以外へのエスカレーション経路を確立する。
- 大規模障害時のエスカレーションフロー（連絡先と SLA）は別紙 `AGENTS.md` に追記予定。運用チームと合意できたら本ドキュメントから参照リンクを追加する。
