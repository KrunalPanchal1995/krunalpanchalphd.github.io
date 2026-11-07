/* studio.js: the full-window Studio page. Works for every [data-studio-page] block.
 * - sets the iframe src: <app>?portfolio=1&theme=<current>[&embed=1 is NOT used here: the Studio's own top bar is wanted]
 *   with the page's #route passed through (/studio/#atlas?ch=S32&ex=0 opens that workspace);
 * - relays site theme changes to the iframe ({type:'theme'}), page #route changes ({type:'go'});
 * - listens to the iframe ({type:'studio-route'} keeps the page URL shareable, {type:'studio-project'} is re-dispatched
 *   as a window CustomEvent 'studio-project');
 * - "Open in new tab" always points at the current route; the full-screen button uses the Fullscreen API.
 * Protocol: assets/apps/math-studio/README-portfolio.md. */
(function () {
  "use strict";
  var page = document.querySelector("[data-studio-page]");
  if (!page) return;
  var frame = page.querySelector("[data-studio-frame]");
  var newtab = page.querySelector("[data-studio-newtab]");
  var fullBtn = page.querySelector("[data-studio-full]");
  var app = page.getAttribute("data-app");
  var defRoute = page.getAttribute("data-default-route") || "subjects";
  var root = document.documentElement;

  function theme() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function pageRoute() {
    var h = location.hash.replace(/^#/, "");
    try {
      h = decodeURIComponent(h);
    } catch (e) {}
    return h || defRoute;
  }
  function url(route, extra) {
    return app + "?portfolio=1" + (extra || "") + "&theme=" + theme() + "#" + route;
  }
  var lastRoute = pageRoute();
  var ready = false;

  frame.src = url(lastRoute);
  if (newtab) newtab.href = url(lastRoute);

  function send(msg) {
    try {
      frame.contentWindow.postMessage(msg, location.origin);
    } catch (e) {}
  }

  // theme relay: the site toggles data-theme on <html>
  new MutationObserver(function () {
    send({ type: "theme", theme: theme() });
    if (newtab) newtab.href = url(lastRoute);
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // page hash -> iframe
  window.addEventListener("hashchange", function () {
    var r = pageRoute();
    if (r !== lastRoute) {
      lastRoute = r;
      send({ type: "go", route: r });
      if (newtab) newtab.href = url(r);
    }
  });

  // iframe -> page
  window.addEventListener("message", function (ev) {
    if (ev.source !== frame.contentWindow || ev.origin !== location.origin || !ev.data || typeof ev.data !== "object") return;
    var d = ev.data;
    if (d.type === "studio-ready") {
      ready = true;
      send({ type: "theme", theme: theme() });
    } else if (d.type === "studio-route" && typeof d.route === "string") {
      lastRoute = d.route || defRoute;
      if (newtab) newtab.href = url(lastRoute);
      var h = "#" + (d.route === defRoute ? "" : d.route);
      try {
        history.replaceState(null, "", location.pathname + location.search + (d.route === defRoute ? "" : h));
      } catch (e) {}
    } else if (d.type === "request-access" && typeof d.id === "string") {
      // WP-J: a locked code card inside the Studio asks the page to open the request dialog (assets/js/site/request.js)
      if (window.OpenAccess) window.OpenAccess.openDialog({ id: d.id, title: typeof d.title === "string" ? d.title : "" });
      else window.location.href = (location.pathname.replace(/studio\/?$/, "") || "/") + "open/#oa-" + encodeURIComponent(d.id);
    } else if (d.type === "studio-project") {
      try {
        window.dispatchEvent(new CustomEvent("studio-project", { detail: d }));
      } catch (e) {}
    }
  });
  frame.addEventListener("load", function () {
    if (!ready) send({ type: "theme", theme: theme() });
  });

  // full screen
  if (fullBtn) {
    if (!page.requestFullscreen) fullBtn.hidden = true;
    fullBtn.addEventListener("click", function () {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else page.requestFullscreen();
      } catch (e) {
        window.open(url(lastRoute), "_blank", "noopener");
      }
    });
  }
})();
