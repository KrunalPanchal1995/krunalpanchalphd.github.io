/* request.js: the open-science request-access control (WP-J). One owner: _includes/request-access.liquid + assets/css/site/open.css.
 * - Works on every [data-oa-req] block. Config (copy, email templates, form endpoint) and the catalogue come from the page's
 *   <script type="application/json" id="oa-config|oa-catalog">; the site address is NEVER in static HTML: it is rejoined here, at click
 *   time, from the halves the site's protect-email markup carries (data-eu / data-ed) in the block or in the hidden [data-oa-host].
 * - Email route: an <a data-oa-mail> whose href is set to mailto:... when it is clicked (subject/body prefilled: title, id, page URL).
 *   Fallback: copy the message text. Form route (only when form_endpoint is set): a small form POSTed with fetch (JSON), honeypot,
 *   success/error states, no third-party code.
 * - window.OpenAccess.openDialog({id, title}) opens the same controls in a <dialog> (used by studio.js for the Studio's locked code
 *   cards: postMessage {type:'request-access', id, title} from the iframe).
 * Honest limit: this file is static JS; anything shipped to a browser can be read. It keeps the address out of crawled HTML, no more. */
(function () {
  "use strict";
  function json(id) {
    var n = document.getElementById(id);
    if (!n) return null;
    try {
      return JSON.parse(n.textContent);
    } catch (e) {
      return null;
    }
  }
  var cfg = json("oa-config") || {};
  var catalog = json("oa-catalog") || [];
  var cp = cfg.component || {};
  var em = cfg.email || {};
  var endpoint = typeof cfg.form_endpoint === "string" ? cfg.form_endpoint.trim() : "";

  function find(id) {
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }
  function fill(t, v) {
    return String(t || "").replace(/\{(title|id|url)\}/g, function (_, k) {
      return v[k] || "";
    });
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  /** the address, joined only now. root: the block (or document) holding the protect-email markup. */
  function address(root) {
    var scopes = [root, document];
    for (var i = 0; i < scopes.length; i++) {
      var a = scopes[i].querySelector(".al-email-protect[data-eu][data-ed]");
      if (a) return a.getAttribute("data-eu") + "@" + a.getAttribute("data-ed");
      var m = scopes[i].querySelector("a[href^='mailto:']");
      if (m) return decodeURIComponent(m.getAttribute("href").slice(7).split("?")[0]);
    }
    return "";
  }
  function pageUrl(id) {
    var u = location.origin + location.pathname.replace(/index\.html$/, "");
    return u + (id ? "#oa-" + encodeURIComponent(id) : "");
  }
  function message(item) {
    var v = { title: item.title, id: item.id, url: pageUrl(item.id) };
    return { subject: fill(em.subject, v), body: fill(em.body, v) };
  }
  function say(box, text, bad) {
    var s = box.querySelector("[data-oa-status]");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("is-bad", !!bad);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var t = el("textarea", { "aria-hidden": "true", tabindex: "-1" });
      t.value = text;
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(t);
      t.select();
      var done = false;
      try {
        done = document.execCommand("copy");
      } catch (e) {}
      t.remove();
      done ? ok() : no(new Error("copy"));
    });
  }

  function buildForm(box, item) {
    var host = box.querySelector("[data-oa-formhost]");
    if (!host || host.firstChild) return;
    var uid = "oaf" + Math.random().toString(36).slice(2, 8);
    var f = el("form", { class: "oa-form", novalidate: "" });
    function field(name, label, type, req) {
      var w = el("div", { class: "oa-field" });
      var id = uid + "-" + name;
      w.appendChild(el("label", { for: id }, label));
      var i = el(name === "purpose" ? "textarea" : "input", { id: id, name: name });
      if (name !== "purpose") i.type = type || "text";
      else i.rows = 2;
      if (req) i.setAttribute("required", "");
      if (name === "name") i.autocomplete = "name";
      if (name === "email") i.autocomplete = "email";
      w.appendChild(i);
      return w;
    }
    f.appendChild(field("name", cp.form_name, "text", true));
    f.appendChild(field("email", cp.form_email, "email", true));
    f.appendChild(field("affiliation", cp.form_affiliation, "text", false));
    f.appendChild(field("purpose", cp.form_purpose, "text", false));
    var hp = el("div", { class: "oa-hp", "aria-hidden": "true" });
    var hpi = el("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off" });
    hp.appendChild(hpi);
    f.appendChild(hp);
    var idf = el("input", { type: "hidden", name: "id" });
    idf.value = item.id;
    f.appendChild(idf);
    var tf = el("input", { type: "hidden", name: "title" });
    tf.value = item.title;
    f.appendChild(tf);
    var btn = el("button", { class: "oa-btn oa-btn--primary", type: "submit" }, cp.form_submit);
    f.appendChild(btn);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new FormData(f);
      var mail = String(d.get("email") || "");
      if (!String(d.get("name") || "").trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
        say(box, cp.form_invalid, true);
        return;
      }
      if (d.get("website")) {
        say(box, cp.form_success); // bots: pretend
        return;
      }
      var body = {};
      d.forEach(function (v, k) {
        if (k !== "website") body[k] = String(v);
      });
      body.page = pageUrl(item.id);
      btn.disabled = true;
      say(box, cp.form_sending);
      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          f.reset();
          say(box, cp.form_success);
        })
        .catch(function () {
          say(box, cp.form_error, true);
        })
        .then(function () {
          btn.disabled = false;
        });
    });
    host.appendChild(f);
  }

  function wire(box, item) {
    var mail = box.querySelector("[data-oa-mail]");
    var copy = box.querySelector("[data-oa-copy]");
    var wrap = box.querySelector("[data-oa-formwrap]");
    box.setAttribute("data-oa-ready", "");
    if (mail) {
      mail.hidden = false;
      mail.addEventListener("click", function (e) {
        e.preventDefault();
        var to = address(box);
        if (!to) {
          say(box, cp.mail_unavailable, true);
          return;
        }
        var m = message(item);
        var href = "mailto:" + to + "?subject=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.body);
        mail.setAttribute("href", href);
        say(box, cp.mail_opened);
        window.location.href = href;
      });
    }
    if (copy) {
      copy.hidden = false;
      copy.addEventListener("click", function () {
        var m = message(item);
        copyText(m.subject + "\n\n" + m.body).then(
          function () {
            say(box, cp.copied);
          },
          function () {
            say(box, cp.copy_failed, true);
          }
        );
      });
    }
    if (wrap && endpoint) {
      wrap.hidden = false;
      wrap.addEventListener("toggle", function () {
        if (wrap.open) buildForm(box, item);
      });
    }
  }

  function init() {
    var boxes = document.querySelectorAll("[data-oa-req]");
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.hasAttribute("data-oa-ready")) continue;
      var id = b.getAttribute("data-oa-id");
      var item = find(id) || { id: id, title: b.getAttribute("data-oa-title") || id };
      wire(b, { id: item.id, title: b.getAttribute("data-oa-title") || item.title });
    }
    // open a row's request from a link: /open/#oa-<id>
    var m = /^#oa-(.+)$/.exec(location.hash);
    if (m) {
      var row = document.getElementById("oa-" + decodeURIComponent(m[1]));
      if (row && row.scrollIntoView) row.scrollIntoView({ block: "center" });
    }
  }

  var dlg = null;
  /** a modal with the request controls for any {id, title} (catalogue item, or a Studio explainer id with its title) */
  function openDialog(d) {
    if (!d || !d.id) return;
    var item = find(d.id);
    var title = d.title || (item && item.title) || d.id;
    if (dlg) dlg.remove();
    dlg = el("dialog", { class: "oa-dialog", "aria-labelledby": "oa-dlg-t" });
    var h = el("h2", { id: "oa-dlg-t" }, cp.locked_title || "Code + PDF on request");
    var p = el("p", { class: "oa-dialog__item" }, title);
    var box = el("div", { class: "oa-req", "data-oa-req": "", "data-oa-id": d.id, "data-oa-title": title });
    var act = el("div", { class: "oa-actions" });
    var a = el("a", { class: "oa-btn oa-btn--primary", href: "#", role: "button", "data-oa-mail": "", hidden: "" }, cp.request_button);
    var c = el("button", { class: "oa-btn", type: "button", "data-oa-copy": "", hidden: "" }, cp.copy_button);
    act.appendChild(a);
    act.appendChild(c);
    box.appendChild(act);
    box.appendChild(el("p", { class: "oa-note" }, cp.request_note));
    if (endpoint) {
      var w = el("details", { class: "oa-formwrap", "data-oa-formwrap": "", hidden: "" });
      w.appendChild(el("summary", {}, cp.form_title));
      w.appendChild(el("div", { class: "oa-formhost", "data-oa-formhost": "" }));
      box.appendChild(w);
    }
    box.appendChild(el("p", { class: "oa-status", role: "status", "aria-live": "polite", "data-oa-status": "" }));
    var close = el("button", { class: "oa-btn oa-dialog__close", type: "button" }, "Close");
    close.addEventListener("click", function () {
      dlg.close();
    });
    dlg.appendChild(h);
    dlg.appendChild(p);
    dlg.appendChild(box);
    dlg.appendChild(close);
    dlg.addEventListener("close", function () {
      dlg.remove();
      dlg = null;
    });
    document.body.appendChild(dlg);
    wire(box, { id: d.id, title: title });
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute("open", "");
    a.focus();
  }
  window.OpenAccess = { openDialog: openDialog, init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
