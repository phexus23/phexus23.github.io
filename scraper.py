import json
import os
import sys
import urllib.request
import ssl
from pathlib import Path

home_dir = Path(r"C:\Users\maxwe\Documents\GitHub\phexus23.github.io")
zones_url = "https://cdn.jsdelivr.net/gh/freebuisness/assets@main/zones.json"
cover_base = "https://cdn.jsdelivr.net/gh/freebuisness/covers@main"
html_base = "https://cdn.jsdelivr.net/gh/freebuisness/html@main"
images_dir = home_dir / "assets" / "img"
gxmes_dir = home_dir / "gxmes"
json_dir = home_dir / "json"
list_path = json_dir / "list.json"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def urlretrieve(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
        with open(path, "wb") as f:
            f.write(resp.read())

def slugify(name):
    s = name.lower()
    s = s.replace(" ", "-")
    s = s.replace("_", "-")
    s = "".join(c for c in s if c.isalnum() or c in "-_")
    s = s.strip("-_")
    return s

def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))

def main():
    print("Fetching zones.json...")
    req = urllib.request.Request(zones_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
        zones = json.loads(resp.read().decode("utf-8"))
    print(f"Found {len(zones)} zones")

    skip_names = {"[!] SUGGEST GAMES .gg/D4c9VFYWyU", "[!] COMMENTS"}

    existing_list = []
    if list_path.exists():
        with open(list_path, "r", encoding="utf-8") as f:
            existing_list = json.load(f)
    existing_names = {g["name"] for g in existing_list}
    existing_folders = {g["foldername"] for g in existing_list}

    # Build set of already-scraped folder names from gxmes directory
    gxmes_folders = set()
    if gxmes_dir.exists():
        for d in os.listdir(gxmes_dir):
            if os.path.isdir(os.path.join(gxmes_dir, d)):
                gxmes_folders.add(d)

    new_games = []
    downloaded = 0
    skipped = 0
    already_exists = 0

    for zone in zones:
        name = zone.get("name", "")
        if name in skip_names:
            skipped += 1
            continue

        zone_id = zone.get("id")
        cover_url = zone.get("cover", "")
        game_url = zone.get("url", "")

        cover_id = str(zone_id) if zone_id is not None else ""
        actual_cover = cover_url.replace("{COVER_URL}", cover_base).replace("{COVER_URL}/", cover_base + "/")
        actual_game_url = game_url.replace("{HTML_URL}", html_base).replace("{HTML_URL}/", html_base + "/")

        folder_name = slugify(name)
        img_filename = f"{slugify(name)}_{cover_id}.png"
        img_path = images_dir / img_filename
        gxme_path = gxmes_dir / folder_name

        # Skip if already in list.json
        if name in existing_names:
            already_exists += 1
            continue

        # Skip if gxmes folder already exists with index.html
        if folder_name in gxmes_folders and (gxme_path / "index.html").exists():
            already_exists += 1
            continue

        if not img_path.exists():
            try:
                urlretrieve(actual_cover, img_path)
                downloaded += 1
                safe_print(f"  Downloaded cover: {name}")
            except Exception as e:
                safe_print(f"  Failed to download cover for {name}: {e}")
                continue
        else:
            safe_print(f"  Cover exists: {name}")

        gxme_path.mkdir(parents=True, exist_ok=True)

        html_content = f'''<!DOCTYPE html><html lang="en"><head><title>Play {name} Unblocked | Vafor</title><link rel="canonical" href="https://maxwellstevenson.com/gxmes/{folder_name}/"><meta name="description" content="Play {name} unblocked for free on Vafor. No downloads or sign-ups — just click and play instantly."> <script async src="https://pagead2.googletagmanager.com/gtag/js?id=G-9Y3T9NZGP8"></script> <script src="../js/fetchington.js"></script> <script async src="https://www.googletagmanager.com/gtag/js?id=G-9Y3T9NZGP8"></script> <script> window.dataLayer = window.dataLayer || []; function gtag() {{ dataLayer.push(arguments); }} gtag('js', new Date()); gtag('config', 'G-9Y3T9NZGP8'); </script></head><body> <script> fetchData({len(new_games) + len(existing_list)}); </script></body></html>
'''
        index_path = gxme_path / "index.html"
        index_path.write_text(html_content, encoding="utf-8")

        category = "Action"
        special = zone.get("special", [])
        if "flash" in special:
            category = "Flash"
        elif "emulator" in special:
            category = "Emulator"
        elif "port" in special:
            category = "Port"
        elif zone.get("featured"):
            category = "Featured"

        new_games.append({
            "name": name,
            "imgsrc": f"/assets/img/{img_filename}",
            "linksrc": f"/gxmes/{folder_name}/",
            "foldername": folder_name,
            "category": category
        })

    all_games = existing_list + new_games
    with open(list_path, "w", encoding="utf-8") as f:
        json.dump(all_games, f, indent=4)

    safe_print(f"\nDone! Added {len(new_games)} new games ({downloaded} covers downloaded, {skipped} skipped, {already_exists} already exist)")
    safe_print(f"Total games in list.json: {len(all_games)}")
    safe_print("Running sitemap generator...")
    os.system(f'python "{home_dir / "generate_sitemap.py"}"')

if __name__ == "__main__":
    main()
