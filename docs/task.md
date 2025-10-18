# タスクリスト

## ESCL スクリム自動エントリー Bot v2

### ゴール / Definition of Done
- `/set-team` でユーザーごとの `teamId` を永続化し、`/entry` で省略時に自動解決できる。
- `/entry` から ESCL API `CreateApplication` を **前日 0:00 (JST)** で送信でき、結果を Discord へ通知する。
- `ListActiveScrim` などの補助 API を叩き、`/list-active` で最新スクリム情報を提示できる。
- JWT・teamId 等の機密は `.env`・ローカルファイルに限定して取り扱い、ログへ出力しない。

### 詳細要件メモ
- ESCL API エンドポイント
  - `CreateApplication`: `POST /user.v1.UserApplicationService/CreateApplication`
  - `GetApplications`: `POST /public.v1.PublicApplicationService/GetApplications`
  - `ListActiveScrim`: `POST /public.v1.PublicScrimService/ListActiveScrim`
- 認証ヘッダー: `Authorization: Bearer <JWT>` ほか `Origin` / `Referer` / `connect-protocol-version: 1` を必須とする。
- 応募スケジュールは **開催日の前日 0:00 JST** を基準とし、タイムゾーンは `Asia/Tokyo` で固定。

### 実装状況
- [x] Python Bot に `/set-team` `/list-active` `/entry` と応募スケジューラを実装済み（現状は 0.5 秒間隔で最大 6 回リトライ。進捗用スレッド生成、teamId 永続化、ESCL API クライアント、ユニットテスト `tests/test_entry_scheduler.py` 付き）。
- [ ] Node.js ランタイムへ Slash コマンドを移植し、既存機能（CSV/XLSX, verify, introduce など）と共存させる。
- [ ] 応募ジョブを永続化し、Bot 再起動後も予約を復元できるようにする（軽量なファイル永続化を想定。性能への影響も合わせて検証）。
- [ ] Node 側で安定稼働を確認後、Python 側の `/entry` 系 Slash コマンドを無効化または削除して運用を一本化する。

### 追加要望（2025-10-18）
- [ ] `/entry` に任意の時刻を指定できるオプション（例: `dispatch_at=HH:MM`）を追加し、未指定時は従来どおり前日 0:00 JST。
- [ ] 応募を即時 1 回だけ送信する Slash コマンド（仮: `/entry-now`）を追加する。
- [ ] リトライ回数を **3 回** へ調整し、429 などの待機ロジックも新設定に合わせる。
- [ ] 上記変更を Node.js ランタイム移植計画へ反映し、移植完了後も同じ挙動を保証する。

### Exec Plan: ESCL スクリム自動エントリー Bot v2

#### 全体像
Python 版で成熟している応募フローに「任意時刻オプション」「即時実行コマンド」「リトライ最大 3 回」を追加し挙動を確定させたうえで、Node.js ランタイムへ移植して Slash コマンドを一本化する。再起動後も予約が維持されるよう軽量な永続化層を組み込み、更新点を README や運用手順に反映する。

#### 進捗状況
- [x] Python 実装と既存ユニットテストの現状確認
- [ ] 任意時刻オプション／即時応募コマンド／リトライ 3 回を Python 版へ実装しテストを更新
- [ ] Node.js への機能移植と Slash コマンド登録・権限確認
- [ ] 応募ジョブ永続化方式（ファイル／SQLite 等）の検証と導入
- [ ] README・運用ドキュメントの更新とリリース手順整備

#### 発見と驚き
- Python 版ではスケジューラ・進捗スレッド通知が実装済みだが、Node.js 側には該当コマンドが未登録で UI から利用できない。
- 応募ジョブはメモリ保持のみで、再起動すると予約が失われることが分かった。

#### 決定ログ
- 2025-10-18: リトライ最大回数を 3 回へ縮小し、インターバル 0.5 秒は維持する方針を決定。
- 2025-10-18: Node.js へ移植後は Python 側の同名 Slash コマンドを無効化し運用を一本化する。

#### To-Do
1. [ ] Python 版の機能拡張とテスト更新
2. [ ] Node.js 版コマンド実装・通知フローの調整
3. [ ] ジョブ永続化レイヤーの設計・データ復元テスト
4. [ ] README／運用ドキュメント・環境変数一覧の更新
5. [ ] Python コマンド廃止（権限・デプロイ手順含む）

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
