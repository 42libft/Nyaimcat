# quick_api_test.py
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.esclbot.api_scraper import parse_scrim_group_from_url, get_group_bucket, collect_csv_from_parent_url  # noqa: E402
import pandas as pd  # noqa: E402

PARENT = "https://fightnt.escl.co.jp/scrims/36db0e63-5188-4ab7-b7ce-5fe1a9fb58d4/77cc0dae-6970-444c-ab30-3905e690e57d"

def main():
    scrim_uuid, group_uuid = parse_scrim_group_from_url(PARENT)
    print("scrim_uuid:", scrim_uuid)
    print("group_uuid:", group_uuid)

    # GetBucket を直接呼ぶ（404ならここで発覚）
    bucket = get_group_bucket(scrim_uuid, group_uuid)
    if not bucket:
        print("[NG] bucket is empty or 404"); return
    print("[OK] bucket fetched. keys:", list(bucket.keys())[:10] if isinstance(bucket, dict) else type(bucket))

    # ついでに最終のCSV化も通す
    df = collect_csv_from_parent_url(PARENT, "G5", 6)
    print("[OK] DataFrame shape:", df.shape)
    print(df.head())

if __name__ == "__main__":
    main()
