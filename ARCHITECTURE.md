<!-- Moved verbatim from the root CLAUDE.md on 2026-10-25 to keep the always-loaded file small. On conflict, the root CLAUDE.md wins for rules, this file for mechanics. Keep in sync with README-for-Developers.md (see the documentation-maintenance rule in CLAUDE.md). -->

<!-- Section: aGTM — Core function architecture (agent & developer reference) -->

# aGTM — Core function architecture

Agent and developer reference: call graphs, callbacks, data stores, session feature, POST transport. The rules for working on this code are in the root [`CLAUDE.md`](CLAUDE.md).

### Event dispatch call graph

The central path from an external event push to the GTM dataLayer:

```
aGTM.f.fire(o)
  │
  ├─ aGTM.f.sStrf(o) + JSON.parse()   — deep copy of event object
  ├─ obj.aGTMts = Date.now()           — timestamp
  ├─ aGTM.f.run_cc("update")          — if o.event matches aGTM.c.consent_events
  │                                      (optional attr check via consent_event_attr)
  ├─ dlSet enrichment                  — reads GTM DL variables, appends to obj
  │                                      (only if aGTM.c.dlSet configured + GTM loaded)
  │
  ├─ [no consent && !_noConsent && event not "aGTM*"]
  │    └─ push to aGTM.d.f (queue)    — replayed once consent is available
  │
  └─ [consent present OR _noConsent]
       ├─ [_post && !_post_sent]       — POST fires here (consent-gated unless _noConsent)
       │    └─ aGTM.f.xsend()         obj._post_sent = true after send
       │
       ├─ aGTM.d.dl.push(obj)         — internal event log
       │
       ├─ [_noDLPush == true]
       │    └─ skip sendnaus/iFrameFire — event is in aGTM.d.dl+aGTM.l, NOT in GTM dataLayer
       │
       ├─ [iframe mode && !_noDLPush]
       │    └─ aGTM.f.iFrameFire(obj)
       │         ├─ [aGTM/GTM internal events] → aGTM.f.sendnaus(obj)
       │         └─ [user events] → window.top.postMessage(obj, origin)
       │                            (or queue until handshake)
       │
       ├─ [normal mode && !_noDLPush]
       │    └─ aGTM.f.sendnaus(obj)
       │         ├─ [dlOrgPush set] aGTM.f.dlHookTrap(window[gdl]) — setter trap on push:
       │         │    GTM's sandboxed push (and anything before GTM's push is in
       │         │    place — the setter takes it as the baseline itself) passes
       │         │    through; the first foreign set after it records its script
       │         │    (aGTM.f.stackSrc →
       │         │    aGTM.d.dlHookSrc) and the trap steps aside (plain property again)
       │         ├─ detect/protect against dataLayer.push hooks — the exception
       │         │    event carries fct_hook_src
       │         ├─ window[gdl].push(obj)   — actual GTM dataLayer push
       │         └─ aGTM.f.sendnaus_callback(obj)  — if defined
       │
       └─ aGTM.f.fire_callback(obj)    — if defined
```

### GTM injection & consent call graph

The path from `aGTM.f.init()` to the GTM `<script>` tag being inserted into the DOM:

```
aGTM.f.config(cfg)             — applied at integrator startup, BEFORE init()
  │
  ├─ [!cfg.debug && aGTM.f.optout()] — opt-out cookie/param ⇒ aGTM cleared, return
  │    (before the preset below: an objection wins over a stored consent, F-252)
  │
  ├─ [cfg.session is an object with sid, consent, attribution, OR source]
  │    └─ aGTM.d.session = deep-copy of cfg.session (carries source through)
  │       ├─ [cfg.session.consent is a valid object: hasResponse===true,
  │       │   typeof services==='string']
  │       │    → aGTM.d.consent = deep-copy of cfg.session.consent
  │       │      aGTM.d.consent_hash = consent_serialize(...)
  │       │      session_status = 'preset_with_consent'
  │       └─ [otherwise]
  │            → session_status = 'preset'
  │
  ├─ [end of config()] — attribution merge (v1.5):
  │    if (aGTM.d.session.attribution is an object)
  │      for each method in aGTM.d.session.attribution:
  │        aGTM.d.attribution[method] = aGTM.f.resolveAttribution(method)
  │      (HYBRID: URL wins for sou/cam/med/camid/cli/clp/cls/sre,
  │       API for afs/lcs/fss; see `internal/api/integration-guide.md` §7 (gitignored maintainer reference))
  │
  └─ [end of config()] — Phase 3 B1 fix:
       if (aGTM.d.consent.hasResponse === true && typeof call_cc === 'function')
         → aGTM.f.call_cc() synchronously
         (triggers run_cc('init') → inject() on this tick — no 500 ms wait)

aGTM.f.init()
  │
  ├─ aGTM.f.config(aGTM.c)       — apply configuration (see above); starts with
  │                                aGTM.f.optout() — opt-out cookie/param set ⇒ aGTM
  │                                cleared, config() returns, init() stops (F-252)
  │
  ├─ [iframe mode: iframeSupport && is_iframe]
  │    └─ consent forced true → aGTM.f.inject()
  │         └─ aGTM.f.initGTM(false) → aGTM.f.gtm_load()  (GTM in DOM)
  │
  └─ [normal mode]
       ├─ [cmp == 'none']
       │    └─ consent forced true → aGTM.f.inject()
       │         └─ aGTM.f.initGTM(false) → aGTM.f.gtm_load()  (GTM in DOM)
       │
       ├─ [cmp == '<name>']
       │    ├─ aGTM.f.load_cc(cmp)        — load cmp/<name>.min.js
       │    │    └─ on load: aGTM.f.consent_listener()
       │    └─ aGTM.f.initGTM(true)       — load noConsent containers early
       │
       └─ [no cmp configured]
            ├─ aGTM.f.consent_listener()
            └─ aGTM.f.initGTM(true)       — load noConsent containers early

aGTM.f.consent_listener()
  ├─ [useListener == false]
  │    ├─ aGTM.f.call_cc()            — sync attempt first; for preset_with_consent
  │    │                                 flows where CMP file is loaded async, this
  │    │                                 fires on the first tick after script load
  │    │                                 (no 500 ms wait). Returns true on success.
  │    │    └─ [success] aGTM.f.start_consent_poll()
  │    └─ [call_cc returned false] setInterval(aGTM.f.call_cc, 500ms)
  │         └─ [tick succeeds] aGTM.f.start_consent_poll()
  └─ [useListener == true]   — no timer; integrator calls aGTM.f.call_cc() manually
                                from their own CMP event listener

aGTM.f.start_consent_poll()        — adaptive CMP-state poll; gated:
  ├─ [no consent_store_url] return  — nothing to push, no value in polling
  ├─ [consent_poll_ms <= 0] return  — explicitly disabled
  ├─ [already polling] return       — idempotent
  └─ setInterval(run_cc('update'), consent_poll_ms)   — default 2000 ms
                                       Catches CMP state changes from CMPs
                                       that emit updates via dataLayer.push
                                       (CCM19, Cookiebot, Usercentrics, …)
                                       without going through aGTM.f.fire().
                                       run_cc('update') is snapshot/restore-
                                       guarded so this poll is safe even when
                                       the CMP is briefly unavailable.

aGTM.f.call_cc()             — called by timer, manually, or sync from config()
  ├─ aGTM.f.run_cc('init' | 'update')
  │    ├─ [no consent_check yet] log e14, return false. On the auto-denial
  │    │    sentinel (see below) gtmConsent = false first, without spending an
  │    │    adWait attempt: no adapter is no decision either (F-255).
  │    ├─ [action === 'update', OR 'init' on the sGTM auto-denial sentinel
  │    │   services === ',aGTMconsent,' — F-249] snapshot aGTM.d.consent, then B2 field-reset:
  │    │    aGTM.d.consent.hasResponse = false; services/purposes/vendors = "";
  │    │    consent_id/serviceIDs/feedback = ""; delete blocked.
  │    │    Stale preset values cannot survive a real CMP decision.
  │    │    On consent_check returning false → restore snapshot (poll-safe).
  │    │    Sentinel at init: the CMP is asked first; returning false keeps
  │    │    run_cc false (no inject) for 5 attempts (aGTM.d.adWait: config()
  │    │    sync, listener, three 500 ms ticks ≈ 1.5 s), then the auto-denial
  │    │    stands. A CMP decision always beats the preset. While it waits,
  │    │    gtmConsent = false, so fire() queues events and _post in aGTM.d.f
  │    │    (attempt 5 recomputes gtmConsent; the queue replays via hastyEvents).
  │    │
  │    ├─ aGTM.f.consent_check(action)    — CMP-specific function (from cmp/ file)
  │    │    ├─ wrapped in try/catch: a throw counts as false on every path — the
  │    │    │  state before the call is restored (also on a plain 'init', where
  │    │    │  there is no B2 snapshot), config()'s sync call survives (F-254);
  │    │    │  e_consent_check is logged once per page (aGTM.d.ccErrLogged)
  │    │    └─ on 'init' with hasResponse=true → short-circuit returns true
  │    │       (load-bearing for preset_with_consent path; not reached for the
  │    │       auto-denial sentinel, whose reset clears hasResponse first)
  │    │
  │    ├─ [ALL of gtmPurposes/Services/Vendors empty && !allowEmptyConsentConditions]
  │    │    → gtmConsent = false (fail-closed, F-167) + one-time log
  │    │      m_consent_no_conditions. chelp() answers "nothing required →
  │    │      satisfied", so without this the chain below is true for everyone
  │    │      and GTM loads after "deny all" — and the sGTM Client ships its
  │    │      condition table EMPTY, so that was the delivered default.
  │    │      cmp:'none' and the iframe mode set gtmConsent directly and never
  │    │      reach here: those are explicit choices, an empty table is a blank.
  │    ├─ evaluates gtmPurposes/Services/Vendors → sets aGTM.d.consent.gtmConsent
  │    │   (fallback: aGTM.d.consent.blocked === true → gtmConsent=true.
  │    │    Set by sGTM Client server-side auto-denial in cfg.session.consent.)
  │    │
  │    └─ [end of run_cc()] hash compute (once, reused):
  │         new_hash = consent_serialize(aGTM.d.consent)   — blacklist gtmConsent/blocked/empty
  │         hashChanged = new_hash !== aGTM.d.last_consent_hash   — gates sendnaus/callback
  │         aGTM.d.last_consent_hash = new_hash               — always advance
  │         [action === 'update' && hashChanged] sendnaus(aGTM_consent_update) + callback
  │           ├─ Polling-safe: ticks without state change emit nothing
  │         consent diff/store (gated on consent_store_url):
  │         if (new_hash !== aGTM.d.consent_hash):
  │            xhr = xsend(consent_store_url, {uid, sid, consent: <without gtm/blocked>}, …, cred=true)
  │                  (withCredentials + text/plain — cross-origin simple request, F-160)
  │            xhr.onreadystatechange: on 2xx → consent_hash = new_hash;
  │                                              session_status = 'synced'
  │                                              parse responseText: if response.uid
  │                                              is non-empty string and differs from
  │                                              aGTM.d.session.uid, adopt it (server
  │                                              just ran F→C promote — see SESSION-
  │                                              REDESIGN.md §7b)
  │                                  on non-2xx → leave hash; next run_cc retries
  │            budget (F-236): at most 3 POSTs per hash, none for the same
  │            hash while one is in flight (aGTM.d.consent_store_try) — a refusal that
  │            cannot heal in the page must not be re-POSTed every poll tick;
  │            a 4xx (not 408/429) or 501 is final: no retry at all (F-248)
  │         elif (consent_store_url && hash unchanged):
  │            session_status = 'confirmed'   — server already had this state
  │
  ├─ clearInterval(consent timer)
  └─ aGTM.f.inject()

aGTM.f.inject()
  ├─ copy pre-existing window[gdl] items → aGTM.d.f (queue)
  ├─ [gtmConsent == true]
  │    ├─ aGTM.f.initGTM(false)
  │    │    ├─ [container(s) configured] aGTM.f.gtm_load() per container
  │    │    │    ├─ sendnaus(aGTM_ready)  — carries aGTM.hastyEvents = aGTM.d.f
  │    │    │    ├─ sendnaus(gtm.js)
  │    │    │    ├─ gtmLoaded.push(id)    — gates the block above; runs BEFORE
  │    │    │    │                          the no-id exit, else it never runs
  │    │    │    │                          without a container (F-177)
  │    │    │    └─ insert <script> tag into DOM  — GTM loads asynchronously
  │    │    └─ [NO container configured] aGTM.f.gtm_load(…, i='', …, {})
  │    │         └─ same lifecycle, minus gtm.js (emitted only with an id) and
  │    │            minus the script tag. For setups where GTM is loaded by
  │    │            someone else (CMS, hand-placed snippet) but the page still
  │    │            needs aGTM's events — GTM replays the dataLayer from the
  │    │            start, so a later GTM still sees them. Not gated by a
  │    │            switch: "no container" already says it. Only on
  │    │            initGTM(false), never on the pre-consent initGTM(true).
  │    └─ aGTM.d.init = true
  └─ aGTM.f.chkDPready()    — fire aDOMready / aPAGEready if configured
```

**Queue & replay:** Events fired via `aGTM.f.fire()` before consent is available are stored in `aGTM.d.f`. When `inject()` runs, `aGTM.d.f` is passed as `hastyEvents` inside the `aGTM_ready` dataLayer event. A GTM Custom Template (see `gtm/`) reads this array and replays the queued events after GTM has loaded.

**`noConsent` containers:** `initGTM(true)` is called immediately at startup (before consent) and injects only containers configured with `noConsent: true`. These containers receive `aGTM_ready` without consent data — their GTM Custom Template can still access `hastyEvents` but should not assume consent is granted.

### Key callbacks (overridable by integrators)

| Callback | Triggered by | Receives |
|---|---|---|
| `aGTM.f.fire_callback` | end of `fire()` | final event object |
| `aGTM.f.sendnaus_callback` | end of `sendnaus()`, or directly when `_noDLPush` is true | event object |
| `aGTM.f.consent_callback` | end of `run_cc()` | action (`"init"` / `"update"`) |
| `aGTM.f.inject_callback` | after GTM script injection | — |
| `aGTM.f.optout_callback` | on opt-out detection | — |

### Data stores

| Object | Purpose |
|---|---|
| `aGTM.c` | Configuration (set via `aGTM.f.config()`) |
| `aGTM.c.allowEmptyConsentConditions` | Opt-out of the empty-conditions gate. `false` (default) means fail-closed: with `gtmPurposes`/`gtmServices`/`gtmVendors` **all** empty, `run_cc` sets `gtmConsent = false` (F-167). Cannot weaken a requirement that IS configured. `cmp:'none'` and the iframe mode are excluded via an explicit `noGate` flag — not by control flow, because `run_cc` stays reachable for them through `consent_events`. |
| `aGTM.c.jsErrors` | Install the JavaScript error listener (`aGTM.f.jserrors`) at the end of `init()`. Default `true`; only a real boolean `false` switches it off (F-190). The one data collection that runs without being configured — listed as L8 in `PRIVACY-DATAFLOW.md`. |
| `aGTM.c.consent_events` | Comma-separated event names that trigger `run_cc('update')` when seen in `fire()` |
| `aGTM.c.consent_event_attr` | Parsed attribute conditions for `consent_events` (keyed by event name) |
| `aGTM.c.dlSet` | Map of `{ targetProp: dlVariableName }` — auto-appended to every event in `fire()` |
| `aGTM.c.consent_store_url` | Phase 3: POST endpoint for consent diffs (sGTM Client persists into Session API record). When the library is served by the sGTM Client, the URL is built **browser-side** at config time from `document.currentScript.src` + the fixed path `/aGTMconsent` — so reverse-proxy setups (e.g. `/rp/tp/aGTM.js` upstream stripped to `/aGTM.js`) work transparently. Standalone integrators set this manually. |
| `aGTM.c.consent_store_enc` | Phase 3: obfuscate consent-store POST payload with `session_salt` (Base64 + Caesar shift via `aGTM.f.enc` — **not** encryption, trivially reversible). No server-side decoder exists: `/aGTMconsent` answers an obfuscated body with `501` and stores nothing, so switching this on disables consent persistence (F-168). |
| `aGTM.d` | Runtime data (consent state, queues, counters, …) |
| `aGTM.d.f` | Queue for events delayed until consent is available; also carries pre-existing DL items for `hastyEvents` replay |
| `aGTM.d.dl` | Internal copy of all events passed through `fire()` |
| `aGTM.d.consent` | Current consent state written by `consent_check`; `.gtmConsent` controls GTM injection |
| `aGTM.d.consent_hash` | Phase 3: stable serialization of `aGTM.d.consent` (blacklist of `gtmConsent`/`blocked`) at the **last successful consent-store POST**. Used to gate the diff/POST in `run_cc()` and to support retry on 5xx (advances only on 2xx). |
| `aGTM.d.consent_store_try` | Retry budget of the consent-store POST (F-236): `{hash, n, busy}`. At most 3 POSTs per consent hash, none for the same hash while one is in flight (single slot: A→B→A re-arms A); a new hash starts a fresh budget. A 4xx other than 408/429, and 501, spends the budget at once — the server's answer for that state will not change (F-248). Exhaustion is logged once as `e_consent_store_gave_up`. Without it the 2 s poll re-POSTed on every tick for as long as the server refused. |
| `aGTM.d.adWait` | Init attempts on the sGTM auto-denial sentinel without a CMP decision (F-249). At 5 the auto-denial stands; before that `run_cc('init')` returns false so the CMP gets the first word. While it waits, `gtmConsent` is held false so nothing passes `fire()`'s gate on the restored preset. A throwing `consent_check` counts as an attempt (F-254) — so an adapter that keeps throwing lets the auto-denial stand after 5, like one that reports no decision; a missing one does not count, but holds `gtmConsent` false too (F-255). |
| `aGTM.d.ccErrLogged` | Guards the `e_consent_check` log entry to one per page load (a broken adapter would otherwise add one per 2 s poll tick). |
| `aGTM.d.last_consent_hash` | State-change hash, advanced on **every** `run_cc()` regardless of POST success. Used to gate `sendnaus(aGTM_consent_update)` + `consent_callback` so the periodic CMP poll does not flood when the consent state is stable. |
| `aGTM.d.init` | `true` once GTM has been injected; guards `inject()` from running twice |
| `aGTM.d.optout` | `true` after `optout()` cleared aGTM for an active opt-out; makes the second `config()` of the Client order return at once (no second cookie write, no second `optout_callback`) |
| `aGTM.d.noCondLogged` | Guards the `m_consent_no_conditions` log entry to one per page load — `run_cc('update')` also runs on the consent poll, and `aGTM.f.log` neither dedupes nor caps |
| `aGTM.d.containerLessRun` | `true` once the container-less lifecycle has run (F-177). Keeps a repeated `initGTM(false)` — the Simulation tab does this — from appending another `'no_gtm_id'` to `gtmLoaded` |
| `aGTM.d.gtmLoaded` | Container IDs `gtm_load` ran for. Written **before** the script tag is inserted (it gates the lifecycle block), so it records the attempt; a container-less run records `'no_gtm_id'` |
| `aGTM.d.session` | Session & user data pre-populated from `cfg.session` (sGTM Client injection — see Session Feature below). Carries the Session API record: `uid`/`sid`/`ret`/`sst`/`vct`/`ga4sid`/`muidga4`, the counters `created`/`lastInteraction`/`pvCount`/`eventCount`/`sessionCount`, plus `consent`, `source` and `attribution` when present. **`vct` is the API's `counter` (requests within the session), NOT the visit count — that is `sessionCount`.** `counter` is not repeated under its own name; `customerId`/`user` are dropped as redundant. `ret`/`vct` semantics stay as they are because `ret` gates the server-side consent auto-denial. |
| `aGTM.d.session_status` | Consent-sync lifecycle: `""` (no preset), `"preset"` (cfg.session accepted, no usable consent — this also covers a source-/attribution-only delivery that carries no `sid`), `"preset_with_consent"` (preset consent seeded into `aGTM.d.consent`), `"synced"` (CMP decision diffed and POSTed to `consent_store_url`), `"confirmed"` (CMP decision matches the preset, no POST needed). Also set when the server-side auto-denial stood because the CMP gave no decision (`services: ",aGTMconsent,"`) — check that before treating it as consent. |
| `aGTM.d.bot` | Bot-check verdict from the sGTM Client (`cfg.bot`), `{}` when the check is off. Shape `{isBot, score, band, primarySignal, signals[]}`. Only ever present for a **non-blocked** visitor — a definitive bot gets HTTP 403 and no library. Meant for *marking* (a webGTM `traffic_type` dimension), never for blocking. See "Bot check" in `sgtmClient/CLAUDE.md`. |
| `aGTM.d.attribution` | Keyed-by-method attribution object populated at end of `config()` from `aGTM.d.session.attribution` merged with current URL/referrer. Empty `{}` when no preset is supplied. Read e.g. `aGTM.d.attribution.last_touch.sou`. See `internal/api/integration-guide.md` §7 (gitignored maintainer reference). |
| `aGTM.d.dlHookSrc` | Script URL (no query/fragment/userinfo) that first replaced `dataLayer.push` with a foreign function; `inline` for an inline script of the page (its path is never sent), `blob` for a `blob:` script, `""` if the stack named none. Recorded by the setter trap `aGTM.f.dlHookTrap`, which is only armed when `dlOrgPush` is set; reported as `fct_hook_src` in the hook `exception`. Vendor-neutral on purpose — a name for the URL belongs in the Inspector or a GTM lookup, not in the library. |
| `aGTM.d.dlHookTrap` | The dataLayer array the trap was armed on; a replaced array gets a new trap. |
| `aGTM.d.dlrepeatDone` / `dlrepeatPolling` / `dlrepeatGate` | DL-Repeat state: replay already ran once · a gate poll is currently active · the gate spec (`cfg.gateEvents`) being awaited, exposed read-only for the aGTM Inspector. Consumers of `dlrepeatPolling` must also check `!dlrepeatDone` — the flag is not cleared after a successful replay (F-74). |
| `aGTM.l` | Log array (decoded by `aGTM_debug.js`) |

### Session Feature

> **Status (v1.5 redesign, Phase 3 complete):** Full design in [SESSION-REDESIGN.md](SESSION-REDESIGN.md) at the repo root — read it before working on session/consent code. The session feature is now driven entirely by the sGTM Client (no client-side HTTP fetch). Phase 3 adds consent passthrough on read, diff-driven POST on update, and a synchronous fast-path for returning visitors with stored consent.

**Config options (v1.5):**

| Option | Type | Default | Description |
|---|---|---|---|
| `user_id` | string | `""` | Optional logged-in user CRM ID, exposed for integrators |
| `session_salt` | number | `0` | Obfuscation salt for the consent-store POST (also fallback for POST transport) |
| `consent_store_url` | string | `""` | POST endpoint for consent diffs. The sGTM Client handler manages the user-ID cookie AND persists the consent into the Session API record. When the library is served by the sGTM Client, the URL is built **browser-side** at config time from `document.currentScript.src` (the URL the browser actually fetched aGTM.js from) + fixed path `/aGTMconsent` — works under any reverse-proxy prefix without server-side knowledge. Standalone integrators set this manually. Empty string disables the feature. |
| `consent_store_enc` | boolean | `false` | If `true`, the consent-store POST payload is obfuscated with `session_salt` (Base64 + Caesar shift — **not** encryption). Unusable in v1.5: the server answers `501` and persists nothing. |
| `consent_poll_ms` | number | `2000` | Interval (ms) for the periodic CMP state-change poll started after a successful init. Set to `0` to disable. Only takes effect when `consent_store_url` is set (without it, polling has nothing to push). Catches CMPs that emit updates via direct `dataLayer.push()` (CCM19, Cookiebot, Usercentrics, …) — i.e. without going through `aGTM.f.fire()` — so the diff/POST mechanism still triggers. |
| `session` | object | `null` | Pre-populated session object from sGTM Client; accepted when it is an object containing a `sid`, `consent`, `attribution`, **or** `source` field |

**Removed (gone, no migration code, v1.5 unreleased):** Config: `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url`, `session_deny_service`. Functions: `aGTM.f.session_fetch`, `aGTM.f.session_apply_denial`, `aGTM.f.xfetch`. Data keys: `aGTM.d.session_ready`, `aGTM.d.consent_sent`.

**Preset gate** (in `aGTM.f.config()`): if `cfg.session` is an object with `sid`, `consent`, `attribution`, or `source`, it is deep-copied into `aGTM.d.session` (so any extra field such as `source` is carried through verbatim). Then:
- If `cfg.session.consent` is a valid object (`hasResponse === true`, `typeof services === 'string'`), it is deep-copied into `aGTM.d.consent`, `aGTM.d.consent_hash` is seeded via `consent_serialize`, `session_status = 'preset_with_consent'`. At end of `config()`, `aGTM.f.call_cc()` is called synchronously so GTM injects on this tick — without waiting for the 500 ms `consent_listener` poll.
- Otherwise `session_status = 'preset'` and the CMP path proceeds normally.

**Consent diff/store** (in `aGTM.f.run_cc()`, end of success path — runs on **both** `'init'` and `'update'`):
- `new_hash = aGTM.f.consent_serialize(aGTM.d.consent)` — blacklist serialization (excludes `gtmConsent`/`blocked` and empty/null values).
- If `consent_store_url` is set AND `new_hash !== aGTM.d.consent_hash` → POST `{uid, sid, consent: <without gtmConsent/blocked/empty>}` to `consent_store_url` via `aGTM.f.xsend()`. On 2xx response (`xhr.onreadystatechange` gate): update `aGTM.d.consent_hash = new_hash`, set `session_status = 'synced'`. On non-2xx: leave the hash unchanged so the next `run_cc()` retries — at most 3 POSTs per hash, none for the same hash while one is in flight (`aGTM.d.consent_store_try`, F-236), and none after a 4xx other than 408/429 or a 501 (F-248). The sGTM Client passes the Session API's status through (it used to answer a constant 200, which silently disabled this retry). For a cookie-bound `C.*` uid it heals a 404 "no active session" itself: it reads the session with the same GET as `/aGTM.js` and writes exactly once more — outside the 30-min window (measured from the last session GET; the consent write does not extend it) that read starts a new session with `counter` 0, per the api4sgtm maintainer (2026-09-29). An `F.*` fingerprint uid is never healed (shared key, F-156); its 404 additionally carries `x-agtm-consent: not-persisted-fingerprint` and still logs at `warn` — the volume (10,000+ a day on one tenant) is unexplained (F-249), and that line is the live signal. Any remaining non-2xx is logged at `warn`, outside debug.
- If hash matches: `session_status = 'confirmed'` (server already had this state, no POST).
- The init path runs the same diff/POST so first-visit CMP decisions (no preset, hash starts as `""`) and returning-visit reconciliations (preset hash matches CMP) both flow through one code path. Payload skips empty/null values to stay symmetric with the hash; the server is expected to use full-replace semantics on the consent record.

**Update-path field reset** (in `aGTM.f.run_cc('update')`, before `consent_check`): snapshot of `aGTM.d.consent` taken first, then `hasResponse=false`, `services/purposes/vendors/consent_id/serviceIDs/feedback=""`, `delete blocked`. Ensures stale preset values from server-side auto-denial don't survive a real CMP decision. **Snapshot is restored if `consent_check` returns `false`** — this makes the periodic CMP poll (`start_consent_poll`) safe to run repeatedly even when the CMP is briefly unavailable or the user dismisses the banner.

**Adaptive CMP poll** (`aGTM.f.start_consent_poll`): triggered after the first successful `run_cc('init')`. Only active when `consent_store_url != ''` and `consent_poll_ms > 0`. Calls `run_cc('update')` on a `setInterval` (default every 2000ms) so CMPs that emit consent updates via direct `dataLayer.push` — bypassing `aGTM.f.fire()` and therefore the `consent_events` matcher — are still caught and pushed to the consent-store endpoint. Idempotent (second call no-op). To disable: set `consent_poll_ms = 0` and trigger updates manually via `aGTM.f.run_cc('update')` from a CMP callback.

**`sendnaus`/`callback` hash gating** (in `run_cc('update')`): the `aGTM_consent_update` event and `consent_callback` only fire when the new consent hash differs from `last_consent_hash`. Without this gating the polling loop would emit one event every 2000ms regardless of state.

**`aGTM.f.consent_serialize(c)`**: stable, sorted, blacklist-based serialization of a consent object. Used by both the preset hash seed and the diff check. Excludes `gtmConsent`, `blocked`, and empty/null values (so adding/removing an empty field doesn't create phantom diffs).

**`blocked` field semantics**: server-side auto-denial in the sGTM Client sets both `gtmConsent: <autoDenyLoadGtm>` AND `blocked: <autoDenyLoadGtm>` in `cfg.session.consent`. The `blocked` field is recognised by the `run_cc()` chelp fallback: when chelp checks fail (services don't match the requirement), `gtmConsent` falls back to `blocked`. The B2 update-path reset deletes `blocked` so an explicit user CMP decision always wins over server policy.

### POST Transport & consent bypass

- **`aGTM.c.transport_url`** / **`transport_enc`** / **`transport_salt`** — global defaults for POST, set via `aGTM.f.config()`
- **`_post`** event property — per-event POST control; `true` uses global defaults, or an object `{ url, enc, salt, consent }` with optional overrides; POST respects the consent gate like any other event
- **`_post_sent`** — deduplication flag; set to `true` by aGTM after the POST is sent, prevents double-sending during dataLayer replay
- **`_noConsent`** event property — bypasses the consent gate for both DL push and POST; the property remains visible in the dataLayer event; use for functional/legal events that must be tracked regardless of consent
- **`_noDLPush`** event property — skips `sendnaus()`/`iFrameFire()` so the event is **not** pushed to the GTM dataLayer; the event is still recorded in `aGTM.d.dl` and `aGTM.l`, and POST transport still fires; use with `_noConsent` for pre-consent events that should not trigger GTM tags
