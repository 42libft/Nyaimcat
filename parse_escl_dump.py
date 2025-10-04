# parse_escl_dump.py
"""
./escl_api_dump/ に保存された JSON（GetGames / GetBucket など）を読み、
6試合分の「詳細な試合結果テキスト」またはプレイヤー明細からCSVを作るサンプル。

使い方:
  python parse_escl_dump.py --dump-dir ./escl_api_dump --out ESCL_dump.csv --group G5 --scrim-id 36db0e63-...

最初は --dump-dir だけでOK。group, scrim-id は任意。
"""

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd

# 既存のparserに近い列（テキスト貼付の1行目のヘッダ）
REQUIRED_HEADERS = [
    "team_name","team_num","player_name","character","placement","kills","assists",
    "damage","shots","hits","accuracy","headshots","headshots_accuracy","survival_time"
]

# ---------- 便利: 再帰で全要素をなめる ----------
def walk_json(obj: Any) -> Iterable[Any]:
    """JSONの全要素（dict, list, str, …）を深さ優先でyield"""
    yield obj
    if isinstance(obj, dict):
        for v in obj.values():
            yield from walk_json(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_json(v)

# ---------- 1) JSON内の「詳細テキスト」（タブ区切りの大きな文字列）を探す ----------
def find_detailed_texts_in_json(j: Any) -> List[str]:
    """JSON全体から、先頭行に REQUIRED_HEADERS を全て含むタブ/多空白区切りテキストを収集"""
    hits: List[str] = []
    for v in walk_json(j):
        if isinstance(v, str) and "\n" in v:
            first = v.splitlines()[0].strip().lower()
            # タブ or 連続スペース区切り
            cols = re.split(r"\t|\s{2,}", first)
            cols = [c.strip() for c in cols if c.strip()]
            if all(h in cols for h in REQUIRED_HEADERS):
                hits.append(v.strip())
    return hits

# ---------- 2) プレイヤー明細から、必要な列に寄せてDFを作る（JSONにテキストが無い場合の保険） ----------
CAND_KEYS = {
    "team_name": ["team_name","team","teamName","teamname","team_title","teamTitle"],
    "team_num":  ["team_num","teamNumber","teamNo","team_no","number"],
    "player_name":["player_name","player","name","playerName","username","displayName"],
    "character": ["character","legend","legendName","agent"],
    "placement": ["placement","place","rank","position","result_rank"],
    "kills":     ["kills","kill","elims","eliminations"],
    "assists":   ["assists","assist"],
    "damage":    ["damage","dmg"],
    "shots":     ["shots","shot_count","fired"],
    "hits":      ["hits","hit_count","landed"],
    "accuracy":  ["accuracy","acc"],
    "headshots": ["headshots","hs"],
    "headshots_accuracy": ["headshots_accuracy","hs_accuracy","hsAcc"],
    "survival_time": ["survival_time","time_survived","survivalTime","timeAlive","lived"],
}

def _first_key(d: Dict[str, Any], cands: List[str]) -> Optional[str]:
    for k in d.keys():
        for c in cands:
            if k.lower() == c.lower():
                return k
    return None

def coerce_rows_from_player_objects(j: Any) -> Optional[pd.DataFrame]:
    """
    JSONのどこかに [ {player stats...}, ... ] があれば、列名を推測してDFにする。
    見つからなければ None
    """
    for v in walk_json(j):
        if isinstance(v, list) and v and isinstance(v[0], dict):
            rows = []
            for item in v:
                # 少なくとも「player系 or damage系」が無ければスキップ
                if not any((_first_key(item, CAND_KEYS["player_name"]), _first_key(item, CAND_KEYS["damage"]))):
                    continue
                row = {}
                for col, cands in CAND_KEYS.items():
                    k = _first_key(item, cands)
                    if k is not None:
                        row[col] = item.get(k)
                # 足りない列を補完（可能なら）
                if "accuracy" not in row and "shots" in row and "hits" in row:
                    try:
                        s = float(row["shots"] or 0); h = float(row["hits"] or 0)
                        row["accuracy"] = (h / s * 100.0) if s > 0 else 0.0
                    except Exception:
                        pass
                rows.append(row)
            if rows:
                df = pd.DataFrame(rows)
                # 列順を合わせる
                for col in REQUIRED_HEADERS:
                    if col not in df.columns:
                        df[col] = None
                return df[REQUIRED_HEADERS]
    return None

# ---------- 3) 「試合順（GAME1〜6）」の判定 ----------
def guess_game_no_from_path(path: str) -> Optional[int]:
    m = re.search(r"game[_-]?([1-6])", path, re.I)
    if m:
        return int(m.group(1))
    return None

# ---------- メイン ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump-dir", default="./escl_api_dump")
    ap.add_argument("--out", default="ESCL_dump.csv")
    ap.add_argument("--group", default="")
    ap.add_argument("--scrim-id", default="")
    args = ap.parse_args()

    dump_dir = Path(args.dump_dir)
    files = sorted(dump_dir.glob("*.json"))
    if not files:
        print(f"No JSON files in {dump_dir}")
        return

    all_frames: List[pd.DataFrame] = []
    seen_games = set()

    for fp in files:
        try:
            raw = fp.read_bytes()
            txt = raw.decode("utf-8", errors="ignore")
            # JSONでないレスポンスに備えて簡易判定
            if "{" not in txt:
                continue
            j = json.loads(txt)
        except Exception:
            continue

        # まず「詳細テキスト」っぽい文字列がJSON中に入っていないか探す
        texts = find_detailed_texts_in_json(j)
        if texts:
            # 1ファイル中に複数あれば複数試合の可能性もあるが、まずは先頭だけ採用
            content = texts[0]
            # テキストをタブ/多空白区切りでDF化
            df = _tsv_like_to_df(content)
            game_no = guess_game_no_from_path(fp.name) or len(seen_games) + 1
            df.insert(0, "game", game_no)
            df.insert(0, "scrim_id", args.scrim_id)
            df.insert(0, "group", args.group)
            all_frames.append(df)
            seen_games.add(game_no)
            continue

        # テキストが入ってない場合は、プレイヤーの配列から推測
        df2 = coerce_rows_from_player_objects(j)
        if df2 is not None:
            game_no = guess_game_no_from_path(fp.name) or len(seen_games) + 1
            df2.insert(0, "game", game_no)
            df2.insert(0, "scrim_id", args.scrim_id)
            df2.insert(0, "group", args.group)
            all_frames.append(df2)
            seen_games.add(game_no)

    if not all_frames:
        print("No parsable data found in dumps.")
        return

    out_df = pd.concat(all_frames, ignore_index=True)
    out_df.to_csv(args.out, index=False)
    print(f"Wrote: {args.out} (rows={len(out_df)})")


def _tsv_like_to_df(text: str) -> pd.DataFrame:
    """
    先頭行がヘッダで、その後にタブ/多空白区切りのテーブルが続く文字列をDFに。
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return pd.DataFrame(columns=REQUIRED_HEADERS)

    head = lines[0]
    # タブ優先、無ければ連続スペース
    if "\t" in head:
        splitter = "\t"
    else:
        splitter = r"\s{2,}"

    cols = re.split(splitter, head)
    cols = [c.strip() for c in cols if c.strip()]

    rows: List[List[str]] = []
    for ln in lines[1:]:
        parts = re.split(splitter, ln)
        parts = [p.strip() for p in parts]
        # 列数が合わない時は足りない分を埋める
        if len(parts) < len(cols):
            parts += [""] * (len(cols) - len(parts))
        rows.append(parts[:len(cols)])

    df = pd.DataFrame(rows, columns=cols)
    # 必要列をそろえる（無ければ空列を追加）
    for col in REQUIRED_HEADERS:
        if col not in df.columns:
            df[col] = None
    return df[REQUIRED_HEADERS]


if __name__ == "__main__":
    main()

