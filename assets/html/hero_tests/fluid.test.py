#!/usr/bin/env python3
"""
Playwright checks for the WebGL2 fluid hero (assets/js/hero/fluid.js) on assets/html/hero_preview.html.

    cd <site root> && python3 -m http.server 8854 &
    HERO_BASE=http://localhost:8854 python3 assets/html/hero_tests/fluid.test.py
Env: HERO_BASE (default http://localhost:8854), HERO_SHOTS (screenshot dir).
Runs on software GL (SwiftShader): the adaptive quality controller is expected to land on a low tier;
deterministic checks force a tier with ?fluidtier=N&fluidadapt=0 and step the solver through api.debug.
Exit code 0 = all passed.
"""
import io, os, sys, json
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

BASE = os.environ.get("HERO_BASE", "http://localhost:8854")
SHOTS = os.environ.get("HERO_SHOTS", "/tmp/fluid_shots")
os.makedirs(SHOTS, exist_ok=True)
PAGE = BASE + "/assets/html/hero_preview.html"
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
VIEWS = {"desk": (1440, 900), "phone": (390, 800)}
FL = "document.querySelector('[data-hero=fluid]')"
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
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def parse_rgb(v):
    return tuple(int(float(x)) for x in v[v.index("(") + 1:v.index(")")].split(",")[:3])


def ctx_page(br, view, reduced=False):
    ctx = br.new_context(viewport={"width": view[0], "height": view[1]}, reduced_motion="reduce" if reduced else "no-preference")
    pg = ctx.new_page()
    pg.errors, pg.external = [], []
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("request", lambda r: pg.external.append(r.url) if not r.url.startswith((BASE, "data:", "blob:")) else None)
    return ctx, pg


def open_page(pg, query, theme, wait_api=True):
    pg.goto(f"{PAGE}?theme={theme}" + (f"&{query}" if query else ""))
    pg.wait_for_function("document.querySelector('.hero-switch').dataset.activeHero")
    if wait_api:
        pg.wait_for_function(f"{FL}.__fluid || {FL}.dataset.fluidFallback", timeout=15000)


def shot(pg, sel=".hero--fluid"):
    # software GL can starve the compositor; retry instead of failing on Playwright's stability wait
    for attempt in range(4):
        try:
            return Image.open(io.BytesIO(pg.locator(sel).screenshot(timeout=60000))).convert("RGB")
        except Exception:
            if attempt == 3:
                raise
            pg.wait_for_timeout(2500)


def diff(a, b):
    return float(np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int)).sum())


def bgpix(img, tol=20):
    a = np.asarray(img).astype(int)
    bg = np.median(a.reshape(-1, 3), axis=0)
    return float((np.abs(a - bg).sum(axis=2) > tol).mean())


def ev(pg, js):
    return pg.evaluate(js)


def api(pg, expr):
    return pg.evaluate(f"{FL}.__fluid.{expr}")


def developed(pg, tier=1, steps=420):
    """pause the loop, fast-forward the solver and draw one frame (deterministic)"""
    api(pg, "pause()")
    api(pg, f"debug.step({steps})")
    pg.wait_for_timeout(150)


def text_contrast(pg, theme, view, tag):
    """headline/tagline/accent colours vs the RENDERED pixels behind them (text hidden)."""
    pg.add_style_tag(content=".hero--fluid .hero__name,.hero--fluid .hero__tagline,.hero--fluid .hero__cta{color:transparent !important;border-color:transparent !important}.hero--fluid .hero__accent-word{color:transparent !important}")
    pg.wait_for_timeout(100)
    hero = pg.locator(".hero--fluid")
    box = hero.bounding_box()
    img = shot(pg)
    a = np.asarray(img).astype(float)
    info = pg.evaluate("""() => {
      const h = document.querySelector('.hero--fluid'), hr = h.getBoundingClientRect(), out = {};
      for (const [k, s] of [['name','.hero__name'],['tag','.hero__tagline'],['acc','.hero__accent-word']]) {
        const e = h.querySelector(s); if (!e) continue;
        const r = document.createRange(); r.selectNodeContents(e);
        const b = r.getBoundingClientRect();
        out[k] = {x:b.left-hr.left, y:b.top-hr.top, w:b.width, h:b.height};
      }
      return out; }""")
    # intended text colours (computed before the override) = the hero tokens
    cols = {
        "name": (0xe4, 0xea, 0xf0) if theme == "dark" else (0x17, 0x20, 0x2b),
        "tag": (0x93, 0xa1, 0xb0) if theme == "dark" else (0x4f, 0x5b, 0x69),
        "acc": (0x2d, 0xd4, 0xbf) if theme == "dark" else (0x0a, 0x7a, 0x6e),
    }
    worst = 99
    for k, r in info.items():
        x0, y0, x1, y1 = int(r["x"]), int(r["y"]), int(r["x"] + r["w"]), int(r["y"] + r["h"])
        reg = a[max(0, y0):y1, max(0, x0):x1].reshape(-1, 3)
        if not len(reg):
            continue
        # dark theme: brightest backdrop pixels are the worst case; light: darkest ones
        L = 0.2126 * reg[:, 0] + 0.7152 * reg[:, 1] + 0.0722 * reg[:, 2]
        idx = np.argsort(L)
        pick = reg[idx[int(len(idx) * 0.995) - 1]] if theme == "dark" else reg[idx[int(len(idx) * 0.005)]]
        c = contrast(cols[k], tuple(pick))
        worst = min(worst, c)
        check(c >= 4.5, f"{tag}: {k} contrast vs rendered pixels {c:.2f} < 4.5")
    print(f"   {tag}: worst text contrast vs rendered pixels {worst:.2f}")


with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    results = {}

    # ---------- default hero + animation + adaptive tier (natural run, no forcing) ----------
    for theme in ("dark", "light"):
        for vname, view in VIEWS.items():
            tag = f"fluid/{theme}/{vname}"
            ctx, pg = ctx_page(br, view)
            open_page(pg, "", theme)
            check(pg.evaluate("[...document.querySelectorAll('.hero')].filter(h=>!h.hidden).map(h=>h.dataset.hero)") == ["fluid"], f"{tag}: default hero is not fluid")
            pg.wait_for_timeout(6000)
            a = shot(pg); pg.wait_for_timeout(1500); b = shot(pg)
            check(bgpix(a) > 0.004, f"{tag}: canvas looks blank ({bgpix(a):.4f})")
            check(diff(a, b) > 3000, f"{tag}: two frames identical (not animating) diff={diff(a, b):.0f}")
            st = api(pg, "stats()")
            results[tag] = {"tier": st["tier"], "base": st["baseTier"], "ms": st["ms"], "medians": st["medians"], "history": st["tierHistory"], "grid": st["grid"]}
            print(f"   {tag}: {json.dumps(results[tag])}")
            check(st["errors"] == 0, f"{tag}: solver errors {st['errors']}")
            check(api(pg, "debug.gl.getError()") == 0, f"{tag}: GL error present")
            pg.screenshot(path=f"{SHOTS}/natural_{theme}_{vname}.png", timeout=180000)
            check(not pg.errors, f"{tag}: console errors {pg.errors}")
            check(not pg.external, f"{tag}: external requests {pg.external}")
            ctx.close()

    # ---------- deterministic checks at a forced tier ----------
    for theme in ("dark", "light"):
        for vname, view in VIEWS.items():
            tier = 1 if vname == "desk" else 2
            tag = f"fluid-det/{theme}/{vname}/tier{tier}"
            ctx, pg = ctx_page(br, view)
            open_page(pg, f"fluidtier={tier}&fluidadapt=0", theme)
            check(api(pg, "tier") == tier, f"{tag}: forced tier not applied")
            developed(pg)
            pg.screenshot(path=f"{SHOTS}/dev_{theme}_{vname}.png", clip={"x": 0, "y": 0, "width": view[0], "height": min(view[1], 640)}, timeout=180000)
            img = shot(pg)
            check(bgpix(img) > 0.004, f"{tag}: developed field blank")

            # Karman street: v_y behind the cylinder alternates in sign over time
            g = api(pg, "debug.geo()")
            vy = []
            for _ in range(60):
                api(pg, "debug.step(3)")
                vy.append(pg.evaluate(f"{FL}.__fluid.debug.sampleVelocity({g['cyl'][0] + 2.2 * g['r'] / (view[0] / pg.locator('.hero--fluid').bounding_box()['height'])},{g['cyl'][1]})")[1])
            sgn = np.sign(np.array(vy)[np.abs(vy) > 0.03])
            flips = int((np.diff(sgn) != 0).sum())
            check(flips >= 3, f"{tag}: no alternating wake (v_y sign flips {flips}, std {np.std(vy):.3f})")
            check(np.std(vy) > (0.05 if vname == 'desk' else 0.03), f"{tag}: wake too weak (v_y std {np.std(vy):.3f})")
            u_up = pg.evaluate(f"{FL}.__fluid.debug.sampleVelocity({g['cyl'][0] - 0.12},{g['cyl'][1]})")[0]
            check(u_up > 0.1, f"{tag}: no free stream upstream of the cylinder (u={u_up:.2f})")
            inside = pg.evaluate(f"{FL}.__fluid.debug.sampleVelocity({g['cyl'][0]},{g['cyl'][1]})")
            check(abs(inside[0]) + abs(inside[1]) < 1e-3, f"{tag}: velocity inside the obstacle {inside}")

            # pointer splat changes the field
            r = pg.locator(".hero--fluid").bounding_box()
            px, py = r["x"] + r["width"] * 0.55, r["y"] + r["height"] * 0.7
            before = pg.evaluate(f"{FL}.__fluid.debug.sampleVelocity(0.55,0.3)")
            pg.mouse.move(px - 80, py); pg.mouse.move(px, py, steps=4); pg.mouse.move(px + 60, py - 40, steps=3)
            api(pg, "debug.step(2)")
            after = pg.evaluate(f"{FL}.__fluid.debug.sampleVelocity(0.55,0.3)")
            check(abs(after[0] - before[0]) + abs(after[1] - before[1]) > 0.05, f"{tag}: pointer did not change the field {before}->{after}")

            # scroll forcing
            pg.evaluate("window.scrollTo(0,0)")
            g0 = api(pg, "stats()")["gust"]
            pg.mouse.wheel(0, 900); pg.wait_for_timeout(200)
            g1 = api(pg, "stats()")["gust"]
            check(abs(g1[1]) > 0.2 and abs(g1[1]) > abs(g0[1]), f"{tag}: scroll did not force the flow {g0}->{g1}")
            pg.evaluate("window.scrollTo(0,0)")

            # click burst raises temperature (changes the picture)
            a = shot(pg)
            pg.mouse.click(r["x"] + r["width"] * 0.5, r["y"] + r["height"] * 0.8)
            api(pg, "debug.step(6)")
            b = shot(pg)
            check(diff(a, b) > 3000, f"{tag}: click burst invisible")

            text_contrast(pg, theme, view, tag)
            check(not pg.errors, f"{tag}: console errors {pg.errors}")
            check(not pg.external, f"{tag}: external requests {pg.external}")
            ctx.close()

    # ---------- theme switch re-colours (running, live) ----------
    ctx, pg = ctx_page(br, VIEWS["desk"])
    open_page(pg, "fluidtier=2&fluidadapt=0", "dark")
    developed(pg)
    a = np.asarray(shot(pg)).reshape(-1, 3).mean(axis=0)
    pg.evaluate("document.documentElement.dataset.theme='light'"); pg.wait_for_timeout(500)
    b = np.asarray(shot(pg)).reshape(-1, 3).mean(axis=0)
    check(np.abs(a - b).sum() > 100, f"theme switch did not recolour fluid ({a}->{b})")
    check(b.mean() > a.mean(), "light theme should be lighter than dark")
    ctx.close()

    # ---------- reduced motion: warm up, one static frame ----------
    ctx, pg = ctx_page(br, VIEWS["desk"], reduced=True)
    open_page(pg, "", "dark")
    pg.wait_for_function(f"{FL}.dataset.fluidReady === '1'", timeout=90000)
    check(ev(pg, f"{FL}.dataset.heroState") == "static", "reduced: state not static")
    a = shot(pg); pg.wait_for_timeout(1200); b = shot(pg)
    check(diff(a, b) == 0, f"reduced: canvas changed ({diff(a, b):.0f})")
    check(bgpix(a) > 0.004, "reduced: static frame blank")
    pg.screenshot(path=f"{SHOTS}/reduced.png", timeout=180000)
    check(not pg.errors, f"reduced: console errors {pg.errors}")
    ctx.close()

    # ---------- data-fx=off: cheapest tier, static after warm-up ----------
    ctx, pg = ctx_page(br, VIEWS["desk"])
    pg.add_init_script("new MutationObserver((m,o)=>{if(document.documentElement){document.documentElement.dataset.fx='off';o.disconnect()}}).observe(document,{childList:true})")
    open_page(pg, "", "dark")
    pg.wait_for_function(f"{FL}.dataset.fluidReady === '1'", timeout=90000)
    check(api(pg, "tier") == 3 and ev(pg, f"{FL}.dataset.heroState") == "static", "fx off: not cheapest/static")
    ctx.close()

    # ---------- ?nowebgl=1 and missing WebGL2 -> streamlines fallback ----------
    for how in ("query", "nogl"):
        ctx, pg = ctx_page(br, VIEWS["desk"])
        if how == "nogl":
            pg.add_init_script("const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl2'||t==='webgl'?null:g.call(this,t,...a)}")
        open_page(pg, "nowebgl=1" if how == "query" else "", "dark")
        tag = f"fallback/{how}"
        check(ev(pg, f"{FL}.dataset.fluidFallback") == "1", f"{tag}: fallback flag missing")
        pg.wait_for_timeout(1200)
        check(ev(pg, f"{FL}.dataset.heroState") == "running", f"{tag}: streamlines not running")
        h = lambda: pg.evaluate(f"{FL}.querySelector('canvas').getContext('2d').getImageData(0,0,200,200).data.reduce((s,v)=>s+v,0)")
        h1 = h(); pg.wait_for_timeout(600); h2 = h()
        check(h1 > 0 and h1 != h2, f"{tag}: streamlines canvas not drawing/animating")
        pg.screenshot(path=f"{SHOTS}/fallback_{how}.png", timeout=180000)
        check(not pg.errors, f"{tag}: console errors {pg.errors}")
        ctx.close()

    # ---------- destroy: no GL errors, re-mount works, no leak of two running heroes ----------
    ctx, pg = ctx_page(br, VIEWS["desk"])
    open_page(pg, "heropick=1&fluidtier=3&fluidadapt=0", "dark")
    pg.wait_for_timeout(800)
    errs = pg.evaluate(f"""() => {{ const a = {FL}.__fluid; const gl = a.debug.gl; const e0 = gl.getError(); a.destroy(); return [e0, a.destroyError]; }}""")
    check(errs == [0, 0], f"destroy: GL errors before/after {errs}")
    check(ev(pg, f"{FL}.__fluid === undefined && !{FL}.dataset.heroState"), "destroy: state not cleaned")
    pg.wait_for_timeout(300)
    # picker round trip: fluid -> streamlines -> fluid (fresh canvas, fresh context)
    pg.locator(".hero-picker button").nth(1).click(); pg.wait_for_timeout(800)
    pg.locator(".hero-picker button").nth(0).click()
    pg.wait_for_function(f"{FL}.__fluid", timeout=15000)
    pg.wait_for_timeout(800)
    check(api(pg, "debug.gl.getError()") == 0, "re-mount: GL error")
    states = pg.evaluate("[...document.querySelectorAll('.hero')].map(h=>h.dataset.hero+':'+(h.dataset.heroState||''))")
    check(sum(1 for s_ in states if s_.split(':')[1] in ("running", "static")) == 1, f"more than one hero running {states}")
    check(not pg.errors, f"destroy: console errors {pg.errors}")
    ctx.close()

    # ---------- offscreen pause ----------
    ctx, pg = ctx_page(br, VIEWS["desk"])
    open_page(pg, "fluidtier=3&fluidadapt=0", "dark")
    pg.evaluate("window.scrollTo(0, 1500)"); pg.wait_for_timeout(700)
    check(not api(pg, "running"), "offscreen: still running")
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(700)
    check(api(pg, "running"), "back on screen: not running")
    ctx.close()

    # ---------- home-live strip ----------
    ctx, pg = ctx_page(br, VIEWS["phone"])
    open_page(pg, "nowebgl=1", "light")
    check(pg.evaluate("!document.querySelector('#home-live-playground').getAttribute('src')"), "home-live: below-the-fold playground iframe loaded before scrolling in")
    pg.locator("[data-home-live]").scroll_into_view_if_needed(); pg.wait_for_timeout(1500)
    check(pg.evaluate("[...document.querySelectorAll('[data-live-plate] iframe')].every(f=>f.getAttribute('src'))"), "home-live: iframes not lazy-loaded on scroll")
    check(pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1, "home-live: horizontal overflow on phone")
    cols = pg.evaluate("new Set([...document.querySelectorAll('.home-live__plate')].map(p=>Math.round(p.getBoundingClientRect().left))).size")
    check(cols == 1, f"home-live: not one column on phone ({cols})")
    pg.screenshot(path=f"{SHOTS}/homelive_phone_light.png", full_page=False, timeout=180000)
    ctx.close()
    ctx, pg = ctx_page(br, VIEWS["desk"])
    open_page(pg, "nowebgl=1", "dark")
    pg.locator("[data-home-live]").scroll_into_view_if_needed(); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{SHOTS}/homelive_desk_dark.png", timeout=180000)
    check(not pg.errors, f"home-live: console errors {pg.errors}")
    ctx.close()

    br.close()

print("\nTier results (SwiftShader, NOT a real GPU):")
for k, v in results.items():
    print("  ", k, v)
print(f"\n{passes} checks passed, {len(fails)} failed. Screenshots: {SHOTS}")
sys.exit(1 if fails else 0)
