# タスクリスト

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
