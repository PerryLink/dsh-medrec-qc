#!/usr/bin/env python3
"""Generate README image assets for dsh-medrec-qc (docs/assets/).

Outputs (idempotent overwrite):
  dsh-medrec-qc-flow-light.svg / dsh-medrec-qc-flow-dark.svg
      Hero pipeline diagram. Two hand-written SVG files (vector — never
      rasterized to webp, as the family playbook prescribes for no-UI
      plugins). Every label inside is a command-surface token — tool
      arguments (`file | material`), stage names (`parseMaterial`,
      `medrec_qc`, `buildView`, `report`), the rule-pack path, and the
      configuration keys — never a natural-language sentence. That is what
      lets all five README languages share the same pair.

No evidence chart: this repository ships no benchmark or measured dataset.
The terminal captures under docs/assets/ (quickstart.png, the demo gif) are
real captures kept as-is; they are not regenerated here.

The palette, the light/dark skins, the webp quality and the CJK font probe
below are copied from the family template so every PerryLink README renders
in the same visual system. The SVG itself is ASCII-only, but the probe stays
mandatory: a future evidence chart added to this script must never render
Chinese as tofu boxes.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow (pip install pillow)
"""
from __future__ import annotations

import os
import sys

from PIL import ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a", track="#eaeef2"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e", track="#21262d"),
}
WEBP_QUALITY = 90  # family template value; used by any future raster asset

# --- CJK font probe: Chinese must never render as tofu boxes ----------------
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # Microsoft YaHei
    r"C:\Windows\Fonts\simhei.ttf",    # SimHei
    r"C:\Windows\Fonts\Deng.ttf",      # DengXian
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if FONT_PATH is None:
    sys.exit("FATAL: no CJK font found (looked for msyh.ttc, simhei.ttf, "
             "Deng.ttf, Noto Sans CJK, PingFang). Refusing to render Chinese "
             "as tofu boxes; install one of the probed fonts and re-run.")
ImageFont.truetype(FONT_PATH, 16)  # load once so a broken font file fails here


# ---------------------------------------------------------------------------
# Hero pipeline SVG (light + dark)
# ---------------------------------------------------------------------------
# Terse tokens only: the README prose explains them; the picture must stay
# language-neutral.
FLOW_NODES = [
    ("file | material", "JSON / YAML"),
    ("parseMaterial", "dictionary → rows"),
    ("medrec_qc", "MR-001 … MR-015"),
    ("buildView", "markdown + reportJson"),
    ("report", "summary · skipped[]"),
]
RULE_PACK = "rules/medrec-qc.yaml · 15 rules · excerpt verbatim"
CONFIG_KEYS = ("config · rulesFile · disabledRules · onlyRules · "
               "skipNotes · timeoutMs")
CITATION_KEYS = "every finding · document · number · clause · excerpt · source"


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    w, h = 1200, 440
    nw, nh, gap = 180, 96, 45
    y0 = 146
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="dsh-medrec-qc pipeline">',
        '<title>dsh-medrec-qc pipeline</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="60" y="58" fill="{s["text"]}" font-family="ui-sans-serif,'
        f'system-ui,sans-serif" font-size="30" font-weight="700">'
        f'dsh-medrec-qc</text>',
        f'<text x="60" y="92" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="16">medrec_qc · file | material → '
        f'rule pack → report</text>',
        f'<line x1="60" y1="116" x2="1140" y2="116" stroke="{s["border"]}"/>',
    ]
    for i, (label, sub) in enumerate(FLOW_NODES):
        x = 60 + i * (nw + gap)
        accent = GREEN[skin] if i == len(FLOW_NODES) - 1 else (
            FAMILY if i == 2 else s["border"])
        parts.append(
            f'<rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{accent}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 40}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="16" font-weight="700">{label}</text>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 68}" fill="{s["sub"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="12">{sub}</text>')
        if i < len(FLOW_NODES) - 1:
            ax = x + nw + 6
            ay = y0 + nh // 2
            parts.append(
                f'<path d="M{ax} {ay}h{gap - 12}" stroke="{s["sub"]}" '
                f'stroke-width="3"/>')
            parts.append(
                f'<path d="M{ax + gap - 14} {ay - 7}l10 7-10 7" fill="none" '
                f'stroke="{s["sub"]}" stroke-width="3" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')
    # rule pack feeds the check core: dashed connector under node 3
    cx = 60 + 2 * (nw + gap) + nw // 2
    parts.append(
        f'<path d="M{cx} {y0 + nh}v{300 - y0 - nh}" stroke="{FAMILY}" '
        f'stroke-width="2" stroke-dasharray="5 5"/>')
    parts.append(
        f'<path d="M{cx - 6} 292l6 8 6-8" fill="none" stroke="{FAMILY}" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
    bx, bw, by, bh = 330, 540, 300, 48
    parts.append(
        f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="12" '
        f'fill="{s["box"]}" stroke="{FAMILY}" stroke-width="2"/>')
    parts.append(
        f'<text x="{bx + bw // 2}" y="{by + 30}" fill="{s["text"]}" '
        f'text-anchor="middle" font-family="ui-monospace,monospace" '
        f'font-size="14">{RULE_PACK}</text>')
    parts.append(
        f'<text x="60" y="390" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="13">{CONFIG_KEYS}</text>')
    parts.append(
        f'<text x="60" y="414" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="13">{CITATION_KEYS}</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        with open(os.path.join(OUT, f"dsh-medrec-qc-flow-{skin}.svg"),
                  "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
    print("wrote 2 SVG assets to docs/assets/ "
          f"(webp quality for future raster assets: {WEBP_QUALITY})")


if __name__ == "__main__":
    main()
