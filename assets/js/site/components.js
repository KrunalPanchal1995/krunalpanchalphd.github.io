/* components.js: publications filters (year + disclosure tier), result count, empty state, aria-expanded sync for the
   gem's abstract/award/bibtex toggles. Works with the markup of _layouts/bib.liquid; coexists with the gem's
   bibsearch.js (which toggles .unloaded) by using its own .is-filtered class. No dependencies. */
(function () {
  "use strict";

  var TIER_LABELS = {
    published: "Published",
    accepted: "Accepted",
    "under-review": "Under review",
    "in-preparation": "In preparation",
  };
  var TIER_ORDER = ["published", "accepted", "under-review", "in-preparation"];

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* keep aria-expanded truthful on the gem's toggle links (the gem only flips the .open class) */
  function syncToggles() {
    var map = [];
    document.querySelectorAll(".links a.abstract, .links a.award, .links a.bibtex").forEach(function (a) {
      var id = a.getAttribute("aria-controls");
      var panel = id && document.getElementById(id);
      if (!panel) return;
      a.setAttribute("aria-expanded", panel.classList.contains("open") ? "true" : "false");
      map.push([a, panel]);
    });
    if (!map.length || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      map.forEach(function (p) {
        p[0].setAttribute("aria-expanded", p[1].classList.contains("open") ? "true" : "false");
      });
    });
    map.forEach(function (p) {
      obs.observe(p[1], { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* the toggles have no href (a "#" link would trigger the hover-preview popup), so make them keyboard operable */
  function keyboardToggles() {
    document.addEventListener("keydown", function (e) {
      var a = e.target;
      if (!a || !a.matches || !a.matches(".links a[role=button]:not([href])")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        a.click();
      }
    });
  }

  function initFilters() {
    var bar = document.querySelector("[data-pub-filters]");
    var list = document.querySelector("[data-pub-list]");
    if (!bar || !list) return;

    var items = Array.prototype.slice.call(list.querySelectorAll("ol.bibliography > li"));
    var state = { year: "all", tier: "all" };
    var countEl = document.querySelector("[data-pub-count]");
    var noMatch = document.querySelector("[data-pub-nomatch]");
    var search = document.getElementById("bibsearch");

    function cardOf(li) {
      return li.querySelector(".pub-card");
    }
    var years = [];
    var tiers = [];
    items.forEach(function (li) {
      var c = cardOf(li);
      if (!c) return;
      var y = c.getAttribute("data-year");
      var t = c.getAttribute("data-tier");
      if (y && years.indexOf(y) < 0) years.push(y);
      if (t && tiers.indexOf(t) < 0) tiers.push(t);
    });
    years.sort(function (a, b) {
      return b - a;
    });
    tiers.sort(function (a, b) {
      return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b);
    });

    function group(name, label, values, labelFn) {
      if (values.length < 2 && name === "year") return null;
      if (!values.length) return null;
      var wrap = document.createElement("div");
      wrap.className = "pub-filter-group";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", label);
      var lab = document.createElement("span");
      lab.className = "pub-filter-label eyebrow";
      lab.textContent = label;
      wrap.appendChild(lab);
      ["all"].concat(values).forEach(function (v) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pub-chip";
        b.setAttribute("data-filter", name);
        b.setAttribute("data-value", v);
        if (name === "tier" && v !== "all") b.setAttribute("data-tier", v);
        b.setAttribute("aria-pressed", v === "all" ? "true" : "false");
        b.textContent = v === "all" ? "All" : labelFn(v);
        wrap.appendChild(b);
      });
      return wrap;
    }

    var gy = group("year", "Year", years, String);
    var gt = group("tier", "Status", tiers, function (v) {
      return TIER_LABELS[v] || v;
    });
    if (gy) bar.appendChild(gy);
    if (gt) bar.appendChild(gt);
    if (!gy && !gt) bar.hidden = true;

    function apply() {
      var shown = 0;
      items.forEach(function (li) {
        var c = cardOf(li);
        var ok = true;
        if (c) {
          if (state.year !== "all" && c.getAttribute("data-year") !== state.year) ok = false;
          if (state.tier !== "all" && c.getAttribute("data-tier") !== state.tier) ok = false;
        }
        li.classList.toggle("is-filtered", !ok);
      });
      /* hide a year heading + list when every card in it is filtered out */
      list.querySelectorAll("h2.bibliography").forEach(function (h) {
        var ol = h.nextElementSibling;
        while (ol && ol.tagName !== "OL") ol = ol.nextElementSibling;
        if (!ol) return;
        var all = ol.querySelectorAll(":scope > li").length;
        var gone = ol.querySelectorAll(":scope > li.is-filtered").length;
        h.classList.toggle("is-filtered", gone === all);
        ol.classList.toggle("is-filtered", gone === all);
      });
      refreshCount();
    }

    function refreshCount() {
      shownCount();
    }
    function shownCount() {
      var n = items.filter(function (li) {
        return !li.classList.contains("is-filtered") && !li.classList.contains("unloaded");
      }).length;
      if (countEl) countEl.textContent = n === items.length ? items.length + " publications" : n + " of " + items.length + " publications";
      if (noMatch) noMatch.hidden = n !== 0;
      list.hidden = n === 0;
    }

    bar.addEventListener("click", function (e) {
      var b = e.target.closest(".pub-chip");
      if (!b) return;
      var name = b.getAttribute("data-filter");
      state[name] = b.getAttribute("data-value");
      bar.querySelectorAll('.pub-chip[data-filter="' + name + '"]').forEach(function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      apply();
    });

    if (search) {
      search.addEventListener("input", function () {
        setTimeout(shownCount, 400);
      });
      window.addEventListener("hashchange", function () {
        setTimeout(shownCount, 400);
      });
    }

    var reset = document.querySelector("[data-pub-reset]");
    if (reset) {
      reset.addEventListener("click", function () {
        state.year = "all";
        state.tier = "all";
        bar.querySelectorAll(".pub-chip").forEach(function (x) {
          x.setAttribute("aria-pressed", x.getAttribute("data-value") === "all" ? "true" : "false");
        });
        if (search) {
          search.value = "";
          search.dispatchEvent(new Event("input"));
        }
        apply();
      });
    }

    apply();
    setTimeout(shownCount, 450);
  }

  ready(function () {
    syncToggles();
    keyboardToggles();
    initFilters();
  });
})();
