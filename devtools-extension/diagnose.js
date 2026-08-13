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

    // 2b) Consent condition configured at all. This is the reason behind the most
    //     confusing symptom there is: the visitor accepts everything and GTM still
    //     never loads. Since v1.5 an empty gtmPurposes/gtmServices/gtmVendors is
    //     fail-closed (F-167) — and the sGTM Client ships that table EMPTY, so it
    //     is the delivered default, not an edge case. Without this line the
    //     "GTM injiziert" check below says "Wartet auf Consent", which is true and
    //     useless: the wait never ends.
    checks.push(consentGateStatus(snap));

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

    // 6) Bot check — only when the Client actually sent a verdict, so pages
    //    without the feature read exactly as before.
    var botCheck = botCheckStatus(snap);
    if (botCheck) checks.push(botCheck);

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

    // Bot-check verdict — belongs in a hand-off report: "auffällig, aber
    // durchgelassen" is exactly the kind of thing a client should see in
    // writing rather than only in a live panel. Omitted entirely when the
    // Client sent no verdict, so a report from a page without the check reads
    // no differently than before.
    var bs = botSummary(snap.bot);
    if (bs.state !== "absent") {
      out.push("## Bot-Check");
      out.push("");
      // Provenance line, not decoration: this verdict is about the machine that
      // generated the report — the consultant's IP, UA and ASN — not about the
      // site's traffic. In a document headed "Seite: shop.example.com" an
      // `asn_spam` line reads as a finding about the customer unless it says so.
      out.push("> Urteil über **den Rechner, der diesen Report erzeugt hat** (dessen IP/User-Agent/ASN) — *keine* Aussage über den Verkehr der Seite.");
      out.push("");
      out.push("- **Urteil:** " + longVal(bs.label));
      if (bs.mode) out.push("- **Modus:** " + longVal(bs.mode) + (bs.mode === "mark" ? " (meldet nur, blockt nicht)" : " (blockt erkannte Bots)"));
      out.push("- **score:** " + (bs.score === null ? "—" : String(bs.score)));
      out.push("- **band:** " + longVal(bs.band));
      out.push("- **primarySignal:** " + longVal(bs.primary));
      if (bs.signals.length) {
        out.push("");
        out.push("| category | type | score | confirmed |");
        out.push("| --- | --- | --- | --- |");
        for (var bi = 0; bi < bs.signals.length; bi++) {
          var sg = bs.signals[bi] || {};
          out.push("| " + longVal(sg.category) + " | " + longVal(sg.type) + " | " +
            (typeof sg.score === "number" ? String(sg.score) : "—") + " | " +
            (sg.confirmed === true ? "ja" : "—") + " |");
        }
      }
      out.push("");
      out.push("> " + bs.note);
      out.push("");
    }

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
      bot: (function () {
        var b = botSummary(snap.bot);
        // Same caveat as the Markdown section: this describes the machine that
        // generated the report, not the site's traffic. A JSON consumer has no
        // prose around it, so the field has to carry it.
        b.provenance = "Verdict about the machine that generated this report (its IP/user-agent/ASN), not about the site's traffic.";
        return b;
      })(),
      timeline: tl.ok ? tl.rows.map(function (r) { return { key: r.key, label: r.label, relMs: r.rel }; }) : [],
      leaks: arr(ctx.leaks).map(function (l) { return { vendor: l.vendor, url: l.url }; }),
      traps: arr(ctx.traps).map(function (t) { return { key: t.key, msg: t.msg }; }),
      containers: arr(snap.containers)
    }, null, 2);
  }

  /**
   * Classify the sGTM Client's bot-check verdict (aGTM.d.bot) for display.
   *
   * Under the Client's `block` mode the verdict only ever reaches a NON-blocked
   * visitor: a definitive bot is answered with HTTP 403 and never receives the
   * library. Under `mark` nothing is blocked, so `isBot: true` is the configured
   * state there — the `mode` field the Client sends along tells the two apart,
   * and calling the second case a malfunction would put a fault claim about a
   * correctly configured system into the exported customer report.
   *
   * `band === "unknown"` is the Client's own "no usable verdict" sentinel
   * (filter down, unusable answer, or client IP unresolvable — `reason` says
   * which). It must never read as "clean".
   *
   * @param bot aGTM.d.bot, may be {} / undefined
   * @returns {{state:string, level:string, label:string, note:string,
   *            score:(number|null), band:string, primary:string, mode:string,
   *            reason:string, signals:Array}}
   *          state: "absent" | "clean" | "scored" | "unknown" | "drift" | "bot"
   */
  function hasOtherSignal(signals) {
    for (var i = 0; i < signals.length; i++) {
      var sg = signals[i] || {};
      if (sg.type === "other" || sg.category === "other") return true;
    }
    return false;
  }

  function botSummary(bot) {
    bot = (bot && typeof bot === "object") ? bot : {};
    var has = typeof bot.isBot === "boolean";
    var score = typeof bot.score === "number" ? bot.score : null;
    var band = typeof bot.band === "string" ? bot.band : "";
    var primary = typeof bot.primarySignal === "string" ? bot.primarySignal : "";
    var mode = (bot.mode === "mark" || bot.mode === "block") ? bot.mode : "";
    // Explicit comparisons, not a lookup: a bare `REASONS[bot.reason]` walks the
    // prototype chain, so "toString"/"constructor" come back truthy and a
    // page-supplied string ends up verbatim in the exported customer report
    // (a multi-line native-code dump, in the case of toString). Same class the
    // Client guards against with `allowed[v] === 1`; `mode` two lines up already
    // does it right, and the inconsistency inside one function is the defect.
    var reason = (bot.reason === "no_answer" || bot.reason === "bad_answer" || bot.reason === "no_client_ip") ? bot.reason : "";
    var signals = arr(bot.signals);
    var base = { score: score, band: band, primary: primary, mode: mode, reason: reason, signals: signals };
    function out(state, level, label, note) {
      return { state: state, level: level, label: label, note: note,
        score: base.score, band: base.band, primary: base.primary, mode: base.mode,
        reason: base.reason, signals: base.signals };
    }
    function reasonText() {
      if (base.reason === "no_answer") return " Ursache laut Client: Filter hat nicht geantwortet.";
      if (base.reason === "bad_answer") return " Ursache laut Client: Filter-Antwort unbrauchbar.";
      if (base.reason === "no_client_ip") return " Ursache laut Client: Client-IP nicht auflösbar.";
      return "";
    }
    if (!has) {
      // Literals, not the collected values: without a boolean isBot there is no
      // verdict, so echoing a score/band/mode a page happened to set would put
      // invented numbers into the report (the Client itself never sends a
      // partial object — buildAndSend gates on the boolean).
      return { state: "absent", level: "info", label: "kein Urteil",
        score: null, band: "", primary: "", mode: "", reason: "", signals: [],
        note: "Der Bot-Check ist im sGTM Client aus, hat nicht geantwortet, oder der Client ist älter als v1.5." };
    }
    // The Client sets band 'unknown' when the filter answered unusably or not at
    // all. Without this branch it fell through to "unauffällig / kein Signal" —
    // an outage rendered green, in the panel AND in the exported report.
    if (band === "unknown") {
      return out("unknown", "warn", "kein verwertbares Urteil",
        "Der Bot-Check hat nicht (verwertbar) geantwortet." + reasonText() + " Das ist NICHT dasselbe wie „unauffällig\": eine traffic_type-Variable, die nur auf band==='bot' prüft, meldet in diesem Zustand stumm „regular\" für den gesamten Traffic.");
    }
    // A value the Client did not recognise. Without this branch a drifted
    // vocabulary reads as "unauffällig" in the panel AND in the exported report
    // — the server log would be shouting while every browser surface stayed
    // green. It also restores the old behaviour for a service-sent `unknown`,
    // which used to warn and would otherwise now pass (`unknown` left the band
    // whitelist, so it arrives here as `other`).
    if (base.band === "other" || base.primary === "other" || hasOtherSignal(signals)) {
      return out("drift", "warn", "unbekannter Wert vom Filter-Dienst",
        "Der Bot-Check hat einen Wert geliefert, den der sGTM Client nicht kennt — er wurde zu „other\" zusammengefaltet. Das heißt: der api4filter-Vertrag hat sich bewegt und die Vokabular-Tabellen im Client sind veraltet. Der Server-Log nennt den konkreten Wert.");
    }
    if (bot.isBot === true) {
      // Under `mark` this is the configured, intended state — not a
      // contradiction. Saying otherwise reported the correct operation of a
      // deliberate mode as a misconfiguration, in a document meant for clients.
      return mode === "mark"
        ? out("bot", "warn", "als Bot eingestuft — nicht geblockt (Modus „mark\")",
            "Der Client läuft im Modus „mark\": er meldet das Urteil und blockt nicht. Unter „block\" hätte dieser Besucher 403 bekommen und gar keine Library.")
        : out("bot", "warn", "als Bot eingestuft",
            "Widerspruch: unter „block\" bekommt ein erkannter Bot 403 und gar keine Library. Dass dieses Urteil im Browser steht, heißt entweder, der Client lief im Modus „mark\" (dann fehlt hier nur das mode-Feld eines älteren Client-Builds), oder er hat trotz eigenem Urteil ausgeliefert.");
    }
    if ((score !== null && score > 0) || primary || signals.length) {
      return out("scored", "info", "auffällig, aber durchgelassen",
        "Zusatzsignale blocken nie selbst. Ob daraus etwas folgt (z. B. eine traffic_type-Dimension), entscheidet webGTM.");
    }
    return out("clean", "ok", "unauffällig", "Kein Signal ausgelöst.");
  }

  // Health check for the bot check — the mode is otherwise invisible. `mark`
  // looks exactly like `block` until a bot shows up, so a filter left switched
  // off after a rollout measurement would never be noticed again.
  /**
   * "Is the library at least version maj.min?" — answered from aGTM.d.version,
   * which is a display string ("1.5", "1.6-pre", "1.4.1"). Only the leading two
   * numbers are compared; a suffix like "-pre" is ignored. Returns null when the
   * string carries no parsable version, so the caller can say "not determinable"
   * instead of assuming one of the two opposite behaviours.
   */
  function atLeastVersion(v, maj, min) {
    if (typeof v !== "string" && typeof v !== "number") return null;
    var m = String(v).match(/^\s*(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    var a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : 0;
    if (a !== maj) return a > maj;
    return b >= min;
  }

  /**
   * The consent-condition gate, mirroring aGTM.f.run_cc exactly:
   *   noGate       = cmp === 'none' || (iframeSupport && is_iframe)
   *   noConditions = !gtmPurposes && !gtmServices && !gtmVendors
   *   noConditions && !noGate && !allowEmptyConsentConditions  →  gtmConsent = false
   * Reproduced rather than inferred from gtmConsent, because the point is to name
   * the CAUSE while the symptom ("GTM lädt nicht") is still ambiguous.
   */
  function consentGateStatus(snap) {
    snap = snap || {};
    var cfg = snap.config;
    var label = "Consent-Bedingung";
    // A config that failed to serialise (F-56 sentinel) reads as "all three empty"
    // — which is exactly the accusation this check makes. Refuse to make it.
    if (!cfg || typeof cfg !== "object" || cfg.__unserializable) {
      return { key: "gate", label: label, status: "na",
        detail: "aGTM.c nicht lesbar — Bedingungen nicht prüfbar." };
    }
    var have = [];
    if (cfg.gtmPurposes) have.push("gtmPurposes");
    if (cfg.gtmServices) have.push("gtmServices");
    if (cfg.gtmVendors) have.push("gtmVendors");
    if (have.length) {
      return { key: "gate", label: label, status: "pass",
        detail: "konfiguriert über " + have.join(" + ") };
    }
    // From here on: all three empty.
    if (snap.cmp === "none") {
      return { key: "gate", label: label, status: "na",
        detail: "cmp:'none' — die Library gated hier bewusst nicht (siehe „Consent-Mechanismus\")." };
    }
    if (cfg.iframeSupport && snap.isIframe) {
      return { key: "gate", label: label, status: "na",
        detail: "iFrame-Modus — die Library gated hier bewusst nicht." };
    }
    if (cfg.allowEmptyConsentConditions) {
      return { key: "gate", label: label, status: "warn",
        detail: "Keine Bedingung konfiguriert, aber allowEmptyConsentConditions:true — GTM lädt für JEDEN, auch nach „Alle ablehnen\". Nur korrekt, wenn das die Absicht ist." };
    }
    var v15 = atLeastVersion(snap.version, 1, 5);
    if (v15 === true) {
      return { key: "gate", label: label, status: "fail",
        detail: "gtmPurposes/gtmServices/gtmVendors sind ALLE leer — seit v1.5 fail-closed: gtmConsent bleibt false, GTM lädt nie. Bedingung eintragen (im sGTM Client die Tabelle „Consent\") oder bewusst allowEmptyConsentConditions:true setzen." };
    }
    if (v15 === false) {
      return { key: "gate", label: label, status: "fail",
        detail: "gtmPurposes/gtmServices/gtmVendors sind ALLE leer, und diese Library (v" + snap.version + ") ist älter als v1.5 — dort ist eine leere Bedingung fail-OPEN: GTM lädt für jeden, auch nach „Alle ablehnen\". Bedingung eintragen oder Library aktualisieren." };
    }
    return { key: "gate", label: label, status: "warn",
      detail: "gtmPurposes/gtmServices/gtmVendors sind ALLE leer. Welche Wirkung das hat, hängt an der Library-Version (ab v1.5 lädt GTM nie, davor für jeden) — aGTM.d.version ist hier nicht auswertbar." };
  }

  function botCheckStatus(snap) {
    var b = botSummary((snap || {}).bot);
    if (b.state === "absent") return null;
    var mark = b.mode === "mark";
    // ORDER MATTERS. Checking `mark` first hid the outage and the bot verdict
    // for every mark user — i.e. for the only setup that has the mode switched
    // on at all. The severe finding wins; the mode is appended to it.
    var markNote = mark ? " Modus „mark\" — es wird nichts geblockt." : "";
    if (b.state === "drift") {
      return { key: "bot", label: "Bot-Check", status: "warn",
        detail: "Unbekannter Wert vom Filter-Dienst (zu „other\" gefaltet) — die Vokabular-Tabellen im sGTM Client sind veraltet." + markNote };
    }
    if (b.state === "unknown") {
      return { key: "bot", label: "Bot-Check", status: "warn",
        detail: "Kein verwertbares Urteil — Filter-Ausfall oder Timeout." + markNote };
    }
    if (b.state === "bot") {
      return { key: "bot", label: "Bot-Check", status: "warn",
        detail: mark
          ? "Als Bot eingestuft, im Modus „mark\" bewusst ausgeliefert."
          : "Als Bot eingestuft, aber ausgeliefert." };
    }
    if (mark) {
      // `na`, not `warn`: `mark` is a CHOSEN configuration that runs for weeks
      // by design. Dragging every exported report to WARN for that long would
      // wear the overall status out, and the next reader would skim past a real
      // pre-consent leak. The line stays visible in the list, which is the
      // point — it just does not colour the whole document.
      return { key: "bot", label: "Bot-Check", status: "na",
        detail: "Modus „mark\" — der Filter meldet nur und blockt NICHTS. Für eine Messphase korrekt, als Dauerzustand nicht." };
    }
    if (b.state === "scored") {
      return { key: "bot", label: "Bot-Check", status: "pass",
        detail: "auffällig (" + (b.primary || "Signal") + "), durchgelassen — Markierung in webGTM möglich" };
    }
    return { key: "bot", label: "Bot-Check", status: "pass", detail: "unauffällig" };
  }

  var api = {
    botSummary: botSummary,
    botCheckStatus: botCheckStatus,
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
