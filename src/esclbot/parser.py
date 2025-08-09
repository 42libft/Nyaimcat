from __future__ import annotations
import re
import pandas as pd

HEADER_NORMALIZE = {
    "team_name": "team_name",
    "team_num": "team_num",
    "player_name": "player_name",
    "character": "character",
    "placement": "placement",
    "kills": "kills",
    "assists": "assists",
    "damage": "damage",
    "shots": "shots",
    "hits": "hits",
    "accuracy": "accuracy",
    "headshots": "headshots",
    "headshots_accuracy": "headshots_accuracy",
    "survival_time": "survival_time",
}

NUMERIC_COLS = {
    "team_num","placement","kills","assists","damage","shots","hits",
    "accuracy","headshots","headshots_accuracy","survival_time"
}

def normalize_header(h: str) -> str:
    k = re.sub(r"\s+", "_", h.strip().lower())
    return HEADER_NORMALIZE.get(k, k)

def parse_pasted_text(text: str) -> pd.DataFrame:
    if not text or not text.strip():
        raise ValueError("テキストが空です。")

    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    if not lines:
        raise ValueError("有効な行が見つかりませんでした。")

    sep = "\t" if any("\t" in ln for ln in lines) else r"\s{2,}"

    headers = re.split(sep, lines[0])
    headers = [normalize_header(h) for h in headers]

    rows = [re.split(sep, ln) for ln in lines[1:]]

    max_cols = len(headers)
    fixed_rows = []
    for r in rows:
        if len(r) < max_cols:
            r = r + ["" for _ in range(max_cols - len(r))]
        elif len(r) > max_cols:
            r = r[:max_cols]
        fixed_rows.append(r)

    df = pd.DataFrame(fixed_rows, columns=headers)

    for c in df.columns:
        if c in NUMERIC_COLS:
            df[c] = pd.to_numeric(df[c].astype(str).str.replace(",", ""), errors="coerce")

    return df
