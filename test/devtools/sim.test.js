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
  buildResetCode, buildRestoreCode, buildFireCode, buildInjectCode, buildProbeCode,
  buildBlockCode, buildUnblockCode, buildInjectIntegrationCode, simSelection
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
