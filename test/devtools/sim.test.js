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
  buildLoadContainerCode, GCM_SIGNALS
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
  var A = { c: { gdl: "dataLayer" }, d: { consent: {}, init: false, last_consent_hash: "x" }, f: {} };
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
  A.f.gtm_load = function (win, doc, id, idParam, gdl, cfg) { calls.push(["gtm_load", id, idParam, gdl]); };
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
    expect(w.__calls.filter(function (c) { return c[0] === "gtm_load"; }).map(function (c) { return c[1]; }))
      .toEqual(["GTM-TEST1", "GTM-TEST2"]);
    // registered + marked loaded so a later initGTM won't reload them
    expect(w.aGTM.c.gtm["GTM-TEST1"].hasLoaded).toBe(true);
    expect(w.aGTM.c.gtm["GTM-TEST2"].hasLoaded).toBe(true);
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
