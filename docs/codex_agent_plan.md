# Codex連携オートメーション - 実装計画

## フェーズ構成

### Phase 1: コマンド仕様とデータモデルの策定
1. ✅ Slash コマンド要件整理（`/task create`, `/work start`, `/work status` などの引数・レスポンス定義）
   - 主要コマンドの仕様を固め、実装と運用フローに反映済み。必要に応じて追加オプションを検討する。
2. ✅ プロンプト保存先フォーマット決定（ディレクトリ構成、ファイル命名規則、メタデータ形式）
3. ✅ セキュリティ方針のドラフト（権限ロール、入力バリデーション、危険コマンド遮断ルール）
   - `docs/codex/operations.md` に CLI ガード設定と承認フローを文書化し、許可リスト更新時のレビュー手順を明文化した。

### Phase 2: Bot 側機能実装（プロンプト蓄積）
1. ✅ Slash コマンド登録とハンドラ実装（新規依頼を受け取りファイル保存）
2. Inbox 管理ツール作成（一覧表示、検査、削除用ユーティリティ）
   - ✅ `npm run task-inbox` で Inbox の一覧／詳細／削除を実行できる CLI を追加。
   - ✅ `validate` / `update` サブコマンドを追加し、メタデータの検査・編集とプレースホルダー検知を強化。
3. ✅ エラーハンドリングと利用者フィードバック整備（応答メッセージ、ログ出力）
   - `/task create` と `/work start` の失敗応答に Runbook への導線と再試行ガイダンスを組み込み、トラブル時の確認ポイントを明文化した。
   - `health/alerts`／`collectHealthIssueSummary` のユニットテストを追加し、通知フォーマットと要約生成の回帰を `npm test` で検証できるようにした。

### Phase 3: Codex CLI 連携ランナーの構築
1. ✅ Bot → Codex CLI 呼び出しスクリプト実装（依頼選択、環境変数整備）
2. ✅ CLI 実行結果の収集（標準出力／生成ファイル／ステータスコード）
3. ✅ 実行キュー／同時実行制御（直列処理、キャンセル対応の検討）
   - ✅ Bot ランタイムから共有できる `CodexExecutionQueue` を実装し、保留ジョブのキャンセル・履歴参照・状態サブスクライブを提供。
   - ✅ `/work start`／`/work status` Slash コマンドからキューを経由した Codex 実行・状態参照を行えるようにした。
   - ✅ 実行中プロセスの安全な停止手段（AbortSignal 経由のキャンセル操作）を整備。
   - ✅ タイムアウト／シグナル終了シナリオを再現する `npm run codex-queue-harness` を追加し、リトライ挙動と履歴の回帰検証を自動化。

### Phase 4: 結果通知と Plans 運用自動化
1. ✅ Codex 側出力を Discord に送るロジック実装（Follow-up メッセージ等）
   - ✅ 実行結果 Embed を拡張し、stdout/stderr の要約や変更ファイル一覧、履歴ファイルへのリンク、ログ添付ファイルを自動生成する。
   - ✅ Discord メッセージにフォローアップボタン／モーダルを追加し、`CodexFollowUpManager` で Inbox への追加入力と `/work start` までのキュー投入を自動化した。
   - ✅ キャンセル完了時に Discord へ通知を送る処理を追加し、`skip_notify` 設定を尊重する。
   - ✅ 長時間実行時に初回 5 分・以降 10 分間隔（環境変数で調整）でフォローアップ通知を送信するロジックを実装。
2. ✅ Plans.md 自動生成ロジックのテンプレート化（exec plan 準拠）と専用ドキュメント出力先の整備（`docs/codex/*.md`）
3. ✅ `/work status` / `/work cancel` の実装と進捗管理フロー整備
   - ✅ `/work status` Slash コマンドでキュー全体／個別 ID の状況を参照できるようにした。
   - ✅ `/work cancel` の実装と実行中キャンセル時の通知フロー整備。

### Phase 5: セキュリティ・運用強化
1. ✅ コマンド利用権限の最終調整（Bot permissions / Guild roles）
2. ✅ 監視・アラート（ログ監視、失敗時通知、`/status` 実装）
   - ✅ `/status` Slash コマンドで Bot 稼働状況と Codex キュー統計を確認できるようにした。
   - ✅ Codex 実行失敗を Discord へ自動通知し、`tasks/runs/failures/` にエラー内容・タイムラインを保存するフローを実装した。
   - ✅ `healthRegistry` に Codex 通知チャンネル未設定と DiscordActions 初期化失敗を検知する警告を追加し、`/status` で可視化。
   - ✅ `codexFailureMonitor` で直近ウィンドウの失敗率を監視し、閾値超過時に Discord へヘルスアラートを送信できるようにした。
3. ✅ Codex CLI の操作範囲ガード（バイナリ許可リスト、作業ディレクトリ制限、パスサニタイズ）を実装し、危険なサブコマンド／フラグを遮断する仕組みを整備。
4. ✅ ドキュメント整備（運用手順、トラブルシュートガイド、リリースノート）
   - `docs/codex/operations.md` を追加し、セキュリティ運用・失敗時対応・Slash コマンドのトラブルシュート手順を集約した。

## リスクと対策
- **Codex CLI の長時間実行**: タイムアウト制御とステータス更新を導入。必要に応じて処理時間に応じた分割実行を検討。  
- **危険コマンドの流入**: フィルタリングと審査ステップを導入し、手動承認フローを追加できるようにする。  
- **ファイル競合**: Task/Plans 更新は排他制御（ファイルロックやジョブキュー）で整合性を保つ。  
- **Slash コマンドの権限制御**: 特定ロール限定＆監査ログを保存し、不正利用時に即座に停止できるようにする。

## 最新の進捗（2025-10-28）
- `npm run codex-queue-harness` を追加し、タイムアウト／シグナル終了シナリオで `CodexExecutionQueue` のリトライ挙動と履歴出力を自動検証できるようにした。CLI から実行できるため手動確認も容易。
- `healthRegistry` に Codex 通知チャンネル未設定と DiscordActions 初期化失敗の検知を追加し、`/status` コマンドから設定漏れを即時把握できるようにした。通知系ユーティリティからも失敗時にヘルス警告へ反映する。
- `docs/codex/operations.md` にハーネスの運用方法と新しいヘルスチェック項目を追記し、今後の改善メモを CI 連携などの次ステップへ更新した。

## 最新の進捗（2025-10-27）
- `docs/codex/operations.md` を最新仕様に合わせて更新し、自動リトライと失敗率アラートの挙動・設定方法を運用ガイドに明文化した。
- 失敗通知／アラートの送信先やフォローアップ手順を整理し、Discord 側での確認ポイントと監査ログ運用を追記した。
- 今後の改善メモをテストハーネス整備と `healthRegistry` 拡張へフォーカスさせ、フェーズ 4 のドキュメント整備タスクをクローズした。

## 最新の進捗（2025-10-26）
- Codex 実行キューにタイムアウト／終了コード 130・137 検知時の自動リトライ（最大 1 回）を実装し、Discord 通知・履歴 JSON・`/work status` 表示にリトライ情報を反映した。失敗が継続した場合は `CodexRetryExhaustedError` として失敗通知へ引き渡す。
- `tasks/runs/` の成功・失敗ログを集計し、失敗率が閾値を超えた際に Discord へアラートを送る `CodexFailureMonitor` を追加。`CODEX_FAILURE_ALERT_*` 環境変数で閾値／監視ウィンドウ／クールダウンを調整できるようにした。
- Bot 起動時のヘルスチェックに監査ログチャンネル設定の検証を組み込み、未設定時は `healthRegistry` で警告を維持しつつ `/status` コマンドとログで明示的に通知するようにした。

## 最新の進捗（2025-10-25）
- `docs/codex/operations.md` を作成し、Codex CLI ガード設定・承認フロー・失敗時対応・Slash コマンドのトラブルシュート指針を集約。運用メンバーが参照できる共通 Runbook を整備した。
- 決定: 自動リトライはタイムアウトまたはシグナル 130/137 の場合に最大 1 回実施し、それ以外は手動対応とする方針を暫定適用する。
- 発見: 監査ログチャンネル未設定時の警告が運用に伝わりづらいため、起動ヘルスチェックで明示的に検知する改善が必要。

## 最新の進捗（2025-10-24）
- Codex CLI の実行前にバイナリ名・作業ディレクトリ・パス系オプションを検証するセーフティガードを実装。`CODEX_CLI_ALLOWED_*` 系の環境変数で許可リストを拡張できるようにし、リポジトリ外の操作や危険フラグを拒否するようにした。

## 最新の進捗（2025-10-23）
- Codex 実行が `failed` ステータスで終了した際に、専用の失敗通知 (`notifyRunFailure`) を Discord へ送信するようにした。`CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL` が未設定の場合は通常の通知チャンネルにフォールバックし、`skip_notify` など既存オプションも尊重する。
- `recordCodexRunFailure` を追加し、失敗時のエラーメッセージ・スタックトレース・タイムラインを `tasks/runs/failures/` に JSON で保存することで、後追い調査やアラート精度の向上に備えた。

## 最新の進捗（2025-10-22）
- `/status` Slash コマンドを追加し、Discord から Bot 稼働時間・WS Ping・メモリ使用量・Codex 実行キューの状況・通知設定を一括確認できるようにした。運用メンバーがトリアージ前に状況を把握しやすくなった。

## 最新の進捗（2025-10-21）
- Inbox 管理 CLI に `validate` を追加し、summary や概要／詳細セクションの欠落・プレースホルダーを検知してエラー／警告を可視化できるようにした。`--json` で機械可読出力にも対応。
- `npm run task-inbox -- update` でタイトル／優先度／summary／作成日時などのメタデータを CLI から編集できるようにし、本文の `## 概要` を summary に同期するオプションも用意した。
- メタデータ更新時は summary の文字数や ISO8601 形式の日時を検証し、author／channel 情報のクリア操作もサポートした。

## 最新の進捗（2025-10-20）
- `/task create` と `/work` サブコマンドにアクセスコントロールを導入し、既定で「サーバーを管理」権限を要求するようにした。`CODEX_COMMAND_ALLOWED_USER_IDS` / `CODEX_COMMAND_ALLOWED_ROLE_IDS` / `CODEX_COMMAND_REQUIRE_MANAGE_GUILD` の環境変数で Codex 参加者だけに緩和・委譲できる。
- 権限不足時は監査ログへ失敗記録を残し、ユーザーへエフェメラル応答で理由を通知するよう統一した。

## 最新の進捗（2025-10-19）
- Codex 実行が 5 分以上継続した場合に Discord へフォローアップ通知を送る `CodexProgressNotifier` を実装した。通知間隔と最大回数は `CODEX_DISCORD_LONGRUN_NOTIFY_*` 環境変数で調整できるようにし、`skip_notify` や許可チャンネル設定を尊重する。
- 実行キューの購読基盤を活用してキャンセル／完了時には自動的に監視を解除し、不要な通知やタイマーリークを防止する。

## 最新の進捗（2025-10-18）
- Codex 実行がキャンセルで終了した際に、対象タスク・キュー ID・キャンセル種別・理由を含む Discord 通知を送信するよう `notifyRunCancellation` を実装した。`/work start` の `skip_notify` オプションや既定チャンネル設定も尊重し、通知失敗時は警告ログに記録する。

## 最新の進捗（2025-10-18 - QA 強化）
- `health/alerts.ts` と `collectHealthIssueSummary` に node:test ベースのユニットテストを追加し、`npm test` で通知フォーマットとヘルスサマリの回帰を検出できるようにした。
- `/task create` と `/work start` の失敗応答に Runbook への導線とチェックリストを追記し、ユーザーが `docs/codex/operations.md` のトラブルシュート手順へ即座にアクセスできるようにした。

## 最新の進捗（2025-10-17 - 通知刷新）
- Codex CLI が `docs/codex/plans.md` / `docs/codex/task.md` に追記する際、exec plan 準拠のテンプレート（全体像／進捗状況／発見事項／決定事項）と変更ファイル一覧を自動生成するようにした。Run ID・コマンド・所要時間なども合わせて記録されるため、手動での記入作業が容易になった。
- Codex 実行結果の追記先は環境変数 `CODEX_DOCS_PLANS_PATH` / `CODEX_DOCS_TASK_PATH` で上書きできるようにし、既存の `docs/plans.md` / `docs/task.md` を運用している場合も並行利用できるようにした。
- `/work cancel` Slash コマンドを実装し、保留中タスクの即時キャンセルと実行中タスクへのキャンセル要求を Discord から操作できるようにした。監査ログと応答文言を整備し、状況に応じたフィードバックを返す。
- Codex 実行キューが `AbortController` ベースで実行中プロセスへシグナルを送り、Codex Runner 側で安全に子プロセスを終了させるキャンセルフローを導入した。キャンセル時は履歴保存をスキップし、キュー履歴では `cancelled` ステータスを付与する。
- `/work start` / `/work status` Slash コマンドを追加し、Discord から Codex 実行キューへの投入・キュー全体／個別履歴の参照を行えるようにした。通知や docs 更新の既定動作もオプションで制御できる。
- Codex 実行を直列化する `CodexExecutionQueue` を実装し、保留ジョブのキャンセル API・履歴保持・状態サブスクライブ機能を追加。今後は `/work` 系コマンドとの連携と実行中キャンセルの安全な停止方法を検討する。
- Codex Runner で Git ステータス差分を採取し、Codex 実行ごとの新規・変更ファイルを履歴 JSON に保存できるようにした。
- CLI の実行結果表示・Discord 通知・`docs/plans.md` / `docs/task.md` の自動追記に変更件数を表示し、生成ファイルのトレーサビリティを高めた。

## 最新の進捗（2025-10-16）
- Codex 実行結果を `docs/plans.md` / `docs/task.md` に追記する自動更新フローを実装し、CLI の `--update-docs` オプションおよび `CODEX_DOCS_UPDATE_ENABLED` 環境変数で挙動を制御できるようにした。
- Codex CLI 実行結果を Discord に通知するユーティリティ (`notifyRunResult`) を追加し、`CODEX_DISCORD_NOTIFY_CHANNEL` などの環境変数から配信先・ログ出力長を制御できるようにした。CLI からは `--notify` / `--no-notify` やログ長オプションで挙動を調整できる。
- Codex CLI 実行結果の履歴 (`tasks/runs/`) を JSON で保存する仕組みを導入し、標準出力／標準エラー／終了コードを記録できるようにした。CLI 実行時には保存パスを表示し、Git 管理対象外となるよう `.gitignore` を追加。
- Codex から安全に Discord 投稿を行うための `DiscordActions` ユーティリティを実装し、環境変数で許可チャンネル／メンションを制御する仕組みを整備。AGENTS.md に利用手順を明記した。
- Codex CLI をキックするランナー CLI (`npm run codex-runner`) を追加し、Inbox からのタスク選択・実行・環境変数引き渡しを共通化した。タイムアウトや標準入出力の転送も組み込み済み。
- `tasks/inbox/` を横断的に扱う CLI (`npm run task-inbox`) を作成し、一覧表示・内容確認・削除の 3 操作を用意した。
- Bot ランタイムと CLI の双方から同一の Inbox ユーティリティを利用できるようにし、リポジトリルートの検出ロジックを共通化した。

## 最新の進捗（2025-10-18）
- `health/history.ts` を追加し、ヘルスチェック警告の発生・解消イベントを `tasks/runs/health/` 以下に JSON で永続化するようにした。`health/alerts.ts` のオブザーバからイベントを書き出し、Discord 通知が失敗しても履歴が残る体制を構築。
- `tasks/paths.ts` にヘルス履歴用ディレクトリを追加し、将来のダッシュボードや CLI から共通のパス解決ができるようにした。
- `npm run health-history` CLI を整備し、`tasks/runs/health/` の履歴を集計・タイムライン表示できるようにした。summary/detail/timeline の 3 モードで運用担当が状況確認できる。
- ヘルス履歴 CLI で破損した JSON を検出した際に警告とスキップ理由を表示するよう改修し、運用時に不整合へ即座に気付けるようにした。

## 最新の進捗（2025-10-17）
- `.github/workflows/codex-queue-harness.yml` を追加し、`main` ブランチへの push / PR と毎日 03:00 UTC のスケジュールで `npm run codex-queue-harness` を自動実行するようにした。
- CodexExecutionQueue のリトライ挙動を CI で常時検証できるようになり、ハーネス失敗時は GitHub Actions の結果で異常を検知できる体制へ移行した。

## 最新の進捗（2025-11-04 Orchestrator セッション）
- `bot-runtime/config/config.yaml` の `member_count_strategy` を `include_bots` へ修正し、Welcome カードの `title_template` を空文字から `ようこそ {{guild_name}} へ` へ更新した。`loadConfig` の実行で Zod バリデーションをパスすることを確認。
- `.workflow-sessions/20251104_codex-autonomous-workflow/` に各フェーズログ（要件・設計・実装・レビュー・ドキュメント）を追記し、自己駆動サイクルのトレーサビリティを確保した。
- フォローアップとして Dashboard 側の空文字バリデーション追加と、Schema 側のトリム／デフォルト適用ロジックを Meta Generator で優先順位付けする。

## 最新の進捗（2025-11-07 Orchestrator セッション - CI hardening）
- FastAPI `welcome.post` / `settings.save` の空文字バリデーションを pytest で再現する回帰テストを追加し、API レイヤーでの再発防止を自動化。
- `.github/workflows/codex-queue-harness.yml` に `npm run config:validate` を追加し、Push / PR / schedule で必ず YAML 検証を実行するガードを構築。ローカルでも `npm --prefix bot-runtime run config:validate` を標準コマンドとして共有。
- README の Node ランタイムセクションへ設定検証 CLI と CI 連携の手順を追記し、手動オペレーションでも迷わないガイドラインを整備。
- `plan.md` / `docs/plans.md` / `tasks.md` / `.workflow-sessions/20251107_codex-autonomous-workflow-1` に今回の成果とフォローアップ（Dashboard E2E テスト等）を反映。

## 最新の進捗（2025-11-07 Orchestrator セッション）
- Dashboard `SettingsSection` で `member_count_strategy` を `human_only | include_bots` のみに制限し、`WelcomeSection` に Embed/Card タイトルと背景画像のローカルバリデーションを追加した。
- FastAPI `schemas.py` の `MemberCountStrategy` 列挙を Bot ランタイムと揃え、Welcome タイトルをトリム＋必須化。旧値（`all_members` / `boosters_priority`）は自動的に `include_bots` へフォールバックするようにした。
- bot-runtime の Zod スキーマに `trimToUndefined` ヘルパーを導入し、空文字が渡っても既定値へ戻るようサニタイズ。`npm run config:validate`（新規 CLI）で `loadConfig` の検証をワンコマンド化した。
- `plan.md` / `docs/plans.md` / `tasks.md` / `.workflow-sessions/20251107_*` に成果を同期し、未完タスクは Dashboard / CI テスト拡張として整理した。

## 最新の進捗（2025-11-03）
- `.codex/prompts/` に自己駆動プロンプト 7 点（Plan Reader / Task Executor / Repo Rebuilder / Commit & Review / Reflection Logger / Meta Generator / Orchestrator）を追加し、各エージェントの入力・出力・更新対象を定義した。
- Plan Reader → Task Executor → Repo Rebuilder → Commit & Review → Reflection Logger → Meta Generator のシーケンスを Orchestrator が制御する運用モデルを確立した。
- `plan.md` / `tasks.md` / `.workflow-sessions/.template/` の連携を明示し、Reflection Logger と Meta Generator が振り返り・改善サイクルを継続できるようにした。
- 改善タスクとして、プロンプト間の依存関係図と重複入力整理を Meta Generator の改善メモに登録。
- `scripts/create_workflow_session.py` を追加し、`.workflow-sessions/.template/` のコピーと `session_status.json` のタイムスタンプ更新を自動化。ガイド類に使用手順を追記し、完全自動のセッション開始フローを実現した。
- `.codex/prompts/relationships.md` に各プロンプトの依存関係・入出力テーブルを整理し、Meta Generator の改善メモを消化した。
- Orchestrator プロンプトを更新し、セッションディレクトリが存在しない場合に `scripts/create_workflow_session.py` を自動実行してからワークフローを進行するようにした。

## 最新の進捗（2025-11-01 Orchestrator セッション）
- `scripts/create_workflow_session.py` の `slugify` から空白許容を除外し、スラッグ生成時に自動でハイフンへ正規化されるよう修正。`--dry-run` で `20251101_demo-session` が出力されることを確認した。
- `docs/task.md` に「Codex 自動運用ワークフロー」セクションを追加し、Orchestrator サイクルのゴール・現状・優先タスク・フォローアップを整理。Task Executor が参照すべき資料として機能する。
- `tasks.md` に 2025-11-01 セッションのチェックリストを作成し、slugify 修正とドキュメント整備を完了した。
- `.workflow-sessions/20251101_codex-autonomous-workflow/` 配下の 01〜05 ドキュメントと `session_status.json` を更新し、各フェーズの記録・判断を残した。

## 最新の進捗（2025-10-31 Orchestrator 再実行）
- `.codex/prompts/commit_and_review.md` を更新し、Reflection / Meta フェーズ後の差分再確認と通知判断を明示。`03_review.md` との連携手順を整理した。
- `.codex/prompts/reflection_logger.md` と `.codex/prompts/orchestrator.md` に Meta Generator への入力整理・通知フローを追記し、`meta_generator.md` / `tasks.md` へのフィードバック動線を統一した。
- `.workflow-sessions/.template/session_status.json` にステート一覧と `notes` 記入ガイドを追加し、セッションログの記載方法を標準化。`tasks.md` ではサブチェックリスト化により各フェーズの完了条件を明確化した。

## 最新の進捗（2025-10-31 Orchestrator セッション）
- セッション `20251031_codex-autonomous-workflow` を起動し、Plan Reader／Task Executor／Repo Rebuilder の各フェーズを実行して `.workflow-sessions/` 配下の 01〜05 テンプレートを実データで埋めた。
- `plan.md` と `tasks.md` にセッション専用の進捗・チェックリストを追加し、長期計画と実行ログが同期する状態を確認した。
- `session_status.json` のステート遷移と参照ファイル一覧を更新し、後続フェーズ（Reflection / Meta / Commit）の準備を整えた。
- メタ学習用の新規ドキュメント `meta_generator.md` を作成予定とし、改善提案の集約先を明確にした。

## 最新の進捗（2025-10-17）
- Codex 実行結果通知を刷新し、Embed の詳細化・stdout/stderr の分割送信・履歴ファイルリンク・ログ添付を行った。フォローアップボタン経由で `CodexFollowUpManager` が Inbox 用 Markdown を生成し、即座に `/work start` へ連携できる。
- `CodexProgressNotifier` により長時間実行時のフォローアップ通知を導入し、ヘルスサマリと合わせて進捗を共有できるようにした。
- `codexFailureMonitor` を追加し、直近ウィンドウの失敗率を常時監視して Discord へヘルスアラートを自動送信する体制を構築した。
- `npm run codex-queue-harness` と GitHub Actions の定期実行を整備し、タイムアウトやシグナル終了時のリトライ挙動を継続的に検証している。

## 最新の進捗（2024-02-14）
- `/task create` Slash コマンドの保存先が `bot-runtime/tasks/` に誤って向いていた問題を修正し、リポジトリ直下 `tasks/inbox/` に確実に保存されるようにした。
- 既存の保存ロジックと監査ログ処理はそのまま維持しつつ、フォルダ作成処理が正しいパスを対象にすることを確認した。

## 最新の進捗（2024-02-13）
- `/task create` Slash コマンドを実装し、概要・詳細・優先度を受け取ってローカルファイルに保存できるようにした。
- `tasks/inbox/` ディレクトリを作成し、YAML Front Matter 付き Markdown で Codex 依頼を蓄積するワークフローを整備した。
- 保存処理と監査ログ送信、Discord への応答テンプレートを整備し、入力バリデーション（概要または詳細の必須化）を追加した。

## Slash コマンド仕様ドラフト（v2024-02-13）
- `/task create`
  - `title` (必須): 3〜150 文字。ファイル名スラッグとメタデータ `title` に使用。
  - `summary` (任意): 5〜500 文字。概要として Front Matter と本文両方に格納。
  - `details` (任意): 10〜1900 文字。詳細セクションとして保存。概要が未入力の場合はこちらが必須。
  - `priority` (任意): `low` / `normal` / `high`。Front Matter に `priority` / `priority_label` を書き込み、応答メッセージにも表示。
- **バリデーション**: `summary` と `details` のいずれかは必須。CRLF を LF に正規化し、前後の空白を除去して空入力を防止。
- **応答フロー**: 受理時にエフェメラルで進捗メッセージ → 保存完了後にファイル名と優先度を通知。失敗時はエラーメッセージを返す。

## プロンプト保存フォーマット
- 保存先: リポジトリ直下 `tasks/inbox/`。ファイル名は `YYYY-MM-DDTHH-MM-SS-sssZ-title-slug.md`。
- コンテンツ構造:
  - YAML Front Matter（`title`, `priority`, `priority_label`, `summary`, `created_at`, `author.id`, `author.tag`, `channel_id`, `interaction_id`）。
  - 本文 `## 概要` / `## 詳細` セクションと、自動生成の署名。
- CLI / Codex 側は Front Matter をパースすれば依頼メタデータを取得できる。本文は Codex への提示テキストとして使用する。

## 決定事項とメモ
- Codex CLI 側に引き渡す最低情報として、Discord ユーザー ID・チャンネル ID・優先度・概要/詳細文を Markdown 1 ファイルに集約する。
- 依頼登録は Slash コマンド経由のみとし、後続の `/work start` などは今後のフェーズで設計。既存の監査ログ基盤を流用して失敗時の追跡を行う。
- ファイル名スラッグは Unicode 正規化 (NFKC) と英数字・アンダースコア・ハイフンに制限し、ローカルファイルシステム互換を優先する。
- Bot 実行時のカレントディレクトリに依存せず、リポジトリ直下 `tasks/` を明示的に参照する。
- CLI 経由の削除操作は誤操作防止のため `--force` 指定を必須とし、Slash コマンドと同一のユーティリティでパス解決する。
- Codex CLI 連携のビルド検証はサンドボックス環境では `tsc` 実行に制限がかかるため、必要に応じてローカル環境で追試する。
- Discord 上での投稿や管理操作を Codex から安全に行うため、専用のユーティリティとハーネス（例: `discordActions` ライブラリ）を用意し、許可チャンネルや監査フローを AGENTS.md に明文化する。
- Discord 投稿時の許可チャンネルは `CODEX_DISCORD_ALLOWED_CHANNELS` 環境変数で明示し、必要に応じて `CODEX_DISCORD_ALLOWED_USERS` / `CODEX_DISCORD_ALLOWED_ROLES` でメンションをホワイトリスト管理する。
- Codex CLI 実行履歴は `tasks/runs/` 配下に JSON で出力し、`CODEX_CLI_HISTORY_*` 環境変数で保存の有効／無効やログの最大長を調整する。
- Codex 実行結果の Discord 通知先 (`CODEX_DISCORD_NOTIFY_CHANNEL`) とログ表示長 (`CODEX_DISCORD_NOTIFY_STDOUT_LIMIT` / `CODEX_DISCORD_NOTIFY_STDERR_LIMIT`) は環境変数で調整し、CLI からは `--notify` / `--no-notify` / `--stdout-limit` / `--stderr-limit` で個別制御できる。
- Codex コマンドの権限制御ではホワイトリスト（`CODEX_COMMAND_ALLOWED_USER_IDS` / `CODEX_COMMAND_ALLOWED_ROLE_IDS`）を優先し、ManageGuild 権限が無くても許可ユーザー／ロールは実行できるように調整した。ホワイトリスト未登録のユーザーは従来通り ManageGuild 権限が必須となる。
- Plans/Task ドキュメントの自動追記は `CODEX_DOCS_UPDATE_ENABLED` で既定動作を切り替え、CLI から `--update-docs` / `--no-update-docs` で上書きできる。
- Codex 実行結果の追記先は `CODEX_DOCS_PLANS_PATH` / `CODEX_DOCS_TASK_PATH` で変更でき、既定では `docs/codex/plans.md` / `docs/codex/task.md` を使用する。
- CodexExecutionQueue のリトライ挙動を検証するためのハーネスとして `npm run codex-queue-harness` を追加し、タイムアウト／シグナル終了の回帰テストを即時実行できるようにする。
- Codex queue ハーネスの自動実行は GitHub Actions（`.github/workflows/codex-queue-harness.yml`）で管理し、`main` ブランチへの push / PR と 03:00 UTC のスケジュール実行で `npm run codex-queue-harness` を走らせる。
- `healthRegistry` は Codex 通知チャンネル未設定と DiscordActions 初期化失敗を常時監視し、警告が解消された際は通知ユーティリティからクリアする運用とする。
- `healthRegistry` のイベントは `health/alerts.ts` のオブザーバで捕捉し、`CODEX_DISCORD_HEALTH_ALERT_CHANNEL` → `CODEX_DISCORD_FAILURE_ALERT_CHANNEL` → `CODEX_DISCORD_FAILURE_NOTIFY_CHANNEL` → `CODEX_DISCORD_NOTIFY_CHANNEL` の順で解決したチャンネルへ自動通知する。通知には検知時刻・詳細・現在の警告一覧を含め、解消時も同じルートで報告する。
- 長時間フォローアップ通知と `/status` コマンドはいずれも `collectHealthIssueSummary` を用いた共通サマリを表示し、実行状況に加えて設定異常が即座に把握できるようにした。
- 長時間フォローアップ通知は `CODEX_DISCORD_LONGRUN_NOTIFY_ENABLED` / `CODEX_DISCORD_LONGRUN_NOTIFY_AFTER_MS` / `CODEX_DISCORD_LONGRUN_NOTIFY_INTERVAL_MS` / `CODEX_DISCORD_LONGRUN_NOTIFY_MAX` で制御し、既定は 5 分後開始・10 分間隔・最大 3 回。
- Codex 関連 Slash コマンドの権限制御は `CODEX_COMMAND_REQUIRE_MANAGE_GUILD`（既定オン）と `CODEX_COMMAND_ALLOWED_USER_IDS` / `CODEX_COMMAND_ALLOWED_ROLE_IDS` で調整する。
- `/status` コマンドは Bot 稼働状況と Codex 実行キューの統計をまとめて返し、`CODEX_DISCORD_NOTIFY_CHANNEL` や `CODEX_DOCS_UPDATE_ENABLED` の設定状況も確認できる。監視運用の初期ステップとして活用する。
- ヘルス通知関連のユニットテストは `node:test` + `ts-node/register` を用いた `npm test` で実行し、通知フォーマットと要約生成の回帰検出を標準化する。（2025-10-18）
- Slash コマンドの失敗応答では `docs/codex/operations.md` のトラブルシュート手順と `tasks/runs/failures/` の確認を案内し、利用者が再試行前に Runbook を参照できる動線を維持する。（2025-10-18）

## 次のアクション
1. ✅ 永続化したヘルスチェック履歴を集計・可視化するダッシュボード（例: `tasks/runs/health/` ビューア）を設計し、運用向けに公開する。
2. ✅ `health/alerts` と `collectHealthIssueSummary` のユニットテスト／統合テストを整備し、`npm test` で通知フォーマットやレート制御の回帰を検出できるようにした。（2025-10-18）
3. ✅ Slash コマンド失敗時に再試行ガイダンスや Runbook への導線を追加し、利用者フィードバックを強化した。（2025-10-18）
\n## 最新の進捗（2025-11-08）
- Orchestrator を一巡し、`.workflow-sessions/20251108_codex-autonomous-workflow` に各フェーズログを整備。`tasks.md` へチェックリストを追加。
- plan.md への追記は他の未コミット差分を分離後に実施する方針。`.workflow-sessions` の commit/ignore 方針を次サイクルで明確化する。
\n## 最新の進捗（2025-11-08 再実行）
- `.workflow-sessions/20251108_codex-autonomous-workflow-1` を作成し、各フェーズログを整備。`tasks.md` に再実行チェックリストを追加。
- 機能変更なし。`plan.md` は既存差分の混在回避のため次サイクルで更新。

## 20251108_codex-autonomous-workflow-2 実行ログ要約
- テーマ: codex-autonomous-workflow
- 出力: 01〜05 更新、tasks.md/plan.md/docs 反映、コミット
## Orchestrator Lite 実行ログ（20251108_codex-autonomous-workflow-3）
- 目的: スクリプトなしの Codex 直実行で Plan→Tasks→Repo→Review→Reflection→Meta を最小更新。
- 実施: 01/02/04/05 を作成、tasks/plans/meta/plan に進捗追記。03 は差分取得後に生成・コミット。
- 備考: コード変更なし。push 失敗時は session_status.json に記録。
