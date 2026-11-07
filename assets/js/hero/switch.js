/*
 * hero/switch.js -- chooses which of the four heroes is live, with no rebuild.
 *
 * Markup (see _includes/hero-switch.liquid):
 *   <div class="hero-switch" data-hero-switch data-default="fluid"
 *        data-allowed="fluid,streamlines,card3d,photo" data-module-base="/assets/js/hero/">
 *     <div class="hero" data-hero="fluid">...</div>
 *     <div class="hero" data-hero="streamlines" hidden>...</div>
 *     <div class="hero" data-hero="card3d" hidden>...</div>
 *     <div class="hero" data-hero="photo" hidden>...</div>
 *   </div>
 *
 * Choice order:  ?hero=NAME  >  localStorage "hero-choice" (written ONLY by the picker)  >
 * data-default.   ?hero=reset forgets the stored choice.  The picker (a small segmented
 * control) is created only when the query has ?heropick=1.
 * Exactly one hero is mounted at a time: the previous one is destroyed (animation stopped,
 * listeners removed, WebGL context released) before the next mounts.  Hero modules are
 * dynamic-imported on demand, so three.js is fetched only when card3d becomes active (and fluid.js only for fluid).
 *
 * API:  const sw = mount(el);  sw.select(name);  sw.current();  sw.destroy();
 * Auto-mounts every [data-hero-switch] on DOMContentLoaded (importing this file is enough).
 */
const KEY = "hero-choice";
const LABELS = { fluid: "fluid", streamlines: "streamlines", card3d: "3d card", photo: "photo" };

function lsGet() {
  try {
    return localStorage.getItem(KEY);
  } catch (e) {
    return null;
  }
}
function lsSet(v) {
  try {
    v == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v);
  } catch (e) {}
}

export function mount(el, opts = {}) {
  const allowed = (el.dataset.allowed || "fluid,streamlines,card3d,photo")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dflt = allowed.includes(el.dataset.default) ? el.dataset.default : allowed[0];
  const base = new URL(el.dataset.moduleBase || "/assets/js/hero/", location.href);
  const params = new URLSearchParams(location.search);
  const heroes = {};
  el.querySelectorAll(":scope > [data-hero]").forEach((h) => (heroes[h.dataset.hero] = h));

  if (params.get("hero") === "reset") lsSet(null);
  const q = params.get("hero");
  const stored = lsGet();
  let name = allowed.includes(q) && heroes[q] ? q : allowed.includes(stored) && heroes[stored] ? stored : dflt;

  let api = null,
    active = null,
    token = 0,
    buttons = {};

  async function select(next, fromPicker) {
    if (!heroes[next] || !allowed.includes(next)) return;
    if (fromPicker) {
      lsSet(next);
      try {
        const u = new URL(location.href);
        u.searchParams.set("hero", next);
        history.replaceState(null, "", u);
      } catch (e) {}
    }
    if (active === next && api) return;
    const my = ++token;
    if (api) {
      try {
        api.destroy();
      } catch (e) {
        console.warn("hero destroy failed", e);
      }
      api = null;
    }
    active = next;
    for (const [k, h] of Object.entries(heroes)) h.hidden = k !== next;
    for (const [k, b] of Object.entries(buttons)) b.setAttribute("aria-pressed", String(k === next));
    el.dataset.activeHero = next;
    try {
      const mod = await import(new URL(next + ".js", base).href);
      if (my !== token) return; // a newer selection superseded this one
      const a = await mod.mount(heroes[next], opts[next] || {});
      if (my !== token) {
        a.destroy();
        return;
      }
      api = a;
    } catch (e) {
      console.warn("hero failed to mount:", next, e);
      heroes[next].dataset.heroState = "error";
    }
  }

  if (params.get("heropick") === "1") {
    const bar = document.createElement("div");
    bar.className = "hero-picker";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Hero variant");
    const lab = document.createElement("span");
    lab.className = "hero-picker__label";
    lab.textContent = "Hero:";
    bar.append(lab);
    for (const k of allowed) {
      if (!heroes[k]) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = LABELS[k] || k;
      b.dataset.pick = k;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => select(k, true));
      buttons[k] = b;
      bar.append(b);
    }
    el.append(bar);
  }

  select(name, false);
  return {
    select: (n) => select(n, false),
    current: () => active,
    destroy() {
      token++;
      if (api) api.destroy();
      api = null;
      buttons = {};
      el.querySelector(".hero-picker")?.remove();
    },
  };
}

function auto() {
  document.querySelectorAll("[data-hero-switch]").forEach((el) => {
    if (!el.__heroSwitch) el.__heroSwitch = mount(el);
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
else auto();
