# Changelog

## Version 1.5 — *in development*

### Session feature redesigned (server-side, single source of truth)

The client-side session fetch + auto-denial machinery from earlier v1.5
prereleases is gone. Session and consent state are now driven entirely
by the sGTM Client; aGTM consumes a pre-populated `cfg.session` object
in the library response and pushes consent diffs to a dedicated endpoint.
See [SESSION-REDESIGN.md](SESSION-REDESIGN.md) for the full design.

**Removed (no migration code, v1.5 was unreleased):**
- Functions: `aGTM.f.session_fetch`, `aGTM.f.session_apply_denial`, `aGTM.f.xfetch`
- Config keys: `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url`, `session_deny_service`
- Data keys: `aGTM.d.session_ready`, `aGTM.d.consent_sent`
- Old `session_status` enum values: `"ok"`, `"invalid"`, `"error"`, `"timeout"`, `"inactive"`, `"preset_uid"`
- sGTM Client Template parameters: `presession_api_url`, `session_gtm_on_deny`, `session_deny_service`, `consent_url`

**Added — config keys (aGTM library):**
- `consent_store_url` — POST endpoint for consent diffs. When the library is served by the sGTM Client, the URL is built browser-side at config time from `document.currentScript.src` + the fixed path `/aGTMconsent` — works under any reverse-proxy prefix transparently.
- `consent_store_enc` — encrypt the consent-store POST payload with `session_salt`
- `consent_poll_ms` — interval (ms) for the periodic CMP state-change poll started after init success. Default `2000`. `0` disables polling.
- `session` — pre-populated session object from the sGTM Client. Accepted with `sid` OR `consent`.

**Added — functions (aGTM library):**
- `aGTM.f.consent_serialize(c)` — stable, sorted, blacklist-based serialization for diff detection. Excludes `gtmConsent`, `blocked`, and empty/null values.
- `aGTM.f.start_consent_poll()` — starts the adaptive CMP poll after `run_cc('init')` succeeds. Idempotent. Gated on `consent_store_url + consent_poll_ms > 0`.

**Added — data keys (aGTM library):**
- `aGTM.d.consent_hash` — last successfully POSTed state hash (advances only on 2xx; supports retry on 5xx)
- `aGTM.d.last_consent_hash` — state-change hash, advances on every `run_cc()`. Gates `aGTM_consent_update` event + `consent_callback` so the periodic CMP poll does not flood the dataLayer when the consent state is stable.

**Redefined — `aGTM.d.session_status` lifecycle:**
- `""` — no `cfg.session` supplied (feature inactive)
- `"preset"` — `cfg.session` accepted, but no usable consent block — CMP path proceeds normally
- `"preset_with_consent"` — `cfg.session.consent` valid → seeded into `aGTM.d.consent`, GTM injects on the first tick (no CMP wait)
- `"synced"` — after `run_cc`: a CMP-driven consent change was diffed and successfully POSTed to `consent_store_url`
- `"confirmed"` — after `run_cc`: CMP-derived state matched the preset — server already had this consent, no POST sent

**Behaviour:**
- `aGTM.f.config()` preset gate: when `cfg.session.consent` is a valid object (`hasResponse: true`, `services: <string>`), it's deep-copied into `aGTM.d.consent`, the hash is seeded, and a synchronous `call_cc()` fires at the end of `config()` so GTM injects on the first tick — no 500 ms `consent_listener` wait. Requires `consent_check` to already be defined; `consent_listener` does a second sync attempt after the CMP file loads as a safety net.
- `aGTM.f.run_cc('update')` hardening: snapshots `aGTM.d.consent` before the B2 reset; restores on `consent_check` returning false. Makes the periodic poll safe even when the CMP is briefly unavailable.
- Diff/POST: end of every successful `run_cc()` (init AND update). Computes the hash once, gates `aGTM_consent_update` + `consent_callback` on `last_consent_hash`, gates the POST on `consent_hash`. Hash advances only on 2xx so 5xx triggers an automatic retry on the next tick. Payload skips empty/null values to stay symmetric with the hash.

**Adaptive CMP poll:** most CMPs (CCM19, Cookiebot, Usercentrics, Klaro in GTM-mode, …) emit consent-update events via direct `window.dataLayer.push()`, bypassing `aGTM.f.fire()` and the `consent_events` matcher. Wrapping `dataLayer.push` was rejected as fragile (later wraps by gtag etc. clobber it). Instead, after the first successful init, aGTM polls `run_cc('update')` every `consent_poll_ms` (default 2000). Snapshot/restore + hash-gated emit make this safe and quiet. Set `consent_poll_ms = 0` to disable and trigger updates manually from a CMP callback.

### sGTM Client redesign (Phase 1 + Phase 3)

- Single Session API call replaces the previous presession + session two-step. Same `uid` is used for the read AND the cookie write — consent persisted under it on one page is found on the next.
- Server-side auto-denial: when no consent is on file but the visitor is returning (`counter > 0`), the Client constructs a denial-consent block (`hasResponse: true, services: ',aGTMconsent,', gtmConsent: <auto_deny_load_gtm>, blocked: <auto_deny_load_gtm>`) and embeds it in `cfg.session.consent`. Replaces the old client-side `aGTM.f.session_apply_denial()`.
- New POST handler at fixed path `/aGTMconsent`: manages the user-ID cookie AND persists the consent into the Session API record (`POST /tp/session/{tenant}/{uid}/consent`) so the next library load returns it.
- Path is fixed (`CONSENT_STORE_PATH = '/aGTMconsent'`); the browser-facing URL is built browser-side from `document.currentScript.src` so reverse-proxy setups work without server-side knowledge.
- New template options: `consent_store_enabled` (boolean, default true), `consent_store_enc` (boolean), `session_salt` (number), `auto_deny_load_gtm` (boolean, default true).
- `aGTMversion` bumped 1.6 → 1.5 to match the redesign target.

### Sources API integration (sGTM Client → api4sources)

- New: optional fire-and-forget POST to a Sources API on every aGTM.js request. The sGTM Client builds the payload (`user_id`, `page_location`, `referrer`, `timestamp`) from the integration code's `?c=` base64 (page URL + referrer) and the resolved session uid. Tenant is reused from `tenant_id`. POST runs in parallel with the aGTM.js response — no added latency on the library delivery.
- Race-free: the POST fires after the Session API step completes, so api4sources' `customer_sessions:{tenant}:{user_id}` Redis lookup hits the just-written session.
- New template options (sGTM Client): `sources_enabled` (boolean, default false), `sources_api_url` (text). Tenant is reused from the existing `tenant_id` field.
- The aGTM library itself is untouched — sources is purely server-side.
- Test client: `internal/api4sources/smoketest.tpl` (gitignored) extended with sources steps 5-8 (insert, dedup, referrer-change insert, no-active-session skip). Sources steps reuse the session created in step 1 (same Redis), so the original 4 session steps are the precondition; sources steps run only in auto-mode (`?auto=1` / `?format=json`), not in the manual single-step wizard.
- Smoketest: step 6 (sources-dedup) gained a configurable retry loop (`step6_max_attempts`, default 3) with no-op session GETs between attempts to mask api4sources eventual-consistency lag.
- Smoketest: step 3 (consent re-read) gained a `step3_warn_only` toggle (default on). Missing consent on the immediate re-read now produces a yellow `WARN` instead of a red `FAIL`, and the overall verdict can now be `PASS_WITH_WARN`. Rationale: production consent flow doesn't depend on this read — the CMP delivers consent later asynchronously. Hard Phase-0 semantics still available by unchecking the toggle.

### sGTM Client: Pre-aGTM Init Script + CMP Loader Pattern

- New template option group **Pre-aGTM Init Script** (`pre_init_enabled`, `pre_init_code`): a multi-line JavaScript field whose content is prepended verbatim to the `/aGTM.js` response, before the aGTM library is parsed. Wrapped in an IIFE inside `try/catch` — runtime errors are logged to the browser console as `[aGTM preInit]` and do not break aGTM. Syntax errors still abort parsing of the whole response, so the help text recommends syntax-checking before publishing.
- New documentation section **CMP Loader Pattern** (in `sgtmClient/README.md`): a separate Web GTM container with `noConsent: true` is the recommended way to load a CMP before aGTM checks consent (no shared blast radius, standard GTM workflow). The Pre-aGTM Init Script field is positioned as a fallback for cases where a separate container is not viable.

### Other v1.5 fixes and additions

- Bug fix: `consent_events` config option now wired up via `config()` (was never read from user config)
- Bug fix: `consent_events` indexOf check wrapped with commas — first event name in list was never matched
- Bug fix: `consent_event_attr` bracket-notation parser implemented in `config()` (`'event[attr:val]'` syntax now works); `consent_event_attr` initialised to `{}` to prevent TypeError
- Bug fix: `dlOrgPush: 'restore'` now works — code checked for `'replace'` but docs said `'restore'`
- Bug fix: `aGTM.f.proxySupport` called without `()` in `urlListener` — was always truthy, browser support check never ran
- Bug fix: `new URL()` (ES6) replaced with ES5-compatible equivalents in `gtm_load()`
- Bug fix: `stoptimer()` used wrong clear function — `rp===1` (setTimeout) now gets `clearTimeout`, all others get `clearInterval`
- Bug fix: `dlOrgPush` hook detection fired a false positive when gtag.js or a second GTM container re-wraps `dataLayer.push` — fixed by checking `/sandbox/i` on the new function and silently updating the baseline instead of firing an exception
- Performance: `dlOrgPush` check now uses reference equality (`!==`) as first guard instead of `toString()` comparison — `toString()` only called when the reference actually changed; result cached in `pushStr` and reused for both the sandbox check and the `fct_hook` field
- New event property `_noDLPush`: when `true` in a `fire()` call, the event is tracked internally (`aGTM.d.dl`, `aGTM.l`) and POST transport fires, but `sendnaus()` / `iFrameFire()` are skipped — the event is not pushed to the GTM dataLayer; `sendnaus_callback` is still called; combine with `_noConsent` and `_post` for Google-independent event transport
- New event properties documented: `_post`, `_noConsent` (already present, now in README event-properties table)
- iframe queue bug fixed: `iFrameFire()` now correctly queues to `aGTM.d.f`
- Consent polling interval changed from 1000ms to 500ms
- POST transport layer added: `aGTM.f.xsend()` for direct HTTP POST, `aGTM.f.enc()` for payload obfuscation
- New config options: `transport_url`, `transport_enc`, `transport_salt`
- `aGTM.f.xsend()` returns the `XMLHttpRequest` instance so callers can attach `onreadystatechange`
- aEvents sGTM Client Template: bug fix — `parsePlain()` now accepts already-parsed objects from POST body; null guard before `eventObj.consent` access; OPTIONS preflight handler added; POST body reading alongside GET query parameter support
- aEvents GTM Tag Template: new `bypassConsent` option routes via `aGTM.f.fire()` with `_noConsent: true + _noDLPush: true`; new `includeSession` option enriches events with `aGTM.d.session` fields; salt fallback reads `aGTM.c.transport_salt`/`session_salt` when no local salt configured
- Code: unused `var dl` removed from `sendnaus()`
- Docs: German inline comments in `ifHandshake()` translated to English
- Docs: `README.md` build instructions updated from npm to Bun
- Docs: `README-for-Developers.md` release flow now references `CHANGELOG.md` (not `README.md`)
- Docs: `README.de.md` added — German quickstart for GTM developers
- CMP `consent_check` short-circuit (`if (action == 'init' && hasResponse) return true;`) is now load-bearing for the preset-with-consent fast path; new test `cmp_short_circuit.test.js` enforces the pattern across all `cmp/cc_*.js` files
- Foundation for standalone aGTM usage without webGTM
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- GTM template files renamed (spaces instead of dashes)
- Build system migrated to Bun (`bunx terser`); no `npm install` required
- `VERSION` file as single source of truth for version number; build propagates to all files
- `sgtmClient/template.tpl` base64 payload and version auto-updated on each build
- Test suite grown from 75 to 134 tests across 13 files (`bun test`)
- Debug `console.log` removed from `urlListener`
- String obfuscation for Google identifiers unified

## Version 1.4.2 — *11.09.2025*
- CMP cookie-storage check added for Service/Vendor/Purpose
- Bot Check API added to sGTM template
- GTM Variable Templates added
- New CMPs: Shopware 5 Cookie, Shopware 6 Cookie
- Bugfix in OneTrust CookiePro Consent Check

## Version 1.4.1 — *04.07.2025*
- Improved Usercentrics v3 Consent Check
- New CMP: Shopify Consent
- Improved Click Listener
- aGTM Configurator added (thanks to marco.brenn@inbiz.de)

## Version 1.4 — *27.05.2025*
- `sStrf` function improved
- Click Listener Tag: outbound click bug fixed, configurable event name added
- Pageview Template: virtual pageview support added; event renamed from `vPageview` to `aPageview` (**breaking**), `vPageview` deprecated (removed in 2.0)
- dataLayer monitoring and restoring feature added (`dlOrgPush`)
- `aGTM.f.init()` removed from end of `aGTM.js` and `aGTM.min.js`
- New Base64 version `aGTM.base64` added

## Version 1.3 — *25.03.2025*
- sGTM Client Template added
- Custom `JSON.stringify` function to handle circular objects
- Fix for non-object dataLayer entries
- New CMPs: Secure Privacy, Perspective Funnel

## Version 1.2.2 — *10.02.2025*
- Exception handling for unexpected event objects
- Bugfix for initialization with legacy CMP functions
- MS Consent Mode bug fixed

## Version 1.2.1 — *22.01.2025*
- New and updated CMP functions
- Fix for missing `aGTM.n` object

## Version 1.2 — *07.11.2024*
- New GTM option `noConsent`: fire container without consent check
- New CMP option `none`: skip consent check entirely
- New setting `sendConsentEvent`
- aGTM can now load without injecting a container
- OptOut function added
- Bugfix for multiple GTM containers
- MS Consent Mode added to Consent Mode Template
- New CMP functions
- GTM templates moved into per-template subdirectories

## Version 1.1.3 — *27.06.2024*
- GTM PING filter in `fire` function
- New settings in GTM Repeat and Click Templates

## Version 1.1.2 — *19.06.2024*
- Bugfix for JS Error Listener
- New CMPs: Shopware Acris Cookie, Clickskeks

## Version 1.1.1 — *13.06.2024*
- Bugfix for DOMready/PAGEready listener and vPageview template

## Version 1.1 — *04.06.2024*
- Improved functions for GTM Custom Template usage
- New GTM Template: Pageview/State Events with device info and bot detection
- **Breaking:** default values of `dlStateEvents` and `vPageview` changed from `true` to `false`

## Version 1.0.1 — *28.05.2024*
- Bugfix in `config` function
- Documentation adjustments

## Version 1.0 — *10.04.2024*
- Initial release
