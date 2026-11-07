/* pages.js: site pages (research, about, beyond-research, writing, playground). Self-contained, no dependencies.
   Features: accessible tabs, topic filter, dot section indicator, lightbox, in-view videos, travel map, playground auto-resize. */
(function () {
  "use strict";
  var doc = document;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, r) {
    return (r || doc).querySelector(s);
  }
  function $$(s, r) {
    return Array.prototype.slice.call((r || doc).querySelectorAll(s));
  }
  function slug(t) {
    return String(t)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /* ---------- tabs (WAI-ARIA tablist, arrow keys, hash) ---------- */
  function initTabs() {
    $$("[data-tabs]").forEach(function (root) {
      var tabs = $$("[role=tab]", root);
      var built = false;
      var panels = tabs.map(function (t) {
        return doc.getElementById(t.getAttribute("aria-controls"));
      });
      if (!tabs.length) return;
      function select(i, focus, push) {
        tabs.forEach(function (t, j) {
          var on = i === j;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
          if (panels[j]) panels[j].hidden = !on;
        });
        if (focus) tabs[i].focus();
        if (built) buildDots();
        if (push && window.history && history.replaceState) {
          history.replaceState(null, "", "#" + tabs[i].id.replace(/^tab-/, ""));
        }
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () {
          select(i, false, true);
        });
        t.addEventListener("keydown", function (e) {
          var n = tabs.length,
            k = e.key,
            j = null;
          if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % n;
          else if (k === "ArrowLeft" || k === "ArrowUp") j = (i - 1 + n) % n;
          else if (k === "Home") j = 0;
          else if (k === "End") j = n - 1;
          if (j !== null) {
            e.preventDefault();
            select(j, true, true);
          }
        });
      });
      var start = 0;
      var h = (location.hash || "").replace("#", "");
      tabs.forEach(function (t, i) {
        if (t.id === "tab-" + h) start = i;
      });
      select(start, false, false);
      built = true;
      window.addEventListener("hashchange", function () {
        var hh = (location.hash || "").replace("#", "");
        tabs.forEach(function (t, i) {
          if (t.id === "tab-" + hh) select(i, false, false);
        });
      });
    });
  }

  /* ---------- dot section indicator (desktop) + "On this page" sheet (phones) ---------- */
  var dotsNav = null,
    dotObserver = null,
    tocBtn = null,
    tocSheet = null;
  function closeToc(focusBtn) {
    if (!tocSheet || tocSheet.hidden) return;
    tocSheet.hidden = true;
    doc.body.classList.remove("sp-toc-open");
    if (tocBtn) tocBtn.setAttribute("aria-expanded", "false");
    if (focusBtn && tocBtn) tocBtn.focus();
  }
  function openToc() {
    if (!tocSheet) return;
    tocSheet.hidden = false;
    doc.body.classList.add("sp-toc-open");
    tocBtn.setAttribute("aria-expanded", "true");
    var first = $("a", tocSheet);
    if (first) first.focus();
  }
  function buildToc(heads) {
    if (tocBtn) {
      tocBtn.remove();
      tocBtn = null;
    }
    if (tocSheet) {
      tocSheet.remove();
      tocSheet = null;
    }
    doc.body.classList.remove("sp-toc-open");
    tocBtn = doc.createElement("button");
    tocBtn.type = "button";
    tocBtn.className = "sp-toc-btn";
    tocBtn.setAttribute("aria-haspopup", "dialog");
    tocBtn.setAttribute("aria-expanded", "false");
    tocBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg><span>On this page</span>';
    tocSheet = doc.createElement("div");
    tocSheet.className = "sp-toc";
    tocSheet.hidden = true;
    tocSheet.setAttribute("role", "dialog");
    tocSheet.setAttribute("aria-modal", "true");
    tocSheet.setAttribute("aria-label", "On this page");
    var html = '<div class="sp-toc__back" data-toc-close></div><div class="sp-toc__panel"><p class="eyebrow mono">On this page</p><ol>';
    heads.forEach(function (h) {
      var t = (h.getAttribute("aria-label") || h.textContent).replace(/\s+/g, " ").trim();
      html += '<li><a href="#' + h.id + '"></a></li>';
      tocSheet._labels = (tocSheet._labels || []).concat(t);
    });
    html += '</ol><button type="button" class="sp-toc__close" data-toc-close>Close</button></div>';
    tocSheet.innerHTML = html;
    $$("a", tocSheet).forEach(function (a, i) {
      a.textContent = tocSheet._labels[i];
    });
    doc.body.appendChild(tocBtn);
    doc.body.appendChild(tocSheet);
    tocBtn.addEventListener("click", openToc);
    tocSheet.addEventListener("click", function (e) {
      if (e.target.closest("[data-toc-close]")) closeToc(true);
      else if (e.target.closest("a")) closeToc(false);
    });
    tocSheet.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeToc(true);
      } else if (e.key === "Tab") {
        var f = $$("a, button", tocSheet);
        var first = f[0],
          last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && doc.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }
  function buildDots() {
    var scope = $("[data-sp-sections]");
    if (dotsNav) {
      dotsNav.remove();
      dotsNav = null;
    }
    if (tocBtn) {
      tocBtn.remove();
      tocBtn = null;
    }
    if (tocSheet) {
      tocSheet.remove();
      tocSheet = null;
      doc.body.classList.remove("sp-toc-open");
    }
    if (dotObserver) {
      dotObserver.disconnect();
      dotObserver = null;
    }
    if (!scope) return;
    var heads = $$("h2", scope).filter(function (h) {
      return !h.closest(".sp-empty") && !h.closest("[hidden]") && h.textContent.trim();
    });
    if (heads.length < 3) return;
    var used = {};
    heads.forEach(function (h) {
      if (!h.id) {
        var base = slug(h.textContent) || "section",
          id = base,
          n = 2;
        while (doc.getElementById(id) || used[id]) id = base + "-" + n++;
        h.id = id;
      }
      used[h.id] = true;
    });
    function label(h) {
      return (h.getAttribute("aria-label") || h.textContent).replace(/\s+/g, " ").trim();
    }
    var nav = doc.createElement("nav");
    nav.className = "sp-dots";
    nav.setAttribute("aria-label", "Page sections");
    var ul = doc.createElement("ul");
    var links = heads.map(function (h) {
      var li = doc.createElement("li"),
        a = doc.createElement("a");
      a.href = "#" + h.id;
      a.setAttribute("aria-label", "Go to section: " + label(h));
      a.setAttribute("data-label", label(h));
      li.appendChild(a);
      ul.appendChild(li);
      return a;
    });
    nav.appendChild(ul);
    doc.body.appendChild(nav);
    dotsNav = nav;
    buildToc(heads);
    function mark(h) {
      links.forEach(function (a, i) {
        if (heads[i] === h) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
    mark(heads[0]);
    if ("IntersectionObserver" in window) {
      dotObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) mark(en.target);
          });
        },
        { rootMargin: "-30% 0px -60% 0px" }
      );
      heads.forEach(function (h) {
        dotObserver.observe(h);
      });
    }
  }

  /* ---------- topic filter ---------- */
  function initFilter() {
    $$("[data-sp-filter]").forEach(function (bar) {
      var btns = $$("button", bar);
      var scope = bar.closest(".sp-body") || doc;
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          var t = b.getAttribute("data-topic");
          btns.forEach(function (x) {
            var on = x === b;
            x.classList.toggle("is-on", on);
            x.setAttribute("aria-pressed", on ? "true" : "false");
          });
          $$(".sp-sec[data-topic], .sp-group[data-topic]", scope).forEach(function (el) {
            el.hidden = !(t === "*" || el.getAttribute("data-topic") === t);
          });
          buildDots();
        });
      });
    });
  }

  /* ---------- videos: play only while in view, muted loop ---------- */
  function initVideos() {
    var vids = $$("video[data-sp-video]");
    if (!vids.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      vids.forEach(function (v) {
        v.controls = true;
        v.preload = "metadata";
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting) {
            v.preload = "auto";
            var p = v.play();
            if (p && p.catch)
              p.catch(function () {
                v.controls = true;
              });
          } else v.pause();
        });
      },
      { threshold: 0.35 }
    );
    vids.forEach(function (v) {
      io.observe(v);
    });
  }

  /* ---------- lightbox ---------- */
  function initLightbox() {
    if (!$("a[data-lightbox]")) return;
    var box = doc.createElement("div");
    box.className = "sp-lb";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Image viewer");
    box.innerHTML =
      '<span class="sp-lb__count" aria-live="polite"></span>' +
      '<button type="button" class="sp-lb__btn sp-lb__close" aria-label="Close (Esc)">&times;</button>' +
      '<button type="button" class="sp-lb__btn sp-lb__prev" aria-label="Previous image">&larr;</button>' +
      '<figure class="sp-lb__fig"><img class="sp-lb__img" alt=""><figcaption class="sp-lb__cap"></figcaption></figure>' +
      '<button type="button" class="sp-lb__btn sp-lb__next" aria-label="Next image">&rarr;</button>';
    doc.body.appendChild(box);
    var img = $(".sp-lb__img", box),
      cap = $(".sp-lb__cap", box),
      count = $(".sp-lb__count", box);
    var bClose = $(".sp-lb__close", box),
      bPrev = $(".sp-lb__prev", box),
      bNext = $(".sp-lb__next", box);
    var list = [],
      idx = 0,
      opener = null;

    function show(i) {
      idx = (i + list.length) % list.length;
      var a = list[idx];
      img.src = a.getAttribute("href");
      var im = $("img", a);
      img.alt = im ? im.alt : "";
      cap.textContent = a.getAttribute("data-caption") || "";
      count.textContent = idx + 1 + " / " + list.length;
    }
    function open(a) {
      var g = a.getAttribute("data-lightbox");
      list = $$("a[data-lightbox]").filter(function (x) {
        return x.getAttribute("data-lightbox") === g && !x.closest("[hidden]");
      });
      idx = list.indexOf(a);
      if (idx < 0) {
        list = [a];
        idx = 0;
      }
      box.setAttribute("data-single", list.length < 2 ? "true" : "false");
      opener = a;
      box.hidden = false;
      doc.body.classList.add("sp-lb-open");
      show(idx);
      bClose.focus();
    }
    function close() {
      box.hidden = true;
      doc.body.classList.remove("sp-lb-open");
      img.removeAttribute("src");
      if (opener && opener.focus) opener.focus();
    }
    doc.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[data-lightbox]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      open(a);
    });
    bClose.addEventListener("click", close);
    bPrev.addEventListener("click", function () {
      show(idx - 1);
    });
    bNext.addEventListener("click", function () {
      show(idx + 1);
    });
    box.addEventListener("click", function (e) {
      if (e.target === box) close();
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowLeft" && list.length > 1) {
        e.preventDefault();
        show(idx - 1);
      } else if (e.key === "ArrowRight" && list.length > 1) {
        e.preventDefault();
        show(idx + 1);
      } else if (e.key === "Tab") {
        var f = [bClose, bPrev, bNext].filter(function (b) {
          return b.offsetParent !== null;
        });
        if (!f.length) return;
        var first = f[0],
          last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && doc.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (f.indexOf(doc.activeElement) < 0) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    var x0 = null;
    box.addEventListener(
      "touchstart",
      function (e) {
        x0 = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    box.addEventListener(
      "touchend",
      function (e) {
        if (x0 === null || list.length < 2) return;
        var dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
      },
      { passive: true }
    );
  }

  /* ---------- travel map (Leaflet loaded by the page; places come from data-places = [[lat, lng, label], ...]) ---------- */
  var FALLBACK_PLACES = [
    [22.6273, 120.3014, "Kaohsiung (ASPACC 2023)"],
    [25.033, 121.5654, "Taipei"],
    [26.1878, 91.6919, "IIT Guwahati (chess, winter)"],
    [22.3149, 87.3105, "IIT Kharagpur (chess)"],
    [23.2599, 77.4126, "Bhopal (AICF chess tournament)"],
    [21.1594, 72.7869, "SVNIT, Surat (chess)"],
    [12.5833, 78.6333, "Yelagiri"],
    [11.4102, 76.695, "Ooty"],
    [12.6208, 80.1982, "Mahabalipuram"],
    [13.0827, 80.2707, "Chennai"],
  ];
  function initMap() {
    var el = doc.getElementById("travel-map");
    if (!el) return;
    var places = FALLBACK_PLACES;
    try {
      var raw = JSON.parse(el.getAttribute("data-places") || "null");
      if (Array.isArray(raw) && raw.length) places = raw;
    } catch (e) {
      places = FALLBACK_PLACES;
    }
    function go() {
      if (typeof window.L === "undefined" || el._leaflet_id) return;
      var L = window.L;
      var touch = !!(L.Browser && (L.Browser.mobile || L.Browser.touch));
      /* one finger keeps scrolling the page on touch screens; pinch and the +/- buttons move the map */
      var map = L.map(el, { dragging: !touch, tap: false, scrollWheelZoom: false, worldCopyJump: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      var markers = places.map(function (p) {
        return L.circleMarker([p[0], p[1]], { radius: 8, weight: 2, fillOpacity: 0.9, className: "sp-pin" })
          .bindPopup(String(p[2] || ""))
          .addTo(map);
      });
      function fit() {
        map.invalidateSize(true);
        map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [28, 28] });
      }
      fit();
      setTimeout(fit, 250);
      if (window.ResizeObserver)
        new ResizeObserver(function () {
          map.invalidateSize(true);
        }).observe(el);
      /* keyboard / touch list: one button per place */
      $$("[data-place]").forEach(function (b) {
        b.addEventListener("click", function () {
          var m = markers[Number(b.getAttribute("data-place"))];
          if (!m) return;
          map.setView(m.getLatLng(), Math.max(map.getZoom(), 6), { animate: !reduce });
          m.openPopup();
          el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        });
      });
      el.setAttribute("data-ready", "true");
    }
    if (doc.readyState === "complete") go();
    else window.addEventListener("load", go);
  }

  /* ---------- playground iframe: auto-size from postMessage {source:'vzero-playground', type:'resize', height} ---------- */
  function initPlayground() {
    var frame = doc.getElementById("vzero-full-playground-frame");
    if (!frame) return;
    window.addEventListener("message", function (event) {
      if (event.source !== frame.contentWindow) return;
      var d = event.data;
      if (!d || d.source !== "vzero-playground" || d.type !== "resize") return;
      var h = Number(d.height);
      if (!isFinite(h) || h <= 0) return;
      frame.style.height = Math.max(400, Math.min(h, 6000)) + "px";
    });
  }

  function init() {
    initTabs();
    initFilter();
    buildDots();
    initVideos();
    initLightbox();
    initMap();
    initPlayground();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
