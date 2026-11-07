/* home.js: stats count-up, Selected work carousel (with swipe), Studio stage + project drawer. Plain JS, no dependencies. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- stats count-up ---- */
  function countUp(el) {
    var raw = el.getAttribute("data-count") || "";
    var target = parseFloat(raw.replace(/,/g, ""));
    if (!isFinite(target)) return;
    var dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    var group = /,/.test(raw);
    var fmt = function (v) {
      var s = v.toFixed(dec);
      return group ? Number(s).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s;
    };
    var t0 = null,
      dur = 1400;
    el.textContent = fmt(0);
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = p >= 1 ? raw : fmt(target * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var stats = document.querySelector("[data-home-stats]");
  if (stats && !reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          e.target.querySelectorAll("[data-count]").forEach(countUp);
        });
      },
      { threshold: 0.4 }
    );
    io.observe(stats);
  }

  /* ---- carousel ---- */
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-slide]"));
    var dots = Array.prototype.slice.call(root.querySelectorAll("[data-dot]"));
    var label = root.querySelector("[data-count-label]");
    var playBtn = root.querySelector("[data-play]");
    var n = slides.length;
    if (!n) return;
    var cur = 0,
      timer = null,
      userPaused = reduce,
      hoverPause = false,
      inView = true;
    var pad = function (v) {
      return (v < 10 ? "0" : "") + v;
    };

    function vid(s) {
      return s.querySelector("video");
    }
    function syncVideo() {
      slides.forEach(function (s, i) {
        var v = vid(s);
        if (!v) return;
        if (i === cur) {
          if (!v.getAttribute("src") && v.getAttribute("data-src")) v.setAttribute("src", v.getAttribute("data-src"));
          if (reduce) {
            v.controls = true;
            return;
          }
          if (inView) {
            var p = v.play();
            if (p && p.catch) p.catch(function () {});
          } else v.pause();
        } else {
          v.pause();
        }
      });
    }
    function go(i, focusless) {
      cur = (i + n) % n;
      slides.forEach(function (s, k) {
        var on = k === cur;
        s.classList.toggle("is-active", on);
        if (on) s.removeAttribute("inert");
        else s.setAttribute("inert", "");
      });
      dots.forEach(function (d, k) {
        if (k === cur) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
      if (label) label.textContent = pad(cur + 1) + " / " + pad(n);
      syncVideo();
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    function start() {
      stop();
      if (userPaused || hoverPause || !inView || n < 2) return;
      var v = vid(slides[cur]);
      timer = setInterval(
        function () {
          go(cur + 1);
        },
        v ? 9000 : 6000
      );
    }
    function setPaused(p) {
      userPaused = p;
      if (playBtn) {
        playBtn.setAttribute("aria-pressed", p ? "true" : "false");
        playBtn.setAttribute("aria-label", p ? "Start automatic rotation" : "Pause automatic rotation");
      }
      start();
    }

    root.querySelector("[data-prev]").addEventListener("click", function () {
      go(cur - 1);
      start();
    });
    root.querySelector("[data-next]").addEventListener("click", function () {
      go(cur + 1);
      start();
    });
    dots.forEach(function (d, k) {
      d.addEventListener("click", function () {
        go(k);
        start();
      });
    });
    if (playBtn)
      playBtn.addEventListener("click", function () {
        setPaused(!userPaused);
      });
    if (n < 2)
      root.querySelectorAll("[data-prev],[data-next],[data-play],.hc__dots,[data-count-label]").forEach(function (e) {
        e.hidden = true;
      });

    root.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") {
        go(cur - 1);
        start();
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        go(cur + 1);
        start();
        e.preventDefault();
      } else if (e.key === "Home") {
        go(0);
        start();
        e.preventDefault();
      } else if (e.key === "End") {
        go(n - 1);
        start();
        e.preventDefault();
      }
    });
    root.addEventListener("mouseenter", function () {
      hoverPause = true;
      stop();
    });
    root.addEventListener("mouseleave", function () {
      hoverPause = false;
      start();
    });
    root.addEventListener("focusin", function () {
      hoverPause = true;
      stop();
    });
    root.addEventListener("focusout", function (e) {
      if (!root.contains(e.relatedTarget)) {
        hoverPause = false;
        start();
      }
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (es) {
          inView = es[0].isIntersecting;
          syncVideo();
          start();
        },
        { threshold: 0.35 }
      ).observe(root);
    }

    /* swipe (touch / pen): horizontal drag > 40px changes slide */
    var stageEl = root.querySelector(".hc__stage");
    if (stageEl) {
      var sx = null,
        sy = 0;
      stageEl.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse") return;
        sx = e.clientX;
        sy = e.clientY;
      });
      stageEl.addEventListener("pointerup", function (e) {
        if (sx === null) return;
        var dx = e.clientX - sx,
          dy = e.clientY - sy;
        sx = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          go(cur + (dx < 0 ? 1 : -1));
          start();
        }
      });
      stageEl.addEventListener("pointercancel", function () {
        sx = null;
      });
    }
    setPaused(userPaused);
    go(0);
  });
})();

/* ---- Studio stage: icon wall -> static Math Studio iframe + drawer ----
 * Protocol (assets/apps/math-studio/README-portfolio.md): parent -> {type:'go',route} {type:'theme',theme};
 * iframe -> {type:'studio-ready'} {type:'studio-route',route} {type:'studio-project',slug,title,route,url}.
 * Not active on phones / narrow windows (<= 860px): the iframe is never created and tiles stay plain links to /studio/#route. */
(function () {
  "use strict";
  var stage = document.querySelector("[data-stage]");
  if (!stage) return;
  var root = document.documentElement;
  var mq = window.matchMedia("(max-width: 860px)");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var app = stage.getAttribute("data-app");
  var studioPage = stage.getAttribute("data-studio");
  var frame = stage.querySelector("[data-stage-frame]");
  var statusEl = stage.querySelector("[data-stage-status]");
  var routeEl = stage.querySelector("[data-stage-route]");
  var fullLink = stage.querySelector("[data-stage-full]");
  var galleryBtn = stage.querySelector("[data-stage-gallery]");
  var drawer = stage.querySelector("[data-drawer]");
  var dTitle = drawer.querySelector("[data-drawer-title]");
  var dChips = drawer.querySelector("[data-drawer-chips]");
  var dDesc = drawer.querySelector("[data-drawer-desc]");
  var dFull = drawer.querySelector("[data-drawer-full]");
  var dRead = drawer.querySelector("[data-drawer-read]");
  var dClose = drawer.querySelector("[data-drawer-close]");
  var tiles = Array.prototype.slice.call(stage.querySelectorAll(".hi__tile"));
  var LABELS = { uq: "UQ", sciml: "SciML", cfd: "CFD" };
  var active = false,
    ready = false,
    loaded = false,
    pending = null,
    lastRoute = "gallery",
    lastTile = null;

  function theme() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function label(c) {
    return LABELS[c] || c.charAt(0).toUpperCase() + c.slice(1);
  }
  function send(msg) {
    try {
      frame.contentWindow.postMessage(msg, location.origin);
    } catch (e) {}
  }
  function setRoute(r) {
    lastRoute = r || "gallery";
    routeEl.textContent = "#" + lastRoute;
    fullLink.href = studioPage + (lastRoute === "gallery" ? "" : "#" + lastRoute);
    tiles.forEach(function (t) {
      t.classList.toggle("is-active", !!t.getAttribute("data-route") && t.getAttribute("data-route") === lastRoute);
    });
  }
  function load(route) {
    if (frame.getAttribute("src")) return;
    frame.src = app + "?embed=1&portfolio=1&theme=" + theme() + "#" + (route || "gallery");
  }
  function go(route) {
    route = route || "gallery";
    setRoute(route);
    if (!frame.getAttribute("src")) {
      load(route);
      return;
    }
    if (ready) send({ type: "go", route: route });
    else pending = route;
  }

  /* drawer */
  function openDrawer(d, from) {
    lastTile = from || null;
    dTitle.textContent = d.title || "";
    dChips.textContent = "";
    (d.cats || []).forEach(function (c) {
      var li = document.createElement("li");
      li.textContent = label(c);
      li.style.setProperty("--c", "var(--cat-" + c + ", var(--teal))");
      dChips.appendChild(li);
    });
    dDesc.textContent = d.desc || "";
    dFull.href = studioPage + (d.route ? "#" + d.route : "");
    dRead.href = d.url;
    drawer.hidden = false;
    dTitle.focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    if (lastTile && document.contains(lastTile)) lastTile.focus({ preventScroll: true });
    lastTile = null;
  }
  function tileData(t) {
    return {
      slug: t.getAttribute("data-slug"),
      title: t.getAttribute("data-title"),
      cats: (t.getAttribute("data-cats") || "").split(",").filter(Boolean),
      desc: t.getAttribute("data-desc") || "",
      route: t.getAttribute("data-route") || "",
      url: t.getAttribute("data-url"),
    };
  }
  function scrollToStage() {
    stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function onTile(e) {
    if (!active) return;
    var t = e.currentTarget;
    var d = tileData(t);
    if (!d.route) return; /* no Studio route: the tile's href is the project page */
    e.preventDefault();
    go(d.route);
    scrollToStage();
    openDrawer(d, t);
  }
  tiles.forEach(function (t) {
    t.addEventListener("click", onTile);
  });
  dClose.addEventListener("click", closeDrawer);
  drawer.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDrawer();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && active) closeDrawer();
  });
  galleryBtn.addEventListener("click", function () {
    go("gallery");
  });
  Array.prototype.slice.call(stage.querySelectorAll("[data-stage-go]")).forEach(function (b) {
    b.addEventListener("click", function () {
      go(b.getAttribute("data-stage-go"));
    });
  });

  /* theme relay */
  new MutationObserver(function () {
    if (active && ready) send({ type: "theme", theme: theme() });
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* iframe -> page */
  window.addEventListener("message", function (ev) {
    if (!active || ev.source !== frame.contentWindow || ev.origin !== location.origin || !ev.data || typeof ev.data !== "object") return;
    var d = ev.data;
    if (d.type === "studio-ready") {
      ready = true;
      statusEl.textContent = "Studio: live";
      statusEl.classList.add("is-on");
      send({ type: "theme", theme: theme() });
      if (pending) {
        send({ type: "go", route: pending });
        pending = null;
      }
    } else if (d.type === "studio-route" && typeof d.route === "string") {
      setRoute(d.route);
    } else if (d.type === "studio-project") {
      if (!d.route) {
        if (d.url) location.href = d.url;
        return;
      }
      var t = tiles.filter(function (x) {
        return x.getAttribute("data-slug") === d.slug;
      })[0];
      var data = t ? tileData(t) : { slug: d.slug, title: d.title, cats: [], desc: "", route: d.route, url: d.url };
      if (!data.route) data.route = d.route;
      openDrawer(data, null);
    }
  });
  frame.addEventListener("load", function () {
    loaded = true;
    if (!ready) send({ type: "ping" });
    if (!ready) send({ type: "theme", theme: theme() });
  });

  /* activate on wide viewports only; lazy-load when near the viewport */
  var io = null;
  function activate() {
    if (active || mq.matches) return;
    active = true;
    tiles.forEach(function (t) {
      if (t.getAttribute("data-route")) t.setAttribute("role", "button");
    });
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        function (es) {
          if (es[0].isIntersecting) {
            io.disconnect();
            load("gallery");
          }
        },
        { rootMargin: "700px 0px" }
      );
      io.observe(stage);
    } else load("gallery");
  }
  function deactivate() {
    active = false;
    tiles.forEach(function (t) {
      t.removeAttribute("role");
    });
    closeDrawer();
  }
  var onMq = function () {
    if (mq.matches) deactivate();
    else activate();
  };
  if (mq.addEventListener) mq.addEventListener("change", onMq);
  else if (mq.addListener) mq.addListener(onMq);
  activate();
})();

/* ---- Studio guide (WP-I): 4-step looping guide. Live only with effects on and motion allowed; otherwise a static storyboard. ---- */
(function () {
  var root = document.querySelector("[data-guide]");
  if (!root) return;
  var $ = function (s) {
    return root.querySelector(s);
  };
  var scenes = Array.prototype.slice.call(root.querySelectorAll("[data-g-scene]"));
  var steps = Array.prototype.slice.call(root.querySelectorAll("[data-g-step]"));
  var body = $("[data-g-body]");
  var toggle = $("[data-g-toggle]");
  var playBtn = $("[data-g-play]");
  var count = $("[data-g-count]");
  var say = $("[data-g-live]");
  var reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  var phoneMq = window.matchMedia("(max-width: 860px)");
  var n = scenes.length;
  var cur = 0,
    live = false,
    userPaused = false,
    hover = false,
    focused = false,
    inView = false,
    collapsed = false,
    chosen = false;
  var labels = steps.map(function (s) {
    return s.querySelector(".hg__lbl").textContent;
  });

  function store(v) {
    try {
      if (v === undefined) return sessionStorage.getItem("hg-collapsed");
      sessionStorage.setItem("hg-collapsed", v);
    } catch (e) {
      return null;
    }
  }
  function videoOf(i) {
    return scenes[i].querySelector("[data-g-video]");
  }
  function load(v) {
    if (!v || v.getAttribute("src")) return;
    v.setAttribute("src", v.getAttribute("data-src"));
    v.preload = "auto";
    v.addEventListener("playing", function () {
      v.classList.add("is-playing");
    });
  }
  function running() {
    return live && !collapsed && inView && !userPaused && !hover && !focused && !document.hidden;
  }
  function sync() {
    var run = running();
    root.classList.toggle("is-paused", !run);
    scenes.forEach(function (s, i) {
      var v = videoOf(i);
      if (!v || !v.getAttribute("src")) return;
      if (run && i === cur) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else v.pause();
    });
  }
  function announce(txt) {
    if (!say) return;
    say.setAttribute("aria-live", "polite");
    say.textContent = txt;
  }
  function show(i, user) {
    i = ((i % n) + n) % n;
    var changed = i !== cur || !root.classList.contains("is-shown");
    cur = i;
    root.classList.add("is-shown");
    void root.offsetWidth; /* restart the CSS progress and cursor animations */
    scenes.forEach(function (s, k) {
      var on = k === cur;
      s.classList.toggle("is-cur", on);
      if (live) {
        if (on) {
          s.removeAttribute("inert");
          s.removeAttribute("aria-hidden");
        } else {
          s.setAttribute("inert", "");
          s.setAttribute("aria-hidden", "true");
        }
      }
    });
    steps.forEach(function (s, k) {
      if (k === cur) s.setAttribute("aria-current", "step");
      else s.removeAttribute("aria-current");
    });
    if (count) count.textContent = cur + 1 + " / " + n;
    var v = videoOf(cur);
    load(v);
    load(videoOf((cur + 1) % n));
    if (v && changed) {
      try {
        v.currentTime = 0;
      } catch (e) {}
    }
    sync();
    if (user) announce("Step " + (cur + 1) + " of " + n + ": " + labels[cur]);
  }
  function setLive() {
    var want = document.documentElement.getAttribute("data-fx") === "on" && !reduceMq.matches;
    if (want === live && root.classList.contains("is-js")) return;
    live = want;
    root.classList.add("is-js");
    root.classList.toggle("is-live", live);
    if (toggle) toggle.hidden = false;
    if (live) {
      show(cur, false);
    } else {
      scenes.forEach(function (s) {
        s.removeAttribute("inert");
        s.removeAttribute("aria-hidden");
        s.classList.remove("is-cur");
      });
      root.classList.remove("is-shown");
      sync();
    }
    if (!chosen) setCollapsed(store() === null ? !live && phoneMq.matches : store() === "1", true);
  }
  function setCollapsed(c, auto) {
    collapsed = c;
    body.hidden = c;
    toggle.setAttribute("aria-expanded", c ? "false" : "true");
    toggle.textContent = c ? "Show guide" : "Hide guide";
    if (!auto) {
      chosen = true;
      store(c ? "1" : "0");
    }
    sync();
  }

  steps.forEach(function (s, i) {
    s.addEventListener("click", function () {
      show(i, true);
    });
  });
  $("[data-g-prev]").addEventListener("click", function () {
    show(cur - 1, true);
  });
  $("[data-g-next]").addEventListener("click", function () {
    show(cur + 1, true);
  });
  playBtn.addEventListener("click", function () {
    userPaused = !userPaused;
    playBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
    playBtn.setAttribute("aria-label", userPaused ? "Play" : "Pause");
    sync();
    announce(userPaused ? "Paused" : "Playing");
  });
  toggle.addEventListener("click", function () {
    setCollapsed(!collapsed, false);
  });
  /* the progress bar ends: next step */
  root.addEventListener("animationend", function (e) {
    if (e.animationName === "hg-fill" && live && running()) show(cur + 1, false);
  });
  /* pause on hover (mouse) and keyboard focus */
  root.addEventListener("pointerenter", function (e) {
    if (e.pointerType === "mouse") {
      hover = true;
      sync();
    }
  });
  root.addEventListener("pointerleave", function () {
    hover = false;
    sync();
  });
  root.addEventListener("focusin", function (e) {
    var vis = false;
    try {
      vis = e.target.matches(":focus-visible");
    } catch (x) {}
    focused = vis;
    sync();
  });
  root.addEventListener("focusout", function () {
    focused = false;
    sync();
  });
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (es) {
        inView = es[0].isIntersecting;
        sync();
      },
      { threshold: 0.25 }
    ).observe(root);
  } else inView = true;
  document.addEventListener("fx:change", setLive);
  if (reduceMq.addEventListener) reduceMq.addEventListener("change", setLive);
  setLive();
})();

/* ---- Under the hood (WP-K): hidden-by-default explainer panel, sparse-matrix heat map, live dashboard for the fluid hero ----
   Live polling (4 Hz) and the divergence probe (1 Hz, in fluid.js) run only while the panel is open, the tab is visible and effects are "on".
   With effects lite/off or reduced motion the panel is static and offers a single "Read the numbers once" reading instead. */
(function () {
  var root = document.querySelector("[data-under-hood]");
  if (!root) return;
  var btn = root.querySelector(".uh__btn");
  var panel = root.querySelector(".uh__panel");
  if (!btn || !panel) return;
  var html = document.documentElement;
  var phone = window.matchMedia("(max-width: 720px)");
  var reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  var KEY = "uh-open";
  var open = false,
    katexTried = false,
    tickTimer = 0,
    onceTimer = 0;
  var hist = [],
    sparkB = [],
    sparkA = [],
    lastProbeT = 0,
    lastStats = null;

  function lsGet() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function lsSet(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {}
  }
  function css(name) {
    return getComputedStyle(html).getPropertyValue(name).trim() || "#888";
  }
  function fxMode() {
    return html.dataset.fx || "on";
  }
  function isLive() {
    return fxMode() === "on" && !reduceMq.matches;
  }
  function motionOk() {
    return fxMode() !== "off" && !reduceMq.matches;
  }
  function $(sel) {
    return panel.querySelector(sel);
  }

  /* ---- KaTeX (local copy that Math Studio ships), loaded on first open ---- */
  function loadKatex() {
    if (katexTried) return;
    katexTried = true;
    var eqs = panel.querySelectorAll(".uh-eq[data-tex]");
    function render() {
      if (!window.katex) return;
      eqs.forEach(function (el) {
        try {
          window.katex.render(el.getAttribute("data-tex"), el, { displayMode: true, throwOnError: false, output: "htmlAndMathml" });
          el.classList.add("is-tex");
          el.setAttribute("tabindex", "0");
        } catch (e) {}
      });
    }
    if (window.katex) return render();
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = panel.getAttribute("data-katex-css");
    document.head.appendChild(l);
    var s = document.createElement("script");
    s.src = panel.getAttribute("data-katex-js");
    s.onload = render;
    document.head.appendChild(s);
  }

  /* ---- the sparse matrix ---- */
  var mxCv = $("[data-uh-mx]"),
    mxRead = $("[data-uh-read]"),
    mxNnz = $("[data-uh-nnz]"),
    mxSel = $("[data-uh-n]");
  var N = 6,
    sel = { r: 0, c: 0 };
  function entry(r, c) {
    var i = r % N,
      j = Math.floor(r / N),
      ci = c % N,
      cj = Math.floor(c / N);
    if (r === c) return -4 + (i === 0) + (j === 0) + (j === N - 1);
    if (cj === j && ci === i - 1) return 1;
    if (cj === j && ci === i + 1) return 1;
    if (ci === i && cj === j - 1) return 1;
    if (ci === i && cj === j + 1) return 1;
    return 0;
  }
  function nnz() {
    var n = 0,
      M = N * N;
    for (var r = 0; r < M; r++) for (var c = Math.max(0, r - N); c <= Math.min(M - 1, r + N); c++) if (entry(r, c) !== 0) n++;
    return n;
  }
  function drawMatrix() {
    if (!mxCv) return;
    var M = N * N,
      box = mxCv.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    var px = Math.max(60, Math.round(box.width * dpr));
    if (mxCv.width !== px) {
      mxCv.width = px;
      mxCv.height = px;
    }
    var g = mxCv.getContext("2d"),
      cell = px / M;
    g.clearRect(0, 0, px, px);
    var teal = css("--teal"),
      amber = css("--amber"),
      grid = css("--border"),
      ink = css("--text");
    g.fillStyle = css("--field");
    g.fillRect(0, 0, px, px);
    // selected row and column tint
    g.fillStyle = grid;
    g.globalAlpha = 0.35;
    g.fillRect(0, sel.r * cell, px, cell);
    g.fillRect(sel.c * cell, 0, cell, px);
    g.globalAlpha = 1;
    // block lines: one block of N rows per grid row
    g.strokeStyle = grid;
    g.lineWidth = Math.max(1, dpr * 0.75);
    g.beginPath();
    for (var b = N; b < M; b += N) {
      g.moveTo(b * cell, 0);
      g.lineTo(b * cell, px);
      g.moveTo(0, b * cell);
      g.lineTo(px, b * cell);
    }
    g.stroke();
    var pad = cell > 6 ? 0.5 * dpr : 0;
    for (var r = 0; r < M; r++) {
      for (var c = Math.max(0, r - N); c <= Math.min(M - 1, r + N); c++) {
        var v = entry(r, c);
        if (!v) continue;
        if (v === 1) {
          g.fillStyle = teal;
          g.globalAlpha = 1;
        } else {
          g.fillStyle = amber;
          g.globalAlpha = 0.45 + 0.55 * (Math.abs(v) / 4);
        }
        g.fillRect(c * cell + pad, r * cell + pad, cell - 2 * pad, cell - 2 * pad);
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = ink;
    g.lineWidth = 2 * dpr;
    g.strokeRect(sel.c * cell + dpr, sel.r * cell + dpr, cell - 2 * dpr, cell - 2 * dpr);
    g.strokeStyle = grid;
    g.lineWidth = dpr;
    g.strokeRect(0.5, 0.5, px - 1, px - 1);
  }
  function describeRow(r) {
    var i = r % N,
      j = Math.floor(r / N),
      walls = [];
    if (i === 0) walls.push("left wall");
    if (j === 0) walls.push("bottom wall");
    if (j === N - 1) walls.push("top wall");
    var s = walls.length ? "touches the " + walls.join(" and ") + " (zero-gradient)" : "is an interior cell";
    if (i === N - 1) s += (walls.length ? "; also" : ";") + " sits on the outlet column (p = 0 beyond it)";
    return s;
  }
  function explain() {
    var r = sel.r,
      c = sel.c,
      v = entry(r, c),
      i = r % N,
      j = Math.floor(r / N),
      ci = c % N,
      cj = Math.floor(c / N);
    var t =
      "Row <b>" +
      r +
      "</b> is cell (i=" +
      i +
      ", j=" +
      j +
      "), column <b>" +
      c +
      "</b> is cell (" +
      ci +
      ", " +
      cj +
      "). Entry <b>" +
      (v > 0 ? "+" + v : v) +
      "</b>. ";
    if (r === c) {
      var k = 4 + v;
      t +=
        "Diagonal: -4 for the cell itself" +
        (k ? ", plus " + k + " from " + k + " wall" + (k > 1 ? "s" : "") + " where the missing neighbour is replaced by the cell" : "") +
        ". This cell " +
        describeRow(r) +
        ".";
    } else if (v === 1) {
      var d = ci === i - 1 ? "left (L)" : ci === i + 1 ? "right (R)" : cj === j - 1 ? "bottom (B)" : "top (T)";
      t += "Coefficient of the " + d + " neighbour's pressure in this cell's equation.";
    } else {
      t += "Zero: these two cells are not adjacent, so their pressures are not coupled. Row " + r + " " + describeRow(r) + ".";
    }
    mxRead.innerHTML = t;
    mxCv.setAttribute("aria-label", "Pressure matrix, " + N * N + " by " + N * N + ". Selected row " + r + ", column " + c + ", value " + v + ".");
  }
  function setN(n) {
    N = n;
    var M = N * N;
    sel.r = sel.c = N * Math.floor(N / 2) + Math.floor(N / 2);
    mxNnz.textContent = nnz() + " nonzeros of " + M * M + " (" + ((100 * nnz()) / (M * M)).toFixed(1) + "%)";
    drawMatrix();
    explain();
  }
  function pick(ev) {
    var b = mxCv.getBoundingClientRect(),
      M = N * N;
    var c = Math.floor(((ev.clientX - b.left) / b.width) * M),
      r = Math.floor(((ev.clientY - b.top) / b.height) * M);
    if (r < 0 || c < 0 || r >= M || c >= M) return;
    if (r !== sel.r || c !== sel.c) {
      sel.r = r;
      sel.c = c;
      drawMatrix();
      explain();
    }
  }
  if (mxCv) {
    mxCv.addEventListener("pointermove", pick);
    mxCv.addEventListener("pointerdown", pick);
    mxCv.addEventListener("keydown", function (e) {
      var M = N * N,
        d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      sel.c = Math.max(0, Math.min(M - 1, sel.c + d[0]));
      sel.r = Math.max(0, Math.min(M - 1, sel.r + d[1]));
      drawMatrix();
      explain();
    });
    mxSel.addEventListener("change", function () {
      setN(parseInt(mxSel.value, 10) || 6);
    });
    if ("ResizeObserver" in window)
      new ResizeObserver(function () {
        if (open) drawMatrix();
      }).observe(mxCv);
    new MutationObserver(function () {
      if (open) {
        drawMatrix();
        drawSpark();
      }
    }).observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  }

  /* ---- live dashboard ---- */
  var live = $("[data-uh-live]"),
    note = $("[data-uh-dnote]"),
    once = $("[data-uh-once]"),
    spark = $("[data-uh-spark]");
  var fluidEl = document.querySelector('.hero-switch [data-hero="fluid"]');
  function api() {
    var a = fluidEl && fluidEl.__fluid;
    return a && a.getStats ? a : null;
  }
  function fmt(v, d) {
    return isFinite(v) ? v.toFixed(d) : "-";
  }
  function sci(v) {
    return isFinite(v) ? (v === 0 ? "0" : v.toExponential(1)) : "-";
  }
  function setK(k, v) {
    var e = $('[data-k="' + k + '"]');
    if (e && e.textContent !== v) e.textContent = v;
  }
  function status() {
    // which situation are we in? returns [state, message]
    if (!fluidEl || fluidEl.hidden)
      return [
        "other",
        "The live dashboard belongs to the fluid hero. This page is showing a different hero (?hero=), so only the equations and the matrix apply here.",
      ];
    if (fluidEl.dataset.fluidFallback)
      return [
        "nogl",
        "WebGL2 is not available in this browser, so the hero is drawn with 2D streamlines instead of the solver. The equations and the matrix still describe the method; there are no live numbers.",
      ];
    if (!api()) return ["wait", "Waiting for the fluid hero to start."];
    return ["ok", ""];
  }
  function render(s) {
    lastStats = s;
    setK("grid", s.grid ? s.grid[0] + " × " + s.grid[1] : "-");
    setK("tier", String(s.tier));
    setK("iters", String(s.iters));
    var p = s.probe;
    if (p) {
      setK("dt", fmt(p.dt * 1000, 1) + " ms");
      setK("cfl", fmt(p.cfl, 2));
      setK("db", sci(p.divBefore) + " /s");
      setK("da", sci(p.divAfter) + " /s");
    } else {
      setK("dt", "-");
      setK("cfl", "-");
      setK("db", "-");
      setK("da", "-");
    }
    setK("ms", s.msMedian ? fmt(s.msMedian, 1) + " ms" : "-");
  }
  function tick() {
    var st = status(),
      a = st[0] === "ok" ? api() : null;
    note.textContent = st[1];
    live.hidden = st[0] !== "ok";
    if (!a) return;
    var s = a.getStats();
    hist.push({ t: s.t, f: s.frames });
    while (hist.length > 6 && s.t - hist[1].t > 1000) hist.shift();
    var h0 = hist[0];
    setK("fps", s.running && s.t - h0.t > 400 ? fmt(((s.frames - h0.f) * 1000) / (s.t - h0.t), 0) : "-");
    render(s);
    if (s.static) note.textContent = "The simulation is not running (static frame), so frame rate and divergence are not measured.";
    else if (!s.running) note.textContent = "The hero is paused (scrolled out of view or tab hidden); the numbers are the last ones measured.";
    else if (!s.probe) note.textContent = "Waiting for the first divergence reading (one per second).";
    else note.textContent = "";
    if (s.probe && s.probe.t !== lastProbeT) {
      lastProbeT = s.probe.t;
      sparkB.push(s.probe.divBefore);
      sparkA.push(s.probe.divAfter);
      if (sparkB.length > 60) {
        sparkB.shift();
        sparkA.shift();
      }
      drawSpark();
    }
  }
  function drawSpark() {
    if (!spark || !isLive() || sparkA.length < 2) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2),
      box = spark.getBoundingClientRect();
    var W = Math.max(120, Math.round(box.width * dpr)),
      Hh = Math.round((W * 84) / 320);
    if (spark.width !== W) {
      spark.width = W;
      spark.height = Hh;
    }
    var g = spark.getContext("2d");
    g.clearRect(0, 0, W, Hh);
    var all = sparkA.concat(sparkB).map(function (v) {
      return Math.log10(Math.max(v, 1e-6));
    });
    var lo = Math.floor(Math.min.apply(null, all)),
      hi = Math.ceil(Math.max.apply(null, all));
    if (hi - lo < 1) hi = lo + 1;
    var padL = 34 * dpr,
      padR = 6 * dpr,
      padT = 6 * dpr,
      padB = 6 * dpr;
    function Y(v) {
      return padT + (1 - (Math.log10(Math.max(v, 1e-6)) - lo) / (hi - lo)) * (Hh - padT - padB);
    }
    g.strokeStyle = css("--border");
    g.fillStyle = css("--muted");
    g.lineWidth = dpr;
    g.font = 10 * dpr + "px " + (getComputedStyle(html).getPropertyValue("--font-mono") || "monospace");
    g.textBaseline = "middle";
    for (var e = lo; e <= hi; e++) {
      var y = Y(Math.pow(10, e));
      g.beginPath();
      g.moveTo(padL, y);
      g.lineTo(W - padR, y);
      g.stroke();
      g.fillText("1e" + e, 2 * dpr, y);
    }
    function line(arr, col) {
      g.strokeStyle = col;
      g.lineWidth = 2 * dpr;
      g.beginPath();
      arr.forEach(function (v, i) {
        var x = padL + (i / 59) * (W - padL - padR);
        i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v));
      });
      g.stroke();
    }
    line(sparkB, css("--amber"));
    line(sparkA, css("--teal"));
  }
  function stopLive() {
    clearInterval(tickTimer);
    tickTimer = 0;
    clearTimeout(onceTimer);
    var a = api();
    if (a) a.probe(false);
  }
  function startLive() {
    stopLive();
    if (!open) return;
    var liveMode = isLive();
    once.hidden = liveMode;
    if (!liveMode) {
      var st = status();
      note.textContent = st[1] || "Live polling is off in this effects mode. Use the button for a single reading.";
      live.hidden = st[0] !== "ok";
      once.hidden = st[0] !== "ok";
      var a0 = api();
      if (a0) render(a0.getStats());
      return;
    }
    if (document.hidden) return;
    var a = api();
    if (a) a.probe(true);
    tick();
    tickTimer = setInterval(function () {
      var a2 = api();
      if (a2 && !document.hidden) a2.probe(true);
      tick();
    }, 250);
  }
  var sampleBtn = $("[data-uh-sample]");
  if (sampleBtn)
    sampleBtn.addEventListener("click", function () {
      var a = api();
      if (!a) return;
      a.probe(true);
      sampleBtn.disabled = true;
      var t0 = performance.now();
      (function wait() {
        var s = a.getStats();
        if ((s.probe && s.probe.t >= t0) || performance.now() - t0 > 2000 || !s.running) {
          a.probe(false);
          render(s);
          setK("fps", "-");
          note.textContent =
            s.probe && s.probe.t >= t0 ? "Single reading, taken just now." : "No divergence reading was possible (the simulation is not stepping).";
          sampleBtn.disabled = false;
          return;
        }
        onceTimer = setTimeout(wait, 100);
      })();
    });
  document.addEventListener("visibilitychange", function () {
    if (open) startLive();
  });
  document.addEventListener("fx:change", function () {
    if (open) startLive();
  });
  if (reduceMq.addEventListener)
    reduceMq.addEventListener("change", function () {
      if (open) startLive();
    });

  /* ---- open / close ---- */
  var closeT = 0;
  function setOpen(v, o) {
    o = o || {};
    if (v === open) return;
    open = v;
    clearTimeout(closeT);
    btn.setAttribute("aria-expanded", v ? "true" : "false");
    if (o.remember !== false) lsSet(v ? "1" : "0");
    if (v) {
      panel.hidden = false;
      void panel.offsetHeight;
      panel.classList.add("is-open");
      loadKatex();
      if (!mxCv.dataset.ready) {
        mxCv.dataset.ready = "1";
        setN(parseInt(mxSel.value, 10) || 6);
      } else drawMatrix();
      startLive();
      if (o.focus && phone.matches) {
        var c = panel.querySelector("[data-uh-close]");
        if (c) c.focus({ preventScroll: true });
      }
    } else {
      stopLive();
      panel.classList.remove("is-open");
      var done = function () {
        if (!open) panel.hidden = true;
      };
      if (motionOk()) closeT = setTimeout(done, 420);
      else done();
      if (o.focus && panel.contains(document.activeElement)) btn.focus({ preventScroll: true });
    }
  }
  btn.addEventListener("click", function () {
    setOpen(!open, { focus: true });
  });
  panel.querySelector("[data-uh-close]").addEventListener("click", function () {
    setOpen(false, { focus: true });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open) {
      setOpen(false, { focus: true });
    }
  });
  // remembered state: restored on wide screens only (on phones the panel is a sheet that would cover the hero on load)
  if (lsGet() === "1" && !phone.matches) setOpen(true, { remember: false });
})();
