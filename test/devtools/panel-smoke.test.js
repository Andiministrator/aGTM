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
    id: id, className: "", textContent: "", value: "", __lastHTML: undefined, _html: "",
    querySelectorAll: function () { return []; },
    querySelector: function () { return null; },
    // Listeners are RECORDED, not discarded: the Simulation tab routes its controls
    // through delegated handlers on #tab-sim, so dropping them meant the delegation
    // logic (which branch fires for which class) was untestable — that is how the
    // F-94 class collision could be "fixed" with every test still green.
    __listeners: null,
    addEventListener: function (ev, fn) {
      if (!this.__listeners) this.__listeners = {};
      if (!this.__listeners[ev]) this.__listeners[ev] = [];
      this.__listeners[ev].push(fn);
    },
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
  var src = ["logmap.js", "netclassify.js", "consentsignals.js", "diagnose.js", "jsonview.js", "panel.js", "sim.js"]
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
    "  trackIds: trackIds," +
    "  clearIds: function(){ state.idTrack = {}; state.idHistory = []; state.idHost = null; }," +
    "  withScrollAnchor: withScrollAnchor," +
    "  simState: simState," +
    "  buildSimScaffold: buildSimScaffold," +
    "  attachSimDelegatedOnce: attachSimDelegatedOnce," +
    "  simSave: simSave," +
    "  simLoad: simLoad," +
    "  updateSimLive: updateSimLive," +
    "  setSimLast: function(v){ SIM_LAST = v; }," +
    "  simGcmStatusInner: simGcmStatusInner," +
    "  decodeParams: decodeParams," +
    "  exceptionInfo: exceptionInfo," +
    "  setSimWrite: function(v){ SIM_WRITE = v; }," +
    "  getSimWrite: function(){ return SIM_WRITE; }," +
    "  simFrameOrigins: simFrameOrigins" +
    "};";
  (0, eval)(src);
});

afterAll(() => {
  ["document", "setInterval", "fetch", "chrome"].forEach(function (k) { globalThis[k] = _saved[k]; });
});

function sampleSnap() {
  return {
    loaded: true, version: "1.5", pageHost: "fc-moto.com", navStart: 900,
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
    session: { source: "it_webgains", sid: "s1", uid: "C.1.fcm", raw: { sid: "s1", uid: "C.1.fcm", ret: true, vct: 7, created: 1785059324, counter: 29, pvCount: 5, eventCount: 29, sessionCount: 56 } },
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
    consentTs: 5000, consentFirstTs: 1800,
    logMilestones: { config: 1000, pending: 0, consent: 2000, inject: 0 },
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
  ["diagnose", "consent", "events", "datalayer", "session", "config", "network", "sim"].forEach((tab) => {
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
  // ── Kritiker R2 P2 + card #52: leak stamp reconciled against the CONSENT MOMENT ──
  // sampleSnap: logMilestones.consent = 2000 (the anchor), consentFirstTs = 1800,
  // consentTs = 5000 (the LAST consent event — deliberately NOT the anchor, see
  // consentMomentTs: the 2s CMP poll keeps moving it forward).
  test("a tracker that fired at/after the consent moment is NOT a leak (snapshot-lag reconcile)", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap();
    P.setSnap(snap);
    P.setNet([
      { id: 21, url: "https://connect.facebook.net/tr?id=1", host: "connect.facebook.net", method: "GET", status: 200, ts: 4000, time: 0, propId: "", evName: "", preConsent: true }, // after the moment → legit
      { id: 22, url: "https://analytics.tiktok.com/i/x", host: "analytics.tiktok.com", method: "GET", status: 200, ts: 1500, time: 0, propId: "", evName: "", preConsent: true }  // before the moment → leak
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

// ── card #49: Simulation tab (opt-in write channel) ──
describe("Simulation tab", () => {
  test("loaded: renders consent sim + fire + block + inject boxes (CMP-mock folded into consent)", () => {
    const html = renderTab("sim");
    expect(html).toContain("Write-Modus");
    expect(html).toContain("Consent simulieren");
    expect(html).not.toContain("CMP-Antwort mocken"); // standalone box removed; folded into consent
    expect(html).toContain("sim-restore");            // Restore now lives in the consent box
    expect(html).toContain("Event feuern");
    expect(html).toContain("blockieren");        // block-existing box
    expect(html).toContain('id="sim-block-cb"'); // persisted block checkbox
    expect(html).toContain("Integration injizieren"); // inject box
    expect(html).toContain("sim-useid");         // per-group name/ID toggle
    expect(html).toContain('id="sim-root"');
  });
  test("flat grouping: the four section headers render", () => {
    const html = renderTab("sim");
    expect(html).toContain("class=\"sim-sec\"");
    expect(html).toContain(">Consent<");
    expect(html).toContain(">Events<");
    expect(html).toContain(">GTM &amp; Integration<");
    expect(html).toContain(">Umgebung<");
  });
  test("card #50 extras + container override: all boxes render", () => {
    const html = renderTab("sim");
    expect(html).toContain("Google Consent Mode pushen");   // GCM push box
    expect(html).toContain("ad_storage");                    // a GCM signal row (simGcmRows non-empty)
    expect(html).toContain("Cookies zurücksetzen");          // cookie reset box
    expect(html).toContain("Szenario-Runner");               // scenario runner box
    expect(html).toContain("Consent-Store-POST testen");     // consent-store test box
    expect(html).toContain("Anderen GTM-Container laden");   // container-override box
    expect(html).toContain('id="sim-container-ids"');
  });
  test("not loaded: still offers the integration-inject box (for un-integrated pages)", () => {
    const P = globalThis.__panel;
    P.setSnap({ loaded: false });
    P.setTab("sim");
    P.render();
    const html = globalThis.document.getElementById("tab-sim")._html;
    expect(html).toContain("nicht geladen");
    expect(html).toContain("Integration injizieren");
    expect(html).toContain("Write-Modus");
    // consent-simulation controls are hidden when aGTM is absent
    expect(html).not.toContain("CMP-Antwort mocken");
    P.setSnap(sampleSnap());
  });
});

// ── card #47: Diagnose tab (Health-Score, Consent-Timeline, Compliance-Report) ──
describe("Diagnose tab", () => {
  test("health-score badge + per-check list render; sample snapshot is a pass", () => {
    const P = globalThis.__panel;
    P.setNet([]);
    const html = renderTab("diagnose");
    expect(html).toContain("Health-Score");
    expect(html).toContain("score-badge");
    expect(html).toContain("Consent-Mechanismus");
    expect(html).toContain("GTM injiziert");
    // sample: cmp pass (hasConsentCheck), consent pass, inject pass, no traps → no fail
    expect(html).toContain("score-pass");
    // leaks check is N/A with no network captured yet
    expect(html).toContain("ci-na");
    P.setNet([]);
  });
  test("leaks check stays N/A when the window was not observed, even with later traffic (F-1)", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap()); // navStart 900
    // a request long after navStart (window not covered) + no navigation witnessed
    P.setNet([{ id: 1, url: "https://sgtm.fc-moto.com/aGTMconsent", host: "sgtm.fc-moto.com", method: "POST", status: 200, ts: 99000, time: 0, propId: "", evName: "", preConsent: false }]);
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).toContain("ci-na");                 // leaks check is N/A, not a false pass
    expect(html).toContain("Vor-Consent-Fenster nicht erfasst");
    P.setNet([]);
  });
  test("leaks check passes when the capture began at page load (earliest ≈ navStart)", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap()); // navStart 900
    // earliest request within 1500ms of navStart → window observed; no leaks → pass
    P.setNet([{ id: 1, url: "https://sgtm.fc-moto.com/aGTM.js", host: "sgtm.fc-moto.com", method: "GET", status: 200, ts: 1200, time: 0, propId: "", evName: "", preConsent: false }]);
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).toContain("score-pass");
    expect(html).toContain("keine vor Consent gefeuerten Tracker");
    P.setNet([]);
  });
  test("a pre-consent leak flips the overall score to FAIL", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    // ts BEFORE the consent moment (logMilestones.consent = 2000) → a genuine leak
    P.setNet([{ id: 1, url: "https://analytics.tiktok.com/i/x", host: "analytics.tiktok.com", method: "GET", status: 200, ts: 1500, time: 0, propId: "", evName: "", preConsent: true }]);
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).toContain("score-fail");
    expect(html).toContain("Pre-Consent-Leaks");
    P.setNet([]);
  });
  test("a missing consent mechanism flips the score to FAIL", () => {
    const snap = sampleSnap();
    snap.cmp = ""; snap.hasConsentCheck = false;
    const html = renderTab("diagnose", snap);
    expect(html).toContain("score-fail");
    expect(html).toContain("Consent wird nie erkannt");
  });
  test("consent timeline builds a waterfall from navStart + consentTs", () => {
    // sample: navStart 900, log m1 1000, consentTs 5000 → ≥3 markers, relative to navStart
    const html = renderTab("diagnose");
    expect(html).toContain("Consent-Timeline");
    expect(html).toContain("Seitenaufruf");
    expect(html).toContain("CMP-Entscheidung");
    expect(html).toContain("tl-bar");
    expect(html).toContain("+0 ms"); // navStart is t0
    // per-milestone colours (not one flat accent)
    expect(html).toContain("tl-bar b-navStart");
    expect(html).toContain("b-consent");
  });
  test("consent marker uses the FIRST consent event, not the wandering last one (Andi 2026-07-26)", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap();
    snap.navStart = 1000;
    snap.logMilestones = {};                     // no m3/m2 logged → fall back to the dl-derived first consent
    snap.dl = [];
    snap.consentFirstTs = 1500;                  // first consent event (reader, full dl)
    snap.consentTs = 70000;                      // last consent event (2s poll kept advancing it)
    const html = renderTab("diagnose", snap);
    expect(html).toContain("+500 ms");           // 1500 − 1000 → stable CMP marker
    expect(html).not.toContain("+69000 ms");     // 70000 − 1000 would be the wandering marker
    P.clearIds();
  });
  test("a tag fire before the CMP decision paints the bar red + flags it in the timeline", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap();
    snap.navStart = 1000;
    snap.logMilestones = { consent: 3000 }; // CMP decision at +2000
    snap.dl = []; snap.consentTs = 0; snap.consentFirstTs = 0;
    P.setSnap(snap);
    // a GA collect fires at ts=1500 (start) → +500, i.e. BEFORE the +2000 consent marker
    P.setNet([{ id: 1, url: "https://region1.google-analytics.com/g/collect?v=2&tid=G-X", host: "region1.google-analytics.com", method: "POST", status: 204, ts: 1500, time: 0, propId: "", evName: "", preConsent: false }]);
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).toContain("b-leak");        // firstTag bar painted red
    expect(html).toContain("vor Consent");   // inline warning on the row
    P.setNet([]);
  });
  test("timeline shows what aGTM is still waiting on (consent + queued events)", () => {
    const snap = sampleSnap();
    snap.consent = { hasResponse: false, gtmConsent: false };
    snap.consentEvents = "cmp_update,CCM19.consentStateChanged";
    snap.init = false; snap.gtmScripts = [];
    snap.queueLen = 2; snap.queue = [{ event: "user" }, { event: "view_item_list" }];
    const html = renderTab("diagnose", snap);
    expect(html).toContain("Wartet aktuell auf");
    expect(html).toContain("tl-wait-dot");           // the pulsing indicator
    expect(html).toContain("CMP-Entscheidung");
    expect(html).toContain("cmp_update");            // awaited trigger events
    expect(html).toContain("Warteschlange");
    expect(html).toContain("view_item_list");        // queued event name
  });
  test("no 'waiting on' block once consent is granted and GTM is injected", () => {
    const html = renderTab("diagnose"); // sample: gtmConsent true, init + gtmScripts present
    expect(html).not.toContain("Wartet aktuell auf");
  });
  test("timeline flags a DL-Repeat late-enrichment gate that is still polling", () => {
    const snap = sampleSnap(); // consent granted + injected → only the DL-Repeat wait remains
    snap.dlrepeatPolling = true; snap.dlrepeatDone = false; snap.dlrepeatGate = "user_data?if=user[id]";
    const html = renderTab("diagnose", snap);
    expect(html).toContain("Wartet aktuell auf");
    expect(html).toContain("DL-Repeat");
    expect(html).toContain("Gate-Event");
    expect(html).toContain("user_data?if=user[id]"); // the actual gate spec from aGTM.d.dlrepeatGate
  });
  test("timeline waits on GTM injection when consent is granted but no container is in the DOM", () => {
    const snap = sampleSnap();
    snap.consent = { hasResponse: true, gtmConsent: true };
    snap.init = false; snap.gtmScripts = [];
    const html = renderTab("diagnose", snap);
    expect(html).toContain("Wartet aktuell auf");
    expect(html).toContain("GTM-Injektion");
    expect(html).toContain("noch nicht im DOM");
  });
  test("report export buttons are present", () => {
    const html = renderTab("diagnose");
    expect(html).toContain('id="diag-md"');
    expect(html).toContain('id="diag-json"');
    expect(html).toContain('id="diag-dl"');
  });
  test("GTM injection cards (former GTM tab) render at the bottom of Diagnose", () => {
    const html = renderTab("diagnose");
    expect(html).toContain("Injection-Status");           // GTM status card
    expect(html).toContain("Container — aGTM.c.gtm");     // container table
    expect(html).toContain("Injizierte Script-Tags (DOM)"); // sample has one script tag
  });
  test("timeline resolves markers from log ids + network (config/pending/inject/firstTag)", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap();
    snap.navStart = 900;
    // reader computes these over the FULL (uncapped) aGTM.l → first m1/m8/m3/m6
    snap.logMilestones = { config: 1000, pending: 1100, consent: 1500, inject: 1800 };
    snap.consentFirstTs = 0;
    P.setSnap(snap);
    P.setNet([
      { id: 1, url: "https://www.googletagmanager.com/gtm.js?id=GTM-X", host: "www.googletagmanager.com", method: "GET", status: 200, ts: 2000, time: 0, propId: "", evName: "", preConsent: false },
      { id: 2, url: "https://region1.google-analytics.com/g/collect?v=2&tid=G-X", host: "region1.google-analytics.com", method: "POST", status: 204, ts: 2500, time: 0, propId: "", evName: "", preConsent: false }
    ]);
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).toContain("aGTM config()");     // m1
    expect(html).toContain("Consent ausstehend"); // m8
    expect(html).toContain("CMP-Entscheidung");   // m3 (first, not the later consentTs=5000)
    expect(html).toContain("GTM injiziert");      // m6
    expect(html).toContain("Erster Tag-Fire");    // GA collect
    expect(html).toContain("+0 ms");              // navStart is t0
    P.setNet([]);
  });
  test("Session & IDs: current sid/uid shown with a 'since' timestamp", () => {
    const P = globalThis.__panel;
    P.clearIds();
    P.trackIds({ loaded: true, session: { sid: "s1", uid: "C.1.abc" }, config: { user_id: "crm-42" } });
    const html = renderTab("diagnose");
    expect(html).toContain("Session &amp; IDs");
    expect(html).toContain("Session-ID");
    expect(html).toContain("C.1.abc");
    expect(html).toContain("crm-42");
    expect(html).toContain("seit");
    P.clearIds();
  });
  test("Session & IDs: the F→C user-id promote is recorded as a change (from → to)", () => {
    const P = globalThis.__panel;
    P.clearIds();
    P.trackIds({ loaded: true, session: { sid: "s1", uid: "F.1.fingerprint" }, config: {} }); // pre-consent fingerprint
    P.trackIds({ loaded: true, session: { sid: "s1", uid: "C.1.stable" }, config: {} });       // promote after consent
    const html = renderTab("diagnose");
    expect(html).toContain("Änderungen");
    expect(html).toContain("F.1.fingerprint"); // from
    expect(html).toContain("C.1.stable");      // to
    expect(html).toContain("gesetzt");         // the initial sid/uid set entries
    P.clearIds();
  });
  test("Session & IDs: a mid-navigation {loaded:false} does not record a spurious clear", () => {
    const P = globalThis.__panel;
    P.clearIds();
    P.trackIds({ loaded: true, session: { sid: "s1", uid: "C.1.abc" }, config: {} });
    P.trackIds({ loaded: false }); // navigation blip — must be ignored
    P.trackIds({ loaded: true, session: { sid: "s1", uid: "C.1.abc" }, config: {} });
    const html = renderTab("diagnose");
    // only the two initial 'gesetzt' entries (sid + uid), no clear/change from the blip
    expect(html).not.toContain("→"); // no change arrow rendered
    P.clearIds();
  });
  test("Session & IDs: empty session shows the promote hint, no history", () => {
    const P = globalThis.__panel;
    P.clearIds();
    const snap = sampleSnap();
    snap.session = { source: "", sid: "", uid: "", raw: {} };
    snap.config = { cmp: "", gtm: { "G": {} }, gdl: "dataLayer" };
    const html = renderTab("diagnose", snap);
    expect(html).toContain("Noch keine ID-Änderung");
    expect(html).toContain("F→C-User-ID-Promote");
    P.clearIds();
  });
  test("Session & IDs: Session-API counters render as smart stat tiles + snapshot caveat", () => {
    const P = globalThis.__panel;
    P.clearIds();
    const html = renderTab("diagnose"); // sample raw: created + sessionCount 56, pvCount 5, eventCount 29
    expect(html).toContain('class="stat"');
    expect(html).toContain("Sitzung");
    expect(html).toContain("#56");                 // sessionCount as "#56"
    expect(html).toContain("Wiederkehrer");        // sc>1 → returning-visitor derivation
    expect(html).toContain("Seitenaufrufe");
    expect(html).toContain("Events / Aufruf");     // derived engagement (29/5 = 5.8)
    expect(html).toContain("5.8");
    expect(html).toContain("Session-Alter");       // live age tile from `created`
    expect(html).toContain("Server-Stand vom Seitenaufruf"); // the mandatory snapshot caveat
    P.clearIds();
  });
  test("Session & IDs: counters fall back to window.se_data when aGTM.d.session lacks them (fc-moto)", () => {
    const P = globalThis.__panel;
    P.clearIds();
    const snap = sampleSnap();
    // fc-moto shape: aGTM.d.session has ids/vct but NOT the counters; se_data carries them
    snap.session = { source: "none", sid: "e49a", uid: "C.1.fcm", raw: { uid: "C.1.fcm", sid: "e49a", ret: true, vct: 49 } };
    snap.seData = { created: 1785059324, counter: 50, pvCount: 8, eventCount: 50, sessionCount: 56 };
    const html = renderTab("diagnose", snap);
    expect(html).toContain("#56");                    // sessionCount from se_data
    expect(html).toContain("Wiederkehrer");
    expect(html).toContain("Session-Alter");          // created from se_data
    expect(html).toContain("window.se_data");         // source note (transparency)
    P.clearIds();
  });
  test("Session & IDs: discovery lists numeric aGTM.d.session fields when no known counters (fc-moto vct)", () => {
    const P = globalThis.__panel;
    P.clearIds();
    const snap = sampleSnap();
    // fc-moto shape without se_data counters: only ids + vct in aGTM.d.session, nothing in se_data
    snap.session = { source: "none", sid: "s1", uid: "C.1", raw: { uid: "C.1", ret: true, vct: 49 } };
    snap.seData = {};
    const html = renderTab("diagnose", snap);
    expect(html).toContain("Numerische Felder"); // discovery aid
    expect(html).toContain("vct=49");             // the real numeric field surfaced
    P.clearIds();
  });
  test("Session & IDs: first visit (sessionCount 1) is labelled Erstbesuch", () => {
    const P = globalThis.__panel;
    P.clearIds();
    const snap = sampleSnap();
    snap.session.raw = { created: 1785059324, sessionCount: 1, pvCount: 1, eventCount: 1 };
    const html = renderTab("diagnose", snap);
    expect(html).toContain("Erstbesuch");
    expect(html).not.toContain("Wiederkehrer");
    P.clearIds();
  });
  test("Session & IDs history persists across a panel reopen (localStorage per host)", () => {
    const store = {};
    const prevLS = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const P = globalThis.__panel;
    P.clearIds();
    // observe a promote on host a.de → persisted
    P.trackIds({ loaded: true, pageHost: "a.de", session: { sid: "s1", uid: "F.1.x" }, config: {} });
    P.trackIds({ loaded: true, pageHost: "a.de", session: { sid: "s1", uid: "C.1.y" }, config: {} });
    // simulate a panel reopen: wipe in-memory, then the first poll re-loads from storage
    P.clearIds();
    P.trackIds({ loaded: true, pageHost: "a.de", session: { sid: "s1", uid: "C.1.y" }, config: {} });
    const html = renderTab("diagnose");
    expect(html).toContain("F.1.x");   // the change survived the reopen
    expect(html).toContain("C.1.y");
    // a DIFFERENT host starts clean (no cross-site mixing)
    P.trackIds({ loaded: true, pageHost: "b.de", session: { sid: "s9", uid: "C.9.z" }, config: {} });
    const htmlB = renderTab("diagnose");
    expect(htmlB).not.toContain("F.1.x");
    globalThis.localStorage = prevLS;
    P.clearIds();
  });
  test("net-derived markers use request START (finished ts − duration), not the finish time (F-3)", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap();
    snap.navStart = 1000;
    snap.logMilestones = {}; snap.dl = []; snap.consentTs = 0; snap.consentFirstTs = 0; // force inject to fall back to the network gtm.js
    P.setSnap(snap);
    // gtm.js finished at ts=3000 after a 800ms request → start ≈ 2200 → rel = 1200 (not 2000)
    P.setNet([{ id: 1, url: "https://www.googletagmanager.com/gtm.js?id=GTM-X", host: "www.googletagmanager.com", method: "GET", status: 200, ts: 3000, time: 800, propId: "", evName: "", preConsent: false }]);
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).toContain("+1200 ms"); // 2200 − 1000, i.e. start-based not finish-based (+2000)
    expect(html).not.toContain("+2000 ms");
    P.setNet([]);
  });
});

describe("Simulation tab — GCM push modes (card #51)", () => {
  // The mode drives which controls exist, so each case rebuilds the scaffold.
  function renderSimWithMode(mode) {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setTab("sim");
    P.render();
    P.simState().gcmMode = mode;
    P.buildSimScaffold();
    return globalThis.document.getElementById("tab-sim")._html;
  }
  afterAll(() => { globalThis.__panel.simState().gcmMode = "update"; });

  test("all three verbs are offered as radios", () => {
    const html = renderSimWithMode("update");
    expect(html).toContain('class="sim-gcm-mode"');
    expect(html).toContain('value="update"');
    expect(html).toContain('value="default"');
    expect(html).toContain('value="declare"');
  });
  test("the button label follows the selected mode", () => {
    expect(renderSimWithMode("update")).toContain("consent update pushen");
    expect(renderSimWithMode("default")).toContain("consent default pushen");
    expect(renderSimWithMode("declare")).toContain("consent declare pushen");
  });
  test("wait_for_update/region exist ONLY in default mode (they are default-only in the gtag API)", () => {
    const dflt = renderSimWithMode("default");
    expect(dflt).toContain('id="sim-gcm-wait"');
    expect(dflt).toContain('id="sim-gcm-regions"');
    const upd = renderSimWithMode("update");
    expect(upd).not.toContain('id="sim-gcm-wait"');
    expect(upd).not.toContain('id="sim-gcm-regions"');
    const dec = renderSimWithMode("declare");
    expect(dec).not.toContain('id="sim-gcm-wait"');
    expect(dec).not.toContain('id="sim-gcm-regions"');
  });
  test("an unparsable wait_for_update is flagged at the field instead of silently dropped", () => {
    const P = globalThis.__panel;
    P.simState().gcmWait = "500ms";                 // Number("500ms") → NaN → builder drops it
    const bad = renderSimWithMode("default");
    expect(bad).toContain("wird NICHT mitgesendet");
    P.simState().gcmWait = "500";
    expect(renderSimWithMode("default")).not.toContain("wird NICHT mitgesendet");
    P.simState().gcmWait = "";                      // empty = deliberately unset, no warning
    expect(renderSimWithMode("default")).not.toContain("wird NICHT mitgesendet");
  });
  test("the force override is offered for default/declare but not for update", () => {
    expect(renderSimWithMode("default")).toContain("sim-gcm-force");
    expect(renderSimWithMode("declare")).toContain("sim-gcm-force");
    expect(renderSimWithMode("update")).not.toContain("sim-gcm-force");
  });
  test("the Ist-Zustand line reports effective state AND origin from the ics snapshot", () => {
    renderSimWithMode("update");
    // Assert on the status NODE, not the whole tab: "granted" also appears in the box's
    // intro text ("Häkchen = granted"), so a tab-wide toContain would pass even if the
    // line rendered no values at all.
    const line = globalThis.__nodes["sim-gcm-status"]._html;
    expect(line).toContain("Ist-Zustand");
    expect(line).toContain(">granted<");
    expect(line).toContain("(update)"); // sampleSnap's ad_storage/analytics_storage came from an update
  });
  test("without ANY GTM signal the line says the default window is still open", () => {
    const P = globalThis.__panel;
    const snap = sampleSnap();
    snap.gcm = null; snap.init = false; snap.icsPresent = false; snap.gtmPresent = false;
    P.setSnap(snap);
    P.setTab("sim");
    P.render();
    P.buildSimScaffold();
    const html = globalThis.document.getElementById("tab-sim")._html;
    expect(html).toContain("google_tag_data.ics");
    expect(html).toContain("implizit");
    expect(html).toContain("offen");
    P.setSnap(sampleSnap());
  });
  // The line must agree with the in-page guard. Each of these three states makes the
  // guard refuse a default push, so the line must NOT advertise an open window.
  test("no ics values but GTM already at work → line says the window is CLOSED, not open", () => {
    const P = globalThis.__panel;
    [
      { init: true, icsPresent: false, gtmPresent: false },   // aGTM ran its gated load
      { init: false, icsPresent: true, gtmPresent: false },   // ics exists, entries empty
      { init: false, icsPresent: false, gtmPresent: true }    // noConsent container / override
    ].forEach(function (state) {
      const line = P.simGcmStatusInner(Object.assign({ gcm: null }, state));
      expect(line).toContain("geschlossen");
      expect(line).not.toContain("<b>offen</b>");
    });
  });
});

/* ==================================================================== *
 *  Simulation tab — delegated handlers, persistence, effect panel      *
 *  (critic round card #51: these paths had zero coverage, so the F-94  *
 *  fix could be reverted with every test still green)                  *
 * ==================================================================== */

describe("Simulation tab — delegated change handlers (F-94)", () => {
  // Dispatch a change event into the delegated listener registered on #tab-sim.
  function fireChange(target) {
    const node = globalThis.__nodes["tab-sim"];
    const ls = (node.__listeners && node.__listeners.change) || [];
    expect(ls.length).toBeGreaterThan(0);   // no listener = the test proves nothing
    ls.forEach(function (fn) { fn({ target: target }); });
  }
  function el(attrs) {
    return Object.assign({
      className: "", checked: false, value: "", id: undefined,
      getAttribute: function () { return null; }
    }, attrs);
  }

  beforeAll(() => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap()); P.setTab("sim"); P.render();
    P.attachSimDelegatedOnce();
  });
  afterAll(() => {
    const st = globalThis.__panel.simState();
    st.gcmMode = "update"; st.gcmForce = false;
  });

  test("a mode radio switches the mode and does NOT write into st.gcm", () => {
    const P = globalThis.__panel;
    const st = P.simState();
    st.gcm = { ad_storage: "granted" };
    st.gcmMode = "update"; st.gcmForce = true;
    // The radios carry class "sim-gcm-mode" and no data-sig — under the old substring
    // match this landed in the signal branch and wrote st.gcm[null] = "granted".
    fireChange(el({ className: "sim-gcm-mode", value: "default", checked: true }));
    expect(P.simState().gcmMode).toBe("default");
    expect(Object.keys(P.simState().gcm)).toEqual(["ad_storage"]);  // no "null" key
    expect(P.simState().gcmForce).toBe(false);                      // reset on mode switch
  });
  test("an unchecked radio (the one being deselected) is ignored", () => {
    const P = globalThis.__panel;
    P.simState().gcmMode = "declare";
    fireChange(el({ className: "sim-gcm-mode", value: "update", checked: false }));
    expect(P.simState().gcmMode).toBe("declare");
  });
  test("a signal checkbox still toggles its own signal", () => {
    const P = globalThis.__panel;
    P.simState().gcm = { ad_storage: "granted" };
    fireChange(el({
      className: "sim-gcm", checked: false,
      getAttribute: function (a) { return a === "data-sig" ? "ad_storage" : null; }
    }));
    expect(P.simState().gcm.ad_storage).toBe("denied");
  });
  test("a signal checkbox without data-sig writes nothing (no null key)", () => {
    const P = globalThis.__panel;
    P.simState().gcm = { ad_storage: "granted" };
    fireChange(el({ className: "sim-gcm", checked: true }));
    expect(Object.keys(P.simState().gcm)).toEqual(["ad_storage"]);
  });
  test("the force checkbox is picked up by id", () => {
    const P = globalThis.__panel;
    P.simState().gcmForce = false;
    fireChange(el({ id: "sim-gcm-force", checked: true }));
    expect(P.simState().gcmForce).toBe(true);
    P.simState().gcmForce = false;
  });
});

describe("Simulation tab — GCM state persistence per host", () => {
  var store, prevLS;
  beforeAll(() => {
    store = {};
    prevLS = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    };
  });
  afterAll(() => { globalThis.localStorage = prevLS; });

  test("gcmMode/gcmWait/gcmRegions survive a panel reopen", () => {
    const P = globalThis.__panel;
    const st = P.simState();
    st.host = "example.com"; st.gcmMode = "default"; st.gcmWait = "500"; st.gcmRegions = "DE,AT";
    P.simSave();
    P.simLoad("example.com");
    expect([P.simState().gcmMode, P.simState().gcmWait, P.simState().gcmRegions])
      .toEqual(["default", "500", "DE,AT"]);
  });
  test("an unknown persisted mode falls back to 'update' instead of being trusted", () => {
    const P = globalThis.__panel;
    store["aGTMInspector.sim"] = JSON.stringify({ "example.com": { gcmMode: "bogus" } });
    P.simLoad("example.com");
    expect(P.simState().gcmMode).toBe("update");
  });
  test("gcmForce is NEVER persisted — overriding the guard must not outlive the session", () => {
    const P = globalThis.__panel;
    const st = P.simState();
    st.host = "example.com"; st.gcmForce = true;
    P.simSave();
    expect(store["aGTMInspector.sim"]).not.toContain("gcmForce");
    P.simLoad("example.com");
    expect(P.simState().gcmForce).toBe(false);
  });
});

describe("Simulation tab — effect panel + polled Ist-Zustand line", () => {
  afterAll(() => { globalThis.__panel.setSimLast(null); });

  test("a force-pushed late default is flagged as ineffective", () => {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setSimLast({ ok: true, pushed: true, mode: "default", late: true,
      signals: { ad_storage: "denied" }, dataLayer: "dataLayer" });
    P.updateSimLive();
    const html = globalThis.__nodes["sim-live"]._html;
    expect(html).toContain("zu spät gepusht");
    expect(html).toContain("consent default");
  });
  test("a late 'update' is NOT flagged — update is legitimate at any time", () => {
    const P = globalThis.__panel;
    P.setSimLast({ ok: true, pushed: true, mode: "update", late: true,
      signals: { ad_storage: "granted" }, dataLayer: "dataLayer" });
    P.updateSimLive();
    expect(globalThis.__nodes["sim-live"]._html).not.toContain("zu spät gepusht");
  });
  test("the Ist-Zustand line follows the poll (the scaffold is built only once)", () => {
    const P = globalThis.__panel;
    const empty = sampleSnap();
    empty.gcm = null; empty.init = false; empty.icsPresent = false; empty.gtmPresent = false;
    P.setSnap(empty); P.setTab("sim"); P.render(); P.buildSimScaffold();
    expect(globalThis.__nodes["sim-gcm-status"]._html).toContain("offen");
    P.setSnap(sampleSnap());   // ics appears — WITHOUT rebuilding the scaffold
    P.updateSimLive();
    const line = globalThis.__nodes["sim-gcm-status"]._html;
    expect(line).toContain("(update)");
    expect(line).not.toContain("offen");
  });
});

/* ==================================================================== *
 *  Card #52 — pre-consent leak reconcile anchored on the consent MOMENT *
 * ==================================================================== */

describe("Pre-consent leak reconcile (card #52 — victors.de false positives)", () => {
  // Reproduces the reported case: aGTM.js at t+0, then gtm.js/gtag.js ~1.2s later.
  // All three were stamped preConsent because the 700ms snapshot poll had not caught
  // up yet — but consent WAS already there (aGTM only injects GTM after gtmConsent).
  function victorsSnap() {
    const snap = sampleSnap();
    snap.logMilestones = { config: 1000, pending: 0, consent: 1400, inject: 1500 };
    snap.consentFirstTs = 1400;
    // The last consent event, pushed forward by the library's 2s CMP poll. Anchoring on
    // this is what kept the stamps stuck (the actual bug).
    snap.consentTs = 90000;
    return snap;
  }
  const gtmReqs = [
    { id: 1, url: "https://rp.victors.de/gtm.js?id=victors", host: "rp.victors.de", method: "GET", status: 200, ts: 1600, time: 0, propId: "", evName: "", preConsent: true },
    { id: 2, url: "https://www.googletagmanager.com/gtag/js?id=AW-17009335996", host: "www.googletagmanager.com", method: "GET", status: 200, ts: 1750, time: 0, propId: "", evName: "", preConsent: true }
  ];

  afterAll(() => { globalThis.__panel.setNet([]); globalThis.__panel.setSnap(sampleSnap()); });

  test("GTM loads that started AFTER the consent moment are no longer flagged", () => {
    const P = globalThis.__panel;
    P.setSnap(victorsSnap());
    P.setNet(gtmReqs.slice());
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain("gtm.js");            // the rows ARE rendered …
    expect(html).toContain("gtag/js");
    expect(html).not.toContain("pre-consent");   // … just without the badge
    expect(html).not.toContain("Pre-Consent-Leak");
  });

  test("anchoring on consentTs (the LAST consent event) would still flag them — the bug", () => {
    // Guards the fix itself: with the old anchor every request is compared against
    // t=90000, so nothing can ever reconcile. If someone reverts consentMomentTs to
    // snap.consentTs, the test above fails and this one documents why.
    const snap = victorsSnap();
    expect(snap.consentTs).toBeGreaterThan(gtmReqs[1].ts);      // the trap
    expect(snap.logMilestones.consent).toBeLessThan(gtmReqs[0].ts); // the correct anchor
  });

  test("a real leak BEFORE the consent moment is still reported", () => {
    const P = globalThis.__panel;
    P.setSnap(victorsSnap());
    P.setNet([
      { id: 3, url: "https://connect.facebook.net/tr?id=1", host: "connect.facebook.net", method: "GET", status: 200, ts: 1100, time: 0, propId: "", evName: "", preConsent: true }
    ].concat(gtmReqs));
    P.netSet("netOnlyAGTM", false);
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain("Pre-Consent-Leak");
    expect(html).toContain("Meta Pixel");
    expect(html).not.toContain("Google Tag Manager");   // the GTM loads were reconciled away
  });

  test("a slow request that STARTED before consent stays a leak (start, not finish, counts)", () => {
    // Finished at 2200 (after the 1400 moment) but left at 900 — pre-consent.
    // Comparing e.ts alone would clear it; reqStartTs subtracts the HAR duration.
    const P = globalThis.__panel;
    P.setSnap(victorsSnap());
    P.setNet([{ id: 4, url: "https://analytics.tiktok.com/i/x", host: "analytics.tiktok.com", method: "GET", status: 200, ts: 2200, time: 1300, propId: "", evName: "", preConsent: true }]);
    P.netSet("netOnlyAGTM", false);
    P.setTab("network"); P.render();
    const html = globalThis.document.getElementById("tab-network")._html;
    expect(html).toContain("Pre-Consent-Leak");
    expect(html).toContain("TikTok");
  });

  test("the health score follows the same reconcile (no false red in a customer report)", () => {
    const P = globalThis.__panel;
    P.setSnap(victorsSnap());
    P.setNet(gtmReqs.slice());
    P.setTab("diagnose"); P.render();
    const html = globalThis.document.getElementById("tab-diagnose")._html;
    expect(html).not.toContain("score-fail");
  });

  test("without any consent anchor the stamp stands (conservative, no silent all-clear)", () => {
    const P = globalThis.__panel;
    const snap = victorsSnap();
    snap.logMilestones = { config: 1000, pending: 0, consent: 0, inject: 0 };
    snap.consentFirstTs = 0;
    P.setSnap(snap);
    P.setNet(gtmReqs.slice());
    P.netSet("netOnlyAGTM", false);
    P.setTab("network"); P.render();
    expect(globalThis.document.getElementById("tab-network")._html).toContain("Pre-Consent-Leak");
  });
});

/* ==================================================================== *
 *  Query-string values are URL-decoded for display                      *
 * ==================================================================== */

describe("decodeParams — readable query-string values", () => {
  const dp = () => globalThis.__panel.decodeParams;

  test("decodes the GA4 case from the report (ep.text of a JS error)", () => {
    const r = dp()({
      "ep.text": "Uncaught%20ReferenceError%3A%20Fancybox%20is%20not%20defined%20%7C%20line%3A%202054"
    });
    expect(r.map["ep.text"]).toBe("Uncaught ReferenceError: Fancybox is not defined | line: 2054");
    expect(r.decoded).toBe(1);
  });
  test("decodes a comma-wrapped vendor id list", () => {
    const r = dp()({ "ep.cmp_vendorIDs": "%2C50%2C39%2C511%2C" });
    expect(r.map["ep.cmp_vendorIDs"]).toBe(",50,39,511,");
  });
  test("values without a percent sign are passed through untouched", () => {
    const r = dp()({ tid: "G-BJE5WBVXFY", en: "exception", v: "2" });
    expect(r.map).toEqual({ tid: "G-BJE5WBVXFY", en: "exception", v: "2" });
    expect(r.decoded).toBe(0);
  });
  test("a malformed sequence keeps the raw value instead of throwing", () => {
    // decodeURIComponent("100%") throws URIError — a naive decode would kill the row.
    const r = dp()({ discount: "100%", broken: "%ZZ", lone: "50%-off" });
    expect(r.map.discount).toBe("100%");
    expect(r.map.broken).toBe("%ZZ");
    expect(r.map.lone).toBe("50%-off");
    expect(r.decoded).toBe(0);
  });
  test("'+' is NOT turned into a space (that would be form-encoding, not URL-encoding)", () => {
    const r = dp()({ q: "a+b%20c" });
    expect(r.map.q).toBe("a+b c");
  });
  test("double-encoded values are unwrapped ONE level and reported", () => {
    // %252C → one decode gives %2C. Unwrapping further would hide a real tracking bug.
    const r = dp()({ list: "%252C50%252C39" });
    expect(r.map.list).toBe("%2C50%2C39");
    expect(r.doubled).toBe(1);
  });
  test("a URL inside a parameter becomes readable", () => {
    const r = dp()({ dl: "https%3A%2F%2Fwww.victors.de%2Flayout%2Fjs%2Fmain.js%3F01" });
    expect(r.map.dl).toBe("https://www.victors.de/layout/js/main.js?01");
  });
  test("non-string values and garbage input never throw", () => {
    expect(dp()({ n: 5, nil: null }).map).toEqual({ n: 5, nil: null });
    expect(dp()(null).map).toEqual({});
    expect(dp()("nope").map).toEqual({});
  });
});

describe("Query-String sub-section rendering", () => {
  function expandedQueryHtml(qs) {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setNet([{
      id: 77, url: "https://rp.victors.de/g/collect?v=2", host: "rp.victors.de", method: "GET",
      status: 200, ts: 5000, time: 0, propId: "G-X", evName: "exception", preConsent: false,
      detail: { method: "GET", url: "https://rp.victors.de/g/collect?v=2", status: 200, queryString: qs }
    }]);
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setExpanded({ "n|77": true, "n|77|q": true });
    P.setTab("network"); P.render();
    return globalThis.document.getElementById("tab-network")._html;
  }
  afterAll(() => { const P = globalThis.__panel; P.setNet([]); P.setExpanded({}); P.setSnap(sampleSnap()); });

  test("the expanded section shows decoded values and says so", () => {
    const html = expandedQueryHtml({ "ep.text": "JS%20Error%3A%20boom", v: "2" });
    expect(html).toContain("JS Error: boom");
    expect(html).not.toContain("JS%20Error");
    expect(html).toContain("URL-dekodiert");
  });
  test("nothing to decode → no misleading label", () => {
    const html = expandedQueryHtml({ v: "2", tid: "G-X" });
    expect(html).toContain("Query-String");
    expect(html).not.toContain("URL-dekodiert");
  });
  test("double encoding is called out rather than silently unwrapped", () => {
    const html = expandedQueryHtml({ list: "%252C50" });
    expect(html).toContain("doppelt kodiert");
  });
});

/* ==================================================================== *
 *  Exception hits show type + text in the list preview                  *
 * ==================================================================== */

describe("exceptionInfo — pull type/text out of the three carriers", () => {
  const ex = () => globalThis.__panel.exceptionInfo;
  const GA4_URL = "https://rp.victors.de/g/collect?v=2&en=exception" +
    "&ep.type=JS%20Error&ep.text=Uncaught%20ReferenceError%3A%20Fancybox%20is%20not%20defined";

  test("GA4 GET: decodes ep.type / ep.text from the query string", () => {
    const r = ex()({ evName: "exception", url: GA4_URL });
    expect(r.type).toBe("JS Error");
    expect(r.text).toBe("Uncaught ReferenceError: Fancybox is not defined");
  });
  test("GA4 POST: reads them from the body", () => {
    const r = ex()({
      evName: "exception", url: "https://x.example/g/collect",
      payload: "en=exception&ep.type=JS%20Error&ep.text=boom%20happened&v=2"
    });
    expect(r.type).toBe("JS Error");
    expect(r.text).toBe("boom happened");
  });
  test("aEvents: reads the plain keys of the decoded object", () => {
    const r = ex()({ ae: { event: "exception", type: "JS Error", text: "aEvents boom" }, url: "https://x/e?e=1" });
    expect(r.type).toBe("JS Error");
    expect(r.text).toBe("aEvents boom");
  });
  test("aEvents alternate key names are covered", () => {
    const r = ex()({ ae: { event_name: "exception", exception_type: "TypeError", error_message: "x is not a function" }, url: "https://x/e" });
    expect(r.type).toBe("TypeError");
    expect(r.text).toBe("x is not a function");
  });
  test("a non-exception event returns null — no noise on normal rows", () => {
    expect(ex()({ evName: "page_view", url: "https://x/g/collect?en=page_view&ep.text=hello" })).toBeNull();
    expect(ex()({ ae: { event: "add_to_cart" }, url: "https://x/e" })).toBeNull();
  });
  test("an exception without any detail returns null instead of an empty box", () => {
    expect(ex()({ evName: "exception", url: "https://x/g/collect?en=exception" })).toBeNull();
  });
  test("only one of the two present is still worth showing", () => {
    const r = ex()({ evName: "exception", url: "https://x/g/collect?en=exception&ep.text=lonely" });
    expect(r.type).toBe("");
    expect(r.text).toBe("lonely");
  });
  test("the regex-escaped key name matters: ep.type must not match epXtype", () => {
    const r = ex()({ evName: "exception", url: "https://x/g/collect", payload: "epXtype=wrong&ep.type=right" });
    expect(r.type).toBe("right");
  });
  test("garbage input never throws", () => {
    expect(ex()({})).toBeNull();
    expect(ex()({ evName: "exception" })).toBeNull();
    expect(ex()({ evName: "exception", url: "not a url", payload: null })).toBeNull();
  });
});

describe("Exception preview rendering in the network list", () => {
  function listHtml(entry) {
    const P = globalThis.__panel;
    P.setSnap(sampleSnap());
    P.setNet([Object.assign({
      id: 88, host: "rp.victors.de", method: "GET", status: 200, ts: 5000, time: 0,
      propId: "G-X", preConsent: false, detail: {}
    }, entry)]);
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setExpanded({});
    P.setTab("network"); P.render();
    return globalThis.document.getElementById("tab-network")._html;
  }
  afterAll(() => { const P = globalThis.__panel; P.setNet([]); P.setSnap(sampleSnap()); });

  test("the decoded message is visible without expanding the row", () => {
    const html = listHtml({
      evName: "exception",
      url: "https://rp.victors.de/g/collect?v=2&en=exception&ep.type=JS%20Error&ep.text=Uncaught%20ReferenceError%3A%20Fancybox%20is%20not%20defined"
    });
    expect(html).toContain("net-exc");
    expect(html).toContain("JS Error");
    expect(html).toContain("Uncaught ReferenceError: Fancybox is not defined");
  });
  test("a normal event renders no exception block", () => {
    const html = listHtml({ evName: "page_view", url: "https://rp.victors.de/g/collect?v=2&en=page_view" });
    expect(html).not.toContain("net-exc");
  });
  test("a very long message is truncated in the list, full text kept in the tooltip", () => {
    const long = "E".repeat(400);
    const html = listHtml({ evName: "exception", url: "https://x/g/collect?en=exception&ep.text=" + long });
    // The VISIBLE span is capped …
    const vis = /<span class="net-exc-m">([^<]*)<\/span>/.exec(html);
    expect(vis).not.toBeNull();
    expect(vis[1].length).toBeLessThan(200);
    expect(vis[1]).toContain("…");
    // … while the title attribute still carries the whole message for hovering.
    const tip = /title="(E+)"/.exec(html);
    expect(tip).not.toBeNull();
    expect(tip[1].length).toBe(400);
  });
});

describe("Leak banner does not flash on page load (settle window)", () => {
  // The stamp is taken at capture time; the consent anchor only appears in a LATER
  // snapshot. Without a grace period the banner shows red for a fraction of a second
  // on every load before the reconcile catches up (Andi, victors.de).
  function noAnchorSnap() {
    const snap = sampleSnap();
    snap.logMilestones = { config: 0, pending: 0, consent: 0, inject: 0 };
    snap.consentFirstTs = 0;
    snap.consentTs = 0;
    snap.consent = { hasResponse: false, gtmConsent: false, services: "", purposes: "", vendors: "" };
    return snap;
  }
  function bannerFor(tsOffsetMs) {
    const P = globalThis.__panel;
    P.setSnap(noAnchorSnap());
    P.setNet([{
      id: 91, url: "https://analytics.tiktok.com/i/x", host: "analytics.tiktok.com",
      method: "GET", status: 200, ts: Date.now() - tsOffsetMs, time: 0,
      propId: "", evName: "", preConsent: true
    }]);
    P.netSet("netOnlyAGTM", false); P.netSet("netSearch", ""); P.netSet("netHidden", {});
    P.setTab("network"); P.render();
    return globalThis.document.getElementById("tab-network")._html;
  }
  afterAll(() => { const P = globalThis.__panel; P.setNet([]); P.setSnap(sampleSnap()); });

  test("a request captured just now is undecided — no banner yet", () => {
    expect(bannerFor(0)).not.toContain("Pre-Consent-Leak");
  });
  test("once the grace period passed and no consent ever came, it IS reported", () => {
    expect(bannerFor(5000)).toContain("Pre-Consent-Leak");
  });
  test("with an anchor present the decision is immediate — no waiting", () => {
    const P = globalThis.__panel;
    const snap = noAnchorSnap();
    snap.logMilestones = { config: 0, pending: 0, consent: Date.now() - 10000, inject: 0 };
    snap.consent = { hasResponse: true, gtmConsent: true, services: "a", purposes: "", vendors: "" };
    P.setSnap(snap);
    P.setNet([{
      id: 92, url: "https://analytics.tiktok.com/i/x", host: "analytics.tiktok.com",
      method: "GET", status: 200, ts: Date.now() - 20000, time: 0,   // BEFORE the anchor
      propId: "", evName: "", preConsent: true
    }]);
    P.netSet("netOnlyAGTM", false);
    P.setTab("network"); P.render();
    // Old enough to be past the grace period anyway, but the point is that the anchor
    // decides it — a pre-consent hit stays a finding.
    expect(globalThis.document.getElementById("tab-network")._html).toContain("Pre-Consent-Leak");
  });
});

describe("Simulation tab — action buttons actually reach the page", () => {
  // The button handlers (bindClick) were never exercised: only the DELEGATED handlers
  // had tests. A dead button is invisible to the suite otherwise.
  var evals;
  function clickSim(id) {
    const node = globalThis.__nodes[id];
    const ls = (node.__listeners && node.__listeners.click) || [];
    expect(ls.length).toBeGreaterThan(0);   // no handler bound = the button is dead
    // Only the LAST binding is live. In the browser `innerHTML = …` replaces the child
    // nodes, so each scaffold rebuild starts from a listener-free button; the fake DOM
    // keeps one node per id, so bindings accumulate here. Calling the most recent one
    // mirrors the real behaviour.
    ls[ls.length - 1]({});
  }
  beforeAll(() => {
    evals = [];
    globalThis.chrome.devtools.inspectedWindow.eval = function (code, cb) {
      evals.push(code);
      if (cb) cb({ ok: true, cleared: [], clearedCount: 0, lsCleared: 0 }, null);
    };
    const P = globalThis.__panel;
    P.setSnap(sampleSnap()); P.setTab("sim"); P.render();
  });
  afterAll(() => {
    globalThis.__panel.setSimWrite(false);
    globalThis.chrome.devtools.inspectedWindow.eval = function () {};
  });

  test("with write-mode OFF the button does nothing — by design, not by accident", () => {
    const P = globalThis.__panel;
    P.setSimWrite(false); P.buildSimScaffold();
    evals.length = 0;
    clickSim("sim-cookie-reset");
    expect(evals.length).toBe(0);
  });
  // simRun() also triggers a snapshot poll after every action, so more than one eval
  // reaches the stub — assert on WHAT was sent, not on how many.
  test("with write-mode ON the cookie reset sends its code to the page", () => {
    const P = globalThis.__panel;
    P.setSimWrite(true); P.buildSimScaffold();
    // The handler reads the INPUT FIELD, not the state — mirror what the browser has
    // in it after the scaffold rendered.
    globalThis.__nodes["sim-cookie-pats"].value = P.simState().cookiePats;
    evals.length = 0;
    clickSim("sim-cookie-reset");
    const hit = evals.filter(function (c) { return c.indexOf("__cmp") !== -1; });
    expect(hit.length).toBe(1);                    // the reset carrying the default patterns
    expect(hit[0]).toContain("document");
    expect(hit[0]).toContain("_tpf");              // aGTM's own user-id cookie is covered
  });
  test("the GCM push button reaches the page too", () => {
    const P = globalThis.__panel;
    P.setSimWrite(true); P.buildSimScaffold();
    evals.length = 0;
    clickSim("sim-gcm-push");
    expect(evals.filter(function (c) { return c.indexOf("'consent'") !== -1; }).length).toBe(1);
  });
  test("a zero-match reset surfaces as a warning, not as success", () => {
    const P = globalThis.__panel;
    P.setSimWrite(true); P.buildSimScaffold();
    clickSim("sim-cookie-reset");                  // stubbed eval returns clearedCount 0
    P.updateSimLive();
    expect(globalThis.__nodes["sim-live"]._html).toContain("Kein Cookie passte");
  });
});

describe("Third-party CMP frames — discovery and reset", () => {
  function withResources(list, fn) {
    const prev = globalThis.chrome.devtools.inspectedWindow.getResources;
    globalThis.chrome.devtools.inspectedWindow.getResources = function (cb) { cb(list); };
    try { fn(); } finally { globalThis.chrome.devtools.inspectedWindow.getResources = prev; }
  }
  function origins(list, pageHost) {
    const P = globalThis.__panel;
    const snap = sampleSnap(); snap.pageHost = pageHost || "www.victors.de";
    P.setSnap(snap);
    let got = null;
    withResources(list, () => { P.simFrameOrigins(function (o) { got = o; }); });
    return got;
  }
  afterAll(() => { globalThis.__panel.setSnap(sampleSnap()); });

  test("finds the CMP origin and skips the page's own", () => {
    const o = origins([
      { url: "https://www.victors.de/index.html" },
      { url: "https://www.victors.de/layout/js/main.js" },
      { url: "https://cdn.consentmanager.net/delivery/cmp.js" },
      { url: "https://cdn.consentmanager.net/other.js" }   // same origin, once only
    ]);
    expect(o).toEqual(["https://cdn.consentmanager.net"]);
  });
  test("subdomains of the page host count as the page's own", () => {
    const o = origins([
      { url: "https://rp.victors.de/aGTM.js" },
      { url: "https://cdn.consentmanager.net/x.js" }
    ], "victors.de");
    expect(o).toEqual(["https://cdn.consentmanager.net"]);
  });
  test("non-http resources and junk are ignored", () => {
    const o = origins([
      { url: "chrome-extension://abc/panel.js" },
      { url: "data:text/html,x" },
      { url: null },
      {},
      { url: "not a url" },
      { url: "https://cdn.consentmanager.net/x.js" }
    ]);
    expect(o).toEqual(["https://cdn.consentmanager.net"]);
  });
  test("no resources API available → empty list, never throws", () => {
    const P = globalThis.__panel;
    const prev = globalThis.chrome.devtools.inspectedWindow.getResources;
    delete globalThis.chrome.devtools.inspectedWindow.getResources;
    let got = null;
    P.simFrameOrigins(function (o) { got = o; });
    expect(got).toEqual([]);
    globalThis.chrome.devtools.inspectedWindow.getResources = prev;
  });
});
