# プロンプト依存関係と入出力マップ

## 全体シーケンス
1. **Plan Reader** → 長期計画の優先度とゴールを抽出し、後続エージェントへ指針を提供。
2. **Task Executor** → タスク分解と実装ログ更新を行い、進捗を可視化。
3. **Repo Rebuilder** → リポジトリ構成の調整・テンプレート生成を実施。
4. **Commit & Review** → 差分検証と修正指示を出し、品質を担保。
5. **Reflection Logger** → 学び・決定事項を記録し、ドキュメントへ反映。
6. **Meta Generator** → プロンプトやガイドの改善点を抽出し、次サイクルの改善タスクを生成。
7. **Orchestrator** → 各エージェントの呼び出し順序と再帰的実行を管理し、`.workflow-sessions/` の状態を更新。

## 入力・出力テーブル
| エージェント | 主な入力 | 主な出力 | 次の利用先 |
| --- | --- | --- | --- |
| Plan Reader | `plan.md`, `docs/plans.md`, `01_requirements.md` | ゴール要約・優先度・次エージェント指示 | Orchestrator, Task Executor |
| Task Executor | `tasks.md`, `docs/task.md`, `04_implementation.md` | 実装チェックリスト、実行ログ、更新済み `tasks.md` | Repo Rebuilder, Commit & Review |
| Repo Rebuilder | リポジトリ構造、`02_design.md`, Plan/Task からの改善要求 | 改修済み構成、デザイン更新ログ | Commit & Review |
| Commit & Review | `git diff`, `03_review.md`, テスト結果 | レビュー所見、修正指示、コミット準備チェック | Reflection Logger |
| Reflection Logger | `04_implementation.md`, `05_documentation.md`, 完了タスク | `docs/codex_agent_plan.md` 更新、フォローアップタスク | Meta Generator, Orchestrator |
| Meta Generator | `.codex/prompts/*.md`, `.codex/agents/*.md`, 振り返りログ | 改善提案一覧、優先度、更新対象 | Orchestrator, Plan Reader |
| Orchestrator | すべてのエージェント出力、`session_status.json`, `plan.md`, `tasks.md` | 実行シーケンス、ステータス更新、再試行判断、必要に応じたセッション自動生成 | 全エージェント、Health-Checker |

## データフローの重複整理
- `plan.md` と `docs/plans.md`: Plan Reader・Reflection Logger・Meta Generator が参照する基盤。Plan Reader が最新化、Reflection Logger が改定、Meta Generator が改善要求を追加する。
- `tasks.md`: Task Executor を中心に Commit & Review、Reflection Logger、Meta Generator が更新。Orchestrator が状態整合性を監視する。
- `.workflow-sessions/`: Plan Reader（01）、Repo Rebuilder（02）、Task Executor（04）、Commit & Review（03）、Reflection Logger（05）、Orchestrator（status.json）がそれぞれ責務に応じて更新。エージェント同士での重複編集を防ぐため、各ファイルの担当を固定化。
- `docs/codex_agent_plan.md`: Reflection Logger が作成した振り返りを蓄積し、Meta Generator が改善点を抽出する。Plan Reader は参照のみ。

## 再帰的な改善ループ
1. Meta Generator が改善提案を `tasks.md`・`plan.md` に反映。
2. Orchestrator が次サイクル開始時にセッションディレクトリを自動生成しつつ Plan Reader へ改善タスクを引き継ぎ、優先度を見直す。
3. Task Executor と Repo Rebuilder が提案に基づく修正を実行。
4. Commit & Review と Reflection Logger が結果を検証・記録し、改善サイクルが継続する。

このマップを基準に、各プロンプトは重複する入力・出力を避けつつ連携し、自動実行時の整合性を維持します。
