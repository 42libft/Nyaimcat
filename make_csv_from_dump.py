# make_csv_from_dump.py  （完全置き換え版）
import argparse, json, re, base64, zlib
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
import pandas as pd

REQUIRED_HEADERS = [
    "team_name","team_num","player_name","character","placement","kills","assists",
    "damage","shots","hits","accuracy","headshots","headshots_accuracy","survival_time"
]

# キー名のゆらぎに対応する候補集合
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
    # 追加の文脈から逆算するための補助
    "game_no": ["game","gameNo","gameNumber","match","round"]
}

def walk(obj: Any) -> Iterable[Any]:
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
        if x is None or x == "":
            return None
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
    # 足りない列は後で追加される
    return row

def normalize_df(df: pd.DataFrame) -> pd.DataFrame:
    for col in REQUIRED_HEADERS:
        if col not in df.columns:
            df[col] = None
    return df[REQUIRED_HEADERS]

def guess_game_no_from_json(j: Any, fallback: int) -> int:
    # JSON全体からゲーム番号らしきものを拾う
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

def try_decode_value(value_str: str) -> Optional[Any]:
    """
    value が JSON文字列 / base64 JSON / (たまに)deflate の可能性を考慮
    """
    # 1) まずそのまま JSON として
    try:
        return json.loads(value_str)
    except Exception:
        pass
    # 2) base64 を試す
    try:
        decoded = base64.b64decode(value_str, validate=True)
        # 2a) 直接JSONか
        try:
            return json.loads(decoded.decode("utf-8", errors="ignore"))
        except Exception:
            pass
        # 2b) deflate?
        try:
            inflated = zlib.decompress(decoded)
            return json.loads(inflated.decode("utf-8", errors="ignore"))
        except Exception:
            pass
    except Exception:
        pass
    # 3) 先頭が { の割合が高ければそのまま返す
    if value_str.strip().startswith("{") or value_str.strip().startswith("["):
        try:
            return json.loads(value_str)
        except Exception:
            return None
    return None

def extract_table_like_from_inner(inner: Any) -> Optional[pd.DataFrame]:
    """
    構造化JSONから、プレイヤー/チームの配列っぽい所を総当りで探し、列に寄せる。
    条件: dictの配列で、少なくとも damage/kills/ player_name などのうち2〜3個がある
    """
    best_df: Optional[pd.DataFrame] = None
    best_score = -1

    for v in walk(inner):
        if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
            rows = []
            hit_counts = 0
            for item in v:
                row = to_row(item)
                # どれだけ埋まったかスコア化
                filled = sum(1 for k in ["player_name","team_name","damage","kills","assists","placement"] if row.get(k) not in (None, ""))
                if filled >= 2:
                    rows.append(row)
                    hit_counts += filled
            if rows:
                df = pd.DataFrame(rows)
                # スコア: 件数 + ヒット合計
                score = len(df) + hit_counts
                if score > best_score:
                    best_score = score
                    best_df = df

    if best_df is not None and not best_df.empty:
        return normalize_df(best_df)
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump-dir", default="./escl_api_dump")
    ap.add_argument("--out", default="ESCL_from_dump.csv")
    ap.add_argument("--group", default="")
    ap.add_argument("--scrim-id", default="")
    args = ap.parse_args()

    dump = Path(args.dump_dir)
    bucket_files = sorted(dump.glob("*PublicBucketService_GetBucket.json"))
    if not bucket_files:
        print(f"[NG] GetBucket のダンプが見つかりません: {dump}")
        return

    all_frames: List[pd.DataFrame] = []
    fallback_game = 0

    for fp in bucket_files:
        try:
            outer = json.loads(fp.read_text(encoding="utf-8", errors="ignore"))
            value = outer.get("value", "")
            inner = try_decode_value(value)
            if inner is None:
                print(f"[MISS] {fp.name}: value をJSONに解釈できませんでした")
                continue
        except Exception as e:
            print(f"[SKIP] {fp.name}: {e}")
            continue

        # 直接「テーブルテキスト」が入っているケースにも対応（ごく稀な保険）
        if isinstance(inner, str) and "\n" in inner:
            txt = inner
            df = normalize_df(tsv_to_df(txt))
        else:
            df = extract_table_like_from_inner(inner)

        if df is None or df.empty:
            print(f"[MISS] {fp.name}: 構造化配列から列を推測できませんでした")
            continue

        fallback_game += 1
        game_no = guess_game_no_from_json(inner, fallback_game)
        df.insert(0, "game", game_no)
        df.insert(0, "scrim_id", args.scrim_id)
        df.insert(0, "group", args.group)
        all_frames.append(df)
        print(f"[OK] {fp.name}: game={game_no}, rows={len(df)}")

    if not all_frames:
        print("[NG] どのファイルからもデータを抽出できませんでした。")
        print("     ./escl_api_dump の JSON を1つ貼ってくれれば、キーを見て最短でマッピング書きます。")
        return

    out_df = pd.concat(all_frames, ignore_index=True)
    # 文字列化（NaN→空）& 並び
    out_df = out_df.astype({col: "string" for col in out_df.columns if col not in ("game",)})
    out_df.sort_values(["game","team_name","player_name"], inplace=True, ignore_index=True)
    out_df.to_csv(args.out, index=False)
    print(f"[DONE] CSV 出力: {args.out}  (rows={len(out_df)}, games={out_df['game'].nunique()})")


# テキスト→DF（保険ルート）
def tsv_to_df(text: str) -> pd.DataFrame:
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return pd.DataFrame(columns=REQUIRED_HEADERS)
    head = lines[0]
    splitter = "\t" if "\t" in head else r"\s{2,}"
    cols = [c.strip() for c in re.split(splitter, head) if c.strip()]
    rows = []
    for ln in lines[1:]:
        parts = [p.strip() for p in re.split(splitter, ln)]
        if len(parts) < len(cols):
            parts += [""] * (len(cols) - len(parts))
        rows.append(parts[:len(cols)])
    df = pd.DataFrame(rows, columns=cols)
    for col in REQUIRED_HEADERS:
        if col not in df.columns: df[col] = None
    return df[REQUIRED_HEADERS]


if __name__ == "__main__":
    main()

