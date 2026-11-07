/* projects-index.js: view switcher (Lab, Cinema, Rows, Index), filters, search, in-view or hover video and the Index master/detail pane. */
(function () {
  "use strict";
  var root = document.querySelector("[data-pi]");
  if (!root) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;
  var mobile = window.matchMedia("(max-width: 900px)");
  var KEY = "projects-view";
  var VIEWS = ["lab", "cinema", "rows", "index"];
  var state = { view: "lab", cat: "all", q: "" };
  var cards = Array.prototype.slice.call(root.querySelectorAll(".pc-grid > [data-card]"));
  var rows = Array.prototype.slice.call(root.querySelectorAll(".ix-item"));
  var segs = Array.prototype.slice.call(root.querySelectorAll("[data-set-view]"));
  var filters = Array.prototype.slice.call(root.querySelectorAll("[data-filter]"));
  var search = root.querySelector("[data-search]");
  var status = root.querySelector("[data-status]");
  var empty = root.querySelector("[data-empty]");
  var pane = root.querySelector("[data-ix-pane]");
  var total = cards.length;

  /* ---------- video helpers ---------- */
  Array.prototype.forEach.call(root.querySelectorAll(".pc[data-video]"), function (c) {
    var m = c.querySelector(".pc__media");
    if (m) {
      m.setAttribute("data-video", c.getAttribute("data-video"));
      m.setAttribute("data-poster", c.getAttribute("data-poster") || "");
    }
  });
  function ensureVideo(host) {
    var v = host.querySelector("video.pc__vid");
    if (v) return v;
    var fxs = document.documentElement.getAttribute("data-fx");
    if (reduce || fxs === "off" || fxs === "lite" || !host.getAttribute("data-video")) return null;
    v = document.createElement("video");
    v.className = "pc__vid";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("aria-hidden", "true");
    v.tabIndex = -1;
    if (host.getAttribute("data-poster")) v.poster = host.getAttribute("data-poster");
    v.src = host.getAttribute("data-video");
    v.addEventListener("playing", function () {
      v.classList.add("is-on");
    });
    host.appendChild(v);
    return v;
  }
  function play(host) {
    var v = ensureVideo(host);
    if (!v) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  function stop(host) {
    var v = host.querySelector("video.pc__vid");
    if (v) v.pause();
  }
  var io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (es) {
            es.forEach(function (e) {
              if (e.isIntersecting) play(e.target);
              else stop(e.target);
            });
          },
          { threshold: 0.6 }
        )
      : null;

  /* Hover or focus plays on pointer devices; on touch screens a card plays while it is mostly in view. */
  if (!reduce) {
    cards.forEach(function (card) {
      if (!card.getAttribute("data-video")) return;
      var host = card.querySelector(".pc__media");
      if (canHover) {
        ["mouseenter", "focusin"].forEach(function (ev) {
          card.addEventListener(ev, function () {
            if (root.getAttribute("data-view") !== "index") play(host);
          });
        });
        ["mouseleave", "focusout"].forEach(function (ev) {
          card.addEventListener(ev, function () {
            stop(host);
          });
        });
      } else if (io) io.observe(host);
    });
  }

  /* ---------- view ---------- */
  function setView(v, save) {
    if (VIEWS.indexOf(v) < 0) v = "lab";
    state.view = v;
    root.setAttribute("data-view", v);
    segs.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-set-view") === v ? "true" : "false");
    });
    if (save) {
      try {
        localStorage.setItem(KEY, v);
      } catch (e) {}
    }
    if (v === "index") {
      Array.prototype.forEach.call(root.querySelectorAll(".pc-grid .pc__media"), stop);
      ixEnsure();
    }
  }
  segs.forEach(function (b) {
    b.addEventListener("click", function () {
      setView(b.getAttribute("data-set-view"), true);
    });
  });

  /* ---------- filter + search ---------- */
  function matches(el) {
    var cats = (el.getAttribute("data-cats") || "").split(" ");
    var hay = (el.getAttribute("data-text") || (el.getAttribute("data-title") || "").toLowerCase() + " " + cats.join(" ")).toLowerCase();
    var q = state.q.trim().toLowerCase();
    return (state.cat === "all" || cats.indexOf(state.cat) >= 0) && (!q || hay.indexOf(q) >= 0);
  }
  function apply() {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = matches(c);
      c.hidden = !ok;
      if (ok) shown++;
      else {
        var h = c.querySelector(".pc__media");
        if (h) stop(h);
      }
    });
    rows.forEach(function (r, i) {
      /* the Index row shares its card's search text */
      r.hidden = cards[i] ? cards[i].hidden : false;
    });
    status.textContent = shown + " of " + total + " projects";
    empty.hidden = shown !== 0;
    if (state.view === "index") ixEnsure();
  }
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      state.cat = b.getAttribute("data-filter");
      filters.forEach(function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      apply();
    });
  });
  search.addEventListener("input", function () {
    state.q = search.value;
    apply();
  });

  /* ---------- index master/detail ---------- */
  var active = null;
  function visibleRows() {
    return rows.filter(function (r) {
      return !r.hidden;
    });
  }
  function fillPane(li) {
    var d = li.querySelector(".ix-detail");
    pane.textContent = "";
    var wrap = document.createElement("div");
    wrap.className = "ix-pane-card";
    wrap.innerHTML = d.innerHTML;
    pane.appendChild(wrap);
    var media = wrap.querySelector(".pc__media");
    if (media && !reduce) play(media);
  }
  function select(li, toggle) {
    if (!li) return;
    var wasOpen = li.classList.contains("is-open");
    rows.forEach(function (r) {
      r.classList.remove("is-active", "is-open");
      r.querySelector(".ix-row").setAttribute("aria-expanded", "false");
      var m = r.querySelector(".pc__media");
      if (m) stop(m);
    });
    active = li;
    li.classList.add("is-active");
    if (mobile.matches) {
      if (toggle && wasOpen) {
        active = null;
        li.classList.remove("is-active");
        return;
      }
      li.classList.add("is-open");
      li.querySelector(".ix-row").setAttribute("aria-expanded", "true");
      var m2 = li.querySelector(".pc__media");
      if (m2 && !reduce) play(m2);
    } else {
      li.querySelector(".ix-row").setAttribute("aria-expanded", "true");
      fillPane(li);
    }
  }
  function ixEnsure() {
    if (mobile.matches) {
      pane.textContent = "";
      return;
    }
    var vis = visibleRows();
    if (!vis.length) {
      pane.textContent = "";
      active = null;
      return;
    }
    if (!active || active.hidden || !pane.firstChild) select(active && !active.hidden ? active : vis[0]);
  }
  rows.forEach(function (li) {
    var btn = li.querySelector(".ix-row");
    btn.addEventListener("click", function () {
      select(li, true);
    });
    btn.addEventListener("mouseenter", function () {
      if (!mobile.matches && canHover && active !== li) select(li);
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var v = visibleRows(),
        i = v.indexOf(li),
        n = v[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (!n) return;
      e.preventDefault();
      n.querySelector(".ix-row").focus();
      if (!mobile.matches) select(n);
    });
  });
  var mq = mobile.addEventListener ? "addEventListener" : "addListener";
  mobile[mq]("change", function () {
    rows.forEach(function (r) {
      r.classList.remove("is-open", "is-active");
      r.querySelector(".ix-row").setAttribute("aria-expanded", "false");
    });
    active = null;
    pane.textContent = "";
    if (state.view === "index") ixEnsure();
  });

  /* ---------- init ---------- */
  var saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {}
  setView(saved, false);
  apply();
})();
