/* fx.js: VFX layer (owned by the FX work package). Must be a no-op when effects are off.

   STATE
     html[data-fx="on|lite|off"] is set before first paint by _includes/fx-intro.liquid.
     Resolution: ?fx=on|lite|off (session override) > localStorage 'fx' ('on'|'off') > auto
       auto = off (prefers-reduced-motion) | lite (saveData, <= 4 cores, <= 4 GB, coarse pointer) | on
     #fx-toggle cycles on/off, keeps aria-pressed, announces through an aria-live polite region.
     window.FX = { state, enabled(), lite(), on(event, fn), refresh(root), reduced() }
       FX.on("change", fn) listens to the document event "fx:change" (detail: { state }); returns an unsubscribe fn.

   GLOBAL (on only, except * which stays in lite)
     film grain, vignette*, custom cursor (fine pointers only), title sequence (home, first visit per session)

   ATTRIBUTES / CLASSES (scanned at load, by FX.refresh(root) and by a MutationObserver for late nodes)
     data-fx="split"      headline reveal. data-split="words|chars" (default words). Original text stays accessible.
     data-fx="reveal"     fade/blur/translate (clip-path mask on img, video, picture, figure, .fx-plate, [data-fx-mask]).
                          data-fx-delay="ms" on the element; data-fx-stagger="ms" on a parent staggers its reveal children.
     data-fx="parallax"   data-speed="0.2" (-1..1). Transform only. Put it in a box with overflow: clip to get the
                          CSS scroll-driven path; overflow hidden/auto boxes use the IntersectionObserver + scroll fallback.
     data-fx="scramble"   text decode on enter and on hover/focus; restores the exact original text. Text-only elements.
     data-fx="magnetic"   pulled toward the pointer (max 10 px). Fine pointers, state on.
     data-fx="spot" | .fx-spot   radial glow following the pointer (--mx / --my). Uses ::after.
     data-fx="glitch" | .fx-glitch   RGB split + slice jitter on hover/focus, 400 ms, one pass.
     .fx-plate            media plate (wrapper around img or video): crop marks, REC dot, slate, resolution, timecode.
                          data-slate-project, data-slate-take, data-slate-file, data-fps (default 24).
                          modifier .fx-plate--letterbox (cinemascope bars, data-bar-ratio default 2.39).
     .fx-marquee          infinite ticker; children are the items. data-speed (px/s, default 40), .fx-marquee--rev.
     .fx-halftone         dotted halftone motion background (CSS only).
     .fx-typing           terminal card; lines from data-lines='["a","b"]' or child <li> items; data-typing-speed (ms/char).
   Every effect is inert with data-fx="off", and motion effects are skipped under prefers-reduced-motion. */
(function () {
  "use strict";
  if (window.FX) return;

  var d = document;
  var root = d.documentElement;
  var STATES = { on: 1, lite: 1, off: 1 };

  /* ---------- helpers ---------- */
  function mq(q) {
    return !!(window.matchMedia && window.matchMedia(q).matches);
  }
  function reduced() {
    return mq("(prefers-reduced-motion: reduce)");
  }
  function fine() {
    return mq("(hover: hover) and (pointer: fine)");
  }
  function lsGet(k) {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch (e) {}
  }
  function ssGet(k) {
    try {
      return window.sessionStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function ssSet(k, v) {
    try {
      if (v === null) window.sessionStorage.removeItem(k);
      else window.sessionStorage.setItem(k, v);
    } catch (e) {}
  }
  function el(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  /* ---------- state ---------- */
  function autoState() {
    if (reduced()) return "off";
    var n = navigator;
    var c = n.connection;
    if (
      (c && c.saveData) ||
      (n.hardwareConcurrency && n.hardwareConcurrency <= 4) ||
      (n.deviceMemory && n.deviceMemory <= 4) ||
      mq("(pointer: coarse)")
    )
      return "lite";
    return "on";
  }
  function resolveState() {
    var q = new URLSearchParams(location.search).get("fx");
    if (STATES[q]) ssSet("fx-override", q);
    var o = ssGet("fx-override");
    if (STATES[o]) return o;
    var u = lsGet("fx");
    if (u === "on" || u === "off") return u;
    return autoState();
  }
  var state = root.getAttribute("data-fx");
  if (!STATES[state]) {
    state = resolveState();
    root.setAttribute("data-fx", state);
  }

  var listeners = [];
  var FX = {
    enabled: function () {
      return state !== "off";
    },
    lite: function () {
      return state === "lite";
    },
    reduced: reduced,
    on: function (ev, fn) {
      var type = "fx:" + ev;
      d.addEventListener(type, fn);
      return function () {
        d.removeEventListener(type, fn);
      };
    },
    refresh: function (r) {
      scan(r || d);
    },
  };
  Object.defineProperty(FX, "state", {
    get: function () {
      return state;
    },
    enumerable: true,
  });
  window.FX = FX;

  /* ---------- shared observers ---------- */
  var enterCbs = new WeakMap();
  var enterIO =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (!e.isIntersecting) return;
              var cb = enterCbs.get(e.target);
              enterIO.unobserve(e.target);
              enterCbs.delete(e.target);
              if (cb) cb(e.target);
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        )
      : null;
  function whenEnter(node, cb) {
    if (!enterIO) return cb(node);
    enterCbs.set(node, cb);
    enterIO.observe(node);
  }
  function unwatchEnter(node) {
    if (enterIO) enterIO.unobserve(node);
    enterCbs.delete(node);
  }

  /* ---------- effect kinds ---------- */
  var kinds = {};
  var entries = new Set();

  /* reveal */
  kinds.reveal = {
    sel: '[data-fx="reveal"]',
    init: function (n) {
      var delay = num(n.getAttribute("data-fx-delay"), 0);
      var parent = n.parentElement && n.parentElement.closest("[data-fx-stagger]");
      if (parent) {
        var step = num(parent.getAttribute("data-fx-stagger"), 80);
        var list = parent.querySelectorAll('[data-fx="reveal"]');
        delay += step * Array.prototype.indexOf.call(list, n);
      }
      n.style.setProperty("--fx-d", delay + "ms");
      return {};
    },
    on: function (c, n) {
      if (reduced()) return;
      n.classList.add("fx-rv");
      if (n.matches("img, video, picture, figure, canvas, .fx-plate, [data-fx-mask]")) n.classList.add("fx-rv--mask");
      if (n.classList.contains("is-in")) return;
      whenEnter(n, function (t) {
        t.classList.add("is-in");
        /* drop the reveal transitions afterwards so they never fight the element's own hover styles */
        setTimeout(
          function () {
            t.classList.remove("fx-rv", "fx-rv--mask");
          },
          num(t.style.getPropertyValue("--fx-d"), 0) + 1150
        );
      });
    },
    off: function (c, n) {
      unwatchEnter(n);
      n.classList.remove("fx-rv", "fx-rv--mask", "is-in");
    },
  };

  /* split */
  var HEADING = /^H[1-6]$/;
  function splitText(node, mode, counter) {
    Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
      if (ch.nodeType === 3) {
        var frag = d.createDocumentFragment();
        ch.nodeValue.split(/(\s+)/).forEach(function (tok) {
          if (!tok) return;
          if (/^\s+$/.test(tok)) return frag.appendChild(d.createTextNode(tok));
          var w = el("span", "fx-w");
          if (mode === "chars") {
            Array.from(tok).forEach(function (chr) {
              var s = el("span", "fx-c fx-u", chr);
              s.style.setProperty("--i", counter.n++);
              w.appendChild(s);
            });
          } else {
            w.className = "fx-w fx-u";
            w.textContent = tok;
            w.style.setProperty("--i", counter.n++);
          }
          frag.appendChild(w);
        });
        ch.parentNode.replaceChild(frag, ch);
      } else if (ch.nodeType === 1 && ch.tagName !== "BR") {
        splitText(ch, mode, counter);
      }
    });
  }
  function markIn(t) {
    t.classList.add("is-in");
  }
  function fontsReady(cb) {
    var done = false;
    function go() {
      if (!done) {
        done = true;
        cb();
      }
    }
    if (d.fonts && d.fonts.ready) {
      d.fonts.ready.then(go, go);
      setTimeout(go, 1200);
    } else go();
  }
  kinds.split = {
    sel: '[data-fx="split"]',
    init: function (n) {
      return { html: n.innerHTML, label: n.textContent.replace(/\s+/g, " ").trim(), done: false };
    },
    on: function (c, n) {
      /* never split headings that contain links/controls: the aria-hidden visual copy would hide focusable content from assistive tech */
      if (reduced() || n.querySelector("a,button,input,select,textarea,[tabindex]")) return n.classList.add("fx-split-skip");
      n.classList.remove("fx-split-skip");
      if (c.done) {
        if (!n.classList.contains("is-in")) whenEnter(n, markIn);
        return;
      }
      if (c.waiting) return;
      c.waiting = true;
      /* split only after web fonts settled, so words never reflow (and shift) when the font swaps in */
      fontsReady(function () {
        c.waiting = false;
        if (state === "off" || c.done || !n.isConnected) return;
        var mode = n.getAttribute("data-split") === "chars" ? "chars" : "words";
        var counter = { n: 0 };
        n.innerHTML = c.html;
        splitText(n, mode, counter);
        var vis = el("span", "fx-split-vis");
        vis.setAttribute("aria-hidden", "true");
        while (n.firstChild) vis.appendChild(n.firstChild);
        n.appendChild(el("span", "fx-sr", c.label));
        n.appendChild(vis);
        if (HEADING.test(n.tagName) || n.getAttribute("role") === "heading") n.setAttribute("aria-label", c.label);
        n.style.setProperty("--fx-step", Math.max(8, Math.min(mode === "chars" ? 22 : 55, 900 / Math.max(counter.n, 1))) + "ms");
        n.classList.add("is-split");
        c.done = true;
        if (!n.classList.contains("is-in")) whenEnter(n, markIn);
      });
    },
    off: function (c, n) {
      unwatchEnter(n);
      if (c.done) {
        n.innerHTML = c.html;
        n.removeAttribute("aria-label");
        n.classList.remove("is-split");
        c.done = false;
      }
      n.classList.remove("is-in", "fx-split-skip");
    },
  };

  /* parallax */
  var para = { set: new Set(), vis: new Set(), io: null, raf: 0, bound: false };
  var sdt = !!(window.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));
  function paraFrame() {
    para.raf = 0;
    var vh = window.innerHeight;
    para.vis.forEach(function (n) {
      var r = n.getBoundingClientRect();
      var sp = num(n.getAttribute("data-speed"), 0.2);
      var p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      n.style.transform = "translate3d(0," + (-clamp(p, -1, 1) * sp * 90).toFixed(1) + "px,0)";
    });
  }
  function paraSchedule() {
    if (!para.raf && para.vis.size) para.raf = requestAnimationFrame(paraFrame);
  }
  function inScroller(n) {
    for (var p = n.parentElement; p && p !== root; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (/(hidden|auto|scroll)/.test(cs.overflowX + cs.overflowY)) return true;
    }
    return false;
  }
  kinds.parallax = {
    sel: '[data-fx="parallax"]',
    init: function (n) {
      n.style.setProperty("--fx-speed", String(num(n.getAttribute("data-speed"), 0.2)));
      return {};
    },
    on: function (c, n) {
      if (reduced() || state !== "on") return;
      if (sdt && !inScroller(n)) {
        /* view() would track the nearest scroll container (overflow hidden/auto), so only use it with overflow: clip or visible */
        n.classList.add("fx-par-css");
        return;
      }
      /* fallback: observe visibility, update on scroll only while visible (rAF is scroll-driven, never idle) */
      if (!para.io) {
        para.io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) para.vis.add(e.target);
            else para.vis.delete(e.target);
          });
          paraSchedule();
        });
      }
      if (!para.bound) {
        para.bound = true;
        window.addEventListener("scroll", paraSchedule, { passive: true });
        window.addEventListener("resize", paraSchedule, { passive: true });
      }
      para.set.add(n);
      para.io.observe(n);
    },
    off: function (c, n) {
      para.set.delete(n);
      para.vis.delete(n);
      if (para.io) para.io.unobserve(n);
      n.style.transform = "";
      n.classList.remove("fx-par-css");
    },
  };

  /* scramble */
  var GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&/<>+=*";
  function textNodeOf(n) {
    return n.childNodes.length === 1 && n.firstChild.nodeType === 3 ? n.firstChild : null;
  }
  function scrambleRun(n, c) {
    var tn = textNodeOf(n);
    if (!tn || reduced() || state !== "on" || c.running) return;
    c.running = true;
    var orig = c.text;
    var len = orig.length;
    var dur = clamp(260 + len * 28, 400, 900);
    var t0 = performance.now();
    function frame(now) {
      if (!c.running) return;
      var p = Math.min(1, (now - t0) / dur);
      var upto = Math.floor(p * len);
      var out = "";
      for (var i = 0; i < len; i++) {
        var ch = orig.charAt(i);
        out += i < upto || /\s/.test(ch) ? ch : GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
      }
      tn.nodeValue = p >= 1 ? orig : out;
      if (p < 1) c.raf = requestAnimationFrame(frame);
      else finish();
    }
    function finish() {
      c.running = false;
      c.raf = 0;
      tn.nodeValue = orig;
      n.removeAttribute("aria-busy");
    }
    c.finish = finish;
    n.setAttribute("aria-busy", "true");
    c.raf = requestAnimationFrame(frame);
  }
  function scrambleStop(n, c) {
    if (c.raf) cancelAnimationFrame(c.raf);
    c.raf = 0;
    if (c.running) {
      c.running = false;
      var tn = textNodeOf(n);
      if (tn) tn.nodeValue = c.text;
      n.removeAttribute("aria-busy");
    }
  }
  kinds.scramble = {
    sel: '[data-fx="scramble"]',
    init: function (n) {
      var tn = textNodeOf(n);
      if (!tn) return null;
      var c = { text: tn.nodeValue, running: false, raf: 0, entered: false };
      c.run = function () {
        scrambleRun(n, c);
      };
      return c;
    },
    on: function (c, n) {
      if (!c || reduced() || state !== "on") return;
      n.addEventListener(
        "pointerenter",
        (c.hover = function (e) {
          if (e.pointerType === "mouse") c.run();
        })
      );
      n.addEventListener("focus", c.run);
      if (!c.entered)
        whenEnter(n, function () {
          c.entered = true;
          c.run();
        });
    },
    off: function (c, n) {
      if (!c) return;
      unwatchEnter(n);
      scrambleStop(n, c);
      n.removeEventListener("pointerenter", c.hover);
      n.removeEventListener("focus", c.run);
    },
  };

  /* magnetic */
  var mag = { set: new Set(), bound: false, raf: 0, px: 0, py: 0 };
  function magFrame() {
    mag.raf = 0;
    mag.set.forEach(function (c) {
      var r = c.el.getBoundingClientRect();
      var cx = r.left + r.width / 2 - c.x;
      var cy = r.top + r.height / 2 - c.y;
      var pad = 36;
      var near = mag.px > r.left - pad - c.x && mag.px < r.right + pad - c.x && mag.py > r.top - pad - c.y && mag.py < r.bottom + pad - c.y;
      var tx = near ? clamp((mag.px - cx) * 0.28, -10, 10) : 0;
      var ty = near ? clamp((mag.py - cy) * 0.28, -10, 10) : 0;
      if (tx !== c.x || ty !== c.y) {
        c.x = tx;
        c.y = ty;
        c.el.style.setProperty("--fx-tx", tx.toFixed(1) + "px");
        c.el.style.setProperty("--fx-ty", ty.toFixed(1) + "px");
      }
    });
  }
  function magMove(e) {
    if (e.pointerType !== "mouse") return;
    mag.px = e.clientX;
    mag.py = e.clientY;
    if (!mag.raf) mag.raf = requestAnimationFrame(magFrame);
  }
  function magLeave() {
    mag.px = -9999;
    mag.py = -9999;
    if (!mag.raf) mag.raf = requestAnimationFrame(magFrame);
  }
  kinds.magnetic = {
    sel: '[data-fx="magnetic"]',
    init: function (n) {
      return { el: n, x: 0, y: 0 };
    },
    on: function (c) {
      if (reduced() || state !== "on" || !fine()) return;
      mag.set.add(c);
      if (!mag.bound) {
        mag.bound = true;
        d.addEventListener("pointermove", magMove, { passive: true });
        d.documentElement.addEventListener("mouseleave", magLeave);
      }
    },
    off: function (c) {
      mag.set.delete(c);
      c.x = c.y = 0;
      c.el.style.removeProperty("--fx-tx");
      c.el.style.removeProperty("--fx-ty");
    },
  };

  /* spot (delegated pointermove) */
  var spot = { bound: false, raf: 0, target: null, x: 0, y: 0 };
  function spotFrame() {
    spot.raf = 0;
    var t = spot.target;
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty("--mx", spot.x - r.left + "px");
    t.style.setProperty("--my", spot.y - r.top + "px");
  }
  function spotMove(e) {
    if (state === "off" || e.pointerType === "touch") return;
    var t = e.target.closest && e.target.closest(".fx-spot");
    if (!t) return;
    spot.target = t;
    spot.x = e.clientX;
    spot.y = e.clientY;
    if (!spot.raf) spot.raf = requestAnimationFrame(spotFrame);
  }
  kinds.spot = {
    sel: '[data-fx="spot"], .fx-spot',
    init: function (n) {
      n.classList.add("fx-spot");
      return {};
    },
    on: function () {
      if (!spot.bound) {
        spot.bound = true;
        d.addEventListener("pointermove", spotMove, { passive: true });
      }
    },
    off: function () {},
  };

  /* glitch (CSS driven; text hosts need data-text for the offset layers) */
  kinds.glitch = {
    sel: '[data-fx="glitch"], .fx-glitch',
    init: function (n) {
      n.classList.add("fx-glitch");
      if (!n.children.length && n.textContent.trim() && !n.matches("img, video, canvas, svg, picture")) {
        n.setAttribute("data-text", n.textContent);
        n.classList.add("fx-glitch--text");
      }
      return {};
    },
    on: function () {},
    off: function () {},
  };

  /* plates */
  function pad2(v) {
    return v < 10 ? "0" + v : "" + v;
  }
  function timecode(t, fps) {
    t = Math.max(0, t || 0);
    var whole = Math.floor(t);
    var ff = Math.min(fps - 1, Math.floor((t - whole) * fps + 1e-6));
    return pad2(Math.floor(whole / 3600)) + ":" + pad2(Math.floor((whole % 3600) / 60)) + ":" + pad2(whole % 60) + ":" + pad2(ff);
  }
  kinds.plate = {
    sel: ".fx-plate",
    init: function (n) {
      var fps = num(n.getAttribute("data-fps"), 24);
      var hud = el("div", "fx-plate__hud");
      hud.setAttribute("aria-hidden", "true");
      hud.appendChild(el("div", "fx-plate__marks"));
      var tl = el("div", "fx-plate__row fx-plate__row--tl");
      var tr = el("div", "fx-plate__row fx-plate__row--tr");
      var bl = el("div", "fx-plate__row fx-plate__row--bl");
      var br = el("div", "fx-plate__row fx-plate__row--br");
      var pj = n.getAttribute("data-slate-project");
      var tk = n.getAttribute("data-slate-take");
      var fl = n.getAttribute("data-slate-file");
      if (pj) tl.appendChild(el("span", "fx-plate__chip fx-plate__chip--proj", pj));
      if (tk || fl) {
        var line = el("span", "fx-plate__chip fx-plate__chip--file");
        if (tk) line.appendChild(el("b", "fx-plate__take", /^\d/.test(tk) ? "TK " + tk : tk));
        if (tk && fl) line.appendChild(d.createTextNode(" \u00b7 "));
        if (fl) line.appendChild(d.createTextNode(fl));
        tl.appendChild(line);
      }
      var rec = el("span", "fx-plate__rec");
      var res = el("span", "fx-plate__chip fx-plate__chip--res");
      var tc = el("span", "fx-plate__chip fx-plate__chip--tc", "STILL");
      var kind = el("span", "fx-plate__chip fx-plate__chip--kind");
      tr.appendChild(rec);
      tr.appendChild(res);
      bl.appendChild(tc);
      br.appendChild(kind);
      [tl, tr, bl, br].forEach(function (r) {
        hud.appendChild(r);
      });
      n.appendChild(hud);
      var c = { el: n, fps: fps, hud: hud, res: res, tc: tc, kind: kind, vfc: 0, ro: null };
      c.media = function () {
        return n.querySelector("video") || n.querySelector("img");
      };
      c.update = function () {
        var m = c.media();
        var isVideo = m && m.tagName === "VIDEO";
        var w = m ? (isVideo ? m.videoWidth : m.naturalWidth) : 0;
        var h = m ? (isVideo ? m.videoHeight : m.naturalHeight) : 0;
        res.textContent = w && h ? w + "×" + h : "";
        kind.textContent = isVideo ? c.fps + " FPS" : "STILL";
        n.classList.toggle("fx-plate--ctrl", !!(isVideo && m.controls));
        if (isVideo) c.tick(m.currentTime);
        else tc.textContent = "STILL";
        var playing = !!(isVideo && !m.paused && !m.ended);
        n.classList.toggle("is-rec", playing);
        if (playing) c.loop(m);
      };
      c.tick = function (t) {
        tc.textContent = timecode(t, c.fps);
      };
      c.loop = function (m) {
        if (c.vfc || !m.requestVideoFrameCallback) return;
        var step = function (now, meta) {
          c.vfc = 0;
          c.tick(meta && meta.mediaTime != null ? meta.mediaTime : m.currentTime);
          if (!m.paused && !m.ended && c.media() === m) c.vfc = m.requestVideoFrameCallback(step);
        };
        c.vfc = m.requestVideoFrameCallback(step);
      };
      c.handler = function (e) {
        if (e.type === "timeupdate") {
          var m = c.media();
          if (m && m.tagName === "VIDEO" && !m.requestVideoFrameCallback) c.tick(m.currentTime);
          return;
        }
        c.update();
      };
      ["load", "loadedmetadata", "loadeddata", "play", "playing", "pause", "ended", "seeked", "emptied", "timeupdate"].forEach(function (t) {
        n.addEventListener(t, c.handler, true);
      });
      if (n.classList.contains("fx-plate--letterbox") && window.ResizeObserver) {
        var ratio = num(n.getAttribute("data-bar-ratio"), 2.39);
        c.ro = new ResizeObserver(function () {
          var r = n.getBoundingClientRect();
          var bar = Math.max(0, (r.height - r.width / ratio) / 2);
          hud.style.setProperty("--fx-bar", bar.toFixed(1) + "px");
        });
        c.ro.observe(n);
      }
      c.update();
      return c;
    },
    on: function (c) {
      c.update();
    },
    off: function () {},
  };

  /* marquee */
  kinds.marquee = {
    sel: ".fx-marquee",
    init: function (n) {
      if (n.classList.contains("fx-marquee--js")) return null;
      var track = el("div", "fx-marquee__track");
      var group = el("div", "fx-marquee__group");
      while (n.firstChild) group.appendChild(n.firstChild);
      var clone = group.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");
      clone.setAttribute("data-fx-skip", "");
      Array.prototype.forEach.call(clone.querySelectorAll("[id]"), function (x) {
        x.removeAttribute("id");
      });
      track.appendChild(group);
      track.appendChild(clone);
      n.appendChild(track);
      n.classList.add("fx-marquee--js");
      if (n.getAttribute("data-dir") === "right") n.classList.add("fx-marquee--rev");
      var c = { group: group, ro: null };
      c.size = function () {
        var speed = num(n.getAttribute("data-speed"), 40);
        n.style.setProperty("--fx-dur", Math.max(8, group.offsetWidth / speed).toFixed(1) + "s");
      };
      if (window.ResizeObserver) {
        c.ro = new ResizeObserver(c.size);
        c.ro.observe(group);
      }
      c.size();
      return c;
    },
    on: function (c) {
      if (c) c.size();
    },
    off: function () {},
  };

  /* typing */
  kinds.typing = {
    sel: ".fx-typing",
    init: function (n) {
      var lines = [];
      var raw = n.getAttribute("data-lines");
      if (raw) {
        try {
          lines = JSON.parse(raw);
        } catch (e) {
          lines = [];
        }
      }
      if (!Array.isArray(lines) || !lines.length) {
        lines = Array.prototype.map.call(n.querySelectorAll("li"), function (li) {
          return li.textContent.trim();
        });
      }
      lines = lines.map(String).filter(Boolean);
      if (!lines.length) return null;
      var screen = el("div", "fx-typing__screen");
      screen.setAttribute("aria-hidden", "true");
      var caret = el("span", "fx-typing__caret");
      var cells = lines.map(function (txt) {
        var out = /^>\s/.test(txt);
        var row = el("span", "fx-typing__line" + (out ? " fx-typing__line--out" : ""));
        var span = el("span", "fx-typing__txt");
        row.appendChild(span);
        screen.appendChild(row);
        return { span: span, text: out ? txt.replace(/^>\s/, "") : txt };
      });
      if (!n.querySelector("li") && !n.querySelector(".fx-sr")) {
        var sr = el("ul", "fx-sr");
        lines.forEach(function (t) {
          sr.appendChild(el("li", null, t));
        });
        n.appendChild(sr);
      }
      n.classList.add("fx-typing--js");
      n.appendChild(screen);
      var c = { cells: cells, caret: caret, timer: 0, started: false, done: false };
      c.full = function () {
        clearTimeout(c.timer);
        cells.forEach(function (x) {
          x.span.textContent = x.text;
        });
        caret.className = "fx-typing__caret is-done";
        cells[cells.length - 1].span.parentNode.appendChild(caret);
        c.done = true;
      };
      c.type = function () {
        if (c.started) return;
        c.started = true;
        var speed = num(n.getAttribute("data-typing-speed"), 26);
        var li = 0;
        var ci = 0;
        caret.className = "fx-typing__caret is-live";
        function step() {
          if (state !== "on" || reduced()) return c.full();
          var cell = cells[li];
          if (!cell) return c.full();
          cell.span.parentNode.appendChild(caret);
          if (ci < cell.text.length) {
            cell.span.textContent = cell.text.slice(0, ++ci);
            c.timer = setTimeout(step, speed + (Math.random() * speed) / 2);
          } else {
            li++;
            ci = 0;
            c.timer = setTimeout(step, 260);
          }
        }
        step();
      };
      c.full();
      return c;
    },
    on: function (c, n) {
      if (!c) return;
      c.started = false;
      if (state !== "on" || reduced()) return c.full();
      clearTimeout(c.timer);
      c.cells.forEach(function (x) {
        x.span.textContent = "";
      });
      c.caret.className = "fx-typing__caret is-live";
      whenEnter(n, c.type);
    },
    off: function (c, n) {
      if (!c) return;
      unwatchEnter(n);
      c.full();
    },
  };

  /* ---------- registry / scanning ---------- */
  var kindNames = Object.keys(kinds);
  var selAll = kindNames
    .map(function (k) {
      return kinds[k].sel;
    })
    .join(",");

  function register(n) {
    if (n.closest && n.closest("[data-fx-skip], .fx-layer")) return;
    kindNames.forEach(function (k) {
      var kd = kinds[k];
      if (!n.matches(kd.sel)) return;
      var key = "__fx_" + k;
      if (n[key] !== undefined) return;
      var ctx = kd.init(n);
      n[key] = ctx === null ? false : ctx;
      var ent = { k: kd, n: n, c: ctx };
      entries.add(ent);
      if (state !== "off") kd.on(ctx, n);
    });
  }
  function scan(r) {
    if (!r || (r.nodeType !== 1 && r.nodeType !== 9)) return;
    if (r.nodeType === 1 && r.matches && r.matches(selAll) && r !== root) register(r);
    var found = r.querySelectorAll ? r.querySelectorAll(selAll) : [];
    for (var i = 0; i < found.length; i++) if (found[i] !== root) register(found[i]);
    entries.forEach(function (e) {
      if (!e.n.isConnected) entries.delete(e);
    });
  }

  var pending = [];
  var flushTimer = 0;
  function flush() {
    flushTimer = 0;
    var list = pending;
    pending = [];
    list.forEach(function (n) {
      if (n.isConnected) scan(n);
    });
  }
  var mo = null;
  function observeDom() {
    if (mo || !window.MutationObserver) return;
    mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (
            n.nodeType === 1 &&
            !(n.classList && (n.classList.contains("fx-layer") || n.classList.contains("fx-cursor") || n.classList.contains("fx-cursor__ring")))
          )
            pending.push(n);
        });
      });
      if (pending.length && !flushTimer) flushTimer = setTimeout(flush, 40);
    });
    mo.observe(d.body, { childList: true, subtree: true });
  }

  /* ---------- global layers ---------- */
  var layer = null;
  function noiseUrl() {
    try {
      var c = d.createElement("canvas");
      c.width = c.height = 128;
      var x = c.getContext("2d");
      var img = x.createImageData(128, 128);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      return 'url("' + c.toDataURL("image/png") + '")';
    } catch (e) {
      return "none";
    }
  }
  function mountLayer() {
    if (layer) return;
    layer = el("div", "fx-layer");
    layer.setAttribute("aria-hidden", "true");
    var grain = el("div", "fx-grain");
    grain.style.setProperty("--fx-noise", noiseUrl());
    layer.appendChild(grain);
    layer.appendChild(el("div", "fx-vignette"));
    d.body.appendChild(layer);
  }
  function unmountLayer() {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
  }
  d.addEventListener("visibilitychange", function () {
    root.classList.toggle("fx-hidden", d.hidden);
  });

  /* cursor */
  var cur = null;
  var NATIVE =
    'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="image"]), textarea, select, [contenteditable=""], [contenteditable="true"], iframe, video, audio, embed, object';
  var GROW =
    'a[href], button, [role="button"], summary, label, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], input[type="range"], .fx-spot, [data-fx="magnetic"], [data-cursor="grow"]';
  function mountCursor() {
    if (cur || !fine()) return;
    var dot = el("div", "fx-cursor");
    var ring = el("div", "fx-cursor__ring");
    ring.appendChild(el("i"));
    dot.setAttribute("aria-hidden", "true");
    ring.setAttribute("aria-hidden", "true");
    d.body.appendChild(dot);
    d.body.appendChild(ring);
    var s = { dot: dot, ring: ring, tx: 0, ty: 0, rx: 0, ry: 0, raf: 0, seen: false };
    function paintRing() {
      ring.style.transform = "translate3d(" + s.rx.toFixed(2) + "px," + s.ry.toFixed(2) + "px,0)";
    }
    function loop() {
      s.rx += (s.tx - s.rx) * 0.22;
      s.ry += (s.ty - s.ry) * 0.22;
      if (Math.abs(s.tx - s.rx) + Math.abs(s.ty - s.ry) < 0.15 || reduced()) {
        s.rx = s.tx;
        s.ry = s.ty;
        s.raf = 0;
        paintRing();
        return;
      }
      paintRing();
      s.raf = requestAnimationFrame(loop);
    }
    s.move = function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      s.tx = e.clientX;
      s.ty = e.clientY;
      dot.style.transform = "translate3d(" + s.tx + "px," + s.ty + "px,0)";
      if (!s.seen) {
        s.seen = true;
        s.rx = s.tx;
        s.ry = s.ty;
        root.classList.add("fx-cursor-on");
      }
      if (!s.raf) s.raf = requestAnimationFrame(loop);
    };
    s.over = function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      root.classList.toggle("fx-cursor-native", !!t.closest(NATIVE));
      root.classList.toggle("fx-cursor-grow", !!t.closest(GROW));
    };
    s.down = function () {
      root.classList.add("fx-cursor-down");
    };
    s.up = function () {
      root.classList.remove("fx-cursor-down");
    };
    s.leave = function () {
      root.classList.add("fx-cursor-native");
    };
    s.enter = function () {
      root.classList.remove("fx-cursor-native");
    };
    d.addEventListener("pointermove", s.move, { passive: true });
    d.addEventListener("pointerover", s.over, { passive: true });
    d.addEventListener("pointerdown", s.down, { passive: true });
    d.addEventListener("pointerup", s.up, { passive: true });
    root.addEventListener("mouseleave", s.leave);
    root.addEventListener("mouseenter", s.enter);
    cur = s;
  }
  function unmountCursor() {
    if (!cur) return;
    if (cur.raf) cancelAnimationFrame(cur.raf);
    d.removeEventListener("pointermove", cur.move);
    d.removeEventListener("pointerover", cur.over);
    d.removeEventListener("pointerdown", cur.down);
    d.removeEventListener("pointerup", cur.up);
    root.removeEventListener("mouseleave", cur.leave);
    root.removeEventListener("mouseenter", cur.enter);
    [cur.dot, cur.ring].forEach(function (x) {
      if (x.parentNode) x.parentNode.removeChild(x);
    });
    root.classList.remove("fx-cursor-on", "fx-cursor-native", "fx-cursor-grow", "fx-cursor-down");
    cur = null;
  }

  /* ---------- apply state ---------- */
  function applyAll() {
    entries.forEach(function (e) {
      if (state === "off") e.k.off(e.c, e.n);
      else {
        e.k.off(e.c, e.n);
        e.k.on(e.c, e.n);
      }
    });
    if (state === "off") {
      unmountLayer();
      unmountCursor();
    } else {
      mountLayer();
      if (state === "on") mountCursor();
      else unmountCursor();
    }
  }
  function setState(next, persist) {
    if (!STATES[next]) return;
    if (persist) {
      lsSet("fx", next);
      ssSet("fx-override", null);
    }
    var changed = next !== state;
    state = next;
    root.setAttribute("data-fx", state);
    if (changed) applyAll();
    syncToggle();
    if (changed) d.dispatchEvent(new CustomEvent("fx:change", { detail: { state: state } }));
  }

  /* ---------- toggle ---------- */
  var toggle = null;
  var live = null;
  function syncToggle() {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", state === "off" ? "false" : "true");
    toggle.title = "Visual effects: " + state;
  }
  function announce(msg) {
    if (!live) {
      live = el("div", "fx-live");
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      d.body.appendChild(live);
    }
    live.textContent = "";
    setTimeout(function () {
      live.textContent = msg;
    }, 30);
  }
  function initToggle() {
    toggle = d.getElementById("fx-toggle");
    if (!toggle) return;
    toggle.hidden = false;
    toggle.removeAttribute("hidden");
    syncToggle();
    toggle.addEventListener("click", function () {
      setState(state === "off" ? "on" : "off", true);
      announce(state === "off" ? "Visual effects off" : "Visual effects on");
    });
  }

  /* react to OS-level reduced-motion changes when the user has not chosen */
  if (window.matchMedia) {
    var rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
    var onRm = function () {
      if (STATES[ssGet("fx-override")]) return;
      var u = lsGet("fx");
      if (u === "on" || u === "off") return;
      setState(autoState(), false);
    };
    if (rmq.addEventListener) rmq.addEventListener("change", onRm);
  }

  /* ---------- title sequence ---------- */
  function initIntro() {
    var ov = d.querySelector("[data-fx-intro]");
    if (!ov) return;
    var edge = d.querySelector(".fx-intro__edge");
    var running = root.classList.contains("fx-intro-on");
    var done = false;
    function cleanup() {
      if (done) return;
      done = true;
      (window.__fxIt || []).forEach(clearTimeout);
      root.classList.remove("fx-intro-pending", "fx-intro-on");
      d.removeEventListener("keydown", skip, true);
      ov.removeEventListener("click", skip);
      [ov, edge].forEach(function (x) {
        if (x && x.parentNode) x.parentNode.removeChild(x);
      });
      d.dispatchEvent(new CustomEvent("fx:intro-end"));
    }
    if (!running) return cleanup();
    if (ov.parentNode !== d.body) d.body.appendChild(ov);
    if (edge && edge.parentNode !== d.body) d.body.appendChild(edge);
    function skip() {
      if (done) return;
      if (Date.now() - (window.__fxIt0 || 0) > 2400) return cleanup(); /* wipe already running */
      (window.__fxIt || []).forEach(clearTimeout);
      root.classList.remove("fx-intro-pending");
      ov.classList.add("is-skip");
      if (edge) edge.classList.add("is-skip");
      setTimeout(cleanup, 340);
    }
    d.addEventListener("keydown", skip, true);
    ov.addEventListener("click", skip);
    var left = Math.max(0, 3050 - (Date.now() - (window.__fxIt0 || Date.now())));
    setTimeout(cleanup, left + 30);
    FX.introActive = true;
  }

  /* ---------- boot ---------- */
  function boot() {
    initToggle();
    if (state !== "off") {
      mountLayer();
      if (state === "on") mountCursor();
    }
    scan(d);
    observeDom();
    initIntro();
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
