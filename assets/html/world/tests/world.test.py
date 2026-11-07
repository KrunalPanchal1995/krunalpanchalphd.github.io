"""Playwright test for the research world.
Usage (from anywhere): python3 assets/html/world/tests/world.test.py [base_url] [shot_dir]
Serve the BUILT site (_site; projects.json and index.html are Jekyll-generated):  python3 -m http.server 8765 --directory _site
"""
import io, sys, time
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765') + '/assets/html/world/index.html'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/world-shots'
import os; os.makedirs(SHOTS, exist_ok=True)
GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def colours(png):
    im = Image.open(io.BytesIO(png)).convert('RGB').resize((96, 60))
    return len(set(im.getdata()))

def open_page(b, url, **kw):
    ctx = b.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_function('window.__world && window.__world.getState().webgl !== undefined', timeout=20000)
    return ctx, pg, errs

with sync_playwright() as p:
    b = p.chromium.launch(args=GL)
    # dark desktop
    ctx, pg, errs = open_page(b, BASE + '?theme=dark', viewport={'width': 1280, 'height': 800})
    pg.wait_for_timeout(2500)
    st = pg.evaluate('__world.getState()')
    check(st['webgl'] and st['stations'] == 18, f'webgl on, 18 stations ({st})')
    png = pg.screenshot(path=f'{SHOTS}/dark.png')
    check(colours(png) > 200, f'canvas not blank (distinct colours {colours(png)})')
    check(pg.evaluate("document.documentElement.dataset.theme") == 'dark', 'dark theme applied')
    x0, z0 = st['x'], st['z']
    pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(1500)
    s1 = pg.evaluate('__world.getState()'); pg.keyboard.up('ArrowUp')
    moved = ((s1['x'] - x0) ** 2 + (s1['z'] - z0) ** 2) ** .5
    check(moved > 3 and s1['speed'] > 2, f'vehicle moved {moved:.1f} u, speed {s1["speed"]:.1f}')
    pg.keyboard.down('KeyD'); pg.keyboard.down('KeyW'); pg.wait_for_timeout(700)
    s2 = pg.evaluate('__world.getState()'); pg.keyboard.up('KeyD'); pg.keyboard.up('KeyW')
    check(abs(s2['heading'] - s1['heading']) > 0.05, 'steering changes heading')
    # station
    slug = pg.evaluate('__world.stations[3].slug')
    pg.evaluate(f'__world.teleportTo("{slug}")'); pg.wait_for_timeout(600)
    check(pg.evaluate('__world.getState().near') == slug, 'near station detected')
    check(pg.is_visible('#prompt') and 'Open' in pg.inner_text('#prompt'), 'prompt visible: ' + pg.inner_text('#prompt').replace('\n', ' '))
    pg.screenshot(path=f'{SHOTS}/dark-station.png')
    with pg.expect_request(lambda r: f'/projects/{slug}/' in r.url, timeout=5000):
        pg.keyboard.press('Enter')
    check(True, 'Enter navigates to project url')
    check(not errs, f'no console errors {errs}')
    ctx.close()

    # skip to list
    ctx, pg, errs = open_page(b, BASE + '?theme=dark', viewport={'width': 1280, 'height': 800})
    check(not pg.locator('#list').evaluate('e=>e.classList.contains("open")'), 'list hidden initially')
    check(pg.locator('#items a').count() == 18, 'list has 18 links')
    pg.click('#skip'); pg.wait_for_timeout(500); pg.screenshot(path=f'{SHOTS}/list.png')
    check(pg.is_visible('#items a >> nth=0'), 'list revealed by Skip to list')
    ctx.close()

    # light
    ctx, pg, errs = open_page(b, BASE + '?theme=light', viewport={'width': 1280, 'height': 800})
    pg.wait_for_timeout(2500)
    png = pg.screenshot(path=f'{SHOTS}/light.png')
    check(colours(png) > 200 and pg.evaluate("document.documentElement.dataset.theme") == 'light', 'light renders')
    pg.evaluate('__world.setTheme("dark")'); pg.wait_for_timeout(300)
    check(pg.evaluate('__world.getState().theme') == 'dark', 'runtime theme switch')
    check(not errs, f'no console errors (light) {errs}')
    ctx.close()

    # mobile
    ctx, pg, errs = open_page(b, BASE + '?theme=dark&touch=1', viewport={'width': 390, 'height': 800}, has_touch=True, is_mobile=True)
    pg.wait_for_timeout(2500)
    png = pg.screenshot(path=f'{SHOTS}/mobile.png')
    check(colours(png) > 200 and pg.is_visible('#stick'), 'mobile renders with joystick')
    pg.evaluate('__world.teleportTo(__world.stations[0].slug)'); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{SHOTS}/mobile-station.png')
    check(not errs, f'no console errors (mobile) {errs}')
    ctx.close()

    # reduced motion
    ctx, pg, errs = open_page(b, BASE, viewport={'width': 1000, 'height': 700}, reduced_motion='reduce')
    check(pg.evaluate('__world.getState().reduced'), 'reduced motion honoured'); ctx.close()

    # no webgl fallback
    ctx, pg, errs = open_page(b, BASE + '?nowebgl=1', viewport={'width': 1000, 'height': 700})
    pg.wait_for_timeout(500); pg.screenshot(path=f'{SHOTS}/nowebgl.png')
    check(pg.is_visible('#items a >> nth=0') and pg.locator('#items a').count() == 18, 'fallback list visible (?nowebgl=1)')
    ctx.close()
    b.close()
    # truly no GL
    b = p.chromium.launch(args=['--disable-gpu', '--disable-webgl', '--disable-3d-apis'])
    ctx, pg, errs = open_page(b, BASE, viewport={'width': 1000, 'height': 700})
    pg.wait_for_timeout(500)
    check(pg.is_visible('#items a >> nth=0'), 'fallback list visible with WebGL disabled in browser')
    b.close()

print('\nFAILED: ' + str(fails) if fails else '\nALL PASSED')
sys.exit(1 if fails else 0)
