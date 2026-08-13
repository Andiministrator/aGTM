// Unit tests for the aGTM Inspector diagnostics aggregation
// (devtools-extension/diagnose.js). Pure logic — no DOM/chrome APIs.
//
// Covers card #47: Health-Score, Consent-Timeline, Compliance-Report.

import { test, expect, describe } from "bun:test";
import {
  healthChecks, overallLevel, buildTimeline, buildReportMarkdown, buildReportJSON
} from "../../devtools-extension/diagnose.js";

function byKey(checks, key) { return checks.filter((c) => c.key === key)[0]; }

// A healthy sGTM-Client snapshot (empty cmp + injected consent_check, GTM in DOM).
function okSnap() {
  return {
    pageHost: "fc-moto.com", version: "1.5", cmp: "", hasConsentCheck: true,
    init: true, gtmScripts: [{ id: "aGTM_tm_GTM-X" }], session_status: "synced",
    consent: { hasResponse: true, gtmConsent: true, services: "a,b", purposes: "1,2", vendors: "" },
    containers: [{ id: "GTM-X", url: "https://sgtm.fc-moto.com/gtm.js", hasLoaded: true, noConsent: false }],
    config: { gtmServices: "Google Analytics,Google Ads" }
  };
}

describe("healthChecks", () => {
  test("healthy snapshot: all pass once network is captured", () => {
    const checks = healthChecks(okSnap(), [], [], true);
    expect(byKey(checks, "cmp").status).toBe("pass");
    expect(byKey(checks, "consent").status).toBe("pass");
    expect(byKey(checks, "inject").status).toBe("pass");
    expect(byKey(checks, "leaks").status).toBe("pass");
    expect(byKey(checks, "traps").status).toBe("pass");
    expect(byKey(checks, "gate").status).toBe("pass");
  });
  test("no cmp and no consent_check → fail", () => {
    const s = okSnap(); s.cmp = ""; s.hasConsentCheck = false;
    expect(byKey(healthChecks(s, [], [], true), "cmp").status).toBe("fail");
  });
  test("cmp:'none' → warn (loads without a check, but on purpose)", () => {
    const s = okSnap(); s.cmp = "none"; s.hasConsentCheck = false;
    expect(byKey(healthChecks(s, [], [], true), "cmp").status).toBe("warn");
  });
  test("configured cmp name → pass with the name in detail", () => {
    const s = okSnap(); s.cmp = "cookiebot"; s.hasConsentCheck = false;
    const ch = byKey(healthChecks(s, [], [], true), "cmp");
    expect(ch.status).toBe("pass");
    expect(ch.detail).toContain("cookiebot");
  });
  test("no consent response yet → warn", () => {
    const s = okSnap(); s.consent.hasResponse = false;
    expect(byKey(healthChecks(s, [], [], true), "consent").status).toBe("warn");
  });
  test("waiting for consent (gtmConsent false, not injected) → inject N/A", () => {
    const s = okSnap(); s.init = false; s.gtmScripts = []; s.consent.gtmConsent = false;
    expect(byKey(healthChecks(s, [], [], true), "inject").status).toBe("na");
  });
  // The empty-conditions gate (F-167). Mirrors aGTM.f.run_cc:
  //   noConditions && !noGate && !allowEmptyConsentConditions → gtmConsent=false.
  test("all three condition fields empty on v1.5 → fail, names the way out", () => {
    const s = okSnap(); s.config = {};
    const ch = byKey(healthChecks(s, [], [], true), "gate");
    expect(ch.status).toBe("fail");
    expect(ch.detail).toContain("allowEmptyConsentConditions");
  });
  test("empty conditions but allowEmptyConsentConditions:true → warn, not fail", () => {
    const s = okSnap(); s.config = { allowEmptyConsentConditions: true };
    expect(byKey(healthChecks(s, [], [], true), "gate").status).toBe("warn");
  });
  test("empty conditions under cmp:'none' → N/A (the library does not gate there)", () => {
    const s = okSnap(); s.config = {}; s.cmp = "none";
    expect(byKey(healthChecks(s, [], [], true), "gate").status).toBe("na");
  });
  test("empty conditions in the iframe mode → N/A (same exclusion)", () => {
    const s = okSnap(); s.config = { iframeSupport: true }; s.isIframe = true;
    expect(byKey(healthChecks(s, [], [], true), "gate").status).toBe("na");
  });
  test("iframeSupport WITHOUT actually being in an iframe is not the exclusion", () => {
    const s = okSnap(); s.config = { iframeSupport: true }; s.isIframe = false;
    expect(byKey(healthChecks(s, [], [], true), "gate").status).toBe("fail");
  });
  test("empty conditions on a pre-1.5 library → fail, but the opposite effect", () => {
    const s = okSnap(); s.config = {}; s.version = "1.4.1";
    const ch = byKey(healthChecks(s, [], [], true), "gate");
    expect(ch.status).toBe("fail");
    expect(ch.detail).toContain("fail-OPEN");
  });
  test("empty conditions with an unreadable version → warn, says it cannot tell", () => {
    const s = okSnap(); s.config = {}; s.version = null;
    const ch = byKey(healthChecks(s, [], [], true), "gate");
    expect(ch.status).toBe("warn");
    expect(ch.detail).toContain("Library-Version");
  });
  test("an unserialisable aGTM.c must not be read as 'all empty' (F-56 sentinel)", () => {
    const s = okSnap(); s.config = { __unserializable: true };
    expect(byKey(healthChecks(s, [], [], true), "gate").status).toBe("na");
  });
  test("any one of the three fields set → pass, names which", () => {
    for (const k of ["gtmPurposes", "gtmServices", "gtmVendors"]) {
      const s = okSnap(); s.config = { [k]: "x" };
      const ch = byKey(healthChecks(s, [], [], true), "gate");
      expect(ch.status).toBe("pass");
      expect(ch.detail).toContain(k);
    }
  });

  test("leaks present → fail", () => {
    const checks = healthChecks(okSnap(), [{ vendor: "TikTok", url: "https://analytics.tiktok.com/i" }], [], true);
    expect(byKey(checks, "leaks").status).toBe("fail");
  });
  test("a captured leak is fail even when the window was not observed (F-1)", () => {
    const checks = healthChecks(okSnap(), [{ vendor: "TikTok", url: "https://analytics.tiktok.com/i" }], [], false);
    expect(byKey(checks, "leaks").status).toBe("fail");
  });
  test("window not observed + no leaks → N/A, not a false pass (F-1)", () => {
    expect(byKey(healthChecks(okSnap(), [], [], false), "leaks").status).toBe("na");
  });
  test("window observed + no leaks → pass", () => {
    expect(byKey(healthChecks(okSnap(), [], [], true), "leaks").status).toBe("pass");
  });
  test("config traps present → warn", () => {
    const checks = healthChecks(okSnap(), [], [{ key: "gdl", msg: "no gdl" }], true);
    expect(byKey(checks, "traps").status).toBe("warn");
  });
});

describe("overallLevel", () => {
  test("worst-wins: any fail → fail", () => {
    const lvl = overallLevel([{ status: "pass" }, { status: "warn" }, { status: "fail" }]);
    expect(lvl.level).toBe("fail");
    expect(lvl.counts.fail).toBe(1);
    expect(lvl.counts.warn).toBe(1);
    expect(lvl.counts.pass).toBe(1);
  });
  test("warn without fail → warn", () => {
    expect(overallLevel([{ status: "pass" }, { status: "warn" }]).level).toBe("warn");
  });
  test("all pass (na is neutral) → pass", () => {
    expect(overallLevel([{ status: "pass" }, { status: "na" }]).level).toBe("pass");
    expect(overallLevel([{ status: "na" }]).counts.na).toBe(1);
  });
});

describe("buildTimeline", () => {
  test("present markers become t0-relative rows, sorted", () => {
    const tl = buildTimeline({ navStart: 1000, config: 1200, consent: 5000, inject: 5200, firstTag: 5500 });
    expect(tl.ok).toBe(true);
    expect(tl.t0).toBe(1000);
    expect(tl.span).toBe(4500);
    expect(tl.rows[0].label).toBe("Seitenaufruf");
    expect(tl.rows[0].rel).toBe(0);
    expect(tl.rows[tl.rows.length - 1].rel).toBe(4500);
    // sorted ascending by rel
    for (let i = 1; i < tl.rows.length; i++) expect(tl.rows[i].rel).toBeGreaterThanOrEqual(tl.rows[i - 1].rel);
    expect(tl.anchored).toBe(true); // navStart present & earliest → zero point is the page load
  });
  test("absent (0/undefined) markers are dropped", () => {
    const tl = buildTimeline({ navStart: 1000, config: 0, consent: 3000 });
    expect(tl.rows.length).toBe(2);
    expect(tl.rows.map((r) => r.key)).toEqual(["navStart", "consent"]);
  });
  test("no markers at all → ok:false", () => {
    expect(buildTimeline({}).ok).toBe(false);
    expect(buildTimeline({ navStart: 0 }).ok).toBe(false);
  });
  test("t0 is the earliest even if navStart is missing (not anchored)", () => {
    const tl = buildTimeline({ consent: 5000, inject: 4000 });
    expect(tl.t0).toBe(4000);
    expect(tl.rows[0].key).toBe("inject");
    expect(tl.anchored).toBe(false); // navStart absent → zero point is NOT the page load
  });
});

describe("buildReportMarkdown / buildReportJSON", () => {
  function ctx() {
    const snap = okSnap();
    const checks = healthChecks(snap, [{ vendor: "TikTok", url: "https://analytics.tiktok.com/i" }],
      [{ key: "gdl", msg: "no gdl" }], true);
    const timeline = buildTimeline({ navStart: 1000, consent: 3000, inject: 3200 });
    return {
      snap, checks, level: overallLevel(checks).level, timeline,
      leaks: [{ vendor: "TikTok", url: "https://analytics.tiktok.com/i" }],
      traps: [{ key: "gdl", msg: "no gdl" }], generatedAt: "2026-07-25T10:00:00.000Z"
    };
  }
  test("markdown carries header, health table, timeline, leaks and traps", () => {
    const md = buildReportMarkdown(ctx());
    expect(md).toContain("# aGTM Compliance-Report");
    expect(md).toContain("fc-moto.com");
    expect(md).toContain("**Gesamtstatus:** FAIL");
    expect(md).toContain("## Health-Check");
    expect(md).toContain("## Consent-Timeline");
    expect(md).toContain("Δ ab Seitenaufruf");     // navStart present → anchored
    expect(md).toContain("+0 ms");                 // navStart t0
    expect(md).toContain("## Pre-Consent-Leaks");
    expect(md).toContain("TikTok");
    expect(md).toContain("## Konfig-Fallen");
    expect(md).toContain("GTM-Container");
    expect(md).toContain("sgtm.fc-moto.com");      // container host derived from url
  });
  test("markdown timeline header says 'erstem Marker' when navStart is missing (F-2)", () => {
    const c = ctx();
    c.timeline = buildTimeline({ consent: 3000, inject: 3200 }); // no navStart → not anchored
    const md = buildReportMarkdown(c);
    expect(md).toContain("Δ ab erstem Marker");
    expect(md).not.toContain("Δ ab Seitenaufruf");
  });
  test("markdown handles an empty/degraded snapshot without throwing", () => {
    const md = buildReportMarkdown({ snap: {}, checks: [], timeline: { ok: false, rows: [] }, leaks: [], traps: [] });
    expect(typeof md).toBe("string");
    expect(md).toContain("Keine Timeline-Marker");
    expect(md).toContain("Keine erfasst"); // no leaks
  });
  test("JSON report is valid and structured", () => {
    const json = JSON.parse(buildReportJSON(ctx()));
    expect(json.report).toBe("aGTM-compliance");
    expect(json.page).toBe("fc-moto.com");
    expect(json.overall).toBe("fail");
    expect(json.health.length).toBe(6);
    expect(json.consent.gtmConsent).toBe(true);
    expect(json.timeline.length).toBe(3);
    expect(json.leaks[0].vendor).toBe("TikTok");
    expect(json.traps[0].key).toBe("gdl");
  });
});
