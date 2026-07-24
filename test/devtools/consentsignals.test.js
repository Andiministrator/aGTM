// Unit tests for the aGTM Inspector consent-signal decoders
// (devtools-extension/consentsignals.js). Pure logic — no DOM/chrome APIs.
//
// gcs (classic Consent Mode) and gcd (Consent Mode v2). Spec verified against
// anowave.com + perspection.app (2026-07-24).

import { test, expect, describe } from "bun:test";
import { decodeGcs, decodeGcd, decodeSignals } from "../../devtools-extension/consentsignals.js";

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
  test("URL without consent signals → null", () => {
    expect(decodeSignals("https://x.example.com/img.png")).toBeNull();
  });
  test("malformed URL → null, never throws", () => {
    expect(decodeSignals("not a url")).toBeNull();
  });
});
