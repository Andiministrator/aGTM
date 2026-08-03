// Unit tests for devtools-extension/cmpdetect.js — "which consent tool is running?".
//
// Three things are worth proving here, and they fail in different ways:
//   1. the MATCHER maps evidence to the right CMP (and refuses the ambiguous ones),
//   2. the generated PAGE PROBE actually collects that evidence — a table nobody
//      probes is the "Fake-DOM verschluckte Listener" failure class all over again,
//   3. the table does not DRIFT away from cmp/: a new adapter must be either matched
//      or explicitly listed as undetectable, never silently absent.
import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const D = require(join(import.meta.dir, "..", "..", "devtools-extension", "cmpdetect.js"));

// ── page-probe harness ──────────────────────────────────────────────────────
// The probe is evaluated with an INJECTED `window`, not the real global, so the
// fake page can be shaped freely and nothing leaks into other test files.
function makeWin(opts) {
  opts = opts || {};
  const lsData = opts.ls || {};
  const ssData = opts.ss || {};
  const lsKeys = Object.keys(lsData);
  const store = (data, keys) => ({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    get length() { return keys ? keys.length : 0; },
    key: (i) => (keys ? (keys[i] === undefined ? null : keys[i]) : null)
  });
  const win = Object.assign({}, opts.globals || {});
  win.document = { cookie: opts.cookie || "" };
  win.localStorage = opts.storageThrows
    ? new Proxy({}, { get() { throw new Error("SecurityError"); } })
    : store(lsData, lsKeys);
  win.sessionStorage = opts.storageThrows
    ? new Proxy({}, { get() { throw new Error("SecurityError"); } })
    : store(ssData, Object.keys(ssData));
  return win;
}

function probe(win) {
  return new Function("window", "return " + D.buildProbeCode())(win);
}
// evidence → detection, going through the real probe (not a hand-written object).
function detectOn(opts) {
  return D.detect(probe(makeWin(opts)));
}
const labels = (r) => r.matches.map((m) => m.label);

describe("cmpdetect — matcher", () => {
  test("names a CMP from a single distinctive global", () => {
    expect(labels(detectOn({ globals: { CCM: {} } }))).toEqual(["CCM19"]);
    expect(labels(detectOn({ globals: { Cookiebot: { consent: {} } } }))).toEqual(["Cookiebot"]);
    expect(labels(detectOn({ globals: { CookieFirst: { hasConsented: true } } }))).toEqual(["CookieFirst"]);
    expect(labels(detectOn({ globals: { __cmp: function () {} } }))).toEqual(["Consentmanager (CMP)"]);
  });

  test("a bare vendor global is not the tool — an empty stub must not read as 'sicher'", () => {
    // window.Cookiebot = {} happens: a blocker placeholder, an aborted CMP load, a tag
    // manager stub. The adapters check more than the name, so the signatures do too.
    expect(labels(detectOn({ globals: { Cookiebot: {} } }))).toEqual([]);
    expect(labels(detectOn({ globals: { CookieFirst: {} } }))).toEqual([]);
    expect(labels(detectOn({ globals: { Cookiebot: { consent: {} } } }))).toEqual(["Cookiebot"]);
    expect(labels(detectOn({ globals: { CookieFirst: { hasConsented: false } } }))).toEqual(["CookieFirst"]);
  });

  test("a generic global name alone is not enough — the method decides", () => {
    // `cc` / `sp` are names any page could use for anything.
    expect(labels(detectOn({ globals: { cc: {} } }))).toEqual([]);
    expect(labels(detectOn({ globals: { cc: { getUserPreferences: function () {} } } })))
      .toEqual(["Orestbida CookieConsent"]);
    expect(labels(detectOn({ globals: { sp: function () {} } }))).toEqual([]);
    const sp = function () {}; sp.allGivenConsents = {};
    expect(labels(detectOn({ globals: { sp: sp } }))).toEqual(["Secure Privacy"]);
  });

  test("null never satisfies an object condition", () => {
    expect(labels(detectOn({ globals: { CCM: null } }))).toEqual([]);
  });

  test("Usercentrics v2 and v3 are told apart", () => {
    expect(labels(detectOn({ globals: { UC_UI: { getServicesBaseInfo: function () {} } } })))
      .toEqual(["Usercentrics v2"]);
    expect(labels(detectOn({ globals: { __ucCmp: { cmpController: {} } } })))
      .toEqual(["Usercentrics v3"]);
  });

  test("Usercentrics v3's UC_UI compatibility layer must not report v2 as well", () => {
    // Measured on a live shop (2026-08-03), web.cmp.usercentrics.eu/ui/v/4.9.0: v3
    // publishes __ucCmp.cmpController AND a working UC_UI incl. getServicesBaseInfo.
    // Before the deny rule the card listed v2 and v3 side by side, both "sicher".
    const r = detectOn({
      globals: {
        __ucCmp: { cmpController: { consent: {}, dps: {} }, cmpView: {} },
        UC_UI: { getServicesBaseInfo: function () { return []; } }
      }
    });
    expect(labels(r)).toEqual(["Usercentrics v3"]);
  });

  test("a platform consent API never competes with the real CMP", () => {
    // Same page: Shopify.customerPrivacy is fully present, but the banner is Usercentrics.
    const r = detectOn({
      globals: {
        __ucCmp: { cmpController: {} },
        Shopify: { customerPrivacy: { currentVisitorConsent: function () {} } }
      }
    });
    expect(r.cmps.map((x) => x.label)).toEqual(["Usercentrics v3"]);
    expect(r.platforms.map((x) => x.label)).toEqual(["Shopify Consent-API"]);
    // …and it always sorts behind the CMP, whatever the table order is.
    expect(labels(r)).toEqual(["Usercentrics v3", "Shopify Consent-API"]);
  });

  test("kind outranks confidence and table order in `matches`", () => {
    // Shopware 6 is `medium` like the Shopify API AND sits later in the table, so
    // confidence and order both put Shopify first — only the kind rule flips it.
    // (Without this case the kind rule was dead code the suite never noticed.)
    const r = detectOn({ globals: { Shopify: {} }, cookie: "cookie-preference=1" });
    expect(labels(r)).toEqual(["Shopware 6 Cookie", "Shopify Consent-API"]);
    expect(r.matches[0].kind).toBe("cmp");
    expect(r.matches[1].kind).toBe("platform");
  });

  test("equal-rank hits keep the table order (stable, not arbitrary)", () => {
    // Both strong CMPs: only the table position decides, and it must not flip around
    // between polls — the card lists them and explicitly refuses to crown one.
    const r = detectOn({
      globals: { Cookiebot: { consent: {} }, CookieFirst: { hasConsented: true } }
    });
    expect(labels(r)).toEqual(["Cookiebot", "CookieFirst"]);
  });

  test("the Orestbida cookie does not make a non-Magento page 'Magento'", () => {
    // cc_cookie is Orestbida CookieConsent's DEFAULT cookie name; the Magento adapter
    // parses exactly that library's payload. v2 exposes `cc`, v3 `CookieConsent`.
    const v2 = detectOn({ globals: { cc: { getUserPreferences: function () {} } }, cookie: "cc_cookie=1" });
    expect(labels(v2)).toEqual(["Orestbida CookieConsent"]);
    const v3 = detectOn({ globals: { CookieConsent: {} }, cookie: "cc_cookie=1" });
    expect(labels(v3)).toEqual([]);   // we have no v3 adapter — say nothing, don't say "Magento"
    // Without either library visible the Magento adapter is still the best guess…
    const bare = detectOn({ cookie: "cc_cookie=1" });
    expect(labels(bare)).toEqual(["Magento CC Cookie"]);
    // …but it must carry the caveat that the cookie is not Magento-specific.
    expect(bare.matches[0].caveat).toContain("Orestbida");
  });

  test("cookie/storage-only signatures are flagged as post-decision", () => {
    // Their artefact appears only AFTER the visitor answered, so absence proves nothing
    // — the opposite of a JS-API signature, and the card has to word it differently.
    expect(detectOn({ cookie: "cookie-preference=1" }).matches[0].postDecision).toBe(true);
    expect(detectOn({ globals: { CCM: {} } }).matches[0].postDecision).toBe(false);
  });

  test("a Shopify shop with no detectable CMP still reports the platform API", () => {
    const r = detectOn({ globals: { Shopify: {} } });
    expect(r.cmps).toEqual([]);
    expect(r.platforms.map((x) => x.label)).toEqual(["Shopify Consent-API"]);
  });

  test("Borlabs 2 and 3 are told apart by getCookie(), as the adapter does", () => {
    const v2 = detectOn({
      globals: { BorlabsCookie: { getCookie: function () {} }, borlabsCookieConfig: { cookies: {} } }
    });
    expect(labels(v2)).toEqual(["Borlabs Cookie 2"]);
    expect(v2.matches[0].extra).toContain("borlabsCookieConfig.cookies (object)");

    const v3 = detectOn({
      globals: { BorlabsCookie: { Cookie: {} }, borlabsCookieConfig: { serviceGroups: {} } }
    });
    expect(labels(v3)).toEqual(["Borlabs Cookie 3"]);
  });

  test("JTL Consent and Matomo share localStorage.consent — only one may match", () => {
    expect(labels(detectOn({ ls: { consent: "{}" } }))).toEqual(["JTL Consent"]);
    expect(labels(detectOn({ ls: { consent: "{}" }, ss: { "consent-cache": "{}" } })))
      .toEqual(["Matomo CMP"]);
  });

  test("cookie-based CMPs match on cookie presence, anchored to the full name", () => {
    expect(labels(detectOn({ cookie: "acris_cookie_acc=1; acris_cookie_first_activated=1" })))
      .toEqual(["Shopware Acris Cookie"]);
    expect(labels(detectOn({ cookie: "cookie-preference=1" }))).toEqual(["Shopware 6 Cookie"]);
    expect(labels(detectOn({ cookie: "cookiePreferences=%7B%7D" }))).toEqual(["Shopware 5 Cookie"]);
    // A cookie whose name merely CONTAINS a signature name must not match.
    expect(labels(detectOn({ cookie: "my_cc_cookie=1" }))).toEqual([]);
    expect(labels(detectOn({ cookie: "cc_cookie=1" }))).toEqual(["Magento CC Cookie"]);
  });

  test("Shopify matches on the platform global; the lazy consent API is extra evidence", () => {
    const bare = detectOn({ globals: { Shopify: {} } });
    expect(labels(bare)).toEqual(["Shopify Consent-API"]);
    expect(bare.matches[0].kind).toBe("platform");
    expect(bare.matches[0].extra).toEqual([]);
    const withApi = detectOn({ globals: { Shopify: { customerPrivacy: {} } } });
    expect(withApi.matches[0].extra).toContain("Shopify.customerPrivacy (object)");
  });

  test("every signature declares its kind; only the platform API is not a CMP", () => {
    const D2 = require(join(import.meta.dir, "..", "..", "devtools-extension", "cmpdetect.js"));
    const platforms = D2.SIGNATURES.filter((s) => s.kind === "platform").map((s) => s.key);
    expect(platforms).toEqual(["shopify_consent"]);
  });

  test("strong matches rank before medium ones", () => {
    const r = detectOn({ globals: { Cookiebot: { consent: {} } }, cookie: "cookie-preference=1" });
    expect(labels(r)).toEqual(["Cookiebot", "Shopware 6 Cookie"]);
    expect(r.matches[0].confidence).toBe("strong");
    expect(r.matches[1].confidence).toBe("medium");
  });

  test("an empty page yields no match and no framework", () => {
    const r = detectOn({});
    expect(r.matches).toEqual([]);
    expect(r.frameworks).toEqual([]);
    expect(r.storageBlocked).toBe(false);
  });

  test("TCF/GPP/USP are reported as context, never as a vendor match", () => {
    const r = detectOn({ globals: { __tcfapi: function () {}, __gpp: function () {} } });
    expect(r.matches).toEqual([]);
    expect(r.frameworks).toEqual(["IAB TCF (__tcfapi)", "IAB GPP (__gpp)"]);
  });

  test("blocked storage is reported, not silently read as 'no keys'", () => {
    // Otherwise a storage-based CMP looks identical to an absent one.
    const r = detectOn({ storageThrows: true, globals: { Cookiebot: { consent: {} } } });
    expect(r.storageBlocked).toBe(true);
    expect(labels(r)).toEqual(["Cookiebot"]);
  });

  test("every match carries the adapter file its signature came from", () => {
    const r = detectOn({ globals: { PPConsentManager: { hasConsentCategory: function () {} } } });
    expect(r.matches[0].adapter).toBe("cc_ppcm");
    expect(r.matches[0].proof).toContain("PPConsentManager.hasConsentCategory (function)");
  });
});

describe("cmpdetect — page probe", () => {
  test("probes only the names the table needs (no window enumeration)", () => {
    const spec = D.probeSpec();
    const code = D.buildProbeCode();
    // Every probed global appears in the generated code, and nothing enumerates window.
    spec.globals.forEach((g) => expect(code).toContain(g));
    expect(code).not.toContain("for(var k in w)");
    expect(code).not.toContain("Object.keys(w)");
  });

  test("collects existence/typeof — never a cookie or storage VALUE", () => {
    const ev = probe(makeWin({
      globals: { CCM: {} }, cookie: "cc_cookie=%7Bsecret%7D", ls: { consent: "SECRET-VALUE" }
    }));
    expect(ev.globals.CCM).toBe("object");
    expect(ev.cookies.cc_cookie).toBe(true);
    expect(ev.ls.consent).toBe(true);
    expect(JSON.stringify(ev)).not.toContain("SECRET");
    expect(JSON.stringify(ev)).not.toContain("secret");
  });

  test("the probe writes nothing to the page", () => {
    // The read-only guarantee is the whole reason this may run before any consent
    // decision. A trap that THROWS would prove nothing: the probe is wrapped in
    // try/catch, so it would swallow the throw and the test would pass on a probe
    // that writes (verified — that mutation survived). Record instead of throwing.
    const writes = [];
    const spy = (target) => new Proxy(target, {
      set: function (t, k, v) { writes.push(String(k)); t[k] = v; return true; },
      defineProperty: function (t, k, d) { writes.push(String(k)); Object.defineProperty(t, k, d); return true; },
      deleteProperty: function (t, k) { writes.push("delete " + String(k)); delete t[k]; return true; }
    });
    const base = makeWin({ globals: { CCM: {} }, cookie: "cc_cookie=1", ls: { consent: "{}" } });
    base.document = spy(base.document);
    const ev = probe(spy(base));
    expect(writes).toEqual([]);
    expect(ev.error).toBeUndefined();   // and it really ran, rather than bailing out
    expect(ev.globals.CCM).toBe("object");
  });

  test("resolves dotted paths without throwing on missing intermediates", () => {
    const ev = probe(makeWin({ globals: { BorlabsCookie: {} } }));
    expect(ev.globals["BorlabsCookie.getCookie"]).toBe("undefined");
    expect(ev.globals["Optanon.GetDomainData"]).toBe("undefined");
  });

  test("a localStorage prefix hit is found when its gate global is present", () => {
    const ls = { "perspective.tracking-preferences.abc": "{}" };
    for (let i = 0; i < 500; i++) ls["junk" + i] = "x";
    // The wanted key is first, so a capped scan still finds it; the cap only bounds work.
    const ev = probe(makeWin({ ls, globals: { perspectiveData: { campaignId: "abc" } } }));
    expect(ev.lsp["perspective.tracking-preferences."]).toBe(true);
  });

  test("the prefix scan does not run at all without its gate global", () => {
    // It is the only unbounded work in the probe and it gates nothing (the prefix is
    // `extra` evidence), so on every page that cannot be Perspective it must not touch
    // localStorage at all — otherwise a big-storage SPA pays for it on every poll.
    let keyCalls = 0;
    const win = makeWin({});
    win.localStorage = {
      getItem: () => null,
      get length() { return 5000; },
      key: () => { keyCalls++; return "junk"; }
    };
    const ev = probe(win);
    expect(keyCalls).toBe(0);
    expect(ev.lsp["perspective.tracking-preferences."]).toBe(false);
  });

  test("a gated scan is still capped at 300 keys", () => {
    // The cap is the protection against a page with a huge localStorage stalling the
    // 700 ms poll. Without this test the bound was pure comment (the mutation survived).
    let keyCalls = 0;
    const win = makeWin({ globals: { perspectiveData: { campaignId: "abc" } } });
    win.localStorage = {
      getItem: () => null,
      get length() { return 100000; },
      key: () => { keyCalls++; return "junk"; }
    };
    probe(win);
    expect(keyCalls).toBe(300);
  });

  test("a throwing storage sets storageBlocked instead of killing the probe", () => {
    const ev = probe(makeWin({ storageThrows: true, globals: { CCM: {} } }));
    expect(ev.storageBlocked).toBe(true);
    expect(ev.globals.CCM).toBe("object"); // globals collected before storage is touched
  });
});

describe("cmpdetect — drift guard over cmp/", () => {
  const cmpDir = join(import.meta.dir, "..", "..", "cmp");
  const adapters = readdirSync(cmpDir)
    .filter((f) => /^cc_.+\.js$/.test(f) && !/\.min\.js$/.test(f))
    .map((f) => f.replace(/\.js$/, ""));

  test("every cmp/cc_*.js is either matched or listed as undetectable", () => {
    const known = new Set([
      ...D.SIGNATURES.map((s) => s.adapter),
      ...D.UNDETECTABLE.map((u) => u.adapter)
    ]);
    const missing = adapters.filter((a) => !known.has(a));
    // A new CMP adapter must be a conscious decision here — matched with a signature,
    // or documented as unidentifiable. Silently absent means the panel says
    // "kein Consent-Tool erkannt" on a site we actually support.
    expect(missing).toEqual([]);
  });

  test("no signature/exception points at an adapter that no longer exists", () => {
    const files = new Set(adapters);
    const dangling = [...D.SIGNATURES, ...D.UNDETECTABLE]
      .map((e) => e.adapter).filter((a) => !files.has(a));
    expect(dangling).toEqual([]);
  });

  test("the undetectable entries carry a reason", () => {
    D.UNDETECTABLE.forEach((u) => {
      expect(typeof u.why).toBe("string");
      expect(u.why.length).toBeGreaterThan(20);
    });
  });

  test("every deny condition is actually probed", () => {
    // An unprobed deny silently never holds — it fails OPEN and the collision it was
    // written for comes back. Today every deny happens to double as another signature's
    // need, so removing deny from probeSpec changes nothing; the next CMP breaks that.
    const spec = D.probeSpec();
    D.SIGNATURES.forEach((s) => {
      (s.deny || []).forEach((c) => {
        if (c.g) expect(spec.globals).toContain(c.g);
        if (c.c) expect(spec.cookies).toContain(c.c);
        if (c.ls) expect(spec.ls).toContain(c.ls);
        if (c.ss) expect(spec.ss).toContain(c.ss);
      });
    });
  });

  test("a partially blocked storage rules the signature out instead of failing open", () => {
    // localStorage readable, sessionStorage throwing: jtl_consent's `need` (ls.consent)
    // holds while its `deny` (ss['consent-cache']) cannot be evaluated — a Matomo page
    // was reported as JTL Consent.
    const win = makeWin({ ls: { consent: "{}" } });
    win.sessionStorage = new Proxy({}, { get() { throw new Error("SecurityError"); } });
    const r = D.detect(probe(win));
    expect(r.storageBlocked).toBe(true);
    expect(labels(r)).toEqual([]);
  });

  test("signature keys and adapters are unique", () => {
    const keys = D.SIGNATURES.map((s) => s.key);
    const adaps = D.SIGNATURES.map((s) => s.adapter);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(adaps).size).toBe(adaps.length);
  });

  test("every signature declares a known confidence and at least one condition", () => {
    D.SIGNATURES.forEach((s) => {
      expect(["strong", "medium"]).toContain(s.confidence);
      expect(Array.isArray(s.need)).toBe(true);
      expect(s.need.length).toBeGreaterThan(0);
    });
  });

  test("comparable() is false for exactly the adapters that can never match", () => {
    // The panel uses this to decide whether a configured-vs-detected comparison is even
    // possible. Getting it wrong accuses a healthy Sourcepoint install of a mismatch.
    expect(D.comparable("cc_sourcepoint")).toBe(false);
    expect(D.comparable("cc_simple_cookie_regex_check")).toBe(false);
    expect(D.comparable("cc_ccm19")).toBe(true);
    expect(D.comparable("cc_does_not_exist")).toBe(false);
    expect(D.comparable("")).toBe(false);
    expect(D.undetectableInfo("cc_sourcepoint").why).toContain("__tcfapi");
    expect(D.undetectableInfo("cc_ccm19")).toBe(null);
  });

  test("the adapter name maps to aGTM.c.cmp (cmp/cc_<name>.js)", () => {
    // panel.js compares `cc_ + s.cmp` against the matched adapter to spot a
    // configured-vs-detected mismatch; aGTM.f.load_cc builds exactly that path.
    D.SIGNATURES.forEach((s) => expect(s.adapter.indexOf("cc_")).toBe(0));
    expect(D.SIGNATURES.some((s) => s.adapter === "cc_ccm19" && s.key === "ccm19")).toBe(true);
  });
});
