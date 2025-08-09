from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
import pandas as pd

@dataclass
class Session:
    scrim_group: Optional[str] = None
    scrim_id: Optional[str] = None
    games: List[pd.DataFrame] = field(default_factory=list)

    def add_game(self, df: pd.DataFrame) -> int:
        self.games.append(df)
        return len(self.games)

    @property
    def count(self) -> int:
        return len(self.games)
