// Unit tests for botSummary() — the bot-check verdict classifier used by the
// Session tab (devtools-extension/diagnose.js). Pure logic, no DOM/chrome APIs.
//
// Context: the verdict only ever reaches a NON-blocked visitor (a definitive bot
// gets HTTP 403 and no library), so the interesting states are "clean" and
// "scored but passed" — and "bot", which is a contradiction worth naming.

import { test, expect, describe } from "bun:test";
import { botSummary, botCheckStatus, healthChecks, overallLevel, buildReportMarkdown, buildReportJSON } from "../../devtools-extension/diagnose.js";

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

  test("band 'unknown' is an outage, not a clean visitor", () => {
    // The Client sets this when the filter answered unusably or not at all.
    // Falling through to "unauffällig / kein Signal" would render an outage
    // green — in the panel and in the exported customer report.
    const r = botSummary({ isBot: false, band: "unknown" });
    expect(r.state).toBe("unknown");
    expect(r.level).toBe("warn");
    expect(r.label).not.toContain("unauffällig");
    expect(r.note).toContain("regular");
  });

  test("isBot:true under 'mark' is the configured state, not a contradiction", () => {
    const marked = botSummary({ isBot: true, band: "bot", mode: "mark" });
    expect(marked.state).toBe("bot");
    expect(marked.mode).toBe("mark");
    expect(marked.label).toContain("nicht geblockt");
    expect(marked.note).not.toContain("Widerspruch");
    // Without a mode (older Client build) the contradiction reading is right,
    // but it must name the mark alternative rather than assert malfunction.
    const bare = botSummary({ isBot: true, band: "bot" });
    expect(bare.note).toContain("Widerspruch");
    expect(bare.note).toContain("mark");
  });

  test("the mode is carried through every state", () => {
    expect(botSummary({ isBot: false, band: "clean", mode: "block" }).mode).toBe("block");
    expect(botSummary({ isBot: false, band: "unknown", mode: "mark" }).mode).toBe("mark");
    expect(botSummary({ isBot: false, score: 40, mode: "mark" }).mode).toBe("mark");
    // Only the two known values — a page-supplied string is not echoed
    expect(botSummary({ isBot: false, mode: "<script>" }).mode).toBe("");
  });
});

describe("botCheckStatus — health check", () => {
  test("absent when the Client sent no verdict, so unaffected pages read as before", () => {
    expect(botCheckStatus({})).toBeNull();
    expect(botCheckStatus({ bot: {} })).toBeNull();
  });

  test("'mark' is visible but does not colour the whole report", () => {
    // `na` rather than `warn`: mark is a CHOSEN configuration that runs for
    // weeks by design. Weeks of WARN on every exported report wears the overall
    // status out, and the next reader skims past a real pre-consent leak.
    const c = botCheckStatus({ bot: { isBot: false, band: "clean", mode: "mark" } });
    expect(c.status).toBe("na");
    expect(c.detail).toContain("blockt NICHTS");
  });

  test("an outage is a warning", () => {
    expect(botCheckStatus({ bot: { isBot: false, band: "unknown", mode: "block" } }).status).toBe("warn");
  });

  test("a clean or scored verdict under 'block' passes", () => {
    expect(botCheckStatus({ bot: { isBot: false, band: "clean", mode: "block" } }).status).toBe("pass");
    const scored = botCheckStatus({ bot: { isBot: false, score: 40, primarySignal: "asn_spam", mode: "block" } });
    expect(scored.status).toBe("pass");
    expect(scored.detail).toContain("asn_spam");
  });

  test("the check appears in healthChecks only when there is a verdict", () => {
    // Otherwise-healthy page, so the overall level moves only because of the bot check.
    const healthy = {
      hasConsentCheck: true, init: true, gtmScripts: [{ id: "x" }],
      consent: { hasResponse: true, gtmConsent: true }
    };
    expect(overallLevel(healthChecks(healthy, [], [], true)).level).toBe("pass");
    expect(healthChecks(healthy, [], [], true).map((c) => c.key)).not.toContain("bot");

    const withBlock = healthChecks({ ...healthy, bot: { isBot: false, band: "clean", mode: "block" } }, [], [], true);
    expect(withBlock.map((c) => c.key)).toContain("bot");
    expect(overallLevel(withBlock).level).toBe("pass");

    // `mark` stays visible in the list but does not drag the overall level
    const withMark = healthChecks({ ...healthy, bot: { isBot: false, band: "clean", mode: "mark" } }, [], [], true);
    expect(withMark.filter((c) => c.key === "bot")[0].status).toBe("na");
    expect(overallLevel(withMark).level).toBe("pass");
    // an outage under mark DOES drag it down
    const withOutage = healthChecks({ ...healthy, bot: { isBot: false, band: "unknown", mode: "mark" } }, [], [], true);
    expect(overallLevel(withOutage).level).toBe("warn");
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

  test("the section leads with whose machine it describes", () => {
    // The report is headed "Seite: <host>". Without this line an asn_spam entry
    // reads as a finding about the customer's traffic, when it is in fact about
    // the consultant's VPN.
    const md = buildReportMarkdown(ctx({ isBot: false, score: 40, band: "clean", primarySignal: "asn_spam", mode: "block" }));
    expect(md).toContain("den Rechner, der diesen Report erzeugt hat");
    expect(md).toContain("- **Modus:**");
    // A JSON consumer gets no prose around it, so the field carries it
    const j = JSON.parse(buildReportJSON(ctx({ isBot: false, band: "clean" })));
    expect(j.bot.provenance).toContain("machine that generated this report");
  });

  test("mark never hides the more severe finding", () => {
    // Checking the mode first made the outage and the bot verdict unreachable
    // for every mark user — i.e. for the only setup that has the mode on.
    const outage = botCheckStatus({ bot: { isBot: false, band: "unknown", mode: "mark" } });
    expect(outage.status).toBe("warn");
    expect(outage.detail).toContain("Kein verwertbares Urteil");
    const asBot = botCheckStatus({ bot: { isBot: true, band: "bot", mode: "mark" } });
    expect(asBot.status).toBe("warn");
    expect(asBot.detail).toContain("Als Bot eingestuft");
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
