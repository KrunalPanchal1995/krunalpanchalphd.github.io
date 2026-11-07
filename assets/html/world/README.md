# Research world

A standalone, drivable 3D showcase (Three.js r160, vendored in `assets/vendor/three/`). No physics library, no network requests.
Open `assets/html/world/index.html` directly or embed it:

```html
<iframe src="/assets/html/world/index.html" title="Research world" loading="lazy" allow="gamepad" style="width:100%;height:80vh;border:0"></iframe>
```

## Controls

- WASD / arrow keys drive; Enter or Space opens the project whose glowing ring you are inside; R resets.
- Touch: on-screen joystick (steer + throttle); tap the "Open ..." prompt. Gamepad: left stick, triggers, A.
- "Skip to list" (also reachable by Tab) reveals the semantic `<nav id="list">` with every project; it is always in the DOM and is the whole page when WebGL is unavailable (`?nowebgl=1` forces this).
- `prefers-reduced-motion`: no ribbon/flame/sphere animation or FOV change, gentler vehicle.

## Tour (autopilot)

The HUD "Tour" button (or `T`) drives past every station in district order, pausing 2.5 s at each with a lower third (title, category chip, Open project / Explore in Studio). Never auto-starts. Any key, tap on the joystick, Reset or Esc returns manual control. Under reduced motion it still needs an explicit click and is gentler. A minimap (bottom-right, collapsible with the Map button, collapsed by default on narrow phones) shows districts, stations, vehicle and the next waypoint. `S` opens the Studio route when you are stopped at a station (otherwise it reverses). Hooks: `__world.startTour()`, `.stopTour()`, `.setTourScale({dwell, speed})`, `getState().tour`.

## Stations are generated

`projects.json` and the static list in `index.html` are Jekyll files (front matter + Liquid over `site.projects`, sorted by `importance`): one station per project with `slug`, `title`, first `category`, `img` (front matter `img`, else the first image in `_data/project_images.yml`, else a flat blueprint plate), `url`, `app` (front matter `app:`, a direct-launch URL; shows a Launch app button) and `studio` (front matter `studio:` or `_data/studio_map.yml`). Serve the built `_site`, not the source folder.

## Adding a station (manual shape)

Each entry looks like `{ "slug", "title", "category", "img", "url", "app", "studio" }`.
`img` is site-relative (e.g. `assets/img/projects/x/y.png`); the page prefixes `../../../`. `category` picks the district
(`combustion`, `optimization`, `uq`, `sciml`, `cfd`, `experimental`, plus neutral `visualization`, `software`, `quantum-chemistry`; any new name gets its own sky-coloured district; colours live in `CATS` in `world.js`).
Navigation uses `window.top.location.href = url` (falls back to `window.location`). List links use `target="_top"`.

## Theme sync

Order: `?theme=light|dark` > parent window's `document.documentElement.dataset.theme` (same-origin iframe, watched with a
MutationObserver) > `prefers-color-scheme` > dark. A parent may also `postMessage({type:'theme', theme:'light'})`.
The scene (background, fog, ground grid, materials, labels, ribbons) is re-coloured live from the `PAL` table in `world.js`.

## Embedding messages

On first rendered frame (or fallback) the page posts `{source:'research-world', type:'ready', webgl:boolean}` to `window.parent`.

## Tests

Serve the repo root (`python3 -m http.server 8765`), then `python3 assets/html/world/tests/world.test.py [base_url] [screenshot_dir]`.
Test hooks: `window.__world.getState()`, `.teleportTo(slug)`, `.reset()`, `.setTheme(t)`.
