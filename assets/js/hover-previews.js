// B1 (GOAL_SCORECARD.md, session 4): gwern-style hover link previews.
// Re-implemented from scratch, no gwern.net code copied (see
// hover_previews.liquid's own comment for why that convention still
// applies here). Vanilla JS, no dependencies.
//
// window.__hoverPreviews (built server-side by hover_previews.liquid) maps
// a same-origin pathname -> {title, description}. On mouseenter of any <a>
// whose href resolves to a KNOWN entry in that map, show a small floating
// card near the link after a short delay (avoids flicker on fast mouse
// movement, same reasoning as gwern's own popup delay); hide on mouseleave
// or when the popup itself loses hover. Links with no matching entry
// (external links, anchors, unrecognized paths) are left completely alone.
(function () {
  "use strict";

  var previews = window.__hoverPreviews || {};
  var SHOW_DELAY_MS = 200;
  var HIDE_DELAY_MS = 150;
  var showTimer = null;
  var hideTimer = null;
  var card = null;

  function ensureCard() {
    if (card) return card;
    card = document.createElement("div");
    card.className = "hover-preview-card";
    card.setAttribute("role", "tooltip");
    var style = document.createElement("style");
    style.textContent =
      ".hover-preview-card{" +
      "position:fixed;z-index:2000;max-width:320px;padding:0.6rem 0.8rem;" +
      "border-radius:6px;font-size:0.85rem;line-height:1.4;" +
      "background:var(--global-card-bg-color,#fff);" +
      "color:var(--global-text-color,#222);" +
      "border:1px solid var(--global-divider-color,rgba(0,0,0,0.1));" +
      "box-shadow:0 4px 16px rgba(0,0,0,0.18);" +
      "opacity:0;pointer-events:none;transition:opacity 120ms ease;" +
      "}" +
      ".hover-preview-card.visible{opacity:1;pointer-events:auto;}" +
      ".hover-preview-card .hpc-title{font-weight:600;margin-bottom:0.2rem;" +
      "color:var(--global-theme-color,#7a3ea1);}" +
      ".hover-preview-card .hpc-desc{color:var(--global-text-color-light,#666);}";
    document.head.appendChild(style);
    document.body.appendChild(card);
    card.addEventListener("mouseenter", function () {
      clearTimeout(hideTimer);
    });
    card.addEventListener("mouseleave", scheduleHide);
    return card;
  }

  function pathnameFor(a) {
    try {
      var url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      return url.pathname;
    } catch (e) {
      return null;
    }
  }

  function showFor(a, entry) {
    var el = ensureCard();
    el.innerHTML = "";
    var title = document.createElement("div");
    title.className = "hpc-title";
    title.textContent = entry.title;
    el.appendChild(title);
    if (entry.description) {
      var desc = document.createElement("div");
      desc.className = "hpc-desc";
      desc.textContent = entry.description;
      el.appendChild(desc);
    }
    var rect = a.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 336)) + "px";
    el.style.top = rect.bottom + 8 + "px";
    el.classList.add("visible");
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    hideTimer = setTimeout(function () {
      if (card) card.classList.remove("visible");
    }, HIDE_DELAY_MS);
  }

  function attach(a) {
    var pathname = pathnameFor(a);
    if (!pathname) return;
    var entry = previews[pathname];
    if (!entry) return;
    a.addEventListener("mouseenter", function () {
      clearTimeout(hideTimer);
      showTimer = setTimeout(function () {
        showFor(a, entry);
      }, SHOW_DELAY_MS);
    });
    a.addEventListener("mouseleave", function () {
      clearTimeout(showTimer);
      scheduleHide();
    });
  }

  function init() {
    if (!previews || Object.keys(previews).length === 0) return;
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) attach(links[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
