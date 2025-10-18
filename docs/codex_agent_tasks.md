# Codex連携オートメーション - タスクリスト

## 目的
Discord からの Slash コマンド経由で Codex CLI を起動し、保存されたプロンプトをもとに `Task.md` / `Plans.md` の更新や作業実行を自走化する仕組みを整備する。

## タスク
- [x] Slash コマンド設計
  - [x] `/task create`: 概要・詳細・優先度を受け取り、`tasks/inbox/` に Markdown で保存するフローを実装。
  - [x] `/work start` / `/work status` / `/work cancel` といった作業実行系コマンドのワークフローを決める。
    - [x] `/work start` / `/work status` のワークフローと Slash コマンド実装を整備。
    - [x] `/work cancel` のワークフローと実装を固める。
- [x] プロンプト保管レイヤーの実装
  - [x] 指定フォルダ（例: `tasks/inbox/`）へ依頼内容をテキストで蓄積する。
  - [x] ファイル命名規則・メタデータ（依頼者、チャンネル、タイムスタンプなど）を設計する。
  - [x] Inbox の一覧／詳細確認／削除を行う CLI (`npm run task-inbox`) を整備する。
  - [x] CLI に `validate` / `update` コマンドを追加し、メタデータ検査と編集・同期をサポートする。
- [x] Codex CLI 連携ランナー  
  - [x] Bot からローカル Codex CLI をキックするためのスクリプト／API を用意する。(`npm run codex-runner` CLI でタスク選択・実行を共通化)  
  - [x] CLI が Task/Plans を更新し、結果を返却するためのインターフェースを整備する。  
    - [x] 実行結果（stdout／stderr／終了コード）を `tasks/runs/` に保存する履歴ストアを追加。  
  - [x] Codex 実行結果を Plans/Task ドキュメントへ反映するプロセスを設計・実装する。(`--update-docs` オプション／`CODEX_DOCS_UPDATE_ENABLED`、出力先は `CODEX_DOCS_PLANS_PATH` / `CODEX_DOCS_TASK_PATH` で切替)
    - [x] Git ステータス差分から生成・変更ファイルを記録し、履歴／通知／ドキュメントの出力に反映する。
  - [x] 実行キュー／同時実行制御  
    - [x] `CodexExecutionQueue` で直列実行・保留キャンセル・履歴参照・状態サブスクライブを提供。  
    - [x] Slash コマンド（`/work start`／`/work status`）からの利用とキュー状態参照を実装する。
    - [x] 実行中キャンセル時の強制終了手段と通知・監査フローを設計する。
    - [x] タイムアウト／シグナル終了シナリオを再現する `npm run codex-queue-harness` と GitHub Actions ワークフローを整備し、リトライ挙動を継続検証できるようにする。
- [x] 結果連携と通知  
  - [x] CLI 実行結果（成功／失敗／出力ファイルなど）を Discord に投稿する仕組みを作る。(`notifyRunResult`＋`--notify` オプション／環境変数制御)  
  - [x] キャンセル完了時にタスク情報や理由を含む Discord 通知を送る仕組みを追加する。(`notifyRunCancellation`／`skip_notify` 対応)
  - [x] 長時間処理への対応として、ステータス更新やフォローアップメッセージを整理する。
  - [x] 実行結果 Embed を拡張し、stdout/stderr のサマリ分割・変更ファイル一覧・履歴ファイルへのリンク、テキスト添付を提供する。
  - [x] Discord メッセージにフォローアップボタンとモーダルを追加し、Inbox への追加入力から `/work start` のキュー投入まで自動化する。
- [x] セキュリティ／権限管理  
  - [x] Slash コマンド利用者の制限（ロールチェック等）と、危険な依頼をフィルターするルールを定義する。  
  - [x] Codex CLI 側で実行できる操作範囲を制御し、ファイルパスのサニタイズなどを行う。
  - [x] Codex 運用時のセキュリティ方針・承認フローをドキュメント化する。（`docs/codex/operations.md`）
- [x] Discord 操作用ユーティリティ整備  
  - [x] Codex から Discord 投稿やチャンネル操作を行う際に利用する標準ラッパー（例: `discordActions`）を設計し、許可チャンネルや監査ログ出力を組み込む。  
  - [x] AGENTS.md へ利用ルールとガードレール（ホワイトリスト・ドライラン・監査方法など）を追記する。
- [x] 運用／監視  
  - [x] 失敗時のリトライ／アラート、ログ収集方法を決める。（`docs/codex/operations.md` の運用ルールを参照）  
    - [x] Codex 実行失敗を Discord へ通知し、`tasks/runs/failures/` に詳細ログを保存する仕組みを追加。
    - [x] 自動リトライ戦略と閾値アラートの要件を整理する。（タイムアウト／シグナル 130・137 時のみ 1 回リトライ）
    - [x] `tasks/runs/failures/` ログの活用手順とダッシュボード化を検討する。（Runbook で調査手順とアラート基準を定義）
    - [x] `codexFailureMonitor` で直近ウィンドウの失敗率を監視し、閾値超過時に Discord へヘルスアラートを送出する。
  - [x] `/status` コマンドを追加し、稼働状況を即座に確認できるようにする。  
  - [x] トラブルシュート手順を文書化する。（Slash コマンドのエラー対応を Runbook に集約）
  - [x] ヘルスチェック通知の履歴を永続化し、`tasks/runs/health/` などで過去の警告を参照できるようにする。
  - [x] 永続化したヘルス履歴を可視化するダッシュボード／CLI を整備し、運用が参照できるようにする。
  - [x] `health/alerts.ts` と `collectHealthIssueSummary` のユニットテスト／統合テストを追加し、通知フォーマットとレート制御を回帰防止する。
- [x] エラー時の利用者フィードバック向上
  - [x] `/task` `/work` 失敗時に再試行ガイダンスや Runbook への導線をレスポンスへ追加する。

## メモ
- MVP ではローカルマシン上で Bot と Codex CLI が同居する前提。将来的にリモートワーカーとの連携も検討。  
- Plans.md 運用ルール（exec plan）は CLI 側で自動的に満たすフローを設ける。（テンプレート生成＋`docs/codex/*.md` 専用ファイルで対応済み）  
- 実装着手前に Slash コマンド登録や必要なBot権限を確認しておく。
