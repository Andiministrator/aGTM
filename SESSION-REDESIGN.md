# Session Feature Redesign (v1.5)

> **Status:** Plan — implementation pending. v1.5 has not been deployed; this is a hard cut, no migration code.
> **Owner:** Andi Petzoldt
> **Created:** 2026-04-29

This document specifies the redesign of the aGTM session feature for v1.5. It supersedes the in-progress note in [CLAUDE.md](CLAUDE.md) and the prior design in [README-for-Developers.md](README-for-Developers.md).

### Starting state for the implementation chat

When starting work, expect the `dev` branch to have **substantial uncommitted changes** (`aGTM.js` +152 lines, `sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js` +456, `sgtmClient/template.tpl` +844, plus doc updates and two new test files `fire_nodlpush.test.js` / `session_preset.test.js`). These represent the **current v1.5-in-progress work** — the state that this redesign will partially undo. They are NOT to be discarded; treat them as the starting baseline. Phase 2 (`aGTM.js` cleanup) and Phase 1 (sGTM Client refactor) operate on this current uncommitted state, with all line references in this plan calibrated to it.

Do not commit the uncommitted changes as a baseline first — let the redesign-phase commits subsume them naturally. Each phase commit replaces the in-progress work in its area with the new design.

### Recommended phase ordering

Phase 0 (Session API contract) is a hard gate. **However**, Phase 2 (`aGTM.js` cleanup) is purely subtractive and API-independent — it can start in parallel with Phase 0 / Phase 1, accelerating the critical path. Tests will go red on functions that depend on the deleted code (which Phase 2 also rewrites), so keep `bun test` green by working through Phase 2 in one continuous session. Phase 3 (diff/store) consumes Phase 0's contract and Phase 1's endpoint, so it must wait.

Suggested order: Phase 0 (blocking, ~2h external) ∥ Phase 2 (start in parallel) → Phase 1 → Phase 3 → Phase 4 → Phase 5.

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

Excluded from payload: `gtmConsent`, `blocked` (both client-derived). Encryption: optional, via `aGTM.c.session_salt` (kept). Server returns `{ok:true}` (or empty 204); response body is not consumed by aGTM.

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

## 5. Changes by file

### `aGTM.js`

**Remove (delete entirely):**
- `aGTM.f.session_fetch` (lines ~1802–1853)
- `aGTM.f.session_apply_denial` (lines ~1781–1793)
- Call to `session_fetch()` in `init()` (line ~1633–1634)
- Call to `session_apply_denial()` in `run_cc()` init path (lines ~401–406)
- `session_wait` wait branch in `inject()` (lines ~890–893)
- `session_consent_url` POST block in `run_cc()` (lines ~442–456)
- Config keys: `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url` (lines ~230–236)
- Data store key: `consent_sent`
- `aGTM.f.xfetch` (jsdoc + function at lines ~1726–1774) — only internal caller was `session_fetch`; sGTM Client uses GTM-Server APIs (`sendHttpRequest`/`sendHttpGet`), not xfetch; tmp/aEvents-tag mentions it only in a hypothetical README comment. No callers remain.
- `test/xfetch.test.js` — gone with the function
- Old `session_status` enum values `"ok"/"invalid"/"error"/"timeout"/"inactive"/"preset_uid"` (replaced by new lifecycle, see below)

**Add:**
- Config key `consent_store_url` (string, default `""`) and `consent_store_enc` (boolean, default `false` — independent flag, not derived from `session_salt`).
- Data store: `aGTM.d.consent_hash = ""`.
- Function `aGTM.f.consent_serialize(c)` (see §4).
- In `aGTM.f.config()`: if `cfg.session.consent` is **a valid object** (`typeof === 'object' && consent !== null && consent.hasResponse === true && typeof consent.services === 'string'`), deep-copy into `aGTM.d.consent` and seed `aGTM.d.consent_hash`. Otherwise ignore preset consent and fall back to CMP path. Set `aGTM.d.session_status` accordingly (`"preset_with_consent"` if accepted, `"preset"` if `cfg.session` present without valid consent, `""` otherwise).
- In `aGTM.f.run_cc()`, at the end of the success path: diff/POST per §4 (with onload-gated hash update) and set `session_status = "synced"` / `"confirmed"`.
- **At end of `aGTM.f.config()` (BLOCKER fix B1):** if `aGTM.d.consent && aGTM.d.consent.hasResponse === true` (preset path delivered usable consent), call `aGTM.f.call_cc()` synchronously. This triggers `run_cc('init') → inject()` immediately, without waiting for the 500 ms `consent_listener` poll. The consent_listener still starts (via the normal init flow) to catch later CMP updates, but `call_cc` clears the timer after first successful run, so it amounts to a no-op unless the integrator's CMP later fires `update`.

**Redefine `aGTM.d.session_status`** as a consent-sync lifecycle indicator. Old fetch-outcome enum is replaced. New values:

| Wert | Wann gesetzt |
|---|---|
| `""` | Initial / Session-Feature inaktiv / keine Session-Daten |
| `"preset"` | `cfg.session` vorbelegt, aber **ohne** `consent`-Objekt → Consent kommt von der CMP wie gehabt |
| `"preset_with_consent"` | `cfg.session` vorbelegt **mit** `consent`-Objekt → GTM kann ohne CMP-Wait injecten |
| `"synced"` | CMP hat geantwortet, Diff erkannt, Consent zum `consent_store_url` gepusht |
| `"confirmed"` | CMP hat geantwortet, kein Diff (Server-Stand stimmte mit CMP überein) |

State-Übergänge:
- Set in `aGTM.f.config()` based on whether `cfg.session.consent` is present
- Set at end of `aGTM.f.run_cc()` to `"synced"` (after diff-POST) or `"confirmed"` (no diff)
- **Value:** GTM Custom Templates can branch on it (e.g. only personalize if `preset_with_consent` or `confirmed`); integrators can emit it as event property to measure how often the cache hit avoided a CMP wait — the metric that justifies the redesign.

**Modify:**
- `cfg.session` preset gate (line ~239): drop the `cfg.session.uid` requirement. Accept any object with `sid` *or* `consent`. Document that without `sid`, the session is treated as "consent-only preset".
- `inject()`: no functional change. Pre-clearance via `cfg.session.consent.gtmConsent === true` is achieved through the synchronous `call_cc()` trigger added in `config()` (see B1 fix above); `inject()` itself stays idempotent via `aGTM.d.init`.

**Remove (additional, from critic findings):**
- `aGTM.d.session_ready` — dead code in the new model. With `session_fetch` gone, `session_ready` would be either `true` (after `config()` if session present) or unset, never `false`. The new `session_status` lifecycle is the single source of truth for "is session/consent state established". Drop the data store key and its three test assertions in `session_preset.test.js`.

**Keep as-is:**
- `aGTM.d.session` (still useful, populated from `cfg.session`).
- `session_salt` (reused for encrypting the consent-store POST).
- `xsend()` (still used for general POST transport; consent-store POST is its own dedicated channel — **NOT** routed through the `_post` event mechanism).
- **CMP `consent_check` short-circuit:** every file in `cmp/*.js` begins with `if (action=='init' && aGTM.d.consent.hasResponse) return true;`. This pattern is now **load-bearing** for the preset path: when `cfg.session.consent` pre-populates `aGTM.d.consent.hasResponse = true`, the first `consent_check('init')` call returns true immediately without touching the CMP, allowing GTM injection without CMP-wait. **Adding or modifying any CMP file must preserve this short-circuit.** Add a CI grep check or unit test to enforce it.

### `sgtmClient/template.tpl` and `sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js`

The sGTM Client is substantial today (~373 lines): bot check → user-id resolution (cookie / fingerprint) → presession API → session API → build aGTM config. Two HTTP routes already exist: `POST <consent_url>` (consent updates) and `GET …/aGTM.js` (library + config). The redesign collapses two API calls into one and reshapes the consent flow.

**Remove:**
- `CFG.presessionApiUrl` (line 38) and `data.presession_api_url` from the template UI (`template.tpl`).
- The entire `afterPresession` flow (lines ~207–276) — the presession HTTP call, `presessionData`, `presessionCst` — gone. `cookieAllowed` gating now derives from session API consent state (see below) or from existing cookie.
- `CFG.consentService/Purpose/Vendor` are still needed (server applies the same gate logic locally now); `inConsentStr` / `hasRequiredConsent` helpers stay.
- Output config: `c.session_gtm_on_deny` (line 337) and `c.session_consent_url` (lines 344–349) — both are gone client-side. `data.session_gtm_on_deny`, `data.session_deny_service` removed from `template.tpl` UI.
- `tmp/api4pre_session_README.md` and `tmp/sgtm-session-api-README.md` (or move to a v1.5 archive folder).

**Modify — Session API call (lines ~239–264):** the **only** remaining server-side API call. Returns session data **plus** consent state. Expected new response shape from the Session API:
```json
{
  "sessionId": "<sid>",
  "counter": 3,
  "ga4sid": "...",
  "muidga4": "...",
  "consent": {              // NEW — present only if session has stored consent
    "hasResponse": true,
    "services": ",svc1,",
    "purposes": ",p1,",
    "vendors": ",v1,",
    "feedback": "..."
  }
}
```
The client's `afterSession()` then decides:
1. **Stored consent present** (`r.consent` is an object with `hasResponse: true`) → pass through to `cfg.session.consent`.
2. **No consent + returning visitor** (`r.consent` absent, `r.counter > 0`) → server constructs auto-denial:
   ```js
   sessionData.consent = {
     hasResponse: true,
     feedback: "Consent denied by aGTM",
     services: ",aGTMconsent,",
     purposes: "",
     vendors: "",
     gtmConsent: true   // load GTM with denial; flip to false if server policy says no
   };
   ```
   The `gtmConsent` flag inside the embedded consent replaces the old `session_gtm_on_deny` config — it is now a **server policy decision**, configurable in `template.tpl` UI as e.g. `data.auto_deny_load_gtm` (boolean, default true).
3. **No consent + first-time visitor** (`r.counter === 0` or session API miss) → `sessionData.consent` is **omitted** → aGTM waits for CMP as before, status starts as `"preset"` (or `""` if no session at all).

**Modify — `buildAndSend()` (lines ~334–352):** `c.session = sessionData` now includes the optional `consent` field. Drop the special-cased uid-only branch — preset path no longer requires `sid`, and the simplified aGTM `config()` accepts any session object.

**Add — `consent_store_enabled` checkbox + fixed path + browser-side URL build:** instead of asking the integrator for a URL, expose a boolean `data.consent_store_enabled` (default true). The path is hard-coded as a `CONSENT_STORE_PATH = '/aGTMconsent'` constant in jsSourceCode.js. The full browser-facing URL is built **browser-side** at config time: jsSourceCode.js wraps the `aGTM.f.config(c)` call in an IIFE that reads `document.currentScript.src`, strips the trailing `/aGTM.js`, and appends `/aGTMconsent`. This handles reverse-proxy setups transparently — server sees `/aGTM.js` (proxy stripped the prefix) but the browser knows the real prefix because it loaded the script from `https://<host>/<prefix>/aGTM.js`. Standalone integrators (without sGTM Client) continue to set `aGTM.c.consent_store_url` manually.

**Modify — `POST CONSENT_STORE_PATH` handler (lines ~70+):** still receives the consent payload from the browser, but now must **persist into the session** via the Session API (server-side `PUT` or equivalent — exact endpoint shape TBD with the Session API team). Today the handler only manages the user-ID cookie based on consent. Both responsibilities remain:
- Cookie write/delete based on `cookieMode === 'consent'` and `hasRequiredConsent(...)` — unchanged.
- **NEW:** call the Session API to store `{uid, sid, consent}` in the session record so the next library load returns it.

Response stays `{"ok":true}`.

**Encryption / salt:** continue using `session_salt` (kept in aGTM lib config). Both library response and consent POST share the same salt — consistent with today's model.

**Cookie modes:** `always` / `consent` / `never` continue to work, but **the cookie-on-known-consent path moves into `afterSession()`** (critic fix M5). Today `afterPresession` writes the user-ID cookie when the presession API confirms consent. With the redesign, on a returning visitor whose session already carries a granted-consent record, the library route must restore parity: in `afterSession()`, after parsing the Session API response, if `sessionData.consent` is present and `hasRequiredConsent(services, purposes, vendors)` returns true → call `writeCookie(uid)` before `buildAndSend()`. Without this the user-ID cookie expires on returning visits with stored consent until the user re-interacts with the CMP.

**Documentation update in same commit (Mi2):** when these changes ship, update `sgtmClient/README.md` in the same commit. Don't defer to a global Phase-5 doc-sync.

### Tests

**Delete:**
- `test/session_fetch.test.js` — fetch path is gone
- `test/xfetch.test.js` — function is gone
- `test/inject.test.js` — entire file (58 lines) tests the `session_wait` gate; both `session_wait` and `session_ready` are removed. The file becomes dead. (QA finding 1.)

**Modify:**
- `test/session_status.test.js` — rewrite for the new lifecycle: `""` → `"preset"` / `"preset_with_consent"` after `config()`, `"synced"` / `"confirmed"` after `run_cc()`. Old fetch-outcome tests deleted.
- `test/call_cc.test.js` lines 14–15 — remove the `aGTM.c.session_wait = false; aGTM.d.session_ready = true;` setup lines (both keys gone). (QA finding 2.)
- `test/session_preset.test.js` — **substantial wholesale rewrite, not just an extend**. Current file is 293 lines and contains three blocks tied to deleted code (QA finding 3):
  - Section "4–7: aGTM.f.session_apply_denial()" (~lines 88–144) — **delete entirely** (function gone).
  - Section "8–9: session_fetch() activation" (~lines 148–193) — **delete entirely** (function gone).
  - Section "10–11: run_cc() auto-POSTs to session_consent_url" (~lines 196–end) — **delete entirely** (replaced by `consent_store.test.js`).
  - Drop the `preset_uid` test (status value gone).
  - Then add:
    - Preset includes `consent` → `aGTM.d.consent` populated, `consent_hash` seeded, `session_status === "preset_with_consent"`, GTM injects without CMP
    - Preset includes `consent` with `gtmConsent: false` → GTM does **not** inject, CMP can still update later
    - No preset `consent` → CMP-only path, `session_status === "preset"`, behaves as today
    - Malformed `cfg.session.consent` cases (Mi5, see below).
  - Estimated final size: ~120 lines (60% smaller than today).

**New test file: `test/consent_store.test.js`**
- Diff detection: identical CMP response after preset → no POST, `session_status === "confirmed"`
- Diff detection: CMP response differs from preset → exactly one POST with correct payload, `session_status === "synced"`
- Multiple `run_cc('update')` calls with same data → only first triggers POST, hash prevents duplicates
- Per-service revocation: services list change → POST fires
- **`consent_id` change** with same services → POST fires (blacklist-hash regression check)
- `consent_store_url` empty → no POST regardless of diff
- `gtmConsent` change-only (e.g. due to aGTM config mismatch) → does **not** trigger POST (excluded from hash)
- **POST failure (xsend onload status 500)** → `consent_hash` stays at old value; next `run_cc('update')` retries

**Malformed-input tests in `session_preset.test.js`** (Mi5):
- `cfg.session.consent = null` → ignored, falls back to CMP path, `session_status === "preset"`
- `cfg.session.consent = {}` (no `hasResponse`) → ignored
- `cfg.session.consent = "string"` → ignored
- `cfg.session.consent = { hasResponse: true }` (no `services`) → ignored

**Synchronous inject test** (B1 fix): `cfg.session.consent` valid + `gtmConsent: true` → `aGTM.d.init === true` *immediately* after `aGTM.f.init()` returns (no setTimeout / setInterval needed in test). Today's tests don't cover this — it was a 500ms-timer-gated flow.

### Documentation (scope is bigger than initially scoped — QA findings 6–12)

- **`CLAUDE.md`** — replace the "Session Feature" section. Remove the old auto-denial logic block. Add the new diff/store flow. Update both call graphs (event dispatch is unchanged; injection graph drops `session_fetch` and gains the consent-store POST in `run_cc`). Update the data-stores table (`consent_hash` in, `consent_sent`/`session_ready` out, `session_status` redefined).
- **`README-for-Developers.md`** — the entire "Session Feature" section (~lines 67–72, 347–358, 477–515) is tied to deleted code — **wholesale rewrite**, not patch. New config keys (`consent_store_url`, `consent_store_enc`), removed config keys list, new lifecycle status documented, new "Optimistic Preset" prerequisite around Consent Mode v2.
- **`README.md`** — multiple dedicated config sections (lines 450, 456, 472, 480, 488, 535–536, 552) describe `user_id`, `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, and the old `session_status` enum — all removed or redefined. **All these sections need rewrite/removal**, not just a changelog patch.
- **`README.de.md`** — German quickstart added in commit 89555d0. Verify session content; update for parity with `README.md`. (QA finding 9.)
- **`CHANGELOG.md`** — current v1.5 entry block (lines 4–21) documents exactly the features being deleted (`session_consent_url`, `session_apply_denial()`, `consent_sent` deduplication, presession API, `xfetch` etc.) as v1.5 *additions*. **The entire v1.5 block needs wholesale rewrite**, not a one-liner. v1.4 entries (lines 38–51) describing the original session feature stay (historical). New v1.5 block must explicitly note removed APIs (incl. `xfetch`, QA finding 12).
- **`ROADMAP.md`** — mark session redesign as Done once shipped; remove TBD note. Line 23 references the playground's "mock CMP and session endpoint" — playground is being rewritten (see below), update accordingly.
- **`sgtmClient/README.md`** — v1.5 changelog block (~lines 302–316) describes presession API, `session_consent_url`, `session_url`, `session_wait` etc. as v1.5 features. **Wholesale rewrite of that block.** Document the new single-API model.
- **`memory/project-session-redesign.md`** — update on completion to "shipped, see git tag v1.5".

### Playground & manual tests (QA findings 4, 5)

- **`test/MANUAL_TEST.md`** — Sections 7 (rows 7.1–7.10), 8 (8.1–8.5), 9 (9.1–9.5) are entirely about `session_fetch` / auto-denial / `session_wait` and need full rewrite for the new lifecycle, not a note.
- **`playground/index.html`** — references go beyond the line 424 `session_status` display:
  - Line 424: `session_status` display stays (with new lifecycle values).
  - Lines 578, 586, 596, 604: scenarios using `session_url` / `session_wait` / `session_timeout` — **rewrite or remove** scenarios.
  - Lines 653, 655, 666: cfg-builder UI references `session_url` / `session_wait` — remove fields, add `consent_store_url`.

---

## 6. Implementation phases

Ordered to keep `bun test` green between phases where possible.

### Phase 0 — Hard gate (must complete before Phase 2 merges)
**Critic finding M4: do not start aGTM-side work until the Session API write contract is verified.**
1. Session API team delivers: (a) updated read-endpoint that returns `consent` field, (b) write-endpoint that persists `{uid, sid, consent}` into the session record.
2. Manual end-to-end smoke test against the real Session API: write consent via curl → confirm next read returns it → confirm new read for an unknown uid omits consent.
3. Session API write contract documented in `sgtmClient/README.md`.
4. Without this gate: aGTM library would POST to a consent-store endpoint whose handler can't persist → infinite re-POST loop on every page load (CMP responds → POST → server doesn't store → reload → no consent in session → CMP responds → POST → …).

### Phase 1 — sGTM Client refactor
1. **Spec the Session API contract** (server-side, mostly outside this repo): response includes optional `consent` field; new endpoint or verb to write consent into a session record.
2. **`jsSourceCode.js`:** delete `presessionApiUrl`, `afterPresession`, presession HTTP call. Refactor `cookieAllowed` derivation to use session-API consent state instead.
3. **`jsSourceCode.js`:** in `afterSession()`, parse `r.consent` if present and pass through; if absent and `r.counter > 0`, construct server-side auto-denial. Add `data.auto_deny_load_gtm` UI control.
4. **`jsSourceCode.js` `buildAndSend()`:** drop the uid-only branch, drop `c.session_gtm_on_deny`, drop `c.session_consent_url`, add `c.consent_store_url` from `data.consent_store_url`. `c.session = sessionData` (now includes optional `consent`).
5. **`jsSourceCode.js` consent POST handler:** add the call to the Session API to persist the consent into the session record (alongside the existing cookie management).
6. **`template.tpl`:** remove UI fields for `presession_api_url`, `session_gtm_on_deny`, `session_deny_service`. Rename `consent_url` → `consent_store_url` (or keep field, change label). Add `auto_deny_load_gtm` boolean field. Update `aGTMversion` to `1.5`.
7. **`sgtmClient/README.md`:** rewrite to reflect single-API model; document the new request/response shapes.
8. Manual smoke test with curl/Postman: GET aGTM.js for new uid (no consent in response), simulate session with stored consent (consent in response), simulate returning visitor without consent (auto-denial in response). POST to consent_store_url, verify cookie + Session API write.
9. Commit: `refactor(sgtm-client): single Session API, server-side auto-denial, consent-store route`

### Phase 2 — aGTM.js cleanup
1. Delete `session_fetch`, `session_apply_denial`, `aGTM.d.session_ready`, related config keys, data store keys, `inject()` wait branch, `run_cc()` POST block.
2. Delete `aGTM.f.xfetch` and `test/session_fetch.test.js`, `test/xfetch.test.js`. Rewrite `test/session_status.test.js` for the new lifecycle.
3. **Update `CLAUDE.md` and `README-for-Developers.md` call graphs in the SAME commit** (Mi2): the existing graphs reference `session_fetch`, `session_apply_denial`, `session_consent_url`, `consent_sent` — all gone. Stale docs after this commit would mislead future agents/integrators.
4. Run `bun test` — should pass with reduced surface.
5. Commit: `refactor: remove old session_fetch and auto-denial paths (v1.5 redesign)`

### Phase 3 — aGTM.js diff/store implementation
1. Add `consent_store_url` + `consent_store_enc` config keys, `aGTM.d.consent_hash` data key.
2. Add `aGTM.f.consent_serialize()` (blacklist strategy, see §4).
3. Extend `aGTM.f.config()` to validate and apply `cfg.session.consent` → `aGTM.d.consent` + hash seed + `session_status` set.
4. Add the synchronous `call_cc()` trigger at end of `config()` for B1 — this is the actual performance win.
5. Add field-reset block at start of `run_cc('update')` (B2 fix).
6. Add diff/POST block at the end of `aGTM.f.run_cc()` with onload-gated hash update (M1 fix) and `session_status` lifecycle transitions.
7. Extend `test/session_preset.test.js` with malformed-input cases, add `test/consent_store.test.js` (incl. POST-failure retry case, consent_id-change case, synchronous-inject case).
8. **Update `CLAUDE.md` Session-Feature section + `README-for-Developers.md` in SAME commit** (Mi2).
9. `bun test` green.
10. Commit: `feat: consent diff + store for v1.5 session redesign`

### Phase 4 — Build + integration test
1. `./build.sh` (regenerates `aGTM.min.js`, `aGTM.base64`, `template.tpl` base64 injection).
2. End-to-end browser test against a real sGTM Client deployment:
   - First visit, no consent → CMP wait → CMP response → POST observed at consent-store
   - Reload after consent → no CMP wait, GTM injects immediately, no POST (diff = 0)
   - Service-level revocation via CMP UI → POST observed
   - Returning visitor without consent (cleared cookie sim) → server sends auto-denial → GTM loads with `aGTMconsent` only, no CMP wait
3. Commit: `build: regenerate after session redesign`

### Phase 5 — Documentation, playground, manual tests
Inline doc updates land in Phases 2–3 for files tied to specific code (`CLAUDE.md`, `README-for-Developers.md`, `sgtmClient/README.md`). Phase 5 covers everything else, plus the cross-check sweep:

1. **`README.md`** — rewrite all session-related sections (lines ~450–552, see scope above).
2. **`README.de.md`** — parity rewrite.
3. **`CHANGELOG.md`** — wholesale rewrite of the v1.5 block (lines 4–21). Explicitly list removed APIs incl. `xfetch`, `session_ready`, `session_apply_denial`, `session_fetch`, `session_consent_url`, `consent_sent`, presession API, plus removed config keys. List added: `consent_store_url`, `consent_store_enc`, `consent_hash`, new `session_status` lifecycle.
4. **`ROADMAP.md`** — mark redesign as done; update line 23 playground reference.
5. **`test/MANUAL_TEST.md`** — rewrite sections 7, 8, 9 for the new lifecycle.
6. **`playground/index.html`** — rewrite session-related scenarios and cfg-builder fields per the plan's playground sub-section above.
7. **`tmp/aEvents-tag/README-aEvents-tag.md:194`** — remove dead xfetch reference.
8. **Archive or delete** `tmp/api4pre_session_README.md` and `tmp/sgtm-session-api-README.md` (both describe deleted APIs).
9. **Cross-check sweep:** `grep -r "session_fetch\|session_apply_denial\|session_consent_url\|session_wait\|session_timeout\|session_gtm_on_deny\|session_url\|consent_sent\|xfetch\|session_ready\|presession" .` — confirm no references remain outside `SESSION-REDESIGN.md` itself and (optionally) git history.
10. Update memory file `project-session-redesign.md` to "shipped, see git tag v1.5".
11. Commit: `docs: rewrite playground, manual tests, READMEs, CHANGELOG for v1.5 session redesign`

### Phase 6 — Release
1. Verify `VERSION` = `1.5`, all `@version` headers + `aGTM.d.version` consistent.
2. Merge `dev` → `main`.
3. `git tag v1.5`.

---

## 7. Decisions & open questions

### Resolved
- **Hash strategy:** blacklist-based stable string serialization (auto-includes new CMP fields like `consent_id`, `serviceIDs`); no full-JSON.stringify, no real hash function. Excludes `gtmConsent` and `blocked`.
- **No migration code:** v1.5 is unreleased. Old session API names are gone, not deprecated.
- **No config alias for `session_url`:** removed cleanly.
- **Encryption salt:** `session_salt` is retained and reused for consent-store POSTs.
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
analysis in ClickHouse. Spec: `tmp/api4sources.md`.

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

**Smoketest:** combined into the existing `tmp/session-api-smoketest.tpl`
(steps 5-8: insert, dedup, referrer-change insert, no-active-session skip).
Sources steps reuse the session created in step 1 (same Redis), so the
session steps are the natural precondition. Auto-mode only — the manual
single-step wizard still runs the 4 session steps for paced eventual-
consistency probing.

**Out of scope (v1.5):** read-back endpoint on api4sources (no GET defined
yet), source-keys query helpers in the sGTM Client. If/when needed, those
are server-side concerns and would not affect aGTM.

---

## 8. Rollback

This redesign is a hard cut. Rollback = `git revert` of the commits from phases 2–5 before tagging. Once `v1.5` is tagged on `main`, rollback would require a `v1.5.1` patch release. There is no runtime feature flag.
