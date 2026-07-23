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

    // GTM containers live in aGTM.c.gtm as an object keyed by container id.
    var containers = [];
    if (c.gtm && typeof c.gtm === "object") {
      for (var id in c.gtm) {
        if (Object.prototype.hasOwnProperty.call(c.gtm, id)) {
          var g = c.gtm[id] || {};
          containers.push({
            id: id,
            noConsent: !!g.noConsent,
            hasLoaded: !!g.hasLoaded
          });
        }
      }
    }

    var session = d.session || {};

    return clone({
      loaded: true,
      version: typeof d.version !== "undefined" ? d.version : null,
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
      config: c,
      dl: tail(d.dl || [], 50),
      queue: tail(d.f || [], 50),
      queueLen: (d.f || []).length,
      log: tail(l || [], 100),
      session: {
        source: session.source || "",
        sid: session.sid || "",
        uid: session.uid || "",
        raw: session
      },
      attribution: d.attribution || {}
    }) || { loaded: false, error: "clone failed" };
  } catch (e) {
    return { loaded: false, error: String(e) };
  }
})()
