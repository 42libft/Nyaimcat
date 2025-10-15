# Slashコマンド実装計画

## 目的とスコープ
- `task.md`で未完のSlashコマンド（`/verify post`, `/roles post`, `/introduce`）をDiscordランタイムへ実装し、ダッシュボード設定を即時反映できる状態にする。
- コマンド実行時の監査ログとエラーハンドリングを統一し、Botランタイムの監視性を高める。
- YAML設定とホットリロードの整合を保ちながら、コマンド投稿後のメッセージIDやメタ情報を安全に管理する。

## 実装ステップと進捗
1. ✅ 設定スキーマ差分の棚卸しと各コマンド要件の確定
   - `roleAssignments`へのリネーム、`verify/roles/introduce`各セクションを追加。`roles.message_id`など投稿後のメッセージID保持先を定義。
2. ✅ `/verify post`コマンド実装
   - `VerifyManager`でボタン／リアクション両モードに対応。投稿結果を監査ログへ送信し、返信で`config.verify.message_id`更新を案内。
3. ✅ `/roles post`コマンド実装
   - `RolesPanelManager`でボタン／セレクト／リアクション形式を動的生成。絵文字マッピングは`role_emoji_map`優先、操作結果を監査ログに統一記録。
4. ✅ `/introduce`コマンド実装
   - `IntroduceManager`でモーダル生成・Embed投稿・ロールメンションに対応。抽出値は最大5フィールドまでEmbedに整形し監査ログへ記録。
5. ⏳ 共通ユーティリティ整備とエンドツーエンド試験プラン
   - テストギルドでの検証手順（下記）を設け、監査ログ確認・権限検証を行う。

### エンドツーエンド試験メモ
- 設定書き換え → `/verify post`実行 → ボタン押下／リアクションでロール付与確認＆監査ログ`verify.*`を確認。
- `/roles post`を`buttons`/`select`/`reactions`でそれぞれ実行し、トグル動作と`roles.update`ログ、必要なリアクションが付与されるかを確認。
- `/introduce`モーダル送信でEmbed内容・メンション・サムネイル、`introduce.post`監査ログを確認。
- `config.yaml`に発生したメッセージIDを追記後、ホットリロードで再投稿→更新動作に切り替わるか確認。

## 検討事項
- コマンド投稿済みメッセージIDは`config.verify.message_id`／`config.roles.message_id`に保持（返信でガイド）。PRフローで手動反映する運用を継続。
- Botロール権限チェックは未実装。Slash実行時のエラーハンドリングで検知しているが、起動時ヘルスチェックの追加が今後の課題。
- ダッシュボードAPIとの同期自動化／手元検証用スクリプトは未着手。次フェーズでWebhook駆動やPRテンプレ整備を検討。

## サポートタスク
- Secrets運用手順と権限管理ガイドライン化（`task.md`のインフラ項目）。
- Welcome／Verify／Roles文言の最終レビューとガイドライン文書化。
- スクリム補助ワークフロー詳細設計とBot連携方式の検証。
