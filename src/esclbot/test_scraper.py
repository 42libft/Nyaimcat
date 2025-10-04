# src/esclbot/test_scraper.py
from src.esclbot.scraper import collect_game_texts_from_group

URL = "https://fightnt.escl.co.jp/scrims/36db0e63-5188-4ab7-b7ce-5fe1a9fb58d4/77cc0dae-6970-444c-ab30-3905e690e57d"

def main():
    pairs = collect_game_texts_from_group(URL, max_games=6)  # ← 同期関数なので await 不要
    print("games_found:", len(pairs))
    print("game_nos:", [g for g, _ in pairs])
    if pairs:
        print("--- first payload head ---")
        print("\n".join(pairs[0][1].splitlines()[:5]))

if __name__ == "__main__":
    main()
