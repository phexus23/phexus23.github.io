import os
import json
import platform
import subprocess
import sys

homeDir = r"C:\Users\maxwe\Documents\GitHub\phexus23.github.io"
jsonPath = os.path.join(homeDir, "json", "list.json")
vaforPath = os.path.join(homeDir, "Vafor_IT")
gxmesPath = os.path.join(homeDir, "gxmes")
assetsImgPath = os.path.join(homeDir, "assets", "img")

try:
    with open(jsonPath, 'r') as f:
        jsonContent = json.load(f)
except FileNotFoundError:
    jsonContent = []
except json.JSONDecodeError:
    print("Error decoding JSON from list.json. Starting with an empty list.")
    jsonContent = []

print("Enter game details:")
name = input("Enter game name: ")
imgsrc = input("Enter image src (e.g., /assets/img/game.jpeg): ")
category = input("Enter category (e.g., Action, Platformer): ")
foldername = input("Enter folder name (no spaces or special chars, e.g., stickman-hook): ")
linksrc = foldername

newGame = {
    "name": name,
    "imgsrc": imgsrc,
    "linksrc": f"/Vafor_IT/{linksrc}/",
    "foldername": foldername,
    "category": category
}
jsonContent.append(newGame)

with open(jsonPath, 'w') as f:
    json.dump(jsonContent, f, indent=4)

gameIndex = len(jsonContent) - 1

vaforGamePath = os.path.join(vaforPath, foldername)
gxmesGamePath = os.path.join(gxmesPath, foldername)

os.makedirs(vaforGamePath, exist_ok=True)
os.makedirs(gxmesGamePath, exist_ok=True)

if platform.system() == 'Windows':
    try:
        os.startfile(vaforGamePath)
        os.startfile(assetsImgPath)
    except Exception as e:
        print(f"Error opening folders: {e}")
elif platform.system() == 'Darwin':
    print("Folder opening for macOS not implemented.")
# No 'return' outside a function

pageTitle = f"Play {name} Unblocked | Vafor"
pageDescription = f"Play {name} unblocked for free on Vafor. No downloads or sign-ups — just click and play instantly."
canonicalUrl = f"https://maxwellstevenson.com/gxmes/{foldername}/"

html = f"""<!DOCTYPE html><html lang="en"><head><title>{pageTitle}</title><meta name="description" content="{pageDescription}"><link rel="canonical" href="{canonicalUrl}"> <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3858578074050552" crossorigin="anonymous"></script> <script src="../js/fetchington.js"></script> <script async src="https://www.googletagmanager.com/gtag/js?id=G-9Y3T9NZGP8"></script> <script> window.dataLayer = window.dataLayer || []; function gtag() {{ dataLayer.push(arguments); }} gtag('js', new Date()); gtag('config', 'G-9Y3T9NZGP8'); </script></head><body> <script> fetchData({gameIndex}); </script></body></html>
"""

indexPath = os.path.join(gxmesGamePath, "index.html")
with open(indexPath, 'w') as f:
    f.write(html)

subprocess.run([sys.executable, os.path.join(homeDir, "generate_sitemap.py")], check=True)

print(f"All done! Game added as entry #{gameIndex}.")