/* project.js: long-read helpers (anchors, table of contents, scrollspy, progress) and the gallery (tabs, video playback, descriptions, lightbox). */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function init(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var tablist = root.querySelector('[role="tablist"]');
    var panel = root.querySelector('[role="tabpanel"]');
    var cards = Array.prototype.slice.call(root.querySelectorAll(".pg-card"));
    var current = "all";

    /* ---------- tabs ---------- */
    function matches(card, key) {
      if (key === "all") return true;
      if (key === "videos") return card.hasAttribute("data-video");
      return card.getAttribute("data-topic") === key;
    }
    function select(key, focus) {
      var tab =
        tabs.filter(function (t) {
          return t.getAttribute("data-tab") === key;
        })[0] || tabs[0];
      key = tab.getAttribute("data-tab");
      current = key;
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", tab.id);
      cards.forEach(function (c) {
        var show = matches(c, key);
        c.hidden = !show;
        if (!show) pauseCard(c);
      });
      if (focus) tab.focus();
      observeVisible();
      if (typeof clampDescs === "function") setTimeout(clampDescs, 0);
    }
    if (tablist && tabs.length > 2) {
      tablist.hidden = false;
      tabs.forEach(function (t) {
        t.addEventListener("click", function () {
          select(t.getAttribute("data-tab"));
          try {
            history.replaceState(
              null,
              "",
              t.getAttribute("data-tab") === "all" ? location.pathname + location.search : "#" + t.getAttribute("data-tab")
            );
          } catch (e) {}
        });
      });
      tablist.addEventListener("keydown", function (e) {
        var i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        var n = tabs.length,
          to = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (i + 1) % n;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (i - 1 + n) % n;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = n - 1;
        if (to === null) return;
        e.preventDefault();
        select(tabs[to].getAttribute("data-tab"), true);
      });
      window.addEventListener("hashchange", function () {
        var h = location.hash.replace("#", "");
        if (h) select(h);
      });
    } else if (tablist) {
      tablist.hidden = true;
    }

    /* ---------- video in cards ---------- */
    var io = null;
    function pauseCard(c) {
      var v = c.querySelector("video");
      if (v && !v.paused) v.pause();
    }
    if ("IntersectionObserver" in window && !reduce) {
      io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            var v = en.target;
            if (en.isIntersecting) {
              if (lb && lb.open) return;
              var p = v.play();
              if (p && p.catch) p.catch(function () {});
            } else if (!v.paused) v.pause();
          });
        },
        { threshold: 0.45 }
      );
    }
    var videos = Array.prototype.slice.call(root.querySelectorAll("video.pg-media"));
    function observeVisible() {
      if (!io) return;
      videos.forEach(function (v) {
        io.unobserve(v);
        if (!v.closest(".pg-card").hidden) io.observe(v);
      });
    }
    if (reduce) {
      cards.forEach(function (c) {
        if (c.hasAttribute("data-video")) c.classList.add("pg-card--still");
      });
    }

    /* ---------- lightbox ---------- */
    var lb = null,
      lastFocus = null,
      idx = 0,
      list = [];
    function visibleCards() {
      return cards.filter(function (c) {
        return !c.hidden;
      });
    }
    function buildLb() {
      var el = document.createElement("div");
      el.className = "lb";
      el.hidden = true;
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", "Media viewer");
      el.innerHTML =
        '<div class="lb__bar"><span class="lb__count mono" aria-live="polite"></span>' +
        '<button type="button" class="lb__btn lb__close" aria-label="Close viewer"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Close</span></button></div>' +
        '<div class="lb__body"><div class="lb__stage"><button type="button" class="lb__btn lb__nav lb__prev" aria-label="Previous"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
        '<div class="lb__plate fx-plate"><div class="lb__media"></div></div>' +
        '<button type="button" class="lb__btn lb__nav lb__next" aria-label="Next"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div>' +
        '<div class="lb__info" tabindex="0" role="region" aria-label="Caption and description"><p class="lb__cap"></p><p class="lb__desc"></p></div></div>';
      document.body.appendChild(el);
      var o = {
        el: el,
        open: false,
        plate: el.querySelector(".lb__plate"),
        media: el.querySelector(".lb__media"),
        info: el.querySelector(".lb__info"),
        cap: el.querySelector(".lb__cap"),
        desc: el.querySelector(".lb__desc"),
        count: el.querySelector(".lb__count"),
        prev: el.querySelector(".lb__prev"),
        next: el.querySelector(".lb__next"),
        close: el.querySelector(".lb__close"),
      };
      o.close.addEventListener("click", closeLb);
      o.prev.addEventListener("click", function () {
        go(-1);
      });
      o.next.addEventListener("click", function () {
        go(1);
      });
      el.addEventListener("click", function (e) {
        if (e.target === el || e.target === o.media || e.target.classList.contains("lb__stage") || e.target.classList.contains("lb__plate"))
          closeLb();
        else if (e.target.tagName === "IMG" && o.media.contains(e.target)) o.media.classList.toggle("is-zoom");
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeLb();
        } else if (e.key === "ArrowLeft" && !(e.target.tagName === "VIDEO")) {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight" && !(e.target.tagName === "VIDEO")) {
          e.preventDefault();
          go(1);
        } else if (e.key === "Tab") trap(e);
      });
      /* swipe between items; ignored for pinch gestures and while zoomed in */
      var sx = null,
        sy = null;
      el.addEventListener(
        "touchstart",
        function (e) {
          var vv = window.visualViewport;
          if (e.touches.length !== 1 || o.media.classList.contains("is-zoom") || (vv && vv.scale > 1.02) || o.info.contains(e.target)) {
            sx = null;
            return;
          }
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
        },
        { passive: true }
      );
      el.addEventListener(
        "touchend",
        function (e) {
          if (sx === null) return;
          var dx = e.changedTouches[0].clientX - sx,
            dy = e.changedTouches[0].clientY - sy;
          sx = null;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        },
        { passive: true }
      );
      return o;
    }
    function trap(e) {
      var f = Array.prototype.slice.call(lb.el.querySelectorAll("button:not([disabled]), video[controls], .lb__info")).filter(function (n) {
        return n.offsetParent !== null;
      });
      if (!f.length) return;
      var first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !lb.el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    function show(i) {
      idx = i;
      var c = list[i];
      lb.media.textContent = "";
      lb.media.classList.remove("is-zoom");
      var img = c.querySelector("img"),
        vid = c.querySelector("video");
      var capEl = c.querySelector(".pg-cap__t");
      var cap = capEl ? capEl.textContent : "";
      var dEl = c.querySelector(".pg-desc");
      var desc = dEl ? dEl.textContent : "";
      var src = c.querySelector(".pg-plate");
      ["data-slate-project", "data-slate-take", "data-slate-file"].forEach(function (a) {
        if (src && src.getAttribute(a)) lb.plate.setAttribute(a, src.getAttribute(a));
      });
      if (c.hasAttribute("data-video")) {
        var v = document.createElement("video");
        v.controls = true;
        v.playsInline = true;
        v.loop = true;
        v.muted = true;
        v.poster = vid.getAttribute("poster");
        v.src = c.getAttribute("data-video");
        v.setAttribute("aria-label", cap || "Video");
        lb.media.appendChild(v);
        if (!reduce) {
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        }
      } else {
        var im = document.createElement("img");
        im.src = c.getAttribute("data-full");
        im.alt = img ? img.alt : "";
        lb.media.appendChild(im);
      }
      lb.cap.textContent = cap;
      lb.cap.hidden = !cap;
      lb.desc.textContent = desc;
      lb.desc.hidden = !desc;
      lb.info.hidden = !cap && !desc;
      lb.info.scrollTop = 0;
      lb.count.textContent = i + 1 + " / " + list.length;
      lb.prev.disabled = list.length < 2;
      lb.next.disabled = list.length < 2;
    }
    function go(d) {
      if (list.length < 2) return;
      show((idx + d + list.length) % list.length);
    }
    function openLb(card) {
      if (!lb) lb = buildLb();
      list = visibleCards();
      var i = list.indexOf(card);
      if (i < 0) {
        i = 0;
      }
      lastFocus = document.activeElement;
      videos.forEach(function (v) {
        v.pause();
      });
      lb.el.hidden = false;
      lb.open = true;
      document.documentElement.classList.add("lb-lock");
      show(i);
      lb.close.focus();
    }
    function closeLb() {
      if (!lb || !lb.open) return;
      lb.open = false;
      lb.el.hidden = true;
      lb.media.textContent = "";
      document.documentElement.classList.remove("lb-lock");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      observeVisible();
    }
    cards.forEach(function (c) {
      c.querySelector(".pg-open").addEventListener("click", function () {
        openLb(c);
      });
    });

    /* ---------- descriptions: clamp to three lines with a More toggle ---------- */
    var descs = Array.prototype.slice.call(root.querySelectorAll("[data-desc]"));
    var dn = 0;
    function clampDescs() {
      descs.forEach(function (d) {
        if (d.getAttribute("data-open") === "1") return;
        d.classList.add("is-clamped");
        var btn = d.nextElementSibling && d.nextElementSibling.classList.contains("pg-more") ? d.nextElementSibling : null;
        var needs = d.scrollHeight > d.clientHeight + 2;
        if (needs && !btn) {
          dn++;
          d.id = d.id || "pgd" + dn;
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pg-more";
          btn.textContent = "More";
          btn.setAttribute("aria-expanded", "false");
          btn.setAttribute("aria-controls", d.id);
          btn.addEventListener("click", function () {
            var open = d.getAttribute("data-open") === "1";
            d.setAttribute("data-open", open ? "0" : "1");
            d.classList.toggle("is-clamped", open);
            btn.textContent = open ? "More" : "Less";
            btn.setAttribute("aria-expanded", open ? "false" : "true");
          });
          d.parentNode.insertBefore(btn, d.nextSibling);
        } else if (!needs && btn && d.getAttribute("data-open") !== "1") {
          btn.remove();
          d.classList.remove("is-clamped");
        }
      });
    }
    clampDescs();
    var rzT = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rzT);
      rzT = setTimeout(clampDescs, 200);
    });

    /* ---------- init ---------- */
    var h = location.hash.replace("#", "");
    select(
      h &&
        tabs.some(function (t) {
          return t.getAttribute("data-tab") === h;
        })
        ? h
        : "all"
    );
  }

  /* ---------- long read: anchors, tables, table of contents, scrollspy, progress ---------- */
  function slugify(t) {
    return (
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "section"
    );
  }
  function initRead(read) {
    var prose = read.querySelector("[data-prose]");
    var side = read.querySelector("[data-toc-side]");
    var sheet = read.querySelector("[data-toc-sheet]");
    var used = {};
    var entries = [];
    function uid(base) {
      var id = base,
        n = 1;
      while (used[id] || (document.getElementById(id) && !used["!" + id])) {
        n++;
        id = base + "-" + n;
      }
      used[id] = true;
      return id;
    }
    if (prose) {
      /* wrap wide tables so they scroll inside their own focusable region */
      Array.prototype.forEach.call(prose.querySelectorAll("table"), function (t) {
        var w = document.createElement("div");
        w.className = "pj-tablewrap";
        w.tabIndex = 0;
        w.setAttribute("role", "region");
        w.setAttribute("aria-label", "Table");
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      });
      Array.prototype.forEach.call(prose.querySelectorAll("h2, h3"), function (h) {
        var text = h.textContent.trim();
        if (!h.id) h.id = uid(slugify(text));
        else used[h.id] = true;
        used["!" + h.id] = true;
        var a = document.createElement("a");
        a.className = "pj-anchor";
        a.href = "#" + h.id;
        a.setAttribute("aria-label", "Link to section: " + text);
        a.textContent = "#";
        h.appendChild(a);
        entries.push({ id: h.id, text: text, level: h.tagName === "H3" ? 3 : 2, el: h });
      });
    }
    Array.prototype.forEach.call(read.querySelectorAll("[data-toc-extra]"), function (sec) {
      var h = sec.querySelector("h2");
      if (h && h.id) entries.push({ id: h.id, text: sec.getAttribute("data-toc-extra"), level: 2, el: h });
    });
    if (entries.length < 3 || !(prose && prose.textContent.trim())) {
      if (entries.length < 2) return;
    }
    function fill(container) {
      var ol = container.querySelector(".pj-toc__list");
      entries.forEach(function (en) {
        var li = document.createElement("li");
        if (en.level === 3) li.className = "is-h3";
        var a = document.createElement("a");
        a.href = "#" + en.id;
        a.textContent = en.text;
        a.setAttribute("data-toc-id", en.id);
        li.appendChild(a);
        ol.appendChild(li);
      });
      container.hidden = false;
    }
    if (side) {
      fill(side);
      read.classList.add("has-toc");
    }
    if (sheet) {
      fill(sheet);
      sheet.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("a[data-toc-id]")) sheet.open = false;
      });
    }
    var links = Array.prototype.slice.call(read.querySelectorAll("a[data-toc-id]"));
    var current = null;
    function mark(id) {
      if (id === current) return;
      current = id;
      links.forEach(function (a) {
        if (a.getAttribute("data-toc-id") === id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
    /* scrollspy: the last heading whose top has passed the upper third of the viewport */
    var ticking = false;
    var bars = read.querySelectorAll("[data-prog-bar]");
    var nums = read.querySelectorAll("[data-prog-n]");
    function update() {
      ticking = false;
      var line = window.innerHeight * 0.3;
      var act = entries[0];
      entries.forEach(function (en) {
        if (en.el.getBoundingClientRect().top <= line) act = en;
      });
      if (act) mark(act.id);
      var r = (prose || read).getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.6;
      var pct = total > 0 ? Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / total)) : 1;
      var txt = Math.round(pct * 100) + "%";
      Array.prototype.forEach.call(bars, function (b) {
        b.style.width = txt;
      });
      Array.prototype.forEach.call(nums, function (n) {
        n.textContent = txt;
      });
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-read]"), initRead);
    Array.prototype.forEach.call(document.querySelectorAll("[data-gallery]"), init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
