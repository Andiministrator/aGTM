// Wiring test for devtools-extension/reader.js — the page-context snapshot.
//
// Why this exists: botsummary.test.js tests the classifier and panel-smoke sets
// snap.bot by hand, so both stay green even if reader.js never reads aGTM.d.bot
// at all. A mutation proved it: deleting the `bot:` line from reader.js left the
// whole suite passing while the Bot card would have shown "kein Urteil" forever.
// Testing a pure helper is not the same as proving it is fed.
//
// reader.js is ONE self-invoking expression that returns a JSON-serialisable
// snapshot, so it can be evaluated here against a fake window.
import { test, expect, describe, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const READER = readFileSync(
  join(import.meta.dir, "..", "..", "devtools-extension", "reader.js"), "utf8"
);

/** Evaluate reader.js against the given window.aGTM and return its snapshot. */
function snapshot(aGTM) {
  globalThis.window.aGTM = aGTM;
  globalThis.aGTM = aGTM;
  return (0, eval)(READER);
}

function liveAGTM(extra) {
  const d = {
    version: "1.5", init: true, session: { sid: "s1", uid: "C.1" },
    consent: { hasResponse: true, gtmConsent: true }, dl: [], f: [], gtmLoaded: []
  };
  for (const k in (extra || {})) d[k] = extra[k];
  return { d: d, c: { gtm: {}, cmp: "" }, f: {}, l: [] };
}

describe("reader.js snapshot wiring", () => {
  beforeEach(() => {
    globalThis.window.dataLayer = [];
  });

  test("forwards aGTM.d.bot into the snapshot", () => {
    const snap = snapshot(liveAGTM({
      bot: { isBot: false, score: 40, band: "clean", primarySignal: "asn_spam",
             signals: [{ type: "asn_reputation", category: "asn_spam", score: 40, confirmed: true }] }
    }));
    expect(snap.loaded).toBe(true);
    expect(snap.bot).toBeDefined();
    expect(snap.bot.score).toBe(40);
    expect(snap.bot.primarySignal).toBe("asn_spam");
    expect(snap.bot.signals[0].category).toBe("asn_spam");
  });

  test("bot is {} — never undefined — when the Client sent no verdict", () => {
    const snap = snapshot(liveAGTM());
    expect(snap.bot).toEqual({});
  });

  test("forwards the Session API counters through session.raw", () => {
    const snap = snapshot(liveAGTM({
      session: { sid: "s1", uid: "C.1", vct: 49, created: 1785230523,
                 lastInteraction: 1785230524, pvCount: 0, eventCount: 1, sessionCount: 61 }
    }));
    expect(snap.session.raw.sessionCount).toBe(61);
    expect(snap.session.raw.pvCount).toBe(0);
    expect(snap.session.raw.eventCount).toBe(1);
    expect(snap.session.raw.created).toBe(1785230523);
    expect(snap.session.raw.lastInteraction).toBe(1785230524);
    expect(snap.session.raw.vct).toBe(49);
  });

  test("a non-serialisable bot object degrades instead of failing the snapshot", () => {
    const cyclic = { isBot: false, band: "clean" };
    cyclic.self = cyclic;
    const snap = snapshot(liveAGTM({ bot: cyclic }));
    // The whole snapshot must survive — that is what safeObj() is for
    expect(snap.loaded).toBe(true);
  });
});
