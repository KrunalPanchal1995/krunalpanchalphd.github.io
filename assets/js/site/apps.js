/* apps.js: full-screen toggle for app embeds, theme relay, and the playground resize contract. */
(function () {
  var stage = document.querySelector("[data-app-stage]");
  if (!stage) return;
  var frame = stage.querySelector("[data-app-frame]");
  var btn = stage.querySelector("[data-app-full]");
  if (btn)
    btn.addEventListener("click", function () {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else stage.requestFullscreen();
      } catch (e) {
        window.open(frame.src, "_blank", "noopener");
      }
    });
  // Relay the site theme to same-origin embeds that listen for it.
  function relay() {
    try {
      frame.contentWindow.postMessage({ type: "theme", theme: document.documentElement.getAttribute("data-theme") }, "*");
    } catch (e) {}
  }
  frame.addEventListener("load", relay);
  new MutationObserver(relay).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Embeds may report their content height; clamp like the playground page does.
  window.addEventListener("message", function (ev) {
    if (ev.source !== frame.contentWindow || !ev.data || ev.data.type !== "resize") return;
    var h = Math.max(400, Math.min(6000, Number(ev.data.height) || 0));
    if (h) frame.style.height = h + "px";
  });
})();
