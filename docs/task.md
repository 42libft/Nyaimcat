# タスクリスト

## Python ESCL コレクタ
- [x] `/escl_from_parent_csv`コマンド実装（6試合分の生データ出力）
- [x] `/escl_from_parent_xlsx`コマンド実装（ALL_GAMES／TEAM_TOTALS集計付き）
- [x] チーム／プレイヤー集計ロジックのリファイン（命中率再計算・小数整形）

## Discord Bot ランタイム（Node.js）
- [x] discord.js v14ベースのランタイム基盤と設定ホットリロード
- [x] Welcome Embed／オンボーディングDM／フォールバックスレッド
- [x] 監査ログチャンネル連携とエラー監視
- [x] `/verify post`コマンド実装（ボタン／リアクション対応）
- [x] `/roles post`コマンド実装（ボタン・セレクト・リアクション対応）
- [x] `/introduce`モーダル・自己紹介投稿実装
- [ ] スクリム補助ワークフロー設計・Bot連携
- [ ] `/verify`ロール剥奪・退会時監査ログ整備（設計6.3反映）
- [ ] `/introduce`モーダル拡張（セレクト項目・NGワード検証・添付対応）
- [ ] Botロール権限チェックと起動時ヘルスチェック整備

## 管理 API（FastAPI）
- [x] welcome／guideline／verify／roles／introduce／scrims／settingsの保存API実装
- [x] `/state.get`・`/audit.search`・`/audit.export`実装と監査ログ整備
- [ ] 永続ストレージ層の実装（現在はインメモリ）
- [ ] Bot連携向けWebhook／外部通知インターフェース設計

## 管理フロントエンド（GitHub Pages）
- [x] Vite + ReactベースのUI雛形と認証フロー実装
- [x] 各設定タブ（Welcome／Guideline／Verify／Roles／Introduce／Scrims／Settings）実装
- [x] 監査ログビューア・YAML差分表示・GitHub PR起票フロー
- [ ] 自己紹介フォームUI拡張（セレクト／NGワード／添付設定）
- [ ] 入力バリデーション／プレビューの強化（設定diff事前チェック）

## インフラ／運用準備
- [x] 設定リポジトリ整備と`config.yaml`初期作成
- [ ] Bot用Secretsおよび権限管理手順整備
- [ ] Welcome／Verify／Roles文言とガイドライン確定
- [ ] テストギルドでのエンドツーエンド検証手順書作成
- [ ] ダッシュボードAPIとGitHubの同期自動化（Webhook／スクリプト）検討
