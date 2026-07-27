// Unit tests for the aGTM Inspector consent-signal decoders
// (devtools-extension/consentsignals.js). Pure logic — no DOM/chrome APIs.
//
// gcs (classic Consent Mode) and gcd (Consent Mode v2). Spec verified against
// anowave.com + perspection.app (2026-07-24).

import { test, expect, describe } from "bun:test";
import {
  decodeGcs, decodeGcd, decodeSignals,
  gcmEffective, gcmOriginLabel, gcmStatusModel
} from "../../devtools-extension/consentsignals.js";

function stateOf(dec, name) {
  var hit = dec.signals.filter(function (s) { return s.name === name; })[0];
  return hit ? hit.value.state : undefined;
}

describe("decodeGcs — G1XY", () => {
  test("G111 → both granted", () => {
    const d = decodeGcs("G111");
    expect(stateOf(d, "ad_storage")).toBe("granted");
    expect(stateOf(d, "analytics_storage")).toBe("granted");
  });
  test("G100 → both denied", () => {
    const d = decodeGcs("G100");
    expect(stateOf(d, "ad_storage")).toBe("denied");
    expect(stateOf(d, "analytics_storage")).toBe("denied");
  });
  test("G110 → ads granted, analytics denied", () => {
    const d = decodeGcs("G110");
    expect(stateOf(d, "ad_storage")).toBe("granted");
    expect(stateOf(d, "analytics_storage")).toBe("denied");
  });
  test("G101 → ads denied, analytics granted", () => {
    const d = decodeGcs("G101");
    expect(stateOf(d, "ad_storage")).toBe("denied");
    expect(stateOf(d, "analytics_storage")).toBe("granted");
  });
  test("G1 alone → recognised, no signals", () => {
    const d = decodeGcs("G1");
    expect(d).not.toBeNull();
    expect(d.signals.length).toBe(0);
  });
  test("garbage → null", () => {
    expect(decodeGcs("XYZ")).toBeNull();
    expect(decodeGcs("")).toBeNull();
    expect(decodeGcs(null)).toBeNull();
  });
});

describe("decodeGcd — Consent Mode v2", () => {
  test("11p1p1p1p5 → all denied, in order", () => {
    const d = decodeGcd("11p1p1p1p5");
    expect(d.signals.map((s) => s.name)).toEqual(["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]);
    d.signals.forEach((s) => expect(s.value.state).toBe("denied"));
  });
  test("11t1t1t1p5 → first three granted, ad_personalization denied", () => {
    const d = decodeGcd("11t1t1t1p5");
    expect(stateOf(d, "ad_storage")).toBe("granted");
    expect(stateOf(d, "analytics_storage")).toBe("granted");
    expect(stateOf(d, "ad_user_data")).toBe("granted");
    expect(stateOf(d, "ad_personalization")).toBe("denied");
  });
  test("r = denied-by-default-then-granted → granted", () => {
    const d = decodeGcd("11r1r1r1r5");
    d.signals.forEach((s) => expect(s.value.state).toBe("granted"));
  });
  test("l = not configured → unset", () => {
    const d = decodeGcd("11l1l1l1l5");
    d.signals.forEach((s) => expect(s.value.state).toBe("unset"));
  });
  test("varying source digit (3t groups) still decodes", () => {
    const d = decodeGcd("13t3t3t3t5");
    d.signals.forEach((s) => expect(s.value.state).toBe("granted"));
    expect(d.signals[0].value.raw).toBe("t");
  });
  test("unknown letter → surfaced raw as unknown (never a false state)", () => {
    const d = decodeGcd("11z1t1t1t5");
    expect(stateOf(d, "ad_storage")).toBe("unknown");
    expect(d.signals[0].value.raw).toBe("z");
  });
  test("v = granted-by-default-and-confirmed → granted; q = denied-declined → denied", () => {
    const d = decodeGcd("11v1q1v1q5");
    expect(stateOf(d, "ad_storage")).toBe("granted");        // v
    expect(stateOf(d, "analytics_storage")).toBe("denied");  // q
    expect(d.signals[0].value.raw).toBe("v");
    expect(d.signals[1].value.raw).toBe("q");
  });
  test("truncated gcd (<4 groups) decodes only the present signals, no crash", () => {
    const d = decodeGcd("11t1t5"); // only ad_storage + analytics_storage
    expect(d.signals.map((s) => s.name)).toEqual(["ad_storage", "analytics_storage"]);
    expect(stateOf(d, "ad_user_data")).toBeUndefined();
  });
  test("non-gcd string → null", () => {
    expect(decodeGcd("G111")).toBeNull();
    expect(decodeGcd("")).toBeNull();
    expect(decodeGcd(null)).toBeNull();
  });
});

describe("decodeSignals — from a URL", () => {
  test("extracts both gcs and gcd from a collect URL", () => {
    const dec = decodeSignals("https://region1.google-analytics.com/g/collect?v=2&gcs=G111&gcd=11t1t1t1t5&tid=G-X");
    expect(dec.gcs).not.toBeNull();
    expect(dec.gcd).not.toBeNull();
    expect(stateOf(dec.gcs, "analytics_storage")).toBe("granted");
    expect(stateOf(dec.gcd, "ad_user_data")).toBe("granted");
  });
  test("gcs-only URL → gcd is null, gcs present", () => {
    const dec = decodeSignals("https://www.google-analytics.com/collect?v=1&gcs=G100");
    expect(dec.gcd).toBeNull();
    expect(dec.gcs).not.toBeNull();
    expect(stateOf(dec.gcs, "ad_storage")).toBe("denied");
  });
  test("URL without consent signals → null", () => {
    expect(decodeSignals("https://x.example.com/img.png")).toBeNull();
  });
  test("malformed URL → null, never throws", () => {
    expect(decodeSignals("not a url")).toBeNull();
  });
});

/* ==================================================================== *
 *  Card #51 — effective ics state + origin (shared by the Consent tab   *
 *  and the Simulation tab's GCM push box)                               *
 * ==================================================================== */

// reader.js shape: one entry per category, four booleans (or null) + region.
function entry(o) {
  return {
    "declare": null, "default": null, update: null, implicit: null, region: "",
    ...o
  };
}

describe("gcmEffective — precedence update > default > implicit > declare", () => {
  test("update wins over everything", () => {
    const e = gcmEffective(entry({ update: true, "default": false, implicit: false, "declare": false }));
    expect(e.value).toBe(true);
    expect(e.origin).toBe("update");
  });
  test("default wins when no update", () => {
    const e = gcmEffective(entry({ "default": false, implicit: true, "declare": true }));
    expect(e.value).toBe(false);
    expect(e.origin).toBe("default");
  });
  test("implicit wins over declare", () => {
    const e = gcmEffective(entry({ implicit: true, "declare": false }));
    expect(e.value).toBe(true);
    expect(e.origin).toBe("implicit");
  });
  test("declare is the last resort (F-66)", () => {
    const e = gcmEffective(entry({ "declare": false }));
    expect(e.value).toBe(false);
    expect(e.origin).toBe("declare");
  });
  test("false is a real value, not 'unset' — denied must not fall through", () => {
    // The bug this guards: `if (entry.update)` would skip a denied update and report
    // the default instead, i.e. show granted where the page actually denied.
    const e = gcmEffective(entry({ update: false, "default": true }));
    expect(e.value).toBe(false);
    expect(e.origin).toBe("update");
  });
  test("no boolean at all → null/null", () => {
    expect(gcmEffective(entry({})).value).toBeNull();
    expect(gcmEffective(entry({})).origin).toBeNull();
  });
  test("garbage in → null, never throws", () => {
    expect(gcmEffective(null).value).toBeNull();
    expect(gcmEffective(undefined).origin).toBeNull();
    expect(gcmEffective("nope").value).toBeNull();
    expect(gcmEffective({ update: "granted" }).value).toBeNull(); // string, not boolean
  });
});

describe("gcmOriginLabel", () => {
  test("implicit is labelled in German like the Consent tab's flow table", () => {
    expect(gcmOriginLabel("implicit")).toBe("implizit");
  });
  test("the wire names pass through", () => {
    expect(gcmOriginLabel("update")).toBe("update");
    expect(gcmOriginLabel("default")).toBe("default");
    expect(gcmOriginLabel("declare")).toBe("declare");
  });
  test("unknown/empty origin → empty string", () => {
    expect(gcmOriginLabel(null)).toBe("");
    expect(gcmOriginLabel("bogus")).toBe("");
  });
});

describe("gcmStatusModel — summary for the push box", () => {
  const ORDER = ["ad_storage", "analytics_storage", "ad_user_data"];

  test("no ics object → present:false (the window for a default push is still open)", () => {
    const m = gcmStatusModel(null, ORDER);
    expect(m.present).toBe(false);
    expect(m.rows.length).toBe(0);
  });
  test("empty entries object → present:false, not an empty table", () => {
    expect(gcmStatusModel({}, ORDER).present).toBe(false);
  });
  test("rows follow the supplied canonical order", () => {
    const m = gcmStatusModel({
      ad_user_data: entry({ update: true }),
      ad_storage: entry({ "default": false })
    }, ORDER);
    expect(m.present).toBe(true);
    expect(m.rows.map(r => r.cat)).toEqual(["ad_storage", "ad_user_data"]);
  });
  test("categories outside the canonical order are appended, not dropped", () => {
    const m = gcmStatusModel({
      ad_storage: entry({ update: true }),
      some_future_storage: entry({ update: false })
    }, ORDER);
    expect(m.rows.map(r => r.cat)).toEqual(["ad_storage", "some_future_storage"]);
  });
  test("counts granted/denied/unset and collects the origins seen", () => {
    const m = gcmStatusModel({
      ad_storage: entry({ update: true }),
      analytics_storage: entry({ "default": false }),
      ad_user_data: entry({})
    }, ORDER);
    expect(m.counts).toEqual({ granted: 1, denied: 1, unset: 1 });
    expect(m.origins.sort()).toEqual(["default", "update"]);
  });
  test("works without an order argument", () => {
    const m = gcmStatusModel({ ad_storage: entry({ implicit: true }) });
    expect(m.present).toBe(true);
    expect(m.rows[0].origin).toBe("implicit");
  });
  test("garbage in → present:false, never throws", () => {
    expect(gcmStatusModel("nope", ORDER).present).toBe(false);
    expect(gcmStatusModel(undefined).present).toBe(false);
  });
});
