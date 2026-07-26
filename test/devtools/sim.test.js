// Unit tests for the Simulation-tab pure code builders
// (devtools-extension/sim.js → window.aGTMInspectorSim). These build the MUTATING
// eval strings the Simulation tab injects into the page. We both (a) assert the
// generated string shape and (b) EXECUTE it against a fake window.aGTM so a
// string-building bug (bad escaping, wrong comma-wrap, missing run_cc) fails here
// instead of silently no-op'ing in the browser.

import { test, expect, describe } from "bun:test";
import {
  commaWrap, splitTokens, stubBody,
  buildConsentCode, buildDenyCode, buildCmpMockCode,
  buildResetCode, buildRestoreCode, buildFireCode, buildInjectCode, buildProbeCode
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
    if (action === "update" && !A.d.init && A.d.consent.gtmConsent) A.f.inject();
    return true;
  };
  A.f.fire = function (o) { calls.push(["fire", o]); w.dataLayer.push(o); };
  A.f.inject = function () { calls.push(["inject"]); A.d.init = true; };
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

describe("buildCmpMockCode — persistent stub + run_cc", () => {
  test("installs a stub and evaluates it", () => {
    var w = fakeAGTM();
    var res = run(buildCmpMockCode({ services: ["A"] }), w);
    expect(res.ok).toBe(true);
    expect(res.simActive).toBe(true);
    expect(typeof w.aGTM.f.__inspOrigCC).toBe("function");
    // the stub stays installed → a later run_cc still yields the mocked consent
    w.aGTM.d.consent = {};
    w.aGTM.f.run_cc("update");
    expect(w.aGTM.d.consent.services).toBe(",A,");
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
  test("inject forces aGTM.f.inject()", () => {
    var w = fakeAGTM();
    var res = run(buildInjectCode(), w);
    expect(res.ok).toBe(true);
    expect(w.aGTM.d.init).toBe(true);
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
  test("backs up via __inspOrigCC=__inspOrigCC||consent_check (once)", () => {
    expect(stubBody({}).indexOf("A.f.__inspOrigCC=A.f.__inspOrigCC||A.f.consent_check")).toBeGreaterThanOrEqual(0);
  });
});
