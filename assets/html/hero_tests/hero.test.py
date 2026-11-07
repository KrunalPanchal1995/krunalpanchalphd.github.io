#!/usr/bin/env python3
"""
Playwright checks for the home-page heroes (streamlines, card3d, photo, + switch; fluid has its own fluid.test.py) (assets/html/hero_preview.html).

Run from anywhere:
    cd <site root> && python3 -m http.server 8766 &
    python3 assets/html/hero_tests/hero.test.py
Env: HERO_BASE (default http://localhost:8766), HERO_SHOTS (screenshot dir).
Exit code 0 = all passed.
"""
import io, os, sys, time, hashlib
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

BASE = os.environ.get("HERO_BASE", "http://localhost:8766")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SHOTS = os.environ.get("HERO_SHOTS", "/tmp/hero_shots")
os.makedirs(SHOTS, exist_ok=True)
PAGE = BASE + "/assets/html/hero_preview.html"
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
VIEWS = {"desk": (1440, 900), "phone": (390, 800)}
fails, passes = [], 0


def check(cond, msg):
    global passes
    if cond:
        passes += 1
    else:
        fails.append(msg)
        print("FAIL:", msg)


def lum(rgb):
    def f(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def new_ctx(p, view, reduced=False, scheme="dark"):
    w, h = view
    ctx = p.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce" if reduced else "no-preference")
    pg = ctx.new_page()
    pg.errors, pg.external = [], []
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("request", lambda r: pg.external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith("data:") and not r.url.startswith("blob:") else None)
    return ctx, pg


def goto(pg, query, theme):
    pg.goto(f"{PAGE}?{query}&theme={theme}" if query else f"{PAGE}?theme={theme}")
    pg.wait_for_function("document.querySelector('.hero-switch').dataset.activeHero")
    pg.wait_for_timeout(1200)


def active(pg):
    return pg.evaluate("[...document.querySelectorAll('.hero')].filter(h=>!h.hidden).map(h=>h.dataset.hero)")


def shot_img(pg, sel=None):
    b = (pg.locator(sel).screenshot() if sel else pg.screenshot())
    return Image.open(io.BytesIO(b)).convert("RGB")


def nonblank(img, tol=18):
    a = np.asarray(img).astype(int)
    bg = np.median(a.reshape(-1, 3), axis=0)
    return float((np.abs(a - bg).sum(axis=2) > tol).mean())


def canvas_stats(pg):
    return pg.evaluate("""() => {
      const c = document.querySelector('.hero:not([hidden]) canvas.hero__canvas');
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let n=0,r=0,g=0,b=0;
      for (let i=3;i<d.length;i+=4) if (d[i]>60){n++;r+=d[i-3];g+=d[i-2];b+=d[i-1];}
      return {n, frac:n/(d.length/4), rgb:n?[r/n,g/n,b/n]:[0,0,0], w:c.width, h:c.height};
    }""")


def canvas_hash(pg):
    s = pg.evaluate("document.querySelector('.hero:not([hidden]) canvas.hero__canvas').toDataURL()")
    return hashlib.md5(s.encode()).hexdigest()


def layout_ok(pg, tag, view):
    w, h = view
    ov = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check(ov <= 1, f"{tag}: horizontal overflow {ov}px")
    hh = pg.evaluate("document.querySelector('.hero:not([hidden])').getBoundingClientRect().height")
    lo, hi = (330, 880) if w < 600 else (400, 580)
    check(lo <= hh <= hi, f"{tag}: hero height {hh:.0f} outside {lo}-{hi}")
    name_sel = ".hero:not([hidden]) .hero__name, .hero:not([hidden]) .hero__title"
    check(pg.locator(name_sel).first.is_visible(), f"{tag}: headline not visible")
    return hh


def text_contrast(pg, tag, theme):
    """Computed colour of headline/tagline text vs the solid hero bg token."""
    bg = hexrgb("#0e1116" if theme == "dark" else "#f4f6f8")
    res = pg.evaluate("""() => {
      const out = {};
      for (const [k, s] of [['name','.hero:not([hidden]) .hero__name'],['tag','.hero:not([hidden]) .hero__tagline'],['acc','.hero:not([hidden]) .hero__accent-word']]) {
        const e = document.querySelector(s); if (e) out[k] = getComputedStyle(e).color;
      }
      return out; }""")
    for k, v in res.items():
        rgb = tuple(int(float(x)) for x in v[v.index("(") + 1:v.index(")")].split(",")[:3])
        check(contrast(rgb, bg) >= 4.5, f"{tag}: {k} contrast {contrast(rgb, bg):.2f} < 4.5")


with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)

    # ---------- per theme x viewport ----------
    for theme in ("dark", "light"):
        for vname, view in VIEWS.items():
            # streamlines
            ctx, pg = new_ctx(p.chromium if False else br, view) if False else (None, None)
            ctx = br.new_context(viewport={"width": view[0], "height": view[1]})
            pg = ctx.new_page(); pg.errors = []; pg.external = []
            pg.on("console", lambda m, pg=pg: pg.errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e, pg=pg: pg.errors.append(str(e)))
            pg.on("request", lambda r, pg=pg: pg.external.append(r.url) if not r.url.startswith((BASE, "data:", "blob:")) else None)
            tag = f"streamlines/{theme}/{vname}"
            goto(pg, "hero=streamlines", theme)
            check(active(pg) == ["streamlines"], f"{tag}: active {active(pg)}")
            layout_ok(pg, tag, view); text_contrast(pg, tag, theme)
            st = canvas_stats(pg)
            check(st["frac"] > 0.004, f"{tag}: canvas blank (opaque fraction {st['frac']:.4f})")
            h1 = canvas_hash(pg); pg.wait_for_timeout(500); h2 = canvas_hash(pg)
            check(h1 != h2, f"{tag}: frames identical (not animating)")
            pg.screenshot(path=f"{SHOTS}/streamlines_{theme}_{vname}.png")
            check(not pg.errors, f"{tag}: console errors {pg.errors}")
            check(not pg.external, f"{tag}: external requests {pg.external}")
            # live theme switch re-colours
            other = "light" if theme == "dark" else "dark"
            before = canvas_stats(pg)["rgb"]
            pg.evaluate(f"document.documentElement.dataset.theme='{other}'"); pg.wait_for_timeout(500)
            after = canvas_stats(pg)["rgb"]
            diff = sum(abs(a - b) for a, b in zip(before, after))
            check(diff > 20, f"{tag}: theme switch did not recolour canvas (diff {diff:.1f})")
            ctx.close()

            # card3d
            ctx = br.new_context(viewport={"width": view[0], "height": view[1]})
            pg = ctx.new_page(); pg.errors = []; pg.external = []
            pg.on("console", lambda m, pg=pg: pg.errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e, pg=pg: pg.errors.append(str(e)))
            pg.on("request", lambda r, pg=pg: pg.external.append(r.url) if not r.url.startswith((BASE, "data:", "blob:")) else None)
            tag = f"card3d/{theme}/{vname}"
            goto(pg, "hero=card3d", theme)
            pg.wait_for_function("document.querySelector('[data-hero=card3d]').dataset.heroState", timeout=8000)
            check(active(pg) == ["card3d"], f"{tag}: active {active(pg)}")
            check(pg.evaluate("document.querySelector('[data-hero=card3d]').dataset.heroState") == "running", f"{tag}: not running")
            layout_ok(pg, tag, view); text_contrast(pg, tag, theme)
            a = shot_img(pg, ".hero-card__stage")
            check(nonblank(a) > 0.01, f"{tag}: webgl stage blank ({nonblank(a):.4f})")
            pg.wait_for_timeout(700); b = shot_img(pg, ".hero-card__stage")
            check(np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int)).sum() > 5000, f"{tag}: scene not animating")
            pg.screenshot(path=f"{SHOTS}/card3d_{theme}_{vname}.png")
            check(not pg.errors, f"{tag}: console errors {pg.errors}")
            check(not pg.external, f"{tag}: external requests {pg.external}")
            other = "light" if theme == "dark" else "dark"
            pg.evaluate(f"document.documentElement.dataset.theme='{other}'"); pg.wait_for_timeout(500)
            c = shot_img(pg, ".hero-card")
            check(np.abs(np.asarray(c).astype(int) - np.asarray(shot_img(pg, ".hero-card")).astype(int)).sum() >= 0, "noop")
            m1 = np.asarray(a).reshape(-1, 3).mean(axis=0); m2 = np.asarray(shot_img(pg, ".hero-card__stage")).reshape(-1, 3).mean(axis=0)
            check(np.abs(m1 - m2).sum() > 15, f"{tag}: theme switch did not recolour 3D (mean diff {np.abs(m1-m2).sum():.1f})")
            ctx.close()

            # photo
            ctx = br.new_context(viewport={"width": view[0], "height": view[1]})
            pg = ctx.new_page(); pg.errors = []; pg.external = []
            pg.on("console", lambda m, pg=pg: pg.errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e, pg=pg: pg.errors.append(str(e)))
            pg.on("request", lambda r, pg=pg: pg.external.append(r.url) if not r.url.startswith((BASE, "data:", "blob:")) else None)
            tag = f"photo/{theme}/{vname}"
            goto(pg, "hero=photo", theme)
            check(active(pg) == ["photo"], f"{tag}: active {active(pg)}")
            check(pg.evaluate("document.querySelector('[data-hero=photo]').dataset.heroState") == "ready", f"{tag}: image not ready")
            layout_ok(pg, tag, view)
            im = shot_img(pg, ".hero--photo")
            check(nonblank(im, 40) > 0.02, f"{tag}: photo blank")
            # contrast of title vs. worst-case (brightest) overlay-dimmed pixel of the image
            src = np.asarray(Image.open(os.path.join(ROOT, "assets/img/hero/placeholder_flow.jpg")).convert("RGB")).astype(float).reshape(-1, 3)
            ov = 0.62 if theme == "dark" else 0.58
            dimmed = src * (1 - ov) + np.array([14, 17, 22]) * ov
            worst = tuple(int(v) for v in np.percentile(dimmed, 99.9, axis=0))
            check(contrast(hexrgb("#f2f6fa"), worst) >= 4.5, f"{tag}: title contrast on brightest dimmed pixels {contrast(hexrgb('#f2f6fa'), worst):.2f} < 4.5")
            check(len(pg.locator(".hero--photo .hero__menu a").all()) == 3, f"{tag}: menu items != 3")
            pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
            pg.screenshot(path=f"{SHOTS}/photo_{theme}_{vname}.png")
            check(not pg.errors, f"{tag}: console errors {pg.errors}")
            check(not pg.external, f"{tag}: external requests {pg.external}")
            ctx.close()

    # ---------- reduced motion ----------
    for hero in ("streamlines", "card3d"):
        ctx = br.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        pg = ctx.new_page(); pg.errors = []
        pg.on("console", lambda m, pg=pg: pg.errors.append(m.text) if m.type == "error" else None)
        goto(pg, f"hero={hero}", "dark")
        tag = f"reduced/{hero}"
        if hero == "streamlines":
            check(pg.evaluate("document.querySelector('[data-hero=streamlines]').dataset.heroState") == "static", f"{tag}: not static")
            st = canvas_stats(pg); check(st["frac"] > 0.004, f"{tag}: static frame blank")
            h1 = canvas_hash(pg); pg.wait_for_timeout(600); h2 = canvas_hash(pg)
            check(h1 == h2, f"{tag}: canvas changed under reduced motion")
        else:
            pg.wait_for_function("document.querySelector('[data-hero=card3d]').dataset.heroState")
            a = shot_img(pg, ".hero-card__stage"); pg.wait_for_timeout(600); b = shot_img(pg, ".hero-card__stage")
            check(nonblank(a) > 0.01, f"{tag}: blank")
            check(np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int)).sum() == 0, f"{tag}: animates under reduced motion")
        pg.screenshot(path=f"{SHOTS}/reduced_{hero}.png")
        check(not pg.errors, f"{tag}: console errors {pg.errors}")
        ctx.close()

    # ---------- WebGL unavailable -> fallback image ----------
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page(); pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.add_init_script("const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/.test(t)?null:g.call(this,t,...a)}")
    goto(pg, "hero=card3d", "dark")
    pg.wait_for_function("document.querySelector('[data-hero=card3d]').dataset.heroState")
    check(pg.evaluate("document.querySelector('[data-hero=card3d]').dataset.heroState") == "fallback", "fallback: state != fallback")
    check(pg.locator(".hero-card__fallback").is_visible(), "fallback: image not visible")
    check(pg.evaluate("document.querySelector('.hero-card__fallback').naturalWidth") > 0, "fallback: image failed to load")
    pg.screenshot(path=f"{SHOTS}/card3d_fallback.png")
    check(not pg.errors, f"fallback: errors {pg.errors}")
    ctx.close()

    # ---------- switch: override, picker, localStorage, single animation ----------
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page(); pg.errors = []
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    goto(pg, "", "dark")
    check(active(pg) == ["fluid"], f"switch: default not fluid ({active(pg)})")
    check(pg.locator(".hero-picker").count() == 0, "switch: picker visible without ?heropick=1")
    check(not any("three.module" in u for u in reqs), "switch: three.js loaded though card3d inactive")
    goto(pg, "hero=photo", "dark"); check(active(pg) == ["photo"], "switch: ?hero=photo ignored")
    check(pg.evaluate("localStorage.getItem('hero-choice')") is None, "switch: ?hero= must not write localStorage")
    goto(pg, "hero=bogus", "dark"); check(active(pg) == ["fluid"], "switch: bogus hero not ignored")
    goto(pg, "heropick=1", "dark")
    btns = pg.locator(".hero-picker button")
    check(btns.count() == 4, "switch: picker should have 4 buttons")
    check(pg.locator(".hero-picker").inner_text().replace("\n", " ").startswith("Hero:"), "switch: picker label")
    btns.nth(2).focus(); pg.screenshot(path=f"{SHOTS}/picker_focus.png")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    check(active(pg) == ["card3d"], f"switch: picker click -> {active(pg)}")
    states = pg.evaluate("[...document.querySelectorAll('.hero')].map(h=>h.dataset.hero+':'+(h.dataset.heroState||''))")
    check(sum(1 for s in states if s.split(':')[1] in ('running', 'static')) == 1, f"switch: more than one running {states}")
    check(pg.evaluate("localStorage.getItem('hero-choice')") == "card3d", "switch: choice not remembered")
    pg.locator(".hero-picker button").nth(3).click(); pg.wait_for_timeout(600)
    states = pg.evaluate("[...document.querySelectorAll('.hero')].map(h=>h.dataset.hero+':'+(h.dataset.heroState||''))")
    check(active(pg) == ["photo"] and "card3d:" in states and "streamlines:" in states, f"switch: photo pick / teardown {states}")
    pg.locator(".hero-picker button").nth(1).click(); pg.wait_for_timeout(600)
    check(active(pg) == ["streamlines"], "switch: back to streamlines")
    pg.screenshot(path=f"{SHOTS}/picker_streamlines.png")
    pg.goto(PAGE + "?theme=dark"); pg.wait_for_function("document.querySelector('.hero-switch').dataset.activeHero"); pg.wait_for_timeout(300)
    check(active(pg) == ["streamlines"], "switch: remembered streamlines on reload")
    pg.evaluate("localStorage.setItem('hero-choice','photo')")
    pg.goto(PAGE + "?theme=dark"); pg.wait_for_function("document.querySelector('.hero-switch').dataset.activeHero"); pg.wait_for_timeout(300)
    check(active(pg) == ["photo"], "switch: remembered pick not applied on reload")
    goto(pg, "hero=card3d", "dark"); check(active(pg) == ["card3d"], "switch: query should beat localStorage")
    pg.goto(PAGE + "?hero=reset&theme=dark"); pg.wait_for_timeout(500)
    check(pg.evaluate("localStorage.getItem('hero-choice')") is None and active(pg) == ["fluid"], "switch: ?hero=reset")
    # rapid switching stress: no errors, one hero live
    goto(pg, "heropick=1", "dark")
    for i in (1, 2, 0, 3, 1, 0, 2, 1, 3):
        pg.locator(".hero-picker button").nth(i).click()
    pg.wait_for_timeout(1500)
    check(len(active(pg)) == 1, "switch: rapid switching left >1 visible")
    check(not pg.errors, f"switch: console errors {pg.errors}")
    ctx.close()
    br.close()

print(f"\n{passes} checks passed, {len(fails)} failed. Screenshots: {SHOTS}")
sys.exit(1 if fails else 0)
