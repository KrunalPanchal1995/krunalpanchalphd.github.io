/* nav.js: the pill nav's "More" menu (button + list, outside click, Esc, arrow keys). Hooks used by gem JS are untouched. */
(function () {
  var wrap = document.querySelector("[data-more]");
  if (!wrap) return;
  var btn = wrap.querySelector("[data-more-toggle]");
  var list = wrap.querySelector(".pillnav__morelist");
  var items = function () {
    return Array.prototype.slice.call(list.querySelectorAll("a"));
  };
  if (!items().length) {
    wrap.hidden = true;
    return;
  }
  function mobile() {
    return window.matchMedia("(max-width: 860px)").matches;
  }
  function open(focusFirst) {
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    if (focusFirst) items()[0].focus();
  }
  function close(returnFocus) {
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    wrap.classList.remove("is-open");
    if (returnFocus) btn.focus();
  }
  btn.addEventListener("click", function () {
    list.hidden ? open(false) : close(false);
  });
  btn.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open(true);
    }
  });
  list.addEventListener("keydown", function (e) {
    var a = items(),
      i = a.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      a[(i + 1) % a.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      a[(i - 1 + a.length) % a.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      a[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      a[a.length - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  });
  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target) && !list.hidden && !mobile()) close(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !list.hidden) close(true);
  });
  // On phones the list is shown inline inside the open sheet (CSS), so keep it visible.
  function sync() {
    if (mobile()) {
      list.hidden = false;
    } else if (!wrap.classList.contains("is-open")) {
      list.hidden = true;
    }
  }
  sync();
  window.addEventListener("resize", sync);
})();

/* Accessibility fixes (audit): scrollable code blocks are keyboard-focusable; icon-only links get names. */
(function () {
  function fix(root) {
    root = root || document;
    root.querySelectorAll("pre").forEach(function (pre) {
      if (pre.scrollWidth > pre.clientWidth + 1 && !pre.hasAttribute("tabindex")) {
        pre.setAttribute("tabindex", "0");
        if (!pre.getAttribute("aria-label")) pre.setAttribute("aria-label", "Code (scrollable)");
        pre.setAttribute("role", pre.getAttribute("role") || "region");
      }
    });
    root.querySelectorAll("a").forEach(function (a) {
      if (a.textContent.trim() === "" && !a.getAttribute("aria-label") && !a.querySelector("img[alt]:not([alt=''])") && !a.getAttribute("title")) {
        var href = a.getAttribute("href") || "";
        a.setAttribute("aria-label", /\.pdf($|\?)/i.test(href) ? "Download PDF" : "Open link");
      }
    });
  }
  if (document.readyState !== "loading") fix();
  else
    document.addEventListener("DOMContentLoaded", function () {
      fix();
    });
  window.addEventListener("load", function () {
    fix();
  });
})();
