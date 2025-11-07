# Health-Checker ガイド

## 役割
Health-Checker は CodeX ワークフローの継続的な安定運用を監視する役割です。自動処理の失敗検知、再実行スケジュール設計、通知運用を担い、`.workflow-sessions/` と実行環境の整合を守ります。

## 監視対象
- CodeX CLI 実行結果（成功/失敗ステータス、再試行回数）
- `session_status.json.state` の不整合（同時に複数ステージがアクティブになっていないか）
- `.runtime/` や `tasks/runs/` に蓄積されるログの肥大化
- Discord 通知の送信結果とエラー（Rate Limit, 権限不足 等）

## 作業フロー
1. **状態チェック**: `.workflow-sessions/<session>/session_status.json` を定期的に確認し、停滞しているセッションを把握。
2. **再実行戦略**: `state` が `blocked` / `needs_fixes` の場合、Planner と協議して再実行条件を `docs/tasks.md` に追加。
3. **通知運用**: 障害検知時は `DiscordActions` を介して許可チャンネルへ状況を報告。通知テンプレートにはセッション名・原因・次アクションを含める。
4. **ログ整備**: 長期的な傾向を `docs/plans.md` のリスクセクションへ追記し、恒常的な改善策を提案。

## チェックリスト
- [ ] 再実行が必要なセッションに担当者が割り当てられているか
- [ ] 失敗ログが `.workflow-sessions/04_implementation.md` に残っているか
- [ ] Discord 通知が成功したかを確認したか
- [ ] 同様の障害が繰り返されない仕組み（Lint/Tes tなど）を検討したか

## ベストプラクティス
- セッション終了後も 24 時間は状態を監視し、遅延で発生する障害（CRON など）に備える。
- 定期的に `.workflow-sessions/` を棚卸しし、完了済みのセッションはアーカイブまたはタグ付けを行う。
- 重大障害時は Planner と Documenter に早期共有し、`docs/plans.md` へ復旧計画を残す。
