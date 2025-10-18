# inspect_escl_dump.py
import json, re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DUMP_DIR = REPO_ROOT / "data" / "escl" / "raw"

def brief(v, depth=0, max_items=5):
    pad = "  " * depth
    if isinstance(v, dict):
        ks = list(v.keys())[:max_items]
        print(pad + f"dict keys({len(v)}): {ks}")
        for k in ks:
            print(pad + f"- {k}: {type(v[k]).__name__}")
    elif isinstance(v, list):
        print(pad + f"list len={len(v)} sample_types={[type(x).__name__ for x in v[:max_items]]}")
        for i, it in enumerate(v[:max_items]):
            print(pad + f"[{i}] type={type(it).__name__}")
            if isinstance(it, (dict, list)):
                brief(it, depth+1, max_items)
    else:
        s = str(v)
        s = s if len(s) < 200 else s[:200] + "..."
        print(pad + f"{type(v).__name__}: {s}")

def main():
    files = sorted(DUMP_DIR.glob("*.json"))
    if not files:
        print(f"no files in {DUMP_DIR}")
        return

    for fp in files:
        raw = fp.read_bytes()
        head = raw[:24]
        looks_text = all(32 <= b <= 126 or b in (9,10,13) for b in head)  # 粗い判定
        print("="*80)
        print(fp.name, f"(size={len(raw)} bytes, textish={looks_text})")
        try:
            txt = raw.decode("utf-8", errors="ignore")
        except Exception:
            txt = None

        if txt and "{" in txt:
            # JSON らしければパースを試す
            try:
                j = json.loads(txt)
                print("-> JSON parsed OK. Top-level type:", type(j).__name__)
                brief(j, 0)
            except Exception as e:
                print("-> has '{' but json.loads failed:", e)
                # 先頭200文字を表示
                print((txt[:200] + "...") if txt else "")
        else:
            # 先頭バイトを表示
            print("-> not JSON text. First 32 bytes:", list(raw[:32]))

if __name__ == "__main__":
    main()
