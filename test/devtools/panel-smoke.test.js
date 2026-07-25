// Integration smoke test for the aGTM Inspector panel (devtools-extension/panel.js).
//
// panel.js is DevTools-context glue that node --check can't exercise: it reads a DOM
// and chrome.devtools.* at boot and renders HTML strings. This test installs a fake
// DOM + chrome stub, evals the four panel scripts in load order (logmap → netclassify
// → jsonview → panel), then drives render() over a representative snapshot for every
// tab. It catches "renderX throws" / "undefined helper" regressions the unit tests miss.

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";

// Saved so afterAll can restore them — this file clobbers shared globals and other
// test files in the same process must not inherit the fakes.
var _saved = {};

// ── fake DOM ────────────────────────────────────────────────────────────────
function makeNode(id) {
  var node = {
    id: id, className: "", textContent: "", __lastHTML: undefined, _html: "",
    querySelectorAll: function () { return []; },
    querySelector: function () { return null; },
    addEventListener: function () {},
    getAttribute: function () { return null; },
    classList: { add: function () {}, remove: function () {}, toggle: function () {} }
  };
  Object.defineProperty(node, "innerHTML", {
    get: function () { return this._html; },
    set: function (v) { this._html = v; }
  });
  return node;
}

beforeAll(() => {
  ["document", "setInterval", "fetch", "chrome"].forEach(function (k) { _saved[k] = globalThis[k]; });

  var nodes = {};
  function getNode(id) { if (!nodes[id]) nodes[id] = makeNode(id); return nodes[id]; }

  globalThis.__nodes = nodes;
  globalThis.document = {
    body: { classList: { add: function () {} } },
    getElementById: function (id) { return getNode(id); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  globalThis.window = globalThis;
  globalThis.setInterval = function () { return 0; };
  globalThis.fetch = function () {
    return Promise.resolve({ text: function () { return Promise.resolve("(function(){return {loaded:false};})()"); } });
  };
  globalThis.chrome = {
    runtime: { getURL: function (p) { return p; } },
    devtools: {
      panels: { themeName: "default" },
      inspectedWindow: { eval: function () { /* no-op: test sets state.snap directly */ } },
      network: { onRequestFinished: { addListener: function () {} }, onNavigated: { addListener: function () {} } }
    }
  };

  // Concatenate the four scripts and eval once, then capture panel.js's top-level
  // `state`/`render` from the SAME eval scope (var/function don't leak to globalThis
  // under bun's ESM indirect eval, so we expose handles explicitly).
  var base = "./devtools-extension/";
  var src = ["logmap.js", "netclassify.js", "consentsignals.js", "jsonview.js", "panel.js"]
    .map(function (f) { return readFileSync(base + f, "utf8"); })
    .join("\n;\n");
  src += "\n;globalThis.__panel = {" +
    "  render: render," +
    "  setSnap: function(s){ state.snap = s; }," +
    "  setTab: function(t){ state.activeTab = t; }," +
    "  setExpanded: function(e){ state.expanded = e; }," +
    "  setBaseline: function(v){ state.configBaseline = v; }," +
    "  urlPretty: urlPretty," +
    "  allParamsPreview: allParamsPreview," +
    "  netDetailHtml: netDetailHtml," +
    "  payloadBody: payloadBody," +
    "  bytesFromPayload: bytesFromPayload," +
    "  reqPropId: reqPropId," +
    "  hostOf: hostOf," +
    "  setNet: function(a){ state.net = a; }," +
    "  netSet: function(k,v){ state[k] = v; }," +
    "  renderNetwork: renderNetwork," +
    "  decodeAEvents: decodeAEvents," +
    "  saveSettings: saveSettings," +
    "  loadSettings: loadSettings," +
    "  withScrollAnchor: withScrollAnchor" +
    "};";
  (0, eval)(src);
});

afterAll(() => {
  ["document", "setInterval", "fetch", "chrome"].forEach(function (k) { globalThis[k] = _saved[k]; });
});

function sampleSnap() {
  return {
    loaded: true, version: "1.5", pageHost: "fc-moto.com",
    init: true, cmp: "", hasConsentCheck: true, consentEvents: "cmp_update",
    gdl: "dataLayer", gtmID: "GTM-XXX",
    consent: { hasResponse: true, gtmConsent: true, services: "a,b", purposes: "1,2", vendors: "" },
    session_status: "synced", consent_hash: "h1", last_consent_hash: "h1",
    containers: [{ id: "GTM-XXX", noConsent: false, hasLoaded: true, url: "https://sgtm.fc-moto.com/gtm.js", env: "", inline: false, idParam: "" }],
    gtmLoaded: ["GTM-XXX"], dataLayerLen: 4,
    dataLayerSample: [
      { event: "gtm.js" },
      { "0": "consent", "1": "update", "2": { ad_storage: "granted" } },
      { event: "page_view", aGTMts: 111 },
      { event: "add_to_cart", aGTMts: 222, aGTMrepeated: true },
      { "0": "config", "1": "G-XXX" },
      { some: "internal_message" }
    ],
    gtmScripts: [{ id: "aGTM_tm_GTM-XXX", host: "sgtm.fc-moto.com", inline: false }],
    config: { cmp: "", gtm: { "GTM-XXX": {} }, gdl: "dataLayer", consent_store_url: "https://sgtm.fc-moto.com/aGTMconsent" },
    dl: [{ event: "page_view", aGTMts: 111, page_title: "Home", value: 0 }, { aGTMts: 333, note: "internal" }],
    queue: [{ event: "add_to_cart", aGTMts: 222, value: 12.5, currency: "EUR" }],
    queueLen: 1,
    log: [
      { id: "m1", timestamp: 1000, obj: { cmp: "" } },
      { id: "m3", timestamp: 2000, obj: { hasResponse: true } },
      { id: "m3", timestamp: 4000, obj: { hasResponse: true } },
      { id: "m3", timestamp: 6000, obj: { hasResponse: true } },
      { id: "m9", timestamp: 5000, obj: { event: "page_view" } },
      { id: "e17", timestamp: 7000, obj: { __unserializable: true } }
    ],
    session: { source: "it_webgains", sid: "s1", uid: "C.1.fcm", raw: { sid: "s1", uid: "C.1.fcm", ret: true, vct: 7 } },
    seData: { visitorId: "v-123", segments: ["a", "b"] },
    gcm: {
      ad_storage: { "default": false, update: true, implicit: null, region: "DE" },
      analytics_storage: { "default": false, update: true, implicit: null, region: "" },
      ad_user_data: { "default": null, update: null, implicit: null, region: "" }
    },
    consentCommands: [
      { type: "default", payload: { ad_storage: "denied", analytics_storage: "denied", wait_for_update: 500 } },
      { type: "update", payload: { ad_storage: "granted", analytics_storage: "granted" } }
    ],
    consentTs: 5000,
    vendors: { tcf: true, gpp: false, usp: false, gpc: false, meta: true, uet: false, tiktok: false, linkedin: false, pinterest: false, amazon: false, criteo: false, snap: false, twitter: false },
    attribution: { last_touch: { sou: "google", med: "cpc" } }
  };
}

function renderTab(tab, snap) {
  globalThis.__panel.setSnap(snap || sampleSnap());
  globalThis.__panel.setTab(tab);
  globalThis.__panel.render();
  return globalThis.document.getElementById("tab-" + tab)._html;
}

describe("panel boot", () => {
  test("all four scripts eval and wire up globals", () => {
    expect(typeof globalThis.__panel.render).toBe("function");
    expect(globalThis.aGTMInspectorJsonView).toBeTruthy();
    expect(globalThis.aGTMInspectorNet).toBeTruthy();
  });
});

describe("every tab renders without throwing", () => {
  ["consent", "events", "gtm", "datalayer", "session", "config", "network"].forEach((tab) => {
    test(tab + " renders non-empty HTML", () => {
      const html = renderTab(tab);
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });
  });
});

describe("feedback fixes", () => {
  test("internal log bundles repeated m3 with a count", () => {
    const html = renderTab("events");
    // three m3 entries with no event → one row with ×3
    expect(html).toContain(">3<");
    expect(html).toContain("gebündelt");
  });
  test("queue is relabelled as history once consent/init is present", () => {
    const html = renderTab("events");
    expect(html).toContain("bereits verarbeitet");
  });
  test("dl entry without an event field is labelled Message", () => {
    const html = renderTab("events");
    expect(html).toContain("Message");
  });
  test("dataLayer tab annotates aGTM relationship", () => {
    const html = renderTab("datalayer");
    expect(html).toContain("via aGTM");
    expect(html).toContain("repeated");
  });
  test("session tab shows window.se_data fallback and highlighted json", () => {
    const html = renderTab("session");
    expect(html).toContain("window.se_data");
    expect(html).toContain("json-");
  });
  test("config tab uses highlighted json and effective label", () => {
    const html = renderTab("config");
    expect(html).toContain("effektiv");
    expect(html).toContain("json-");
  });
  test("expanded event row renders a highlighted object", () => {
    // key = prefix|naturalOrdinal|aGTMts|event (F-64 + Kritiker R2); page_view is natural index 0
    globalThis.__panel.setExpanded({ "d|0|111|page_view": true });
    const html = renderTab("events");
    expect(html).toContain("jsonview");
    expect(html).toContain("json-key");
    globalThis.__panel.setExpanded({});
  });
  test("unserialisable log object degrades gracefully when expanded", () => {
    globalThis.__panel.setExpanded({ "l|e17|": true });
    const html = renderTab("events");
    expect(html).toContain("nicht serialisierbar");
    globalThis.__panel.setExpanded({});
  });
  test("consent tab shows the consent-mode sequence and final state", () => {
    const html = renderTab("consent");
    expect(html).toContain("Google Consent Mode");
    expect(html).toContain("Ablauf");
    // command sequence: default then update, in order
    expect(html).toContain("cm-default");
    expect(html).toContain("cm-update");
    // final state + timestamp + region
    expect(html).toContain("Gesamtzustand");
    expect(html).toContain("zuletzt geändert");
    expect(html).toContain("DE");
    expect(html).toContain("ad_storage=granted"); // update:true → granted (in chip title)
  });
  test("consent tab lists detected non-Google vendors", () => {
    const html = renderTab("consent");
    expect(html).toContain("Andere Vendoren");
    expect(html).toContain("IAB TCF");   // vendors.tcf = true
    expect(html).toContain("Meta Pixel"); // vendors.meta = true
    expect(html).toContain("Nicht erkannt");
  });
  test("dataLayer events are categorised by colour class", () => {
    const html = renderTab("datalayer");
    expect(html).toContain("ev-gtm");    // gtm.js
    expect(html).toContain("ev-ecom");   // add_to_cart
    expect(html).toContain("ev-pv");     // page_view
    expect(html).toContain("E-Commerce");
  });
  test("dataLayer marks consent commands inline", () => {
    const html = renderTab("datalayer");
    expect(html).toContain("ev-consent-cmd");
    expect(html).toContain("consent update");
    expect(html).toContain("dl-consent");
  });
  test("consent Ablauf is reconstructed from ics when no dataLayer commands exist", () => {
    // GTM-template CMP: consent set via sandboxed API → no gtag() commands, only ics.
    const snap = sampleSnap();
    snap.consentCommands = [];
    snap.gcm = {
      ad_storage: { "declare": null, "default": false, update: true, implicit: null, region: "DE" },
      analytics_storage: { "declare": null, "default": false, update: true, implicit: null, region: "" }
    };
    const html = renderTab("consent", snap);
    expect(html).toContain("aus ics");
    expect(html).toContain("cm-default");
    expect(html).toContain("cm-update");
    expect(html).not.toContain("keine consent-Commands im dataLayer und kein");
  });
  test("vendor cookie presence shows an 'aktiv' state", () => {
    const snap = sampleSnap();
    snap.vendors.meta = true;
    snap.vendorState = { gpc: null, tcString: "", usp: "", amazon: "", cookies: { meta: "fb.1.abc" } };
    const html = renderTab("consent", snap);
    expect(html).toContain("aktiv (Cookie)");
  });
  test("Microsoft UET exposes a readable granted/denied state", () => {
    const snap = sampleSnap();
    snap.vendors.uet = true;
    snap.vendorState = { cookies: {}, uetConfig: { adStorage: false, enabled: true, enforced: true, tcf: false } };
    const html = renderTab("consent", snap);
    expect(html).toContain("ad_storage denied");
    expect(html).toContain("liest TCF");
  });
  test("vendor rows expand to a detail description", () => {
    const snap = sampleSnap();
    snap.vendors.meta = true;
    globalThis.__panel.setExpanded({ "ven|meta": true });
    const html = renderTab("consent", snap);
    expect(html).toContain("Data Processing Options");
    globalThis.__panel.setExpanded({});
  });
  test("payloadBody highlights JSON and splits control-char-batched text", () => {
    expect(globalThis.__panel.payloadBody('{"en":"purchase"}')).toContain("json-key");
    const withRs = "en=view" + String.fromCharCode(30) + "en=add";
    expect(globalThis.__panel.payloadBody(withRs)).toContain("•");
  });
  test("reqPropId extracts the id/tid, hostOf the host", () => {
    expect(globalThis.__panel.reqPropId("https://www.googletagmanager.com/gtm.js?id=GTM-ABC")).toBe("GTM-ABC");
    expect(globalThis.__panel.reqPropId("https://region1.google-analytics.com/g/collect?v=2&tid=G-XYZ")).toBe("G-XYZ");
    expect(globalThis.__panel.hostOf("https://i.clarity.ms/collect")).toBe("i.clarity.ms");
  });
  test("network search and host-hide filter the list", () => {
    const P = globalThis.__panel;
    P.setNet([
      { id: 1, url: "https://www.googletagmanager.com/gtm.js?id=GTM-A", host: "www.googletagmanager.com", method: "GET", status: 200, ts: 1, propId: "GTM-A", evName: "" },
      { id: 2, url: "https://i.clarity.ms/collect", host: "i.clarity.ms", method: "POST", status: 204, ts: 2, propId: "", evName: "" }
    ]);
    P.netSet("netOnlyAGTM", false);
    P.netSet("netSearch", "");
    P.netSet("netHidden", {});
    P.setTab("network");
    let html = (P.render(), globalThis.document.getElementById("tab-network")._html);
    expect(html).toContain("/collect"); // clarity row path
    expect(html).toContain("GTM-A");    // gtm row propId
    // hide clarity host via checkbox
    P.netSet("netHidden", { "i.clarity.ms": true });
    html = (P.render(), globalThis.document.getElementById("tab-network")._html);
    expect(html).not.toContain("/collect");
    expect(html).toContain("GTM-A");
    // exclude via -search
    P.netSet("netHidden", {});
    P.netSet("netSearch", "-clarity");
    html = (P.render(), globalThis.document.getElementById("tab-network")._html);
    expect(html).not.toContain("/collect");
    P.netSet("netSearch", "");
    P.setNet([]);
  });
  test("decodeAEvents decodes plain (?e=) and obfuscated (?q=) payloads without the salt", () => {
    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const OUT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    function enc(str, salt) { // mirror of aevents-webgtm-tag.js enc()
      const shift = salt % 63 + 1;
      let b = Buffer.from(str, "utf8").toString("base64");
      let pad = b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0;
      b = b.slice(0, b.length - pad);
      let out = ""; for (const ch of b) { const i = B64.indexOf(ch); out += i < 0 ? ch : OUT[(i + shift) % 64]; }
      return pad ? out.slice(0, 3) + "~".repeat(pad) + out.slice(3) : out;
    }
    const D = globalThis.__panel.decodeAEvents;
    // plain
    const ev = { event: "purchase", value: 99.9, cur: "EUR", "ä": "täst" };
    expect(D("https://s.gtm.de/aevents?e=" + encodeURIComponent(JSON.stringify(ev))).event).toBe("purchase");
    // obfuscated with two different salts (→ different shifts), decoded without knowing them
    [7, 42].forEach((salt) => {
      const q = enc(JSON.stringify(ev), salt);
      const got = D("https://s.gtm.de/aevents?q=" + q + "&v=1.5.02");
      expect(got).not.toBeNull();
      expect(got.value).toBe(99.9);
      expect(got["ä"]).toBe("täst");
    });
    // POST-body transport: {"q":"…"} in the body (fc-moto /rp/tp/ae)
    const qBody = JSON.stringify({ q: enc(JSON.stringify(ev), 7) });
    const fromBody = D("https://www.fc-moto.com/rp/tp/ae", qBody);
    expect(fromBody).not.toBeNull();
    expect(fromBody.event_name || fromBody.event).toBe("purchase");
    // {"e":"<json>"} plain body
    expect(D("https://x/rp/tp/ae", JSON.stringify({ e: JSON.stringify(ev) })).event).toBe("purchase");
    // non-aEvents URL → null
    expect(D("https://www.googletagmanager.com/gtm.js?id=GTM-X")).toBeNull();
    expect(D("https://x/rp/tp/ae", '{"foo":"bar"}')).toBeNull();
    // false-positive guards: a Clarity-style JSON array / a non-aEvents object → null
    expect(D("https://i.clarity.ms/collect", '["0.8.67",4,2142,3040,"wmv8y9njyc"]')).toBeNull();
    expect(D("https://i.clarity.ms/collect", JSON.stringify({ 0: "0.8.67", 1: 4, 2: 2142 }))).toBeNull();
    expect(D("https://x/collect?e=" + encodeURIComponent('{"foo":1}'))).toBeNull(); // e= but not aEvents-shaped
  });
  test("settings (hidden hosts, aGTM-only) persist via localStorage", () => {
    const store = {};
    const prevLS = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const P = globalThis.__panel;
    P.netSet("netOnlyAGTM", false);
    P.netSet("netHidden", { "i.clarity.ms": true });
    P.saveSettings();
    // reset in-memory, then reload from storage
    P.netSet("netOnlyAGTM", true);
    P.netSet("netHidden", {});
    P.loadSettings();
    const html = (P.setTab("network"), P.setNet([]), P.render(), globalThis.document.getElementById("tab-network")._html);
    expect(html).toContain('id="net-filter"'); // rendered; no crash
    // the loaded state is what we saved
    P.setNet([{ id: 9, url: "https://i.clarity.ms/collect", host: "i.clarity.ms", method: "POST", status: 204, ts: 1, propId: "", evName: "" }]);
    const html2 = (P.render(), globalThis.document.getElementById("tab-network")._html);
    expect(html2).not.toContain("/collect"); // clarity stays hidden after reload
    globalThis.localStorage = prevLS;
    P.netSet("netHidden", {});
    P.setNet([]);
  });
  test("withScrollAnchor keeps position when scrolled, lets it jump at top", () => {
    const P = globalThis.__panel;
    const prevQS = globalThis.document.querySelector;
    const main = { scrollTop: 100, scrollHeight: 500 };
    globalThis.document.querySelector = (sel) => (sel === "main" ? main : null);
    // content grows by 80px above → scrollTop compensates to stay put
    P.withScrollAnchor(() => { main.scrollHeight = 580; });
    expect(main.scrollTop).toBe(180);
    // at the very top → no compensation, new content shows
    main.scrollTop = 0; main.scrollHeight = 500;
    P.withScrollAnchor(() => { main.scrollHeight = 700; });
    expect(main.scrollTop).toBe(0);
    globalThis.document.querySelector = prevQS;
  });
  test("bytesFromPayload recovers latin1 and base64 bodies", () => {
    const latin1 = globalThis.__panel.bytesFromPayload({ payloadRaw: "\x1f\x8b\x08", payloadEncoding: "" });
    expect(latin1[0]).toBe(0x1f); expect(latin1[1]).toBe(0x8b);
    const b64 = globalThis.__panel.bytesFromPayload({ payloadRaw: btoa("AB"), payloadEncoding: "base64" });
    expect(b64[0]).toBe(65); expect(b64[1]).toBe(66);
  });
  test("network detail renders separate expandable sub-sections", () => {
    const e = {
      id: 7, url: "https://x/g/collect?v=2&en=page_view", payload: "", payloadNote: "",
      detail: { method: "POST", status: 204, requestHeaders: { "content-type": "text/plain" }, responseHeaders: { server: "nginx" }, queryString: { v: "2", en: "page_view" }, postData: undefined }
    };
    globalThis.__panel.setExpanded({ "n|7|rq": true });
    const h = globalThis.__panel.netDetailHtml(e);
    expect(h).toContain("Request-Header");
    expect(h).toContain("Response-Header");
    expect(h).toContain("Query-String");
    expect(h).toContain("Payload");
    expect(h).toContain("json-key"); // the opened request-header section is highlighted
    globalThis.__panel.setExpanded({});
  });
  test("consent tab restores the per-category state table", () => {
    const html = renderTab("consent");
    // old view: Kategorie / aktuell / default / update / implicit with granted/denied words
    expect(html).toContain("Kategorie");
    expect(html).toContain("implicit");
    expect(html).toContain("granted");
  });
  test("network GET-param fallback preview lists query params", () => {
    const h = globalThis.__panel.allParamsPreview("https://x/g/collect?v=2&tid=G-X&en=page_view&cid=1");
    expect(h).toContain("preview");
    expect(h).toContain("en");
    expect(h).toContain("page_view");
  });
  test("consent-mode command rows are expandable to the full sent object", () => {
    globalThis.__panel.setExpanded({ "cc|1": true }); // the update command (index 1 in cmds)
    const html = renderTab("consent");
    expect(html).toContain("jsonview");
    expect(html).toContain("json-key");
    globalThis.__panel.setExpanded({});
  });
  test("vendor box shows synchronously-readable state", () => {
    const snap = sampleSnap();
    snap.vendors.gpc = true; // navigator.globalPrivacyControl sets presence + state together
    snap.vendorState = { gpc: true, tcString: "CQ1abcDEF...", usp: "1YNN", amazon: "" };
    const html = renderTab("consent", snap);
    expect(html).toContain("Zustand");
    expect(html).toContain("TC-String"); // vendors.tcf true → tcString shown
    expect(html).toContain("GPC aktiv");
  });
  test("dataLayer event-less push is labelled Message and shows aGTM badge", () => {
    const html = renderTab("datalayer");
    expect(html).toContain("Message");
    expect(html).toContain("(a)GTM");
  });
  test("event rows carry an inline object preview", () => {
    const html = renderTab("events");
    expect(html).toContain("preview");
  });
  test("network URL is split into host/path with param chips", () => {
    const h = globalThis.__panel.urlPretty("https://www.googletagmanager.com/gtm.js?id=GTM-X&gtm=abc&foo=bar");
    expect(h).toContain("u-host");
    expect(h).toContain("u-path");
    expect(h).toContain("id=");        // key param surfaced as a chip
    expect(h).toContain("+1 Param");   // foo=bar not in the key list → counted
  });
  test("config runtime-diff flags a changed field", () => {
    globalThis.__panel.setBaseline(JSON.stringify({ gdl: "dataLayer", gtmID: "GTM-OLD" }));
    const snap = sampleSnap();
    snap.config = { gdl: "dataLayer", gtmID: "GTM-NEW", consent_store_url: "https://x/aGTMconsent" };
    const html = renderTab("config", snap);
    expect(html).toContain("Laufzeit-Änderungen");
    expect(html).toContain("geändert");
    expect(html).toContain("neu");
    globalThis.__panel.setBaseline(null);
  });
  // ── F-62: event-less ecommerce datablock ───────────────────────────────────
  test("F-62: event-less {ecommerce:{…}} push is classified as E-Commerce, not Message", () => {
    const snap = sampleSnap();
    snap.dataLayerSample = [{ ecommerce: { items: [{ id: "SKU1" }] } }];
    snap.dataLayerLen = 1; snap.dataLayerBase = 0;
    const html = renderTab("datalayer", snap);
    expect(html).toContain("E-Commerce");
  });
  // ── F-63: consent-only preset session is not "empty" ───────────────────────
  test("F-63: a consent-only preset session shows its preview, not 'keine Daten'", () => {
    const snap = sampleSnap();
    snap.session = { source: "", sid: "", uid: "", raw: { consent: { hasResponse: true, services: "a,b" } } };
    snap.session_status = "preset_with_consent";
    const html = renderTab("session", snap);
    expect(html).not.toContain("Keine (nennenswerten)");
    expect(html).toContain("json-"); // the raw preview is rendered
  });
  // ── new feature: pre-consent leak detector ─────────────────────────────────
  test("pre-consent leak: a tracker fired before consent raises the banner + row badge", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setNet([
      { id: 1, url: "https://connect.facebook.net/tr?id=1", host: "connect.facebook.net", method: "GET", status: 200, ts: 1, propId: "", evName: "", preConsent: true },
      { id: 2, url: "https://www.google-analytics.com/g/collect?v=2", host: "www.google-analytics.com", method: "POST", status: 204, ts: 2, propId: "", evName: "", preConsent: true }
    ]);
    P.netSet("netOnlyAGTM", false);
    P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain("Pre-Consent-Leak");
    expect(html).toContain("pre-consent");   // row badge
    expect(html).toContain("Meta Pixel");
    P.setNet([]);
  });
  test("no leak banner when the same trackers fired WITH consent", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setNet([{ id: 3, url: "https://connect.facebook.net/tr?id=1", host: "connect.facebook.net", method: "GET", status: 200, ts: 1, propId: "", evName: "", preConsent: false }]);
    P.netSet("netOnlyAGTM", false);
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).not.toContain("Pre-Consent-Leak");
    P.setNet([]);
  });
  // ── Kritiker R2 P1: dl expand key stable across a streaming append ──────────
  test("dl expand key stays stable when a new event streams in", () => {
    const P = globalThis.__panel;
    P.setExpanded({ "d|0|111|page_view": true }); // page_view is natural index 0 in sample dl
    let html = renderTab("events");               // 2-event dl
    expect(html).toContain("page_title");         // page_view detail is open
    const grown = sampleSnap();
    grown.dl = grown.dl.concat([{ event: "add_to_cart", aGTMts: 444 }]); // a new event arrives
    html = renderTab("events", grown);
    expect(html).toContain("page_title");         // STILL open — key did not shift with the append
    P.setExpanded({});
  });
  // ── Kritiker R2 P2: leak stamp reconciled against consentTs ────────────────
  test("a tracker that fired at/after the consent grant is NOT a leak (snapshot-lag reconcile)", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap(); // consent.gtmConsent=true, consentTs=5000
    P.setSnap(snap);
    P.setNet([
      { id: 21, url: "https://connect.facebook.net/tr?id=1", host: "connect.facebook.net", method: "GET", status: 200, ts: 6000, propId: "", evName: "", preConsent: true }, // after grant → legit
      { id: 22, url: "https://analytics.tiktok.com/i/x", host: "analytics.tiktok.com", method: "GET", status: 200, ts: 4000, propId: "", evName: "", preConsent: true }  // before grant → leak
    ]);
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain("Pre-Consent-Leak"); // the ts=4000 tiktok hit
    expect(html).toContain("TikTok");
    expect(html).not.toContain("Meta Pixel");   // the ts=6000 fb hit was reconciled as legit
    P.setNet([]);
  });
  // ── new feature: consent fingerprint in the list view ──────────────────────
  test("network list shows a per-category consent fingerprint for gcs/gcd requests", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setNet([{
      id: 11, url: "https://region1.google-analytics.com/g/collect?v=2&gcs=G101&gcd=11t1t1p1p5&tid=G-X",
      host: "region1.google-analytics.com", method: "POST", status: 204, ts: 1, propId: "G-X", evName: "page_view", preConsent: false
    }]);
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain("cfp-row");
    expect(html).toContain("cfp-g"); // ad_storage granted (gcd t)
    expect(html).toContain("cfp-d"); // ad_personalization denied (gcd p)
    expect(html).toContain(">aud<"); // ad_user_data pill label
    P.setNet([]);
  });
  test("dataLayer consent command row shows a consent fingerprint inline", () => {
    const html = renderTab("datalayer");
    // sample dataLayerSample has {0:'consent',1:'update',2:{ad_storage:'granted'}}
    expect(html).toContain("cfp-row");
    expect(html).toContain("cfp-g");
  });
  test("fingerprint prefers gcd (4 signals) over gcs, and renders unset pills for gcd 'l'", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setNet([{
      id: 12, url: "https://region1.google-analytics.com/g/collect?v=2&gcs=G11&gcd=11l1l1t1t5&tid=G-X",
      host: "region1.google-analytics.com", method: "POST", status: 204, ts: 1, propId: "G-X", evName: "", preConsent: false
    }]);
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain(">aud<"); // ad_user_data pill → gcd (4 signals) was chosen, not gcs (2)
    expect(html).toContain("cfp-u"); // gcd 'l' → unset pill
    P.setNet([]);
  });
  // ── new feature: gcs/gcd consent-signal decode ─────────────────────────────
  test("network detail decodes gcs/gcd consent signals when expanded", () => {
    const e = {
      id: 8, url: "https://region1.google-analytics.com/g/collect?v=2&gcs=G101&gcd=11t1t1p1p5&tid=G-X",
      payload: "", payloadNote: "", detail: { method: "POST", status: 204 }
    };
    globalThis.__panel.setExpanded({ "n|8|sig": true });
    const h = globalThis.__panel.netDetailHtml(e);
    expect(h).toContain("Consent-Signale");
    expect(h).toContain("G101");        // raw gcs
    expect(h).toContain("11t1t1p1p5");  // raw gcd
    expect(h).toContain("ad_user_data"); // gcd v2 signal label (via chip text)...
    globalThis.__panel.setExpanded({});
  });
});
