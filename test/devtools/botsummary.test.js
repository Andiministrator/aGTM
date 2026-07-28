// Unit tests for botSummary() — the bot-check verdict classifier used by the
// Session tab (devtools-extension/diagnose.js). Pure logic, no DOM/chrome APIs.
//
// Context: the verdict only ever reaches a NON-blocked visitor (a definitive bot
// gets HTTP 403 and no library), so the interesting states are "clean" and
// "scored but passed" — and "bot", which is a contradiction worth naming.

import { test, expect, describe } from "bun:test";
import { botSummary, buildReportMarkdown, buildReportJSON } from "../../devtools-extension/diagnose.js";

describe("botSummary", () => {
  test("absent when the check is off / the Client is older than v1.5", () => {
    for (const input of [{}, undefined, null, "nope", { score: 40 }]) {
      const r = botSummary(input);
      expect(r.state).toBe("absent");
      expect(r.level).toBe("info");
      expect(r.signals).toEqual([]);
    }
  });

  test("clean when isBot=false and nothing triggered", () => {
    const r = botSummary({ isBot: false, score: 0, band: "clean", signals: [], primarySignal: null });
    expect(r.state).toBe("clean");
    expect(r.level).toBe("ok");
    expect(r.score).toBe(0);
    expect(r.band).toBe("clean");
    expect(r.primary).toBe("");
  });

  test("scored when a signal fired but the visitor was passed through", () => {
    const r = botSummary({
      isBot: false, score: 40, band: "clean", primarySignal: "asn_spam",
      signals: [{ type: "asn_reputation", category: "asn_spam", score: 40, confirmed: true }]
    });
    expect(r.state).toBe("scored");
    expect(r.level).toBe("info");
    expect(r.primary).toBe("asn_spam");
    expect(r.signals.length).toBe(1);
    // Never presented as a blocking verdict — that is the whole point of the band
    expect(r.note).toContain("blocken nie selbst");
  });

  test("a score alone is enough to count as scored", () => {
    expect(botSummary({ isBot: false, score: 5 }).state).toBe("scored");
  });

  test("a signal without score/primarySignal still counts as scored", () => {
    expect(botSummary({ isBot: false, signals: [{ category: "asn_spam" }] }).state).toBe("scored");
  });

  test("isBot=true is flagged as a contradiction, not as a neutral value", () => {
    const r = botSummary({ isBot: true, score: 100, band: "bot", primarySignal: "known_bot", signals: [] });
    expect(r.state).toBe("bot");
    expect(r.level).toBe("warn");
    expect(r.note).toContain("403");
  });

  test("tolerates wrong types without throwing", () => {
    const r = botSummary({ isBot: false, score: "40", band: 7, primarySignal: [], signals: "nope" });
    expect(r.state).toBe("clean");
    expect(r.score).toBeNull();
    expect(r.band).toBe("");
    expect(r.primary).toBe("");
    expect(r.signals).toEqual([]);
  });

  test("isBot must be strictly boolean — a truthy string is not a verdict", () => {
    expect(botSummary({ isBot: "true" }).state).toBe("absent");
    expect(botSummary({ isBot: 1 }).state).toBe("absent");
  });
});

describe("bot verdict in the compliance report", () => {
  const ctx = (bot) => ({
    snap: { pageHost: "example.com", version: "1.5", consent: {}, bot },
    checks: [], leaks: [], traps: [], timeline: { ok: false, rows: [] },
    level: "pass", generatedAt: "2026-07-28"
  });

  test("a scored verdict lands in the Markdown report", () => {
    const md = buildReportMarkdown(ctx({
      isBot: false, score: 40, band: "clean", primarySignal: "asn_spam",
      signals: [{ type: "asn_reputation", category: "asn_spam", score: 40, confirmed: true }]
    }));
    expect(md).toContain("## Bot-Check");
    expect(md).toContain("asn_spam");
    expect(md).toContain("auffällig, aber durchgelassen");
  });

  test("the section is omitted when there is no verdict", () => {
    // A report from a page without the bot check must read exactly as before
    expect(buildReportMarkdown(ctx({}))).not.toContain("## Bot-Check");
    expect(buildReportMarkdown(ctx(undefined))).not.toContain("## Bot-Check");
  });

  test("the JSON report always carries a bot object", () => {
    const j = JSON.parse(buildReportJSON(ctx({ isBot: false, score: 0, band: "clean" })));
    expect(j.bot.state).toBe("clean");
    expect(JSON.parse(buildReportJSON(ctx({}))).bot.state).toBe("absent");
  });
});
