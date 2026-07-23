/**
 * aGTM Inspector — panel logic.
 *
 * Runs in the DevTools panel (extension) context. It:
 *   1. fetches reader.js (page-context snapshot expression) once,
 *   2. polls it via chrome.devtools.inspectedWindow.eval() on an interval,
 *   3. renders six read-only tabs, and
 *   4. records aGTM-relevant network traffic via chrome.devtools.network.
 *
 * Read-only: nothing is ever written back to the inspected page.
 */
"use strict";

var POLL_MS = 700;
var LOGMAP = window.AGTM_LOGMAP || {};

var state = {
  snap: null,          // latest reader snapshot
  readerCode: null,    // text of reader.js
  activeTab: "consent",
  net: [],             // captured network entries (newest first)
  netOnlyAGTM: true
};

/* ---------- theme ---------- */
try {
  if (chrome.devtools.panels.themeName === "dark") document.body.classList.add("dark");
} catch (e) { /* ignore */ }

/* ---------- helpers ---------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function el(id) { return document.getElementById(id); }

function esc(s) {
  s = (s === null || typeof s === "undefined") ? "" : String(s);
  return s.replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}
function isEmpty(o) {
  if (!o) return true;
  if (Array.isArray(o)) return o.length === 0;
  if (typeof o === "object") { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return false; return true; }
  return !o;
}
function fmtTime(ms) {
  if (!ms) return "";
  var t = new Date(ms);
  function p(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  return p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds()) + "." + p(t.getMilliseconds(), 3);
}
function pretty(x) {
  try { return JSON.stringify(x, null, 2); } catch (e) { return String(x); }
}
function truthy(v) { return v === true || v === "true"; }

/* ---------- reader / poll ---------- */
function loadReader(cb) {
  fetch(chrome.runtime.getURL("reader.js"))
    .then(function (r) { return r.text(); })
    .then(function (txt) { state.readerCode = txt; cb && cb(); })
    .catch(function (e) { console.error("aGTM Inspector: reader load failed", e); });
}

function poll() {
  if (!state.readerCode) return;
  chrome.devtools.inspectedWindow.eval(state.readerCode, function (result, err) {
    if (err && (err.isError || err.isException)) {
      setLive(false, "eval-Fehler");
      return;
    }
    state.snap = result || { loaded: false };
    setLive(!!state.snap.loaded, state.snap.loaded ? "aGTM aktiv" : "aGTM nicht gefunden");
    el("ver").textContent = state.snap.loaded && state.snap.version ? ("v" + state.snap.version) : "";
    render();
  });
}

function setLive(on, text) {
  var dot = el("live-dot");
  dot.className = "dot " + (on ? "on" : "off");
  el("live-text").textContent = text;
}

/* ---------- tabs ---------- */
function initTabs() {
  var btns = el("tabs").querySelectorAll("button");
  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener("click", function () {
      state.activeTab = b.getAttribute("data-tab");
      Array.prototype.forEach.call(btns, function (x) { x.classList.toggle("active", x === b); });
      Array.prototype.forEach.call(document.querySelectorAll("main section"), function (s) {
        s.classList.toggle("active", s.id === "tab-" + state.activeTab);
      });
      render();
    });
  });
}

/* ---------- render dispatch ---------- */
function render() {
  var s = state.snap;
  if (!s || !s.loaded) {
    var msg = s && s.error
      ? '<div class="empty">aGTM-Reader-Fehler: <code>' + esc(s.error) + "</code></div>"
      : '<div class="empty">Auf dieser Seite ist <code>window.aGTM</code> (noch) nicht vorhanden.<br>' +
        "Seite laden, auf der aGTM eingebunden ist — die Ansicht aktualisiert sich automatisch.</div>";
    // network tab still useful without aGTM loaded
    ["consent", "events", "gtm", "session", "config"].forEach(function (t) { el("tab-" + t).innerHTML = msg; });
    renderNetwork();
    return;
  }
  switch (state.activeTab) {
    case "consent": renderConsent(); break;
    case "events": renderEvents(); break;
    case "gtm": renderGTM(); break;
    case "session": renderSession(); break;
    case "config": renderConfig(); break;
    case "network": renderNetwork(); break;
  }
}

/* ---------- Consent ---------- */
function renderConsent() {
  var s = state.snap, c = s.consent || {};
  var gtm = truthy(c.gtmConsent);
  var statusChip = {
    "": ['muted', 'kein Preset'],
    "preset": ['warn', 'preset'],
    "preset_with_consent": ['acc', 'preset_with_consent'],
    "synced": ['ok', 'synced'],
    "confirmed": ['ok', 'confirmed']
  }[s.session_status] || ['muted', s.session_status || "—"];

  var rows = [
    ["GTM lädt (gtmConsent)", gtm ? '<span class="chip ok">true</span>' : '<span class="chip err">false</span>'],
    ["hasResponse", chip(c.hasResponse)],
    ["blocked", typeof c.blocked === "undefined" ? '<span class="muted">—</span>' : chip(c.blocked)],
    ["CMP", s.cmp ? '<span class="chip acc">' + esc(s.cmp) + "</span>" : '<span class="muted">— (keiner konfiguriert)</span>'],
    ["session_status", '<span class="chip ' + statusChip[0] + '">' + esc(statusChip[1]) + "</span>"],
    ["services", longStr(c.services)],
    ["purposes", longStr(c.purposes)],
    ["vendors", longStr(c.vendors)],
    ["consent_id", c.consent_id ? '<span class="mono">' + esc(c.consent_id) + "</span>" : '<span class="muted">—</span>'],
    ["feedback", c.feedback ? esc(c.feedback) : '<span class="muted">—</span>'],
    ["consent_hash", '<span class="mono">' + esc(c && s.consent_hash || "—") + "</span>"],
    ["last_consent_hash", '<span class="mono">' + esc(s.last_consent_hash || "—") + "</span>"]
  ];

  var html =
    '<div class="card"><h2>Consent-Entscheidung</h2>' +
    '<div class="grid">' + rows.map(function (r) {
      return '<div class="k">' + esc(r[0]) + '</div><div class="v">' + r[1] + "</div>";
    }).join("") + "</div></div>";

  if (!gtm) {
    html += '<div class="card warnbox"><strong>GTM ist derzeit nicht freigegeben.</strong> ' +
      "<span class=\"muted\">gtmConsent=false → die aGTM-Injection wartet auf eine (Pflicht-)Consent-Entscheidung. " +
      "Events werden bis dahin in der Queue gehalten (siehe Tab <em>Events</em>).</span></div>";
  }
  el("tab-consent").innerHTML = html;
}
function chip(v) {
  if (v === true || v === "true") return '<span class="chip ok">true</span>';
  if (v === false || v === "false") return '<span class="chip err">false</span>';
  return '<span class="muted">—</span>';
}
function longStr(v) {
  if (!v) return '<span class="muted">—</span>';
  return '<span class="mono" style="word-break:break-all">' + esc(v) + "</span>";
}

/* ---------- Events ---------- */
function eventFlags(ev) {
  var f = [];
  if (truthy(ev._noConsent)) f.push('<span class="chip acc">_noConsent</span>');
  if (truthy(ev._noDLPush)) f.push('<span class="chip warn">_noDLPush</span>');
  if (typeof ev._post !== "undefined" && ev._post) f.push('<span class="chip acc">_post</span>');
  if (truthy(ev.aGTMrepeated)) f.push('<span class="chip">repeated</span>');
  return f.join(" ");
}
function renderEvents() {
  var s = state.snap;
  var dl = s.dl || [], queue = s.queue || [], log = s.log || [];
  var html = "";

  // Queue (waiting for consent)
  html += '<div class="card"><h2>Queue — aGTM.d.f (wartet auf Consent) · ' + s.queueLen + '</h2>';
  if (isEmpty(queue)) {
    html += '<div class="muted">leer — keine zurückgehaltenen Events.</div>';
  } else {
    html += eventTable(queue);
  }
  html += "</div>";

  // Dispatched events (aGTM.d.dl)
  html += '<div class="card"><h2>Event-Log — aGTM.d.dl (letzte ' + dl.length + ')</h2>';
  if (isEmpty(dl)) {
    html += '<div class="muted">noch keine Events durch aGTM.f.fire() gelaufen.</div>';
  } else {
    html += eventTable(dl.slice().reverse());
  }
  html += "</div>";

  // Decoded internal log (aGTM.l)
  html += '<div class="card"><h2>Internes Log — aGTM.l (dekodiert, letzte ' + log.length + ')</h2>';
  if (isEmpty(log)) {
    html += '<div class="muted">kein Log — ist aGTM_debug.js geladen bzw. Logging aktiv?</div>';
  } else {
    html += '<table><thead><tr><th>Zeit</th><th>Typ</th><th>ID</th><th>Meldung</th></tr></thead><tbody>';
    log.slice().reverse().forEach(function (e) {
      var m = LOGMAP[e.id] || {};
      var cls = m.type === "err" ? "err" : "ok";
      html += "<tr>" +
        '<td class="mono">' + esc(fmtTime(e.timestamp)) + "</td>" +
        '<td><span class="chip ' + cls + '">' + esc(m.type || "?") + "</span></td>" +
        '<td class="mono">' + esc(e.id) + "</td>" +
        "<td>" + esc(m.msg || "(unbekannte ID)") + "</td></tr>";
    });
    html += "</tbody></table>";
  }
  html += "</div>";

  el("tab-events").innerHTML = html;
}
function eventTable(list) {
  var h = '<table><thead><tr><th>event</th><th>Flags</th><th>Zeit</th></tr></thead><tbody>';
  list.forEach(function (ev) {
    ev = ev || {};
    h += '<tr class="evt">' +
      '<td class="mono">' + esc(ev.event || "(kein event-Feld)") + "</td>" +
      "<td>" + (eventFlags(ev) || '<span class="muted">—</span>') + "</td>" +
      '<td class="mono">' + esc(ev.aGTMts ? fmtTime(ev.aGTMts) : "") + "</td>" +
      "</tr>";
  });
  h += "</tbody></table>";
  return h;
}

/* ---------- GTM ---------- */
function renderGTM() {
  var s = state.snap;
  var containers = s.containers || [];
  var html = '<div class="card"><h2>Injection-Status</h2><div class="grid">' +
    '<div class="k">aGTM.d.init</div><div class="v">' + chip(s.init) + "</div>" +
    '<div class="k">dataLayer-Variable</div><div class="v mono">' + esc(s.gdl || "—") + "</div>" +
    '<div class="k">aktive gtmID</div><div class="v mono">' + esc(s.gtmID || "—") + "</div>" +
    '<div class="k">geladen (aGTM.d.gtmLoaded)</div><div class="v mono">' + esc((s.gtmLoaded || []).join(", ") || "—") + "</div>" +
    "</div></div>";

  html += '<div class="card"><h2>Container — aGTM.c.gtm</h2>';
  if (isEmpty(containers)) {
    html += '<div class="muted">keine Container konfiguriert.</div>';
  } else {
    html += '<table><thead><tr><th>Container-ID</th><th>noConsent</th><th>geladen</th></tr></thead><tbody>';
    containers.forEach(function (c) {
      html += "<tr>" +
        '<td class="mono">' + esc(c.id) + "</td>" +
        "<td>" + (c.noConsent ? '<span class="chip warn">noConsent</span>' : '<span class="muted">consent-gated</span>') + "</td>" +
        "<td>" + (c.hasLoaded ? '<span class="chip ok">ja</span>' : '<span class="chip">nein</span>') + "</td>" +
        "</tr>";
    });
    html += "</tbody></table>" +
      '<div class="muted" style="margin-top:8px">noConsent-Container werden via initGTM(true) <em>vor</em> der Consent-Entscheidung geladen.</div>';
  }
  html += "</div>";
  el("tab-gtm").innerHTML = html;
}

/* ---------- Session / Attribution ---------- */
function renderSession() {
  var s = state.snap, se = s.session || {};
  var html = '<div class="card"><h2>Session — aGTM.d.session</h2><div class="grid">' +
    '<div class="k">source</div><div class="v mono">' + (se.source ? esc(se.source) : '<span class="muted">—</span>') + "</div>" +
    '<div class="k">sid</div><div class="v mono">' + (se.sid ? esc(se.sid) : '<span class="muted">—</span>') + "</div>" +
    '<div class="k">uid</div><div class="v mono">' + (se.uid ? esc(se.uid) : '<span class="muted">—</span>') + "</div>" +
    "</div></div>";

  var attr = s.attribution || {};
  html += '<div class="card"><h2>Attribution — aGTM.d.attribution</h2>';
  if (isEmpty(attr)) {
    html += '<div class="muted">keine Attribution-Daten (kein Preset / keine Sources-API-Antwort).</div>';
  } else {
    html += '<table><thead><tr><th>Methode</th><th>Felder</th></tr></thead><tbody>';
    for (var method in attr) {
      if (!Object.prototype.hasOwnProperty.call(attr, method)) continue;
      var obj = attr[method] || {};
      var parts = [];
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== "" && obj[k] !== null) {
        parts.push('<span class="chip"><span class="muted">' + esc(k) + "=</span>" + esc(obj[k]) + "</span>");
      }
      html += "<tr><td class=\"mono\">" + esc(method) + "</td><td>" + (parts.join(" ") || '<span class="muted">—</span>') + "</td></tr>";
    }
    html += "</tbody></table>";
  }
  html += "</div>";

  if (!isEmpty(se.raw)) {
    html += '<div class="card"><h2>Roh — aGTM.d.session</h2><pre>' + esc(pretty(se.raw)) + "</pre></div>";
  }
  el("tab-session").innerHTML = html;
}

/* ---------- Config ---------- */
var CONFIG_TRAPS = [
  { key: "cmp", test: function (c) { return typeof c.cmp === "undefined" || c.cmp === ""; },
    msg: "Kein cmp konfiguriert — ohne CMP-Adapter wird Consent nie erkannt (außer cmp:'none' erzwingt Laden)." },
  { key: "gtm", test: function (c) { return isEmpty(c.gtm); },
    msg: "Keine GTM-Container in aGTM.c.gtm — es wird nichts injiziert." },
  { key: "gdl", test: function (c) { return !c.gdl; },
    msg: "Keine dataLayer-Variable (gdl) gesetzt." },
  { key: "consent_poll_ms", test: function (c) { return c.consent_store_url && (c.consent_poll_ms === 0); },
    msg: "consent_store_url gesetzt, aber consent_poll_ms=0 — CMP-State-Änderungen via direktem dataLayer.push werden nicht nachgepollt." },
  { key: "consent_store_enc", test: function (c) { return truthy(c.consent_store_enc); },
    msg: "consent_store_enc=true — der Server-Endpoint muss die XOR/Caesar-Payload entschlüsseln können (aktuell nicht implementiert, /aGTMconsent → 501)." }
];
function renderConfig() {
  var s = state.snap, c = s.config || {};
  var traps = CONFIG_TRAPS.filter(function (t) { try { return t.test(c); } catch (e) { return false; } });
  var html = "";
  if (traps.length) {
    html += '<div class="card warnbox"><h2>Mögliche Konfig-Fallen</h2><ul style="margin:4px 0 0;padding-left:18px">';
    traps.forEach(function (t) { html += "<li><code>" + esc(t.key) + "</code> — " + esc(t.msg) + "</li>"; });
    html += "</ul></div>";
  } else {
    html += '<div class="card"><span class="chip ok">keine bekannten Konfig-Fallen erkannt</span></div>';
  }
  html += '<div class="card"><h2>aGTM.c (vollständig)</h2><pre>' + esc(pretty(c)) + "</pre></div>";
  el("tab-config").innerHTML = html;
}

/* ---------- Network ---------- */
function classify(url) {
  if (/\/aGTMconsent(\b|\/|\?|$)/.test(url)) return { key: "consent-store", cls: "acc" };
  if (/\/aGTMsources(\b|\/|\?|$)/.test(url)) return { key: "sources", cls: "acc" };
  if (/\/aGTM\.js(\?|$)/.test(url)) return { key: "aGTM.js", cls: "acc" };
  if (/\/tp\/sources|[?&]attribution=/.test(url)) return { key: "sources-api", cls: "acc" };
  if (/googletagmanager\.com\/gtm\.js|\/gtm\.js(\?|$)/.test(url)) return { key: "gtm.js", cls: "ok" };
  if (/googletagmanager\.com\/gtag\/js|\/gtag\/js(\?|$)/.test(url)) return { key: "gtag.js", cls: "ok" };
  if (/google-analytics\.com|\/g\/collect|\/mp\/collect|\/collect(\?|$)/.test(url)) return { key: "ga-collect", cls: "warn" };
  return null;
}
function initNetwork() {
  try {
    chrome.devtools.network.onRequestFinished.addListener(function (req) {
      try {
        var url = req.request && req.request.url;
        if (!url) return;
        var cl = classify(url);
        state.net.unshift({
          url: url,
          method: (req.request && req.request.method) || "",
          status: (req.response && req.response.status) || 0,
          cls: cl,
          ts: (new Date()).getTime(),
          time: req.time || 0
        });
        if (state.net.length > 500) state.net.length = 500;
        if (state.activeTab === "network") renderNetwork();
      } catch (e) { /* ignore single entry */ }
    });
    chrome.devtools.network.onNavigated.addListener(function () {
      state.net = [];
      if (state.activeTab === "network") renderNetwork();
    });
  } catch (e) {
    console.error("aGTM Inspector: network capture unavailable", e);
  }
}
function renderNetwork() {
  var list = state.netOnlyAGTM ? state.net.filter(function (e) { return e.cls; }) : state.net;
  var html = '<div class="toolbar">' +
    '<label><input type="checkbox" id="net-filter"' + (state.netOnlyAGTM ? " checked" : "") + "> nur aGTM-relevant</label>" +
    '<button class="small" id="net-clear">Leeren</button>' +
    '<span class="muted">' + list.length + " Einträge</span></div>";

  if (isEmpty(list)) {
    html += '<div class="empty">Noch keine' + (state.netOnlyAGTM ? " aGTM-relevanten" : "") +
      " Requests aufgezeichnet.<br>Seite (neu) laden oder Consent erteilen — gtm.js / aGTMconsent / aGTM.js erscheinen hier.</div>";
  } else {
    html += '<table><thead><tr><th>Typ</th><th>Status</th><th>Methode</th><th>URL</th><th>Zeit</th></tr></thead><tbody>';
    list.forEach(function (e) {
      var typeCell = e.cls
        ? '<span class="chip ' + e.cls.cls + '">' + esc(e.cls.key) + "</span>"
        : '<span class="muted">—</span>';
      var stCls = e.status >= 200 && e.status < 300 ? "ok" : (e.status >= 400 || e.status === 0 ? "err" : "warn");
      html += '<tr class="evt">' +
        "<td>" + typeCell + "</td>" +
        '<td><span class="chip ' + stCls + '">' + esc(e.status || "—") + "</span></td>" +
        '<td class="mono">' + esc(e.method) + "</td>" +
        '<td class="mono" style="word-break:break-all">' + esc(e.url) + "</td>" +
        '<td class="mono">' + esc(fmtTime(e.ts)) + "</td></tr>";
    });
    html += "</tbody></table>";
  }
  el("tab-network").innerHTML = html;

  var f = el("net-filter");
  if (f) f.addEventListener("change", function () { state.netOnlyAGTM = f.checked; renderNetwork(); });
  var cl = el("net-clear");
  if (cl) cl.addEventListener("click", function () { state.net = []; renderNetwork(); });
}

/* ---------- boot ---------- */
initTabs();
initNetwork();
loadReader(function () {
  poll();
  setInterval(poll, POLL_MS);
});
