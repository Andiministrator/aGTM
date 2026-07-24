/**
 * aGTM Inspector — page-context reader.
 *
 * This whole file is ONE self-invoking expression. panel.js fetches its text and
 * hands it to chrome.devtools.inspectedWindow.eval(), so it runs in the context of
 * the inspected page and returns a JSON-serialisable snapshot of window.aGTM.
 *
 * It is strictly READ-ONLY — it never writes to the page. Everything is wrapped in
 * try/catch and JSON round-trips (which drop functions) so a half-initialised or
 * absent aGTM never throws in the panel.
 *
 * ES5-safe on purpose (runs in whatever the page supports); do not use ES6 here.
 */
(function () {
  try {
    var w = window;
    if (!w.aGTM || !w.aGTM.d) return { loaded: false };
    var A = w.aGTM, d = A.d || {}, c = A.c || {}, l = A.l || [];

    function clone(x) {
      try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; }
    }
    function tail(arr, n) {
      if (!arr || !arr.length) return [];
      return arr.slice(Math.max(0, arr.length - n));
    }
    // Per-entry defensive clone for aGTM.l[].obj. F-55 lesson: cloning the whole
    // log at once would let ONE non-serialisable logged object (cycle / DOM node)
    // fail the entire-snapshot clone → {loaded:false}. So each obj is cloned in
    // its own try/catch; a bad one degrades to a sentinel instead of the snapshot.
    function safeObj(o) {
      if (typeof o === "undefined" || o === null) return null;
      try { return JSON.parse(JSON.stringify(o)); }
      catch (e) { return { __unserializable: true }; }
    }

    // GTM containers live in aGTM.c.gtm as an object keyed by container id.
    var containers = [];
    if (c.gtm && typeof c.gtm === "object") {
      for (var id in c.gtm) {
        if (Object.prototype.hasOwnProperty.call(c.gtm, id)) {
          var g = c.gtm[id] || {};
          containers.push({
            id: id,
            noConsent: !!g.noConsent,
            hasLoaded: !!g.hasLoaded,
            // Custom load domain (sGTM / server-side) vs. default google gtm.js;
            // inline = GTM code base64-embedded (g.gtmJS) instead of a src URL.
            url: typeof g.gtmURL === "string" ? g.gtmURL : "",
            env: typeof g.env === "string" ? g.env : "",
            inline: !!g.gtmJS,
            idParam: typeof g.idParam === "string" ? g.idParam : ""
          });
        }
      }
    }

    var session = d.session || {};

    // Live dataLayer length (window[gdl]) — evidence of how much GTM has actually seen.
    var gdlName = c.gdl || "dataLayer";
    var dlArr = w[gdlName];
    var hasDL = dlArr && typeof dlArr.length === "number";
    var dataLayerLen = hasDL ? dlArr.length : null;
    // A per-entry cloned tail of the real dataLayer for the dataLayer tab. safeObj
    // keeps one non-serialisable push from failing the whole snapshot.
    var dataLayerSample = hasDL ? tail(dlArr, 150).map(safeObj) : [];

    // Optional external session object (e.g. victors.de exposes window.se_data). Used
    // as a Session-tab fallback / cross-check when aGTM.d.session is empty. Read-only.
    var seData = (typeof w.se_data !== "undefined") ? safeObj(w.se_data) : null;

    // Google Consent Mode state — GTM/Google-Tag keeps it in google_tag_data.ics.entries,
    // one entry per category with default/update/implicit booleans. The panel derives the
    // effective status (update > default > implicit). Read-only, best-effort.
    var gcm = null;
    try {
      var ics = w.google_tag_data && w.google_tag_data.ics;
      if (ics && ics.entries && typeof ics.entries === "object") {
        gcm = {};
        for (var cat in ics.entries) {
          if (!Object.prototype.hasOwnProperty.call(ics.entries, cat)) continue;
          var en = ics.entries[cat] || {};
          gcm[cat] = {
            "declare": typeof en["declare"] === "boolean" ? en["declare"] : null,
            "default": typeof en["default"] === "boolean" ? en["default"] : null,
            update: typeof en.update === "boolean" ? en.update : null,
            implicit: typeof en.implicit === "boolean" ? en.implicit : null,
            region: typeof en.region === "string" ? en.region : ""
          };
        }
      }
    } catch (e4b) { /* ignore — GCM object is optional */ }

    // Consent commands pushed via gtag('consent','default'|'update'|'declare',{…}) land in
    // the dataLayer as arguments objects. Captured in ORDER over the full dataLayer (not the
    // tail) so the panel can show the declare/implicit → default → update sequence.
    var consentCommands = [];
    try {
      if (hasDL) {
        for (var ci = 0; ci < dlArr.length; ci++) {
          var arg = dlArr[ci];
          if (arg && arg[0] === "consent" && typeof arg[1] === "string") {
            consentCommands.push({ type: arg[1], payload: safeObj(arg[2]), index: ci });
          }
        }
      }
    } catch (e5) { /* ignore */ }

    // Timestamp of the last consent-related aGTM event (when consent last changed).
    var consentTs = 0;
    try {
      var dld = d.dl || [];
      for (var di = dld.length - 1; di >= 0; di--) {
        var de = dld[di] || {};
        if (typeof de.event === "string" && /consent/i.test(de.event) && de.aGTMts) { consentTs = de.aGTMts; break; }
      }
    } catch (e6) { /* ignore */ }

    // Runtime presence of non-Google consent frameworks / vendor pixels — the panel maps
    // each to the consent signal it expects (see knowledge/consent/12-…). Presence only
    // (TCF/GPP actual data are async APIs, not sync-readable here).
    function present(name) { try { return typeof w[name] !== "undefined" && w[name] !== null; } catch (ev) { return false; } }
    function getCookie(name) {
      try {
        var re = new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)");
        var m = (w.document && w.document.cookie || "").match(re);
        return m ? decodeURIComponent(m[1]) : "";
      } catch (ev) { return ""; }
    }
    // Synchronously-readable consent STATE (read-only). TCF/GPP/USP live values come
    // via async APIs we must not drive from a read-only reader, but their strings are
    // usually mirrored into first-party cookies; GPC is a sync navigator flag.
    var vendorState = {
      gpc: (w.navigator && typeof w.navigator.globalPrivacyControl !== "undefined") ? !!w.navigator.globalPrivacyControl : null,
      tcString: getCookie("euconsent-v2"),
      usp: getCookie("usprivacy"),
      amazon: getCookie("amzn_consent"),
      // Microsoft UET exposes a readable consent state (unlike Meta/TikTok/Clarity).
      uetConfig: (function () {
        try {
          var u = w.uetq && w.uetq.uetConfig && w.uetq.uetConfig.consent;
          if (!u) return null;
          return {
            adStorage: typeof u.adStorageAllowed === "boolean" ? u.adStorageAllowed : null,
            enabled: !!u.enabled,
            enforced: !!u.enforced,
            tcf: !!(w.uetq.uetConfig.tcf && w.uetq.uetConfig.tcf.enabled)
          };
        } catch (ev) { return null; }
      })(),
      // Per-vendor tracking cookies — presence means the pixel has fired (i.e. ran
      // post-consent). A pragmatic "state" proxy for vendors with no readable consent API.
      cookies: {
        meta: getCookie("_fbp"),
        tiktok: getCookie("_ttp"),
        pinterest: getCookie("_pin_unauth"),
        criteo: getCookie("cto_bundle"),
        uet: getCookie("_uetvid"),
        linkedin: getCookie("li_fat_id") || getCookie("li_sugr"),
        snap: getCookie("_scid"),
        twitter: getCookie("personalization_id")
      }
    };
    var vendors = {
      tcf: typeof w.__tcfapi === "function",
      gpp: typeof w.__gpp === "function",
      usp: typeof w.__uspapi === "function",
      gpc: !!(w.navigator && w.navigator.globalPrivacyControl),
      meta: present("fbq"),
      uet: present("uetq"),
      tiktok: present("ttq"),
      linkedin: present("lintrk") || present("_linkedin_data_partner_ids"),
      pinterest: present("pintrk"),
      amazon: present("amzn"),
      criteo: present("criteo_q"),
      snap: present("snaptr"),
      twitter: present("twq")
    };

    // Real GTM <script> tags injected by aGTM (id="aGTM_tm_<container>"). Proves the
    // injection reached the DOM and reveals the load domain (google vs. custom / sGTM).
    var gtmScripts = [];
    try {
      var tags = (w.document && w.document.querySelectorAll)
        ? w.document.querySelectorAll('script[id^="aGTM_tm_"]') : [];
      for (var si = 0; si < tags.length; si++) {
        var src = tags[si].src || "";
        var host = "";
        if (src) { try { host = (new URL(src)).host; } catch (e2) { host = ""; } }
        gtmScripts.push({ id: tags[si].id || "", host: host, inline: !src });
      }
    } catch (e3) { /* ignore — DOM query is best-effort */ }

    return clone({
      loaded: true,
      version: typeof d.version !== "undefined" ? d.version : null,
      // Host of the inspected page — lets the panel tell a dedicated sGTM domain
      // (host !== pageHost, any path is relevant) from a same-host reverse-proxy
      // (require a sub-path prefix, so first-party traffic isn't swept in).
      pageHost: (typeof location !== "undefined" && location && location.host) ? location.host : "",
      ts: (new Date()).getTime(),
      init: !!d.init,
      cmp: typeof c.cmp === "string" ? c.cmp : "",
      // The sGTM Client wires a CMP by injecting aGTM.f.consent_check INLINE (the
      // embedded code from its "Used CMP" SELECT) and leaves aGTM.c.cmp empty — the
      // library then uses that pre-injected check via consent_listener(). So an empty
      // cmp with a present consent_check is normal, not a misconfiguration.
      hasConsentCheck: !!(A.f && typeof A.f.consent_check === "function"),
      consentEvents: (c.consent_events && typeof c.consent_events === "string") ? c.consent_events : "",
      useListener: !!c.useListener,
      gdl: c.gdl || "",
      gtmID: c.gtmID || "",
      consent: d.consent || {},
      session_status: d.session_status || "",
      consent_hash: d.consent_hash || "",
      last_consent_hash: d.last_consent_hash || "",
      containers: containers,
      gtmLoaded: d.gtmLoaded || [],
      dataLayerLen: dataLayerLen,
      dataLayerSample: dataLayerSample,
      dataLayerBase: hasDL ? Math.max(0, dlArr.length - 150) : 0,
      gtmScripts: gtmScripts,
      config: c,
      dl: tail(d.dl || [], 50),
      queue: tail(d.f || [], 50),
      queueLen: (d.f || []).length,
      // {id, timestamp, obj} — obj is cloned PER ENTRY via safeObj() so one
      // non-serialisable logged object (cycle / DOM node) degrades to a sentinel
      // ({__unserializable:true}) instead of failing the whole-snapshot clone → {loaded:false}.
      // The panel shows obj.event ("at which event") and an expandable full view.
      log: tail(l || [], 100).map(function (e) {
        e = e || {};
        return { id: e.id, timestamp: e.timestamp, obj: safeObj(e.obj) };
      }),
      session: {
        source: session.source || "",
        sid: session.sid || "",
        uid: session.uid || "",
        raw: session
      },
      seData: seData,
      gcm: gcm,
      consentCommands: consentCommands,
      consentTs: consentTs,
      vendors: vendors,
      vendorState: vendorState,
      attribution: d.attribution || {}
    }) || { loaded: false, error: "clone failed" };
  } catch (e) {
    return { loaded: false, error: String(e) };
  }
})()
