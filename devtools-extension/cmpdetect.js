/**
 * aGTM Inspector — CMP detection (pure logic + page-probe builder).
 *
 * Answers "which consent tool is actually running on this page?" — independently of
 * aGTM. `aGTM.c.cmp` only says which adapter was CONFIGURED, and when the library is
 * served by the sGTM Client that field is empty by design (the consent_check is
 * injected inline). So the Consent tab could never name the CMP in exactly the setup
 * where naming it matters most.
 *
 * Every signature below is derived from OUR OWN `cmp/cc_<name>.js` adapters — the first
 * guard of each consent_check is precisely a "is this CMP present and usable" probe.
 * Nothing here is guessed from outside knowledge: a CMP we do not have an adapter for is
 * not in this table, and an adapter whose CMP cannot be identified from its guard is
 * listed in UNDETECTABLE with the reason instead of being matched on a weak signal.
 * `test/devtools/cmpdetect.test.js` holds a drift guard over `cmp/` for exactly this.
 *
 * Two halves, deliberately split:
 *   • buildProbeCode() returns a self-contained expression that panel.js evaluates in
 *     the page. It probes ONLY the names this table needs — no window enumeration —
 *     and it is READ-ONLY (same posture as reader.js; the write channel is sim.js).
 *     It collects EXISTENCE / typeof only, never cookie or storage VALUES: this runs
 *     before any consent decision and a consent cookie's value is user data.
 *   • detect(evidence) is a pure matcher over that evidence — unit-tested, no DOM.
 *
 * ES5-safe: buildProbeCode's output runs in whatever the inspected page supports.
 */
(function (root) {
  "use strict";

  // ── condition vocabulary ────────────────────────────────────────────────────
  //   {g:'a.b', t:'function'}  global path, required typeof ('null' for a null value)
  //   {c:'name'}               cookie present (existence only)
  //   {ls:'key'} / {ss:'key'}  local-/sessionStorage key present
  //   {lsp:'prefix.'}          at least one localStorage key with this prefix
  //
  // A signature matches when every `need` holds and no `deny` holds. `extra` is probed
  // and reported as supporting evidence but never required — it is how a lazily-loaded
  // sub-API (Shopify.customerPrivacy) shows up without gating the match on it.

  var SIGNATURES = [
    {
      key: "borlabs2", label: "Borlabs Cookie 2", adapter: "cc_borlabs2", confidence: "strong",
      // cc_borlabs2.js branches on exactly this: getCookie() present ⇒ v2, else ⇒ v3.
      need: [{ g: "BorlabsCookie", t: "object" }, { g: "BorlabsCookie.getCookie", t: "function" }],
      extra: [{ g: "borlabsCookieConfig.cookies", t: "object" }]
    },
    {
      key: "borlabs3", label: "Borlabs Cookie 3", adapter: "cc_borlabs3", confidence: "strong",
      need: [{ g: "BorlabsCookie", t: "object" }, { g: "BorlabsCookie.Cookie", t: "object" }],
      deny: [{ g: "BorlabsCookie.getCookie", t: "function" }],
      extra: [{ g: "borlabsCookieConfig.serviceGroups", t: "object" }]
    },
    {
      key: "ccm19", label: "CCM19", adapter: "cc_ccm19", confidence: "strong",
      need: [{ g: "CCM", t: "object" }]
    },
    {
      key: "clickskeks", label: "Clickskeks", adapter: "cc_clickskeks", confidence: "strong",
      need: [{ g: "Clickskeks", t: "object" }, { g: "Clickskeks.getCurrentAllowedConfig", t: "function" }]
    },
    {
      key: "consentmanager", label: "Consentmanager (CMP)", adapter: "cc_consentmanager", confidence: "strong",
      need: [{ g: "__cmp", t: "function" }],
      extra: [{ g: "cmpmngr", t: "object" }]
    },
    {
      key: "cookiebot", label: "Cookiebot", adapter: "cc_cookiebot", confidence: "strong",
      need: [{ g: "Cookiebot", t: "object" }]
    },
    {
      key: "cookiefirst", label: "CookieFirst", adapter: "cc_cookiefirst", confidence: "strong",
      need: [{ g: "CookieFirst", t: "object" }]
    },
    {
      key: "jtl_consent", label: "JTL Consent", adapter: "cc_jtl_consent", confidence: "medium",
      // Shares localStorage['consent'] with Matomo — the sessionStorage cache is what
      // tells them apart, so this entry denies it explicitly instead of both matching.
      need: [{ ls: "consent" }],
      deny: [{ ss: "consent-cache" }]
    },
    {
      key: "jtl_eu_cookie", label: "JTL EU Cookie", adapter: "cc_jtl_eu_cookie", confidence: "strong",
      need: [{ g: "EuCookie", t: "object" }],
      extra: [{ c: "eu_cookie_store" }]
    },
    {
      key: "klaro", label: "Klaro", adapter: "cc_klaro", confidence: "strong",
      need: [{ g: "klaro", t: "object" }, { g: "klaro.getManager", t: "function" }]
    },
    {
      key: "magento_cc_cookie", label: "Magento CC Cookie", adapter: "cc_magento_cc_cookie", confidence: "medium",
      need: [{ c: "cc_cookie" }]
    },
    {
      key: "matomo", label: "Matomo CMP", adapter: "cc_matomo", confidence: "medium",
      need: [{ ls: "consent" }, { ss: "consent-cache" }]
    },
    {
      key: "onetrust_cookiepro", label: "OneTrust / CookiePro", adapter: "cc_onetrust_cookiepro", confidence: "strong",
      need: [{ g: "Optanon", t: "object" }, { g: "Optanon.GetDomainData", t: "function" }]
    },
    {
      key: "orestbida_cookieconsent", label: "Orestbida CookieConsent", adapter: "cc_orestbida_cookieconsent", confidence: "strong",
      // `cc` alone is far too generic a global name; the method is the discriminator.
      need: [{ g: "cc", t: "object" }, { g: "cc.getUserPreferences", t: "function" }]
    },
    {
      key: "perspectivefunnel", label: "Perspective Funnel", adapter: "cc_perspectivefunnel", confidence: "strong",
      need: [{ g: "perspectiveData.campaignId", t: "string" }],
      extra: [{ lsp: "perspective.tracking-preferences." }]
    },
    {
      key: "ppcm", label: "PP Consent Manager (PixelPoint)", adapter: "cc_ppcm", confidence: "strong",
      need: [{ g: "PPConsentManager", t: "object" }, { g: "PPConsentManager.hasConsentCategory", t: "function" }]
    },
    {
      key: "secure_privacy", label: "Secure Privacy", adapter: "cc_secure_privacy", confidence: "strong",
      need: [{ g: "sp", t: "function" }, { g: "sp.allGivenConsents", t: "object" }]
    },
    {
      key: "shopify_consent", label: "Shopify Consent", adapter: "cc_shopify_consent", confidence: "medium",
      // `Shopify` proves the shop platform, not that the consent API is up:
      // Shopify.customerPrivacy is loaded on demand (our adapter calls loadFeatures
      // itself). Reported as supporting evidence rather than required, so the CMP is
      // still named on a page where the API has not been pulled in yet.
      need: [{ g: "Shopify", t: "object" }],
      extra: [{ g: "Shopify.customerPrivacy", t: "object" }]
    },
    {
      key: "shopware5_cookie", label: "Shopware 5 Cookie", adapter: "cc_shopware5_cookie", confidence: "medium",
      need: [{ c: "cookiePreferences" }]
    },
    {
      key: "shopware6_cookie", label: "Shopware 6 Cookie", adapter: "cc_shopware6_cookie", confidence: "medium",
      need: [{ c: "cookie-preference" }]
    },
    {
      key: "shopware_acris_cookie", label: "Shopware Acris Cookie", adapter: "cc_shopware_acris_cookie", confidence: "medium",
      need: [{ c: "acris_cookie_acc" }],
      extra: [{ c: "acris_cookie_first_activated" }]
    },
    {
      key: "tramino", label: "Tramino", adapter: "cc_tramino", confidence: "medium",
      need: [{ ls: "consentPermission" }]
    },
    {
      key: "usercentrics", label: "Usercentrics v2", adapter: "cc_usercentrics", confidence: "strong",
      need: [{ g: "UC_UI", t: "object" }, { g: "UC_UI.getServicesBaseInfo", t: "function" }]
    },
    {
      key: "usercentrics3", label: "Usercentrics v3", adapter: "cc_usercentrics3", confidence: "strong",
      need: [{ g: "__ucCmp", t: "object" }, { g: "__ucCmp.cmpController", t: "object" }]
    }
  ];

  // Adapters that exist in cmp/ but are deliberately NOT matched, with the reason.
  // Guessing one of these would be worse than saying nothing: the panel would name a
  // CMP that is not there. The drift guard test asserts cmp/ == SIGNATURES ∪ UNDETECTABLE.
  var UNDETECTABLE = [
    {
      adapter: "cc_sourcepoint", label: "Sourcepoint",
      why: "prüft nur __tcfapi — das hat jede IAB-TCF-CMP. Der Anbieter ist daraus nicht bestimmbar."
    },
    {
      adapter: "cc_simple_cookie_regex_check", label: "Simple Cookie Regex Check",
      why: "eine Vorlage, kein Produkt: Cookiename und -Wert werden im Adapter frei konfiguriert."
    }
  ];

  // Framework APIs probed for context only — they never identify a vendor, but their
  // presence explains a "nothing detected" result on a page that clearly has a CMP.
  var FRAMEWORK_PROBES = [
    { g: "__tcfapi", t: "function", label: "IAB TCF (__tcfapi)" },
    { g: "__gpp", t: "function", label: "IAB GPP (__gpp)" },
    { g: "__uspapi", t: "function", label: "US-Privacy (__uspapi)" }
  ];

  // ── probe spec: the flat, de-duplicated name lists derived from the table ────
  function probeSpec() {
    var globals = [], cookies = [], ls = [], ss = [], lsp = [];
    function push(arr, v) { if (arr.indexOf(v) < 0) arr.push(v); }
    function take(cond) {
      if (!cond) return;
      if (cond.g) push(globals, cond.g);
      if (cond.c) push(cookies, cond.c);
      if (cond.ls) push(ls, cond.ls);
      if (cond.ss) push(ss, cond.ss);
      if (cond.lsp) push(lsp, cond.lsp);
    }
    for (var i = 0; i < SIGNATURES.length; i++) {
      var s = SIGNATURES[i], j;
      for (j = 0; j < s.need.length; j++) take(s.need[j]);
      for (j = 0; s.deny && j < s.deny.length; j++) take(s.deny[j]);
      for (j = 0; s.extra && j < s.extra.length; j++) take(s.extra[j]);
    }
    for (var k = 0; k < FRAMEWORK_PROBES.length; k++) take(FRAMEWORK_PROBES[k]);
    return { globals: globals, cookies: cookies, ls: ls, ss: ss, lsp: lsp };
  }

  // ── page-side probe (generated) ─────────────────────────────────────────────
  // One self-invoking expression, ES5, read-only, everything in try/catch. Returns the
  // evidence object detect() consumes. Built as a string so the name lists come from
  // the same table the matcher uses — there is no second list to keep in sync.
  function buildProbeCode() {
    var spec = probeSpec();
    return "" +
      "(function(){try{var w=window,d=w.document,out={globals:{},cookies:{},ls:{},ss:{},lsp:{},storageBlocked:false};\n" +
      // typeof of a dotted path; 'null' is reported separately so a null value can
      // never satisfy a {t:'object'} condition.
      "function tp(path){try{var p=path.split('.'),v=w,i;for(i=0;i<p.length;i++){if(v===null||typeof v==='undefined')return 'undefined';v=v[p[i]];}" +
      "if(v===null)return 'null';return typeof v;}catch(e){return 'undefined';}}\n" +
      // Cookie EXISTENCE only — the value is user data and is never read.
      "function ck(n){try{var re=new RegExp('(?:^|; )'+String(n).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'=');return re.test(d&&d.cookie||'');}catch(e){return false;}}\n" +
      "var G=" + JSON.stringify(spec.globals) + ",C=" + JSON.stringify(spec.cookies) +
      ",L=" + JSON.stringify(spec.ls) + ",S=" + JSON.stringify(spec.ss) + ",P=" + JSON.stringify(spec.lsp) + ";\n" +
      "for(var i=0;i<G.length;i++)out.globals[G[i]]=tp(G[i]);\n" +
      "for(var j=0;j<C.length;j++)out.cookies[C[j]]=ck(C[j]);\n" +
      // Storage can throw outright (blocked third-party context / disabled storage).
      // That is reported, not swallowed: "no keys" and "could not look" are different
      // answers, and the cookie/storage-based CMPs are unidentifiable in the second.
      "try{var lsx=w.localStorage,ssx=w.sessionStorage;\n" +
      "for(var a=0;a<L.length;a++)out.ls[L[a]]=lsx.getItem(L[a])!==null;\n" +
      "for(var b=0;b<S.length;b++)out.ss[S[b]]=ssx.getItem(S[b])!==null;\n" +
      // Prefix scan is bounded: a page with a huge localStorage must not stall the poll.
      "if(P.length){var n=lsx.length,cap=n>300?300:n;for(var c=0;c<P.length;c++)out.lsp[P[c]]=false;\n" +
      "for(var e=0;e<cap;e++){var kk=lsx.key(e)||'';for(var f=0;f<P.length;f++){if(kk.indexOf(P[f])===0)out.lsp[P[f]]=true;}}}\n" +
      "}catch(eS){out.storageBlocked=true;}\n" +
      "return out;}catch(eA){return {error:String(eA&&eA.message||eA)};}})()";
  }

  // ── matcher (pure) ──────────────────────────────────────────────────────────
  function holds(cond, ev) {
    if (!cond || !ev) return false;
    if (cond.g) return (ev.globals || {})[cond.g] === (cond.t || "object");
    if (cond.c) return !!(ev.cookies || {})[cond.c];
    if (cond.ls) return !!(ev.ls || {})[cond.ls];
    if (cond.ss) return !!(ev.ss || {})[cond.ss];
    if (cond.lsp) return !!(ev.lsp || {})[cond.lsp];
    return false;
  }

  // Human-readable form of a condition, for the "Beleg" column.
  function describe(cond) {
    if (!cond) return "";
    if (cond.g) return cond.g + " (" + (cond.t || "object") + ")";
    if (cond.c) return "Cookie " + cond.c;
    if (cond.ls) return "localStorage." + cond.ls;
    if (cond.ss) return "sessionStorage." + cond.ss;
    if (cond.lsp) return "localStorage " + cond.lsp + "*";
    return "";
  }

  var CONF_RANK = { strong: 0, medium: 1 };

  // evidence → { matches, frameworks, storageBlocked, error }
  // `matches` is ranked strong-before-medium, then table order (stable), so the panel
  // never has to re-decide which of two hits is the more trustworthy one.
  function detect(ev) {
    ev = ev || {};
    var matches = [];
    for (var i = 0; i < SIGNATURES.length; i++) {
      var s = SIGNATURES[i], ok = true, j;
      for (j = 0; j < s.need.length; j++) { if (!holds(s.need[j], ev)) { ok = false; break; } }
      if (!ok) continue;
      if (s.deny) {
        for (j = 0; j < s.deny.length; j++) { if (holds(s.deny[j], ev)) { ok = false; break; } }
      }
      if (!ok) continue;
      var proof = [], extra = [];
      for (j = 0; j < s.need.length; j++) proof.push(describe(s.need[j]));
      for (j = 0; s.extra && j < s.extra.length; j++) {
        if (holds(s.extra[j], ev)) extra.push(describe(s.extra[j]));
      }
      matches.push({
        key: s.key, label: s.label, adapter: s.adapter, confidence: s.confidence,
        order: i, proof: proof, extra: extra
      });
    }
    matches.sort(function (a, b) {
      var ra = CONF_RANK[a.confidence], rb = CONF_RANK[b.confidence];
      if (ra !== rb) return (typeof ra === "number" ? ra : 9) - (typeof rb === "number" ? rb : 9);
      return a.order - b.order;
    });
    var frameworks = [];
    for (var k = 0; k < FRAMEWORK_PROBES.length; k++) {
      if (holds(FRAMEWORK_PROBES[k], ev)) frameworks.push(FRAMEWORK_PROBES[k].label);
    }
    return {
      matches: matches, frameworks: frameworks,
      storageBlocked: !!ev.storageBlocked, error: ev.error || ""
    };
  }

  var api = {
    SIGNATURES: SIGNATURES, UNDETECTABLE: UNDETECTABLE, FRAMEWORK_PROBES: FRAMEWORK_PROBES,
    probeSpec: probeSpec, buildProbeCode: buildProbeCode, detect: detect, describe: describe
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.aGTMInspectorCmpDetect = api;
})(typeof window !== "undefined" ? window : this);
