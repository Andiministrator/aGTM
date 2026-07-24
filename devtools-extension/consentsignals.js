/**
 * aGTM Inspector — Google Consent Mode signal decoders (pure logic).
 *
 * Decodes the `gcs` and `gcd` query parameters Google tags attach to every hit, so the
 * network panel can show the per-category consent state a request actually carried.
 * No DOM / chrome APIs — unit-tested in test/devtools/consentsignals.test.js.
 *
 * Sources (verified 2026-07-24): anowave.com/quicks/consent-mode-v2-signals,
 * perspection.app/library/google-consent-mode-v2-gcs-gcd-parameters-decoded.
 */
(function (root) {
  "use strict";

  // ── gcs — "Google Consent State" (classic Consent Mode) ─────────────────────
  // Format G1XY: X = ad_storage, Y = analytics_storage; 1 = granted, 0 = denied.
  // Examples: G100 = both denied, G111 = both granted, G110 = ads granted / analytics
  // denied, G101 = ads denied / analytics granted. Occasionally "G1" alone (no state yet).
  function gcsBit(ch) {
    if (ch === "1") return { state: "granted", raw: ch };
    if (ch === "0") return { state: "denied", raw: ch };
    return { state: "unknown", raw: ch };
  }
  function decodeGcs(v) {
    if (!v || typeof v !== "string") return null;
    var m = /^G1(.?)(.?)$/.exec(v);
    if (!m) return null;
    var out = { raw: v, signals: [] };
    // Only surface positions that are actually present (G1 alone → no signals).
    if (m[1]) out.signals.push({ name: "ad_storage", value: gcsBit(m[1]) });
    if (m[2]) out.signals.push({ name: "analytics_storage", value: gcsBit(m[2]) });
    return out.signals.length ? out : { raw: v, signals: [] };
  }

  // ── gcd — "Google Consent Default" (Consent Mode v2, 4 signals) ──────────────
  // Format: 1 <sep><letter> <sep><letter> <sep><letter> <sep><letter> 5, where the four
  // letter positions are ad_storage, analytics_storage, ad_user_data, ad_personalization.
  // The <sep> digit (1/3/…) is a signal-source indicator we don't decode. The letter
  // encodes default + update state (only the widely-documented ones are asserted; any
  // other letter is surfaced raw as "unknown" so we never claim a wrong state):
  //   l = not configured · p/q = denied · r = denied by default, granted after update
  //   t = granted by default · v = granted by default and confirmed granted
  var GCD_LETTER = {
    l: { state: "unset", note: "nicht konfiguriert" },
    p: { state: "denied", note: "denied (default)" },
    q: { state: "denied", note: "denied (Ablehnung)" },
    r: { state: "granted", note: "default denied → nach Update granted" },
    t: { state: "granted", note: "granted (default)" },
    v: { state: "granted", note: "granted (default + bestätigt)" }
  };
  var GCD_ORDER = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"];
  function gcdLetter(ch) {
    if (Object.prototype.hasOwnProperty.call(GCD_LETTER, ch)) {
      var e = GCD_LETTER[ch];
      return { state: e.state, note: e.note, raw: ch };
    }
    return { state: "unknown", note: "unbekannter Code", raw: ch };
  }
  function decodeGcd(v) {
    if (!v || typeof v !== "string" || v.charAt(0) !== "1") return null;
    // Collect each <digit><letter> group's letter, in order. The leading "1" and the
    // trailing "5" carry no letter, so they don't produce entries.
    var re = /(\d)([a-z])/g, m, letters = [];
    while ((m = re.exec(v)) !== null) letters.push(m[2]);
    if (!letters.length) return null;
    var signals = [];
    for (var i = 0; i < letters.length && i < GCD_ORDER.length; i++) {
      signals.push({ name: GCD_ORDER[i], value: gcdLetter(letters[i]) });
    }
    return { raw: v, signals: signals };
  }

  // Decode whichever of gcs/gcd are present in a URL's query string.
  function decodeSignals(url) {
    var out = null;
    try {
      var qs = new URL(url).searchParams;
      var gcs = qs.get("gcs"), gcd = qs.get("gcd");
      var ds = gcs ? decodeGcs(gcs) : null;
      var dd = gcd ? decodeGcd(gcd) : null;
      if (ds || dd) out = { gcs: ds, gcd: dd };
    } catch (e) { /* not a URL */ }
    return out;
  }

  var api = { decodeGcs: decodeGcs, decodeGcd: decodeGcd, decodeSignals: decodeSignals };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.aGTMInspectorSignals = api;
})(typeof window !== "undefined" ? window : this);
