/**
 * aGTM Inspector — network classification (pure logic).
 *
 * Extracted so it can be unit-tested in Node (test/devtools/netclassify.test.js)
 * AND loaded as a browser global by panel.html. No DOM / chrome APIs here.
 */
(function (root) {
  "use strict";

  function hostOf(u) { try { return new URL(u).host; } catch (e) { return ""; } }

  /**
   * Learn the sGTM/Client scope (host + dirname prefixes) from the /aGTM* requests
   * seen on the wire plus consent_store_url / transport_url from the live config.
   * Returns { "host": { "/prefix/": true, ... }, ... }.
   */
  function sgtmScope(entries, cfg) {
    var scope = {};
    function add(u) {
      if (!u) return;
      try {
        var x = new URL(u);
        var dir = x.pathname.replace(/[^\/]*$/, ""); // dirname incl. trailing slash
        if (!scope[x.host]) scope[x.host] = {};
        scope[x.host][dir] = true;
      } catch (e) { /* ignore */ }
    }
    (entries || []).forEach(function (e) { if (e && /\/aGTM(\.js|consent|sources)(\?|$)/.test(e.url)) add(e.url); });
    if (cfg) { add(cfg.consent_store_url); add(cfg.transport_url); }
    return scope;
  }

  /**
   * True if `url` belongs to the sGTM scope. A host that DIFFERS from the inspected
   * page's host is treated as a dedicated sGTM domain (e.g. sgtm.example.com, incl.
   * root-hosted) → any path counts. A host EQUAL to the page host (reverse-proxy /
   * first-party) requires a non-root shared path prefix, so ordinary first-party
   * traffic isn't swept in. Unknown pageHost falls back to the prefix rule (safe).
   */
  function inSgtmScope(url, scope, pageHost) {
    try {
      var x = new URL(url);
      var byHost = scope[x.host];
      if (!byHost) return false;
      if (pageHost && x.host !== pageHost) return true; // dedicated sGTM host → any path
      for (var pre in byHost) {
        if (!Object.prototype.hasOwnProperty.call(byHost, pre)) continue;
        if (pre && pre !== "/" && x.pathname.indexOf(pre) === 0) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  // Google measurement/collect endpoints that are unambiguous by PATH alone — `/g/collect`
  // and `/mp/collect` are GA4/Ads-specific and don't appear on unrelated hosts. The bare
  // legacy `/collect` (Universal Analytics) is NOT here: it is too generic on its own and
  // is gated on a google-analytics host below (F-60).
  function isGaCollect(url) {
    if (/\/(g|mp)\/collect(\?|$)/.test(url)) return true;
    if (/(^|\.)google-analytics\.com/.test(hostOf(url)) && /\/collect(\?|$)/.test(url)) return true;
    return false;
  }

  function classify(url, scope, pageHost) {
    if (/\/aGTMconsent(\b|\/|\?|$)/.test(url)) return { key: "consent-store", cls: "acc" };
    if (/\/aGTMsources(\b|\/|\?|$)/.test(url)) return { key: "sources", cls: "acc" };
    if (/\/aGTM\.js(\?|$)/.test(url)) return { key: "aGTM.js", cls: "acc" };
    if (/\/tp\/sources(\b|\/|\?|$)/.test(url)) return { key: "sources-api", cls: "acc" };
    // F-60: gtm.js / gtag.js only from googletagmanager (the canonical Google host); a
    // reverse-proxied gtm.js on the customer's sGTM host is caught by the sGTM-scope block
    // below. A bare `…/gtm.js` on a random foreign host is no longer mislabelled.
    if (/googletagmanager\.com\/gtm\.js/.test(url)) return { key: "gtm.js", cls: "ok" };
    if (/googletagmanager\.com\/gtag\/js/.test(url)) return { key: "gtag.js", cls: "ok" };
    if (isGaCollect(url)) return { key: "ga-collect", cls: "warn" };
    // Within the learned sGTM scope, sub-classify: reverse-proxied gtm.js/gtag.js/collect
    // (served from the customer's own sGTM host), the aEvents endpoint (…/ae), the sGTM
    // first-party service-worker bootstrap (/_/service_worker/…), else generic sGTM.
    if (inSgtmScope(url, scope, pageHost)) {
      if (/\/_\/service_worker\//.test(url)) return { key: "sGTM SW", cls: "ok" };
      if (/\/ae(vents)?(\?|$)/.test(url)) return { key: "aEvents", cls: "acc" };
      if (/\/gtm\.js(\?|$)/.test(url)) return { key: "gtm.js", cls: "ok" };
      if (/\/gtag\/js(\?|$)/.test(url)) return { key: "gtag.js", cls: "ok" };
      if (/\/(g|mp)?\/?collect(\?|$)/.test(url)) return { key: "ga-collect", cls: "warn" };
      return { key: "sGTM", cls: "acc" };
    }
    return null;
  }

  // Known third-party analytics / advertising trackers, keyed by a host regex. Used by the
  // pre-consent leak detector: any of these firing before consent is a red flag (aGTM's
  // whole job is to hold tracking until consent). Google endpoints are handled by classify()
  // above (gtm.js / gtag.js / ga-collect) so they're intentionally not repeated here.
  var TRACKERS = [
    { re: /(^|\.)doubleclick\.net$/, vendor: "Google Ads (DoubleClick)" },
    { re: /(^|\.)googleadservices\.com$/, vendor: "Google Ads" },
    { re: /(^|\.)googlesyndication\.com$/, vendor: "Google Ads" },
    { re: /(^|\.)connect\.facebook\.net$/, vendor: "Meta Pixel" },
    { re: /(^|\.)facebook\.com$/, vendor: "Meta Pixel" },
    { re: /(^|\.)analytics\.tiktok\.com$/, vendor: "TikTok" },
    { re: /(^|\.)bat\.bing\.com$/, vendor: "Microsoft UET" },
    // ID Sync for Microsoft's Conversions API. Microsoft's own docs require it
    // to run CLIENT-side (a server call cannot see the browser context it
    // needs) and to fire at least once per session, so it is a third-party
    // pixel on a site that may otherwise look purely server-side.
    { re: /(^|\.)c\.bing\.com$/, vendor: "Microsoft UET (ID Sync)" },
    { re: /(^|\.)clarity\.ms$/, vendor: "Microsoft Clarity" },
    { re: /(^|\.)ads\.linkedin\.com$/, vendor: "LinkedIn" },
    { re: /(^|\.)snap\.licdn\.com$/, vendor: "LinkedIn" },
    { re: /(^|\.)tr\.snapchat\.com$/, vendor: "Snapchat" },
    { re: /(^|\.)sc-static\.net$/, vendor: "Snapchat" },
    { re: /(^|\.)ct\.pinterest\.com$/, vendor: "Pinterest" },
    { re: /(^|\.)s\.pinimg\.com$/, vendor: "Pinterest" },
    { re: /(^|\.)static\.criteo\.net$/, vendor: "Criteo" },
    { re: /(^|\.)bidder\.criteo\.com$/, vendor: "Criteo" },
    { re: /(^|\.)static\.ads-twitter\.com$/, vendor: "X / Twitter" },
    { re: /(^|\.)analytics\.twitter\.com$/, vendor: "X / Twitter" },
    { re: /(^|\.)hotjar\.com$/, vendor: "Hotjar" },
    { re: /(^|\.)cdn\.amplitude\.com$/, vendor: "Amplitude" },
    { re: /(^|\.)script\.hotjar\.com$/, vendor: "Hotjar" }
  ];
  // Returns {vendor} for a known non-Google tracker host, else null.
  function trackerInfo(url) {
    var host = hostOf(url);
    if (!host) return null;
    for (var i = 0; i < TRACKERS.length; i++) {
      if (TRACKERS[i].re.test(host)) return { vendor: TRACKERS[i].vendor };
    }
    return null;
  }

  // aGTM infra requests that legitimately fire before consent (never a leak).
  var INFRA_KEYS = { "aGTM.js": 1, "consent-store": 1, "sources": 1, "sources-api": 1, "aEvents": 1, "sGTM": 1, "sGTM SW": 1 };
  /**
   * Is this request a tracking/marketing hit (so firing it pre-consent would be a leak)?
   * Returns {vendor} or null. `cls` is the classify() result (may be null). Google tags
   * (gtm.js/gtag.js/ga-collect) count; aGTM's own infra does NOT.
   */
  function trackingHit(url, cls) {
    if (cls) {
      if (INFRA_KEYS[cls.key]) return null;
      if (cls.key === "gtm.js" || cls.key === "gtag.js") return { vendor: "Google Tag Manager" };
      if (cls.key === "ga-collect") return { vendor: "Google Analytics" };
    }
    return trackerInfo(url);
  }

  var api = { hostOf: hostOf, sgtmScope: sgtmScope, inSgtmScope: inSgtmScope, classify: classify, trackerInfo: trackerInfo, trackingHit: trackingHit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.aGTMInspectorNet = api;
})(typeof window !== "undefined" ? window : this);
