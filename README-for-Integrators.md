# aGTM — Data Contract for sGTM & webGTM Integrators

> **Audience:** developers and AI agents building **web GTM** tags/variables/templates or
> **server-side GTM (sGTM)** clients/handlers around aGTM. This document describes the
> **data surface** — what aGTM writes into the global `aGTM` object, what it emits into the
> dataLayer, what it sends to the server, and how you read/set session, consent, and
> attribution data. It is a companion to:
>
> - [`README.md`](README.md) — end-user setup / CMP list / config reference
> - [`README-for-Developers.md`](README-for-Developers.md) — internal workings, call graphs, extending the library
> - [`SESSION-REDESIGN.md`](SESSION-REDESIGN.md) — architectural rationale for the v1.5 session/consent model
>
> **Version:** aGTM 1.5 · **Scope:** the public runtime contract only (no internal server API specifics).

---

## Table of Contents

1. [Mental model — who writes, who reads](#1-mental-model--who-writes-who-reads)
2. [The `aGTM` global at a glance](#2-the-agtm-global-at-a-glance)
3. [`aGTM.d` — runtime data reference](#3-agtmd--runtime-data-reference)
4. [Reading aGTM data in webGTM and sGTM](#4-reading-agtm-data-in-webgtm-and-sgtm)
5. [Session data](#5-session-data)
   - [Bot-check verdict](#5b-bot-check-verdict)
6. [Consent data — reading and setting](#6-consent-data--reading-and-setting)
7. [Sources & Attribution](#7-sources--attribution)
8. [DataLayer events the client observes](#8-datalayer-events-the-client-observes)
9. [Sending events & POST transport (webGTM → sGTM)](#9-sending-events--post-transport-webgtm--sgtm)
10. [The sGTM side — endpoints aGTM talks to](#10-the-sgtm-side--endpoints-agtm-talks-to)
11. [Cheat sheet](#11-cheat-sheet)

---

## 1. Mental model — who writes, who reads

aGTM sits between the page, the CMP, Google Tag Manager, and your server-side GTM Client.
There are **three data channels** you will integrate against:

| Channel | Direction | What flows | Who reads it |
|---|---|---|---|
| **The `aGTM` object** (`window.aGTM`) | in-browser, synchronous | session, consent, attribution, event log | **webGTM** via JavaScript Variables |
| **The dataLayer** (`window[aGTM.c.gdl]`) | in-browser, event-driven | lifecycle events (`aGTM_ready`, `aGTM_consent_update`), replayed user events, per-event `aGTMparams`/`aGTMconsent` | **webGTM** via triggers/variables |
| **HTTP POST** | browser → server | events (`_post`), consent diffs (`/aGTMconsent`) | **sGTM** endpoints/handlers |

Two producers feed session/attribution data **into** aGTM:

- **The sGTM Client** injects `aGTM.f.config({ session: {…} })` into the `/aGTM.js` response. This is
  how `sid`, `uid`, GA4 IDs, server-known `consent`, `source`, and `attribution` reach the browser
  **without any client-side fetch**. See [§5](#5-session-data) and [§7](#7-sources--attribution).
- **The CMP** (via the `cmp/cc_<name>.js` `consent_check` function) writes the live consent state
  into `aGTM.d.consent`. See [§6](#6-consent-data--reading-and-setting).

**Golden rule for reading:** everything under `aGTM.d.*` is written by the library, may be absent
on standalone setups, and must be **defensively accessed** (see [§4](#4-reading-agtm-data-in-webgtm-and-sgtm)).

---

## 2. The `aGTM` global at a glance

`window.aGTM` has a fixed set of namespaces. Integrators read from `aGTM.d` and (rarely) call
functions on `aGTM.f`. Never mutate `aGTM.d` directly — go through the documented `aGTM.f.*` entry points.

| Namespace | Purpose | You interact with it… |
|---|---|---|
| `aGTM.c` | **Config** — everything passed to `aGTM.f.config()` | write once at setup (integration code), then read-only |
| `aGTM.d` | **Runtime data** — session, consent, attribution, queues, counters | **read** from webGTM JS Variables |
| `aGTM.f` | **Functions** — the API surface (`fire`, `run_cc`, `config`, `resolveAttribution`, …) | **call** the documented entry points |
| `aGTM.l` | **Log array** — encoded log lines (decode with `aGTM_debug.js`) | debugging only |
| `aGTM.n` | Internal name fragments (anti-adblock string splitting) | do not touch |

---

## 3. `aGTM.d` — runtime data reference

These are the keys initialized by `aGTM.f.objinit()` plus those populated at runtime. **This is the
authoritative shape** an integrator can rely on.

| Key | Type | Written by | Meaning |
|---|---|---|---|
| `aGTM.d.version` | string | objinit | Library version (e.g. `"1.5"`) |
| `aGTM.d.session` | object | `config()` from `cfg.session` | Session & user data from the sGTM Client (`{}` if none). See [§5](#5-session-data). |
| `aGTM.d.session_status` | string | `config()` / `run_cc()` | Consent-sync lifecycle. See [§6 lifecycle](#session_status-lifecycle). |
| `aGTM.d.consent` | object | CMP `consent_check` / preset | Current consent state. `.gtmConsent` gates GTM injection. See [§6](#6-consent-data--reading-and-setting). |
| `aGTM.d.consent_hash` | string | `run_cc()` | Serialized consent at the **last successful** consent-store POST (diff gate). |
| `aGTM.d.last_consent_hash` | string | `run_cc()` | Serialized consent from the **previous** `run_cc()` (event/callback gate). |
| `aGTM.d.attribution` | object | `config()` via `resolveAttribution` | Keyed-by-method attribution (`{}` if none). See [§7](#7-sources--attribution). |
| `aGTM.d.bot` | object | `config()` from `cfg.bot` | Bot-check verdict from the sGTM Client (`{}` if the check is off). See [§5b](#5b-bot-check-verdict). |
| `aGTM.d.f` | array | `fire()` / `inject()` | Queue of events fired **before** consent; replayed as `hastyEvents`. |
| `aGTM.d.dl` | array | `fire()` | Internal log of **every** event that passed through `aGTM.f.fire()`. |
| `aGTM.d.init` | boolean | `inject()` | `true` once GTM has been injected into the DOM. |
| `aGTM.d.config` | boolean | `config()` | `true` once config has been applied. |
| `aGTM.d.is_iframe` | boolean | objinit | `true` if the page runs inside an iframe. |
| `aGTM.d.gtmLoaded` | array | `config()`/`gtm_load` | Container IDs already injected. |
| `aGTM.d.timer` | object | listeners/polls | Active `setInterval` handles (`consent`, `consent_poll`). |
| `aGTM.d.errors` | array | `log()` | Collected error entries (also carried in `aGTM_ready`). |

> **Do not** read `aGTM.d.f`/`aGTM.d.dl` to drive tags directly — use the [DL-Repeat engine](README-for-Developers.md#dl-repeat--late-enrichment-agtmfdlrepeat) or the `aGTM_ready`/`hastyEvents` replay. `aGTM.d.dl` contains **only** events that went through `aGTM.f.fire()` (raw `dataLayer.push` never enters it).

---

## 4. Reading aGTM data in webGTM and sGTM

### webGTM — the "JavaScript Variable" pattern

The simplest and preferred way to expose any `aGTM.d.*` value to your tags is a GTM **JavaScript
Variable** (dot-path), or a **Custom JavaScript Variable** with a defensive guard. Because
`aGTM.d.*` can be absent on a standalone or degraded setup, **always defensive-check**:

```javascript
// Custom JavaScript Variable — affiliate source (empty string if unavailable)
function() {
  return (window.aGTM && aGTM.d && aGTM.d.session && aGTM.d.session.source) || '';
}
```

```javascript
// Custom JavaScript Variable — attribution last-touch source
function() {
  var a = window.aGTM && aGTM.d && aGTM.d.attribution && aGTM.d.attribution.last_touch;
  return a ? a.sou : '';
}
```

Plain **"JavaScript Variable"** (not custom) also works for simple dot paths like
`aGTM.d.session.ga4sid` or `aGTM.d.session_status`, but returns `undefined` when any hop is missing —
prefer the defensive Custom JavaScript Variable if a tag branches on the value.

### sGTM — you are the *producer*, not the reader

On the server side you are almost always the **sGTM Client** that **writes** `cfg.session` into the
`/aGTM.js` response (session, consent, source, attribution) and that **implements the endpoints**
aGTM POSTs to. You do not read `aGTM.d` server-side — the browser object doesn't exist there. See
[§10](#10-the-sgtm-side--endpoints-agtm-talks-to) for the endpoint contracts, and [§5](#5-session-data)
for the `cfg.session` shape you emit.

---

## 5. Session data

### What it is

`aGTM.d.session` is a verbatim deep-copy of whatever the sGTM Client injected as `cfg.session`.
The library **stores every field as-is** and branches only on a few known ones. This means you can
add custom fields to `cfg.session` server-side and read them in webGTM without any library change.

### The `cfg.session` shape (produced by the sGTM Client)

```javascript
aGTM.f.config({
  session: {
    sid:     's-abc',                          // session ID
    uid:     'C.…',                            // user ID (C.* = upgraded cookie user, F.* = fingerprint)
    ga4sid:  '17163412742',                    // GA4-compatible session ID → use as GA4 `sid`
    muidga4: 'ga4.e739429c6b5210.6c68813e',    // GA4-compatible user ID → use as GA4 `cid`
    counter: 3,                                // visit counter (server-side auto-denial input; not branched client-side)
    source:  'it_webgains',                    // flat affiliate source (last-cookie-wins) — see §7
    consent: { /* see §6 preset */ },          // optional server-known consent → synchronous GTM injection
    attribution: { /* see §7 */ }              // optional keyed-by-method attribution
    // …any extra field is copied verbatim into aGTM.d.session
  }
});
```

The preset is **accepted** when `cfg.session` is an object carrying at least one of `sid`, `consent`,
`attribution`, or a **non-empty** `source`. That last rule matters: even a degraded server response
that only carries an affiliate `source` still populates `aGTM.d.session.source` for webGTM.

### Recognized session fields

| Field | Type | Description |
|---|---|---|
| `sid` | string | Session ID. Required for the preset to fully take effect; included in the consent-store POST. |
| `uid` | string | User ID. Prefix `C.*` marks an upgraded stable cookie user, `F.*` a fingerprint user (both browser-observable in the cookie). Included in the consent-store POST; the library adopts a `C.*` value returned by the server. |
| `ga4sid` | string | GA4-compatible session ID — usable **as-is** for the GA4 `sid` parameter. |
| `muidga4` | string | GA4-compatible user ID — usable **as-is** for the GA4 `cid` parameter. |
| `vct` | number | The Session API's `counter` under its aGTM name: requests **within the current session**, not visits. Consumed **server-side** (auto-denial decision); no client-side branch. |
| `ret` | boolean | `vct > 0` — not the first request of this session. Drives the server-side consent auto-denial. |
| `sst` | boolean | Always `true` — marks the session block as server-set. |
| `created` | number | Unix seconds — when the current session record was created. |
| `lastInteraction` | number | Unix seconds — last interaction recorded for this session. |
| `pvCount` | number | Pageviews counted in the current session. |
| `eventCount` | number | Events counted in the current session. |
| `sessionCount` | number | **Visit** counter across sessions — this, not `vct`, is what "returning visitor, nth visit" means. |
| `source` | string | Flat affiliate source (last-cookie-wins). See [§7](#7-sources--attribution). |
| `consent` | object | Server-known consent. If valid, seeds `aGTM.d.consent` and triggers **synchronous** GTM injection. See [§6](#preset-consent-returning-visitors). |
| `attribution` | object | Keyed-by-method attribution object. Re-activates the library's HYBRID merge. See [§7](#7-sources--attribution). |
| *(any)* | * | Stored verbatim in `aGTM.d.session`. |

### Reading session data in webGTM

```javascript
aGTM.d.session.sid        // session ID
aGTM.d.session.uid        // user ID
aGTM.d.session.ga4sid       // → GA4 `sid`
aGTM.d.session.muidga4      // → GA4 `cid`
aGTM.d.session.source       // affiliate source
aGTM.d.session.sessionCount // visit count (NOT vct — see the table above)
aGTM.d.session_status       // lifecycle (see §6)
```

Wrap each in the [defensive JS Variable pattern](#webgtm--the-javascript-variable-pattern).

---

## 5b. Bot-check verdict

`aGTM.d.bot` carries the verdict of the sGTM Client's optional bot check (an
`api4filter`-style service). It is a deep-copy of `cfg.bot` and is `{}` when the
check is disabled or did not answer.

**You only ever see a verdict as a non-blocked visitor.** A definitive bot is
answered with HTTP 403 and never receives the library at all, so `aGTM.d.bot`
exists exclusively in the "clean or borderline" case. Its purpose is *marking*,
not blocking: a borderline visitor (e.g. a request from an ASN with a bot-pool
reputation) is served normally, and you decide in webGTM what to do with that —
typically a `traffic_type` dimension towards GA4.

| Field | Type | Meaning |
|---|---|---|
| `isBot` | boolean | The definitive verdict. Under the Client's default `block` mode this is effectively always `false` in the browser (see above); under `mark` nothing is blocked, so `true` can and does appear. |
| `score` | number | 0–100 integer. Higher = more suspicious. Never blocks on its own. **The field can be absent** — a value the filter sent outside 0–100 is a contract violation and is dropped rather than clamped, so `score` missing is not the same as `score: 0`. |
| `band` | string | `"clean"`, `"suspicious"` or `"bot"` from the filter; `"bot"` holds exactly when `isBot === true`. Two values the Client itself can produce: **`"unknown"`** — the filter did not answer usably, i.e. an outage, *not* a clean visitor (see `reason`); and **`"other"`** — the filter sent something outside the vocabulary the Client knows, which means the service contract has moved. Branch on all of them, not just `"bot"`. |
| `primarySignal` | string | Category of the highest-scoring signal, e.g. `"asn_spam"`, `"known_bot"`. Absent when nothing triggered, `"other"` when the service sent an unknown category. |
| `signals` | array | One entry per evaluated signal: `{type, category, score, confirmed?}`. Empty array when nothing triggered; capped at 10 entries. |
| `mode` | string | `"block"` or `"mark"` — what the Client does with a positive verdict. Under `"mark"` it reports but never blocks, so `isBot: true` legitimately appears in the browser. |
| `reason` | string | Only alongside `band: "unknown"`: `"no_answer"`, `"bad_answer"` or `"no_client_ip"`. The three call for different responses — a filter outage is not an IP-header problem. |

`category` is a stable, language-neutral key — branch on it rather than on any
display text.

```javascript
// webGTM JS Variable — "traffic type" dimension
function() {
  var b = (window.aGTM && aGTM.d && aGTM.d.bot) || {};
  // Handle the non-verdict cases FIRST. Without these lines a filter outage —
  // or a vocabulary change at the service — answers 'regular' for 100% of
  // traffic and looks exactly like a healthy day.
  if (b.band === 'unknown') return 'unknown';   // outage; b.reason says which kind
  if (b.band === 'other') return 'other';       // service sent an unknown value
  if (b.band === 'bot') return 'bot';
  if (b.primarySignal === 'asn_spam') return 'spam';
  return 'regular';
}
```

> **Measuring it:** `aGTM.d.bot` is written while `/aGTM.js` executes, i.e. before
> any consent decision, so the value exists for every visitor. Whether your
> analytics sees all of them depends on what carries it out: a consent-gated GTM
> tag only fires after the CMP is answered, which most non-human traffic never
> does. A consent-free sender (a cookieless analytics call in the page, or a
> container configured `noConsent`) closes that gap.

> **Not forwarded on purpose:** each signal's `detail` block (ASN number, ASN
> org, unique-IP and request counts) stays server-side. Those are tenant-wide
> aggregates about *other* visitors' traffic and have no business being readable
> by every script on the page. If you need them, read them in sGTM, not here.

---

## 6. Consent data — reading and setting

### The consent object (`aGTM.d.consent`)

Written by the CMP-specific `consent_check` (from `cmp/cc_<name>.js`) and/or a preset. Canonical shape:

| Field | Type | Meaning |
|---|---|---|
| `hasResponse` | boolean | `true` once the CMP (or preset) has produced a decision. |
| `services` | string | Granted services, comma-wrapped & sorted, e.g. `,ga4,gads,`. |
| `purposes` | string | Granted purposes, comma-wrapped, e.g. `,analytics,`. |
| `vendors` | string | Granted vendors, comma-wrapped. |
| `consent_id` | string | CMP-issued consent ID (CCM19/Cookiebot/Sourcepoint/…). A new value = a real re-consent event. |
| `serviceIDs` | string | CMP-specific service IDs (e.g. CCM19). |
| `feedback` | string | Human-readable note from the CMP path. |
| `gtmConsent` | boolean | **Derived.** `true` ⇒ aGTM injects GTM. Computed from `gtmServices`/`gtmPurposes`/`gtmVendors` config vs. the granted values. |
| `blocked` | boolean | **Optional, server-set.** Fallback for `gtmConsent` when service checks fail (used by server-side auto-denial). |

> `gtmConsent` is the single boolean that governs whether GTM loads. `services`/`purposes`/`vendors`
> are the raw grant strings — use `aGTM.f.chelp(requirement, granted)` semantics (comma-membership)
> if a tag needs to check a specific service itself.

### Reading consent in webGTM

Two ways, pick per need:

1. **From the object** (any time after `run_cc`):

   ```javascript
   function() {
     var c = window.aGTM && aGTM.d && aGTM.d.consent;
     return c ? !!c.gtmConsent : false;   // GTM-load decision
   }
   ```

2. **From the dataLayer** — every aGTM lifecycle event carries a snapshot under `aGTMconsent`
   (see [§8](#8-datalayer-events-the-client-observes)). Trigger on `aGTM_ready` /
   `aGTM_consent_update` and read `{{DLV - aGTMconsent.services}}` etc. This is the recommended way to
   **react to consent changes** because it is event-driven.

### `session_status` lifecycle

`aGTM.d.session_status` tells you *where in the consent-sync lifecycle* the visitor is. Branch on it
to distinguish a fresh visitor from a returning one with cached consent.

| Value | Meaning |
|---|---|
| `""` | No `cfg.session` supplied (initial / standalone). |
| `"preset"` | `cfg.session` accepted but no usable consent block — the CMP path runs normally. |
| `"preset_with_consent"` | `cfg.session.consent` was valid and seeded; **synchronous** `call_cc()` fired → GTM injected on this tick. |
| `"synced"` | A CMP decision differed from the preset, was POSTed to `consent_store_url`, server returned 2xx. |
| `"confirmed"` | The CMP decision **matched** the preset — no POST needed. |

### Preset consent (returning visitors)

When the sGTM Client injects a **valid** `cfg.session.consent`
(`hasResponse === true` AND `typeof services === 'string'`), the library:

1. deep-copies it into `aGTM.d.consent`,
2. seeds `aGTM.d.consent_hash` via `aGTM.f.consent_serialize()`,
3. sets `session_status = 'preset_with_consent'`,
4. calls `aGTM.f.call_cc()` **synchronously at the end of `config()`** → GTM injects immediately,
   **without** waiting for the live CMP.

> ⚠️ **Integration prerequisite (Consent Mode v2).** Because GTM injects under the *cached* consent
> before the live CMP responds, a later correction arrives via the `aGTM_consent_update` event. **All
> tags must be gated through Google Consent Mode v2 / consent signals** so a later update actually
> changes tag behavior (drop the hit, redact PII, ping-mode). Tags with a hard-coded "fire if service
> X granted" trigger will mis-fire during the preset window. To opt out, don't ship preset consent.
> Full rationale: [`README-for-Developers.md` §Integration prerequisite](README-for-Developers.md#integration-prerequisite--consent-mode-v2--consent-signals).

### Setting / updating consent

There are four ways consent gets **set** in aGTM. Pick by where the signal originates:

#### a) The CMP does it (normal path)

The `cmp/cc_<name>.js` file's `consent_check(action)` reads the live CMP state and writes
`aGTM.d.consent`. You don't call anything — aGTM polls (`consent_listener`, every 500 ms by default)
or listens (`useListener: true`) and runs `run_cc('init')` → injects GTM once `gtmConsent` is true.

#### b) Tell aGTM a consent-relevant event happened (`consent_events`)

If your CMP pushes a specific dataLayer/`fire()` event when the user decides, configure:

```javascript
aGTM.f.config({
  consent_events: 'cmpEvent[userChoiceType:useraction],cmpUpdate'
});
```

Any matching event passing through `aGTM.f.fire()` triggers `run_cc('update')` — aGTM re-reads the
CMP state and, if it changed, updates `aGTM.d.consent`, emits `aGTM_consent_update`, and (if
configured) POSTs the diff. Bracket syntax lets you require an attribute value:
`cmpEvent[userChoiceType:useraction]` fires only when `event=='cmpEvent'` **and**
`userChoiceType=='useraction'`.

#### c) Force a re-read manually

From your own CMP callback (any time):

```javascript
aGTM.f.run_cc('update');   // re-read CMP → update aGTM.d.consent → emit/diff if changed
// or, for the initial decision:
aGTM.f.call_cc();          // run_cc('init') → inject GTM if granted
```

Most CMPs emit updates via **direct `dataLayer.push()`** (bypassing `fire()`), so aGTM also runs an
**adaptive poll** (`start_consent_poll`, default every `consent_poll_ms = 2000` ms) that calls
`run_cc('update')` for you — but **only when `consent_store_url` is set** (otherwise there's nothing to
push). Set `consent_poll_ms = 0` to disable and drive updates manually via (c).

#### d) Bypass the consent gate for a single event (`_noConsent`)

For functional/legal events that must fire regardless of consent, set `_noConsent: true` on the event
(see [§9](#9-sending-events--post-transport-webgtm--sgtm)). This does **not** change `aGTM.d.consent`;
it only lets that one event through the gate.

### What happens when consent changes (the diff/store flow)

At the end of **every** successful `run_cc()` (both `init` and `update`):

1. `new_hash = aGTM.f.consent_serialize(aGTM.d.consent)` — stable, sorted serialization that
   **excludes** `gtmConsent`, `blocked`, and empty/null values.
2. If `consent_store_url` is set **and** `new_hash !== aGTM.d.consent_hash` → POST
   `{ uid, sid, consent: <without gtmConsent/blocked/empty> }` to `consent_store_url`. On 2xx:
   `consent_hash = new_hash`, `session_status = 'synced'`. On non-2xx: hash unchanged → retried on the
   next tick.
3. If the hash matches: `session_status = 'confirmed'` (no POST).

The `aGTM_consent_update` dataLayer event + `consent_callback` are gated on `last_consent_hash`, so a
stable poll tick emits nothing — you only see real state changes.

```javascript
// React to consent changes in the browser:
aGTM.f.consent_callback = function(action) {   // action: 'init' | 'update'
  // aGTM.d.consent is current here
};
```

---

## 7. Sources & Attribution

Two related but distinct pieces of data, both produced server-side by the sGTM Client and injected
via `cfg.session`:

### a) Flat affiliate source — `aGTM.d.session.source`

A single last-cookie-wins string (e.g. `"it_webgains"`), captured by the Sources API and passed
through verbatim. Read it with a plain JS Variable — no attribution machinery involved:

```javascript
function() { return (window.aGTM && aGTM.d && aGTM.d.session && aGTM.d.session.source) || ''; }
```

### b) Structured attribution — `aGTM.d.attribution[method]`

When the sGTM Client requests attribution, `cfg.session.attribution` arrives keyed by method, e.g.
`{ last_touch: { sou:'google', … } }`. At the end of `config()`, the library resolves **each** present
method through `aGTM.f.resolveAttribution(method)` (a **HYBRID merge**) and stores the result on
`aGTM.d.attribution[method]`.

**Available methods** (whichever the Client requested): `last_touch`, `first_touch`, `last_click`,
`first_click`, `last_non_direct_click`.

**Resolved fields per method** (this is exactly what `resolveAttribution` returns):

| Field | Source priority | Notes |
|---|---|---|
| `sou` | URL `utm_source` → API → `""` | source |
| `cam` | URL `utm_campaign` → API → `""` | campaign |
| `med` | URL `utm_medium` → API → `""` | medium |
| `camid` | URL `utm_id` → API → `""` | campaign ID (string) |
| `cli` | first click-ID param value → API → `""` | scans `gclid, fbclid, msclkid, ttclid, gbraid, wbraid` (first match wins) |
| `clp` | name of the matched click-ID param → API → `""` | e.g. `gclid` |
| `cls` | derived from `clp` → API → `""` | `gclid/gbraid/wbraid`→`Google Ads`, `fbclid`→`Meta`, `msclkid`→`Microsoft Ads`, `ttclid`→`TikTok Ads` |
| `sre` | `document.referrer` → API → `""` | session-source referrer |
| `afs` | **API only** | Affiliate Source (last-cookie-wins, user-scoped, server-persisted) |
| `lcs` | **API only** | last click source across sessions |
| `fss` | **API only** | first session source ever for this user |

**Why HYBRID:** the server-side attribution data can be slightly stale (backend propagation lag). The
**current page's URL is always freshest**, so URL wins for browser-derivable fields; the API fills
cross-session memory the URL can't provide (`afs`/`lcs`/`fss`). **Caveat:** `afs`/`lcs`/`fss` have no
URL fallback and can lag on the very first request of a new session's source.

**Reading attribution in webGTM:**

```javascript
function() {
  var a = window.aGTM && aGTM.d && aGTM.d.attribution && aGTM.d.attribution.last_touch;
  return a ? a.sou : '';
}
```

`aGTM.d.attribution` is `{}` when no preset is supplied — **always defensive-check**.

**Standalone (no sGTM Client):** call `aGTM.f.resolveAttribution('any-name')` directly to build a
URL-only attribution view from the current page (source/medium/campaign/click-IDs), even without any
API data. `aGTM.f.parseUrlParams(qs)` is the exposed ES5 query-string helper it uses.

> **SPA note:** attribution reflects the **session source** captured at the `/aGTM.js` request. SPA
> virtual pageviews mid-session are not re-captured in v1.5.

---

## 8. DataLayer events the client observes

aGTM pushes these into `window[aGTM.c.gdl]` (default `dataLayer`). webGTM triggers/variables key off them.

### `aGTM_ready` — GTM was injected

Fired once per container as GTM loads. Carries the queued pre-consent events for replay and a small
library-state object:

```javascript
{
  event: 'aGTM_ready',
  aGTMts: 1714900000000,
  aGTMconsent: { hasResponse:true, services:',ga4,', gtmConsent:true, … },  // consent snapshot
  aGTM: {
    version: '1.5',
    is_iframe: false,
    hastyEvents: [ /* events fired before consent, to be replayed */ ],
    errors: [ /* collected errors */ ]
  }
}
```

`hastyEvents` is the queue (`aGTM.d.f`). A GTM **Custom Template** (see [`gtm/`](gtm/)) reads this array
and re-fires each queued event through the dataLayer so tags that missed the pre-consent window still
receive them.

> **`noConsent` containers** receive `aGTM_ready` **before** any consent decision — `aGTMconsent.hasResponse`
> may be `false`. Don't use them for anything requiring consent.

### `aGTM_consent_update` — consent changed after load

Emitted from `run_cc('update')` **only when the consent hash changed** (so the adaptive poll doesn't
flood the dataLayer):

```javascript
{
  event: 'aGTM_consent_update',
  aGTMts: 1714900005000,
  aGTMconsent: { hasResponse:true, services:',ga4,gads,', gtmConsent:true, … }
}
```

Use this as the **trigger for consent-aware re-evaluation** — e.g. update Consent Mode signals, unblock
previously-denied tags.

### Per-event enrichment on user events

Events dispatched through `aGTM.f.fire()` (non-`aGTM*`) get a deep copy of the final event object
attached as **`aGTMparams`** before the dataLayer push, so GTM variables can read individual fields
from `{{DLV - aGTMparams.<field>}}` without dataLayer-scoping surprises.

---

## 9. Sending events & POST transport (webGTM → sGTM)

`aGTM.f.fire(obj)` is the **single entry point** for all page/user events. It handles consent gating,
queuing, dataLayer push, and optional direct HTTP POST to your sGTM endpoint. Never call
`sendnaus()` directly.

```javascript
aGTM.f.fire({ event: 'purchase', revenue: 99.90 });
```

### Event properties you can set

| Property | Type | Effect |
|---|---|---|
| `event` | string | Event name. If it starts with `aGTM`, the consent gate is bypassed (internal lifecycle event). |
| `_noConsent` | boolean | `true` bypasses the consent gate — pushed to dataLayer and POSTed immediately, no consent wait. The flag stays visible in the dataLayer event. |
| `_post` | boolean \| object | `true` = POST with global `transport_*` defaults. Object `{ url, enc, salt, consent }` overrides per event. POST respects the consent gate unless `_noConsent` is also set. |
| `_noDLPush` | boolean | `true` skips the GTM dataLayer push (no `sendnaus`/`iFrameFire`). Event is still logged in `aGTM.d.dl`/`aGTM.l`, POST still fires, `sendnaus_callback` still runs. |
| `_post_sent` | boolean | If already `true`, the POST step is skipped (dedup guard; set by aGTM after sending). |

**Do not set** `aGTMts` or `eventModel` yourself — their presence makes `fire()` skip the event
(loop/ping guards).

**Sending events out of an iFrame?** The "aGTM iFrame Support" tag in the top frame strips
the control flags out of the message before it reaches `fire()`: `_post`, `_post_sent` and
`_noDLPush` always, `_noConsent` unless the operator switched on "Allow `_noConsent` from
iFrames" (off by default). Event names starting with `aGTM`, `gtm.`, `aDOMready`/`vDOMready`
or `aPAGEready`/`vPAGEready` are rejected outright. Plain event payload is unaffected.

### POST transport contract

Global defaults:

```javascript
aGTM.f.config({
  transport_url:  'https://sgtm.example.com/collect',
  transport_enc:  true,   // Base64 + Caesar-shift obfuscation (NOT real crypto)
  transport_salt: 42
});
```

POST body shape your sGTM endpoint must decode:

```jsonc
// plain (enc:false)
{ "e": { "event": "purchase", "revenue": 99.9, "…": "…" } }
// obfuscated (enc:true) — same Base64+Caesar as the aEvents tag
{ "q": "<obfuscated string>" }
```

`_post_sent: true` is set on the event after sending; the webGTM Community Tag checks this flag and
**skips its own `sendPixel`** to avoid double-sending during replay.

### Google-independent tracking

Combine the three flags to send an event **only to your server**, never to the Google dataLayer:

```javascript
aGTM.f.fire({
  event: 'purchase', revenue: 99.90,
  _noConsent: true,   // don't wait for consent
  _noDLPush:  true,   // skip GTM dataLayer
  _post: { url: 'https://your-server.example.com/ae' }
});
```

---

## 10. The sGTM side — endpoints aGTM talks to

If you build the server-side counterpart, these are the two browser→server contracts. Only the
**browser-observable** surface is documented here — how you persist, store, or resolve the data behind
the endpoint is your implementation's concern.

### Producing `cfg.session` on `/aGTM.js`

Your `/aGTM.js` handler serves the library **and** injects an `aGTM.f.config({ session: {…} })` call
(or merges into the integrator's config) carrying `sid`, `uid`, GA4 IDs, optional `consent`, `source`,
and `attribution`. Shape: [§5](#5-session-data). When you serve the library, also auto-fill
`consent_store_url` browser-side from `document.currentScript.src + '/aGTMconsent'` so reverse-proxy
prefixes work transparently.

### The consent-store endpoint (`/aGTMconsent`)

aGTM POSTs a consent diff whenever the CMP state changes:

```jsonc
POST <consent_store_url>
{
  "uid": "<user id>",                 // from aGTM.d.session.uid, if present
  "sid": "<session id>",              // from aGTM.d.session.sid, if present
  "consent": {                        // blacklist: no gtmConsent/blocked/empty
    "hasResponse": true,
    "services": ",ga4,gads,",
    "purposes": ",analytics,",
    "vendors":  "",
    "feedback": "…"
  }
}
```

Handler responsibilities (the parts the **library** observes or depends on):

- Persist the consent however your session store works (the payload uses **full-replace** semantics —
  same blacklist as the diff hash, so the record can be replaced wholesale).
- Respond `{ ok: true }` (or `204`). If your backend re-issues the user ID, you may return
  `{ ok:true, uid:"…" }`; the library adopts a returned `uid` into `aGTM.d.session.uid` **only when it
  starts with literal `C.`** (an upgrade marker — the library never downgrades an already-upgraded ID
  to an echoed fallback).
- **Encrypted bodies** (`{"q":"…"}`, i.e. `consent_store_enc:true`) require a symmetric server-side
  decoder. It is not part of v1.5 — the reference handler responds `501`. Keep `consent_store_enc` off
  until full-stack encryption support ships.

---

## 11. Cheat sheet

**Read in webGTM (all defensive):**

```javascript
aGTM.d.session.sid / .uid / .ga4sid / .muidga4 / .source   // session & IDs
aGTM.d.session.sessionCount / .pvCount / .eventCount        // Session API counters (vct = requests, NOT visits)
aGTM.d.session_status                                       // "", preset, preset_with_consent, synced, confirmed
aGTM.d.consent.gtmConsent                                   // GTM-load decision (boolean)
aGTM.d.consent.services / .purposes / .vendors              // grant strings (comma-wrapped)
aGTM.d.attribution.<method>.sou / .cam / .med / …           // structured attribution
aGTM.d.bot.band / .score / .primarySignal                   // bot-check verdict (marking, never blocking)
```

**React in webGTM (dataLayer triggers):**

```
aGTM_ready            → GTM injected; replay hastyEvents; read aGTM.version / aGTMconsent
aGTM_consent_update   → consent changed; re-evaluate Consent Mode signals
{{DLV - aGTMconsent.*}} / {{DLV - aGTMparams.*}}   → per-event snapshots
```

**Set/update consent:**

```javascript
aGTM.f.config({ consent_events: 'cmpUpdate' });   // auto-trigger on a fire() event
aGTM.f.run_cc('update');                          // manual re-read
aGTM.f.call_cc();                                 // initial decision → inject
aGTM.f.fire({ event:'x', _noConsent:true });      // bypass gate for one event
```

**Send to your server:**

```javascript
aGTM.f.fire({ event:'purchase', revenue:99.9, _post:true });                 // POST + dataLayer
aGTM.f.fire({ event:'purchase', _noConsent:true, _noDLPush:true, _post:{…}}); // server-only
```

**Always guard `aGTM.d.*` reads** — it can be `{}`/absent on standalone or degraded setups.

---

**License:** Apache 2.0 · **Repository:** <https://github.com/Andiministrator/aGTM> · **Author:** Andi Petzoldt
</content>
</invoke>
