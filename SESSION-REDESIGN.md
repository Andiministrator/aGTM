# Session Feature Redesign (v1.5)

> **Status:** Implemented in v1.5 (release pending — no v1.5 git tag yet). This document is the architectural reference for the v1.5 session/consent design.
> **Owner:** Andi Petzoldt
> **Created:** 2026-04-29

This document specifies the architectural design of the aGTM session feature for v1.5. It supersedes the prior design in [README-for-Developers.md](README-for-Developers.md). Implementation choreography (phase ordering, rollback procedures, "starting state" for the implementation chat) was removed once the redesign landed in code — `git log --oneline aGTM.js sgtmClient/` and the v1.5 [CHANGELOG](CHANGELOG.md) section have the as-built history. What remains here are the architectural decisions: goal, architecture, data contract, hash/diff strategy, decisions log, and the late-add Sources API integration.

---

## 1. Goal

Replace the client-side session-API roundtrip (`session_fetch()` + auto-denial + separate consent POST) with a model where:

1. The sGTM Client serves the aGTM library **and** the session data in one response.
2. The browser stores the session locally, including any server-known consent state.
3. The CMP-derived consent is diffed against the server-known state; only **changes** are pushed back to a dedicated consent-store endpoint on the sGTM Client.
4. Auto-denial moves entirely server-side (the sGTM Client decides, based on visit counter / prior session, whether to inject a denial consent into the response).

**Win:** returning visitors get GTM injected immediately on page load — no CMP wait — because consent travels with the library.

---

## 2. Architecture

### Before (current code on `dev`)

```
Browser                                 Server
  │                                       │
  ├── GET aGTM.js ──────────────────────► (static or sGTM Client)
  │◄── library ───────────────────────────┤
  │                                       │
  ├── init() ──┐                          │
  │            ├── session_fetch() ─────► /session API
  │            │◄── {sid,uid,ret,cst,…} ──┤
  │            │                          │
  │            ├── consent_check (CMP) ── (CMP in browser)
  │            │                          │
  │            └── once: POST consent ──► session_consent_url
  │                                       │
```

Three separate roundtrips, brittle timing (`session_wait`, `session_timeout`), client-side auto-denial logic, one-shot consent POST gated by `aGTM.d.consent_sent`.

### After (this redesign)

```
Browser                                 sGTM Client
  │                                       │
  ├── GET aGTM.js ──────────────────────► (library route)
  │                                       │   │
  │                                       │   ├── internal: Session API
  │                                       │   │  (uid → session{counter,consent?})
  │                                       │   │
  │                                       │   ├── if no consent && counter>0:
  │                                       │   │  inject server-side auto-denial
  │                                       │   │  into cfg.session.consent
  │                                       │   │
  │◄── library + injected cfg.session ────┤   │
  │      (incl. cfg.session.consent       │   │
  │       if known or auto-denied)        │   │
  │                                       │
  ├── init() ──► aGTM.d.session  = preset │
  │              aGTM.d.consent  = preset │
  │              aGTM.d.consent_hash = h  │
  │              → inject GTM if consent  │
  │                                       │
  ├── consent_check (CMP) on its own time │
  │      → run_cc() → diff hash           │
  │                                       │
  └── if diff: POST consent ────────────► (consent-store route)
                                              ├── manage user-id cookie
                                              └── persist consent into Session API
```

One library load doubles as session refresh. CMP no longer blocks GTM injection on returning visits. Consent updates are diff-driven (handles the first decision and per-service revocations with one code path).

---

## 3. Data contract

### `cfg.session` (injected by sGTM Client into the library response)

Same shape as today's session response, with **one new optional key**:

| Field | Type | Note |
|---|---|---|
| `sid` | string | Session ID (required for preset to take effect) |
| `uid` | string | User ID |
| `vct` | number | Visit counter (used **server-side** for auto-denial decision) |
| `consent` | object \| undefined | **NEW.** Pre-known consent for this session; same shape as `aGTM.d.consent`. Absent = server has no consent on file yet. |
| *(any)* | * | Stored as-is in `aGTM.d.session` |

`ret`, `cst`, `sst` are no longer consumed client-side (auto-denial is server-driven). They may still appear in `aGTM.d.session` if the server emits them, but aGTM does not branch on them.

### Consent-store request (browser → sGTM Client)

POST to `aGTM.c.consent_store_url`. When the library is served by the sGTM Client, this URL is auto-built as `https://<sgtm-host>/aGTMconsent` (fixed path). Body = current `aGTM.d.consent` minus client-derived fields:

```json
{
  "uid": "<from aGTM.d.session.uid, if available>",
  "sid": "<from aGTM.d.session.sid, if available>",
  "consent": {
    "hasResponse": true,
    "services": ",svc1,svc2,",
    "purposes": ",p1,",
    "vendors": ",v1,v2,",
    "feedback": "..."
  }
}
```

Excluded from payload: `gtmConsent`, `blocked` (both client-derived). Obfuscation (Base64 + Caesar shift, not encryption): optional, via `aGTM.c.session_salt` (kept) — but see the 501 guard in §Encrypted-mode guard, it is unusable server-side. Server returns `{ok:true}` (or empty 204); response body is not consumed by aGTM.

---

## 4. Hash / diff strategy

`aGTM.d.consent_hash` is a stable string serialization of the consent object, used to detect change.

**Strategy: blacklist, not whitelist.** Hash everything in `aGTM.d.consent` **except** the two client-derived fields (`gtmConsent`, `blocked`). Reason: CMP files write CMP-specific fields like `consent_id` (CCM19, Cookiebot, Sourcepoint, …) and `serviceIDs` (CCM19) — re-consent with same services but new `consent_id` is a real "decision event" the server must learn about. Whitelisting would silently drop these. Blacklisting auto-includes any new CMP field.

```javascript
aGTM.f.consent_serialize = function(c) {
  if (!c || typeof c !== "object") return "";
  // Sort keys alphabetically; exclude client-derived fields.
  var skip = { gtmConsent: 1, blocked: 1 };
  var keys = [];
  for (var k in c) { if (c.hasOwnProperty(k) && !skip[k]) keys.push(k); }
  keys.sort();
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], v = c[key];
    // Skip empty strings, null and undefined — semantically "absent". Required
    // because the B2 update-path reset clears CMP-managed fields to "" before
    // consent_check runs; without this skip, a preset that never carried a
    // given field would appear to differ from the post-reset state and create
    // a phantom diff.
    if (v === "" || v == null) continue;
    out.push(key + "=" + (typeof v === "object" ? JSON.stringify(v) : String(v)));
  }
  return out.join("|");
};
```

- ES5-safe (no `let`/arrow), no JSON.stringify on top-level (sorted keys explicit).
- For `services` / `purposes` / `vendors`: aGTM stores these as sorted comma-wrapped strings (e.g. `,a,b,c,`); equality compare suffices.
- **Empty/null skip is load-bearing for B2.** The hash and the consent-store POST payload share the same blacklist (gtmConsent, blocked, empty/null) so the server's full-replace persistence matches what the diff hash represents. Revoked-everything cases (services cleared) still produce a real diff because the *previous* hash carried the populated value while the new hash drops it.
- **CMP non-determinism warning:** if a CMP ever writes a per-page-load timestamp or random nonce into `aGTM.d.consent`, every `run_cc` would diff. None of the 25 current CMP files do this. Code review for new CMP integrations must check this.

**Diff trigger:** end of `aGTM.f.run_cc()`, after `aGTM.d.consent` is fully populated and `gtmConsent` computed. Pseudo-flow:

```
new_hash = consent_serialize(aGTM.d.consent)
if (consent_store_url && new_hash !== aGTM.d.consent_hash) {
  xhr = xsend(consent_store_url, payload, enc, salt)
  // Hash is updated ONLY on successful POST — see "Failure handling" below
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      aGTM.d.consent_hash = new_hash;
      aGTM.d.session_status = "synced";
    }
    // On non-2xx: leave hash unchanged → next run_cc retries
  };
} else if (consent_store_url) {
  aGTM.d.session_status = "confirmed";  // diff = 0, server already had it
}
```

**Failure handling:** if the POST fails (network error, non-2xx), `aGTM.d.consent_hash` stays at the old value. The next `run_cc('update')` will diff again and retry. This restores today's "page reload retries" semantics; it's a strict improvement because retries happen within the same page load (e.g. on the next CMP update event).

**Initial hash seed:** at end of `aGTM.f.config()`, if `cfg.session.consent` was preset, `aGTM.d.consent_hash = consent_serialize(cfg.session.consent)`. Otherwise hash starts as `""` (any non-empty consent → diff → first POST).

**Update-path field reset (BLOCKER fix B2):** at the start of `run_cc('update')`, before calling `consent_check`, reset CMP-managed fields on `aGTM.d.consent` to ensure stale preset values don't survive a real CMP decision:
```js
// In run_cc, action === 'update':
var snapshot = JSON.parse(JSON.stringify(aGTM.d.consent)); // poll-safety
var c = aGTM.d.consent;
c.hasResponse = false;
c.services = ""; c.purposes = ""; c.vendors = "";
c.consent_id = ""; c.serviceIDs = ""; c.feedback = "";
delete c.blocked;
// then consent_check; if it returns false → restore snapshot so the periodic
// CMP poll (start_consent_poll) is safe to run when the CMP is briefly
// unavailable. Without snapshot/restore, every failed poll tick would zero
// out the preset.
```
Then `consent_check('update')` repopulates whatever the CMP knows. Without this reset, a preset `purposes=",p1,"` survives even if the user revoked all purposes via the CMP — the diff would be wrong.

**Adaptive CMP poll (post-Phase 3 follow-up):** because most CMPs (CCM19, Cookiebot, Usercentrics, …) emit their consent-update events via direct `window.dataLayer.push()` instead of going through `aGTM.f.fire()`, the `consent_events` matcher in `fire()` never sees them and `run_cc('update')` is never triggered → no diff/POST. To fix this without wrapping `dataLayer.push` (fragile when other tools like `gtag` later overwrite it), aGTM now runs a periodic poll:

- After the first successful `run_cc('init')`, `aGTM.f.start_consent_poll()` is called.
- Gated on `consent_store_url != ''` AND `consent_poll_ms > 0` (default `2000`).
- The poll calls `run_cc('update')` on a `setInterval`. The B2 reset's snapshot/restore guard makes this safe even when the CMP transiently returns `false`.
- `aGTM_consent_update` event + `consent_callback` are gated on a separate `last_consent_hash` (always advances) so a stable poll tick does not flood the dataLayer or callbacks. The diff/POST gate uses `consent_hash` (advances only on 2xx) so 5xx retries are independent of the sendnaus gate.
- Integrators that prefer zero polling overhead can set `consent_poll_ms = 0` and trigger updates manually via `aGTM.f.run_cc('update')` from a CMP callback.

---


## 7. Decisions & open questions

### Resolved
- **Hash strategy:** blacklist-based stable string serialization (auto-includes new CMP fields like `consent_id`, `serviceIDs`); no full-JSON.stringify, no real hash function. Excludes `gtmConsent` and `blocked`.
- **No migration code:** v1.5 is unreleased. Old session API names are gone, not deprecated.
- **No config alias for `session_url`:** removed cleanly.
- **Obfuscation salt:** `session_salt` is retained and reused for consent-store POSTs (`aGTM.f.enc` = Base64 + Caesar shift, not encryption).
- **`session_status` repurposed** as a consent-sync lifecycle indicator (`""`, `"preset"`, `"preset_with_consent"`, `"synced"`, `"confirmed"`) — see §5. Adds real value (cache-hit measurability) instead of being deprecated.
- **`xfetch` deleted entirely:** orphan after `session_fetch` removal. Verified no other callers — sGTM Client uses GTM-Server APIs (`sendHttpRequest`/`sendHttpGet`), not aGTM helpers; tmp/aEvents-tag mentions xfetch only in a hypothetical README comment. The aEvents README will get a small follow-up edit to remove the dead reference.
- **Consent-store endpoint** is its own config (`consent_store_url`), not derived from the library URL. Integrators may want different paths/cache rules.

### Open / decide during Phase 1
- **First-visit timing:** today, `inject()` is called early for `noConsent` containers regardless of consent state. With the new design, this still works — `noConsent` containers don't depend on `cfg.session.consent`. No change needed, but worth a regression test in Phase 4.
- **Session API consent-write endpoint shape:** see Phase 0. Hard gate.

### Known tradeoffs (won't fix, document)

- **Optimistic preset consent (critic finding M2):** when `cfg.session.consent` is preset, GTM injects with that state immediately. If the user's actual *current* CMP state is more restrictive than the cached server state (e.g. revoked services since last visit but cookies cleared, or new CMP version with tighter defaults), GTM tags may briefly fire under a permissive consent before the CMP responds and `run_cc('update')` propagates the correction via the `aGTM_consent_update` event. **Mitigation requirement for integrators:** tags must be gated through Google Consent Mode v2 / consent signals, so a later `aGTM_consent_update` actually changes downstream tag behavior (drop, redact, etc.). This is a stricter integration requirement than today's "wait-for-CMP-then-load" model. Document prominently in `README-for-Developers.md` under integration prerequisites.

### Out of scope
- Session API design and storage backend (server-side concern, not in this repo).
- Encryption upgrade (still XOR-with-salt; a real crypto upgrade is a separate v1.6+ topic).

---

## 7a. Sources API integration (added late in v1.5)

A separate API service (`api4sources`) stores per-`page_view` source data
(landing URL, referrer) keyed by `(tenant, session_id)` for later attribution
analysis in ClickHouse. Integration guide + specs + smoketest live under
`internal/api/` (gitignored maintainer reference).

**Decision: server-side, fired from the sGTM Client. No browser changes.**

The sGTM Client's `/aGTM.js` handler already has, on every request:
- `pageUrl` and `pageRef` (decoded from the integration code's `?c=` base64)
- `sessionUid` (resolved cookie/fingerprint, used as `user_id` in api4sources)
- `CFG.tenantID` (from template config)
- `getTimestampMillis()`

After the Session API step completes (so the session record exists in the
shared Redis), the Client fires a fire-and-forget POST to api4sources:

```
POST {sources_api_url}/{tenant}
{
  "user_id":       <sessionUid>,
  "page_location": <pageUrl>,
  "referrer":      <pageRef>,
  "timestamp":     <ms>
}
```

api4sources looks up the active session via Redis key
`customer_sessions:{tenant}:{user_id}` — race-free because the Session API
write happened first within the same Client request.

**Why not browser-side:**
- Race-free at no cost (no retry logic, no polling).
- No consent gate needed (server-internal traffic).
- No browser code change, no new GTM tag, no Events Client extension.
- Encryption not needed (internal HTTP between two services).
- Tradeoff: SPA virtual pageviews mid-session are not captured. Acceptable
  because (a) attribution cares about the session source, not in-session
  navigation, and (b) api4sources dedups on source fingerprint anyway. If
  SPA-source capture is needed in v1.6+, add a `/aGTMsources` proxy path on
  the sGTM Client and a browser-side `aGTM.f.fire()` hook (mirror of the
  consent-store pattern).

**Template options (sGTM Client):**

| Option | Default | Description |
|---|---|---|
| `sources_enabled` | `false` | Master switch. Off by default — opt in. |
| `sources_api_url` | `""` | Base URL up to and including `/tp/sources/`. Tenant is appended at runtime. |

`tenant_id` is reused from the existing Session group.

**Smoketest:** combined into `internal/api/smoketest.tpl`
— steps 5-8 cover the sources POST contract; steps 9-10 + 15 cover the
attribution read contract; 16-18 are sources edge cases; 19-20 cover the
api4sgtm session-promote flow; 21 covers the content-store hash roundtrip.
Sources steps reuse the session created in step 1 (same Redis), so the
session steps are the natural precondition.

**Sources READ-back (in progress, 2026-05-05):** the api4sources GET
attribution endpoint exists and the contract is verified end-to-end via
the smoketest. Aggregation strategy is HYBRID (URL wins for browser-
derivable fields, API for cross-session-memory fields like `afs/lcs/fss`)
to mitigate ClickHouse Materialized View propagation lag. Implementation
is split: aGTM library adds `aGTM.f.resolveAttribution(method)` consuming
`aGTM.d.session.attribution`; sGTM Client adds the multi-method
`?methods=…` GET wired into the existing handler. See
`internal/api/integration-guide.md` §7 for the full design.

---

## 7b. F→C user-ID promotion (added late in v1.5)

The v1.3 user-id template generated a stable cookie-based ID (`C.1.tenant.<rand12>.<ts>`) the moment consent was granted. The initial v1.5 redesign collapsed that step into the server-side path but inadvertently dropped the random-generation: the fingerprint UID itself was being written to the cookie as-is, leaving every "consenting" visitor visible to api4sources / GA4 reports as an `F.*` user. Two real problems:

1. **Format-convention violation** — downstream systems (api4sources, dashboards, audit reports) cannot distinguish a real cookie user from an unbound fingerprint visitor.
2. **Stability across cookie-loss recovery** — the fingerprint contains a `YYYYMMDD` daily-rolling timestamp. While the cookie holds, the value stays stable. But if the cookie is lost (browser cleanup, incognito wipe, browser switch), the recovery fingerprint will carry a different date → different UID → no session stitching.

The fix uses the api4sgtm `/promote` endpoint (atomic Redis TxPipeline: session pointer migration `customer_sessions:{tenant}:{F-uid}` → `customer_sessions:{tenant}:{C-uid}` + consent record write — smoketest steps 19-20 verify the contract). Two trigger paths share one promote helper:

### UID format (api4sgtm contract)

The new `C.*` user ID is generated as **`C.1{lim}{tenant}{lim}{rand12}.{ms}`** where `{lim}` is the configured `CFG.fipLimiter` (default `$`). The literal `C.` prefix is mandated by api4sgtm's `/promote` endpoint, which strictly validates `new_user_id` starts with `"C."` (literal dot — see `internal/api/api4sgtm/team-spec.md` §"Promote / Migrate session"). After the version digit `1` the code switches to `fipLimiter` so the C-format mirrors the F-format (`F{lim}1{lim}…`) byte-for-byte after position 2 — visual consistency in cookies, logs, and analytics dumps. With the default `$` limiter the resulting cookie value is e.g. `C.1$cl_example$987654321012.1714900000000`, alongside `F$1$cl_example$<hash>.<date>`.

### Forward path — `/aGTMconsent` POST handler

When the browser POSTs a consent diff to `/aGTMconsent` and:
- the carried `uid` starts with `F{lim}1{lim}`, AND
- `granted = hasRequiredConsent(...)` returns true, AND
- the payload carries an **explicit signal** (at least one of `services` / `purposes` / `vendors` is non-empty — guards against empty/corrupt POSTs that `hasRequiredConsent` would otherwise treat as granted when no `consent_service` is configured), AND
- `services !== ',aGTMconsent,'` (the server-side auto-denial sentinel — a real CMP never emits this value), AND
- `cookieMode !== 'never'` (otherwise `C.*` could not be persisted)

…the Client generates `newUid = C.1{lim}{tenant}{lim}{rand12}.{ms}` (see "UID format" above for the rationale on the literal `C.` prefix vs the configurable `{lim}` rest), calls `POST {sessionApiUrl}/{tenant}/{F-uid}/promote` with `{new_user_id: newUid, consent: cpConsent}`, and on 2xx:

1. Writes `newUid` into the cookie (regardless of `cookieMode='consent'/'always'` — server-data has migrated, the browser must follow).
2. Skips the legacy `POST {sessionApiUrl}/{tenant}/{uid}/consent` — `/promote` already wrote the consent atomically.
3. Returns `{ok: true, uid: newUid}` so the browser can update `aGTM.d.session.uid`.

### Lazy path — `/aGTM.js` GET handler (returning visitors)

For visitors already stored under `F.*` from earlier v1.5 deploys: at the start of `afterSession`, when:
- `existingCookie` starts with `F{lim}1{lim}`, AND
- the Session API GET returned a real consent — `hasResponse: true` AND `services !== ',aGTMconsent,'` (auto-denial sentinel) AND `'blocked' in sessionConsent` is **false** (auto-denial constructor sets `blocked` regardless of its value, so checking presence rather than value is required) AND at least one of `services`/`purposes`/`vendors` is non-empty (explicit signal) AND `hasRequiredConsent(...)` returns true, AND
- `CFG.sessionApiUrl` and `CFG.tenantID` are set, AND
- `cookieMode !== 'never'`

…the Client runs the same promote helper, then continues the existing afterSession flow (cookie write, fireSources, fireAttribution, buildAndSend) with `sessionData.uid = newUid`. The downstream cookie write replaces the F.* in the browser, the JS payload carries the new `cfg.session.uid`, and on the next `/aGTM.js` request the cookie reads back as `C.*` so this branch is no-op (one-shot per visitor).

The lazy path bridges the deploy boundary: existing visitors are migrated on their next page view without waiting for the cookie to expire (default 365 days).

### The cookie never carries an `F.*` (F-153)

The promote paths above heal the *consent* path, but until F-153 the Client kept **producing** the very state they exist to remove: both cookie write sites wrote whatever uid they had resolved, fingerprint included.

- `/aGTM.js` — `continueAfterSession` wrote `sessionData.uid` unguarded. With `cookieMode='always'` and `fingerprint_allowed` both being **defaults**, every first-time visitor of a freshly created tag received an `F.*` cookie. Once written it renewed itself: `cookieAllowed` is `!!existingCookie` in consent mode, so the cookie kept proving its own admissibility.
- `/aGTMconsent` — `writeCookieAndPersist` wrote `finalUid` in the `cookieMode='consent'` branch, which is still the fingerprint whenever no promote ran (no Session API, no explicit consent signal, auto-denial sentinel) or the promote failed.

Why this is more than the format-convention violation named above: the fingerprint is derived from IP + UA + client hints + ASN/geo, so it is **not per-visitor**. Two people behind the same NAT running the same browser share it. Without a cookie that collision is transient (rolling `YYYYMMDD`); as a cookie it froze for `cookie_lifetime`, so the collision became permanent for that browser.

Both write sites now use a **whitelist**: only a value starting with the literal `C.` may enter the cookie. A blacklist on the fingerprint shape would not do, because that shape is built from the configurable `fipLimiter` — changing that field would have made every previously written value unrecognisable and reinstated the bug by way of a settings edit. Consequences worth knowing:

- **A visitor who has not answered the CMP carries no user-ID cookie**, including under `cookieMode='always'`. The stable ID is created at the moment of consent.
- **The `C.*` is minted locally when no Session API is configured.** `/promote` exists to move server-side state; where there is none, there is nothing to migrate and no reason to withhold the ID. Without this, both producers would hang off `sessionApiUrl` and a Client running without api4sgtm would never issue a cookie again — `cookie_mode` and `cookie_lifetime` would be advertised but dead.
- **A legacy `F.*` cookie is actively deleted**, subject to four guards: not under `cookieMode='never'` (that mode has never emitted a `Set-Cookie` of any kind), not when this request writes a fresh `C.*` anyway, **not when the Session API failed to answer** (an outage is not evidence that no consent exists — deleting there would discard identities tenant-wide during exactly the disruption the cleanup claims to guard against, and irreversibly, since the visitor afterwards re-derives *today's* fingerprint and any consent stored under yesterday's is orphaned), and not while a promote failed *transiently*. A promote refused definitively (`404` no active session, `409`) is **not** retried forever — otherwise the fingerprint would stay in the browser indefinitely, the state this cleanup exists to end.

### What the cookie fix does NOT solve (F-156)

The inheritance of one visitor's consent by another **does not run through the cookie**, and removing the cookie does not stop it. Visitor B never receives A's cookie; B derives the *same fingerprint*, the Session API GET returns A's record including `consent`, and that is passed into `cfg.session.consent` — so aGTM sets `preset_with_consent` and injects GTM although B has never seen a CMP. Measured against the running source, not inferred.

The fix even makes the collision **more frequent** for the population before consent: previously A carried a frozen `F(…D0)` while B derived `F(…D1)`, so they diverged after a day; now both derive today's value and collide daily. The cause is the fingerprint **as a session key**, not its storage in a cookie. Removing it from the cookie remains right on its own terms — a shared, IP-derived identifier with a one-year lifetime in the terminal device is not defensible regardless of the cause — but the open half is tracked as F-156, and the candidate fix (pass `sd.consent` through only when an `existingCookie` proves a per-browser binding) is a change to a live consent gate and needs its own decision.

### The price of the chosen route

Stated here because it is deliberate and will be visible on rollout: for visitors before consent the user key now **rolls daily**. `sessionCount` resets for that population, so "new vs. returning" shifts toward new; and first-touch attribution is lost for visitors who consent only on a later visit, because `/promote` migrates today's fingerprint pointer and earlier days are orphaned (`afs`/`lcs`/`fss` have no URL fallback). Previously the cookie froze that history under one key — at the cost of freezing a shared identifier.

Origin `9d302d7`, the same commit family as F-127/F-130. Covered by `test/sgtm/cookie-uid.test.js`; the shared harness in `test/sgtm/client-harness.js` records cookie writes, which the serve-path harness previously stubbed away — the reason three review rounds never saw this.

### Library handoff

In `aGTM.f.run_cc()`, the consent-store XHR's `onreadystatechange` parses the response body and adopts `response.uid` into `aGTM.d.session.uid` when:
- `xhr.responseText` is non-empty (skip parse on empty body — avoids log noise on legacy server responses), AND
- `JSON.parse` succeeds (defensive try/catch), AND
- `resp.uid` is a non-empty string starting with **literal `C.`** (race-safety: never downgrade an already-promoted `C.*` to a fallback `F.*`. Concrete scenario: two concurrent consent POSTs from the same browser. POST #1 succeeds and migrates F→C. POST #2's promote 404s because the session is already migrated, server falls back to echoing `finalUid=cpUid` which is the F.* from the cookie at the time POST #2 was sent. Without this gate, POST #2's response would overwrite POST #1's adoption — breaking subsequent persistence under the now-invalid F.*), AND
- `resp.uid !== aGTM.d.session.uid` (no-op when echoed value matches current).

### Encrypted-mode guard (`consent_store_enc=true`)

Server-side decryption is not implemented (would require a symmetric counterpart to `aGTM.f.enc`). The `/aGTMconsent` handler detects encrypted bodies (`{"q":"..."}` shape — distinguished from the plain `{"e":...}` envelope) and **returns `501 Not Implemented`** with `{"ok":false,"err":"consent_store_enc not supported server-side"}`. Without this guard, the legacy parser would silently treat the encrypted blob as a flat object, build an empty consent block, and `/promote` would write that empty consent into the migrated session record (full-replace semantics) — corrupting the user's consent state. The 501 makes the misconfiguration visible. Disable `consent_store_enc` until full-stack encryption support ships.

### Failure handling

`/promote` returns 404 (no active session for F.*), 400 (invalid `new_user_id` format), or transport errors (timeout / network / 5xx). All failure modes fall back to the legacy path: the F.* uid is preserved, the cookie write + legacy `/consent` POST run as before, and the visitor remains under F.* until the next opportunity. No broken-state outcome.

### Excluded paths

- `cookieMode === 'never'`: skipped — without a cookie the new C.* could not survive across requests.
- Server-side auto-denial (`consent.blocked === true`): skipped on the lazy path — the visitor never actually agreed; promoting them would mark a denial-state user as a real consenter in the Session API.

### Code locations

- `sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js`:
  - `generateCookieUid()` — generates `C.1{lim}{tenant}{lim}{rand12}.{ms}` (literal `C.` prefix required by api4sgtm `/promote` validator, then `fipLimiter` for visual consistency with the F-side)
  - `isFingerprintUid(uid)` — prefix detector for `F{lim}1{lim}`
  - `tryPromote(oldUid, newUid, consent, then)` — POSTs `/promote`, calls `then(newUid)` on 2xx, `then('')` on failure
  - Encrypted-mode guard: `/aGTMconsent` returns 501 when body shape is `{"q":"..."}`
  - Forward path: in the `/aGTMconsent` handler, branch on `shouldPromote` (gates: granted + explicit signal + not auto-denial sentinel + isFingerprintUid + cookieMode≠never)
  - Lazy path: in `afterSession`, branch on `shouldLazyPromote` (gates: hasResponse + not auto-denial via sentinel-or-blocked-presence + explicit signal + hasRequiredConsent + isFingerprintUid + cookieMode≠never)
- `aGTM.js` — uid adoption inside the existing `xhr.onreadystatechange` callback in `aGTM.f.run_cc()`'s consent-store path; only adopts when `resp.uid` starts with `C.` (race-safety against fallback echoes)
- `sgtmClient/template.tpl` — `___SANDBOXED_JS_FOR_SERVER___` block kept byte-identical to the source (build.sh syncs only base64 + version)
- `test/consent_store_uid_promote.test.js` — 9 unit tests covering the library-side adoption rules (new uid / identical / missing / empty body / non-2xx / non-string guard / F.* race-safety / non-C-prefix defensive / generateCookieUid format contract)
