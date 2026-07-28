// Unit tests for the Simulation-tab pure code builders
// (devtools-extension/sim.js → window.aGTMInspectorSim). These build the MUTATING
// eval strings the Simulation tab injects into the page. We both (a) assert the
// generated string shape and (b) EXECUTE it against a fake window.aGTM so a
// string-building bug (bad escaping, wrong comma-wrap, missing run_cc) fails here
// instead of silently no-op'ing in the browser.

import { test, expect, describe } from "bun:test";
import {
  commaWrap, splitTokens, stubBody,
  buildConsentCode, buildDenyCode,
  buildResetCode, buildRestoreCode, buildFireCode, buildInjectCode, buildProbeCode,
  buildBlockCode, buildUnblockCode, buildInjectIntegrationCode, simSelection,
  buildGcmPushCode, buildCookieResetCode, buildScenarioCode, buildConsentStoreTestCode,
  buildLoadContainerCode, GCM_SIGNALS, GCM_MODES, hasCls, SIM_COOKIE_DEFAULT,
  pickFrameDocs, formatFramePass, sameSite
} from "../../devtools-extension/sim.js";

// Run a builder's self-invoking expression against a supplied fake window and
// return its effect object. Mirrors chrome.devtools.inspectedWindow.eval running
// the string in the page context, with `window` bound to our fake.
function run(code, w) {
  // eslint-disable-next-line no-new-func
  return new Function("window", "return (" + code + ");")(w);
}

// Minimal fake of the library surface the injected code touches. run_cc mimics the
// real B2 reset → consent_check → gtmConsent-derive order so a stub that writes
// AFTER the reset is exercised exactly as in aGTM.js.
function fakeAGTM() {
  var calls = [];
  var w = { dataLayer: [] };
  var A = { c: { gdl: "dataLayer" }, d: { consent: {}, init: false, config: true, last_consent_hash: "x" }, f: {} };
  A.f.consent_check = function (action) { calls.push(["orig_cc", action]); return true; };
  A.f.run_cc = function (action) {
    calls.push(["run_cc", action]);
    if (action === "update") {
      A.d.consent.hasResponse = false;
      A.d.consent.services = ""; A.d.consent.purposes = ""; A.d.consent.vendors = "";
    }
    var ok = A.f.consent_check(action);
    if (!ok) return false;
    A.d.consent.gtmConsent = !!A.d.consent.services || !!A.d.consent.purposes || !!A.d.consent.vendors;
    // Mirror aGTM.js:587-592 — inject only when the consent hash CHANGED and GTM
    // isn't injected yet (so a repeated identical grant doesn't re-inject).
    var hash = (A.d.consent.services || "") + "|" + (A.d.consent.purposes || "") + "|" + (A.d.consent.vendors || "");
    var changed = hash !== A.d.last_consent_hash;
    A.d.last_consent_hash = hash;
    if (action === "update" && changed && !A.d.init && A.d.consent.gtmConsent) A.f.inject();
    return true;
  };
  A.f.fire = function (o) { calls.push(["fire", o]); w.dataLayer.push(o); };
  // inject() mirrors aGTM.js's consent gate: no-op (returns false) unless hasResponse,
  // and only "loads" when gtmConsent. So a forced load must NOT go through inject().
  A.f.inject = function () {
    calls.push(["inject"]);
    if (!A.d.consent || !A.d.consent.hasResponse) return false;
    if (A.d.consent.gtmConsent) A.d.init = true;
    return true;
  };
  // initGTM loads every container regardless of consent (aGTM.js:1119) — the real force path.
  A.f.initGTM = function (noConsent) { calls.push(["initGTM", noConsent]); };
  // gtm_load injects a single container (aGTM.js:1127) — used by the container-override.
  // Captures the 6th arg (container config object), which real gtm_load dereferences
  // (o.gtmJS/o.gtmURL/o.env, aGTM.js:1050) → a builder that drops it would throw in-browser.
  A.f.gtm_load = function (win, doc, id, idParam, gdl, cfg) { calls.push(["gtm_load", id, idParam, gdl, cfg]); };
  w.aGTM = A; w.__calls = calls;
  return w;
}

describe("commaWrap — matches aGTM.f.chelp lookup shape", () => {
  test("wraps tokens with leading/trailing commas", () => {
    expect(commaWrap(["a", "b"])).toBe(",a,b,");
  });
  test("empty list → empty string (all denied)", () => {
    expect(commaWrap([])).toBe("");
    expect(commaWrap(null)).toBe("");
  });
  test("trims and drops blank tokens", () => {
    expect(commaWrap([" a ", "  ", "b"])).toBe(",a,b,");
  });
  test("a wrapped token is found by chelp's indexOf(',' + need + ',')", () => {
    var s = commaWrap(["Google Analytics", "Google Ads"]);
    expect(s.indexOf(",Google Analytics,")).toBeGreaterThanOrEqual(0);
    expect(s.indexOf(",Google Ads,")).toBeGreaterThanOrEqual(0);
  });
});

describe("splitTokens — parses plain config + comma-wrapped consent", () => {
  test("plain comma list from config", () => {
    expect(splitTokens("a, b ,c")).toEqual(["a", "b", "c"]);
  });
  test("comma-wrapped consent string", () => {
    expect(splitTokens(",a,b,")).toEqual(["a", "b"]);
  });
  test("empty / non-string → []", () => {
    expect(splitTokens("")).toEqual([]);
    expect(splitTokens(null)).toEqual([]);
  });
});

describe("buildConsentCode — installs stub + drives run_cc", () => {
  test("writes the granular consent and returns the effect", () => {
    var w = fakeAGTM();
    var res = run(buildConsentCode({
      purposes: ["stat"], services: ["GA", "GAds"], vendors: [],
      serviceIDs: ["s7"], vendorIDs: [], purposeIDs: []
    }), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.d.consent.services).toBe(",GA,GAds,");
    expect(w.aGTM.d.consent.purposes).toBe(",stat,");
    expect(w.aGTM.d.consent.serviceIDs).toBe(",s7,");
    expect(res.gtmConsent).toBe(true);
    expect(w.__calls.some(function (c) { return c[0] === "run_cc" && c[1] === "update"; })).toBe(true);
  });
  test("the stub survives run_cc's B2 field reset (writes AFTER it)", () => {
    var w = fakeAGTM();
    run(buildConsentCode({ services: ["A"] }), w);
    // if the stub ran before the reset, services would be "" — it must be set
    expect(w.aGTM.d.consent.services).toBe(",A,");
    expect(w.aGTM.d.consent.hasResponse).toBe(true);
  });
  test("run_cc('update') drives inject when consent is granted", () => {
    var w = fakeAGTM();
    var res = run(buildConsentCode({ services: ["A"] }), w);
    expect(w.aGTM.d.init).toBe(true);
    expect(res.init).toBe(true);
  });
  test("original consent_check is backed up ONCE and not overwritten by a 2nd install", () => {
    var w = fakeAGTM();
    var orig = w.aGTM.f.consent_check;
    run(buildConsentCode({ services: ["A"] }), w);
    expect(w.aGTM.f.__inspOrigCC).toBe(orig);
    run(buildConsentCode({ services: ["B"] }), w); // 2nd install: backup must stay the ORIGINAL
    expect(w.aGTM.f.__inspOrigCC).toBe(orig);
  });
});

describe("buildDenyCode — clears all consent", () => {
  test("empty selection → empty consent strings, gtmConsent false", () => {
    var w = fakeAGTM();
    var res = run(buildDenyCode(), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.d.consent.services).toBe("");
    expect(w.aGTM.d.consent.purposes).toBe("");
    expect(res.gtmConsent).toBe(false);
  });
});

describe("buildResetCode / buildRestoreCode", () => {
  test("reset restores the original check and clears consent state", () => {
    var w = fakeAGTM();
    var orig = w.aGTM.f.consent_check;
    w.aGTM.f.__inspOrigCC = orig;
    w.aGTM.f.consent_check = function () { return true; }; // pretend a stub is active
    var res = run(buildResetCode(), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.f.consent_check).toBe(orig);
    expect(w.aGTM.f.__inspOrigCC).toBeUndefined();
    expect(w.aGTM.d.consent.gtmConsent).toBe(false);
    expect(w.aGTM.d.consent.hasResponse).toBe(false);
  });
  test("restore swaps the check back without wiping consent", () => {
    var w = fakeAGTM();
    var orig = w.aGTM.f.consent_check;
    w.aGTM.f.__inspOrigCC = orig;
    w.aGTM.f.consent_check = function () { return true; };
    w.aGTM.d.consent = { services: ",A,", hasResponse: true, gtmConsent: true };
    run(buildRestoreCode(), w);
    expect(w.aGTM.f.consent_check).toBe(orig);
    expect(w.aGTM.d.consent.services).toBe(",A,"); // consent untouched
  });
  test("reset without a stored original still clears state (no throw)", () => {
    var w = fakeAGTM();
    var res = run(buildResetCode(), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.d.consent.hasResponse).toBe(false);
  });
});

describe("buildFireCode — dispatches through aGTM.f.fire", () => {
  test("embeds the event object verbatim", () => {
    var w = fakeAGTM();
    run(buildFireCode({ event: "purchase", value: 12.5, currency: "EUR" }, {}), w);
    var fired = w.__calls.find(function (c) { return c[0] === "fire"; })[1];
    expect(fired.event).toBe("purchase");
    expect(fired.value).toBe(12.5);
    expect(fired.currency).toBe("EUR");
  });
  test("merges the bypass flags", () => {
    var w = fakeAGTM();
    run(buildFireCode({ event: "x" }, { _noConsent: true, _noDLPush: true, _post: true }), w);
    var fired = w.__calls.find(function (c) { return c[0] === "fire"; })[1];
    expect(fired._noConsent).toBe(true);
    expect(fired._noDLPush).toBe(true);
    expect(fired._post).toBe(true);
  });
  test("special characters in strings are safely escaped", () => {
    var w = fakeAGTM();
    run(buildFireCode({ event: 'quo"te', note: "line\nbreak</script>" }, {}), w);
    var fired = w.__calls.find(function (c) { return c[0] === "fire"; })[1];
    expect(fired.event).toBe('quo"te');
    expect(fired.note).toBe("line\nbreak</script>");
  });
});

describe("buildInjectCode / buildProbeCode / missing aGTM", () => {
  test("force load goes through initGTM(false) — independent of consent", () => {
    var w = fakeAGTM();
    // no consent at all: hasResponse false, gtmConsent false → inject() would no-op
    w.aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    var res = run(buildInjectCode(), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.d.init).toBe(true);                                   // forced
    expect(w.__calls.some(function (c) { return c[0] === "initGTM" && c[1] === false; })).toBe(true);
    expect(w.__calls.some(function (c) { return c[0] === "inject"; })).toBe(false); // NOT via the gated inject()
  });
  test("falls back to inject() when initGTM is absent (very old library)", () => {
    var w = fakeAGTM();
    w.aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    delete w.aGTM.f.initGTM;
    var res = run(buildInjectCode(), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.d.init).toBe(true);
  });
  test("reports the consent-gate rejection when only the gated inject() exists", () => {
    var w = fakeAGTM();
    w.aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    delete w.aGTM.f.initGTM;
    var res = run(buildInjectCode(), w); // inject() returns false → surfaced, not a fake OK
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Consent-Gate");
  });
  test("aGTM present but not initialised (no aGTM.d.config) → ok:false, no fake init", () => {
    var w = fakeAGTM();
    delete w.aGTM.d.config;
    var res = run(buildInjectCode(), w);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("nicht initialisiert");
    expect(w.aGTM.d.init).toBe(false); // not marked injected over a no-op
  });
  test("probe detects an installed stub", () => {
    var w = fakeAGTM();
    expect(run(buildProbeCode(), w).simActive).toBe(false);
    w.aGTM.f.__inspOrigCC = function () {};
    expect(run(buildProbeCode(), w).simActive).toBe(true);
  });
  test("every builder returns ok:false (no throw) when aGTM is absent", () => {
    [buildConsentCode({}), buildDenyCode(), buildInjectCode(), buildFireCode({ event: "x" }, {}), buildResetCode()]
      .forEach(function (code) {
        var res = run(code, {});
        expect(res.ok).toBe(false);
        expect(typeof res.error).toBe("string");
      });
  });
});

describe("stubBody — backup guard string", () => {
  test("backs up once, preferring the block backup's real check when a block is active", () => {
    var s = stubBody({});
    expect(s.indexOf("A.f.__inspOrigCC=A.f.__inspOrigCC||")).toBeGreaterThanOrEqual(0);
    expect(s.indexOf("A.f.__inspBlockBak?A.f.__inspBlockBak.consent_check:A.f.consent_check")).toBeGreaterThanOrEqual(0);
  });
});

describe("simSelection — per-group name/ID toggle", () => {
  function model() {
    return {
      purposes: [{ name: "statistics", id: "p1", on: true }, { name: "off", id: "p9", on: false }],
      services: [{ name: "Google Analytics", id: "s1", on: true }, { name: "Meta", id: "s2", on: true }],
      vendors: [{ name: "Google Inc", id: "v1", on: true }],
      useId: { purposes: false, services: false, vendors: false }
    };
  }
  test("useId OFF → names are the matched tokens; IDs still collected", () => {
    var sel = simSelection(model());
    expect(sel.services).toEqual(["Google Analytics", "Meta"]);
    expect(sel.serviceIDs).toEqual(["s1", "s2"]);
    expect(sel.purposes).toEqual(["statistics"]); // 'off' row excluded
    expect(sel.purposeIDs).toEqual(["p1"]);
  });
  test("useId ON for a group → its IDs become the matched tokens", () => {
    var m = model(); m.useId.services = true;
    var sel = simSelection(m);
    expect(sel.services).toEqual(["s1", "s2"]); // IDs now the match string
    expect(sel.serviceIDs).toEqual(["s1", "s2"]);
    expect(sel.purposes).toEqual(["statistics"]); // purposes group still by name
  });
  test("only ON rows contribute", () => {
    var m = model(); m.services[1].on = false;
    var sel = simSelection(m);
    expect(sel.services).toEqual(["Google Analytics"]);
    expect(sel.serviceIDs).toEqual(["s1"]);
  });
  test("useId ON but a row has no ID → falls back to that row's name (F-1)", () => {
    var m = model(); m.useId.services = true; m.services[1].id = ""; // Meta has no ID
    var sel = simSelection(m);
    expect(sel.services).toEqual(["s1", "Meta"]); // s1 by ID, Meta by name fallback
    expect(sel.serviceIDs).toEqual(["s1"]);        // only the real ID collected
  });
});

describe("buildBlockCode / buildUnblockCode", () => {
  test("block neutralises the loaders + consent check and flags the page", () => {
    var w = fakeAGTM();
    var origInject = w.aGTM.f.inject, origCC = w.aGTM.f.consent_check;
    var res = run(buildBlockCode(), w);
    expect(res.ok).toBe(true);
    expect(res.blocked).toBe(true);
    expect(w.aGTM.f.inject).not.toBe(origInject); // now a no-op
    expect(w.aGTM.f.consent_check()).toBe(false);  // never grants
    expect(w.aGTM.d.__inspBlocked).toBe(true);
    expect(w.aGTM.f.__inspBlockBak.inject).toBe(origInject); // original backed up
    expect(w.aGTM.f.__inspBlockBak.consent_check).toBe(origCC);
    // no-op'd inject really does nothing
    w.aGTM.d.init = false; w.aGTM.f.inject();
    expect(w.aGTM.d.init).toBe(false);
  });
  test("unblock restores the originals and clears the flag", () => {
    var w = fakeAGTM();
    var origInject = w.aGTM.f.inject, origCC = w.aGTM.f.consent_check;
    run(buildBlockCode(), w);
    var res = run(buildUnblockCode(), w);
    expect(res.ok).toBe(true);
    expect(res.blocked).toBe(false);
    expect(w.aGTM.f.inject).toBe(origInject);
    expect(w.aGTM.f.consent_check).toBe(origCC);
    expect(w.aGTM.f.__inspBlockBak).toBeUndefined();
    expect(w.aGTM.d.__inspBlocked).toBeFalsy();
  });
  test("block backup is taken ONCE (a second block keeps the true originals)", () => {
    var w = fakeAGTM();
    var origInject = w.aGTM.f.inject;
    run(buildBlockCode(), w);
    run(buildBlockCode(), w); // second block must not back up the no-op
    expect(w.aGTM.f.__inspBlockBak.inject).toBe(origInject);
  });
  test("probe reports the blocked flag", () => {
    var w = fakeAGTM();
    expect(run(buildProbeCode(), w).blocked).toBe(false);
    run(buildBlockCode(), w);
    expect(run(buildProbeCode(), w).blocked).toBe(true);
  });
  test("Block → Grant → Unblock → Restore does NOT strand a deny-noop (critic P3)", () => {
    var w = fakeAGTM();
    var realCC = w.aGTM.f.consent_check;
    run(buildBlockCode(), w);                 // consent_check → return false; real CC in __inspBlockBak
    run(buildConsentCode({ services: ["A"] }), w); // grant stub while blocked
    run(buildUnblockCode(), w);               // restores real CC, discards grant stub
    run(buildRestoreCode(), w);               // must NOT restore the block's return-false noop
    expect(w.aGTM.f.consent_check).toBe(realCC);
    expect(w.aGTM.f.consent_check()).toBe(true); // the real check, not a permanent deny
  });
});

describe("buildInjectIntegrationCode — runs a pasted snippet at global scope", () => {
  function runDoc(code, w, doc) {
    // eslint-disable-next-line no-new-func
    return new Function("window", "document", "return (" + code + ");")(w, doc);
  }
  function fakeDoc() {
    var appended = [];
    return {
      createElement: function (tag) {
        return { tag: tag, type: "", _text: "", set text(v) { this._text = v; }, get text() { return this._text; } };
      },
      head: { appendChild: function (el) { appended.push(el); } },
      documentElement: { appendChild: function (el) { appended.push(el); } },
      __appended: appended
    };
  }
  test("creates a <script> element carrying the snippet and appends it", () => {
    var doc = fakeDoc();
    var res = runDoc(buildInjectIntegrationCode("window.aGTM=window.aGTM||{};aGTM.f&&aGTM.f.init&&aGTM.f.init();"), { aGTM: { d: {} } }, doc);
    expect(res.ok).toBe(true);
    expect(res.injected).toBe(true);
    expect(doc.__appended.length).toBe(1);
    expect(doc.__appended[0].tag).toBe("script");
    expect(doc.__appended[0]._text).toContain("aGTM.f.init");
    expect(res.loaded).toBe(true); // window.aGTM present in this fake
  });
  test("reports loaded:false when the page still has no aGTM", () => {
    var doc = fakeDoc();
    var res = runDoc(buildInjectIntegrationCode("var x=1;"), {}, doc);
    expect(res.ok).toBe(true);
    expect(res.loaded).toBe(false);
  });
  test("a snippet containing </script> or quotes is embedded safely", () => {
    var doc = fakeDoc();
    var snippet = 'var s="a\\"b</script>";';
    var res = runDoc(buildInjectIntegrationCode(snippet), { aGTM: null }, doc);
    expect(res.ok).toBe(true);
    expect(doc.__appended[0]._text).toBe(snippet);
  });
});

/* ==================================================================== *
 *  Card #50 — Simulation-tab extra features                            *
 * ==================================================================== */

describe("buildGcmPushCode — gtag('consent','update',…) into the dataLayer", () => {
  test("pushes a GENUINE arguments object (['consent','update',sig]) — not an array", () => {
    var w = { aGTM: { c: { gdl: "dataLayer" } }, dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "granted", analytics_storage: "denied" }), w);
    expect(res.ok).toBe(true);
    expect(res.pushed).toBe(true);
    expect(w.dataLayer.length).toBe(1);
    var args = w.dataLayer[0];
    // an arguments object is array-LIKE but not a real Array — that's what gtag pushes
    expect(Array.isArray(args)).toBe(false);
    expect(args.length).toBe(3);
    expect(args[0]).toBe("consent");
    expect(args[1]).toBe("update");
    expect(args[2].ad_storage).toBe("granted");
    expect(args[2].analytics_storage).toBe("denied");
  });
  test("whitelists GCM keys and only granted/denied values", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "granted", bogus_key: "granted", analytics_storage: "maybe" }), w);
    expect(res.signals.ad_storage).toBe("granted");
    expect(res.signals.bogus_key).toBeUndefined();       // not a GCM signal
    expect(res.signals.analytics_storage).toBeUndefined(); // invalid value dropped
  });
  test("works WITHOUT aGTM on the page → default 'dataLayer'", () => {
    var w = {}; // no aGTM, no dataLayer yet
    var res = run(buildGcmPushCode({ ad_storage: "denied" }), w);
    expect(res.ok).toBe(true);
    expect(res.dataLayer).toBe("dataLayer");
    expect(w.dataLayer.length).toBe(1);
  });
  test("gdlHint overrides the dataLayer name", () => {
    var w = { aGTM: { c: { gdl: "dataLayer" } } };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }, "myLayer"), w);
    expect(res.dataLayer).toBe("myLayer");
    expect(w.myLayer.length).toBe(1);
  });
  test("all seven canonical GCM signals are supported", () => {
    var all = {};
    GCM_SIGNALS.forEach(function (k) { all[k] = "granted"; });
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode(all), w);
    GCM_SIGNALS.forEach(function (k) { expect(res.signals[k]).toBe("granted"); });
    expect(GCM_SIGNALS.length).toBe(7);
  });
});

describe("buildCookieResetCode — expire matching cookies across domain/path grid", () => {
  // Fake document.cookie: getter returns the live jar; setter parses an expiry write
  // and drops the named cookie when the expires date is in the past.
  function fakeWin(cookieStr, opts) {
    opts = opts || {};
    var jar = {};
    (cookieStr || "").split(";").forEach(function (p) {
      var kv = p.split("="); var k = (kv[0] || "").replace(/^\s+|\s+$/g, "");
      if (k) jar[k] = (kv[1] || "").replace(/^\s+|\s+$/g, "");
    });
    var expired = [];
    var doc = {
      get cookie() {
        return Object.keys(jar).map(function (k) { return k + "=" + jar[k]; }).join("; ");
      },
      set cookie(v) {
        var name = v.split("=")[0];
        if (v.indexOf("01 Jan 1970") >= 0) { if (jar.hasOwnProperty(name)) { delete jar[name]; } expired.push(name); }
      }
    };
    var w = {
      document: doc,
      location: { hostname: opts.hostname || "shop.example.com", pathname: opts.pathname || "/cart", reloaded: false, reload: function () { this.reloaded = true; } },
      __jar: jar, __expired: expired
    };
    if (opts.localStorage) {
      var lsData = opts.localStorage, keys = Object.keys(lsData);
      w.localStorage = {
        get length() { return keys.length; },
        key: function (i) { return keys[i]; },
        removeItem: function (k) { var idx = keys.indexOf(k); if (idx >= 0) { keys.splice(idx, 1); delete lsData[k]; } }
      };
    }
    // synchronous setTimeout so a reload happens within the test tick
    w.setTimeout = function (fn) { fn(); return 0; };
    return w;
  }

  test("only cookies whose name matches a pattern are expired", () => {
    var w = fakeWin("CookieConsent=yes; sessionid=abc; OptanonConsent=1; cart=xy");
    var res = run(buildCookieResetCode(["CookieConsent", "Optanon"], {}), w);
    expect(res.ok).toBe(true);
    expect(res.cleared.sort()).toEqual(["CookieConsent", "OptanonConsent"]);
    expect(res.clearedCount).toBe(2);
    // untouched cookies survive
    expect(w.__jar.sessionid).toBe("abc");
    expect(w.__jar.cart).toBe("xy");
    expect(w.__jar.CookieConsent).toBeUndefined();
  });
  test("empty pattern list = match ALL cookies (nuclear)", () => {
    var w = fakeWin("a=1; b=2; c=3");
    var res = run(buildCookieResetCode([], {}), w);
    expect(res.cleared.sort()).toEqual(["a", "b", "c"]);
    expect(Object.keys(w.__jar).length).toBe(0);
  });
  test("reload:true reloads after clearing; reload:false does not", () => {
    var w1 = fakeWin("CookieConsent=1");
    run(buildCookieResetCode(["CookieConsent"], { reload: true }), w1);
    expect(w1.location.reloaded).toBe(true);
    var w2 = fakeWin("CookieConsent=1");
    var res2 = run(buildCookieResetCode(["CookieConsent"], { reload: false }), w2);
    expect(w2.location.reloaded).toBe(false);
    expect(res2.reloading).toBeUndefined();
  });
  test("clearStorage:true removes matching localStorage keys", () => {
    var w = fakeWin("x=1", { localStorage: { aGTM_consent: "1", loginToken: "keep", aGTM_sid: "2" } });
    var res = run(buildCookieResetCode(["aGTM"], { clearStorage: true }), w);
    expect(res.lsCleared).toBe(2);
    expect(w.localStorage.length).toBe(1); // only loginToken remains
  });
  test("no throw when there is no document/location", () => {
    var res = run(buildCookieResetCode(["x"], { reload: true }), {});
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe("string");
  });
  test("expiry write targets host-only AND dotted parent domains, never the public suffix", () => {
    var sets = [];
    var w = { document: { get cookie() { return "t=1"; }, set cookie(v) { sets.push(v); } },
      location: { hostname: "a.b.example.com", pathname: "/p" }, setTimeout: function (f) { f(); } };
    run(buildCookieResetCode(["t"], {}), w);
    // host-only variant: an expiry write with NO domain= attribute
    expect(sets.some(function (v) { return v.indexOf("domain=") < 0; })).toBe(true);
    // dotted registrable parent + dotted immediate parent
    expect(sets.some(function (v) { return v.indexOf("domain=.example.com") >= 0; })).toBe(true);
    expect(sets.some(function (v) { return v.indexOf("domain=.b.example.com") >= 0; })).toBe(true);
    // must NOT target the bare public suffix (would be rejected / dangerous)
    expect(sets.some(function (v) { return v.indexOf("domain=com") >= 0 || v.indexOf("domain=.com") >= 0; })).toBe(false);
    // every write is an expiry in the past
    expect(sets.length > 0 && sets.every(function (v) { return v.indexOf("01 Jan 1970") >= 0; })).toBe(true);
  });
});

describe("buildScenarioCode — one eval: deny → fire (queue) → grant → inject/replay", () => {
  // Fake that models the queue: fire() parks events in aGTM.d.f until gtmConsent, then
  // inject() replays them into the dataLayer — so queuedWhileDenied is meaningful.
  function fakeQueueAGTM() {
    var calls = [];
    var w = { dataLayer: [] };
    var A = { c: { gdl: "dataLayer" }, d: { consent: {}, init: false, f: [], last_consent_hash: "x" }, f: {} };
    A.f.consent_check = function () { return true; };
    A.f.run_cc = function (action) {
      calls.push(["run_cc", action]);
      if (action === "update") { A.d.consent.hasResponse = false; A.d.consent.services = ""; A.d.consent.purposes = ""; A.d.consent.vendors = ""; }
      if (!A.f.consent_check(action)) return false;
      A.d.consent.gtmConsent = !!A.d.consent.services || !!A.d.consent.purposes || !!A.d.consent.vendors;
      var hash = (A.d.consent.services || "") + "|" + (A.d.consent.purposes || "");
      var changed = hash !== A.d.last_consent_hash; A.d.last_consent_hash = hash;
      if (action === "update" && changed && !A.d.init && A.d.consent.gtmConsent) A.f.inject();
      return true;
    };
    A.f.fire = function (o) { if (A.d.consent && A.d.consent.gtmConsent) { w.dataLayer.push(o); } else { A.d.f.push(o); } };
    A.f.inject = function () { A.d.init = true; while (A.d.f.length) w.dataLayer.push(A.d.f.shift()); };
    w.aGTM = A; w.__calls = calls;
    return w;
  }
  test("events queue while denied, then replay on grant", () => {
    var w = fakeQueueAGTM();
    var res = run(buildScenarioCode({ services: ["GA"] }, [{ event: "page_view" }, { event: "add_to_cart" }]), w);
    expect(res.ok).toBe(true);
    expect(res.scenario.firedEvents).toBe(2);
    expect(res.scenario.queuedWhileDenied).toBe(2); // both parked before the grant
    expect(res.gtmConsent).toBe(true);
    expect(res.init).toBe(true);
    // both events replayed into the dataLayer after inject
    expect(w.dataLayer.length).toBe(2);
    expect(w.dataLayer[0].event).toBe("page_view");
  });
  test("empty event list still walks deny→grant", () => {
    var w = fakeQueueAGTM();
    var res = run(buildScenarioCode({ services: ["GA"] }, []), w);
    expect(res.ok).toBe(true);
    expect(res.scenario.firedEvents).toBe(0);
    expect(res.gtmConsent).toBe(true);
  });
  test("already-injected page → alreadyInjected:true, events stay queued (no replay)", () => {
    var w = fakeQueueAGTM();
    w.aGTM.d.init = true;            // GTM already loaded before the scenario
    w.aGTM.d.last_consent_hash = ""; // ensure the grant would 'change' the hash
    var res = run(buildScenarioCode({ services: ["GA"] }, [{ event: "page_view" }, { event: "purchase" }]), w);
    expect(res.ok).toBe(true);
    expect(res.scenario.alreadyInjected).toBe(true);   // captured BEFORE the run
    expect(res.scenario.queuedWhileDenied).toBe(2);
    // inject-once guard means no replay: events orphaned in aGTM.d.f, dataLayer empty
    expect(w.dataLayer.length).toBe(0);
    expect(w.aGTM.d.f.length).toBe(2);
  });
  test("queuedWhileDenied is the DELTA, not inflated by a pre-existing queue (critic P3)", () => {
    var w = fakeQueueAGTM();
    w.aGTM.d.f.push({ event: "pre1" }, { event: "pre2" }); // backlog parked before the scenario
    var res = run(buildScenarioCode({ services: ["GA"] }, [{ event: "page_view" }]), w);
    expect(res.ok).toBe(true);
    expect(res.scenario.firedEvents).toBe(1);
    expect(res.scenario.queuedWhileDenied).toBe(1); // only the 1 this scenario queued, not 3
  });
  test("no aGTM → ok:false, no throw", () => {
    var res = run(buildScenarioCode({ services: ["GA"] }, [{ event: "x" }]), {});
    expect(res.ok).toBe(false);
  });
});

describe("buildConsentStoreTestCode — force the /aGTMconsent POST via run_cc", () => {
  // Fake whose run_cc mirrors aGTM.js's end-of-success consent-store diff: POST when the
  // serialized consent differs from A.d.consent_hash. Blanking the hash MUST cause a POST.
  function fakeStoreAGTM(url) {
    var posts = [];
    var w = { dataLayer: [] };
    // Seed consent_hash to EXACTLY what the granted consent serialises to (",GA,") so the
    // POST only fires because the builder blanks the hash — if it didn't, ser===consent_hash
    // and no POST would fire. This makes the test guard the load-bearing blank line (critic P2).
    var A = { c: { gdl: "dataLayer", consent_store_url: url }, d: { consent: {}, init: false, consent_hash: ",GA,", last_consent_hash: "x" }, f: {} };
    A.f.consent_check = function () { return true; };
    A.f.xsend = function (u, payload) { posts.push({ url: u, payload: payload }); return {}; };
    A.f.run_cc = function (action) {
      if (action === "update") { A.d.consent.hasResponse = false; A.d.consent.services = ""; }
      A.f.consent_check(action);
      A.d.consent.gtmConsent = !!A.d.consent.services;
      var ser = A.d.consent.services || "";
      if (A.c.consent_store_url && ser !== A.d.consent_hash) { A.f.xsend(A.c.consent_store_url, { consent: A.d.consent.services }); A.d.consent_hash = ser; }
      return true;
    };
    A.f.inject = function () { A.d.init = true; };
    w.aGTM = A; w.__posts = posts;
    return w;
  }
  test("blanks consent_hash so run_cc POSTs to consent_store_url", () => {
    var w = fakeStoreAGTM("https://sgtm.example.com/aGTMconsent");
    var res = run(buildConsentStoreTestCode({ services: ["GA"] }), w);
    expect(res.ok).toBe(true);
    expect(res.consentStoreUrl).toBe("https://sgtm.example.com/aGTMconsent");
    expect(w.__posts.length).toBe(1);
    expect(w.__posts[0].url).toBe("https://sgtm.example.com/aGTMconsent");
  });
  test("errors cleanly when no consent_store_url is configured (no POST)", () => {
    var w = fakeStoreAGTM("");
    var res = run(buildConsentStoreTestCode({ services: ["GA"] }), w);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("consent_store_url");
    expect(w.__posts.length).toBe(0);
  });
  test("no aGTM → ok:false, no throw", () => {
    var res = run(buildConsentStoreTestCode({}), {});
    expect(res.ok).toBe(false);
  });
});

describe("buildLoadContainerCode — load a different GTM container than the config", () => {
  test("registers each id and injects it via gtm_load (consent-independent)", () => {
    var w = fakeAGTM();
    w.aGTM.d.consent = { hasResponse: false, gtmConsent: false }; // no consent at all
    var res = run(buildLoadContainerCode(["GTM-TEST1", "GTM-TEST2"]), w);
    expect(res.ok).toBe(true);
    expect(res.loadedContainers).toEqual(["GTM-TEST1", "GTM-TEST2"]);
    // both injected via gtm_load, regardless of consent
    var loads = w.__calls.filter(function (c) { return c[0] === "gtm_load"; });
    expect(loads.map(function (c) { return c[1]; })).toEqual(["GTM-TEST1", "GTM-TEST2"]);
    // registered + marked loaded so a later initGTM won't reload them
    expect(w.aGTM.c.gtm["GTM-TEST1"].hasLoaded).toBe(true);
    expect(w.aGTM.c.gtm["GTM-TEST2"].hasLoaded).toBe(true);
    // the 6th arg (container config object) is threaded through — real gtm_load derefs it
    expect(loads[0][4]).toBe(w.aGTM.c.gtm["GTM-TEST1"]);
    expect(loads[1][4]).toBe(w.aGTM.c.gtm["GTM-TEST2"]);
  });
  test("blank/whitespace tokens are skipped; only real ids load", () => {
    var w = fakeAGTM();
    var res = run(buildLoadContainerCode(["", "   ", "GTM-X"]), w);
    expect(res.ok).toBe(true);
    expect(res.loadedContainers).toEqual(["GTM-X"]);
    expect(w.__calls.filter(function (c) { return c[0] === "gtm_load"; }).length).toBe(1);
  });
  test("gtm_load missing → ok:false, no throw", () => {
    var w = fakeAGTM();
    delete w.aGTM.f.gtm_load;
    var res = run(buildLoadContainerCode(["GTM-X"]), w);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("gtm_load");
  });
  test("aGTM present but not initialised (no aGTM.d.config) → ok:false, no fake load", () => {
    var w = fakeAGTM();
    delete w.aGTM.d.config;
    var res = run(buildLoadContainerCode(["GTM-X"]), w);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("nicht initialisiert");
    expect(w.__calls.some(function (c) { return c[0] === "gtm_load"; })).toBe(false);
  });
  test("preserves an existing container config object (only sets hasLoaded)", () => {
    var w = fakeAGTM();
    w.aGTM.c.gtm = { "GTM-CFG": { idParam: "&gtm_auth=x", noConsent: true, hasLoaded: false } };
    run(buildLoadContainerCode(["GTM-CFG"]), w);
    expect(w.aGTM.c.gtm["GTM-CFG"].idParam).toBe("&gtm_auth=x"); // not clobbered
    expect(w.aGTM.c.gtm["GTM-CFG"].hasLoaded).toBe(true);
    // idParam threaded into gtm_load
    var call = w.__calls.find(function (c) { return c[0] === "gtm_load"; });
    expect(call[2]).toBe("&gtm_auth=x");
  });
  test("empty / blank id list → ok:false, no gtm_load", () => {
    var w = fakeAGTM();
    var res = run(buildLoadContainerCode([]), w);
    expect(res.ok).toBe(false);
    expect(w.__calls.some(function (c) { return c[0] === "gtm_load"; })).toBe(false);
  });
  test("no aGTM → ok:false, no throw", () => {
    expect(run(buildLoadContainerCode(["GTM-X"]), {}).ok).toBe(false);
  });
});

/* ==================================================================== *
 *  Card #51 — GCM push modes (update / default / declare)              *
 * ==================================================================== */

describe("buildGcmPushCode — mode switch", () => {
  test("GCM_MODES is the single source of truth for the three verbs", () => {
    expect(GCM_MODES).toEqual(["update", "default", "declare"]);
  });
  test("no opts → 'update' (unchanged behaviour for existing callers)", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }), w);
    expect(res.mode).toBe("update");
    expect(w.dataLayer[0][1]).toBe("update");
  });
  test("an unknown mode falls back to 'update' rather than pushing a bogus verb", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }, "", { mode: "nonsense" }), w);
    expect(res.mode).toBe("update");
    expect(w.dataLayer[0][1]).toBe("update");
  });
  test("'default' pushes gtag('consent','default',…) on a page that has not settled", () => {
    var w = { dataLayer: [] }; // no google_tag_data, no aGTM → the window is open
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default" }), w);
    expect(res.ok).toBe(true);
    expect(res.pushed).toBe(true);
    expect(res.late).toBe(false);
    expect(w.dataLayer[0][1]).toBe("default");
    expect(w.dataLayer[0][2].ad_storage).toBe("denied");
  });
  test("'declare' pushes the declare verb", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }, "", { mode: "declare" }), w);
    expect(res.pushed).toBe(true);
    expect(w.dataLayer[0][1]).toBe("declare");
  });
});

describe("buildGcmPushCode — timing guard (the point of card #51)", () => {
  test("'default' after google_tag_data.ics exists → refused, NOT pushed", () => {
    var w = { dataLayer: [], google_tag_data: { ics: { entries: {} } } };
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default" }), w);
    expect(res.ok).toBe(false);
    expect(res.pushed).toBe(false);
    expect(res.late).toBe(true);
    expect(res.ics).toBe(true);
    expect(w.dataLayer.length).toBe(0);          // nothing landed in the dataLayer
    expect(res.error).toContain("zu spät");
  });
  test("'default' after aGTM injected GTM → refused (aGTM.d.init is the other signal)", () => {
    var w = { dataLayer: [], aGTM: { c: { gdl: "dataLayer" }, d: { init: true } } };
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default" }), w);
    expect(res.ok).toBe(false);
    expect(res.injected).toBe(true);
    expect(res.ics).toBe(false);
    expect(w.dataLayer.length).toBe(0);
  });
  test("'declare' is guarded exactly like 'default'", () => {
    var w = { dataLayer: [], google_tag_data: { ics: {} } };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }, "", { mode: "declare" }), w);
    expect(res.ok).toBe(false);
    expect(res.late).toBe(true);
    expect(w.dataLayer.length).toBe(0);
  });
  test("'update' is NEVER guarded — revising consent later is its whole purpose", () => {
    var w = { dataLayer: [], google_tag_data: { ics: { entries: {} } }, aGTM: { d: { init: true } } };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }, "", { mode: "update" }), w);
    expect(res.ok).toBe(true);
    expect(res.pushed).toBe(true);
    expect(res.late).toBe(true);                 // reported, but not blocking
    expect(w.dataLayer.length).toBe(1);
  });
  test("force:true pushes a late default anyway, but still reports late:true", () => {
    var w = { dataLayer: [], google_tag_data: { ics: {} } };
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default", force: true }), w);
    expect(res.ok).toBe(true);
    expect(res.pushed).toBe(true);
    expect(res.late).toBe(true);                 // the panel turns this into a warning
    expect(w.dataLayer.length).toBe(1);
  });
  test("on a virgin aGTM page (consent pending, GTM not injected) a default goes through", () => {
    // The realistic aGTM case: the library is present but waiting for the CMP, so the
    // pre-consent window is genuinely open — this is what makes the feature useful.
    var w = { dataLayer: [], aGTM: { c: { gdl: "dataLayer" }, d: { init: false, consent: {} } } };
    var res = run(buildGcmPushCode({ analytics_storage: "denied" }, "", { mode: "default" }), w);
    expect(res.ok).toBe(true);
    expect(res.late).toBe(false);
    expect(w.dataLayer[0][1]).toBe("default");
  });
});

describe("buildGcmPushCode — wait_for_update / region (default-only)", () => {
  test("wait_for_update rides along with a default push", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default", waitForUpdate: 500 }), w);
    expect(res.signals.wait_for_update).toBe(500);
    expect(w.dataLayer[0][2].wait_for_update).toBe(500);
  });
  test("a numeric string is accepted and rounded (the field is a text input)", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({}, "", { mode: "default", waitForUpdate: "750.4" }), w);
    expect(res.signals.wait_for_update).toBe(750);
  });
  test("junk / zero / negative wait_for_update is dropped, not sent as NaN", () => {
    var w = { dataLayer: [] };
    ["abc", "", 0, -5, null].forEach(function (v) {
      var res = run(buildGcmPushCode({}, "", { mode: "default", waitForUpdate: v }), w);
      expect(res.signals.wait_for_update).toBeUndefined();
    });
  });
  test("regions are trimmed, upper-cased and empty tokens dropped", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({}, "", { mode: "default", regions: [" de ", "", "us-ca", null] }), w);
    expect(res.signals.region).toEqual(["DE", "US-CA"]);
  });
  test("an empty region list sends no region key (global default)", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({}, "", { mode: "default", regions: ["", "  "] }), w);
    expect(res.signals.region).toBeUndefined();
  });
  test("update/declare never carry wait_for_update or region — they are default-only in the gtag API", () => {
    var w = { dataLayer: [] };
    ["update", "declare"].forEach(function (m) {
      var res = run(buildGcmPushCode({ ad_storage: "granted" }, "", {
        mode: m, waitForUpdate: 500, regions: ["DE"], force: true
      }), w);
      expect(res.signals.wait_for_update).toBeUndefined();
      expect(res.signals.region).toBeUndefined();
    });
  });
  test("signal whitelist still applies in default mode", () => {
    var w = { dataLayer: [] };
    var res = run(buildGcmPushCode({ ad_storage: "granted", bogus: "granted" }, "", { mode: "default" }), w);
    expect(res.signals.ad_storage).toBe("granted");
    expect(res.signals.bogus).toBeUndefined();
  });
});

describe("hasCls — exact class-token matching in the delegated handlers", () => {
  test("the collision it exists for: sim-gcm-mode must NOT match sim-gcm", () => {
    // Regression: the delegated change handler matched with indexOf, so clicking a
    // mode radio ran the signal-checkbox branch and wrote st.gcm[null] = "granted".
    expect(hasCls({ className: "sim-gcm-mode" }, "sim-gcm")).toBe(false);
    expect(hasCls({ className: "sim-gcm-mode" }, "sim-gcm-mode")).toBe(true);
    expect(hasCls({ className: "sim-gcm" }, "sim-gcm")).toBe(true);
  });
  test("matches one token among several", () => {
    expect(hasCls({ className: "chip sim-gcm wide" }, "sim-gcm")).toBe(true);
    expect(hasCls({ className: "sim-gcm" }, "gcm")).toBe(false);
  });
  test("missing/odd nodes never throw", () => {
    expect(hasCls(null, "sim-gcm")).toBe(false);
    expect(hasCls({}, "sim-gcm")).toBe(false);
    expect(hasCls({ className: "" }, "sim-gcm")).toBe(false);
  });
});

describe("buildGcmPushCode — critic round: guard completeness and purity", () => {
  test("a refused push does NOT touch the page (no dataLayer created as a side effect)", () => {
    var w = { google_tag_data: { ics: {} } };   // no dataLayer yet
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default" }), w);
    expect(res.ok).toBe(false);
    expect("dataLayer" in w).toBe(false);
  });
  test("google_tag_manager closes the window too — noConsent containers never set aGTM.d.init", () => {
    // initGTM(true) (noConsent) and the tab's own container override load GTM via
    // gtm_load without setting aGTM.d.init, so init alone would miss them.
    var w = { dataLayer: [], google_tag_manager: { "GTM-X": {} }, aGTM: { d: { init: false } } };
    var res = run(buildGcmPushCode({ ad_storage: "denied" }, "", { mode: "default" }), w);
    expect(res.ok).toBe(false);
    expect(res.gtmObj).toBe(true);
    expect(res.ics).toBe(false);
    expect(res.injected).toBe(false);
    expect(w.dataLayer.length).toBe(0);
  });
  test("the refusal names the signal that actually fired", () => {
    var byIcs = run(buildGcmPushCode({}, "", { mode: "default" }), { google_tag_data: { ics: {} } });
    expect(byIcs.error).toContain("google_tag_data.ics");
    var byInit = run(buildGcmPushCode({}, "", { mode: "default" }), { aGTM: { d: { init: true } } });
    expect(byInit.error).toContain("aGTM.d.init");
    var byObj = run(buildGcmPushCode({}, "", { mode: "default" }), { google_tag_manager: {} });
    expect(byObj.error).toContain("google_tag_manager");
  });
  test("force still pushes when only google_tag_manager is present", () => {
    var w = { dataLayer: [], google_tag_manager: {} };
    var res = run(buildGcmPushCode({ ad_storage: "granted" }, "", { mode: "default", force: true }), w);
    expect(res.ok).toBe(true);
    expect(res.late).toBe(true);
    expect(w.dataLayer.length).toBe(1);
  });
});

describe("Cookie reset — pattern coverage for real CMPs", () => {
  // Fake jar: getter returns the current cookie string, setter expires a named cookie.
  function jar(cookieStr) {
    var store = {};
    cookieStr.split(";").forEach(function (c) {
      var i = c.indexOf("="); if (i < 0) return;
      store[c.slice(0, i).replace(/^\s+/, "")] = c.slice(i + 1);
    });
    var w = { location: { hostname: "www.victors.de", pathname: "/", reload: function () {} } };
    w.document = {
      get cookie() {
        return Object.keys(store).map(function (k) { return k + "=" + store[k]; }).join("; ");
      },
      set cookie(v) {
        var name = v.slice(0, v.indexOf("="));
        if (/expires=[^;]*19[789]\d|expires=Thu, 01 Jan 1970/.test(v)) delete store[name];
      }
    };
    w.__store = store;
    return w;
  }

  test("the default patterns catch Consentmanager's __cmp family (the victors.de case)", () => {
    // Real names from the report: __cmpccu45430 / __cmpconsent45430. The old list had
    // "cmpsettings", which does NOT substring-match either of them.
    var w = jar("__cmpccu45430=a; __cmpconsent45430=b; _ga=keep; PHPSESSID=keep");
    var pats = splitTokens(SIM_COOKIE_DEFAULT);
    var res = run(buildCookieResetCode(pats, {}), w);
    expect(res.ok).toBe(true);
    expect(res.cleared).toContain("__cmpccu45430");
    expect(res.cleared).toContain("__cmpconsent45430");
    expect(Object.keys(w.__store).sort()).toEqual(["PHPSESSID", "_ga"]);
  });
  test("a pattern list that matches nothing reports zero — not silent success", () => {
    var w = jar("__cmpccu45430=a");
    var res = run(buildCookieResetCode(["does-not-exist"], {}), w);
    expect(res.ok).toBe(true);
    expect(res.clearedCount).toBe(0);        // the panel turns this into a warning
    expect(Object.keys(w.__store)).toEqual(["__cmpccu45430"]);
  });
  test("the old default list would have missed Consentmanager (regression guard)", () => {
    var w = jar("__cmpccu45430=a; __cmpconsent45430=b");
    var old = "CookieConsent,OptanonConsent,OptanonAlertBoxClosed,borlabs-cookie,klaro,cookiefirst,cmpsettings,consentUUID,euconsent-v2,ucData,uc_settings,ccm_consent,_iub_cs,aGTM,agtm";
    var res = run(buildCookieResetCode(splitTokens(old), {}), w);
    expect(res.clearedCount).toBe(0);
  });
});

describe("Cookie reset — wildcard patterns", () => {
  function jar(cookieStr) {
    var store = {};
    cookieStr.split(";").forEach(function (c) {
      var i = c.indexOf("="); if (i < 0) return;
      store[c.slice(0, i).replace(/^\s+/, "")] = c.slice(i + 1);
    });
    var w = { location: { hostname: "www.victors.de", pathname: "/", reload: function () {} } };
    w.document = {
      get cookie() { return Object.keys(store).map(function (k) { return k + "=" + store[k]; }).join("; "); },
      set cookie(v) { var n = v.slice(0, v.indexOf("=")); if (/1970/.test(v)) delete store[n]; }
    };
    w.__store = store;
    return w;
  }
  var JAR = "__cmpccu45430=a; __cmpconsent45430=b; _ga=x; my_consent_flag=c; PHPSESSID=y";
  function cleared(pattern) {
    return run(buildCookieResetCode(splitTokens(pattern), {}), jar(JAR)).cleared.sort();
  }

  test("a plain fragment still matches as a substring (unchanged behaviour)", () => {
    expect(cleared("__cmp")).toEqual(["__cmpccu45430", "__cmpconsent45430"]);
  });
  test("trailing * anchors the start", () => {
    expect(cleared("__cmp*")).toEqual(["__cmpccu45430", "__cmpconsent45430"]);
    expect(cleared("consent*")).toEqual([]);          // does NOT match my_consent_flag
  });
  test("leading * anchors the end", () => {
    expect(cleared("*45430")).toEqual(["__cmpccu45430", "__cmpconsent45430"]);
    expect(cleared("*flag")).toEqual(["my_consent_flag"]);
  });
  test("* in the middle fixes both ends", () => {
    expect(cleared("__cmp*45430")).toEqual(["__cmpccu45430", "__cmpconsent45430"]);
    expect(cleared("__cmp*nope")).toEqual([]);
  });
  test("a lone * matches everything, like an empty list", () => {
    expect(cleared("*").length).toBe(5);
  });
  test("regex metacharacters in a pattern stay literal", () => {
    // "_ga." must not match "_gax" — without escaping, the dot would be "any char".
    var w = jar("_ga.x=1; _gax=2");
    var res = run(buildCookieResetCode(["_ga."], {}), w);
    expect(res.cleared).toEqual(["_ga.x"]);
  });
  test("an unusable pattern is skipped without killing the run", () => {
    var w = jar(JAR);
    var res = run(buildCookieResetCode(["__cmp", "["], {}), w);
    expect(res.ok).toBe(true);
    expect(res.cleared).toContain("__cmpccu45430");
  });
});

// ── Third-party CMP frames ──────────────────────────────────────────────────
// The reset can only reach the CMP's own copy (cookies on .consentmanager.net +
// localStorage under cdn.consentmanager.net) by running INSIDE that frame. DevTools
// addresses a frame by its EXACT document URL — an origin matches nothing (F-115) —
// so the candidate list must come from the document-typed resources, not from every
// resource host.
describe("pickFrameDocs — which frames the reset additionally runs in", () => {
  const PAGE = [
    { url: "https://www.victors.de/", type: "document" },
    { url: "https://www.victors.de/js/main.js", type: "script" },
    { url: "https://cdn.consentmanager.net/delivery/cmp.js", type: "script" },
    { url: "https://cdn.consentmanager.net/delivery/cmp.php?id=45430", type: "document" },
    { url: "https://www.googletagmanager.com/gtm.js?id=GTM-X", type: "script" },
    { url: "https://fonts.gstatic.com/s/font.woff2", type: "font" }
  ];

  test("picks the CMP frame document, not its scripts and not other hosts", () => {
    expect(pickFrameDocs(PAGE, "www.victors.de")).toEqual([
      { url: "https://cdn.consentmanager.net/delivery/cmp.php?id=45430", host: "cdn.consentmanager.net" }
    ]);
  });
  test("a script-only third party never becomes a candidate", () => {
    // This is the F-115 regression: gtm.js / font CDNs are resource origins, not frames.
    const hosts = pickFrameDocs(PAGE, "www.victors.de").map((d) => d.host);
    expect(hosts).not.toContain("www.googletagmanager.com");
    expect(hosts).not.toContain("fonts.gstatic.com");
  });
  test("the page's own documents are skipped — the top-frame pass covers them", () => {
    const docs = pickFrameDocs([
      { url: "https://victors.de/", type: "document" },
      { url: "https://rp.victors.de/embed.html", type: "document" },
      { url: "https://cdn.consentmanager.net/x.php", type: "document" }
    ], "victors.de");
    expect(docs.map((d) => d.host)).toEqual(["cdn.consentmanager.net"]);
  });
  test("a host merely ENDING in the page host is not the page's own site", () => {
    const docs = pickFrameDocs([{ url: "https://notvictors.de/x.html", type: "document" }], "victors.de");
    expect(docs.map((d) => d.host)).toEqual(["notvictors.de"]);
  });
  test("non-http documents, junk and duplicates are dropped", () => {
    const docs = pickFrameDocs([
      { url: "about:blank", type: "document" },
      { url: "data:text/html,x", type: "document" },
      { url: "chrome-extension://abc/panel.html", type: "document" },
      { url: null, type: "document" },
      {},
      { url: "https://cdn.consentmanager.net/x.php", type: "document" },
      { url: "https://cdn.consentmanager.net/x.php", type: "document" }
    ], "www.victors.de");
    expect(docs.length).toBe(1);
  });
  test("the candidate list is capped so one click cannot fan out unbounded", () => {
    const many = [];
    for (let i = 0; i < 30; i++) many.push({ url: "https://f" + i + ".example.com/x.html", type: "document" });
    expect(pickFrameDocs(many, "victors.de").length).toBe(8);
    expect(pickFrameDocs(many, "victors.de", 3).length).toBe(3);
  });
  test("no resources / no page host → empty, never throws", () => {
    expect(pickFrameDocs(null, "")).toEqual([]);
    expect(pickFrameDocs([{ url: "https://a.de/x.html", type: "document" }], "")).toHaveLength(1);
  });
});

describe("formatFramePass — the frame pass is always reported", () => {
  test("switched off → says nothing at all", () => {
    expect(formatFramePass(null)).toBe("");
  });
  test("nothing deleted anywhere still points at incognito", () => {
    // The failure that matters: the user believes the reset worked, the CMP restores
    // its consent from its own origin, and the 'first visit' was never one.
    expect(formatFramePass({ discovered: true, checked: 0, reached: 0, cookies: [], ls: 0, fails: [] })).toContain("Inkognito");
    expect(formatFramePass({ discovered: true, checked: 1, reached: 0, cookies: [], ls: 0, fails: [{ host: "cdn.consentmanager.net", why: "Permission denied" }] }))
      .toContain("Inkognito");
    expect(formatFramePass({ discovered: true, checked: 1, reached: 1, cookies: [], ls: 0, fails: [] })).toContain("Inkognito");
  });
  test("an unreachable frame names the host and the reason", () => {
    const s = formatFramePass({ discovered: true, checked: 2, reached: 0, cookies: [], ls: 0, fails: [{ host: "cdn.consentmanager.net", why: "Permission denied" }] });
    expect(s).toContain("cdn.consentmanager.net");
    expect(s).toContain("Permission denied");
  });
  test("a successful pass names what went, per host", () => {
    const s = formatFramePass({
      discovered: true, checked: 2, reached: 1, ls: 3, fails: [],
      cookies: ["cdn.consentmanager.net:__cmpconsent45430", "cdn.consentmanager.net:__cmpccu45430"]
    });
    expect(s).toContain("1/2 erreicht");
    expect(s).toContain("__cmpconsent45430");
    expect(s).toContain("localStorage: 3");
    expect(s).not.toContain("Inkognito");   // it worked — no need to send the user away
  });
});

// ── Cross-site cookies (the CMP's own) ──────────────────────────────────────
// A CMP's cookies are cross-site cookies: SameSite=None; Secure. Inside its
// third-party frame Chrome REJECTS a document.cookie write that would default to
// SameSite=Lax — so an expiry written bare never lands and the cookie survives, which
// is exactly what happened on victors.de (localStorage gone, __cmpccu45430 and
// __cmpconsent45430 on .consentmanager.net still there).
describe("buildCookieResetCode — third-party cookie attributes and verification", () => {
  // Cookie jar of a CROSS-SITE frame: a write is only accepted when it carries
  // SameSite=None (Chrome's rule), mirroring the CMP frame.
  function crossSiteJar(cookieStr, opts) {
    opts = opts || {};
    var store = {};
    cookieStr.split(";").forEach(function (c) {
      var i = c.indexOf("="); if (i < 0) return;
      store[c.slice(0, i).replace(/^\s+/, "")] = c.slice(i + 1);
    });
    var w = { location: { hostname: "cdn.consentmanager.net", pathname: "/delivery/cmp.php", reload: function () {} } };
    w.document = {
      get cookie() {
        return Object.keys(store).map(function (k) { return k + "=" + store[k]; }).join("; ");
      },
      set cookie(v) {
        if (!/SameSite=None/i.test(v)) return;              // cross-site: rejected
        if (opts.httpOnly && v.indexOf(opts.httpOnly) === 0) return;   // not ours to delete
        var name = v.slice(0, v.indexOf("="));
        if (/expires=Thu, 01 Jan 1970/.test(v)) delete store[name];
      }
    };
    w.__store = store;
    return w;
  }
  const CMP = "__cmpccu45430=a; __cmpconsent45430=b; other=keep";

  test("the CMP's cross-site cookies are actually removed", () => {
    const w = crossSiteJar(CMP);
    const res = run(buildCookieResetCode(["__cmp"], {}), w);
    expect(res.cleared.sort()).toEqual(["__cmpccu45430", "__cmpconsent45430"]);
    expect(res.failed).toEqual([]);
    expect(Object.keys(w.__store)).toEqual(["other"]);
  });
  test("the expiry is written for .consentmanager.net with SameSite=None; Secure", () => {
    const code = buildCookieResetCode(["__cmp"], {});
    expect(code).toContain("SameSite=None; Secure");
    // Both variants are written — the bare one still has to work on ordinary cookies.
    expect(code).toContain("attrs=['','; SameSite=None; Secure']");
  });
  test("what could NOT be deleted is reported as such, never as cleared", () => {
    // HttpOnly-ish: visible in this fake jar but not removable from JS. The point is the
    // report — a deletion that did not happen must not be announced as one.
    const w = crossSiteJar(CMP, { httpOnly: "__cmpconsent45430" });
    const res = run(buildCookieResetCode(["__cmp"], {}), w);
    expect(res.cleared).toEqual(["__cmpccu45430"]);
    expect(res.failed).toEqual(["__cmpconsent45430"]);
    expect(res.clearedCount).toBe(1);
  });
  test("nothing matching → nothing claimed, nothing blamed", () => {
    const res = run(buildCookieResetCode(["zzz"], {}), crossSiteJar(CMP));
    expect(res.cleared).toEqual([]);
    expect(res.failed).toEqual([]);
  });
});

describe("formatFramePass — cookies that survived the frame pass", () => {
  test("a surviving cookie is named and sends the user to incognito", () => {
    const s = formatFramePass({
      discovered: true, checked: 1, reached: 1, cookies: [], ls: 2, fails: [],
      stuck: ["cdn.consentmanager.net:__cmpconsent45430"]
    });
    expect(s).toContain("__cmpconsent45430");
    expect(s).toContain("Inkognito");
  });
  test("a clean pass stays quiet about survivors", () => {
    const s = formatFramePass({ discovered: true, checked: 1, reached: 1, cookies: ["a:b"], ls: 0, fails: [], stuck: [] });
    expect(s).not.toContain("blieben liegen");
    expect(s).not.toContain("Inkognito");
  });
});

// ── same-site check ─────────────────────────────────────────────────────────
// The frame candidates are filtered against the page's own host. The first version
// did that with index arithmetic (`indexOf("." + b) === a.length - b.length - 1`),
// which calls two EQUAL-LENGTH hosts the same site — indexOf's miss is -1, and so is
// the computed offset. On such a page the CMP frame was dropped and the effect line
// claimed there were no foreign frames at all: a silent, page-deterministic failure.
describe("sameSite — page host vs. frame host", () => {
  test("a foreign host that happens to be exactly as long is NOT the same site", () => {
    expect(sameSite("cmp-serv.de", "meinshop.de")).toBe(false);   // both 11 chars
    expect(sameSite("foobarba.de", "example.com")).toBe(false);
    expect(pickFrameDocs([{ url: "https://cmp-serv.de/f.html", type: "document" }], "meinshop.de"))
      .toHaveLength(1);                                            // the frame survives the filter
  });
  test("equal and sub-domain in both directions ARE the same site", () => {
    expect(sameSite("victors.de", "victors.de")).toBe(true);
    expect(sameSite("rp.victors.de", "victors.de")).toBe(true);
    expect(sameSite("victors.de", "rp.victors.de")).toBe(true);
  });
  test("a suffix that is not on a label boundary is a different site", () => {
    expect(sameSite("notvictors.de", "victors.de")).toBe(false);
    expect(sameSite("victors.de.evil.com", "victors.de")).toBe(false);
  });
  test("empty input is never the same site", () => {
    expect(sameSite("", "victors.de")).toBe(false);
    expect(sameSite("victors.de", "")).toBe(false);
  });
});

describe("formatFramePass — what was NOT established must not be stated", () => {
  test("a discovery that never came back is admitted, not turned into a finding", () => {
    const s = formatFramePass({ discovered: false, checked: 0, reached: 0, cookies: [], ls: 0, fails: [] });
    expect(s).toContain("nicht ermittelt");
    expect(s).not.toContain("Keine fremden Frames im Seitenbaum");   // that would be a claim
    expect(s).toContain("Inkognito");
  });
  test("frames beyond the per-click cap are reported, never silently dropped", () => {
    const s = formatFramePass({ discovered: true, checked: 8, skipped: 3, reached: 8, cookies: ["a:b"], ls: 0, fails: [], stuck: [] });
    expect(s).toContain("3 weitere nicht geprüft");
  });
});

describe("formatFramePass — a partial success must not hide the rest", () => {
  test("frames that refused are named even when another one succeeded", () => {
    // A single success used to swallow every other failure — and with it the reason a
    // CMP copy survived. The number "1/3" alone reads like success.
    const s = formatFramePass({
      discovered: true, checked: 3, reached: 1, ls: 0, stuck: [],
      cookies: ["cdn.cmp.net:__cmpX"],
      fails: [{ host: "consent.cookiebot.com", why: "there is no frame with URL …" },
              { host: "sso.example.com", why: "Permission denied" }]
    });
    expect(s).toContain("consent.cookiebot.com");
    expect(s).toContain("Permission denied");
    expect(s).toContain("Inkognito");
  });
  test("frames still busy at the timeout are 'open', not 'unreachable'", () => {
    // They may well have deleted something — the eval keeps running in the frame. Saying
    // "the CMP copy stays" would be an invented fact.
    const s = formatFramePass({ discovered: true, checked: 3, pending: 2, reached: 1, cookies: ["a:b"], ls: 0, fails: [], stuck: [] });
    expect(s).toContain("nicht rechtzeitig geantwortet");
    expect(s).not.toContain("nicht erreichbar");
  });
  test("a localStorage-only hit renders without a dangling arrow", () => {
    const s = formatFramePass({ discovered: true, checked: 1, reached: 1, cookies: [], ls: 4, fails: [], stuck: [] });
    expect(s).toContain("localStorage: 4");
    expect(s).not.toContain("→");
  });
  test("a pass that was deliberately skipped says so instead of staying silent", () => {
    const s = formatFramePass({ off: "leeres Musterfeld" });
    expect(s).toContain("nicht angefasst");
    expect(s).toContain("leeres Musterfeld");
    expect(s).toContain("Inkognito");
  });
});

// ── the reset must cover aGTM's OWN user-id cookie and deeper cookie paths ──────
describe("buildCookieResetCode — coverage gaps found by review", () => {
  function jarAt(pathname, cookieStr) {
    // Cookies remember the path they were set for; a delete only lands when the write
    // carries that exact path — which is what the grid has to reproduce.
    var store = {};
    cookieStr.split(";").forEach(function (c) {
      var i = c.indexOf("="); if (i < 0) return;
      var name = c.slice(0, i).replace(/^\s+/, "");
      var v = c.slice(i + 1).split("@");
      store[name] = { val: v[0], path: v[1] || "/" };
    });
    var w = { location: { hostname: "www.shop.de", pathname: pathname, reload: function () {} } };
    w.document = {
      get cookie() {
        return Object.keys(store).map(function (k) { return k + "=" + store[k].val; }).join("; ");
      },
      set cookie(v) {
        var name = v.slice(0, v.indexOf("="));
        var m = /path=([^;]*)/.exec(v);
        if (!store[name] || !/expires=Thu, 01 Jan 1970/.test(v)) return;
        if (m && m[1] === store[name].path) delete store[name];
      }
    };
    w.__store = store;
    return w;
  }

  test("_TPU — the sGTM Client's default user-id cookie — is in the shipped patterns", () => {
    // Missing it made the reset useless on a Client-served site: the cookie survives, the
    // next /aGTM.js resolves the uid, the stored consent comes back as cfg.session.consent
    // and GTM injects with no banner — a "first visit" that never was one.
    expect(SIM_COOKIE_DEFAULT).toContain("_TPU");
    var w = jarAt("/", "_TPU=C.1.abc; PHPSESSID=keep");
    var res = run(buildCookieResetCode(splitTokens(SIM_COOKIE_DEFAULT), {}), w);
    expect(res.cleared).toEqual(["_TPU"]);
    expect(Object.keys(w.__store)).toEqual(["PHPSESSID"]);
  });
  test("a cookie scoped to a parent path is reached from a deep page", () => {
    var w = jarAt("/de/produkt/42", "OptanonConsent=x@/de/; __cmpconsent1=y@/");
    var res = run(buildCookieResetCode(["Optanon", "__cmp"], {}), w);
    expect(res.cleared.sort()).toEqual(["OptanonConsent", "__cmpconsent1"]);
    expect(res.failed).toEqual([]);
  });
  test("a cookie on an unrelated path is honestly reported as still there", () => {
    var w = jarAt("/de/", "OptanonConsent=x@/en/shop/");
    var res = run(buildCookieResetCode(["Optanon"], {}), w);
    expect(res.cleared).toEqual([]);
    expect(res.failed).toEqual(["OptanonConsent"]);
  });
});

// The default patterns are the feature: a name they miss is a cookie that survives, and
// the survivor then gets blamed on the CMP's own origin. These pin what must be hit and
// what must never be — including the localStorage keys four bundled adapters read.
describe("SIM_COOKIE_DEFAULT — coverage of what aGTM's own adapters actually read", () => {
  const pats = SIM_COOKIE_DEFAULT.split(",");
  const hit = (k) => pats.some((p) => k.indexOf(p) >= 0);

  test("the localStorage keys of the LS-based adapters are covered", () => {
    // cc_matomo / cc_jtl_consent read localStorage 'consent', cc_tramino
    // 'consentPermission', cc_perspectivefunnel 'perspective.tracking-preferences.<id>'.
    // Without these the banner never comes back and the third-party origin gets blamed.
    expect(hit("consent")).toBe(true);
    expect(hit("consentPermission")).toBe(true);
    expect(hit("perspective.tracking-preferences.42")).toBe(true);
  });
  test("aGTM's own user-id cookie is covered on both naming paths", () => {
    expect(hit("_TPU")).toBe(true);      // sGTM Client default (cookie_name)
    expect(hit("_tpf")).toBe(true);
    expect(hit("aGTMoptout")).toBe(true); // a stuck opt-out looks exactly like "aGTM broken"
  });
  test("the common CMP cookies are covered", () => {
    ["__cmpconsent45430", "__cmpccu45430", "CookieConsent", "OptanonConsent",
     "OptanonAlertBoxClosed", "mtm_consent", "_tracking_consent", "cmpsettings",
     "consentUUID", "euconsent-v2", "ccm_consent", "_iub_cs", "didomi_token"]
      .forEach((n) => expect([n, hit(n)]).toEqual([n, true]));
  });
  test("session and login cookies are NOT touched", () => {
    ["PHPSESSID", "JSESSIONID", "sid", "cart", "auth_token", "csrftoken", "XSRF-TOKEN",
     "wp-settings-1", "_ga", "__Secure-1PSID"].forEach((n) => expect([n, hit(n)]).toEqual([n, false]));
  });
});
