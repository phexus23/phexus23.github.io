"""
strip_ads.py — remove the genizymath ad/anti-tamper layer from the scraped
youtube-playables wrappers in Vafor_IT/source2/.

Each affected wrapper ends with an ~18 KB obfuscated <script> blob that:
  1. loads an ad network (XOR-hidden URL: https://cdn.r9x.in/ailogic_gn-math.dev_obf.js)
     -> interstitials, sidebar ads (#sidebarad1/2), popups
  2. checks location.hostname -> blanks the page off "allowed" domains

This script, per file that contains the blob:
  - backs the original up to .backup-source2-orig/<name>.html (once)
  - deletes the trailing obfuscated <script> block
  - deletes the #sidebarad1 / #sidebarad2 divs and their CSS
  - replaces the external ytgame.js <script src> with an inlined copy of
    ytgame-shim.js (ad calls resolve instantly; saveData/loadData use
    localStorage; unknown calls can't throw)

Idempotent: re-running skips files already processed (no obf marker left).

Usage:
    python strip_ads.py [--apply] [--limit N] [--only slug1,slug2]

Without --apply it's a dry run (reports what it would change).
"""
import os
import re
import sys
import argparse

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, "Vafor_IT", "source2")
ORIG_DIR = os.path.join(HERE, ".backup-source2-orig")
SHIM_PATH = os.path.join(HERE, "ytgame-shim.js")

OBF_MARKERS = ("sFfEkK$fMziBAJZwZbkuvp", "UravPbGESYjDUNqxKcf$Vqza")  # obfuscator fingerprints
YTGAME_SRC_RE = re.compile(
    r'<script\b[^>]*\bsrc="[^"]*\bytgame\.js"[^>]*>\s*</script>', re.I
)


def find_obf_script(html):
    """Return (start, end) of the trailing obfuscated <script>...</script>, or None."""
    for m in re.finditer(r"<script\b([^>]*)>", html, re.I):
        attrs = m.group(1)
        if "src=" in attrs.lower():
            continue
        end = html.find("</script>", m.end())
        if end == -1:
            continue
        body = html[m.end():end]
        if any(mark in body for mark in OBF_MARKERS):
            return (m.start(), end + len("</script>"))
    return None


def strip_sidebar_ads(html):
    # <div id="sidebaradN"> ... </div>  (the inner .sidebar-close div + its own close)
    html = re.sub(
        r'<div\s+id="sidebarad[12]"\s*>.*?</div>\s*</div>', "", html, flags=re.S | re.I
    )
    html = re.sub(
        r'<div\s+id="sidebarad[12]"\s*>.*?</div>', "", html, flags=re.S | re.I
    )
    # CSS rules: from "#sidebarad1" (or a selector list containing it) up to the
    # matching closing brace of the LAST rule in that block. The wrappers group
    # #sidebarad1,#sidebarad2 { ... } #sidebarad1 { ... } #sidebarad2 { ... }
    # .sidebar-close { ... } .sidebar-frame { ... } — nuke that whole run.
    html = re.sub(
        r"#sidebarad1\b.*?\.sidebar-frame\s*\{[^}]*\}", "", html, flags=re.S | re.I
    )
    html = re.sub(r"#sidebarad[12]\b[^{]*\{[^}]*\}", "", html, flags=re.S | re.I)
    html = re.sub(r"\.sidebar-close\b[^{]*\{[^}]*\}", "", html, flags=re.S | re.I)
    html = re.sub(r"\.sidebar-frame\b[^{]*\{[^}]*\}", "", html, flags=re.S | re.I)
    return html


def process(html, shim):
    obf = find_obf_script(html)
    if not obf:
        return None  # nothing to do
    html = html[: obf[0]] + html[obf[1] :]
    html = strip_sidebar_ads(html)
    shim_tag = "<script>\n" + shim + "\n</script>"
    if YTGAME_SRC_RE.search(html):
        html = YTGAME_SRC_RE.sub(shim_tag, html, count=1)
    else:
        # no ytgame.js tag? inject the shim just before the first other <script>
        html = re.sub(r"(<script\b)", shim_tag + r"\n\1", html, count=1, flags=re.I)
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("--limit", type=int, default=0, help="process at most N files")
    ap.add_argument("--only", default="", help="comma-separated slugs (basenames w/o .html)")
    args = ap.parse_args()

    with open(SHIM_PATH, encoding="utf-8") as f:
        shim = f.read().strip()

    only = set(s.strip() for s in args.only.split(",") if s.strip())
    files = sorted(
        p for p in os.listdir(SRC_DIR) if p.endswith(".html")
    )
    if only:
        files = [p for p in files if p[:-5] in only]

    if args.apply:
        os.makedirs(ORIG_DIR, exist_ok=True)

    changed = skipped = 0
    for name in files:
        if args.limit and changed >= args.limit:
            break
        path = os.path.join(SRC_DIR, name)
        with open(path, encoding="utf-8", errors="replace") as f:
            html = f.read()
        new = process(html, shim)
        if new is None:
            skipped += 1
            continue
        changed += 1
        delta = len(html) - len(new)
        print(f"{'STRIP' if args.apply else 'would strip'}  {name}  (-{delta} bytes)")
        if args.apply:
            bak = os.path.join(ORIG_DIR, name)
            if not os.path.exists(bak):
                with open(bak, "w", encoding="utf-8", newline="") as f:
                    f.write(html)
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(new)

    print(
        f"\n{'applied' if args.apply else 'dry run'}: "
        f"{changed} file(s) {'stripped' if args.apply else 'would be stripped'}, "
        f"{skipped} already clean/skipped"
    )
    if not args.apply:
        print("re-run with --apply to write. originals are saved to .backup-source2-orig/")


if __name__ == "__main__":
    sys.exit(main())
