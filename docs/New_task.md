# New_task.md — ESCL スクリム自動エントリー Bot（Discord ↔ ESCL API） v2

## 0. ゴール（Definition of Done）
- Discord の `/entry` コマンドから **「前日の 0:00(JST) ちょうど」** に ESCL API の `CreateApplication` を送信できる。
- 成功/失敗を Discord に返信（成功=200、既登録/満枠/受付外などの失敗コードも判別）。
- 0:00 境界直後の混雑・伝送ゆらぎに備え、**0.5 秒間隔 × 最大 6 回** の短期リトライ（指数でなく等間隔）を実装。
- ユーザーごとに **teamId を登録/上書き** できる。既定は NyaimLab = 2966（変更可）。
- NTP 同期・JWT 秘匿・基本ログを満たす。

---

## 1. 既知の事実（2025-10-15 時点）
### 作成（本命）
```
POST https://core-api-prod.escl.workers.dev/user.v1.UserApplicationService/CreateApplication
Body: { "scrimId": <number>, "teamId": <number> }
Header: Authorization: Bearer <JWT>, Content-Type: application/json,
        Origin: https://fightnt.escl.co.jp, Referer: https://fightnt.escl.co.jp/, connect-protocol-version: 1
```

### 確認（一覧取得）
```
POST https://core-api-prod.escl.workers.dev/public.v1.PublicApplicationService/GetApplications
Body: { "scrimId": <number> }
Header: 上に同じ
```

### 直近のスクリム一覧（補助）
```
POST https://core-api-prod.escl.workers.dev/public.v1.PublicScrimService/ListActiveScrim
Body: {}
Header: 上に同じ
```
- `ListActiveScrim` の応答から `scrimId` 候補を事前に特定できる。`/list-active` コマンドで提示予定。

---

## 2. MVP スコープ
### 2.1 Discord コマンド
- `/entry date:YYYY-MM-DD scrim_id:<int> [team_id:<int>]`
  - 指定 `date` の **前日 0:00(JST)** に `CreateApplication` を送信。
  - `team_id` 省略時はユーザーに紐づく既定値（/set-team で保存）。
  - 実行結果（HTTP ステータス＋簡易メッセージ）を返信。

- `/set-team team_id:<int>`
  - コマンド送信者（Discord userId）に既定 `teamId` を保存（SQLite/JSON/Redis いずれか）。

- `/list-active`
  - `ListActiveScrim` を叩いて、現在募集/近日の `scrimId` と名称を表示（選びやすくする）。

### 2.2 送信アルゴリズム（境界対策）
- スケジュールは **前日 0:00:00.000 JST**。
- 実行時、**等間隔 0.5s × 最大 6 発**（合計 2.5 秒の観測窓）で送信。
- 応答コードに応じて即時停止：
  - `200/201` → 成功、以降の送信をキャンセル。
  - `409`（既登録）→ 成功扱いで停止。
  - `422`（受付外）→ ウィンドウ内で継続（まだ開いていないと判断）。
  - `401`（トークン）→ 失敗を報告（再ログイン必要）。
  - `429`（レート）→ 1 回だけ追加待機 1.0s を挟み、残弾を続行。

### 2.3 ログと通知
- 実行開始・各 HTTP ステータス・最終結果を Discord スレッドに逐次送信。
- 機密（JWT/ヘッダー）は一切ログしない。

---

## 3. 実装レイアウト（CodeX裁量）
- 既存のコマンド群との整合のため、**ディレクトリ構成は CodeX の裁量**に委ねる。
- 本タスクで必須なのは以下の“インターフェース要件”のみ：
  - Discord コマンド：`/entry`, `/set-team`, `/list-active` が動作すること
  - スケジューラ：**前日 0:00(JST)** に実行し、0.5s 間隔×最大6回の送信ロジックを呼び出せること
  - 永続化：Discord userId → teamId のマッピングを**永続**（SQLite/JSON/Redis など任意）
  - ログ：Discord スレッドへ進捗と最終結果を通知（機密は出力しない）

### 環境変数（参考）
```
DISCORD_TOKEN=xxxxxxxx
DISCORD_CLIENT_ID=xxxxxxxx
ESCL_JWT=xxxxx.yyyyy.zzzzz
DEFAULT_TEAM_ID=2966
TZ=Asia/Tokyo
```

---

## 4. 主要実装（擬似コード）
### 4.1 ESCL クライアント
```ts
// services/escl.ts
import axios from "axios";
const BASE = "https://core-api-prod.escl.workers.dev";
const H = (jwt: string) => ({
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
  Origin: "https://fightnt.escl.co.jp",
  Referer: "https://fightnt.escl.co.jp/",
  "connect-protocol-version": "1",
});

export const createApplication = (jwt: string, scrimId: number, teamId: number) =>
  axios.post(`${BASE}/user.v1.UserApplicationService/CreateApplication`, { scrimId, teamId }, { headers: H(jwt), timeout: 5000 });

export const getApplications = (jwt: string, scrimId: number) =>
  axios.post(`${BASE}/public.v1.PublicApplicationService/GetApplications`, { scrimId }, { headers: H(jwt), timeout: 5000 });

export const listActiveScrim = (jwt: string) =>
  axios.post(`${BASE}/public.v1.PublicScrimService/ListActiveScrim`, {}, { headers: H(jwt), timeout: 5000 });
```

### 4.2 スケジューラ（0.5s ループ）
```ts
// jobs/scheduler.ts
export async function fireWindow({ jwt, scrimId, teamId, onLog }: Args) {
  const max = 6, interval = 500; // ms
  for (let i = 0; i < max; i++) {
    try {
      const r = await createApplication(jwt, scrimId, teamId);
      onLog(`CreateApplication: ${r.status}`);
      return { ok: true, status: r.status };
    } catch (e: any) {
      const st = e?.response?.status;
      onLog(`try#${i+1} -> ${st ?? "ERR"}`);
      if (st === 200 || st === 201 || st === 409) return { ok: true, status: st };
      if (st === 401) return { ok: false, status: st, reason: "token" };
      if (st === 429) await sleep(1000); // 追加待機
      if (i < max - 1) await sleep(interval);
    }
  }
  return { ok: false, status: 422, reason: "window_closed_or_not_open" };
}
```

### 4.3 `/set-team`
- `discordUserId` → `teamId` を保存。`/entry` で省略時に参照。
- 既登録があっても上書き可。返信は「🎯 teamId=xxxx を登録しました」。

### 4.4 `/list-active`
- `listActiveScrim` の結果を整形して `scrimId`, タイトル, 日付, 受付時間 をリスト表示。
- そのまま `/entry` に渡せる `scrimId` を提示。

---

## 5. テスト計画
1) **乾式**：受付外時間に送信 → 422/403 などの想定エラーを確認。
2) **擬似**：前日 0:00 を `now+5s` に置換して E2E（Discord→ジョブ→API）。
3) **実戦**：深夜に本番で 200 ／ 409 受領＋ `GetApplications` で反映確認。
4) **多重送信**：0.5s 間隔で 2〜3 回だけ当てても成功判定が重複しないこと。

---

## 6. 追加で欲しい検証情報
- **JWT の有効期限**（0:00 までの持続確認。短い場合は直前再ログイン手順が必要）
- **CreateApplication のレスポンス例**（成功/各エラーの JSON 例）
- **ListActiveScrim のレスポンス例**（タイトル・日時・scrimId のフィールド名）
- **多重応募のサーバ挙動**（同一 body を短時間に複数回送った場合の状態コード）

---

## 7. 受け入れ条件（Acceptance Criteria）
- `/set-team 2966` 実行 → 永続化される。
- `/list-active` 実行 → 直近スクリムが `scrimId` 付きで表示される。
- `/entry 2025-10-16 345` 実行 → 前日 0:00(JST) に 0.5s × 6 回送信し、200/409 を報告。
- 機密（JWT）は .env 経由のみ、ログ出力なし。

---

## 8. リスク & セキュリティ
- 自動化の規約順守。必要なら「人間操作トリガー（/fire-now）」に切替可能な設計に。
- JWT 漏洩対策（.env、権限最小化、ローテーション手順）。
- VPS/ホストの NTP 同期と JST 固定。
