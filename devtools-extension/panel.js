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
var JV = window.aGTMInspectorJsonView || { highlight: function (x) { return esc(pretty(x)); } };

var state = {
  snap: null,          // latest reader snapshot
  readerCode: null,    // text of reader.js
  activeTab: "diagnose",
  net: [],             // captured network entries (newest first)
  netOnlyAGTM: true,
  netSearch: "",       // network free-text filter (prefix - to exclude)
  netHidden: {},       // network hosts toggled off via the host checkboxes
  // Expand/collapse state for event & log rows, keyed by a stable row key
  // (type|timestamp|name). Encoded into the rendered HTML so it survives the
  // POLL_MS repaint (paint() only swaps innerHTML when the HTML string changes).
  expanded: {},
  configBaseline: null,  // first config snapshot seen, for the Config runtime-diff
  diag: null,            // latest Diagnose-tab inputs, for the report export buttons
  navObserved: false,    // true once a page navigation was witnessed (network capture
                         // then covers the pre-consent window — gates the leak health-check)
  // Session/User-ID change tracking (Diagnose tab). idTrack: field -> {value, since}
  // (current value + first-observed ts); idHistory: [{ts, field, from, to}] append-only.
  // In-memory (survives page reloads while DevTools stays open — so a reload that triggers
  // the F→C user-id promote is captured — but resets when the panel is closed).
  idTrack: {},
  idHistory: []
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

/**
 * Repaint guard: only replace a section's innerHTML when it actually changed.
 * The poll re-renders every POLL_MS; without this, replacing innerHTML on every
 * tick resets scroll position (painful on the Config <pre>). Returns true if it
 * repainted (so callers can re-attach event listeners only when needed).
 */
function paint(sectionId, html) {
  var node = el(sectionId);
  if (!node) return false;
  if (node.__lastHTML === html) return false;
  node.__lastHTML = html;
  node.innerHTML = html;
  return true;
}

/* ---------- persisted settings (localStorage — no permission needed) ---------- */
var LS_KEY = "aGTMInspector.settings";
function loadSettings() {
  try {
    if (typeof localStorage === "undefined") return;
    var s = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (s && typeof s === "object") {
      if (typeof s.netOnlyAGTM === "boolean") state.netOnlyAGTM = s.netOnlyAGTM;
      if (s.netHidden && typeof s.netHidden === "object") state.netHidden = s.netHidden;
    }
  } catch (e) { /* ignore corrupt/unavailable storage */ }
}
function saveSettings() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify({ netOnlyAGTM: state.netOnlyAGTM, netHidden: state.netHidden }));
  } catch (e) { /* ignore */ }
}

/* ---------- scroll anchoring ---------- */
// The poll repaints every POLL_MS; streaming lists (events/dataLayer/network) prepend
// new rows at the top, which would push the content down under the viewport. Preserve the
// reader's position: only let it jump when the user is at the very top (scrollTop 0);
// otherwise shift scrollTop by the height that grew above.
function withScrollAnchor(fn) {
  var m = (typeof document !== "undefined" && document.querySelector) ? document.querySelector("main") : null;
  if (!m) { fn(); return; }
  var st = m.scrollTop, sh = m.scrollHeight;
  fn();
  if (st > 0) {
    var delta = m.scrollHeight - sh;
    if (delta) m.scrollTop = st + delta;
  }
}

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
      // Transient eval failure (e.g. mid-navigation context swap): keep the last
      // good tab contents on screen but flip the live dot red so the staleness is
      // visible. The next successful poll re-renders.
      setLive(false, "eval-Fehler (letzter Stand)");
      return;
    }
    state.snap = result || { loaded: false };
    trackIds(state.snap); // record sid/uid/user_id changes every poll (also when off the Diagnose tab)
    setLive(!!state.snap.loaded, state.snap.loaded ? "aGTM aktiv" : "aGTM nicht gefunden");
    el("ver").textContent = state.snap.loaded && state.snap.version ? ("v" + state.snap.version) : "";
    withScrollAnchor(render);
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
      // Switching tabs starts a fresh view at the top (no scroll anchoring here).
      var m = document.querySelector ? document.querySelector("main") : null;
      if (m) m.scrollTop = 0;
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
    ["diagnose", "consent", "events", "gtm", "datalayer", "session", "config"].forEach(function (t) { paint("tab-" + t, msg); });
    renderNetwork();
    return;
  }
  switch (state.activeTab) {
    case "diagnose": renderDiagnose(); break;
    case "consent": renderConsent(); break;
    case "events": renderEvents(); break;
    case "gtm": renderGTM(); break;
    case "datalayer": renderDataLayer(); break;
    case "session": renderSession(); break;
    case "config": renderConfig(); break;
    case "network": renderNetwork(); break;
  }
}

/* ---------- Consent ---------- */
function renderConsent() {
  var s = state.snap, c = s.consent || {};
  var gtm = truthy(c.gtmConsent);
  var statusMap = {
    "": ['muted', 'kein Preset'],
    "preset": ['warn', 'preset'],
    "preset_with_consent": ['acc', 'preset_with_consent'],
    "synced": ['ok', 'synced'],
    "confirmed": ['ok', 'confirmed']
  };
  // hasOwnProperty-guarded so a hostile session_status like "__proto__"/"constructor"
  // can't resolve to an inherited prototype value and break the chip.
  var statusChip = Object.prototype.hasOwnProperty.call(statusMap, s.session_status)
    ? statusMap[s.session_status]
    : ['muted', s.session_status || "—"];

  var rows = [
    ["GTM lädt (gtmConsent)", gtm ? '<span class="chip ok">true</span>' : '<span class="chip err">false</span>'],
    ["hasResponse", chip(c.hasResponse)],
    ["blocked", typeof c.blocked === "undefined" ? '<span class="muted">—</span>' : chip(c.blocked)],
    ["CMP", cmpCell(s)],
    ["consent_events", s.consentEvents ? '<span class="mono">' + esc(s.consentEvents) + "</span>" : '<span class="muted">—</span>'],
    ["session_status", '<span class="chip ' + statusChip[0] + '">' + esc(statusChip[1]) + "</span>"],
    ["services", longStr(c.services)],
    ["purposes", longStr(c.purposes)],
    ["vendors", longStr(c.vendors)],
    ["consent_id", c.consent_id ? '<span class="mono">' + esc(c.consent_id) + "</span>" : '<span class="muted">—</span>'],
    ["feedback", c.feedback ? esc(c.feedback) : '<span class="muted">—</span>'],
    ["consent_hash", '<span class="mono">' + esc(s.consent_hash || "—") + "</span>"],
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

  html += renderConsentMode(s);
  html += renderVendors(s.vendors, s.vendorState);
  paint("tab-consent", html);
}
// Google Consent Mode — google_tag_data.ics.entries (update > default > implicit).
var GCM_ORDER = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization",
  "functionality_storage", "personalization_storage", "security_storage"];
function gcmCurrent(en) {
  if (en.update !== null && typeof en.update !== "undefined") return en.update;
  if (en["default"] !== null && typeof en["default"] !== "undefined") return en["default"];
  if (en.implicit !== null && typeof en.implicit !== "undefined") return en.implicit;
  // F-66: fall back to `declare` (the earliest/weakest ics signal) so a category that only
  // ever declared a value still shows a state instead of "—".
  return (en["declare"] !== null && typeof en["declare"] !== "undefined") ? en["declare"] : null;
}
function gcmChip(v) {
  if (v === true) return '<span class="chip ok">granted</span>';
  if (v === false) return '<span class="chip err">denied</span>';
  return '<span class="muted">—</span>';
}
function gcmMini(v) {
  if (v === true) return '<span style="color:var(--ok)">granted</span>';
  if (v === false) return '<span style="color:var(--err)">denied</span>';
  return '<span class="muted">—</span>';
}
function catShort(cat) { return cat.replace(/_storage$/, ""); }
// tri-state chip: true=granted, false=denied, null/undefined = not set.
function catChip(cat, tri) {
  var cls = tri === true ? "ok" : (tri === false ? "err" : "");
  var g = tri === true ? " ✓" : (tri === false ? " ✗" : "");
  return '<span class="chip ' + cls + '" title="' + esc(cat) + (tri === true ? "=granted" : tri === false ? "=denied" : "") + '">' + esc(catShort(cat)) + g + "</span>";
}
function payloadTri(payload, cat) {
  var v = payload ? payload[cat] : undefined;
  if (v === "granted" || v === true) return true;
  if (v === "denied" || v === false) return false;
  return null;
}
// Per-category chips for one consent command's payload + notable extras.
function consentSignalChips(payload) {
  if (!payload || typeof payload !== "object") return '<span class="muted">—</span>';
  var parts = [];
  GCM_ORDER.forEach(function (cat) {
    if (typeof payload[cat] !== "undefined") parts.push(catChip(cat, payloadTri(payload, cat)));
  });
  ["wait_for_update", "region"].forEach(function (k) {
    if (typeof payload[k] !== "undefined") parts.push('<span class="chip"><span class="muted">' + k + "=</span>" + esc(String(payload[k])) + "</span>");
  });
  return parts.length ? parts.join(" ") : '<span class="muted">—</span>';
}
function stepRow(kind, label, chips) {
  return '<tr><td class="fit caret"></td><td class="fit"><span class="chip cm-' + kind + '">' + esc(label) + "</span></td><td>" + chips + "</td></tr>";
}
// Expandable command row — click reveals the full payload that was actually sent.
function cmdRow(kind, label, payload, key) {
  var open = !!state.expanded[key];
  var h = '<tr class="evt row-toggle" data-expand="' + esc(key) + '">' +
    '<td class="fit caret">' + (open ? "▾" : "▸") + "</td>" +
    '<td class="fit"><span class="chip cm-' + kind + '">' + esc(label) + "</span></td>" +
    "<td>" + consentSignalChips(payload) + "</td></tr>";
  if (open) h += '<tr class="detail"><td></td><td colspan="2"><pre class="jsonview">' + JV.highlight(payload) + "</pre></td></tr>";
  return h;
}
function gcmHasImplicit(gcm) {
  for (var k in gcm) if (Object.prototype.hasOwnProperty.call(gcm, k) && gcm[k] && gcm[k].implicit !== null && typeof gcm[k].implicit !== "undefined") return true;
  return false;
}
// Reconstruct a consent "step" from the ics field (declare/default/update/implicit)
// across all categories — the source of truth for GTM-template CMPs that never push
// gtag() commands to the dataLayer.
function icsStepChips(gcm, field) {
  var chips = [];
  GCM_ORDER.forEach(function (cat) {
    if (gcm[cat] && gcm[cat][field] !== null && typeof gcm[cat][field] !== "undefined") chips.push(catChip(cat, gcm[cat][field]));
  });
  return chips.length ? chips.join(" ") : "";
}
function icsPayload(gcm, field) {
  var o = {};
  GCM_ORDER.forEach(function (cat) {
    if (gcm[cat] && gcm[cat][field] !== null && typeof gcm[cat][field] !== "undefined") o[cat] = gcm[cat][field] ? "granted" : "denied";
  });
  return o;
}
// Fold the command sequence into a final per-category state (last write wins) as a
// fallback when google_tag_data.ics isn't available.
function foldConsent(cmds) {
  var st = {};
  cmds.forEach(function (c) {
    var p = c.payload || {};
    GCM_ORDER.forEach(function (cat) { if (typeof p[cat] !== "undefined") st[cat] = payloadTri(p, cat); });
  });
  return st;
}
function renderConsentMode(s) {
  var gcm = s.gcm, cmds = s.consentCommands || [];
  var html = '<div class="card"><h2>Google Consent Mode — Ablauf</h2>';
  if ((!gcm || isEmpty(gcm)) && !cmds.length) {
    return html + '<div class="muted">Kein <code>google_tag_data.ics</code> und keine <code>gtag(\'consent\',…)</code>-Commands im dataLayer — GTM/Consent Mode (noch) nicht aktiv.</div></div>';
  }
  var declares = [], defaults = [], updates = [];
  cmds.forEach(function (c, i) {
    var rec = { c: c, i: i };
    if (c.type === "declare") declares.push(rec);
    else if (c.type === "default") defaults.push(rec);
    else if (c.type === "update") updates.push(rec);
  });

  var haveCommands = declares.length || defaults.length || updates.length;
  html += '<table class="compact cm-steps"><thead><tr><th class="caret-h"></th><th class="fit">Schritt</th><th>gesendete Signale <span class="muted" style="text-transform:none;font-weight:400">(Zeile anklicken für das volle Objekt)</span></th></tr></thead><tbody>';
  if (haveCommands) {
    // Preferred: real gtag('consent',…) commands from the dataLayer (ordered, full payload).
    if (declares.length) {
      declares.forEach(function (r, i) { html += cmdRow("declare", "declare" + (declares.length > 1 ? " #" + (i + 1) : ""), r.c.payload, "cc|" + r.i); });
    } else if (gcm && gcmHasImplicit(gcm)) {
      html += stepRow("implicit", "implizit (Google-Default)", icsStepChips(gcm, "implicit") || '<span class="muted">—</span>');
    }
    defaults.forEach(function (r, i) { html += cmdRow("default", "default" + (defaults.length > 1 ? " #" + (i + 1) : ""), r.c.payload, "cc|" + r.i); });
    updates.forEach(function (r, i) { html += cmdRow("update", "update" + (updates.length > 1 ? " #" + (i + 1) : ""), r.c.payload, "cc|" + r.i); });
  } else if (gcm && !isEmpty(gcm)) {
    // GTM-template CMPs set consent via the sandboxed GTM Consent API (setDefault/
    // updateConsentState) — NOT gtag() in the dataLayer — so there are no commands, only
    // google_tag_data.ics. Reconstruct the declare/implicit/default/update steps from it.
    var steps = [
      { field: "declare", label: "declare (aus ics)" },
      { field: "implicit", label: "implizit (Google-Default)" },
      { field: "default", label: "default (aus ics)" },
      { field: "update", label: "update (aus ics)" }
    ];
    var any = false;
    steps.forEach(function (st) {
      var chips = icsStepChips(gcm, st.field);
      if (!chips) return;
      any = true;
      html += cmdRow(st.field, st.label, icsPayload(gcm, st.field), "cci|" + st.field);
    });
    if (!any) html += '<tr><td></td><td colspan="2" class="muted">google_tag_data.ics vorhanden, aber ohne default/update/implicit-Werte.</td></tr>';
  } else {
    html += '<tr><td></td><td colspan="2" class="muted">keine consent-Commands im dataLayer und kein google_tag_data.ics — Consent Mode (noch) nicht aktiv.</td></tr>';
  }
  html += "</tbody></table>";

  // Final state + timestamp
  var region = "";
  if (gcm) GCM_ORDER.forEach(function (cat) { if (gcm[cat] && gcm[cat].region && !region) region = gcm[cat].region; });
  html += '<div style="margin-top:12px"><strong>Gesamtzustand</strong>' +
    (s.consentTs ? ' <span class="muted">· zuletzt geändert ' + esc(fmtTime(s.consentTs)) + "</span>" : "") +
    (region ? ' <span class="chip">Region ' + esc(region) + "</span>" : "") + "</div>";
  if (gcm && !isEmpty(gcm)) {
    // Restored per-category table (aktuell + default/update/implicit breakdown from ics).
    // F-66: `declare` column added — the reader captures it per category, but it was only
    // visible in the ics-reconstruction step rows, never in this breakdown.
    html += '<table class="compact" style="margin-top:6px"><thead><tr><th class="fit">Kategorie</th><th class="fit">aktuell</th><th class="fit">declare</th><th class="fit">default</th><th class="fit">update</th><th class="fit">implicit</th><th></th></tr></thead><tbody>';
    var seen = {};
    GCM_ORDER.concat(objKeys(gcm)).forEach(function (cat) {
      if (seen[cat] || !gcm[cat]) return;
      seen[cat] = 1;
      var en = gcm[cat];
      html += '<tr><td class="fit mono">' + esc(cat) + "</td><td class=\"fit\">" + gcmChip(gcmCurrent(en)) + "</td>" +
        '<td class="fit mono">' + gcmMini(en["declare"]) + "</td>" +
        '<td class="fit mono">' + gcmMini(en["default"]) + "</td>" +
        '<td class="fit mono">' + gcmMini(en.update) + "</td>" +
        '<td class="fit mono">' + gcmMini(en.implicit) + "</td><td></td></tr>";
    });
    html += "</tbody></table>" +
      '<div class="muted" style="margin-top:6px">Effektiver Status = <strong>update &gt; default &gt; implicit</strong>. Quelle: GTM-internes <code>google_tag_data.ics.entries</code>.</div></div>';
  } else {
    // No ics (state only from dataLayer commands) → fold + chips.
    var folded = foldConsent(cmds);
    var chips = [];
    GCM_ORDER.forEach(function (cat) { chips.push(catChip(cat, typeof folded[cat] === "undefined" ? null : folded[cat])); });
    html += '<div style="margin-top:6px">' + chips.join(" ") + "</div>" +
      '<div class="muted" style="margin-top:6px">✓ granted · ✗ denied · grau = nicht gesetzt (nur aus dataLayer-Commands gefaltet — kein <code>google_tag_data.ics</code>).</div></div>';
  }
  return html;
}
// Non-Google consent frameworks / vendor pixels present on the page + expected signal.
var VENDOR_INFO = [
  { key: "tcf", label: "IAB TCF v2.x", tcf: "—", sig: "__tcfapi / TC-String — ein String für viele GVL-Vendoren", detail: "Branchen-Framework (IAB Europe). Der Base64-TC-String transportiert 11 Purposes + pro-Vendor-Consent über die Global Vendor List. Pflichtversion v2.3 (seit 28.02.2026). EuGH C-604/22: der TC-String IST personenbezogen. Live-Werte via async __tcfapi('getTCData') — read-only nicht abfragbar; hier nur der euconsent-v2-Cookie." },
  { key: "gpp", label: "IAB GPP", tcf: "Dach", sig: "__gpp / GPP-String (US-Sektionen + tcfeuv2)", detail: "Dach-/Transport-Framework (IAB Tech Lab): bündelt mehrere Jurisdiktions-Strings über eine API. Sektionen u.a. 2=tcfeuv2 (EU), 7=usnat, 8=usca. Klammer über TCF (EU) und US-Privacy." },
  { key: "usp", label: "US-Privacy (CCPA)", tcf: "—", sig: "__uspapi — Legacy 4-Zeichen-String (z.B. 1YNN)", detail: "Alter CCPA-Opt-out-String, durch usnat/usca (GPP) abgelöst, praktisch Legacy. Format 1YNN = Version/Notice/OptOut/LSPA." },
  { key: "gpc", label: "GPC", tcf: "—", sig: "navigator.globalPrivacyControl — Browser-Opt-out", detail: "Global Privacy Control: Browser-/Header-Signal (W3C-nah, kein IAB-Framework) für „do not sell/share\" nach US-State-Laws. GPP kann einen erkannten GPC-Wert in seine US-Sektionen einbetten. Synchron lesbar." },
  { key: "meta", label: "Meta Pixel", tcf: "nein", sig: "fbq('consent','grant'/'revoke') + LDU (US)", detail: "Proprietäres Meta Consent Mode. Vor Opt-in NICHT laden (kein Cookie, kein Event). Serverseitig kein Consent-Feld, sondern Data Processing Options/LDU (US-Opt-out). Liest TCF NICHT automatisch (Negativbefund). Kein JS-Getter für granted/denied → Zustand nur über _fbp-Cookie (Pixel aktiv) ablesbar. DACH: fail-closed gaten." },
  { key: "uet", label: "Microsoft UET", tcf: "GTM-Templ.", sig: "uetq.push('consent',{ad_storage}) — an Google angelehnt", detail: "Microsoft Consent Mode (Bing/MS Ads). Nur ad_storage wird erzwungen (seit 05.05.2025 EWR/UK/CH). Zustand LESBAR: window.uetq.uetConfig.consent.adStorageAllowed (+ .enabled/.enforced/.tcf.enabled). UET-GTM-Template liest Google-CM via integrierte CMP; alternativ IAB TCF (Vendor 1126). Clarity ist getrennt: clarity('consentv2',{ad_Storage,analytics_Storage})." },
  { key: "tiktok", label: "TikTok", tcf: "nein", sig: "ttq Pixel-Consent-Mode (grant/revoke); Events-API limited_data_use (US)", detail: "Nativer Pixel-Consent-Mode (opt-in: SDK lädt erst nach Consent). ttq.enableCookie()/disableCookie(), grantConsent/revokeConsent (exakte Syntax nicht primär verifiziert). Events-API-Feld limited_data_use = US-only, kein DSGVO-Mechanismus. Kein Getter → Zustand über _ttp-Cookie." },
  { key: "linkedin", label: "LinkedIn", tcf: "nein", sig: "kein natives Signal → CMP/GTM-Gating", detail: "Insight Tag hat KEINE native JS-Consent-API → über CMP/GTM gaten (Tag erst nach Werbe-Consent). TCF-Vendor, liest den String aber nicht selbst. CAPI-Schema hat KEIN Consent-Feld → Konformität allein durch Gating. li_fat_id erst nach Consent." },
  { key: "pinterest", label: "Pinterest", tcf: "nein", sig: "kein natives JS-Signal → Gating; CAPI opt_out (US)", detail: "Pinterest Tag (pintrk) hat keinen dokumentierten JS-Consent-Schalter → Gating via CMP. Enhanced Match nur mit Marketing-Consent. CAPI-Feld opt_out (US/CCPA), st/country SHA-256-gehasht. LDP nur im App-Fall klar dokumentiert." },
  { key: "amazon", label: "Amazon Ads", tcf: "ja (Vorrang)", sig: "ACS amzn_user_data/amzn_ad_storage; liest TCF/GPP", detail: "Amazon akzeptiert TCF, GPP ODER proprietäres ACS — nur eines nötig, bei mehreren gewinnt der TC-String (TCF>ACS/GPP). Durchgesetzt seit 30.06.2026 für AAT/CAPI/Events-API (UK/EWR: Signal + ISO-Ländercode). Cookie amzn_consent (JSON) transportiert amzn_user_data/amzn_ad_storage (GRANTED/DENIED). Record-Level-Consent bei der Events API." },
  { key: "criteo", label: "Criteo OneTag", tcf: "ja (auto)", sig: "liest TCF automatisch; sonst Tag-Gating", detail: "TCF-basiert (GVL-Vendor 91, Purposes 1,2,3,4,7,9,10). OneTag liest IAB TCF v2 automatisch. KEIN manuelles In-Tag-Consent-Signal. Offizielles GTM-Template hat KEINE Built-in Consent Checks → extern gaten. DACH: nicht auf Criteos Self-Enforcement verlassen, pre-consent gar nicht laden." },
  { key: "snap", label: "Snapchat", tcf: "—", sig: "snaptr — fail-closed Gating", detail: "Snap Pixel (snaptr). Consent über CMP/GTM-Gating. Zustand über _scid-Cookie (Pixel aktiv)." },
  { key: "twitter", label: "X / Twitter", tcf: "—", sig: "twq — fail-closed Gating", detail: "X/Twitter Pixel (twq). Consent über CMP/GTM-Gating. Zustand über personalization_id-Cookie." }
];
// Synchronously-readable state per vendor (from cookies / navigator), where available.
function vendorStateCell(key, st) {
  if (!st) return "";
  if (key === "gpc") {
    if (st.gpc === null) return "";
    return st.gpc ? '<span class="chip warn">GPC aktiv (opt-out)</span>' : '<span class="chip ok">GPC aus</span>';
  }
  if (key === "tcf" && st.tcString) return '<span class="chip ok" title="' + esc(st.tcString) + '">TC-String (Cookie euconsent-v2): ' + esc(trunc(st.tcString, 18)) + "</span>";
  if (key === "usp" && st.usp) return '<span class="chip" title="usprivacy-Cookie">USP: ' + esc(st.usp) + "</span>";
  if (key === "amazon" && st.amazon) {
    var au = "";
    try { var o = JSON.parse(st.amazon); au = "amzn_user_data=" + (o.amzn_user_data || o.userData || "?") + " · amzn_ad_storage=" + (o.amzn_ad_storage || o.adStorage || "?"); }
    catch (e) { au = trunc(st.amazon, 30); }
    return '<span class="chip">' + esc(au) + "</span>";
  }
  // Microsoft UET exposes a readable consent state (uetq.uetConfig.consent).
  if (key === "uet" && st.uetConfig) {
    var a = st.uetConfig.adStorage;
    var c = a === true ? '<span class="chip ok">ad_storage granted</span>' : a === false ? '<span class="chip err">ad_storage denied</span>' : '<span class="muted">—</span>';
    if (st.uetConfig.tcf) c += ' <span class="chip">via TCF</span>';
    return c;
  }
  // Vendors with no readable consent API: a tracking cookie means the pixel fired
  // (i.e. ran post-consent) — a pragmatic activity proxy.
  if (st.cookies && st.cookies[key]) return '<span class="chip ok" title="Tracking-Cookie gesetzt → Pixel hat gefeuert (nach Consent)">aktiv (Cookie)</span>';
  return "";
}
function renderVendors(v, st) {
  v = v || {};
  var present = VENDOR_INFO.filter(function (x) { return v[x.key]; });
  var absent = VENDOR_INFO.filter(function (x) { return !v[x.key]; });
  // F-66: GPC is already a VENDOR_INFO entry and v.gpc mirrors navigator.globalPrivacyControl,
  // so an active GPC always appears in `present` — no separate showGpc shortcut needed.
  var html = '<div class="card"><h2>Andere Vendoren &amp; Frameworks (Nicht-Google)</h2>';
  if (!present.length) {
    html += '<div class="muted">Keine weiteren Consent-Frameworks/Vendor-Pixel auf der Seite erkannt.</div></div>';
    return html;
  }
  html += '<table class="compact"><thead><tr><th class="caret-h"></th><th class="fit">erkannt</th><th class="fit">Zustand</th><th class="fit">liest TCF</th><th>erwartetes Consent-Signal <span class="muted" style="text-transform:none;font-weight:400">(Zeile anklicken für Details)</span></th></tr></thead><tbody>';
  present.forEach(function (x) {
    var key = "ven|" + x.key;
    var open = !!state.expanded[key];
    html += '<tr class="evt row-toggle" data-expand="' + esc(key) + '">' +
      '<td class="caret">' + (open ? "▾" : "▸") + "</td>" +
      '<td class="fit"><span class="chip acc">' + esc(x.label) + "</span></td>" +
      '<td class="fit">' + (vendorStateCell(x.key, st) || '<span class="muted">—</span>') + "</td>" +
      '<td class="fit mono muted">' + esc(x.tcf) + "</td>" +
      '<td class="muted">' + esc(x.sig) + "</td></tr>";
    if (open) html += '<tr class="detail"><td></td><td colspan="4" class="muted">' + esc(x.detail) + "</td></tr>";
  });
  html += "</tbody></table>";
  html += '<div class="muted" style="margin-top:6px">Erkennung = Presence des JS-Globals; „Zustand" nur soweit <strong>synchron lesbar</strong>: TCF/USP/Amazon-Cookie, GPC-Flag, oder <em>aktiv (Cookie)</em> = das Tracking-Cookie des Pixels ist gesetzt → es hat gefeuert (also nach Consent). Der Live-TCF/GPP-String läuft über async APIs, die ein read-only-Reader nicht abfragen darf. Nicht erkannt: ' +
    (absent.length ? absent.map(function (x) { return esc(x.label); }).join(", ") : "—") + "</div></div>";
  return html;
}
function objKeys(o) {
  var a = []; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) a.push(k); return a;
}
function chip(v) {
  if (v === true || v === "true") return '<span class="chip ok">true</span>';
  if (v === false || v === "false") return '<span class="chip err">false</span>';
  return '<span class="muted">—</span>';
}
function cmpCell(s) {
  if (s.cmp) return '<span class="chip acc">' + esc(s.cmp) + "</span>";
  if (s.hasConsentCheck) {
    return '<span class="chip acc">inline consent_check</span> ' +
      '<span class="muted">(kein aGTM.c.cmp — z. B. vom sGTM-Client / manuell injiziert; ist normal)</span>';
  }
  return '<span class="chip err">— kein consent_check</span>';
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
  // Consent present / GTM injected → the queue is no longer "waiting", its entries
  // were already replayed as hastyEvents. aGTM.d.f is not cleared after inject(), so
  // relabel it as history instead of leaving the misleading "wartet auf Consent".
  var gtmOn = truthy((s.consent || {}).gtmConsent) || !!s.init;
  var html = "";

  // Queue — aGTM.d.f
  var qTrunc = queue.length < s.queueLen ? ' — Tabelle zeigt die letzten ' + queue.length : '';
  if (gtmOn) {
    html += '<div class="card"><h2>Queue — aGTM.d.f · ' + s.queueLen + ' (bereits verarbeitet)' + qTrunc + '</h2>';
    html += '<div class="muted" style="margin-bottom:8px">Consent liegt vor / GTM ist injiziert — diese Events wurden als <code>hastyEvents</code> an GTM repliziert. <code>aGTM.d.f</code> wird nach der Injection <strong>nicht</strong> geleert und dient hier als Verlauf der vor Consent gepufferten Events.</div>';
  } else {
    html += '<div class="card"><h2>Queue — aGTM.d.f (wartet auf Consent) · ' + s.queueLen + qTrunc + '</h2>';
  }
  if (isEmpty(queue)) {
    html += '<div class="muted">leer — keine zurückgehaltenen Events.</div>';
  } else {
    html += eventTable(queue, "q");
  }
  html += "</div>";

  // Dispatched events (aGTM.d.dl)
  html += '<div class="card"><h2>Event-Log — aGTM.d.dl (letzte ' + dl.length + ') · <span class="muted" style="text-transform:none;font-weight:400">Zeile anklicken für das ganze Objekt</span></h2>';
  if (isEmpty(dl)) {
    html += '<div class="muted">noch keine Events durch aGTM.f.fire() gelaufen.</div>';
  } else {
    html += eventTable(dl.slice().reverse(), "d", true);
  }
  html += "</div>";

  // Decoded internal log (aGTM.l) — aggregated by id+event so the ~2s consent poll
  // (m2/m3 re-logged every tick, alternating) collapses into a few counted rows
  // instead of flooding. Each group keeps the latest object for the expand view.
  html += '<div class="card"><h2>Internes Log — aGTM.l (gebündelt · ' + log.length + ' Einträge)</h2>';
  if (isEmpty(log)) {
    html += '<div class="muted">kein Log — ist aGTM_debug.js geladen bzw. Logging aktiv?</div>';
  } else {
    var groups = {}, order = [];
    log.forEach(function (e) {
      var evn = (e.obj && typeof e.obj === "object" && !e.obj.__unserializable && e.obj.event) ? e.obj.event : "";
      var gkey = e.id + "|" + evn;
      if (!groups[gkey]) { groups[gkey] = { id: e.id, event: evn, count: 0, last: 0, obj: null, hasObj: false }; order.push(gkey); }
      var g = groups[gkey];
      g.count++;
      // F-61: hasObj must track the obj we actually SHOW (the latest by timestamp), not
      // "any entry in the group had one". Otherwise the newest entry's obj:null still gets
      // a caret that expands to a bare "null" because an older sibling carried an object.
      if ((e.timestamp || 0) >= g.last) {
        g.last = e.timestamp || 0; g.obj = e.obj;
        g.hasObj = e.obj !== null && typeof e.obj !== "undefined";
      }
    });
    var groupArr = order.map(function (k) { return groups[k]; }).sort(function (a, b) { return b.last - a.last; });
    html += '<table class="compact"><thead><tr><th class="caret-h"></th><th class="fit">Zeit</th><th class="fit">Event</th><th>Meldung</th><th class="fit">ID</th><th class="fit">×</th></tr></thead><tbody>';
    groupArr.forEach(function (g) {
      var m = LOGMAP[g.id] || {};
      var cls = m.type === "err" ? "err" : (m.type === "msg" ? "acc" : "ok");
      var key = "l|" + g.id + "|" + g.event;
      var open = g.hasObj && !!state.expanded[key];
      html += '<tr class="evt' + (g.hasObj ? ' row-toggle' : '') + '"' + (g.hasObj ? ' data-expand="' + esc(key) + '"' : '') + ">" +
        '<td class="caret">' + (g.hasObj ? (open ? "▾" : "▸") : "") + "</td>" +
        '<td class="fit mono">' + esc(fmtTime(g.last)) + "</td>" +
        '<td class="fit mono">' + (g.event ? esc(g.event) : '<span class="muted">—</span>') + "</td>" +
        '<td>' + esc(m.msg || "(unbekannte ID)") + "</td>" +
        '<td class="fit"><span class="chip ' + cls + '" title="' + esc(m.type || "?") + '">' + esc(g.id) + "</span></td>" +
        '<td class="fit mono">' + (g.count > 1 ? '<span class="chip">' + g.count + "</span>" : "") + "</td></tr>";
      if (open) {
        var body = (g.obj && g.obj.__unserializable)
          ? '<span class="muted">(nicht serialisierbar — Zyklus / DOM-Node — im Log-Aufruf mitgegeben)</span>'
          : '<pre class="jsonview">' + JV.highlight(g.obj) + "</pre>";
        html += '<tr class="detail"><td></td><td colspan="5">' + body + "</td></tr>";
      }
    });
    html += "</tbody></table>";
  }
  html += "</div>";

  paint("tab-events", html);
}
// Keys that are noise in an inline preview (the event name is shown separately; the
// rest are aGTM internals / transport flags).
var PREVIEW_SKIP = {
  event: 1, aGTMts: 1, aGTMrepeated: 1, _noConsent: 1, _noDLPush: 1, _post: 1, _post_sent: 1,
  "gtm.uniqueEventId": 1, "gtm.start": 1
};
// Smart one-line preview of an event object's notable top-level fields — fills the
// space to the right of the event name; the row truncates it with an ellipsis.
function previewObj(ev) {
  var parts = [];
  for (var k in ev) {
    if (!Object.prototype.hasOwnProperty.call(ev, k) || PREVIEW_SKIP[k]) continue;
    var v = ev[k], vs;
    if (v === null) vs = "null";
    else if (typeof v === "object") vs = Array.isArray(v) ? "[" + v.length + "]" : "{…}";
    else vs = String(v);
    if (vs.length > 28) vs = vs.slice(0, 28) + "…";
    parts.push('<span class="pk">' + esc(k) + "</span>:" + esc(vs));
    if (parts.length >= 8) break;
  }
  return parts.length ? ' <span class="preview">' + parts.join("  ") + "</span>" : "";
}
function eventNameCell(ev) {
  // No event field → this is an aGTM internal / message-type push, not a user event.
  var name = ev.event ? '<span class="mono">' + esc(ev.event) + "</span>" : '<span class="tag-msg">Message</span>';
  return name + previewObj(ev);
}
function eventTable(list, prefix, reversed) {
  var h = '<table class="compact"><thead><tr><th class="caret-h"></th><th class="fit">Flags</th><th class="fit">Zeit</th><th>event</th></tr></thead><tbody>';
  list.forEach(function (ev, i) {
    ev = ev || {};
    // F-64 + Kritiker Runde 2: disambiguate identical (ts,event) rows by ordinal, but use a
    // NATURAL-ORDER ordinal — for the dl table the list is passed reversed, so the display
    // index shifts on every new event and would collapse open rows. length-1-i maps the
    // reversed index back to the append-stable natural position (like renderDataLayer/F-57).
    var ord = reversed ? (list.length - 1 - i) : i;
    var key = prefix + "|" + ord + "|" + (ev.aGTMts || "0") + "|" + (ev.event || "");
    var open = !!state.expanded[key];
    h += '<tr class="evt row-toggle" data-expand="' + esc(key) + '">' +
      '<td class="caret">' + (open ? "▾" : "▸") + "</td>" +
      '<td class="fit">' + (eventFlags(ev) || '<span class="muted">—</span>') + "</td>" +
      '<td class="fit mono">' + esc(ev.aGTMts ? fmtTime(ev.aGTMts) : "") + "</td>" +
      '<td class="col-grow">' + eventNameCell(ev) + "</td>" +
      "</tr>";
    if (open) {
      h += '<tr class="detail"><td></td><td colspan="3"><pre class="jsonview">' + JV.highlight(ev) + "</pre></td></tr>";
    }
  });
  h += "</tbody></table>";
  return h;
}

/* ---------- GTM ---------- */
function renderGTM() {
  var s = state.snap;
  var containers = s.containers || [];
  var loaded = s.gtmLoaded || [];
  var scripts = s.gtmScripts || [];
  var dllen = (typeof s.dataLayerLen === "number") ? s.dataLayerLen : null;

  // Distinct load hosts across the actually-injected <script> tags → tells a
  // default google load from a custom / server-side (sGTM) domain at a glance.
  var hosts = {};
  scripts.forEach(function (t) { if (t.host) hosts[t.host] = true; });
  var hostList = Object.keys(hosts);
  var loadMode;
  if (!scripts.length) loadMode = '<span class="muted">—</span>';
  else if (hostList.length) {
    var google = hostList.filter(function (h) { return /(^|\.)googletagmanager\.com$/.test(h); }).length;
    var tag = (google === hostList.length)
      ? '<span class="chip">Google</span>'
      : '<span class="chip acc">custom / sGTM</span>';
    loadMode = tag + " " + hostList.map(function (h) { return '<span class="mono">' + esc(h) + "</span>"; }).join(", ");
  } else loadMode = '<span class="chip warn">inline (base64)</span>';

  var html = '<div class="card"><h2>Injection-Status</h2><div class="grid">' +
    '<div class="k">aGTM.d.init</div><div class="v">' + chip(s.init) + "</div>" +
    '<div class="k">dataLayer-Variable</div><div class="v mono">' + esc(s.gdl || "—") + "</div>" +
    '<div class="k">dataLayer-Einträge (live)</div><div class="v mono">' + (dllen === null ? '<span class="muted">—</span>' : esc(dllen)) + "</div>" +
    '<div class="k">aktive gtmID</div><div class="v mono">' + esc(s.gtmID || "—") + "</div>" +
    '<div class="k">geladen (aGTM.d.gtmLoaded)</div><div class="v mono">' + esc(loaded.join(", ") || "—") + "</div>" +
    '<div class="k">Script-Tags im DOM</div><div class="v">' + (scripts.length ? '<span class="chip ok">' + esc(scripts.length) + "</span>" : '<span class="chip">0</span>') + "</div>" +
    '<div class="k">Lade-Domain</div><div class="v">' + loadMode + "</div>" +
    "</div></div>";

  html += '<div class="card"><h2>Container — aGTM.c.gtm</h2>';
  if (isEmpty(containers)) {
    html += '<div class="muted">keine Container konfiguriert.</div>';
  } else {
    html += '<table><thead><tr><th>Container-ID</th><th>Lade-Art</th><th>noConsent</th><th>geladen</th></tr></thead><tbody>';
    containers.forEach(function (c) {
      var loadCell = c.inline
        ? '<span class="chip warn">inline base64</span>'
        : (c.url ? '<span class="chip acc">custom</span> <span class="mono" style="word-break:break-all">' + esc(c.url) + "</span>" : '<span class="muted">Google</span>');
      if (c.env) loadCell += ' <span class="chip">env: ' + esc(c.env) + "</span>";
      html += "<tr>" +
        '<td class="mono">' + esc(c.id) + "</td>" +
        "<td>" + loadCell + "</td>" +
        "<td>" + (c.noConsent ? '<span class="chip warn">noConsent</span>' : '<span class="muted">consent-gated</span>') + "</td>" +
        "<td>" + (c.hasLoaded ? '<span class="chip ok">ja</span>' : '<span class="chip">nein</span>') + "</td>" +
        "</tr>";
    });
    html += "</tbody></table>" +
      '<div class="muted" style="margin-top:8px">noConsent-Container werden via initGTM(true) <em>vor</em> der Consent-Entscheidung geladen.</div>';
  }
  html += "</div>";

  // Actual injected <script> tags — DOM-level proof of what really loaded.
  if (scripts.length) {
    html += '<div class="card"><h2>Injizierte Script-Tags (DOM)</h2>' +
      '<table><thead><tr><th>Tag-ID</th><th>Host</th></tr></thead><tbody>';
    scripts.forEach(function (t) {
      html += "<tr>" +
        '<td class="mono">' + esc(t.id) + "</td>" +
        '<td class="mono">' + (t.inline ? '<span class="chip warn">inline</span>' : esc(t.host || "—")) + "</td>" +
        "</tr>";
    });
    html += "</tbody></table></div>";
  }
  paint("tab-gtm", html);
}

/* ---------- dataLayer ---------- */
// GA4 ecommerce event names (category coloring).
var ECOM_EVENTS = {
  view_item: 1, view_item_list: 1, select_item: 1, add_to_cart: 1, remove_from_cart: 1,
  view_cart: 1, begin_checkout: 1, add_shipping_info: 1, add_payment_info: 1, purchase: 1,
  refund: 1, add_to_wishlist: 1, view_promotion: 1, select_promotion: 1, generate_lead: 1
};
// Classify a dataLayer push into a coloured category.
function dlEventClass(ev) {
  var e = ev && ev.event;
  if (!e || typeof e !== "string") {
    var cmd = ev && ev["0"];
    if (cmd === "consent") return { label: "⚑ consent " + (ev["1"] || ""), cls: "ev-consent-cmd" };
    if (cmd === "config" || cmd === "set" || cmd === "event" || cmd === "get" || cmd === "js")
      return { label: "gtag " + String(ev["0"]), cls: "ev-gtag" };
    // F-62: an event-less GA4 ecommerce datablock ({ecommerce:{items:[…]}}, pushed before
    // the trigger event) is still commerce data, not a plain "Message".
    if (ev && ev.ecommerce) return { label: "E-Commerce", cls: "ev-ecom" };
    return { label: "Message", cls: "ev-msg" };
  }
  if (e === "gtm.init_consent") return { label: "⚑ consent init (default)", cls: "ev-consent-cmd" };
  if (/^gtm\./.test(e)) return { label: "GTM", cls: "ev-gtm" };
  if (/^aGTM/.test(e) || e === "aPageview" || e === "vPageview") return { label: "aGTM", cls: "ev-agtm" };
  if (ECOM_EVENTS[e] || ev.ecommerce) return { label: "E-Commerce", cls: "ev-ecom" };
  if (/^(page_view|pageview|virtual_pageview|screen_view)$/i.test(e)) return { label: "Pageview", cls: "ev-pv" };
  if (/consent/i.test(e)) return { label: "Consent", cls: "ev-consent" };
  return { label: "Event", cls: "ev-user" };
}
function dlBadges(ev) {
  var b = [], evt = ev && ev.event;
  if (typeof ev.aGTMts !== "undefined") b.push('<span class="chip acc" title="trägt aGTMts → über aGTM.f.fire() gelaufen">via aGTM</span>');
  if (truthy(ev.aGTMrepeated)) b.push('<span class="chip warn" title="vom aGTM DL-Repeat-Tag erneut gepusht">repeated</span>');
  if (truthy(ev._noConsent)) b.push('<span class="chip acc">_noConsent</span>');
  if (truthy(ev._post)) b.push('<span class="chip acc">_post</span>');
  if (typeof evt === "string" && /^gtm\./.test(evt)) b.push('<span class="chip">GTM intern</span>');
  else if (typeof evt === "string" && /^aGTM/.test(evt)) b.push('<span class="chip">aGTM intern</span>');
  return b.join(" ");
}
function renderDataLayer() {
  var s = state.snap;
  var dl = s.dataLayerSample || [];
  var total = (typeof s.dataLayerLen === "number") ? s.dataLayerLen : "?";
  var html = '<div class="card"><h2>window.' + esc(s.gdl || "dataLayer") + ' — Live-Inhalt (letzte ' + dl.length + " von " + total + ")</h2>" +
    '<div class="muted" style="margin-bottom:8px">Der echte GTM-dataLayer. Badges zeigen den aGTM-Bezug: <span class="chip acc">via aGTM</span> = über <code>aGTM.f.fire()</code> (trägt <code>aGTMts</code>), <span class="chip warn">repeated</span> = vom DL-Repeat-Tag; GTM-/aGTM-interne Events sind markiert. Zeile anklicken für das ganze Objekt.</div>';
  if (isEmpty(dl)) {
    html += '<div class="muted">dataLayer leer oder nicht gefunden.</div>';
  } else {
    html += '<table class="compact"><thead><tr><th class="caret-h"></th><th class="fit">#</th><th class="fit">(a)GTM</th><th>event</th></tr></thead><tbody>';
    // gtag('consent',…) commands usually sit at the very top of the dataLayer, often
    // before the visible tail window — surface them as markers so they're never hidden.
    var base = s.dataLayerBase || 0;
    (s.consentCommands || []).forEach(function (c) {
      if (typeof c.index !== "number" || c.index >= base) return; // in-window ones render inline below
      var key = "gdlc|" + c.index;
      var open = !!state.expanded[key];
      html += '<tr class="evt row-toggle dl-consent" data-expand="' + esc(key) + '">' +
        '<td class="caret">' + (open ? "▾" : "▸") + "</td>" +
        '<td class="fit mono muted">#' + c.index + "</td>" +
        '<td class="fit"><span class="ev-tag ev-consent-cmd">⚑ vor Ausschnitt</span></td>' +
        '<td class="col-grow"><span class="ev-tag ev-consent-cmd">⚑ consent ' + esc(c.type) + "</span> " + payloadFingerprint(c.payload) + " " + previewObj(c.payload || {}) + "</td></tr>";
      if (open) html += '<tr class="detail"><td></td><td colspan="3"><pre class="jsonview">' + JV.highlight(c.payload) + "</pre></td></tr>";
    });
    dl.slice().reverse().forEach(function (ev, ri) {
      ev = ev || {};
      // F-57: absolute dataLayer index (window-base + in-window offset) — so the shown #
      // matches the out-of-window consent markers above AND the expand key stays stable
      // when the 150-entry tail window slides (a new push must not renumber open rows).
      var idx = base + (dl.length - 1 - ri);
      var key = "gdl|" + idx + "|" + (ev.event || "");
      var open = !!state.expanded[key];
      var cat = dlEventClass(ev);
      var catTag = '<span class="ev-tag ' + cat.cls + '">' + esc(cat.label) + "</span> ";
      var nameHtml = ev.event ? '<span class="mono ' + cat.cls + '">' + esc(ev.event) + "</span>"
        : (cat.cls === "ev-msg" ? '<span class="tag-msg">Message</span>' : "");
      // Inline consent fingerprint for a gtag('consent',…) command push (payload at ev["2"]).
      var cfp = (ev && ev["0"] === "consent") ? payloadFingerprint(ev["2"]) : "";
      var evName = catTag + nameHtml + (cfp ? " " + cfp : "") + previewObj(ev);
      html += '<tr class="evt row-toggle' + (cat.cls === "ev-consent-cmd" ? " dl-consent" : "") + '" data-expand="' + esc(key) + '">' +
        '<td class="caret">' + (open ? "▾" : "▸") + "</td>" +
        '<td class="fit mono muted">' + idx + "</td>" +
        '<td class="fit">' + (dlBadges(ev) || '<span class="muted">—</span>') + "</td>" +
        '<td class="col-grow">' + evName + "</td></tr>";
      if (open) html += '<tr class="detail"><td></td><td colspan="3"><pre class="jsonview">' + JV.highlight(ev) + "</pre></td></tr>";
    });
    html += "</tbody></table>";
  }
  html += "</div>";
  paint("tab-datalayer", html);
}

/* ---------- Session / Attribution ---------- */
function renderSession() {
  var s = state.snap, se = s.session || {};
  var raw = se.raw || {};
  // F-63: a preset that carries ONLY consent or attribution (no sid/uid/source, keyCount 1)
  // is a valid session per the v1.5 redesign — don't suppress its preview as "empty".
  var hasPreset = !!(raw.consent || raw.attribution) || (s.session_status && s.session_status !== "");
  var sessionEmpty = isEmpty(raw) || (!hasPreset && !se.sid && !se.uid && !se.source && keyCount(raw) <= 1);

  // Colourful summary of the most useful identifiers.
  var html = '<div class="card"><h2>Session — aGTM.d.session</h2>';
  html += '<div class="grid">' +
    '<div class="k">source</div><div class="v">' + (se.source ? '<span class="chip acc">' + esc(se.source) + "</span>" : '<span class="muted">—</span>') + "</div>" +
    '<div class="k">sid</div><div class="v mono">' + (se.sid ? esc(se.sid) : '<span class="muted">—</span>') + "</div>" +
    '<div class="k">uid</div><div class="v mono">' + (se.uid ? esc(se.uid) : '<span class="muted">—</span>') + "</div>" +
    "</div>";
  if (!sessionEmpty) {
    html += '<pre class="jsonview" style="margin-top:10px">' + JV.highlight(raw) + "</pre>";
  } else {
    html += '<div class="muted" style="margin-top:8px">Keine (nennenswerten) aGTM-Session-Daten.</div>';
  }
  html += "</div>";

  // Fallback / cross-check: external site session object (e.g. window.se_data on victors.de).
  if (!isEmpty(s.seData)) {
    html += '<div class="card"><h2>Externe Session — window.se_data</h2>' +
      '<div class="muted" style="margin-bottom:8px">' +
      (sessionEmpty ? "aGTM.d.session ist leer — dieses seitenspezifische Objekt wurde als Fallback gefunden." : "Zusätzlich auf der Seite gefunden (Quer-Check).") +
      "</div>" +
      '<pre class="jsonview">' + JV.highlight(s.seData) + "</pre></div>";
  }

  var attr = s.attribution || {};
  html += '<div class="card"><h2>Attribution — aGTM.d.attribution</h2>';
  if (isEmpty(attr)) {
    html += '<div class="muted">keine Attribution-Daten (kein Preset / keine Sources-API-Antwort).</div>';
  } else {
    html += '<table class="compact"><thead><tr><th>Methode</th><th>Felder</th></tr></thead><tbody>';
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

  paint("tab-session", html);
}
function keyCount(o) {
  var n = 0; if (o && typeof o === "object") for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n++;
  return n;
}

/* ---------- Config ---------- */
var CONFIG_TRAPS = [
  { key: "cmp", test: function (c, s) { return (typeof c.cmp === "undefined" || c.cmp === "") && !s.hasConsentCheck; },
    msg: "Weder aGTM.c.cmp gesetzt noch ein aGTM.f.consent_check vorhanden — ohne beides wird Consent nie erkannt (außer cmp:'none' erzwingt Laden)." },
  { key: "gtm", test: function (c) { return isEmpty(c.gtm); },
    msg: "Keine GTM-Container in aGTM.c.gtm — es wird nichts injiziert." },
  { key: "gdl", test: function (c) { return !c.gdl; },
    msg: "Keine dataLayer-Variable (gdl) gesetzt." },
  { key: "consent_poll_ms", test: function (c) { return c.consent_store_url && (c.consent_poll_ms === 0); },
    msg: "consent_store_url gesetzt, aber consent_poll_ms=0 — CMP-State-Änderungen via direktem dataLayer.push werden nicht nachgepollt." },
  { key: "consent_store_enc", test: function (c) { return truthy(c.consent_store_enc); },
    msg: "consent_store_enc=true — der Server-Endpoint muss die XOR/Caesar-Payload entschlüsseln können (aktuell nicht implementiert, /aGTMconsent → 501)." }
];
// Active config traps as plain {key,msg} data — shared by the Config tab and the
// Diagnose health-score / compliance report.
function activeConfigTraps(c, s) {
  return CONFIG_TRAPS.filter(function (t) { try { return t.test(c, s); } catch (e) { return false; } })
    .map(function (t) { return { key: t.key, msg: t.msg }; });
}
function jstr(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }
// Top-level key diff of the config against the first snapshot seen this session —
// surfaces what aGTM changed/added at runtime ("verändert / tatsächlich verwendet").
function configDiff(base, cur) {
  var out = [], k;
  for (k in cur) {
    if (!Object.prototype.hasOwnProperty.call(cur, k)) continue;
    var nb = !Object.prototype.hasOwnProperty.call(base, k);
    if (nb) out.push({ key: k, kind: "added", to: cur[k] });
    else if (jstr(base[k]) !== jstr(cur[k])) out.push({ key: k, kind: "changed", from: base[k], to: cur[k] });
  }
  for (k in base) {
    if (Object.prototype.hasOwnProperty.call(base, k) && !Object.prototype.hasOwnProperty.call(cur, k))
      out.push({ key: k, kind: "removed", from: base[k] });
  }
  return out;
}
function shortVal(v) {
  var s = jstr(v); if (typeof s !== "string") s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}
function renderConfig() {
  var s = state.snap, c = s.config || {};
  if (!state.configBaseline && !isEmpty(c)) state.configBaseline = jstr(c);
  var traps = activeConfigTraps(c, s);
  var html = "";
  if (traps.length) {
    html += '<div class="card warnbox"><h2>Mögliche Konfig-Fallen</h2><ul style="margin:4px 0 0;padding-left:18px">';
    traps.forEach(function (t) { html += "<li><code>" + esc(t.key) + "</code> — " + esc(t.msg) + "</li>"; });
    html += "</ul></div>";
  } else {
    html += '<div class="card"><span class="chip ok">keine bekannten Konfig-Fallen erkannt</span></div>';
  }

  // Runtime changes since first seen: what aGTM derived / mutated after config().
  var base = {};
  try { base = JSON.parse(state.configBaseline || "{}"); } catch (e) { base = {}; }
  var diff = configDiff(base, c);
  html += '<div class="card"><h2>Laufzeit-Änderungen der Config</h2>' +
    '<div class="muted" style="margin-bottom:8px">Vergleich: <strong>erster Snapshot</strong> (was gesetzt/geladen war) → <strong>aktuell</strong> (was jetzt tatsächlich verwendet wird). Zeigt Felder, die aGTM zur Laufzeit ableitet oder ändert (z. B. <code>consent_store_url</code>, Container-<code>hasLoaded</code>).</div>';
  if (!diff.length) {
    html += '<span class="chip ok">unverändert seit erstem Snapshot</span>';
  } else {
    html += '<table class="compact"><thead><tr><th class="fit">Feld</th><th class="fit">Art</th><th>vorher</th><th>jetzt</th></tr></thead><tbody>';
    diff.forEach(function (d) {
      var kindChip = d.kind === "added" ? '<span class="chip ok">neu</span>'
        : d.kind === "removed" ? '<span class="chip err">entfernt</span>'
          : '<span class="chip warn">geändert</span>';
      html += '<tr><td class="fit mono">' + esc(d.key) + "</td><td class=\"fit\">" + kindChip + "</td>" +
        '<td class="mono muted">' + (d.kind === "added" ? "—" : esc(shortVal(d.from))) + "</td>" +
        '<td class="mono">' + (d.kind === "removed" ? "—" : esc(shortVal(d.to))) + "</td></tr>";
    });
    html += "</tbody></table>";
  }
  html += "</div>";

  html += '<div class="card"><h2>aGTM.c — effektiv verwendete Konfiguration</h2>' +
    '<div class="muted" style="margin-bottom:8px">Der Stand <em>nach</em> <code>aGTM.f.config()</code> — Integrator-Werte gemergt über die Defaults, plus evtl. sGTM-Client-Injektion &amp; browserseitig abgeleitete Felder (z. B. <code>consent_store_url</code> aus <code>document.currentScript.src</code>). Das ist die Config, die tatsächlich läuft.</div>' +
    '<pre class="jsonview">' + JV.highlight(c) + "</pre></div>";
  paint("tab-config", html);
}

/* ---------- Network ---------- */
// Classification logic lives in netclassify.js (loaded before this file, and
// unit-tested in test/devtools/netclassify.test.js).
var NET = window.aGTMInspectorNet;
var SIG = window.aGTMInspectorSignals || { decodeSignals: function () { return null; } };
var DIAG = window.aGTMInspectorDiag || {
  healthChecks: function () { return []; }, overallLevel: function () { return { level: "pass", counts: {} }; },
  buildTimeline: function () { return { ok: false, rows: [] }; },
  buildReportMarkdown: function () { return ""; }, buildReportJSON: function () { return "{}"; },
  STATUS_ICON: {}
};
var netSeq = 0;

// Decide whether a captured request is a pre-consent leak: a tracking hit stamped
// preConsent at capture time, reconciled against the CURRENT consent timestamp (a
// tracker that fired at/after the grant moment is legit, see Kritiker Runde 2, P2).
// Returns the trackingHit ({vendor}) or null. Shared by renderNetwork + computeNetLeaks.
function leakHitFor(e, cls, consentGranted, consentTs) {
  if (!(e.preConsent && NET.trackingHit)) return null;
  var reconciledLegit = consentGranted && consentTs && e.ts >= consentTs;
  if (reconciledLegit) return null;
  return NET.trackingHit(e.url, cls);
}
// All current pre-consent leaks as plain data — for the Diagnose health-score + report.
function computeNetLeaks() {
  var s = state.snap || {};
  var scope = NET.sgtmScope(state.net, s.config), pageHost = s.pageHost || "";
  var consentGranted = !!(s.consent && truthy(s.consent.gtmConsent));
  var consentTs = s.consentTs || 0;
  var out = [];
  state.net.forEach(function (e) {
    var hit = leakHitFor(e, NET.classify(e.url, scope, pageHost), consentGranted, consentTs);
    if (hit) out.push({ vendor: hit.vendor, url: e.url, ts: e.ts, host: e.host });
  });
  return out;
}
// Notable query params to surface as chips in the URL cell — GTM/GA4/consent signals.
var URL_KEYPARAMS = ["id", "tid", "en", "ep.event", "gcs", "gcd", "dma", "dma_cps", "npa", "v", "cid", "gtm"];
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + "…" : s; }
// GA4/sGTM collect POST bodies are often gzip-compressed (magic 0x1f 0x8b) or binary,
// so rendering them as text gives mojibake. Detect that and show a clean note instead.
function looksBinary(s) {
  if (!s) return false;
  if (s.charCodeAt(0) === 0x1f && s.charCodeAt(1) === 0x8b) return true; // gzip
  var ctrl = 0, n = Math.min(s.length, 300);
  for (var i = 0; i < n; i++) {
    var c = s.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32) || c === 0xFFFD) ctrl++;
  }
  return n > 0 && ctrl / n > 0.1;
}
// Smart URL: dimmed host, emphasised path, and the meaningful query params as chips.
function urlPretty(url) {
  try {
    var u = new URL(url);
    var out = '<span class="u-host">' + esc(u.host) + "</span>" + '<span class="u-path">' + esc(u.pathname) + "</span>";
    var qs = u.searchParams, total = 0;
    qs.forEach(function () { total++; });
    var chips = "", shown = 0;
    URL_KEYPARAMS.forEach(function (p) {
      if (qs.has(p)) {
        chips += ' <span class="chip qp"><span class="muted">' + esc(p) + "=</span>" + esc(trunc(qs.get(p), 24)) + "</span>";
        shown++;
      }
    });
    var rest = total - shown;
    if (rest > 0) chips += ' <span class="muted">+' + rest + " Param</span>";
    return out + (chips ? '<div class="u-params">' + chips + "</div>" : "");
  } catch (e) {
    return '<span class="mono" style="word-break:break-all">' + esc(url) + "</span>";
  }
}
// Full decoded query string — the fallback "payload" view when the request has no
// readable body (e.g. a gzip/binary POST): the GET data is at least visible.
function allParamsPreview(url) {
  try {
    var qs = (new URL(url)).searchParams, parts = [];
    qs.forEach(function (v, k) { parts.push('<span class="pk">' + esc(k) + "</span>:" + esc(trunc(v, 20))); });
    if (!parts.length) return "";
    return '<span class="preview">' + parts.slice(0, 24).join("  ") + (parts.length > 24 ? "  …" : "") + "</span>";
  } catch (e) { return ""; }
}
// Convert a HAR [{name,value}] header list into a plain {name:value} map for display.
function headerMap(list) {
  var m = {};
  if (list && list.length) for (var i = 0; i < list.length; i++) {
    var h = list[i] || {};
    if (h.name) m[h.name] = h.value;
  }
  return m;
}
function hostOf(url) { try { return (new URL(url)).host; } catch (e) { return ""; } }

// aEvents payload decoder — the webGTM tag sends events as ?e=<JSON> (plain) or
// ?q=<enc> (obfuscated: Base64 → Caesar shift over a URL-safe alphabet, with `~` at
// position 3 encoding the stripped Base64 padding). shift = salt%63+1, so there are
// only 63 possibilities — we brute-force all and keep the one that yields valid JSON.
// No salt needed. (Scheme: aevents-webgtm-tag.js `enc()`.)
var AE_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var AE_OUT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function aeCaesarDecode(q, shift) {
  var pad = 0;
  if (q.charAt(3) === "~") { pad++; if (q.charAt(4) === "~") pad++; }
  var out = pad ? q.slice(0, 3) + q.slice(3 + pad) : q;
  var b64 = "";
  for (var i = 0; i < out.length; i++) {
    var c = out.charAt(i), idx = AE_OUT.indexOf(c);
    b64 += idx < 0 ? c : AE_B64.charAt((idx - shift + 64) % 64);
  }
  b64 += pad === 1 ? "=" : pad === 2 ? "==" : "";
  try {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) { return null; }
}
// An aEvents event is a plain object carrying at least one of its known fields — this
// rejects false positives (e.g. a Clarity collect JSON array {0:…,1:…}).
function isAEvents(o) {
  return o && typeof o === "object" && !Array.isArray(o) &&
    (typeof o.ae_timestamp !== "undefined" || o.event || o.event_name || o.page_location);
}
function aeBrute(q) {
  for (var shift = 1; shift <= 63; shift++) {
    var txt = aeCaesarDecode(q, shift);
    if (txt && txt.charAt(0) === "{") { try { var o = JSON.parse(txt); if (isAEvents(o)) return o; } catch (er) { /* wrong shift */ } }
  }
  return null;
}
// Decodes an aEvents payload from the URL query (?e=/?q=, GET pixel) OR the POST body
// (JSON { q | e }, used by the XHR transport / reverse-proxied /…/ae endpoint).
function decodeAEvents(url, body) {
  try {
    var u = new URL(url);
    var plain = u.searchParams.get("e");
    if (plain) { try { var pe = JSON.parse(plain); if (isAEvents(pe)) return pe; } catch (er) { /* not json */ } }
    var q = u.searchParams.get("q");
    if (q) { var r = aeBrute(q); if (r) return r; }
  } catch (e) { /* not a URL */ }
  if (body) {
    var obj = null; try { obj = JSON.parse(body); } catch (e2) { /* not json */ }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      if (typeof obj.q === "string") { var r2 = aeBrute(obj.q); if (r2) return r2; }
      if (typeof obj.e === "string") { try { var be = JSON.parse(obj.e); if (isAEvents(be)) return be; } catch (e3) { /* ignore */ } }
      if (isAEvents(obj.e)) return obj.e;
    }
  }
  return null;
}
// Property / measurement / stream ID a request targets: GTM/gtag use `id` (GTM-…/G-…/
// AW-…/DC-…), GA4/Ads collect use `tid`. Shown under the type badge.
function reqPropId(url) {
  try { var q = (new URL(url)).searchParams; return q.get("id") || q.get("tid") || ""; } catch (e) { return ""; }
}
// Best-effort event name of a tracking request — GA4/sGTM carry it as `en`
// (query for GET, body for POST). Lets the panel print it under the type badge.
function reqEventName(url, post) {
  try {
    var en = (new URL(url)).searchParams.get("en");
    if (en) return en;
  } catch (e) { /* ignore */ }
  if (post) {
    var m = /(?:^|[&\n])en=([^&\s]+)/.exec(post);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e2) { return m[1]; } }
  }
  return "";
}
function initNetwork() {
  try {
    chrome.devtools.network.onRequestFinished.addListener(function (req) {
      try {
        var url = req.request && req.request.url;
        if (!url) return;
        var rq = req.request || {}, rs = req.response || {};
        var content = rs.content || {};
        // Pre-consent leak detection: snapshot whether aGTM had consent AT CAPTURE TIME. Only
        // meaningful once aGTM is loaded and reports gtmConsent — otherwise "unknown" (we don't
        // flag pages without aGTM). A tracking hit stamped preConsent=true is a leak even after
        // consent is later granted (it already fired).
        var snapNow = state.snap;
        var consentKnown = !!(snapNow && snapNow.loaded);
        var gtmConsentNow = !!(snapNow && snapNow.consent && truthy(snapNow.consent.gtmConsent));
        var post = rq.postData && typeof rq.postData.text === "string" ? rq.postData.text : "";
        // F-58: Chrome may hand a binary/gzip body as a base64 string (HAR postData.encoding).
        // Then `post` is base64 text → looksBinary() sees no gzip magic and returns false,
        // so treat encoding==="base64" as binary too. decodePayload()→bytesFromPayload()
        // then base64-decodes and gunzips (or recovers plain text) instead of showing gibberish.
        var b64Encoded = !!(rq.postData && rq.postData.encoding === "base64" && post);
        var binary = looksBinary(post) || b64Encoded;
        // Human-readable postData for the expand view — a note (not mojibake) when the
        // body is gzip/binary; capped otherwise.
        var postShown = post
          ? (binary ? "(binär / gzip — " + post.length + " Bytes; im DevTools-Network-Tab ansehen)"
            : (post.length > 4000 ? post.slice(0, 4000) + " …[gekürzt]" : post))
          : undefined;
        var detail = {
          method: rq.method || "",
          url: url,
          status: rs.status || 0,
          statusText: rs.statusText || "",
          resourceType: req._resourceType || "",
          mimeType: content.mimeType || "",
          responseSize: typeof content.size === "number" ? content.size : null,
          timeMs: Math.round(req.time || 0),
          serverIP: req.serverIPAddress || "",
          requestHeaders: headerMap(rq.headers),
          responseHeaders: headerMap(rs.headers),
          queryString: (rq.queryString || []).length ? headerMap(rq.queryString) : undefined,
          postData: postShown
        };
        state.net.unshift({
          id: ++netSeq,
          url: url,
          method: rq.method || "",
          status: rs.status || 0,
          ts: (new Date()).getTime(),
          time: req.time || 0,
          evName: reqEventName(url, binary ? "" : post),
          propId: reqPropId(url),
          host: hostOf(url),
          payload: binary ? "" : (post || ""),
          payloadNote: binary ? ("binär / gzip · " + post.length + " Bytes") : "",
          payloadBinary: binary,
          // Keep the raw body (capped) + HAR encoding so the panel can gunzip on demand.
          payloadRaw: post ? post.slice(0, 262144) : "",
          payloadEncoding: (rq.postData && rq.postData.encoding) || "",
          preConsent: consentKnown && !gtmConsentNow,
          detail: detail
        });
        if (state.net.length > 500) state.net.length = 500;
        if (state.activeTab === "network") renderNetwork();
      } catch (e) { /* ignore single entry */ }
    });
    chrome.devtools.network.onNavigated.addListener(function () {
      state.net = [];
      // We witnessed this navigation, so the capture now covers the page from load —
      // the pre-consent window is observed and a clean leak result is trustworthy (F-1).
      state.navObserved = true;
      if (state.activeTab === "network") renderNetwork();
    });
  } catch (e) {
    console.error("aGTM Inspector: network capture unavailable", e);
  }
}
// Reconstruct the request-body bytes from the HAR postData string. Chrome hands binary
// bodies either base64-encoded (encoding:"base64") or as a latin1 string (charCode = byte).
function bytesFromPayload(e) {
  var s = e.payloadRaw || "";
  if (e.payloadEncoding === "base64") {
    try { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
    catch (err) { return null; }
  }
  var arr = new Uint8Array(s.length);
  for (var j = 0; j < s.length; j++) arr[j] = s.charCodeAt(j) & 0xff;
  return arr;
}
function isGzipBytes(b) { return b && b.length > 2 && b[0] === 0x1f && b[1] === 0x8b; }
// Best-effort async decompression of a gzip/binary body via the native DecompressionStream
// (a browser API — no external lib, CSP-safe). Caches the result on the entry and re-renders.
function decodePayload(e) {
  if (e.decodeTried) return;
  e.decodeTried = true;
  try {
    var bytes = bytesFromPayload(e);
    if (!bytes) { e.decodeError = "keine Bytes"; return; }
    if (isGzipBytes(bytes) && typeof DecompressionStream !== "undefined") {
      var ds = new DecompressionStream("gzip");
      var stream = new Blob([bytes]).stream().pipeThrough(ds);
      new Response(stream).arrayBuffer().then(function (buf) {
        var out = new TextDecoder("utf-8").decode(buf);
        // The HAR body string can be a lossy UTF-8 decode of the real bytes, so a
        // "successful" inflate may still be garbage — only keep it if it reads as text.
        if (looksBinary(out)) e.decodeError = "dekomprimiert, aber kein lesbarer Text (binäre/lossy Quelle)";
        else e.decodedPayload = out;
        if (state.activeTab === "network") renderNetwork();
      }, function (err) {
        e.decodeError = String(err);
        if (state.activeTab === "network") renderNetwork();
      });
    } else {
      var t = new TextDecoder("utf-8").decode(bytes);
      if (looksBinary(t)) e.decodeError = "kein lesbarer Text"; else e.decodedPayload = t;
      if (state.activeTab === "network") renderNetwork();
    }
  } catch (err) { e.decodeError = String(err); }
}
// One collapsible sub-section of a network row's detail (headers / query as JSON).
function netSub(key, label, obj) {
  var n = obj && typeof obj === "object" ? objKeys(obj).length : 0;
  if (!n) return "";
  var open = !!state.expanded[key];
  var h = '<div class="net-sub" data-expand="' + esc(key) + '">' + (open ? "▾" : "▸") + " " + esc(label) + ' <span class="muted">(' + n + ")</span></div>";
  if (open) h += '<pre class="jsonview">' + JV.highlight(obj) + "</pre>";
  return h;
}
// Render a text/JSON body: highlight if JSON-parseable, else escaped text. GA4 measurement
// bodies are `k=v&…`; GA4 batches events with control-char separators — split to lines.
function payloadBody(text) {
  var parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (parsed) return JV.highlight(parsed);
  return esc(trunc(text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "\n• "), 8000));
}
// Payload sub-section — handles readable bodies, gzip/binary (auto-decompressed), and the
// GET-parameter fallback.
function netSubPayload(key, e) {
  var d = e.detail || {};
  var hasBody = e.payloadBinary || (d.postData && typeof d.postData === "string");
  var label = e.ae ? "Payload — aEvents (entschlüsselt)" : (hasBody ? "Payload" : "Payload (kein Body — GET-Parameter)");
  var open = !!state.expanded[key];
  var h = '<div class="net-sub" data-expand="' + esc(key) + '">' + (open ? "▾" : "▸") + " " + esc(label) + "</div>";
  if (!open) return h;
  var body;
  if (e.ae) {
    body = '<div class="muted" style="margin:2px 0">entschlüsselt (aEvents ' + (e.url.indexOf("?q=") !== -1 || (d.postData || "").indexOf('"q"') !== -1 ? "Base64+Caesar" : "Klartext") + ")</div>" + JV.highlight(e.ae);
  } else if (e.payloadBinary) {
    if (e.decodedPayload != null) body = '<div class="muted" style="margin:2px 0">(entpackt aus gzip · ' + (e.payloadNote || "") + ")</div>" + payloadBody(e.decodedPayload);
    else if (e.decodeError) body = '<span class="muted">Entpacken fehlgeschlagen (' + esc(e.decodeError) + "). Roh: " + esc(e.payloadNote || "") + " — im DevTools-Network-Tab ansehen.</span>";
    else { decodePayload(e); body = '<span class="muted">Entpacke gzip… (aktualisiert automatisch)</span>'; }
  } else if (d.postData && typeof d.postData === "string") {
    body = payloadBody(d.postData);
  } else {
    body = "";
    try { (new URL(e.url)).searchParams.forEach(function (v, k) { body += k + " = " + v + "\n"; }); } catch (er) { /* ignore */ }
    body = esc(body || "—");
  }
  h += '<pre class="jsonview">' + body + "</pre>";
  return h;
}
// Compact preview of a decoded aEvents object — boilerplate (timestamp / page_*) hidden,
// event name + consent + custom params to the front.
var AE_SKIP = { ae_timestamp: 1, page_location: 1, page_path: 1, page_referrer: 1, event: 1, event_name: 1, consent: 1 };
function aePreview(o) {
  var parts = [];
  var name = o.event_name || o.event;
  if (name) parts.push('<span class="pk">event</span>:' + esc(name));
  if (o.consent) parts.push('<span class="pk">consent</span>:' + esc(trunc(String(o.consent), 16)));
  for (var k in o) {
    if (!Object.prototype.hasOwnProperty.call(o, k) || AE_SKIP[k]) continue;
    var v = o[k], vs = v === null ? "null" : (typeof v === "object" ? (Array.isArray(v) ? "[" + v.length + "]" : "{…}") : String(v));
    if (vs.length > 24) vs = vs.slice(0, 24) + "…";
    parts.push('<span class="pk">' + esc(k) + "</span>:" + esc(vs));
    if (parts.length >= 8) break;
  }
  return '<span class="preview">' + parts.join("  ") + "</span>";
}
function netKV(label, val) { return '<div class="k">' + esc(label) + '</div><div class="v mono">' + esc(val) + "</div>"; }
// One decoded consent signal → a granted/denied/unset chip with the raw code + note.
function sigChip(sig) {
  var v = sig.value || {}, cls = v.state === "granted" ? "ok" : (v.state === "denied" ? "err" : "");
  var mark = v.state === "granted" ? "✓" : (v.state === "denied" ? "✗" : "·");
  var title = (v.note ? v.note + " · " : "") + "Code: " + (v.raw || "?");
  return '<span class="chip ' + cls + '" title="' + esc(title) + '">' + esc(sig.name.replace(/_storage$/, "")) + " " + mark +
    (v.state === "unknown" ? " <span class=\"muted\">(" + esc(v.raw || "?") + "?)</span>" : "") + "</span>";
}
// Compact per-category consent "fingerprint" for the LIST view: one tiny colour-coded
// pill per Consent-Mode signal (green=granted, red=denied, grey=unset) so you can scan a
// whole request/dataLayer list and see at a glance what each hit was allowed to do —
// without expanding anything. gcd (4 signals) preferred over gcs (2) when both are present.
var CFP_SHORT = { ad_storage: "ad", analytics_storage: "an", ad_user_data: "aud", ad_personalization: "aps" };
function cfpPill(sig) {
  var st = (sig.value || {}).state;
  var cls = st === "granted" ? "cfp-g" : (st === "denied" ? "cfp-d" : (st === "unknown" ? "cfp-x" : "cfp-u"));
  var lbl = CFP_SHORT[sig.name] || sig.name;
  var raw = (sig.value && sig.value.raw) ? " (" + sig.value.raw + ")" : "";
  return '<span class="cfp ' + cls + '" title="' + esc(sig.name + ": " + (st || "?") + raw) + '">' + esc(lbl) + "</span>";
}
// From a decoded {gcs,gcd} object (consentsignals.js).
function consentFingerprint(dec) {
  if (!dec) return "";
  var sigs = (dec.gcd && dec.gcd.signals && dec.gcd.signals.length) ? dec.gcd.signals
    : (dec.gcs && dec.gcs.signals ? dec.gcs.signals : []);
  if (!sigs.length) return "";
  var src = (dec.gcd && dec.gcd.signals && dec.gcd.signals.length) ? "gcd" : "gcs";
  return '<span class="cfp-row" title="Consent-Signale (' + src + ') — grün granted · rot denied · grau nicht gesetzt">' + sigs.map(cfpPill).join("") + "</span>";
}
// Build fingerprint signals from a gtag('consent',…) command / dataLayer consent payload.
function payloadFingerprint(payload) {
  if (!payload || typeof payload !== "object") return "";
  var sigs = [];
  GCM_ORDER.forEach(function (cat) {
    if (typeof payload[cat] === "undefined") return;
    var tri = payloadTri(payload, cat);
    sigs.push({ name: cat, value: { state: tri === true ? "granted" : (tri === false ? "denied" : "unset") } });
  });
  return sigs.length ? '<span class="cfp-row" title="Consent-Signale (command) — grün granted · rot denied · grau nicht gesetzt">' + sigs.map(cfpPill).join("") + "</span>" : "";
}
// gcs/gcd sub-section — Google's per-request consent signals, decoded (see consentsignals.js).
function netSubSignals(key, e) {
  var dec = e.sig;
  if (typeof dec === "undefined") { dec = SIG.decodeSignals(e.url) || null; e.sig = dec; }
  if (!dec) return "";
  var open = !!state.expanded[key];
  var h = '<div class="net-sub" data-expand="' + esc(key) + '">' + (open ? "▾" : "▸") +
    ' Consent-Signale (gcs/gcd) <span class="muted">— entschlüsselt</span></div>';
  if (!open) return h;
  h += '<div style="padding:4px 0">';
  if (dec.gcs) {
    h += '<div class="muted" style="font-size:11px">gcs <span class="mono">' + esc(dec.gcs.raw) + "</span> — klassischer Consent Mode</div>" +
      "<div>" + (dec.gcs.signals.length ? dec.gcs.signals.map(sigChip).join(" ") : '<span class="muted">— (kein Zustand, nur G1)</span>') + "</div>";
  }
  if (dec.gcd) {
    h += '<div class="muted" style="font-size:11px;margin-top:4px">gcd <span class="mono">' + esc(dec.gcd.raw) + "</span> — Consent Mode v2</div>" +
      "<div>" + dec.gcd.signals.map(sigChip).join(" ") + "</div>";
  }
  h += '<div class="muted" style="margin-top:4px;font-size:10px">✓ granted · ✗ denied · · nicht gesetzt. gcs: G1&lt;ad_storage&gt;&lt;analytics_storage&gt;. gcd (v2): ad_storage, analytics_storage, ad_user_data, ad_personalization.</div>';
  h += "</div>";
  return h;
}
function netDetailHtml(e) {
  var d = e.detail || {};
  var h = '<div class="net-detail"><div class="grid" style="margin-bottom:6px">' +
    netKV("Methode", d.method || "—") +
    netKV("Status", (d.status || "—") + (d.statusText ? " " + d.statusText : "")) +
    netKV("Typ", d.resourceType || "—") +
    netKV("MIME", d.mimeType || "—") +
    netKV("Größe", d.responseSize != null ? d.responseSize + " B" : "—") +
    netKV("Zeit", (d.timeMs || 0) + " ms") +
    (d.serverIP ? netKV("Server-IP", d.serverIP) : "") +
    "</div>";
  // F-59: same __aeBody memo-guard as the list loop — without it a payload that never
  // decodes as aEvents (e.ae stays null) would re-run aeBrute()'s 63 shift iterations on
  // every renderNetwork() (fires per incoming request) while this row is expanded.
  var aeBody = e.payload || e.decodedPayload || "";
  if (!e.ae && e.__aeBody !== aeBody) { e.__aeBody = aeBody; e.ae = decodeAEvents(e.url, aeBody) || null; }
  h += netSubSignals("n|" + e.id + "|sig", e);
  h += netSub("n|" + e.id + "|q", "Query-String", d.queryString);
  h += netSub("n|" + e.id + "|rq", "Request-Header", d.requestHeaders);
  h += netSub("n|" + e.id + "|rs", "Response-Header", d.responseHeaders);
  h += netSubPayload("n|" + e.id + "|pl", e);
  h += "</div>";
  return h;
}
function renderNetwork() {
  // F-65: capture the search caret BEFORE the repaint replaces the input element, so we can
  // restore the exact position instead of forcing it to the end (which broke mid-string edits).
  var caret = null;
  if (state.netSearchActive) {
    var sPrev = el("net-search");
    if (sPrev && typeof sPrev.selectionStart === "number") caret = { start: sPrev.selectionStart, end: sPrev.selectionEnd };
  }
  var cfg = state.snap && state.snap.config;
  var pageHost = (state.snap && state.snap.pageHost) || "";
  var scope = NET.sgtmScope(state.net, cfg);
  // Reconcile the capture-time preConsent stamp against the current consent timestamp:
  // the stamp is read from a snapshot up to POLL_MS stale, so a tracker that legitimately
  // fired right after "Accept" (before the next poll flips gtmConsent) would otherwise stay
  // flagged forever. If consent is NOW granted and the request happened at/after the grant
  // moment (consentTs), it is post-consent — not a leak. If consent is still absent/denied,
  // the stamp stands (a tracker firing then IS a leak). (Kritiker Runde 2, P2.)
  var snap = state.snap || {};
  var consentGranted = !!(snap.consent && truthy(snap.consent.gtmConsent));
  var consentTs = snap.consentTs || 0;
  var mapped = state.net.map(function (e) {
    var cls = NET.classify(e.url, scope, pageHost);
    return { e: e, cls: cls, leak: leakHitFor(e, cls, consentGranted, consentTs) }; // leak = tracking request that fired before consent
  });
  var leaks = mapped.filter(function (r) { return r.leak; });
  var rows = state.netOnlyAGTM ? mapped.filter(function (r) { return r.cls; }) : mapped;

  // Distinct hosts (for the host checkboxes) over the aGTM-filtered rows.
  var hostSet = {};
  rows.forEach(function (r) { if (r.e.host) hostSet[r.e.host] = true; });
  var hosts = objKeys(hostSet).sort();

  // Host-hide + free-text filter (prefix "-" excludes, e.g. "-clarity").
  var q = (state.netSearch || "").trim().toLowerCase();
  var neg = q.charAt(0) === "-";
  if (neg) q = q.slice(1).trim();
  var list = rows.filter(function (r) {
    if (state.netHidden[r.e.host]) return false;
    if (!q) return true;
    var hay = (r.e.url + " " + (r.cls ? r.cls.key : "") + " " + (r.e.evName || "") + " " + (r.e.propId || "")).toLowerCase();
    var hit = hay.indexOf(q) !== -1;
    return neg ? !hit : hit;
  });

  var html = "";
  // Pre-consent leak banner — tracking/marketing requests that fired while gtmConsent was
  // still false. The core promise of aGTM is that nothing tracking-related loads before the
  // consent decision, so any hit here is a compliance red flag.
  if (leaks.length) {
    var byVendor = {};
    leaks.forEach(function (r) { var v = r.leak.vendor || "?"; byVendor[v] = (byVendor[v] || 0) + 1; });
    var vparts = objKeys(byVendor).map(function (v) { return esc(v) + " ×" + byVendor[v]; });
    html += '<div class="card leakbox"><h2>⚠ Pre-Consent-Leak erkannt</h2>' +
      "<strong>" + leaks.length + " Tracking-Request" + (leaks.length > 1 ? "s" : "") + "</strong> " +
      "vor der Consent-Entscheidung (gtmConsent=false) gefeuert " +
      '<span class="muted">(über alle erfassten Requests — unabhängig vom aktiven Filter)</span>. ' +
      '<span class="muted">Das untergräbt den Zweck von aGTM — Tracking darf erst nach Consent laden. ' +
      "Ausnahme: bewusst konfigurierte <code>noConsent</code>-Container.</span>" +
      '<div style="margin-top:6px">' + vparts.map(function (p) { return '<span class="chip err">' + p + "</span>"; }).join(" ") + "</div></div>";
  }
  html += '<div class="toolbar">' +
    '<label><input type="checkbox" id="net-filter"' + (state.netOnlyAGTM ? " checked" : "") + "> nur aGTM-relevant</label>" +
    '<input type="text" id="net-search" class="net-search" placeholder="Filtern…  ( -clarity blendet aus )" value="' + esc(state.netSearch) + '">' +
    '<button class="small" id="net-clear">Leeren</button>' +
    '<span class="muted">' + list.length + " Einträge</span></div>";

  if (hosts.length) {
    html += '<div class="toolbar net-hosts">';
    hosts.forEach(function (h) {
      html += '<label><input type="checkbox" class="net-host" data-host="' + esc(h) + '"' + (state.netHidden[h] ? "" : " checked") + "> " + esc(h) + "</label>";
    });
    html += "</div>";
  }

  if (isEmpty(list)) {
    html += '<div class="empty">Keine' + (state.netOnlyAGTM ? " aGTM-relevanten" : "") + (q ? " passenden" : "") +
      " Requests.<br>Seite (neu) laden oder Consent erteilen — gtm.js / aGTMconsent / aGTM.js / sGTM-Events erscheinen hier.</div>";
  } else {
    html += '<table class="compact"><thead><tr><th class="caret-h"></th><th class="fit">Typ</th><th class="fit">Status</th><th class="fit">Methode</th><th class="fit">Zeit</th><th>URL</th></tr></thead><tbody>';
    list.forEach(function (r) {
      var e = r.e;
      var typeCell = r.cls
        ? '<span class="chip ' + r.cls.cls + '">' + esc(r.cls.key) + "</span>"
        : '<span class="muted">—</span>';
      if (r.leak) typeCell += ' <span class="chip err" title="Tracking-Request vor Consent (gtmConsent=false) — ' + esc(r.leak.vendor || "") + '">⚠ pre-consent</span>';
      var stCls = e.status >= 200 && e.status < 300 ? "ok" : (e.status >= 400 || e.status === 0 ? "err" : "warn");
      var key = "n|" + e.id;
      var open = !!state.expanded[key];
      // aEvents payload (URL ?e=/?q= or POST body {q|e}) — decode + cache, re-attempt
      // when the (gzip-decoded) body changes.
      var aeBody = e.payload || e.decodedPayload || "";
      if (!e.ae && e.__aeBody !== aeBody) { e.__aeBody = aeBody; e.ae = decodeAEvents(e.url, aeBody) || null; }
      var aeName = e.ae ? (e.ae.event_name || e.ae.event || "") : "";
      var typeStack = typeCell +
        ((e.evName || aeName) ? '<div class="net-en" title="Event-Name">' + esc(e.evName || aeName) + "</div>" : "") +
        (e.propId ? '<div class="net-id" title="Property / Measurement / Stream-ID">' + esc(e.propId) + "</div>" : "");
      // Preview uses the readable body, or the auto-decompressed gzip body once available.
      var pv = e.payload || e.decodedPayload || "";
      var urlCell = urlPretty(e.url);
      if (e.ae) {
        urlCell += '<div class="u-params"><span class="chip ok" style="font-size:9px;padding:0 4px">aEvents ✓</span> ' + aePreview(e.ae) + "</div>";
      } else if (pv) {
        var tag = e.decodedPayload ? '<span class="chip ok" style="font-size:9px;padding:0 4px">gunzip</span> ' : "";
        urlCell += '<div class="u-params">' + tag + '<span class="preview">' + esc(trunc(pv.replace(/\s+/g, " "), 140)) + "</span></div>";
      } else {
        if (e.payloadBinary && !e.decodeTried) decodePayload(e); // eager, so the preview fills in
        if (e.payloadNote) urlCell += '<div class="u-params"><span class="muted" style="font-size:11px">⛃ ' + esc(e.payloadNote) + " · GET-Parameter:</span></div>";
        var qp = allParamsPreview(e.url);
        if (qp) urlCell += '<div class="u-params">' + qp + "</div>";
      }
      // Consent fingerprint (gcs/gcd) inline in the list — decode once + cache on the entry.
      if (typeof e.sig === "undefined") e.sig = SIG.decodeSignals(e.url) || null;
      var fp = consentFingerprint(e.sig);
      if (fp) urlCell += '<div class="u-params"><span class="muted" style="font-size:9px">consent</span> ' + fp + "</div>";
      html += '<tr class="evt row-toggle" data-expand="' + esc(key) + '">' +
        '<td class="caret">' + (open ? "▾" : "▸") + "</td>" +
        '<td class="fit">' + typeStack + "</td>" +
        '<td class="fit"><span class="chip ' + stCls + '">' + esc(e.status || "—") + "</span></td>" +
        '<td class="fit mono">' + esc(e.method) + "</td>" +
        '<td class="fit mono">' + esc(fmtTime(e.ts)) + "</td>" +
        '<td class="col-url">' + urlCell + "</td></tr>";
      if (open) {
        html += '<tr class="detail"><td></td><td colspan="5">' + netDetailHtml(e) + "</td></tr>";
      }
    });
    html += "</tbody></table>";
  }

  if (paint("tab-network", html)) {
    var f = el("net-filter");
    if (f) f.addEventListener("change", function () { state.netOnlyAGTM = f.checked; saveSettings(); renderNetwork(); });
    var cl = el("net-clear");
    if (cl) cl.addEventListener("click", function () { state.net = []; renderNetwork(); });
    var se = el("net-search");
    if (se) {
      se.addEventListener("focus", function () { state.netSearchActive = true; });
      se.addEventListener("blur", function () { state.netSearchActive = false; });
      se.addEventListener("input", function () { state.netSearch = se.value; renderNetwork(); });
    }
    var netNode = el("tab-network");
    Array.prototype.forEach.call((netNode && netNode.querySelectorAll ? netNode.querySelectorAll(".net-host") : []), function (b) {
      b.addEventListener("change", function () {
        var h = b.getAttribute("data-host");
        if (b.checked) delete state.netHidden[h]; else state.netHidden[h] = true;
        saveSettings();
        renderNetwork();
      });
    });
    // Keep the search field focused across the repaint it just triggered, restoring the
    // caret to where the user actually was (F-65) — fall back to end only if unknown.
    if (state.netSearchActive) {
      var s2 = el("net-search");
      if (s2 && s2.focus) {
        s2.focus();
        if (s2.setSelectionRange) {
          if (caret) s2.setSelectionRange(caret.start, caret.end);
          else { var L = (s2.value || "").length; s2.setSelectionRange(L, L); }
        }
      }
    }
  }
}

/* ---------- Diagnose (card #47: Health-Score, Consent-Timeline, Compliance-Report) ---------- */
// Resolve the lifecycle-milestone timestamps for the Consent-Timeline from the sources
// that carry them (all epoch ms, same clock basis): aGTM.l log ids, aGTM.d.dl event
// aGTMts, and the panel's own network capture (which knows classify()).
function timelineSignals() {
  var s = state.snap || {};
  function logTs(id) {
    var best = 0, L = s.log || [];
    for (var i = 0; i < L.length; i++) { var e = L[i]; if (e && e.id === id && e.timestamp && (!best || e.timestamp < best)) best = e.timestamp; }
    return best;
  }
  function dlTs(name) {
    var best = 0, D = s.dl || [];
    for (var i = 0; i < D.length; i++) { var e = D[i]; if (e && e.event === name && e.aGTMts && (!best || e.aGTMts < best)) best = e.aGTMts; }
    return best;
  }
  // Network-derived: earliest gtm.js/gtag.js load, and the first actual tag/collect hit
  // (excluding the container load itself — that's the "inject" marker, not a tag fire).
  // e.ts is the request-FINISHED time; subtract its duration (HAR e.time) so the marker
  // sits at the request START, not overstated by the round-trip (F-3).
  var scope = NET.sgtmScope(state.net, s.config), pageHost = s.pageHost || "";
  var netGtm = 0, firstTag = 0;
  for (var i = 0; i < state.net.length; i++) {
    var e = state.net[i], cls = NET.classify(e.url, scope, pageHost);
    if (!cls) continue;
    var startTs = e.ts - Math.round(e.time || 0);
    if (cls.key === "gtm.js" || cls.key === "gtag.js") { if (!netGtm || startTs < netGtm) netGtm = startTs; }
    else if (NET.trackingHit && NET.trackingHit(e.url, cls)) { if (!firstTag || startTs < firstTag) firstTag = startTs; }
  }
  return {
    navStart: s.navStart || 0,
    config: logTs("m1"),
    pending: logTs("m8"),
    // Prefer the FIRST consent completion (m3 setup-complete / m2 consent-available) so the
    // marker anchors the CMP decision that triggered injection. consentTs is only a fallback:
    // it's the LAST consent event (reader takes it from the tail), which on a later re-consent
    // could otherwise sort AFTER "GTM injiziert" and invert the waterfall (Kritiker UX-P2).
    consent: logTs("m3") || logTs("m2") || s.consentTs,
    // m6 = GTM injected, m5 = GTAG injected (log); else the aGTM_ready / gtm.js DL event; else the wire.
    inject: logTs("m6") || logTs("m5") || dlTs("aGTM_ready") || dlTs("gtm.js") || netGtm,
    firstTag: firstTag
  };
}

// Copy helper — Clipboard API with a textarea/execCommand fallback (DevTools panel context).
function flashCopied(msg) {
  var note = el("diag-copied"); if (!note) return;
  note.textContent = msg || "kopiert ✓";
  try { setTimeout(function () { var n = el("diag-copied"); if (n) n.textContent = ""; }, 1800); } catch (e) { /* ignore */ }
}
function copyText(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashCopied(); }, function () { fallbackCopy(text); });
      return;
    }
  } catch (e) { /* fall through */ }
  fallbackCopy(text);
}
function fallbackCopy(text) {
  try {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    flashCopied();
  } catch (e) { flashCopied("Kopieren nicht möglich"); }
}
function downloadText(text, filename) {
  try {
    var blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 2000);
    flashCopied("heruntergeladen ✓");
  } catch (e) { flashCopied("Download nicht möglich"); }
}
// Assemble the report context from the last-rendered Diagnose inputs (kept in state.diag,
// which renderDiagnose refreshes every poll). generatedAt is stamped fresh per click.
function diagReportCtx() {
  var d = state.diag || {};
  return {
    snap: state.snap, checks: d.checks, level: d.level, timeline: d.timeline,
    leaks: d.leaks, traps: d.traps, generatedAt: (new Date()).toISOString()
  };
}

// Identity fields watched for changes: session sid/uid (from aGTM.d.session) + the
// integrator CRM user_id (from aGTM.c). Label + where to read it from a snapshot.
var ID_FIELDS = [
  { key: "sid", label: "Session-ID", get: function (s) { return (s.session && s.session.sid) || ""; } },
  { key: "uid", label: "User-ID", get: function (s) { return (s.session && s.session.uid) || ""; } },
  { key: "user_id", label: "user_id (CRM)", get: function (s) { return (s.config && s.config.user_id) || ""; } }
];
// Called every poll (also when off the Diagnose tab). Diffs the current sid/uid/user_id
// against the last observed values and appends a history entry on any change — including
// the initial set (from "") and the v1.5 F→C user-id promote (F.…→C.… after consent).
function trackIds(snap) {
  if (!snap || !snap.loaded) return; // a mid-navigation {loaded:false} must not record a spurious clear
  var now = (new Date()).getTime();
  for (var i = 0; i < ID_FIELDS.length; i++) {
    var f = ID_FIELDS[i], val = String(f.get(snap) || ""), cur = state.idTrack[f.key];
    if (!cur) {
      if (val) { state.idTrack[f.key] = { value: val, since: now }; state.idHistory.push({ ts: now, field: f.key, from: "", to: val }); }
    } else if (cur.value !== val) {
      state.idHistory.push({ ts: now, field: f.key, from: cur.value, to: val });
      state.idTrack[f.key] = { value: val, since: now };
    }
  }
  if (state.idHistory.length > 200) state.idHistory.splice(0, state.idHistory.length - 200);
}

function renderDiagnose() {
  var s = state.snap, c = s.config || {};
  var traps = activeConfigTraps(c, s);
  var leaks = computeNetLeaks();
  // Was the pre-consent window actually captured? True if we witnessed a navigation, or the
  // earliest captured request lines up with navStart (capture began at/around page load).
  // Otherwise a clean leak result is N/A, not a false green (F-1).
  var earliestNet = 0;
  for (var ni = 0; ni < state.net.length; ni++) { var t = state.net[ni].ts; if (t && (!earliestNet || t < earliestNet)) earliestNet = t; }
  var windowObserved = state.navObserved || (!!earliestNet && !!s.navStart && earliestNet <= s.navStart + 1500);
  var checks = DIAG.healthChecks(s, leaks, traps, windowObserved);
  var overall = DIAG.overallLevel(checks);
  var timeline = DIAG.buildTimeline(timelineSignals());
  // Keep inputs so the export buttons build the report from exactly what's shown.
  state.diag = { checks: checks, level: overall.level, timeline: timeline, leaks: leaks, traps: traps };

  var lvlLabel = { pass: "Alles im grünen Bereich", warn: "Mit Warnungen", fail: "Kritische Probleme" }[overall.level] || "—";
  var ct = overall.counts || {};
  var countsStr = (ct.pass || 0) + "× ✓ · " + (ct.warn || 0) + "× ⚠ · " + (ct.fail || 0) + "× ✗" + (ct.na ? (" · " + ct.na + "× –") : "");

  var html = '<div class="card"><h2>Health-Score</h2>' +
    '<div class="score"><span class="score-badge score-' + overall.level + '"><span class="lamp"></span>' + esc(lvlLabel) + "</span>" +
    '<span class="score-counts">' + esc(countsStr) + "</span></div>" +
    '<div class="checks">';
  checks.forEach(function (ch) {
    html += '<div class="check"><span class="ci ci-' + ch.status + '">' + (DIAG.STATUS_ICON[ch.status] || "?") + "</span>" +
      '<span class="cl">' + esc(ch.label) + '</span><span class="cd">' + esc(ch.detail) + "</span></div>";
  });
  html += "</div></div>";

  // Session & IDs — current sid/uid/user_id + change history (F→C promote etc.)
  html += '<div class="card"><h2>Session &amp; IDs</h2>';
  var anyId = false;
  html += '<div class="grid">';
  ID_FIELDS.forEach(function (f) {
    var t = state.idTrack[f.key];
    var cell;
    if (t && t.value) {
      anyId = true;
      cell = '<span class="chip acc">' + esc(t.value) + '</span> <span class="muted">seit ' + esc(fmtTime(t.since)) + "</span>";
    } else {
      cell = '<span class="muted">—</span>';
    }
    html += '<div class="k">' + esc(f.label) + '</div><div class="v">' + cell + "</div>";
  });
  html += "</div>";
  if (anyId) {
    html += '<div class="muted" style="margin-top:4px;font-size:11px">„seit" = erstmals im Inspector gesehen (nicht zwingend der serverseitige Setz-Zeitpunkt).</div>';
  }
  if (state.idHistory.length) {
    html += '<div class="muted" style="margin-top:8px">Änderungen (in dieser Inspector-Sitzung beobachtet):</div>' +
      '<table class="compact"><thead><tr><th class="fit">Zeit</th><th class="fit">Feld</th><th>Änderung</th></tr></thead><tbody>';
    // newest first
    state.idHistory.slice().reverse().forEach(function (h) {
      var change = h.from
        ? ('<span class="mono">' + esc(h.from) + '</span> <span class="muted">→</span> <span class="mono">' + esc(h.to) + "</span>")
        : ('<span class="chip ok">gesetzt</span> <span class="mono">' + esc(h.to) + "</span>");
      html += '<tr><td class="fit mono">' + esc(fmtTime(h.ts)) + '</td><td class="fit mono">' + esc(h.field) + '</td><td>' + change + "</td></tr>";
    });
    html += "</tbody></table>";
  } else {
    html += '<div class="muted" style="margin-top:6px">Noch keine ID-Änderung beobachtet. Der Inspector zeigt Änderungen ab dem Öffnen — z. B. den F→C-User-ID-Promote (Fingerprint <code>F.…</code> → stabile Cookie-ID <code>C.…</code>) nach der Consent-Entscheidung.</div>';
  }
  html += "</div>";

  // Consent timeline waterfall
  html += '<div class="card"><h2>Consent-Timeline</h2>';
  if (!timeline.ok) {
    html += '<div class="muted">Keine Timeline-Marker verfügbar. Seite mit geöffnetem Inspector neu laden, damit Seitenaufruf, CMP-Entscheidung und GTM-Injection zeitlich erfasst werden.</div>';
  } else {
    var span = timeline.span || 0;
    var anchorLbl = timeline.anchored ? "Seitenaufruf" : "erstem Marker";
    // Position of the CMP decision on the axis — a tag fire (firstTag) before it is a
    // pre-consent leak, so we paint that bar red right in the timeline (the card's core
    // question: "why did X fire before consent").
    var consentRel = null;
    for (var ci = 0; ci < timeline.rows.length; ci++) { if (timeline.rows[ci].key === "consent") { consentRel = timeline.rows[ci].rel; break; } }
    html += '<div class="muted" style="margin-bottom:6px">Balken = Zeit ab ' + anchorLbl + ' (ms, keine Phasendauer)' + (span ? (" · Spanne " + span + " ms") : "") + ".</div><div class=\"tl\">";
    timeline.rows.forEach(function (r) {
      var pct = span ? Math.max(2, Math.round((r.rel / span) * 100)) : 2;
      var preConsent = r.key === "firstTag" && consentRel !== null && r.rel < consentRel;
      var barCls = preConsent ? "b-leak" : ("b-" + r.key); // r.key is a controlled enum → safe in class
      html += '<div class="tl-row"><span class="tl-lab">' + esc(r.label) + "</span>" +
        '<span class="tl-rel">+' + r.rel + ' ms</span>' +
        '<span class="tl-track"><span class="tl-bar-wrap"><span class="tl-bar ' + barCls + (span ? "" : " tl-dot") + '" style="width:' + pct + '%"></span></span>' +
        (preConsent ? '<span class="tl-leak" title="Tag feuerte vor der CMP-Entscheidung">⚠ vor Consent</span>' : "") +
        "</span></div>";
    });
    html += "</div>";
  }
  html += "</div>";

  // Compliance report export
  html += '<div class="card"><h2>Compliance-Report</h2>' +
    '<div class="muted" style="margin-bottom:8px">Ein-Klick-Momentaufnahme aus Health-Check, Consent-Flow, Timeline, Leaks &amp; Konfig-Fallen — teilbar mit Kunden.</div>' +
    '<div class="report-actions">' +
    '<button class="small" id="diag-md">Markdown kopieren</button>' +
    '<button class="small" id="diag-json">JSON kopieren</button>' +
    '<button class="small" id="diag-dl">Report herunterladen (.md)</button>' +
    '<span class="copied" id="diag-copied"></span></div></div>';

  if (paint("tab-diagnose", html)) {
    var bMd = el("diag-md"); if (bMd) bMd.addEventListener("click", function () { copyText(DIAG.buildReportMarkdown(diagReportCtx())); });
    var bJson = el("diag-json"); if (bJson) bJson.addEventListener("click", function () { copyText(DIAG.buildReportJSON(diagReportCtx())); });
    var bDl = el("diag-dl"); if (bDl) bDl.addEventListener("click", function () { downloadText(DIAG.buildReportMarkdown(diagReportCtx()), "aGTM-report.md"); });
  }
}

/* ---------- expand/collapse (event & log rows) ---------- */
// Delegated once on the persistent <section> node; survives the innerHTML repaints
// because the listener lives on the parent, not on the rebuilt rows.
function initExpand() {
  ["tab-consent", "tab-events", "tab-datalayer", "tab-network", "tab-session", "tab-config"].forEach(function (id) {
    var node = el(id);
    if (!node) return;
    node.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== node && !(t.getAttribute && t.getAttribute("data-expand"))) t = t.parentNode;
      if (!t || t === node) return;
      var key = t.getAttribute("data-expand");
      if (state.expanded[key]) delete state.expanded[key]; else state.expanded[key] = true;
      render();
    });
  });
}

/* ---------- boot ---------- */
loadSettings();
initTabs();
initExpand();
initNetwork();
loadReader(function () {
  poll();
  setInterval(poll, POLL_MS);
});
