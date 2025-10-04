# src/esclbot/api_scraper.py  —— ESCL API 直叩き（metaのキーに確定）
from __future__ import annotations
import json, re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
import requests
import pandas as pd
import re as _re 

UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

API_BASE = "https://core-api-prod.escl.workers.dev"

# ====== 抽出ユーティリティ（汎用ヒューリスティック） ======
REQUIRED_HEADERS = [
    "team_name","team_num","player_name","character","placement","kills","assists",
    "damage","shots","hits","accuracy","headshots","headshots_accuracy","survival_time"
]

CAND = {
    "team_name": ["team_name","team","teamName","squadName","squad","team_title","teamTitle"],
    "team_num":  ["team_num","teamNumber","teamNo","team_no","number","team_id","teamId","squadNo","squad_number"],
    "player_name":["player_name","player","name","playerName","ign","username","displayName"],
    "character": ["character","legend","legendName","agent"],
    "placement": ["placement","place","rank","position","result_rank","teamPlacement","finalPlacement"],
    "kills":     ["kills","kill","elims","eliminations","elimination","frags"],
    "assists":   ["assists","assist"],
    "damage":    ["damage","dmg","totalDamage"],
    "shots":     ["shots","shot_count","fired","shotsFired"],
    "hits":      ["hits","hit_count","landed","shotsHit"],
    "accuracy":  ["accuracy","acc"],
    "headshots": ["headshots","hs"],
    "headshots_accuracy": ["headshots_accuracy","hs_accuracy","hsAcc"],
    "survival_time": ["survival_time","time_survived","survivalTime","timeAlive","lived","time_survive","survive_time"],
    "game_no": ["game","gameNo","gameNumber","match","round","roundNumber"]
}

# —— 汎用キー選択ユーティリティ ——
def pick_key(d: Dict[str, Any], candidates: List[str]) -> Optional[str]:
    if not isinstance(d, dict): 
        return None
    lower_map = {k.lower(): k for k in d.keys()}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None

def pick_first(d: Dict[str, Any], candidates: List[str]):
    k = pick_key(d, candidates)
    return (k, d.get(k)) if k else (None, None)

def ensure_num(x) -> Optional[float]:
    try:
        if x is None or x == "": return None
        return float(x)
    except Exception:
        return None

def walk(obj: Any):
    yield obj
    if isinstance(obj, dict):
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v)

def first_key(d: Dict[str, Any], cands: List[str]) -> Optional[str]:
    dl = {k.lower(): k for k in d.keys()}
    for c in cands:
        if c.lower() in dl:
            return dl[c.lower()]
    return None

def coerce_number(x) -> Optional[float]:
    try:
        if x is None or x == "": return None
        return float(x)
    except Exception:
        return None

def compute_accuracy(row: Dict[str, Any]):
    if row.get("accuracy") is None and row.get("shots") is not None and row.get("hits") is not None:
        s = coerce_number(row["shots"]) or 0.0
        h = coerce_number(row["hits"]) or 0.0
        row["accuracy"] = (h / s * 100.0) if s > 0 else 0.0

def to_row(d: Dict[str, Any]) -> Dict[str, Any]:
    row: Dict[str, Any] = {}
    for col, cands in CAND.items():
        if col == "game_no":
            continue
        k = first_key(d, cands)
        if k is not None:
            row[col] = d.get(k)
    compute_accuracy(row)
    return row

def normalize_df(df: pd.DataFrame) -> pd.DataFrame:
    for col in REQUIRED_HEADERS:
        if col not in df.columns:
            df[col] = None
    return df[REQUIRED_HEADERS]

def extract_table_like_from_inner(inner: Any) -> Optional[pd.DataFrame]:
    """1つのゲーム相当のJSONから、プレイヤー行の配列を抽出してDFに整形"""
    best_df: Optional[pd.DataFrame] = None
    best_score = -1
    for v in walk(inner):
        if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
            rows, score_sum = [], 0
            for item in v:
                row = to_row(item)
                filled = sum(1 for k in ["player_name","team_name","damage","kills","assists","placement"] if row.get(k) not in (None, ""))
                if filled >= 2:
                    rows.append(row)
                    score_sum += filled
            if rows:
                df = pd.DataFrame(rows)
                score = len(df) + score_sum
                if score > best_score:
                    best_score = score
                    best_df = df
    if best_df is not None and not best_df.empty:
        return normalize_df(best_df)
    return None

def guess_game_no_from_json(j: Any, fallback: int) -> int:
    for v in walk(j):
        if isinstance(v, dict):
            k = first_key(v, CAND["game_no"])
            if k and isinstance(v.get(k), (int, float, str)):
                try:
                    g = int(v[k])
                    if 1 <= g <= 6:
                        return g
                except Exception:
                    pass
    return fallback

# ====== ESCL API ======
def parse_scrim_group_from_url(parent_url: str) -> Tuple[str, str]:
    """
    入力に余計な文字（例: ' group:G5'）が混ざっていても、
    /scrims/<scrim_uuid>/<group_uuid> の2つのUUIDだけを安全に取り出す。
    """
    # 前後の空白・<> を除去し、最初のトークンだけ使う（空白や改行で切れてもOK）
    s = parent_url.strip().strip("<>").split()[0]

    path = urlparse(s).path
    uuids = UUID_RE.findall(path)  # パス中の UUID を全部拾う
    if len(uuids) >= 2:
        scrim_uuid, group_uuid = uuids[0], uuids[1]
        print(f"[parse] scrim_uuid={scrim_uuid} group_uuid={group_uuid}")
        return scrim_uuid, group_uuid

    raise ValueError(f"unexpected URL (UUIDが2つ見つからない): {parent_url}")

def post_json(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{API_BASE}/{endpoint}"
    headers = {
        "content-type": "application/json",
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (ESCL Bot)",
        "origin": "https://fightnt.escl.co.jp",
        "referer": "https://fightnt.escl.co.jp/",
    }
    r = requests.post(url, json=payload, headers=headers, timeout=20)
    try:
        r.raise_for_status()
    except requests.HTTPError as e:
        # 404などの時に、投げたpayloadと短いレスポンス本文を表示
        msg = f"{r.status_code} for {url} payload={payload}"
        try:
            msg += f" resp={r.text[:200]}"
        except Exception:
            pass
        raise requests.HTTPError(msg) from e
    return r.json()

def get_group_bucket(scrim_uuid: str, group_uuid: str) -> Any:
    """
    metaで確認済みのキー形式: {"key": "<scrim_uuid>/<group_uuid>.json"}
    渡ってきた値に余分が混ざっても UUID の形に正規化してから叩く。
    """
    # 念のため UUID を正規化（万一の混入対策）
    m1 = UUID_RE.search(scrim_uuid); m2 = UUID_RE.search(group_uuid)
    if m1: scrim_uuid = m1.group(0)
    if m2: group_uuid = m2.group(0)

    key1 = f"{scrim_uuid}/{group_uuid}.json"
    try:
        print("[api] GetBucket key=", key1)
        data = post_json("public.v1.PublicBucketService/GetBucket", {"key": key1})
        val = data.get("value")
        return json.loads(val) if isinstance(val, str) else val
    except Exception:
        # フォールバック1: .json なし（環境差の保険）
        key2 = f"{scrim_uuid}/{group_uuid}"
        try:
            print("[api] GetBucket fallback key=", key2)
            data = post_json("public.v1.PublicBucketService/GetBucket", {"key": key2})
            val = data.get("value")
            return json.loads(val) if isinstance(val, str) else val
        except Exception:
            # フォールバック2: 数値 groupId を使う
            gid = get_group_id(group_uuid)
            if gid is not None:
                key3 = f"{scrim_uuid}/{gid}.json"
                try:
                    print("[api] GetBucket fallback key(groupId)=", key3)
                    data = post_json("public.v1.PublicBucketService/GetBucket", {"key": key3})
                    val = data.get("value")
                    return json.loads(val) if isinstance(val, str) else val
                except Exception:
                    pass
            # ここまでダメなら例外をそのまま返す
            raise


def get_games_by_group_id(group_id: int) -> List[Dict[str, Any]]:
    """metaから確定：GetGames は {"groupId": <int>} だけでOK"""
    data = post_json("public.v1.PublicGameService/GetGames", {"groupId": group_id})
    return data.get("games", []) if isinstance(data, dict) else []

# UUID -> 数値 groupId を取得
from typing import Optional, Dict, Any  # すでに上でimport済みなら重複OK

def get_group_id(group_uuid: str) -> Optional[int]:
    """
    ESCLの PublicGroupService/GetGroupByUUID を叩いて groupId(int) を得る。
    例: {"uuid": "<group_uuid>"} -> {"group": {"id": 749, ...}}
    """
    try:
        data = post_json("public.v1.PublicGroupService/GetGroupByUUID", {"uuid": group_uuid})
        grp = data.get("group") or {}
        gid = grp.get("id") or grp.get("groupId")
        return int(gid) if gid is not None else None
    except Exception:
        return None

def extract_rows_games_teams_players(bucket: Dict[str, Any], group_label: str, scrim_uuid: str, max_games: int = 6) -> pd.DataFrame:
    """
    期待構造:
      bucket["games"] -> list of game objects
        game -> { ..., "teams"/"squads"/"teamResults": [ teamObj, ... ] }
          teamObj -> { team名/順位/番号..., どこかに players の配列(キー名は様々) }
            players -> [ { player_name/legend/kills/assists/damage... }, ... ]

    未知のキー名にも対応するため:
      - teams の候補キーを総当り
      - 見つからなければ game 全体から "teamsっぽい配列" を探索
      - 各 team の中を深く探索して "プレイヤー配列っぽいリスト" を自動検出
    """
    if not isinstance(bucket, dict):
        raise RuntimeError("bucket が dict ではありません")

    # games を取る（候補）
    games_key = pick_key(bucket, ["games", "matches", "rounds"])
    if not games_key or not isinstance(bucket.get(games_key), list):
        raise RuntimeError("bucket 内に games 配列が見つかりません")
    games = bucket[games_key]

    def find_teams_list_from_game(game: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        # 1) 素直に候補キー
        tkey = pick_key(game, ["teams", "squads", "teamResults", "team_results", "results"])
        if tkey and isinstance(game.get(tkey), list) and all(isinstance(x, dict) for x in game[tkey]):
            return game[tkey]
        # 2) game 内を総当りして "team_name/placement" を多く含む dict 配列を拾う
        best = None
        best_score = -1
        for v in walk(game):
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
                score = 0
                for item in v:
                    # teamっぽい特徴（名前や順位等のキー）を数える
                    has_team = bool(first_key(item, CAND["team_name"]))
                    has_place = bool(first_key(item, CAND["placement"]))
                    has_teamnum = bool(first_key(item, CAND["team_num"]))
                    score += (has_team + has_place + has_teamnum)
                if score > best_score and score > 0:
                    best_score = score
                    best = v
        return best

    def find_players_list_from_team(team: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        # 1) 素直に候補キー
        pkey = pick_key(team, ["players", "members", "playerStats", "player_stats", "roster", "lineup", "participants", "memberResults", "player_results"])
        if pkey and isinstance(team.get(pkey), list) and all(isinstance(x, dict) for x in team[pkey]):
            return team[pkey]
        # 2) team 内を総当りして "player らしい dict 配列" を拾う
        #    （player_name/character/kills/assists/damage などが多い配列を選ぶ）
        best = None
        best_score = -1
        player_feature_keys = ["player_name","character","kills","assists","damage","shots","hits","headshots"]
        for v in walk(team):
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
                score = 0
                for item in v:
                    for feat in player_feature_keys:
                        if first_key(item, CAND.get(feat, [])):
                            score += 1
                if score > best_score and score > 0:
                    best_score = score
                    best = v
        return best

    rows: List[Dict[str, Any]] = []
    game_count = 0

    for gi, game in enumerate(games, start=1):
        if game_count >= max_games:
            break

        teams = find_teams_list_from_game(game)
        if not isinstance(teams, list):
            continue  # 次のゲームへ

        # game number を拾う
        game_no_key = pick_key(game, CAND["game_no"])
        try:
            game_no_val = int(game.get(game_no_key)) if game_no_key else gi
        except Exception:
            game_no_val = gi

        for t in teams:
            if not isinstance(t, dict):
                continue

            # チーム名/番号/順位
            _, team_name = pick_first(t, CAND["team_name"])
            _, team_num  = pick_first(t, CAND["team_num"])
            _, placement = pick_first(t, CAND["placement"])

            players = find_players_list_from_team(t)
            if not isinstance(players, list):
                # プレイヤー配列が見つからないチームはスキップ（ここが超重要）
                continue

            for p in players:
                if not isinstance(p, dict):
                    continue
                # プレイヤー名・キャラ
                _, player_name = pick_first(p, CAND["player_name"])
                _, character   = pick_first(p, CAND["character"])
                # スタッツ
                _, kills   = pick_first(p, CAND["kills"])
                _, assists = pick_first(p, CAND["assists"])
                _, damage  = pick_first(p, CAND["damage"])
                _, shots   = pick_first(p, CAND["shots"])
                _, hits    = pick_first(p, CAND["hits"])
                _, hs      = pick_first(p, CAND["headshots"])
                # 命中率系・生存時間
                _, acc     = pick_first(p, CAND["accuracy"])
                _, hs_acc  = pick_first(p, CAND["headshots_accuracy"])
                _, surv    = pick_first(p, CAND["survival_time"])
                if surv is None:
                    surv = p.get("timeAlive") or p.get("time_survived") or p.get("timeAliveMs")

                # 数値化＆自動計算
                shots_n = ensure_num(shots)
                hits_n  = ensure_num(hits)
                acc_n   = ensure_num(acc)
                hs_n    = ensure_num(hs)
                if acc_n is None and shots_n is not None and hits_n is not None:
                    acc_n = (hits_n / shots_n * 100.0) if shots_n > 0 else 0.0
                hs_acc_n = ensure_num(hs_acc)

                row = {
                    "group": group_label,
                    "scrim_id": scrim_uuid,
                    "game": game_no_val,
                    "team_name": team_name,
                    "team_num": team_num,
                    "player_name": player_name,
                    "character": character,
                    "placement": placement,
                    "kills": kills,
                    "assists": assists,
                    "damage": damage,
                    "shots": shots_n if shots_n is not None else shots,
                    "hits": hits_n if hits_n is not None else hits,
                    "accuracy": acc_n if acc_n is not None else acc,
                    "headshots": hs_n if hs_n is not None else hs,
                    "headshots_accuracy": hs_acc_n if hs_acc_n is not None else hs_acc,
                    "survival_time": surv,
                }
                rows.append(row)

        game_count += 1

    if not rows:
        raise RuntimeError("game→team→players 抽出で行が見つかりませんでした。")

    df = pd.DataFrame(rows)
    # 必須列揃え＆並び
    for col in REQUIRED_HEADERS:
        if col not in df.columns:
            df[col] = None
    df = df[["group","scrim_id","game"] + REQUIRED_HEADERS]
    df = df.sort_values(["game","placement","team_name","player_name"], na_position="last").reset_index(drop=True)
    return df

def get_scrim_and_group_labels(parent_url: str) -> Tuple[str, str]:
    """
    スクラム名（例: 'CLスクリム#556'）とグループラベル（例: 'G8'）をAPIから推定して返す。
    - Scrim名は PublicScrimService/GetScrim の scrim.title/name を優先
    - グループ番号は group_bucket['group_num'] or PublicGroupService/GetGroupByUUID の number から G{n} で作る
    """
    scrim_uuid, group_uuid = parse_scrim_group_from_url(parent_url)

    # 1) スクラム名
    scrim_title = ""
    try:
        data = post_json("public.v1.PublicScrimService/GetScrim", {"uuid": scrim_uuid})
        scrim = data.get("scrim") or {}
        scrim_title = scrim.get("title") or scrim.get("name") or ""
    except Exception:
        pass

    # 2) グループラベル
    group_label = ""
    gnum = None
    try:
        bucket = get_group_bucket(scrim_uuid, group_uuid)
        if isinstance(bucket, dict):
            gnum = bucket.get("group_num") or bucket.get("groupNumber") or bucket.get("groupNo")
    except Exception:
        pass
    if gnum is None:
        try:
            g = post_json("public.v1.PublicGroupService/GetGroupByUUID", {"uuid": group_uuid}).get("group") or {}
            gnum = g.get("num") or g.get("number") or g.get("id")  # idが数値なら暫定
        except Exception:
            pass
    if gnum is not None:
        try:
            group_label = f"G{int(gnum)}"
        except Exception:
            group_label = str(gnum)

    # 軽く整形（全角半角など気になるならここで）
    if scrim_title:
        scrim_title = str(scrim_title).strip()
        # NG文字は '_' に置換（OS依存の禁止記号）
        scrim_title = _re.sub(r'[\\/*?:"<>|]', "_", scrim_title)

    return scrim_title, group_label


def collect_csv_from_parent_url(parent_url: str, group_label: str = "", max_games: int = 6) -> pd.DataFrame:
    scrim_uuid, group_uuid = parse_scrim_group_from_url(parent_url)

    # （必要なら）groupId を取得しておくが今回は未使用
    _gid = get_group_id(group_uuid)

    # グループ用バケットを一発取得
    bucket = get_group_bucket(scrim_uuid, group_uuid)
    if not bucket:
        raise RuntimeError("GetBucket の結果が空でした。")

    # ★ まずは“ゲーム→チーム→プレイヤー”で構造的に抜く（推奨ルート）
    try:
        df = extract_rows_games_teams_players(bucket, group_label or "", scrim_uuid, max_games=max_games)
        return df
    except Exception:
        # それでも失敗するときだけ従来のヒューリスティックにフォールバック
        pass

    # —— 旧ヒューリスティック（最終手段） ——
    candidates: List[Any] = []
    if isinstance(bucket, dict) and "games" in bucket and isinstance(bucket["games"], list):
        candidates = bucket["games"]
    else:
        for v in walk(bucket):
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
                if any(first_key(x, CAND["game_no"]) for x in v):
                    candidates = v
                    break

    if not candidates:
        df1 = extract_table_like_from_inner(bucket)
        if df1 is None or df1.empty:
            raise RuntimeError("バケット内から試合明細を抽出できませんでした。")
        df1.insert(0, "game", guess_game_no_from_json(bucket, 1))
        df1.insert(0, "scrim_id", scrim_uuid)
        df1.insert(0, "group", group_label or "")
        return df1

    frames: List[pd.DataFrame] = []
    for i, game_obj in enumerate(candidates, start=1):
        if i > max_games: break
        df = extract_table_like_from_inner(game_obj)
        if df is None or df.empty: 
            continue
        df.insert(0, "game", guess_game_no_from_json(game_obj, i))
        df.insert(0, "scrim_id", scrim_uuid)
        df.insert(0, "group", group_label or "")
        frames.append(df)

    if not frames:
        raise RuntimeError("各試合オブジェクトから明細を抽出できませんでした。")
    out = pd.concat(frames, ignore_index=True).sort_values(["game","team_name","player_name"]).reset_index(drop=True)
    return out

def get_scrim_name(scrim_uuid: str, group_uuid: str) -> Optional[str]:
    """
    Scrim名を API から取得して返す。
    PublicScrimService/GetScrim のレスポンスに name が入っていることが多い。
    取れなければ None を返す。
    """
    try:
        data = post_json("public.v1.PublicScrimService/GetScrim", {"uuid": scrim_uuid})
        scrim = data.get("scrim") or {}
        name = scrim.get("name") or scrim.get("title")
        if isinstance(name, str) and name.strip():
            return name.strip()
        return None
    except Exception:
        return None

