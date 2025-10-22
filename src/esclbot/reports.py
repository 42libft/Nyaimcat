"""Shared utilities for generating scrim reports and safe filenames."""
from __future__ import annotations

from typing import Optional

import pandas as pd

_ILLEGAL_FILENAME_CHARS = set(r'\/:*?"<>|')


def safe_filename_component(value: str) -> str:
    """Return a filesystem safe fragment derived from ``value``."""
    return "".join(char for char in value if char not in _ILLEGAL_FILENAME_CHARS).strip()


def _ensure_numeric_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    result = df.copy()
    for column in columns:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column], errors="coerce").fillna(0)
        else:
            result[column] = 0
    return result


def aggregate_team_totals(df_all: pd.DataFrame) -> pd.DataFrame:
    """Build the TEAM_TOTALS table from raw scrim data."""
    numeric_columns = ["kills", "assists", "damage", "shots", "hits", "headshots", "survival_time"]
    df = _ensure_numeric_columns(df_all, numeric_columns)

    if "team_num" not in df.columns:
        df["team_num"] = None
    else:
        df["team_num"] = df["team_num"].apply(_to_int_or_none)

    grouped = (
        df.groupby(["team_num", "team_name"], dropna=False)[numeric_columns]
        .sum()
        .reset_index()
    )

    grouped["accuracy"] = (grouped["hits"] / grouped["shots"]).where(grouped["shots"] > 0, 0) * 100.0
    grouped["headshots_accuracy"] = (
        grouped["headshots"] / grouped["hits"]
    ).where(grouped["hits"] > 0, 0) * 100.0

    grouped["accuracy"] = grouped["accuracy"].round(2)
    grouped["headshots_accuracy"] = grouped["headshots_accuracy"].round(2)

    grouped["_team_num_sort"] = grouped["team_num"].apply(
        lambda value: value if isinstance(value, int) else 10**9
    )
    grouped = (
        grouped.sort_values(by=["_team_num_sort", "team_name"], na_position="last")
        .drop(columns="_team_num_sort")
        .reset_index(drop=True)
    )

    ordered_columns = [
        "team_name",
        "team_num",
        "kills",
        "assists",
        "damage",
        "shots",
        "hits",
        "accuracy",
        "headshots",
        "headshots_accuracy",
        "survival_time",
    ]

    for column in ordered_columns:
        if column not in grouped.columns:
            grouped[column] = None

    return grouped[ordered_columns]


def aggregate_player_totals(df_all: pd.DataFrame) -> pd.DataFrame:
    """Build the ALL_GAMES table from raw scrim data."""
    numeric_columns = ["kills", "assists", "damage", "shots", "hits", "headshots", "survival_time"]
    df = _ensure_numeric_columns(df_all, numeric_columns)

    if "placement" in df.columns:
        df["placement"] = pd.to_numeric(df["placement"], errors="coerce")
    else:
        df["placement"] = None

    for key in ("player_name", "team_name", "team_num"):
        if key not in df.columns:
            df[key] = None

    df["_games_played"] = 1

    aggregated = df.groupby(["player_name", "team_name", "team_num"], dropna=False).agg(
        {
            "_games_played": "sum",
            "kills": "sum",
            "assists": "sum",
            "damage": "sum",
            "shots": "sum",
            "hits": "sum",
            "headshots": "sum",
            "survival_time": "sum",
            "placement": "mean",
        }
    )
    grouped = aggregated.reset_index().rename(columns={"_games_played": "games_played"})

    if "character" in df.columns:
        grouped = grouped.merge(
            _aggregate_unique_characters(df),
            on=["player_name", "team_name", "team_num"],
            how="left",
        )
    else:
        grouped["characters"] = None

    grouped["games_played"] = grouped["games_played"].fillna(0).astype(int)

    for column in numeric_columns:
        grouped[column] = grouped[column].fillna(0).round(0).astype(int)

    grouped["accuracy"] = (grouped["hits"] / grouped["shots"]).where(grouped["shots"] > 0, 0) * 100.0
    grouped["headshots_accuracy"] = (
        grouped["headshots"] / grouped["hits"]
    ).where(grouped["hits"] > 0, 0) * 100.0
    grouped["accuracy"] = grouped["accuracy"].round(2)
    grouped["headshots_accuracy"] = grouped["headshots_accuracy"].round(2)

    grouped = grouped.rename(columns={"placement": "placement_avg"})
    grouped["placement_avg"] = grouped["placement_avg"].round(2)

    grouped["team_num"] = grouped["team_num"].apply(_to_int_or_none)
    grouped["_team_num_sort"] = grouped["team_num"].apply(
        lambda value: value if isinstance(value, int) else 10**9
    )
    grouped = (
        grouped.sort_values(
            by=["_team_num_sort", "team_name", "player_name"],
            na_position="last",
        )
        .drop(columns="_team_num_sort")
        .reset_index(drop=True)
    )

    ordered_columns = [
        "team_name",
        "team_num",
        "player_name",
        "characters",
        "games_played",
        "kills",
        "assists",
        "damage",
        "shots",
        "hits",
        "accuracy",
        "headshots",
        "headshots_accuracy",
        "survival_time",
        "placement_avg",
    ]

    for column in ordered_columns:
        if column not in grouped.columns:
            grouped[column] = None

    return grouped[ordered_columns]


def _aggregate_unique_characters(df: pd.DataFrame) -> pd.DataFrame:
    def _unique_join(series: pd.Series) -> Optional[str]:
        values = [str(value) for value in series if pd.notna(value) and str(value).strip()]
        if not values:
            return None
        seen: list[str] = []
        for value in values:
            if value not in seen:
                seen.append(value)
        return ", ".join(seen)

    grouped = (
        df.groupby(["player_name", "team_name", "team_num"], dropna=False)["character"]
        .agg(_unique_join)
        .reset_index()
    )
    return grouped.rename(columns={"character": "characters"})


def _to_int_or_none(value: object) -> Optional[int]:
    try:
        return int(value)  # type: ignore[call-arg]
    except Exception:  # noqa: BLE001
        return None


__all__ = [
    "aggregate_player_totals",
    "aggregate_team_totals",
    "safe_filename_component",
]
