# show_meta.py  — REQ_BODY を波括弧の対応で安全に抜き出す版
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DUMP = REPO_ROOT / "data" / "escl" / "raw"


def extract_json_after_req_body(text: str):
    """'REQ_BODY:' の直後に現れる JSON ブロックを {…} の括弧対応で抽出する。"""
    i = text.find("REQ_BODY:")
    if i == -1:
        return None
    # REQ_BODY: の後で最初に出てくる { を探す
    j = text.find("{", i)
    if j == -1:
        return None
    depth = 0
    k = j
    while k < len(text):
        ch = text[k]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                # j..k が JSON ブロック
                return text[j:k+1]
        k += 1
    return None  # 閉じカッコが見つからない

def latest_body(glob_pat: str):
    metas = sorted(DUMP.glob(glob_pat))
    if not metas:
        print(f"[NG] not found: {glob_pat}")
        return
    fp = metas[-1]
    txt = fp.read_text(encoding="utf-8", errors="ignore")
    js = extract_json_after_req_body(txt)
    if not js:
        print(f"[NG] no REQ_BODY JSON in: {fp.name}")
        # ついでに Content-Type をヒント表示
        m = re.search(r"RESP_HEADERS:\s*(.+)", txt, re.S)
        if m:
            hdrs = m.group(1)
            ct = re.search(r"(?i)content-type:\s*([^\r\n]+)", hdrs)
            if ct:
                print("Hint Content-Type:", ct.group(1).strip())
        return
    try:
        body = json.loads(js)
    except Exception as e:
        print(f"[NG] JSON parse failed in: {fp.name} -> {e}")
        print(js[:300], "...")
        return
    print(f"[OK] {fp.name}")
    print(json.dumps(body, ensure_ascii=False, indent=2))
    return body

print("=== GetGames REQ_BODY ===")
latest_body("*PublicGameService_GetGames*.meta.txt")
print("\n=== GetBucket REQ_BODY ===")
latest_body("*PublicBucketService_GetBucket*.meta.txt")
