/* Showreel player. Reads the clip list from the server-rendered grid (li[data-clip]); no network beyond same-origin media.
   Two stacked <video> layers crossfade; only the next clip is preloaded. Reduced motion: no stage, no autoplay, tiles play inline. */
(function () {
  "use strict";
  var root = document.querySelector("[data-reel]");
  if (!root) return;
  var $ = function (s, c) {
    return (c || root).querySelector(s);
  };
  var tiles = Array.prototype.slice.call(root.querySelectorAll("[data-clip]"));
  if (!tiles.length) return;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var pad = function (n, w) {
    n = String(n);
    while (n.length < (w || 2)) n = "0" + n;
    return n;
  };
  var clips = tiles.map(function (li) {
    var d = li.dataset;
    return { video: d.video, poster: d.poster, title: d.title, cat: d.cat, caption: d.caption, url: d.url, studio: d.studio || "" };
  });

  /* ---------- tile play (index grid; the whole experience under reduced motion) ---------- */
  function tilePlay(li) {
    var media = li.querySelector(".reel-tile__media");
    if (!media || media.querySelector("video")) return;
    var v = document.createElement("video");
    v.src = li.dataset.video;
    v.poster = li.dataset.poster;
    v.controls = true;
    v.playsInline = true;
    v.preload = "auto";
    v.loop = true;
    v.setAttribute("aria-label", li.dataset.title);
    media.appendChild(v);
    media.classList.add("is-playing");
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
    var btn = media;
    btn.removeAttribute("data-tile-play");
    btn.setAttribute("tabindex", "-1");
    btn.setAttribute("aria-hidden", "true");
  }

  var MAX = 8; /* seconds per clip in the sequence */
  var useStage = !reduced.matches;
  var stage = $("[data-stage]");
  if (!useStage || !stage) {
    tiles.forEach(function (li, i) {
      li.querySelector("[data-tile-play]").addEventListener("click", function () {
        tilePlay(li);
      });
    });
    return;
  }
  root.classList.add("is-ready");

  var layers = Array.prototype.slice.call(stage.querySelectorAll(".reel-layer"));
  var vids = layers.map(function (l) {
    return l.querySelector("video");
  });
  var ui = {
    cat: $("[data-lt-cat]"),
    n: $("[data-lt-n]"),
    title: $("[data-lt-title]"),
    cap: $("[data-lt-cap]"),
    open: $("[data-lt-open]"),
    studio: $("[data-lt-studio]"),
    lt: $("[data-lt]"),
    seg: $("[data-seg]"),
    tc: $("[data-tc]"),
    count: $("[data-count-label]"),
    play: $("[data-play]"),
    mute: $("[data-mute]"),
    fs: $("[data-fs]"),
    start: $("[data-start]"),
    startLabel: $("[data-start-label]"),
  };
  var total = clips.length;
  var st = { idx: -1, active: 0, muted: true, userPaused: false, sysPaused: false, blocked: false, pending: -1, token: 0, fade: 0, ended: false };
  var starts = [];
  var segFills = [];

  /* segmented progress: one clickable segment per clip */
  clips.forEach(function (c, i) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", "Clip " + (i + 1) + " of " + total + ": " + c.title);
    b.title = pad(i + 1) + " " + c.title;
    var f = document.createElement("span");
    f.className = "reel-seg__fill";
    b.appendChild(f);
    b.addEventListener("click", function () {
      go(i, true);
    });
    li.appendChild(b);
    ui.seg.appendChild(li);
    segFills.push(f);
  });

  function est(i) {
    var v = clips[i].dur;
    return Math.min(MAX, v && isFinite(v) ? v : MAX);
  }
  function offsetOf(i) {
    var t = 0;
    for (var k = 0; k < i; k++) t += est(k);
    return t;
  }
  function tcString(sec) {
    sec = Math.max(0, sec);
    var w = Math.floor(sec);
    var ff = Math.min(23, Math.floor((sec - w) * 24 + 1e-6));
    return pad(Math.floor(w / 3600)) + ":" + pad(Math.floor((w % 3600) / 60)) + ":" + pad(w % 60) + ":" + pad(ff);
  }

  function setUi(i) {
    var c = clips[i];
    ui.cat.textContent = c.cat || "";
    ui.cat.hidden = !c.cat;
    ui.n.textContent = pad(i + 1) + " / " + pad(total);
    ui.count.textContent = pad(i + 1) + " / " + pad(total);
    ui.title.textContent = c.title;
    ui.cap.textContent = c.caption && c.caption !== c.title ? c.caption : "";
    ui.open.href = c.url;
    ui.open.setAttribute("aria-label", "Open project: " + c.title);
    ui.studio.hidden = !c.studio;
    if (c.studio) {
      ui.studio.href = c.studio;
      ui.studio.setAttribute("aria-label", "Explore in Studio: " + c.title);
    }
    ui.lt.classList.remove("is-in");
    void ui.lt.offsetWidth;
    ui.lt.classList.add("is-in");
    segFills.forEach(function (f, k) {
      f.style.transform = "scaleX(" + (k < i ? 1 : 0) + ")";
      f.parentNode.removeAttribute("aria-current");
      f.parentNode.classList.toggle("is-done", k < i);
    });
    segFills[i].parentNode.setAttribute("aria-current", "true");
    stage.setAttribute("aria-label", "Showreel, clip " + (i + 1) + " of " + total);
  }

  function setPlayUi() {
    var playing = !st.userPaused && !st.blocked;
    ui.play.classList.toggle("is-paused", !playing);
    ui.play.setAttribute("aria-label", playing ? "Pause" : "Play");
    ui.mute.setAttribute("aria-pressed", String(st.muted));
    ui.mute.setAttribute("aria-label", st.muted ? "Unmute" : "Mute");
    ui.mute.classList.toggle("is-muted", st.muted);
    ui.start.hidden = !st.blocked;
    root.classList.toggle("is-paused", !playing);
  }

  function activeVideo() {
    return vids[st.active];
  }

  function tryPlay(v) {
    var p;
    try {
      p = v.play();
    } catch (e) {
      p = null;
    }
    if (p && p.then) {
      p.then(
        function () {
          if (st.blocked) {
            st.blocked = false;
            setPlayUi();
          }
        },
        function (err) {
          if (err && err.name === "AbortError") return;
          st.blocked = true;
          setPlayUi();
        }
      );
    }
  }

  function shouldPlay() {
    return !st.userPaused && !st.sysPaused;
  }

  /* Load clip i into the idle layer and crossfade to it when it shows its first frame. */
  function go(i, cut) {
    i = ((i % total) + total) % total;
    var myToken = ++st.token;
    var nextLayer = 1 - st.active;
    if (st.idx < 0) nextLayer = st.active;
    var v = vids[nextLayer];
    var c = clips[i];
    if (v.getAttribute("data-src") !== c.video) {
      v.setAttribute("data-src", c.video);
      v.src = c.video;
    }
    v.preload = "auto";
    v.muted = st.muted;
    try {
      v.currentTime = 0;
    } catch (e) {
      /* not ready */
    }
    st.pending = i;
    st.ended = false;
    var shown = false;
    var show = function () {
      if (shown || myToken !== st.token) return;
      shown = true;
      var old = st.active;
      st.active = nextLayer;
      st.idx = i;
      var instant = cut || (i + 1) % 3 === 0 || old === nextLayer;
      layers[nextLayer].classList.toggle("is-cut", instant);
      layers[old].classList.toggle("is-cut", instant);
      layers[nextLayer].classList.add("is-on");
      if (old !== nextLayer) {
        layers[old].classList.remove("is-on");
        clearTimeout(st.fade);
        st.fade = setTimeout(
          function () {
            if (st.active !== old) {
              vids[old].pause();
              prefetch(i + 1, old);
            }
          },
          instant ? 60 : 800
        );
      } else prefetch(i + 1, 1 - nextLayer);
      clips[i].dur = v.duration;
      setUi(i);
      if (!shouldPlay()) v.pause();
    };
    if (v.readyState >= 2) {
      show();
      if (shouldPlay()) tryPlay(v);
    } else {
      var onData = function () {
        v.removeEventListener("loadeddata", onData);
        if (myToken !== st.token) return;
        show();
        if (shouldPlay()) tryPlay(v);
      };
      v.addEventListener("loadeddata", onData);
      if (shouldPlay()) tryPlay(v);
      v.load();
    }
    layers[nextLayer].classList.toggle("is-loading", true);
    var clr = function () {
      layers[nextLayer].classList.remove("is-loading");
    };
    v.addEventListener("loadeddata", clr, { once: true });
    setPlayUi();
  }

  function prefetch(i, layerIdx) {
    i = ((i % total) + total) % total;
    var v = vids[layerIdx];
    if (layerIdx === st.active) return;
    var c = clips[i];
    if (v.getAttribute("data-src") !== c.video) {
      v.setAttribute("data-src", c.video);
      v.preload = "auto";
      v.src = c.video;
      v.load();
    }
  }

  function next(cut) {
    go(st.idx + 1, cut);
  }
  function prev() {
    var v = activeVideo();
    if (v.currentTime > 2 && st.idx >= 0) go(st.idx, true);
    else go(st.idx - 1, true);
  }

  function setPaused(p) {
    st.userPaused = p;
    var v = activeVideo();
    if (p) v.pause();
    else {
      if (st.ended) next(true);
      else tryPlay(v);
    }
    setPlayUi();
  }
  function toggle() {
    if (st.blocked) {
      st.blocked = false;
      st.userPaused = false;
      st.muted = false;
      applyMute();
      tryPlay(activeVideo());
      setPlayUi();
      return;
    }
    setPaused(!st.userPaused);
  }
  function applyMute() {
    vids.forEach(function (v) {
      v.muted = st.muted;
    });
  }
  function toggleMute() {
    st.muted = !st.muted;
    applyMute();
    if (!st.muted && st.blocked) {
      st.blocked = false;
      tryPlay(activeVideo());
    }
    setPlayUi();
  }

  /* fullscreen (with a CSS fallback where the API is missing, e.g. iPhone Safari) */
  var fsReq = stage.requestFullscreen || stage.webkitRequestFullscreen;
  function isFs() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement) || stage.classList.contains("is-full");
  }
  function toggleFs() {
    if (isFs()) {
      if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
      else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
      stage.classList.remove("is-full");
      document.documentElement.classList.remove("reel-lock");
    } else if (fsReq) {
      try {
        var r = fsReq.call(stage);
        if (r && r.catch)
          r.catch(function () {
            cssFs();
          });
      } catch (e) {
        cssFs();
      }
    } else cssFs();
    syncFs();
  }
  function cssFs() {
    stage.classList.add("is-full");
    document.documentElement.classList.add("reel-lock");
    syncFs();
  }
  function syncFs() {
    var on = isFs();
    ui.fs.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    ui.fs.classList.toggle("is-on", on);
  }
  document.addEventListener("fullscreenchange", syncFs);
  document.addEventListener("webkitfullscreenchange", syncFs);

  /* clock + progress */
  var raf = 0;
  function tick() {
    raf = 0;
    var v = activeVideo();
    if (st.idx >= 0) {
      var cur = v.currentTime || 0;
      var dur = Math.min(MAX, v.duration && isFinite(v.duration) ? v.duration : MAX);
      segFills[st.idx].style.transform = "scaleX(" + Math.min(1, cur / dur).toFixed(4) + ")";
      ui.tc.textContent = tcString(offsetOf(st.idx) + Math.min(cur, dur));
      if (!v.paused && cur >= MAX && !st.ended) {
        st.ended = true;
        next();
        return;
      }
    }
    if (!v.paused) raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }
  vids.forEach(function (v, k) {
    v.addEventListener("playing", function () {
      if (k === st.active) kick();
    });
    v.addEventListener("ended", function () {
      if (k !== st.active || st.ended) return;
      st.ended = true;
      next();
    });
    v.addEventListener("error", function () {
      if (k !== st.pending && k !== st.active) return;
      /* a clip that cannot load is skipped */
      if (v.getAttribute("data-src") && clips.some(Boolean)) {
        setTimeout(function () {
          if (v.error) next(true);
        }, 400);
      }
    });
    v.addEventListener("timeupdate", function () {
      if (k === st.active && !raf) kick();
    });
  });

  /* pause when hidden or off screen */
  function sys(p) {
    if (st.sysPaused === p) return;
    st.sysPaused = p;
    var v = activeVideo();
    if (p) v.pause();
    else if (!st.userPaused && !st.blocked) tryPlay(v);
    setPlayUi();
  }
  document.addEventListener("visibilitychange", function () {
    sys(document.hidden || offscreen);
  });
  var offscreen = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (es) {
        offscreen = es[0].intersectionRatio < 0.2 && !isFs();
        sys(document.hidden || offscreen);
      },
      { threshold: [0, 0.2, 0.5] }
    ).observe(stage);
  }

  /* controls */
  ui.play.addEventListener("click", toggle);
  ui.mute.addEventListener("click", toggleMute);
  ui.fs.addEventListener("click", toggleFs);
  $("[data-next]").addEventListener("click", function () {
    next(true);
  });
  $("[data-prev]").addEventListener("click", prev);
  ui.start.addEventListener("click", toggle);
  $(".reel-layers").addEventListener("click", function () {
    if (!st.blocked) setPaused(!st.userPaused);
    else toggle();
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    var onBtn = tag === "BUTTON" || tag === "A" || tag === "VIDEO";
    if (e.code === "Space") {
      if (onBtn) return;
      e.preventDefault();
      toggle();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      next(true);
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.code === "KeyM") toggleMute();
    else if (e.code === "KeyF") toggleFs();
    else if (e.code === "Escape") {
      if (stage.classList.contains("is-full")) toggleFs();
      else if (!document.fullscreenElement) setPaused(true);
    }
  });

  /* swipe (touch) */
  var sx = 0,
    sy = 0,
    sid = null;
  stage.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 1 || e.target.closest("button, a")) {
        sid = null;
        return;
      }
      sid = e.touches[0].identifier;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchend",
    function (e) {
      if (sid === null) return;
      var t = Array.prototype.find.call(e.changedTouches, function (x) {
        return x.identifier === sid;
      });
      sid = null;
      if (!t) return;
      var dx = t.clientX - sx,
        dy = t.clientY - sy;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        e.preventDefault();
        if (dx < 0) next(true);
        else prev();
      }
    },
    { passive: false }
  );

  /* index tiles jump the stage to that clip */
  tiles.forEach(function (li, i) {
    li.querySelector("[data-tile-play]").addEventListener("click", function () {
      st.userPaused = false;
      go(i, true);
      stage.scrollIntoView({ behavior: "auto", block: "start" });
      try {
        stage.focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    });
  });

  reduced.addEventListener &&
    reduced.addEventListener("change", function () {
      if (reduced.matches) {
        st.userPaused = true;
        activeVideo().pause();
        setPlayUi();
      }
    });

  go(0, true);
  setPlayUi();
  syncFs();
  window.__reel = {
    state: function () {
      return { idx: st.idx, total: total, paused: activeVideo().paused, muted: st.muted, blocked: st.blocked, userPaused: st.userPaused };
    },
    go: go,
  };
})();
