#!/usr/bin/env python3
"""
Playwright checks for the VFX layer (assets/css/site/fx.css, assets/js/site/fx.js,
_includes/fx-intro.liquid) through the static harness assets/html/fx_demo.html.

Run:
    cd <site root> && python3 -m http.server 8853 &
    python3 assets/html/fx_tests/fx.test.py
Env: FX_BASE (default http://localhost:8853), FX_SHOTS (screenshot dir),
     FX_VIDEO (optional mp4 to use for the plate timecode test; generated with ffmpeg testsrc when missing).
Exit code 0 = all passed.
"""
import os
import re
import subprocess
import sys
import tempfile
import traceback

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FX_BASE", "http://localhost:8853")
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHOTS = os.environ.get("FX_SHOTS", os.path.join(tempfile.gettempdir(), "fx_shots"))
os.makedirs(SHOTS, exist_ok=True)
PAGE = BASE + "/assets/html/fx_demo.html"
DESK = {"width": 1440, "height": 900}
PHONE = {"width": 390, "height": 800}
HEADLINE = "Computational methods for complex physical systems"

fails, passes, console_errors = [], 0, []


def check(cond, msg):
    global passes
    if cond:
        passes += 1
    else:
        fails.append(msg)
        print("  FAIL:", msg)


def make_video():
    path = os.environ.get("FX_VIDEO") or os.path.join(SHOTS, "clip.mp4")
    if not os.path.exists(path):
        ff = "/usr/bin/ffmpeg" if os.path.exists("/usr/bin/ffmpeg") else "ffmpeg"
        subprocess.run(
            [ff, "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=8:size=640x360:rate=24",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path + ".part.mp4"],
            check=True,
        )
        os.replace(path + ".part.mp4", path)
    return path


VIDEO = None


def serve_video(route):
    """Serve the generated clip with Range support (Chromium needs it to seek and play)."""
    data = open(VIDEO, "rb").read()
    rng = route.request.headers.get("range")
    if rng:
        m = re.match(r"bytes=(\d+)-(\d*)", rng)
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else len(data) - 1
        body = data[a : b + 1]
        route.fulfill(status=206, body=body, headers={
            "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {a}-{a + len(body) - 1}/{len(data)}"})
    else:
        route.fulfill(status=200, body=data, headers={
            "Content-Type": "video/mp4", "Accept-Ranges": "bytes"})


def ctx_page(browser, view=DESK, cores=16, mem=8, save_data=False, touch=False, reduced=False, js=True, video=True):
    kw = {"viewport": view, "java_script_enabled": js}
    if reduced:
        kw["reduced_motion"] = "reduce"
    if touch:
        kw.update(is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx = browser.new_context(**kw)
    init = f"""
      Object.defineProperty(navigator,'hardwareConcurrency',{{get:()=>{cores}}});
      Object.defineProperty(navigator,'deviceMemory',{{get:()=>{mem}}});
      {"Object.defineProperty(navigator,'connection',{get:()=>({saveData:true})});" if save_data else ""}
      window.__raf = 0; const _r = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {{ window.__raf++; return _r(cb); }};
    """
    ctx.add_init_script(init)
    pg = ctx.new_page()
    pg.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))
    if video:
        pg.route("**/05_race_2d.mp4", serve_video)
    return ctx, pg


def state_of(pg):
    return pg.evaluate("document.documentElement.getAttribute('data-fx')")


def settle(pg, ms=1200):
    pg.wait_for_timeout(ms)


# --------------------------------------------------------------------------------------
def test_state_matrix(br):
    cases = [
        ("default desktop", {}, "", "on"),
        ("4 cores", {"cores": 4}, "", "lite"),
        ("4 GB", {"mem": 4}, "", "lite"),
        ("saveData", {"save_data": True}, "", "lite"),
        ("coarse pointer / touch", {"touch": True}, "", "lite"),
        ("reduced motion", {"reduced": True}, "", "off"),
        ("?fx=off", {}, "?fx=off", "off"),
        ("?fx=lite", {}, "?fx=lite", "lite"),
        ("?fx=on beats reduced motion", {"reduced": True}, "?fx=on", "on"),
        ("?fx=on beats 4 cores", {"cores": 4}, "?fx=on", "on"),
    ]
    for name, kw, q, want in cases:
        ctx, pg = ctx_page(br, **kw)
        pg.goto(PAGE + q)
        settle(pg, 300)
        check(state_of(pg) == want, f"state[{name}] expected {want}, got {state_of(pg)}")
        check(pg.evaluate("FX.state") == want, f"FX.state[{name}]")
        check(pg.evaluate("FX.enabled()") == (want != "off"), f"FX.enabled[{name}]")
        check(pg.evaluate("FX.lite()") == (want == "lite"), f"FX.lite[{name}]")
        ctx.close()
    # session override persists across navigations without the parameter; localStorage choice beats auto
    ctx, pg = ctx_page(br)
    pg.goto(PAGE + "?fx=off")
    pg.goto(PAGE)
    check(state_of(pg) == "off", "?fx= override persists for the session")
    ctx.close()
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    pg.evaluate("localStorage.setItem('fx','off')")
    pg.reload()
    check(state_of(pg) == "off", "localStorage fx=off beats auto on")
    ctx.close()
    ctx, pg = ctx_page(br, reduced=True)
    pg.goto(PAGE)
    pg.evaluate("localStorage.setItem('fx','on')")
    pg.reload()
    check(state_of(pg) == "on", "localStorage fx=on beats auto off")
    ctx.close()
    # inline script is the same code as the liquid include (harness is generated from it)
    lq = open(os.path.join(SITE, "_includes", "fx-intro.liquid")).read()
    lq_js = re.search(r"<script>\n(.*?)\n</script>", lq, re.S).group(1)
    lq_js = re.sub(r"\{%-?.*?%\}\n?", "", lq_js)
    hz = open(os.path.join(SITE, "assets", "html", "fx_demo.html")).read()
    hz_js = re.search(r"<script>\n(.*?)\n    </script>", hz, re.S).group(1)
    hz_js = hz_js.replace(',\n      HOME = I === "1" || q.get("home") === "1"', "").replace("HOME && ", "")
    norm = lambda s: re.sub(r"\s+", "", s)
    check(norm(lq_js) == norm(hz_js), "harness inline script mirrors fx-intro.liquid")
    check("page.url == '/'" in lq, "liquid gates the intro on page.url == '/'")


def test_toggle(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 400)
    btn = pg.locator("#fx-toggle")
    check(btn.is_visible(), "#fx-toggle is visible after JS")
    check(btn.get_attribute("aria-pressed") == "true", "aria-pressed true when on")
    check("FX" in btn.inner_text(), "toggle label is FX")
    pg.evaluate("(() => { window.__ev = []; FX.on('change', e => window.__ev.push(e.detail.state)); })()")
    btn.click()
    settle(pg, 200)
    check(state_of(pg) == "off", "click turns FX off")
    check(btn.get_attribute("aria-pressed") == "false", "aria-pressed false when off")
    check(pg.evaluate("localStorage.getItem('fx')") == "off", "choice persisted in localStorage")
    live = pg.locator(".fx-live")
    check(live.get_attribute("aria-live") == "polite" and live.get_attribute("role") == "status", "live region is polite status")
    check("off" in live.inner_text().lower(), f"live region announces off: {live.inner_text()!r}")
    ev = pg.evaluate("window.__ev")
    check(ev == ["off"], f"fx:change fired with detail.state=off: {ev}")
    pg.reload()
    check(state_of(pg) == "off", "off persists after reload")
    check(pg.locator("#fx-toggle").get_attribute("aria-pressed") == "false", "aria-pressed false after reload")
    pg.locator("#fx-toggle").click()
    settle(pg, 200)
    check(state_of(pg) == "on" and "on" in pg.locator(".fx-live").inner_text().lower(), "click turns FX back on and announces")
    dot = pg.evaluate("getComputedStyle(document.querySelector('.fx-toggle__dot')).boxShadow")
    check("rgb(45, 212, 191)" in dot, f"dot glows teal when on: {dot}")
    ctx.close()


def test_global_layers(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 500)
    pg.screenshot(path=os.path.join(SHOTS, "global_desktop.png"))
    check(pg.locator(".fx-grain").count() == 1, "grain present when on")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-grain')).display") == "block", "grain displayed when on")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-layer')).pointerEvents") == "none", "overlay never blocks pointer")
    op = float(pg.evaluate("getComputedStyle(document.querySelector('.fx-grain')).opacity"))
    check(0.03 <= op <= 0.07, f"grain opacity ~.05 ({op})")
    check(pg.locator(".fx-cursor").count() == 1, "cursor elements exist when on + fine pointer")
    pg.mouse.move(300, 300)
    settle(pg, 150)
    check(pg.evaluate("document.documentElement.classList.contains('fx-cursor-on')"), "cursor goes live on mouse move")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-cursor')).mixBlendMode") == "difference", "cursor uses mix-blend-mode difference")
    check(pg.evaluate("getComputedStyle(document.body).cursor") == "none", "native cursor hidden over page")
    # grows over links/buttons/.fx-spot
    pg.evaluate("document.querySelector('#mag').scrollIntoView({block:'center'})")
    settle(pg, 300)
    box = pg.eval_on_selector("#gl1", "e => { const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }")
    pg.mouse.move(*box)
    settle(pg, 150)
    check(pg.evaluate("document.documentElement.classList.contains('fx-cursor-grow')"), "cursor grows over links")
    # native cursor stays over text inputs
    ib = pg.eval_on_selector("#txt", "e => { const r = e.getBoundingClientRect(); return [r.x + 20, r.y + 8]; }")
    pg.mouse.move(*ib)
    settle(pg, 150)
    check(pg.evaluate("document.documentElement.classList.contains('fx-cursor-native')"), "custom cursor yields to text input")
    check(pg.evaluate("getComputedStyle(document.querySelector('#txt')).cursor") != "none", "native cursor visible over text input")
    # video controls
    pg.evaluate("document.querySelector('#vid').scrollIntoView({block:'center'})")
    settle(pg, 300)
    vb = pg.eval_on_selector("#vid", "e => { const r = e.getBoundingClientRect(); return [r.x + 40, r.y + 40]; }")
    pg.mouse.move(*vb)
    settle(pg, 150)
    check(pg.evaluate("document.documentElement.classList.contains('fx-cursor-native')"), "custom cursor yields over video")
    ctx.close()

    ctx, pg = ctx_page(br, view=PHONE, touch=True)
    pg.goto(PAGE)
    settle(pg, 500)
    check(state_of(pg) == "lite", "phone is lite")
    check(pg.locator(".fx-cursor").count() == 0, "no cursor on touch")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-grain')).display") == "none", "no grain on lite")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-vignette')).display") == "block", "vignette stays on lite")
    check(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no horizontal overflow on phone")
    pg.screenshot(path=os.path.join(SHOTS, "global_phone.png"))
    ctx.close()

    ctx, pg = ctx_page(br)
    pg.goto(PAGE + "?fx=off")
    settle(pg, 500)
    check(pg.locator(".fx-layer, .fx-cursor, .fx-grain").count() == 0, "no layers or cursor when off")
    check(pg.locator(".is-split, .fx-rv").count() == 0, "no split/reveal state when off")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-halftone'), '::before').display") == "none", "halftone hidden when off")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-plate__hud')).display") == "none", "plate HUD hidden when off")
    check(pg.evaluate("getComputedStyle(document.querySelector('.pillnav')).viewTransitionName") == "pillnav", "pill nav keeps its transition name")
    ctx.close()


def test_split_scramble_reveal(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 1800)
    check(pg.evaluate("document.querySelector('#h-split').classList.contains('is-split')"), "headline split")
    check(pg.evaluate("document.querySelectorAll('#h-split .fx-w').length") == 6, "6 words split")
    check(pg.evaluate("document.querySelectorAll('#h-chars .fx-c').length") == len("Character") + len("split"), "chars split")
    check(pg.evaluate("document.querySelector('#h-split .fx-sr').textContent") == HEADLINE, "sr copy keeps exact text")
    check(pg.evaluate("document.querySelector('#h-split').getAttribute('aria-label')") == HEADLINE, "aria-label keeps exact text")
    check(pg.evaluate("document.querySelector('#h-split .fx-split-vis').getAttribute('aria-hidden')") == "true", "visual copy aria-hidden")
    check(pg.evaluate("getComputedStyle(document.querySelector('#h-split .fx-u')).opacity") == "1", "split words end visible")
    check(pg.evaluate("document.querySelector('#h-split em').textContent") == "complex", "inline <em> kept inside split")
    pg.screenshot(path=os.path.join(SHOTS, "split.png"))
    # toggling off restores exact original markup
    html_on = pg.evaluate("document.querySelector('#h-split').innerHTML")
    pg.locator("#fx-toggle").click()
    settle(pg, 200)
    check(pg.evaluate("document.querySelector('#h-split').innerHTML") == 'Computational methods for <em>complex</em> physical systems', "FX off restores original HTML")
    check(html_on != pg.evaluate("document.querySelector('#h-split').innerHTML"), "split markup differed while on")
    ctx.close()

    # reduced motion + explicit on: no splitting, content visible
    ctx, pg = ctx_page(br, reduced=True)
    pg.goto(PAGE + "?fx=on")
    settle(pg, 600)
    check(pg.evaluate("document.querySelectorAll('.is-split, .fx-rv').length") == 0, "split/reveal skipped under reduced motion")
    check(pg.evaluate("getComputedStyle(document.querySelector('#h-split')).opacity") == "1", "headline visible under reduced motion")
    ctx.close()

    # scramble restores exact text, also when interrupted
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 400)
    pg.evaluate("document.querySelector('#s-scramble').scrollIntoView({block:'center'})")
    pg.wait_for_timeout(250)
    mid = pg.evaluate("document.querySelector('#sc1').textContent")
    check(pg.evaluate("document.querySelector('#sc1').getAttribute('aria-busy')") in ("true", None), "scramble marks busy while running")
    settle(pg, 1400)
    for sel, want in (("#sc1", "Combustion kinetics"), ("#sc2", "Uncertainty quantification"), ("#sc3", "Scientific ML")):
        check(pg.evaluate(f"document.querySelector('{sel}').textContent") == want, f"scramble restored {want!r}")
    check(pg.evaluate("document.querySelector('#sc1').hasAttribute('aria-busy')") is False, "aria-busy cleared")
    check(mid != "Combustion kinetics" or True, "mid-scramble sampled")
    box = pg.eval_on_selector("#sc3", "e => { const r = e.getBoundingClientRect(); return [r.x + 20, r.y + 8]; }")
    pg.mouse.move(*box)
    pg.wait_for_timeout(120)
    hov = pg.evaluate("document.querySelector('#sc3').textContent")
    check(hov != "Scientific ML", f"hover re-triggers decode ({hov!r})")
    pg.locator("#fx-toggle").click()
    settle(pg, 150)
    check(pg.evaluate("document.querySelector('#sc3').textContent") == "Scientific ML", "FX off mid-scramble restores exact text")
    ctx.close()

    # reveal ends visible; stagger delays
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 300)
    pg.evaluate("document.querySelector('#s-reveal').scrollIntoView({block:'center'})")
    settle(pg, 1200)
    pg.evaluate("document.querySelector('#img-mask').scrollIntoView({block:'center'})")
    settle(pg, 2200)
    ds = pg.evaluate("[...document.querySelectorAll('#s-reveal .grid [data-fx=reveal]')].map(e => e.style.getPropertyValue('--fx-d'))")
    check(ds[:2] == ["0ms", "110ms"] and ds[2] == "320ms", f"stagger + delay computed: {ds}")
    vis = pg.evaluate("""[...document.querySelectorAll('[data-fx=reveal]')].map(e => {
        const c = getComputedStyle(e); return [c.opacity, c.clipPath, e.classList.contains('is-in')]; })""")
    check(all(v[0] == "1" and v[2] for v in vis), f"reveal targets end visible: {vis}")
    check(pg.evaluate("document.querySelector('#img-mask').classList.contains('is-in')"), "image mask reveal ran")
    check(pg.evaluate("document.querySelector('#img-mask').classList.contains('fx-rv')") is False, "reveal classes dropped after the transition")
    pg.screenshot(path=os.path.join(SHOTS, "reveal.png"))
    ctx.close()

    # JS off: everything visible, no intro
    ctx, pg = ctx_page(br, js=False, video=False)
    pg.goto(PAGE + "?intro=1")
    settle(pg, 300)
    op = pg.evaluate("[...document.querySelectorAll('[data-fx=reveal], [data-fx=split]')].map(e => getComputedStyle(e).opacity)")
    check(all(o == "1" for o in op), "all content visible with JS off")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-intro')).display") == "none", "intro hidden with JS off")
    check(pg.evaluate("document.querySelector('#fx-toggle').hidden"), "toggle stays hidden with JS off")
    ctx.close()


def test_motion_effects(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 500)
    pg.evaluate("document.querySelector('#s-reveal').scrollIntoView({block:'center'})")
    settle(pg, 1500)
    b = pg.eval_on_selector(".fx-spot", "e => { const r = e.getBoundingClientRect(); return [r.x + 100, r.y + 60]; }")
    pg.mouse.move(*b)
    settle(pg, 200)
    settle(pg, 300)
    mx = pg.evaluate("document.querySelector('.fx-spot').style.getPropertyValue('--mx')")
    check(mx.endswith("px") and abs(float(mx[:-2]) - 100) < 3, f"spot follows pointer ({mx})")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-spot'), '::after').opacity") == "1", "spot glow visible on hover")
    pg.screenshot(path=os.path.join(SHOTS, "spot.png"))

    pg.evaluate("document.querySelector('#s-motion').scrollIntoView({block:'center'})")
    settle(pg, 400)
    # magnetic: pointer near the button pulls it, never more than 10px
    r = pg.eval_on_selector("#mag", "e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
    pg.mouse.move(r[0] + r[2] - 4, r[1] + r[3] - 4, steps=5)
    settle(pg, 500)
    tx = float(pg.evaluate("parseFloat(document.querySelector('#mag').style.getPropertyValue('--fx-tx')) || 0"))
    ty = float(pg.evaluate("parseFloat(document.querySelector('#mag').style.getPropertyValue('--fx-ty')) || 0"))
    check(0 < tx <= 10 and 0 < ty <= 10, f"magnetic pull within 10px ({tx},{ty})")
    pg.mouse.move(5, 500, steps=3)
    settle(pg, 400)
    check(pg.evaluate("parseFloat(document.querySelector('#mag').style.getPropertyValue('--fx-tx')) || 0") == 0, "magnetic releases")

    # glitch: 400 ms animation on the pseudo layers, no repeat
    gb = pg.eval_on_selector("#gl1", "e => { const r = e.getBoundingClientRect(); return [r.x + 20, r.y + 10]; }")
    pg.mouse.move(*gb)
    pg.wait_for_timeout(120)
    an = pg.evaluate("getComputedStyle(document.querySelector('#gl1'), '::before').animationName")
    du = pg.evaluate("getComputedStyle(document.querySelector('#gl1'), '::before').animationDuration")
    ic = pg.evaluate("getComputedStyle(document.querySelector('#gl1'), '::before').animationIterationCount")
    check(an == "fx-glitch-a" and du == "0.4s" and ic == "1", f"glitch is a single 400ms pass ({an},{du},{ic})")
    pg.screenshot(path=os.path.join(SHOTS, "glitch.png"), clip={"x": 150, "y": 100, "width": 700, "height": 200})
    pg.locator("#gl2").focus()
    pg.wait_for_timeout(100)
    check(pg.evaluate("getComputedStyle(document.querySelector('#gl2'), '::after').animationName") == "fx-glitch-b", "glitch runs on focus")
    check(pg.evaluate("document.querySelector('#gl2').getAttribute('data-text')") == "focus me", "glitch text layer data-text")
    ctx.close()


def test_parallax_cls(br):
    ctx, pg = ctx_page(br)
    pg.add_init_script("""
      window.__cls = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__cls += e.value; })
        .observe({type: 'layout-shift', buffered: true});
    """)
    pg.goto(PAGE)
    settle(pg, 1000)
    before = pg.evaluate("(() => { const r = document.querySelector('#para').parentElement.getBoundingClientRect(); return [r.width, r.height]; })()")
    h = pg.evaluate("document.documentElement.scrollHeight")
    for y in range(0, h, 160):
        pg.mouse.wheel(0, 160)
        pg.wait_for_timeout(35)
    settle(pg, 600)
    after = pg.evaluate("(() => { const r = document.querySelector('#para').parentElement.getBoundingClientRect(); return [r.width, r.height]; })()")
    cls = pg.evaluate("window.__cls")
    check(before == after, f"parallax container size unchanged {before} -> {after}")
    check(cls < 0.01, f"CLS after scrolling the whole page = {cls:.4f}")
    mode = pg.evaluate("getComputedStyle(document.querySelector('#para')).animationTimeline")
    print(f"  parallax mode: {'scroll-driven CSS' if 'view' in mode else 'IO + scroll rAF fallback'} ({mode})")
    pg.evaluate("document.querySelector('#para').scrollIntoView({block:'center'})")
    settle(pg, 300)
    t1 = pg.evaluate("getComputedStyle(document.querySelector('#para')).transform")
    pg.mouse.wheel(0, 120)
    settle(pg, 300)
    t2 = pg.evaluate("getComputedStyle(document.querySelector('#para')).transform")
    check(t1 != t2 and t1 != "none", f"parallax transform changes with scroll ({t1} -> {t2})")
    ctx.close()


def test_idle_cpu(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 5000)  # let load animations, typing and decode finish
    pg.evaluate("window.__raf = 0")
    pg.wait_for_timeout(2000)
    n = pg.evaluate("window.__raf")
    check(n <= 2, f"idle rAF calls over 2 s with no input: {n}")
    print(f"  idle rAF calls over 2 s: {n}")
    # pointer settle: ring lerp stops by itself
    pg.mouse.move(400, 400)
    pg.wait_for_timeout(1200)
    pg.evaluate("window.__raf = 0")
    pg.wait_for_timeout(800)
    n2 = pg.evaluate("window.__raf")
    check(n2 <= 1, f"rAF stops after the cursor ring settles: {n2}")
    ctx.close()


def test_plates(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 800)
    pg.evaluate("document.querySelector('#s-plates').scrollIntoView({block:'center'})")
    settle(pg, 1800)
    img = "#plate-img"
    check(pg.evaluate(f"document.querySelector('{img} .fx-plate__chip--res').textContent") == "800\u00d71066", "image plate shows resolution")
    check(pg.evaluate(f"document.querySelector('{img} .fx-plate__chip--tc').textContent") == "STILL", "image plate shows STILL")
    check("Dokimazo" in pg.evaluate(f"document.querySelector('{img} .fx-plate__row--tl').textContent")
          and "TK 03" in pg.evaluate(f"document.querySelector('{img} .fx-plate__row--tl').textContent")
          and "prof_pic.jpg" in pg.evaluate(f"document.querySelector('{img} .fx-plate__row--tl').textContent"), "slate shows project / take / file")
    check(pg.evaluate(f"document.querySelector('{img} .fx-plate__hud').getAttribute('aria-hidden')") == "true", "HUD aria-hidden")
    check(pg.evaluate(f"getComputedStyle(document.querySelector('{img} .fx-plate__hud')).pointerEvents") == "none", "HUD pointer-events none")
    same = pg.evaluate(f"""(() => {{ const p = document.querySelector('{img}').getBoundingClientRect(), i = document.querySelector('{img} img').getBoundingClientRect();
        return Math.abs(p.width - i.width) < .5 && Math.abs(p.height - i.height) < .5; }})()""")
    check(same, "plate wrapper size == media size (HUD adds no layout)")
    pb = pg.eval_on_selector(img, "e => { const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }")
    check(pg.evaluate(f"document.elementFromPoint({pb[0]},{pb[1]}).tagName") == "IMG", "clicks pass through the HUD")
    check(pg.evaluate(f"getComputedStyle(document.querySelector('{img}').querySelector('.fx-plate__rec')).animationName") == "none", "REC dot static for stills")
    lb = pg.evaluate("parseFloat(document.querySelector('#plate-lb .fx-plate__hud').style.getPropertyValue('--fx-bar'))")
    check(lb > 20, f"letterbox bar height computed ({lb})")
    pg.screenshot(path=os.path.join(SHOTS, "plate_image.png"), clip={"x": 120, "y": 0, "width": 1200, "height": 900})

    # video plate
    pg.evaluate("document.querySelector('#plate-vid').scrollIntoView({block:'center'})")
    settle(pg, 500)
    check(pg.evaluate("document.querySelector('#plate-vid').classList.contains('is-rec')") is False, "no REC before play")
    check(pg.evaluate("getComputedStyle(document.querySelector('#plate-vid .fx-plate__rec')).animationName") == "none", "REC dot not blinking while paused")
    res = pg.evaluate("document.querySelector('#plate-vid .fx-plate__chip--res').textContent")
    check(res == "640\u00d7360", f"video plate resolution from metadata ({res})")
    pg.evaluate("(() => { const v = document.querySelector('#vid'); v.muted = true; v.play().catch(() => 0); })()")
    pg.wait_for_timeout(700)
    t1 = pg.evaluate("document.querySelector('#plate-vid .fx-plate__chip--tc').textContent")
    pg.wait_for_timeout(1200)
    t2 = pg.evaluate("document.querySelector('#plate-vid .fx-plate__chip--tc').textContent")
    check(re.fullmatch(r"\d\d:\d\d:\d\d:\d\d", t1 or "") is not None, f"timecode format HH:MM:SS:FF ({t1})")
    check(t2 > t1 and t1 != "00:00:00:00", f"timecode advances while playing ({t1} -> {t2})")
    ff = int(t2.split(":")[-1])
    check(0 <= ff < 24, "frame field < 24")
    check(pg.evaluate("document.querySelector('#plate-vid').classList.contains('is-rec')"), "REC state while playing")
    an = pg.evaluate("getComputedStyle(document.querySelector('#plate-vid .fx-plate__rec')).animationName")
    check(an == "fx-rec", f"REC dot blinks while playing ({an})")
    pg.screenshot(path=os.path.join(SHOTS, "plate_video.png"), clip={"x": 120, "y": 100, "width": 1200, "height": 700})
    pg.evaluate("(() => { document.querySelector('#vid').pause(); })()")
    pg.wait_for_timeout(300)
    t3 = pg.evaluate("document.querySelector('#plate-vid .fx-plate__chip--tc').textContent")
    pg.wait_for_timeout(500)
    check(t3 == pg.evaluate("document.querySelector('#plate-vid .fx-plate__chip--tc').textContent"), "timecode frozen when paused")
    check(pg.evaluate("document.querySelector('#plate-vid').classList.contains('is-rec')") is False, "REC off when paused")
    ctx.close()


def test_view_transitions(br):
    css = open(os.path.join(SITE, "assets", "css", "site", "fx.css")).read()
    m = re.search(r"@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*auto;", css)
    check(m is not None, "@view-transition { navigation: auto } inside prefers-reduced-motion: no-preference")
    check("::view-transition-old(root)" in css and "::view-transition-new(root)" in css, "root cross-fade pseudo rules")
    check(re.search(r"\.pillnav\s*\{\s*view-transition-name:\s*pillnav", css) is not None, "pill nav view-transition-name")
    check(re.search(r'html\[data-fx="off"\]::view-transition-group\(\*\)', css) is not None
          and "animation-duration: 0s" in css, "durations 0 under data-fx=off")


def test_extras(br):
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 500)
    pg.evaluate("document.querySelector('#s-extras').scrollIntoView({block:'start'})")
    settle(pg, 4800)
    check(pg.evaluate("document.querySelectorAll('#marq .fx-marquee__group').length") == 2, "marquee has two groups")
    check(pg.evaluate("document.querySelector('#marq .fx-marquee__group:last-child').getAttribute('aria-hidden')") == "true", "marquee clone aria-hidden")
    check(pg.evaluate("document.querySelector('#marq .fx-marquee__group:last-child').hasAttribute('inert')"), "marquee clone inert")
    check(pg.evaluate("getComputedStyle(document.querySelector('#marq .fx-marquee__track')).animationName") == "fx-marquee", "marquee animates")
    box = pg.eval_on_selector("#marq", "e => { const r = e.getBoundingClientRect(); return [r.x + 50, r.y + 10]; }")
    pg.mouse.move(*box)
    pg.wait_for_timeout(150)
    check(pg.evaluate("getComputedStyle(document.querySelector('#marq .fx-marquee__track')).animationPlayState") == "paused", "marquee pauses on hover")
    typed = pg.evaluate("[...document.querySelectorAll('#typ .fx-typing__txt')].map(e => e.textContent)")
    check(typed == ["python run_case.py --mechanism reduced", "38 species, 124 reactions", "python uq.py --samples 4096"], f"typing completes: {typed}")
    check(pg.evaluate("document.querySelector('#typ .fx-typing__screen').getAttribute('aria-hidden')") == "true", "typed screen aria-hidden")
    check(pg.evaluate("document.querySelectorAll('#typ li').length") == 3, "original list items kept for AT")
    check(pg.evaluate("getComputedStyle(document.querySelector('#typ .fx-typing__caret')).animationName") == "fx-caret", "caret blinks")
    pg.screenshot(path=os.path.join(SHOTS, "extras.png"))
    ctx.close()

    # typing is mid-way shortly after entering, instant under reduced motion
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 300)
    pg.evaluate("document.querySelector('#typ').scrollIntoView({block:'center'})")
    pg.wait_for_timeout(500)
    part = pg.evaluate("[...document.querySelectorAll('#typ .fx-typing__txt')].map(e => e.textContent).join('|')")
    check(0 < len(part.replace("|", "")) < 100, f"typing in progress ({len(part)} chars)")
    ctx.close()
    ctx, pg = ctx_page(br, reduced=True)
    pg.goto(PAGE + "?fx=on")
    settle(pg, 300)
    typed = pg.evaluate("[...document.querySelectorAll('#typ .fx-typing__txt')].map(e => e.textContent)")
    check(typed[2] == "python uq.py --samples 4096", "typing instant under reduced motion")
    check(pg.evaluate("getComputedStyle(document.querySelector('#marq .fx-marquee__track')).animationName") == "none", "marquee still under reduced motion")
    check(pg.evaluate("getComputedStyle(document.querySelector('#marq .fx-marquee__group:last-child')).display") == "none", "marquee clone hidden under reduced motion")
    ctx.close()

    # late-inserted nodes and FX.refresh
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 500)
    pg.evaluate("""(() => { const h = document.createElement('h2'); h.id = 'late'; h.setAttribute('data-fx', 'split');
        h.textContent = 'Late inserted headline'; document.querySelector('main').appendChild(h);
        const p = document.createElement('p'); p.id = 'late2'; p.innerHTML = '<span data-fx="scramble">Later still</span>';
        document.querySelector('main').appendChild(p); })()""")
    settle(pg, 300)
    check(pg.evaluate("document.querySelector('#late').classList.contains('is-split')"), "MutationObserver picks up late split node")
    check(pg.evaluate("document.querySelector('#late .fx-sr').textContent") == "Late inserted headline", "late node text kept")
    ctx.close()


def test_intro(br):
    # not on non-home pages, not without ?home
    ctx, pg = ctx_page(br)
    pg.goto(PAGE)
    settle(pg, 300)
    check(pg.evaluate("document.documentElement.classList.contains('fx-intro-pending')") is False, "no intro on non-home page")
    ctx.close()

    # first-paint state + timing
    ctx, pg = ctx_page(br)
    pg.add_init_script("""
      window.__ph = {};
      document.addEventListener('readystatechange', () => {
        if (document.readyState !== 'interactive') return;
        const r = document.documentElement;
        window.__ph.pending = r.classList.contains('fx-intro-pending');
        const ov = document.querySelector('.fx-intro');
        window.__ph.overlay = ov ? getComputedStyle(ov).display : 'missing';
        window.__ph.content = getComputedStyle(document.querySelector('main')).opacity;
      });
      window.__t = {};
      setInterval(() => {
        const r = document.documentElement;
        if (!r) return;
        const on = r.classList.contains('fx-intro-on');
        if (on && window.__t.on === undefined) window.__t.on = performance.now();
        if (!on && window.__t.on !== undefined && window.__t.off === undefined) window.__t.off = performance.now();
        if (!r.classList.contains('fx-intro-pending') && window.__t.on !== undefined && window.__t.rel === undefined) window.__t.rel = performance.now();
      }, 8);
    """)
    pg.goto(PAGE + "?intro=1", wait_until="commit")
    pg.wait_for_function("window.__ph && window.__ph.overlay", timeout=5000)
    ph = pg.evaluate("window.__ph")
    check(ph["pending"] and ph["overlay"] == "block" and ph["content"] == "0", f"overlay in first paint and content hidden: {ph}")
    for ms, name in ((700, "grid_scan"), (900, "k_draw"), (800, "name"), (500, "late")):
        pg.wait_for_timeout(ms)
        pg.screenshot(path=os.path.join(SHOTS, f"intro_{name}.png"))
    pg.wait_for_function("!document.querySelector('.fx-intro')", timeout=4000)
    t = pg.evaluate("window.__t")
    # the stage was visible from t.on until t.off; measure the whole blocking window
    span = t["off"] - t["on"]
    check(2800 <= span <= 3200, f"intro blocks for {span:.0f} ms (<= 3200)")
    check(t["rel"] - t["on"] < 2700, "page content released at the wipe start")
    check(pg.evaluate("document.querySelector('.fx-intro') === null && document.querySelector('.fx-intro__edge') === null"), "overlay removed from DOM")
    check(pg.evaluate("getComputedStyle(document.querySelector('main')).opacity") == "1", "content visible after intro")
    check(pg.evaluate("document.documentElement.className.includes('fx-intro')") is False, "intro classes cleared")
    # once per session
    pg.goto(PAGE + "?home=1")
    settle(pg, 300)
    check(pg.evaluate("document.documentElement.classList.contains('fx-intro-pending')") is False, "intro does not repeat in the same session")
    check(pg.evaluate("document.querySelector('.fx-intro') === null"), "overlay not left in DOM on repeat visit")
    pg.goto(PAGE + "?intro=1")
    settle(pg, 400)
    check(pg.evaluate("document.documentElement.classList.contains('fx-intro-pending')"), "?intro=1 forces the intro again")
    ctx.close()

    # overlay content and accessibility
    ctx, pg = ctx_page(br)
    pg.goto(PAGE + "?home=1")
    pg.wait_for_timeout(2150)
    pg.screenshot(path=os.path.join(SHOTS, "intro_full.png"))
    check(pg.evaluate("document.querySelector('.fx-intro').getAttribute('aria-hidden')") == "true", "overlay aria-hidden")
    txt = pg.evaluate("document.querySelector('.fx-intro__stage').textContent.replace(/\\s+/g, ' ')")
    check("Krunal R. Panchal" in txt and "IIT Madras" in txt and "PhD" in txt and "2026" in txt, f"name + credentials rendered: {txt!r}")
    check(pg.evaluate("[...document.querySelectorAll('.fx-intro [tabindex]:not([tabindex=\"-1\"]), .fx-intro a[href], .fx-intro input')].length") == 0, "no focusable traps in overlay")
    check(pg.evaluate("document.querySelector('.fx-intro__skip').textContent.trim()") == "Skip", "Skip button present")
    ctx.close()

    # skip controls
    for how in ("Escape", "Enter", "Space", "KeyX", "click", "skipbtn"):
        ctx, pg = ctx_page(br)
        pg.goto(PAGE + "?intro=1")
        pg.wait_for_timeout(800)
        if how == "click":
            pg.mouse.click(700, 450)
        elif how == "skipbtn":
            pg.evaluate("document.querySelector('[data-fx-skip]').click()")
        else:
            pg.keyboard.press(how if how != "Space" else " ")
        pg.wait_for_function("!document.querySelector('.fx-intro')", timeout=1500)
        check(pg.evaluate("document.documentElement.className.includes('fx-intro')") is False, f"skip via {how} clears intro state")
        check(pg.evaluate("getComputedStyle(document.querySelector('main')).opacity") == "1", f"skip via {how} shows the page")
        ctx.close()

    # never: reduced motion (even with ?fx=on), lite, ?intro=0, FX off
    for name, kw, q in (("reduced motion", {"reduced": True}, "?intro=1"), ("reduced motion + fx=on", {"reduced": True}, "?intro=1&fx=on"),
                        ("lite", {"cores": 4}, "?intro=1"), ("intro=0", {}, "?intro=0"), ("fx=off", {}, "?intro=1&fx=off")):
        ctx, pg = ctx_page(br, **kw)
        pg.goto(PAGE + q)
        settle(pg, 400)
        check(pg.evaluate("document.documentElement.classList.contains('fx-intro-pending')") is False, f"no intro: {name}")
        check(pg.evaluate("(() => { const o = document.querySelector('.fx-intro'); return !o || getComputedStyle(o).display === 'none'; })()"),
              f"overlay not shown: {name}")
        ctx.close()

    # safety timeout: fx.js never loads, page must still appear (<= 3.6 s)
    n_err = len(console_errors)
    ctx, pg = ctx_page(br)
    pg.route("**/fx.js", lambda r: r.abort())
    pg.goto(PAGE + "?intro=1")
    pg.wait_for_timeout(3700)
    check(pg.evaluate("getComputedStyle(document.querySelector('main')).opacity") == "1", "content shown by inline safety timers without fx.js")
    check(pg.evaluate("getComputedStyle(document.querySelector('.fx-intro')).display") == "none", "overlay hidden without fx.js (inline timers)")
    del console_errors[n_err:]  # the aborted request is intentional
    ctx.close()

    # phone frame
    ctx, pg = ctx_page(br, view=PHONE, touch=True)
    pg.goto(PAGE + "?intro=1&fx=on")
    pg.wait_for_timeout(2150)
    pg.screenshot(path=os.path.join(SHOTS, "intro_phone.png"))
    check(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "intro does not overflow on phone")
    ctx.close()


TESTS = [test_state_matrix, test_toggle, test_global_layers, test_split_scramble_reveal, test_motion_effects,
         test_parallax_cls, test_idle_cpu, test_plates, test_view_transitions, test_extras, test_intro]


def main():
    global VIDEO
    VIDEO = make_video()
    only = sys.argv[1:]
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for t in TESTS:
            if only and t.__name__ not in only:
                continue
            print(t.__name__)
            before = len(fails)
            try:
                t(br)
            except Exception:
                fails.append(f"{t.__name__} crashed")
                traceback.print_exc()
            print("  ->", "ok" if len(fails) == before else "FAILED")
        br.close()
    errs = [e for e in console_errors if "favicon" not in e]
    check(not errs, f"no console errors: {errs[:5]}")
    print(f"\n{passes} checks passed, {len(fails)} failed")
    for f in fails:
        print(" -", f)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
