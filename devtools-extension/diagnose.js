/**
 * aGTM Inspector — diagnostics aggregation (pure logic).
 *
 * Extracted like netclassify.js so it can be unit-tested in Node
 * (test/devtools/diagnose.test.js) AND loaded as a browser global by panel.html.
 * No DOM / chrome APIs here — everything takes plain, JSON-serialisable inputs and
 * returns plain data / strings. panel.js does the DOM rendering + wiring.
 *
 * Three read-only diagnostics for the Diagnose tab (card #47):
 *   1. healthChecks()/overallLevel() — traffic-light aggregate of the known
 *      failure modes (consent mechanism, GTM injection, pre-consent leaks,
 *      config traps).
 *   2. buildTimeline() — the page-load → CMP-decision → GTM-inject → first-tag
 *      waterfall from timestamps panel.js has already extracted.
 *   3. buildReportMarkdown()/buildReportJSON() — a shareable compliance snapshot.
 *
 * ES5-style to match the rest of the extension.
 */
(function (root) {
  "use strict";

  function truthy(v) { return v === true || v === "true"; }
  function arr(a) { return Object.prototype.toString.call(a) === "[object Array]" ? a : []; }

  /**
   * Aggregate the known aGTM failure modes into a list of checks.
   * @param snap           reader snapshot (window.aGTM view)
   * @param leaks          array of pre-consent leak objects [{vendor,url,ts}]
   * @param traps          array of active config traps [{key,msg}]
   * @param windowObserved true only when the pre-consent window was actually
   *                       captured (panel attached during the page load, i.e. a
   *                       navigation was witnessed or the earliest captured request
   *                       lines up with navStart). A "no leaks → pass" is only
   *                       trustworthy then; otherwise it degrades to N/A instead of
   *                       a false green (F-1: the green ends up in a customer report).
   *                       A captured leak is always reported (fail), observed or not.
   * Returns [{ key, label, status: 'pass'|'warn'|'fail'|'na', detail }].
   */
  function healthChecks(snap, leaks, traps, windowObserved) {
    snap = snap || {}; leaks = arr(leaks); traps = arr(traps);
    var c = snap.consent || {};
    var checks = [];

    // 1) Consent mechanism — the single most common "nothing loads" cause.
    var cmpConfigured = typeof snap.cmp === "string" && snap.cmp !== "" && snap.cmp !== "none";
    if (snap.cmp === "none") {
      checks.push({ key: "cmp", label: "Consent-Mechanismus", status: "warn",
        detail: "cmp:'none' — GTM lädt ohne Consent-Prüfung (bewusst?)." });
    } else if (cmpConfigured || snap.hasConsentCheck) {
      checks.push({ key: "cmp", label: "Consent-Mechanismus", status: "pass",
        detail: cmpConfigured ? ("CMP: " + snap.cmp) : "consent_check injiziert (sGTM-Client)" });
    } else {
      checks.push({ key: "cmp", label: "Consent-Mechanismus", status: "fail",
        detail: "Weder aGTM.c.cmp noch aGTM.f.consent_check — Consent wird nie erkannt." });
    }

    // 2) Consent recognised — hasResponse flips once the CMP answered.
    checks.push(truthy(c.hasResponse)
      ? { key: "consent", label: "Consent erkannt", status: "pass", detail: "hasResponse=true" }
      : { key: "consent", label: "Consent erkannt", status: "warn",
          detail: "Noch keine Consent-Antwort (hasResponse=false) — Banner evtl. offen." });

    // 3) GTM injection reached the DOM.
    if (snap.init && arr(snap.gtmScripts).length) {
      checks.push({ key: "inject", label: "GTM injiziert", status: "pass",
        detail: arr(snap.gtmScripts).length + " Container-Script(s) im DOM" });
    } else if (truthy(c.gtmConsent)) {
      checks.push({ key: "inject", label: "GTM injiziert", status: "warn",
        detail: "gtmConsent=true, aber (noch) kein Container-Script erkannt." });
    } else {
      checks.push({ key: "inject", label: "GTM injiziert", status: "na",
        detail: "Wartet auf Consent (gtmConsent=false)." });
    }

    // 4) Pre-consent leaks — the compliance red flag. A captured leak is always a
    //    fail. But "no leaks → pass" is only trustworthy when the pre-consent window
    //    was actually observed; if the panel opened after load (window not covered)
    //    a clean result is N/A, not a false green (F-1).
    if (leaks.length) {
      checks.push({ key: "leaks", label: "Pre-Consent-Leaks", status: "fail",
        detail: leaks.length + " Tracking-Request(s) vor der Consent-Entscheidung gefeuert" });
    } else if (windowObserved) {
      checks.push({ key: "leaks", label: "Pre-Consent-Leaks", status: "pass",
        detail: "keine vor Consent gefeuerten Tracker erfasst" });
    } else {
      checks.push({ key: "leaks", label: "Pre-Consent-Leaks", status: "na",
        detail: "Vor-Consent-Fenster nicht erfasst — Seite mit geöffnetem Inspector neu laden für die volle Prüfung." });
    }

    // 5) Config traps — soft warnings from CONFIG_TRAPS.
    checks.push(traps.length
      ? { key: "traps", label: "Konfig-Fallen", status: "warn", detail: traps.length + " mögliche Falle(n)" }
      : { key: "traps", label: "Konfig-Fallen", status: "pass", detail: "keine bekannten Fallen" });

    return checks;
  }

  // Worst-wins: any fail → 'fail', else any warn → 'warn', else 'pass'. 'na' is
  // neutral (doesn't drag the score down, but is counted).
  function overallLevel(checks) {
    checks = arr(checks);
    var counts = { pass: 0, warn: 0, fail: 0, na: 0 };
    for (var i = 0; i < checks.length; i++) {
      var st = checks[i] && checks[i].status;
      if (counts.hasOwnProperty(st)) counts[st]++;
    }
    var level = counts.fail ? "fail" : (counts.warn ? "warn" : "pass");
    return { level: level, counts: counts };
  }

  // Ordered lifecycle milestones. panel.js resolves each timestamp from aGTM.l /
  // aGTM.d.dl / the network capture (it has NET.classify); we just assemble the
  // ones that are present into a sorted, t0-relative waterfall.
  var TIMELINE_DEFS = [
    { key: "navStart", label: "Seitenaufruf" },
    { key: "config",   label: "aGTM config()" },
    { key: "pending",  label: "Consent ausstehend" },
    { key: "consent",  label: "CMP-Entscheidung" },
    { key: "inject",   label: "GTM injiziert" },
    { key: "firstTag", label: "Erster Tag-Fire" }
  ];

  /**
   * @param sig { navStart, config, pending, consent, inject, firstTag } — epoch ms
   *            (0/absent = unknown, dropped).
   * Returns { ok, rows: [{key,label,ts,rel}], t0, span }. rows sorted by rel asc.
   */
  function buildTimeline(sig) {
    sig = sig || {};
    var present = [];
    for (var i = 0; i < TIMELINE_DEFS.length; i++) {
      var d = TIMELINE_DEFS[i];
      var ts = sig[d.key];
      if (typeof ts === "number" && ts > 0) present.push({ key: d.key, label: d.label, ts: ts });
    }
    if (!present.length) return { ok: false, rows: [], t0: 0, span: 0 };
    var t0 = present[0].ts, tEnd = present[0].ts;
    for (var j = 1; j < present.length; j++) {
      if (present[j].ts < t0) t0 = present[j].ts;
      if (present[j].ts > tEnd) tEnd = present[j].ts;
    }
    var rows = present.map(function (p) { return { key: p.key, label: p.label, ts: p.ts, rel: p.ts - t0 }; });
    rows.sort(function (a, b) { return a.rel - b.rel || a.ts - b.ts; });
    // anchored = the zero point really is the page load (navStart present & earliest).
    // When navStart is missing t0 falls back to the earliest other marker, so the UI/
    // report must not claim "ab Seitenaufruf" then (F-2).
    return { ok: true, rows: rows, t0: t0, span: tEnd - t0, anchored: rows[0].key === "navStart" };
  }

  var STATUS_ICON = { pass: "✓", warn: "⚠", fail: "✗", na: "–" };

  function longVal(v) {
    if (v === null || typeof v === "undefined" || v === "") return "—";
    return String(v);
  }

  /**
   * Shareable Markdown report from the same inputs the tab renders.
   * @param ctx { snap, checks, level, timeline, leaks, traps, generatedAt }
   */
  function buildReportMarkdown(ctx) {
    ctx = ctx || {};
    var snap = ctx.snap || {}, c = snap.consent || {};
    var checks = arr(ctx.checks), leaks = arr(ctx.leaks), traps = arr(ctx.traps);
    var tl = ctx.timeline || { ok: false, rows: [] };
    var lvlWord = { pass: "PASS ✓", warn: "WARN ⚠", fail: "FAIL ✗" };
    var out = [];
    out.push("# aGTM Compliance-Report");
    out.push("");
    out.push("- **Seite:** " + longVal(snap.pageHost));
    out.push("- **aGTM-Version:** " + longVal(snap.version));
    out.push("- **Erstellt:** " + longVal(ctx.generatedAt));
    out.push("- **Gesamtstatus:** " + (lvlWord[ctx.level] || String(ctx.level || "?")));
    out.push("");

    out.push("## Health-Check");
    out.push("");
    out.push("| Status | Prüfung | Detail |");
    out.push("| --- | --- | --- |");
    for (var i = 0; i < checks.length; i++) {
      var ch = checks[i] || {};
      out.push("| " + (STATUS_ICON[ch.status] || "?") + " | " + longVal(ch.label) + " | " + longVal(ch.detail) + " |");
    }
    out.push("");

    out.push("## Consent-Entscheidung");
    out.push("");
    out.push("- **CMP:** " + (snap.cmp ? snap.cmp : (snap.hasConsentCheck ? "consent_check (injiziert)" : "—")));
    out.push("- **hasResponse:** " + (truthy(c.hasResponse) ? "true" : "false"));
    out.push("- **gtmConsent:** " + (truthy(c.gtmConsent) ? "true" : "false"));
    out.push("- **session_status:** " + longVal(snap.session_status));
    out.push("- **services:** " + longVal(c.services));
    out.push("- **purposes:** " + longVal(c.purposes));
    out.push("- **vendors:** " + longVal(c.vendors));
    out.push("");

    out.push("## Consent-Timeline");
    out.push("");
    if (tl.ok && tl.rows.length) {
      var anchor = tl.anchored ? "Seitenaufruf" : "erstem Marker";
      out.push("| Zeitpunkt | Δ ab " + anchor + " |");
      out.push("| --- | --- |");
      for (var t = 0; t < tl.rows.length; t++) {
        out.push("| " + longVal(tl.rows[t].label) + " | +" + tl.rows[t].rel + " ms |");
      }
    } else {
      out.push("_Keine Timeline-Marker verfügbar (Seite neu laden mit geöffnetem Inspector)._");
    }
    out.push("");

    out.push("## Pre-Consent-Leaks");
    out.push("");
    if (leaks.length) {
      out.push("**" + leaks.length + " Tracking-Request(s) vor der Consent-Entscheidung:**");
      out.push("");
      for (var k = 0; k < leaks.length; k++) {
        out.push("- `" + longVal(leaks[k].vendor) + "` — " + longVal(leaks[k].url));
      }
    } else {
      out.push("Keine erfasst.");
    }
    out.push("");

    if (traps.length) {
      out.push("## Konfig-Fallen");
      out.push("");
      for (var m = 0; m < traps.length; m++) {
        out.push("- `" + longVal(traps[m].key) + "` — " + longVal(traps[m].msg));
      }
      out.push("");
    }

    var containers = arr(snap.containers);
    if (containers.length) {
      out.push("## GTM-Container");
      out.push("");
      out.push("| Container | Host | geladen | noConsent |");
      out.push("| --- | --- | --- | --- |");
      for (var n = 0; n < containers.length; n++) {
        var g = containers[n] || {};
        var host = g.url ? (function () { try { return new URL(g.url).host; } catch (e) { return g.url; } })() : (g.inline ? "(inline)" : "google");
        out.push("| " + longVal(g.id) + " | " + host + " | " + (g.hasLoaded ? "ja" : "nein") + " | " + (g.noConsent ? "ja" : "nein") + " |");
      }
      out.push("");
    }

    out.push("---");
    out.push("_Erzeugt vom aGTM Inspector — read-only Momentaufnahme._");
    return out.join("\n");
  }

  // Structured variant for machine consumption / archival.
  function buildReportJSON(ctx) {
    ctx = ctx || {};
    var snap = ctx.snap || {}, c = snap.consent || {};
    var tl = ctx.timeline || { ok: false, rows: [] };
    return JSON.stringify({
      report: "aGTM-compliance",
      generatedAt: ctx.generatedAt || "",
      page: snap.pageHost || "",
      version: snap.version || null,
      overall: ctx.level || null,
      health: arr(ctx.checks).map(function (ch) {
        return { key: ch.key, label: ch.label, status: ch.status, detail: ch.detail };
      }),
      consent: {
        cmp: snap.cmp || "",
        hasConsentCheck: !!snap.hasConsentCheck,
        hasResponse: truthy(c.hasResponse),
        gtmConsent: truthy(c.gtmConsent),
        session_status: snap.session_status || "",
        services: c.services || "",
        purposes: c.purposes || "",
        vendors: c.vendors || ""
      },
      timeline: tl.ok ? tl.rows.map(function (r) { return { key: r.key, label: r.label, relMs: r.rel }; }) : [],
      leaks: arr(ctx.leaks).map(function (l) { return { vendor: l.vendor, url: l.url }; }),
      traps: arr(ctx.traps).map(function (t) { return { key: t.key, msg: t.msg }; }),
      containers: arr(snap.containers)
    }, null, 2);
  }

  var api = {
    healthChecks: healthChecks,
    overallLevel: overallLevel,
    buildTimeline: buildTimeline,
    buildReportMarkdown: buildReportMarkdown,
    buildReportJSON: buildReportJSON,
    STATUS_ICON: STATUS_ICON,
    TIMELINE_DEFS: TIMELINE_DEFS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.aGTMInspectorDiag = api;
})(typeof window !== "undefined" ? window : this);
