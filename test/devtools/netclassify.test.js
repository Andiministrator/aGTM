// Unit tests for the aGTM Inspector network classifier
// (devtools-extension/netclassify.js). Pure logic — no DOM/chrome APIs.
//
// Covers the two critic P2/P3 fixes:
//   • dedicated root-hosted sGTM host is recognised (was a false-negative)
//   • a foreign "?attribution=" URL is NOT mislabelled as sources-api
//   • reverse-proxy same-host setups don't sweep in first-party traffic

import { test, expect, describe } from "bun:test";
import { classify, sgtmScope, inSgtmScope } from "../../devtools-extension/netclassify.js";

// entries[].url are the requests seen on the wire; cfg carries live aGTM.c URLs.
function scopeFor(entries, cfg) {
  return sgtmScope(entries, cfg);
}

describe("classify — standard patterns", () => {
  const s = scopeFor([], null);
  test("gtm.js from googletagmanager", () => {
    expect(classify("https://www.googletagmanager.com/gtm.js?id=GTM-X", s, "").key).toBe("gtm.js");
  });
  test("gtag.js", () => {
    expect(classify("https://www.googletagmanager.com/gtag/js?id=G-X", s, "").key).toBe("gtag.js");
  });
  test("aGTMconsent", () => {
    expect(classify("https://x.example.com/rp/tp/aGTMconsent", s, "").key).toBe("consent-store");
  });
  test("aGTM.js", () => {
    expect(classify("https://x.example.com/rp/tp/aGTM.js", s, "").key).toBe("aGTM.js");
  });
  test("/tp/sources", () => {
    expect(classify("https://x.example.com/tp/sources/fcm", s, "").key).toBe("sources-api");
  });
  test("GA collect", () => {
    expect(classify("https://region1.google-analytics.com/g/collect?v=2", s, "").cls).toBe("warn");
  });
  test("unrelated URL is not classified", () => {
    expect(classify("https://example.com/style.css", s, "")).toBeNull();
  });
});

describe("reverse-proxy same-host sGTM (aGTM.js under /rp/tp/ on the page host)", () => {
  const pageHost = "www.fc-moto.de";
  const entries = [{ url: "https://www.fc-moto.de/rp/tp/aGTM.js" }];
  const cfg = { consent_store_url: "https://www.fc-moto.de/rp/tp/aGTMconsent", transport_url: "" };
  const s = scopeFor(entries, cfg);

  test("aEvents endpoint under the learned prefix is classified as aEvents", () => {
    expect(classify("https://www.fc-moto.de/rp/tp/ae?en=purchase", s, pageHost).key).toBe("aEvents");
  });
  test("Stape service-worker bootstrap under the prefix is classified as sGTM SW", () => {
    expect(classify("https://www.fc-moto.de/rp/tp/_/service_worker/66u0/sw_iframe.html", s, pageHost).key).toBe("sGTM SW");
  });
  test("other sGTM traffic under the prefix is generic sGTM", () => {
    expect(classify("https://www.fc-moto.de/rp/tp/something", s, pageHost).key).toBe("sGTM");
  });
  test("first-party image is NOT swept in", () => {
    expect(classify("https://www.fc-moto.de/media/logo.png", s, pageHost)).toBeNull();
  });
  test("first-party page is NOT swept in", () => {
    expect(classify("https://www.fc-moto.de/checkout", s, pageHost)).toBeNull();
  });
});

describe("dedicated sGTM host (P2 fix: root-hosted, host != pageHost)", () => {
  const pageHost = "shop.example.com";
  const entries = [{ url: "https://sgtm.example.com/aGTM.js" }]; // served at ROOT
  const s = scopeFor(entries, null);

  test("root-hosted aEvents endpoint on the dedicated host is recognised", () => {
    // dirname prefix is "/", which the same-host rule would exclude — but a
    // dedicated host (differs from pageHost) matches any path. (A generic
    // /collect path would match the ga-collect rule first; use the aEvents path.)
    expect(classify("https://sgtm.example.com/ae?en=view", s, pageHost).key).toBe("aEvents");
  });
  test("any path on the dedicated sGTM host is relevant (generic sGTM)", () => {
    expect(classify("https://sgtm.example.com/g/anything", s, pageHost).key).toBe("sGTM");
  });
  test("a different third-party host is not relevant", () => {
    expect(classify("https://cdn.other.com/x.js", s, pageHost)).toBeNull();
  });
});

describe("P3 fix: foreign ?attribution= is not mislabelled", () => {
  const s = scopeFor([], null);
  test("unrelated URL carrying attribution= is NOT sources-api", () => {
    expect(classify("https://analytics.other.com/track?attribution=true", s, "")).toBeNull();
  });
  test("real /tp/sources with attribution still classifies", () => {
    expect(classify("https://x.example.com/tp/sources/fcm?attribution=true&method=last_touch", s, "").key).toBe("sources-api");
  });
});

describe("inSgtmScope edge cases", () => {
  test("unknown pageHost falls back to prefix rule (no dedicated-host shortcut)", () => {
    const entries = [{ url: "https://sgtm.example.com/aGTM.js" }]; // root prefix "/"
    const s = scopeFor(entries, null);
    // pageHost unknown ("") → root prefix excluded → not matched (safe fallback)
    expect(inSgtmScope("https://sgtm.example.com/collect", s, "")).toBe(false);
  });
  test("host not in scope → false", () => {
    const s = scopeFor([{ url: "https://a.example.com/rp/tp/aGTM.js" }], null);
    expect(inSgtmScope("https://b.example.com/rp/tp/x", s, "a.example.com")).toBe(false);
  });
  test("malformed URL → false, never throws", () => {
    const s = scopeFor([], null);
    expect(inSgtmScope("not a url", s, "")).toBe(false);
  });
});
