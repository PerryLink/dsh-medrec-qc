#!/usr/bin/env python3
"""README visuals for dsh-medrec-qc — derived from the plugin's real pipeline.

Assets written (idempotent, overwrite):

  dsh-medrec-qc-hero-{zh,en}-{light,dark}.webp   1440x576 raster banner
  dsh-medrec-qc-flow-v5-{light,dark}.svg          1100x660 hand-written SVG

Hero (Pillow)
    Left column: kicker / title / two value lines / subtitle / meta / footer.
    Right side: the material itself — eight fields of the inpatient front-sheet
    export described in `samples/quickstart/input/MR-001-unsafe.yaml` — with the
    blank `病案号` cell marked, the MR-001 finding card underneath it, and the
    report readout (`1 issue`, `14 skipped`, `error 1 · warn 0 · info 0`).
    Every value is taken from that sample; nothing is invented.

Flow (hand-written SVG)
    A scoreboard, not a five-box pipeline. One intake belt (material on the
    left, rule pack on the right, `runCheck()` between them), then the 15 rules
    as three severity decks with their outcomes stamped per rule, then the two
    ledgers `issues[]` / `skipped[]`, then the `buildView()` projection. The
    stamps read the sample too: MR-001 fires, twelve rules ran clean, MR-012
    has no column and MR-015 has no death case. Clean rules still land in
    `skipped[]` with a reason — that is the point of the picture.

No evidence chart: this repository ships no benchmark or measured dataset. The
terminal capture in docs/assets/ is a real capture kept as-is.

The palette (family accent #4B67B4 / #8496f5, light #f9f6fd -> #e4eaf8, dark
#131a2a -> #0c1016), the radii and the fonts are the PerryLink family system.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow + Windows fonts msyh.ttc / msyhbd.ttc / consola.ttf.
"""
from __future__ import annotations

import math
import os
import sys
from html import escape

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_MONO_BOLD = r"C:\Windows\Fonts\consolab.ttf"
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_MONO_BOLD):
    if not os.path.exists(_p):
        raise SystemExit(f"FATAL: font missing: {_p}")

FONT_FILES = {
    "cjk": FONT_CJK,
    "cjk_bold": FONT_CJK_BOLD,
    "mono": FONT_MONO,
    "mono_bold": FONT_MONO_BOLD,
}

SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8",
        card="#ffffff", edge="#e6e2ef",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", accent_soft="#ece7f9",
        pill="#f1edf9", band="#f7f4fb", grid="#e7e4f0",
        error="#b42318", error_bg="#fdeeec",
        warn="#b45309", warn_bg="#fdf3e9",
        info="#5a6478", info_bg="#eef0f5",
        shadow=(34, 26, 66), glow="#7a68c9", quote="#ded7ef",
        shadow_opacity=0.12,
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016",
        card="#1b2231", edge="#2e374b",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", accent_soft="#242d42",
        pill="#202839", band="#171e2b", grid="#262f42",
        error="#ff7b72", error_bg="#3a1d1f",
        warn="#d9a441", warn_bg="#33270f",
        info="#9aa7bd", info_bg="#232c3c",
        shadow=(0, 0, 0), glow="#8496f5", quote="#2b3549",
        shadow_opacity=0.45,
    ),
}

WEBP_QUALITY = 92


def font(size: int, kind: str = "cjk") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_FILES[kind], size)


def hx(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


_SCRATCH = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def measure(text: str, size: int, kind: str) -> float:
    return _SCRATCH.textlength(text, font=font(size, kind))


def require_w(text: str, size: int, kind: str, max_w: float, what: str) -> None:
    width = measure(text, size, kind)
    if width > max_w + 0.5:
        raise SystemExit(f"FATAL: {what} overflows: {text!r} needs {width:.1f}px > {max_w}px")


def fit(text: str, kind: str, max_w: float, start: int, minimum: int) -> int:
    size = start
    while size >= minimum:
        if measure(text, size, kind) <= max_w:
            return size
        size -= 1
    raise SystemExit(f"FATAL: text does not fit {max_w}px at >= {minimum}px: {text!r}")


def fit_lines(lines: list[str], kind: str, max_w: float, start: int,
              minimum: int) -> int:
    return min(fit(line, kind, max_w, start, minimum) for line in lines)


# --------------------------------------------------------------------------- hero
# Values below come from samples/quickstart/input/MR-001-unsafe.yaml and the
# tool's own output; the finding text is the tool's `found` phrasing.
HERO_TITLE = "dsh-medrec-qc"

HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · 病案首页检查器",
        value1="15 条规则，逐行逐栏核对病案首页",
        value2="每条差异写明行号、栏名与依据条款",
        sub="规则库是数据：只列差异，不下结论；不联网、不写盘",
        meta="medrec_qc · file | material → report · 15 rules · v2026.1",
        footer="只读 · 纯本地 · Apache-2.0 · PerryLink DSH 插件家族",
        form_title="住院病案首页 · 导出",
        form_sub="2026 年 3 月 · cases[1] · 节选 8 栏 / 21 键",
        fields=[
            ("病案号", ""),
            ("入院时间", "2026-03-01 08:30"),
            ("出院时间", "2026-03-06 10:00"),
            ("实际住院天数", "5"),
            ("性别", "1"),
            ("年龄", "53"),
            ("主要诊断编码", "E11.900"),
            ("离院方式", "1"),
        ],
        blank_tag="空",
        callout_locator="第 1 行 · 病案号",
        callout_found="「病案号」为空",
        callout_basis=["附件1 必填栏不能为空项，", "没有可填写内容时填写 \"-\""],
        callout_source="source · hncis.hnwsjk.cn · 摘录逐字取得",
        stat_issue="issue",
        stat_skipped="skipped",
        stat_summary="error 1 · warn 0 · info 0",
        stat_ruleset="ruleset 2026.1 · 15 rules",
        stat_tag="report · quickstart",
    ),
    "en": dict(
        kicker="DeepSeek Harness · front-sheet checker",
        value1="15 rules, row by row, column by column",
        value2="Each finding cites its row, column and clause",
        sub="The rule pack is data: differences only, no verdict, no network, no writes",
        meta="medrec_qc · file | material → report · 15 rules · v2026.1",
        footer="read-only · local only · Apache-2.0 · PerryLink DSH family",
        form_title="Inpatient front sheet · export",
        form_sub="March 2026 · cases[1] · 8 of 21 keys",
        fields=[
            ("病案号", ""),
            ("入院时间", "2026-03-01 08:30"),
            ("出院时间", "2026-03-06 10:00"),
            ("实际住院天数", "5"),
            ("性别", "1"),
            ("年龄", "53"),
            ("主要诊断编码", "E11.900"),
            ("离院方式", "1"),
        ],
        blank_tag="空",
        callout_locator="row 1 · 病案号",
        callout_found="\"病案号\" is empty",
        callout_basis=["附件1 注：必填栏不能为空项，", "没有可填写内容时填写 \"-\""],
        callout_source="source · hncis.hnwsjk.cn · verbatim excerpt",
        stat_issue="issue",
        stat_skipped="skipped",
        stat_summary="error 1 · warn 0 · info 0",
        stat_ruleset="ruleset 2026.1 · 15 rules",
        stat_tag="report · quickstart",
    ),
}


def gradient(w: int, h: int, c1: str, c2: str) -> Image.Image:
    base = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(base)
    a, b = hx(c1), hx(c2)
    for y in range(h):
        t = 0.18 * (y / h) + 0.82 * (y / h) ** 1.4
        draw.line([(0, y), (w, y)],
                  fill=tuple(round(p + (q - p) * t) for p, q in zip(a, b)))
    return base


def glow(img: Image.Image, cx: int, cy: int, radius: int, color: tuple,
         alpha: int = 34) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(10, 0, -1):
        rr = radius * i / 10
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                     fill=color + (int(alpha * (1 - i / 11) ** 1.5),))
    layer = layer.filter(ImageFilter.GaussianBlur(26))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img: Image.Image, box: tuple[int, int, int, int], s: dict,
         radius: int = 18, blur: int = 14, dy: int = 8,
         fill: str | None = None) -> Image.Image:
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    alpha = int(40 * s["shadow_opacity"] * 3)
    for i in range(6, 0, -2):
        draw.rounded_rectangle(
            [x0 - 3, y0 + dy + i * 2, x1 + 3, y1 + dy + i * 3],
            radius=radius + i,
            fill=s["shadow"] + (max(4, int(alpha / (i + 1))),))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle(box, radius=radius, fill=hx(fill or s["card"]),
                           outline=hx(s["edge"]), width=2)
    return base


def dashed_round_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int],
                      color: str, width: int = 2, dash: int = 7,
                      gap: int = 5, radius: int = 9) -> None:
    """Dashed rounded rectangle: sample the perimeter, then walk dashes."""
    x0, y0, x1, y1 = box
    r = min(radius, (x1 - x0) // 2, (y1 - y0) // 2)
    pts: list[tuple[float, float]] = []

    def arc(cx: float, cy: float, start: float, end: float) -> None:
        for i in range(7):
            a = math.radians(start + (end - start) * i / 6)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    pts.append((x0 + r, y0))
    pts.append((x1 - r, y0))
    arc(x1 - r, y0 + r, -90, 0)
    pts.append((x1, y1 - r))
    arc(x1 - r, y1 - r, 0, 90)
    pts.append((x0 + r, y1))
    arc(x0 + r, y1 - r, 90, 180)
    pts.append((x0, y0 + r))
    arc(x0 + r, y0 + r, 180, 270)
    pts.append((x0 + r, y0))

    on, phase = True, 0.0
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        seg = math.hypot(bx - ax, by - ay)
        if seg == 0:
            continue
        t = 0.0
        while t < seg:
            need = (dash if on else gap) - phase
            step = min(need, seg - t)
            if on:
                p0 = (ax + (bx - ax) * t / seg, ay + (by - ay) * t / seg)
                p1 = (ax + (bx - ax) * (t + step) / seg,
                      ay + (by - ay) * (t + step) / seg)
                draw.line([p0, p1], fill=hx(color), width=width)
            t += step
            phase += step
            if phase >= (dash if on else gap) - 1e-9:
                phase, on = 0.0, not on


def chip(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fg: str,
         bg: str, size: int = 11, padx: int = 9, height: int = 20,
         kind: str = "cjk_bold", radius: int | None = None) -> int:
    f = font(size, kind)
    w = draw.textlength(text, font=f)
    x, y = xy
    draw.rounded_rectangle([x, y, x + w + padx * 2, y + height],
                           radius=(height // 2 if radius is None else radius),
                           fill=hx(bg))
    draw.text((x + padx, y + height / 2), text, font=f, fill=hx(fg), anchor="lm")
    return int(w + padx * 2)


def draw_hero(lang: str, skin: str) -> Image.Image:
    h = HERO[lang]
    s = SKIN[skin]
    w, ht = 1440, 576
    img = gradient(w, ht, s["bg_from"], s["bg_to"])
    img = glow(img, 1150, 70, 330, hx(s["glow"]), 38 if skin == "light" else 28)
    img = glow(img, 900, 500, 280, hx(s["glow"]), 16 if skin == "light" else 12)
    draw = ImageDraw.Draw(img)

    # ---- left column ------------------------------------------------------
    draw.rounded_rectangle([72, 79, 76, 99], radius=2, fill=hx(s["accent"]))
    draw.text((88, 96), h["kicker"], font=font(17, "cjk_bold"),
              fill=hx(s["accent"]), anchor="ls")
    title_size = fit(HERO_TITLE, "mono_bold", 620, 58, 48)
    draw.text((70, 168), HERO_TITLE, font=font(title_size, "mono_bold"),
              fill=hx(s["text"]), anchor="ls")
    draw.rounded_rectangle([72, 184, 162, 188], radius=2, fill=hx(s["accent"]))

    value_size = fit_lines([h["value1"], h["value2"]], "cjk_bold", 620, 30, 24)
    draw.text((72, 250), h["value1"], font=font(value_size, "cjk_bold"),
              fill=hx(s["text"]), anchor="ls")
    draw.text((72, 292), h["value2"], font=font(value_size, "cjk_bold"),
              fill=hx(s["text"]), anchor="ls")

    sub_size = fit(h["sub"], "cjk", 620, 20, 15)
    draw.text((72, 344), h["sub"], font=font(sub_size, "cjk"),
              fill=hx(s["sub"]), anchor="ls")

    meta_size = fit(h["meta"], "mono", 620, 16, 12)
    draw.text((72, 402), h["meta"], font=font(meta_size, "mono"),
              fill=hx(s["faint"]), anchor="ls")

    draw.line([72, 440, 664, 440], fill=hx(s["grid"]), width=1)
    foot_size = fit(h["footer"], "cjk", 620, 14, 12)
    draw.text((72, 500), h["footer"], font=font(foot_size, "cjk"),
              fill=hx(s["faint"]), anchor="ls")

    # ---- right side: stacked front-sheet pages ----------------------------
    draw.rounded_rectangle([762, 54, 1354, 342], radius=20, fill=hx(s["pill"]))
    draw.rounded_rectangle([754, 63, 1362, 351], radius=20, fill=hx(s["band"]))
    img = card(img, (744, 72, 1368, 364), s, radius=20, blur=16, dy=9)
    draw = ImageDraw.Draw(img)

    draw.text((770, 108), h["form_title"], font=font(17, "cjk_bold"),
              fill=hx(s["text"]), anchor="ls")
    form_sub_size = fit(h["form_sub"], "cjk", 360, 11, 9)
    draw.text((1342, 108), h["form_sub"], font=font(form_sub_size, "cjk"),
              fill=hx(s["faint"]), anchor="rs")
    draw.line([770, 122, 1342, 122], fill=hx(s["grid"]), width=1)

    cols = (770, 1062)
    col_w = 268
    rows = (136, 190, 244, 298)
    for ry in rows[1:]:
        draw.line([770, ry, 1342, ry], fill=hx(s["grid"]), width=1)
    draw.line([1056, 136, 1056, 352], fill=hx(s["grid"]), width=1)

    for index, (label, value) in enumerate(h["fields"]):
        cx = cols[index % 2] + (0 if index % 2 == 0 else 4)
        cy = rows[index // 2]
        blank = index == 0
        label_color = hx(s["error"]) if blank else hx(s["faint"])
        draw.text((cx, cy + 15), label, font=font(11, "cjk" if blank else "cjk"),
                  fill=label_color, anchor="ls")
        if blank:
            dashed_round_rect(draw, (cx - 4, cy + 22, cx + 172, cy + 48),
                              s["error"], width=2, dash=7, gap=5, radius=9)
            chip(draw, (cx + 180, cy + 26), h["blank_tag"],
                 fg=s["error"], bg=s["error_bg"], size=11, kind="cjk_bold")
        else:
            draw.text((cx + 8, cy + 39), value, font=font(13, "mono"),
                      fill=hx(s["text"]), anchor="ls")

    # ---- finding card -----------------------------------------------------
    img = card(img, (744, 384, 1120, 512), s, radius=18, blur=12, dy=7)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([747, 402, 751, 494], radius=2, fill=hx(s["error"]))
    draw.text((770, 410), "MR-001", font=font(14, "mono_bold"),
              fill=hx(s["error"]), anchor="ls")
    chip(draw, (838, 394), "error", fg=s["error"], bg=s["error_bg"],
         size=11, kind="mono_bold", padx=7, height=19)
    loc_size = fit(h["callout_locator"], "cjk", 190, 11, 10)
    draw.text((1102, 410), h["callout_locator"], font=font(loc_size, "cjk"),
              fill=hx(s["sub"]), anchor="rs")

    draw.text((770, 438), "found", font=font(11, "mono"),
              fill=hx(s["faint"]), anchor="ls")
    draw.text((826, 438), h["callout_found"], font=font(13, "cjk_bold"),
              fill=hx(s["text"]), anchor="ls")
    draw.text((770, 462), "basis", font=font(11, "mono"),
              fill=hx(s["faint"]), anchor="ls")
    for i, line in enumerate(h["callout_basis"]):
        draw.text((826, 462 + i * 17), line, font=font(11, "cjk"),
                  fill=hx(s["sub"]), anchor="ls")
    draw.text((770, 500), h["callout_source"], font=font(11, "cjk"),
              fill=hx(s["faint"]), anchor="ls")

    # ---- report card ------------------------------------------------------
    img = card(img, (1140, 384, 1368, 512), s, radius=18, blur=12, dy=7)
    draw = ImageDraw.Draw(img)
    draw.text((1164, 404), h["stat_tag"], font=font(11, "mono"),
              fill=hx(s["faint"]), anchor="ls")
    draw.text((1164, 446), "1", font=font(32, "mono_bold"),
              fill=hx(s["error"]), anchor="ls")
    draw.text((1198, 444), h["stat_issue"], font=font(11, "cjk"),
              fill=hx(s["sub"]), anchor="ls")
    draw.text((1252, 446), "14", font=font(32, "mono_bold"),
              fill=hx(s["sub"]), anchor="ls")
    draw.text((1292, 444), h["stat_skipped"], font=font(11, "cjk"),
              fill=hx(s["sub"]), anchor="ls")
    draw.line([1164, 462, 1344, 462], fill=hx(s["grid"]), width=1)
    draw.text((1164, 486), h["stat_summary"], font=font(11, "mono"),
              fill=hx(s["sub"]), anchor="ls")
    draw.text((1164, 506), h["stat_ruleset"], font=font(11, "mono"),
              fill=hx(s["faint"]), anchor="ls")

    # fit checks on the fixed-width right cards
    require_w(h["stat_summary"], 11, "mono", 184, "hero stat summary")
    require_w(h["stat_ruleset"], 11, "mono", 184, "hero ruleset")
    require_w(h["callout_source"], 11, "cjk", 336, "hero source")
    return img


def write_heroes() -> None:
    for lang in ("zh", "en"):
        for skin in ("light", "dark"):
            img = draw_hero(lang, skin)
            path = os.path.join(OUT, f"dsh-medrec-qc-hero-{lang}-{skin}.webp")
            img.save(path, "WEBP", quality=WEBP_QUALITY, method=6)
            print(f"wrote {os.path.relpath(path, ROOT)}")


# --------------------------------------------------------------------------- SVG
MONO = "Consolas,'Microsoft YaHei',ui-monospace,monospace"
SANS = ("'Microsoft YaHei','Segoe UI','PingFang SC','Noto Sans CJK SC',"
        "sans-serif")


def tw(text: str, size: int, kind: str = "cjk") -> float:
    return measure(text, size, kind)


def need(text: str, size: int, kind: str, max_w: float, what: str) -> None:
    require_w(text, size, kind, max_w, what)


def num(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def stext(x: float, y: float, text: str, size: int, fill: str,
          kind: str = "cjk", bold: bool = False,
          anchor: str | None = None, opacity: float | None = None,
          spacing: str | None = None) -> str:
    family = MONO if kind.startswith("mono") else SANS
    attrs = [f'x="{num(x)}"', f'y="{num(y)}"', f'fill="{fill}"',
             f'font-family="{family}"', f'font-size="{num(size)}"']
    if bold:
        attrs.append('font-weight="700"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    if opacity is not None:
        attrs.append(f'opacity="{num(opacity)}"')
    if spacing:
        attrs.append(f'letter-spacing="{spacing}"')
    return f'<text {" ".join(attrs)}>{escape(text)}</text>'


def srect(x: float, y: float, w: float, h: float, radius: float, fill: str,
          stroke: str | None = None, sw: float = 1,
          shadow: bool = False) -> str:
    attrs = [f'x="{num(x)}"', f'y="{num(y)}"', f'width="{num(w)}"',
             f'height="{num(h)}"', f'rx="{num(radius)}"', f'fill="{fill}"']
    if stroke:
        attrs += [f'stroke="{stroke}"', f'stroke-width="{num(sw)}"']
    if shadow:
        attrs.append('filter="url(#soft)"')
    return f'<rect {" ".join(attrs)}/>'


def schip(x: float, y: float, text: str, size: int, fg: str, bg: str,
          kind: str = "cjk", bold: bool = False, h: float = 20,
          padx: float = 9, stroke: str | None = None) -> tuple[str, float]:
    width = tw(text, size, kind) + padx * 2
    out = [srect(x, y, width, h, h / 2, bg, stroke=stroke, sw=1)]
    out.append(stext(x + padx, y + h / 2 + size * 0.36, text, size, fg,
                     kind=kind, bold=bold))
    return "".join(out), width


def schip_right(x_right: float, y: float, text: str, size: int, fg: str,
                bg: str, kind: str = "cjk", bold: bool = False,
                h: float = 20, padx: float = 9) -> tuple[str, float]:
    width = tw(text, size, kind) + padx * 2
    return schip(x_right - width, y, text, size, fg, bg, kind=kind,
                 bold=bold, h=h, padx=padx)


FLOW_SUBTITLE = ("15 条规则逐条执行，没有一条静默通过：命中进 issues[]，"
                 "其余带原因进 skipped[]")

# 15 rules — ids, one-word check names, severity, and the quickstart outcome.
# outcome: "hit" (difference found), "ran" (ran, no difference), "na" (not run)
RULES = [
    ("MR-001", "必填栏", "error", "hit"),
    ("MR-002", "时间到分", "error", "ran"),
    ("MR-003", "时间先后", "error", "ran"),
    ("MR-004", "住院天数", "error", "ran"),
    ("MR-005", "诊断配对", "error", "ran"),
    ("MR-006", "ICD-10", "error", "ran"),
    ("MR-007", "手术配对", "error", "ran"),
    ("MR-008", "ICD-9-CM-3", "error", "ran"),
    ("MR-009", "三级签名", "error", "ran"),
    ("MR-010", "离院代码", "error", "ran"),
    ("MR-011", "年龄形式", "warn", "ran"),
    ("MR-012", "新生儿体重", "warn", "na"),
    ("MR-013", "其他诊断", "warn", "ran"),
    ("MR-014", "性别×诊断", "warn", "ran"),
    ("MR-015", "死亡时间", "info", "na"),
]

STAMP = {
    "hit": ("×", "error", 18),
    "ran": ("·", "faint", 20),
    "na": ("–", "warn", 18),
}


def severity_color(sev: str, s: dict) -> tuple[str, str]:
    if sev == "error":
        return s["error"], s["error_bg"]
    if sev == "warn":
        return s["warn"], s["warn_bg"]
    return s["info"], s["info_bg"]


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    light = skin == "light"
    bg_from, bg_to = s["bg_from"], s["bg_to"]
    card, edge = s["card"], s["edge"]
    text, sub, faint = s["text"], s["sub"], s["faint"]
    accent, accent_soft = s["accent"], s["accent_soft"]
    grid, error, warn, info = s["grid"], s["error"], s["warn"], s["info"]
    parts: list[str] = []

    title = "dsh-medrec-qc"
    pack = "rules/medrec-qc.yaml · v2026.1"
    desc = (
        "dsh-medrec-qc 结构图：左侧 file | material 经 parseMaterial() 归一为 "
        "21 个规范键；右侧 rules/medrec-qc.yaml 载入期校验 excerpt 不少于 8 字符，"
        "引文门禁逐字核对原文，并按依据等级封顶严重级；runCheck() 逐条执行 15 条"
        "规则，按严重级分成 10 error / 4 warn / 1 info 三档，样例 quickstart 中 "
        "MR-001 命中，12 条已执行无差异，MR-012 缺列、MR-015 无死亡病例；没进差异"
        "清单的规则全部写进 skipped[] 并带原因；issues[] 与 skipped[] 经 buildView() "
        "投影为 markdown / reportJson，结论留给审核人。"
    )

    parts.append('<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="660" '
                 'viewBox="0 0 1100 660" role="img" aria-labelledby="title desc">')
    parts.append(f'<title id="title">{escape(title)} — 15 条规则的记分台</title>')
    parts.append(f'<desc id="desc">{escape(desc)}</desc>')
    parts.append('<defs>')
    parts.append(f'<linearGradient id="bg" x1="0" y1="0" x2="0.25" y2="1">'
                 f'<stop offset="0" stop-color="{bg_from}"/>'
                 f'<stop offset="1" stop-color="{bg_to}"/></linearGradient>')
    parts.append(f'<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">'
                 f'<stop offset="0" stop-color="{accent}" '
                 f'stop-opacity="{0.16 if light else 0.20}"/>'
                 f'<stop offset="1" stop-color="{accent}" stop-opacity="0"/>'
                 f'</radialGradient>')
    flood = "#2b2440" if light else "#000000"
    parts.append(f'<filter id="soft" x="-30%" y="-30%" width="160%" height="170%">'
                 f'<feDropShadow dx="0" dy="7" stdDeviation="10" '
                 f'flood-color="{flood}" flood-opacity="'
                 f'{0.12 if light else 0.42}"/></filter>')
    parts.append('</defs>')
    parts.append(f'<rect width="1100" height="660" rx="22" fill="url(#bg)"/>')
    parts.append('<circle cx="900" cy="40" r="300" fill="url(#glow)"/>')

    # header ---------------------------------------------------------------
    parts.append(stext(44, 50, title, 26, text, "mono", bold=True))
    need(FLOW_SUBTITLE, 13, "cjk", 750, "flow subtitle")
    parts.append(stext(44, 76, FLOW_SUBTITLE, 13, sub))
    chip_svg, chip_w = schip_right(1056, 28, pack, 11, accent, accent_soft,
                                   kind="mono", bold=False)
    parts.append(chip_svg)
    parts.append(f'<line x1="44" y1="92" x2="1056" y2="92" stroke="{grid}" '
                 f'stroke-width="1"/>')

    # stage 01: intake belt ------------------------------------------------
    parts.append(stext(44, 108, "01 · 读入", 11, accent, "cjk", bold=True,
                       spacing="1.1"))
    parts.append(srect(44, 116, 1012, 70, 16, card, edge, 1.5, shadow=True))
    parts.append(f'<line x1="400" y1="130" x2="400" y2="172" stroke="{grid}"/>')
    parts.append(f'<line x1="728" y1="130" x2="728" y2="172" stroke="{grid}"/>')

    parts.append(stext(60, 138, "材料 · IN", 11, accent, "cjk", bold=True))
    need("file | material · JSON / YAML", 11, "mono", 320, "flow material line")
    parts.append(stext(60, 158, "file | material · JSON / YAML", 11, text, "mono"))
    need("parseMaterial() → cases[] · 21 键", 11, "mono", 328, "flow parse line")
    parts.append(stext(60, 176, "parseMaterial() → cases[] · 21 键", 11, sub, "mono"))

    parts.append(stext(416, 147, "runCheck()", 15, accent, "mono", bold=True))
    parts.append(stext(416, 167, "行 × 栏 × 15 条", 11, sub))
    parts.append(stext(416, 183, "只比字面，不判对错", 11, faint))

    parts.append(stext(744, 138, "依据 · BASIS", 11, accent, "cjk", bold=True))
    need("rules/medrec-qc.yaml · v2026.1", 11, "mono", 296, "flow rules line")
    parts.append(stext(744, 158, "rules/medrec-qc.yaml · v2026.1", 11, text, "mono"))
    need("15 条 · excerpt ≥8 字符 · 引文门禁逐字核对", 11, "cjk", 296,
         "flow excerpt line")
    parts.append(stext(744, 176, "15 条 · excerpt ≥8 字符 · 引文门禁逐字核对", 11,
                       sub))

    # stage 02: the rule scoreboard ---------------------------------------
    parts.append(stext(44, 204, "02 · 执行", 11, accent, "cjk", bold=True,
                       spacing="1.1"))

    chip_w = (1012 - 4 * 12) / 5
    stamp_colors = {"hit": error, "ran": faint, "na": warn}

    def deck_header(y: float, label: str, count: str, note: str,
                    color: str) -> None:
        parts.append(srect(44, y - 11, 3, 14, 1.5, color))
        parts.append(stext(54, y, label, 12, color, "mono", bold=True,
                           spacing="1.4"))
        parts.append(stext(112, y, f"{count} 条", 11, faint))
        if note:
            parts.append(stext(1056, y, note, 11, faint, anchor="end"))

    def draw_chip(x: float, y: float, rule: tuple[str, str, str, str]) -> None:
        rid, name, sev, outcome = rule
        fg, bg = severity_color(sev, s)
        symbol, color_key, symbol_size = STAMP[outcome]
        stamp_color = stamp_colors[outcome]
        parts.append(srect(x, y, chip_w, 34, 11, card, edge, 1))
        parts.append(srect(x + 1, y + 7, 3, 20, 1.5, fg))
        parts.append(stext(x + 14, y + 22, rid, 13, fg, "mono", bold=True))
        need(name, 13, "cjk", chip_w - 96, f"rule name {rid}")
        parts.append(stext(x + 76, y + 22, name, 13, text))
        parts.append(stext(x + chip_w - 20, y + 23, symbol, symbol_size,
                           stamp_color, "mono", bold=True, anchor="middle"))

    deck_header(220, "ERROR", "10", "全部 direct", error)
    for i in range(5):
        draw_chip(44 + i * (chip_w + 12), 228, RULES[i])
    for i in range(5):
        draw_chip(44 + i * (chip_w + 12), 268, RULES[5 + i])

    deck_header(314, "WARN", "4", "三项 direct · 一项 derived", warn)
    for i in range(4):
        draw_chip(44 + i * (chip_w + 12), 322, RULES[10 + i])

    deck_header(368, "INFO", "1", "", info)
    draw_chip(44, 376, RULES[14])
    parts.append(stext(300, 389, "依据 第八条「出院时间」定义", 11, sub))
    parts.append(stext(300, 404, "推导提示 · 封顶 info · 不作阻断", 11, faint))

    # stage 03 + stamp legend ---------------------------------------------
    parts.append(stext(44, 436, "03 · 归账", 11, accent, "cjk", bold=True,
                       spacing="1.1"))
    parts.append(stext(150, 436, "× 差异 → issues[]", 11, error))
    parts.append(stext(296, 436, "· 已执行 · 无差异", 11, sub))
    parts.append(stext(456, 436, "– 不适用 / 缺列", 11, warn))
    cap_text = "严重级封顶：derived ≤ warn · institutional ≤ info"
    need(cap_text, 11, "cjk", 430, "flow cap line")
    parts.append(stext(1056, 436, cap_text, 11, faint, anchor="end"))

    # ledgers --------------------------------------------------------------
    parts.append(srect(44, 450, 496, 118, 18, card, edge, 1.5, shadow=True))
    parts.append(srect(556, 450, 500, 118, 18, card, edge, 1.5, shadow=True))

    # issues[] ledger
    parts.append(srect(47, 466, 4, 86, 2, error))
    parts.append(stext(64, 478, "issues[]", 14, error, "mono", bold=True))
    iss_chip, _ = schip_right(520, 464, "1 条", 11, error, s["error_bg"])
    parts.append(iss_chip)
    parts.append(stext(64, 504, "MR-001", 12, error, "mono", bold=True))
    err_chip, _ = schip(120, 492, "error", 11, error, s["error_bg"],
                        kind="mono", bold=True, h=20, padx=7)
    parts.append(err_chip)
    parts.append(stext(180, 504, "第 1 行 · 病案号", 11, sub))
    parts.append(stext(64, 530, "「病案号」为空", 13, text))
    basis_line = "依据 附件1 注：必填栏不能为空项"
    need(basis_line, 11, "cjk", 452, "flow issue basis")
    parts.append(stext(64, 554, basis_line, 11, sub))

    # skipped[] ledger
    parts.append(srect(559, 466, 4, 86, 2, sub))
    parts.append(stext(576, 478, "skipped[]", 14, sub, "mono", bold=True))
    skip_chip, _ = schip_right(1036, 464, "14 条", 11, sub, s["info_bg"])
    parts.append(skip_chip)
    parts.append(stext(576, 502, "没进差异清单的规则都在这里，各带原因", 11, sub))
    parts.append(stext(1036, 502, "样例 quickstart", 11, faint, anchor="end"))

    reason1, w1 = schip(576, 512, "缺列 · MR-012", 11, warn, s["warn_bg"])
    reason2, w2 = schip(576 + w1 + 10, 512, "不适用 · MR-015", 11, warn,
                        s["warn_bg"])
    reason3, w3 = schip(576, 538, "已执行 · 无差异 12 条", 11, sub, s["info_bg"])
    reason4, w4 = schip(576 + w3 + 10, 538, "停用 / 范围外（本例无）", 11, faint,
                        s["info_bg"])
    parts += [reason1, reason2, reason3, reason4]
    parts.append(stext(1036, 552, "15 条规则，全部有下落", 11, accent,
                       anchor="end"))

    # stage 04: projection -------------------------------------------------
    parts.append(f'<line x1="44" y1="578" x2="1056" y2="578" stroke="{grid}"/>')
    parts.append(stext(44, 600, "04 · 投影", 11, accent, "cjk", bold=True,
                       spacing="1.1"))
    parts.append(stext(150, 600, "buildView()", 12, accent, "mono", bold=True))
    proj = "→ markdown · reportJson · summary{error,warn,info} · rulesetVersion"
    need(proj, 11, "mono", 560, "flow projection")
    parts.append(stext(256, 600, proj, 11, sub, "mono"))
    parts.append(stext(1056, 600, "措辞守卫 · 交人复核 · 不判合规", 11, accent,
                       anchor="end"))

    # footer ---------------------------------------------------------------
    config = ("config · rulesFile · disabledRules · onlyRules · skipNotes · "
              "timeoutMs")
    need(config, 11, "mono", 640, "flow config")
    parts.append(stext(44, 630, config, 11, faint, "mono"))
    parts.append(stext(1056, 630, "只读 · 不联网 · 不调用模型 · 不写盘", 11,
                       faint, anchor="end"))

    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def write_flows() -> None:
    for skin in ("light", "dark"):
        path = os.path.join(OUT, f"dsh-medrec-qc-flow-v5-{skin}.svg")
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(flow_svg(skin))
        print(f"wrote {os.path.relpath(path, ROOT)}")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    write_heroes()
    write_flows()
    print("done: 4 hero webp + 2 flow-v5 svg")


if __name__ == "__main__":
    main()
