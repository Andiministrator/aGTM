# aGTM v1.5 — Manual Test Checklist

Run this before merging `dev` → `main`. Each test should be verified in a real browser.
Use the [Playground](../playground/index.html) for most of these, or a real test page.

Open the browser console and check `aGTM.d` after each step.

---

## 1 — Build System

| # | Test | Expected |
|---|------|----------|
| 1.1 | `./build.sh` runs without errors | All files built, no ERROR output |
| 1.2 | `VERSION` contains `1.5` | `cat VERSION` → `1.5` |
| 1.3 | `aGTM.js` header shows `@version 1.5` | Line 5 of aGTM.js |
| 1.4 | `aGTM.d.version` equals `1.5` at runtime | `aGTM.d.version === '1.5'` in console |
| 1.5 | `bun test` → all pass | `0 fail` (the pass count grows with every commit — do not pin it) |
| 1.6 | `sgtmClient/template.tpl` displayName shows `aGTM v1.5` | grep displayName template.tpl |

---

## 2 — Core Consent Flow

Setup: `cmp: 'cookiebot'` (or any CMP), one consent-gated GTM container.

| # | Test | Expected |
|---|------|----------|
| 2.1 | On page load before consent: GTM script tag absent | `document.getElementById('aGTM_tm_GTM-XXX')` → null |
| 2.2 | `aGTM.d.consent.hasResponse` before user decides | `false` |
| 2.3 | `aGTM.d.init` before consent | `false` |
| 2.4 | Events fired before consent via `aGTM.f.fire({event:'test'})` | `aGTM.d.f.length > 0`, dataLayer empty |
| 2.5 | After consent: GTM script tag present in DOM | `document.getElementById('aGTM_tm_GTM-XXX')` → element |
| 2.6 | After consent: `aGTM.d.init` | `true` |
| 2.7 | After consent: queued events replayed via hastyEvents | `aGTM_ready` event in dataLayer has `aGTM.hastyEvents` array |
| 2.8 | `aGTM.d.consent.gtmConsent` after consent | `true` |

---

## 3 — `cmp: 'none'` (no consent required)

| # | Test | Expected |
|---|------|----------|
| 3.1 | GTM injected immediately on `init()` | Script tag present, `aGTM.d.init === true` |
| 3.2 | `aGTM.d.consent.feedback` | `"No Consent Check configured"` |

---

## 4 — `noConsent: true` Container

Setup: two containers — one normal, one with `noConsent: true`.

| # | Test | Expected |
|---|------|----------|
| 4.1 | `noConsent` container loads immediately | Script tag for noConsent container present before consent |
| 4.2 | Normal container not loaded yet | Script tag for normal container absent |
| 4.3 | After consent: normal container loads | Both containers now present |
| 4.4 | `aGTM_ready` in noConsent container | `aGTMconsent.hasResponse` may be `false` at that point |

---

## 5 — `_noConsent` Event Property

| # | Test | Expected |
|---|------|----------|
| 5.1 | Before consent: `aGTM.f.fire({event:'test', _noConsent:true})` | Event in dataLayer immediately, NOT in `aGTM.d.f` queue |
| 5.2 | `_noConsent` visible in dataLayer event | `dataLayer[n]._noConsent === true` |
| 5.3 | Without `_noConsent`: event queued | `aGTM.d.f.length > 0`, not in dataLayer |

---

## 6 — POST Transport (`_post`, `xsend`, `enc`)

Setup: configure `transport_url` to a real or mock endpoint (e.g. requestbin.com or the playground mock).

| # | Test | Expected |
|---|------|----------|
| 6.1 | `aGTM.f.fire({event:'purchase', _post:true})` after consent | POST request sent to `transport_url` |
| 6.2 | POST body is `{"e":{...}}` when `transport_enc:false` | Check Network tab → request body |
| 6.3 | POST body is `{"q":"..."}` when `transport_enc:true, transport_salt:42` | Body starts with `{"q":"` |
| 6.4 | `_post_sent` set to `true` after send | `dataLayer[n]._post_sent === true` |
| 6.5 | Before consent: `_post` event without `_noConsent` → queued, no POST yet | No request in Network tab, `aGTM.d.f` has event |
| 6.6 | `_post: {url:'...', enc:true, salt:7}` overrides global config | Request goes to per-event URL |
| 6.7 | Salt priority: per-event → transport_salt → session_salt | Set all three, check which one is used |

---

## 7 — Session preset (sGTM Client `cfg.session`)

Setup: load aGTM via the sGTM Client OR call `aGTM.f.config({ session: {...} })` directly with the shapes below. v1.5 redesign — see [SESSION-REDESIGN.md](../SESSION-REDESIGN.md).

| # | Test | Expected |
|---|------|----------|
| 7.1 | No `cfg.session` supplied | `aGTM.d.session_status === ''`, `aGTM.d.session === {}` |
| 7.2 | `cfg.session = { sid: 's-1' }` (sid only) | `aGTM.d.session.sid === 's-1'`, `session_status === 'preset'`, CMP path proceeds normally |
| 7.3 | `cfg.session = { uid: 'u-1' }` (uid alone) | Ignored — `session_status === ''`, no preset |
| 7.4 | `cfg.session = 'invalid'` (not an object) | Ignored — `session_status === ''` |
| 7.5 | `cfg.session.consent = { hasResponse: true, services: ',svc,' }` | Seeded into `aGTM.d.consent`, `consent_hash` non-empty, `session_status === 'preset_with_consent'`, GTM injects on first tick (no 500 ms wait) |
| 7.6 | `cfg.session.consent = null` / `{}` / missing `hasResponse` | Ignored — falls back to `'preset'` (or `''` if no `sid`) |
| 7.7 | `cfg.session.consent.gtmConsent: false` (server-side denial denying GTM) | `aGTM.d.consent.gtmConsent === false`, `aGTM.d.init` stays `false`, GTM does not load — CMP can still update later |
| 7.8 | Deep-copy: mutate `src` after `config(src)` | `aGTM.d.session` unchanged |

---

## 8 — Server-side auto-denial (sGTM Client)

Setup: clear cookies, reload page so the Session API returns `counter > 0` with no stored consent.

| # | Test | Expected |
|---|------|----------|
| 8.1 | `aGTM.d.consent.hasResponse` after page load | `true` (preset by sGTM Client) |
| 8.2 | `aGTM.d.consent.feedback` | `"Consent denied by aGTM"` |
| 8.3 | `aGTM.d.consent.services` | `",aGTMconsent,"` |
| 8.4 | `aGTM.d.consent.blocked` | `true` (mirrors `gtmConsent`) |
| 8.5 | GTM still loads (default `auto_deny_load_gtm: true`) | Script tag present, `aGTM.d.init === true` |
| 8.6 | `auto_deny_load_gtm: false` in template UI | GTM script tag absent |
| 8.7 | User accepts in CMP banner → poll catches it (≤ `consent_poll_ms`) | `aGTM.d.consent.services` updated, `session_status === 'synced'` |
| 8.8 | User declines in CMP banner | Same as 8.7 — `gtmConsent` becomes `false`, GTM tags react via Consent Mode |

---

## 9 — Consent diff/store (`consent_store_url`)

Setup: `consent_store_url` set (auto via sGTM Client checkbox, or manual config). DevTools Network tab open.

| # | Test | Expected |
|---|------|----------|
| 9.1 | First visit, no preset, user accepts CMP | One POST to `<sgtm-host>/<prefix>/aGTMconsent` with `{uid, sid, consent:{...}}`, status 200 → `session_status === 'synced'`, `consent_hash` non-empty |
| 9.2 | Second visit, preset matches CMP | No POST — `session_status === 'confirmed'` |
| 9.3 | Second visit, user changes consent in CMP | Poll catches change ≤ `consent_poll_ms`, one POST with new consent, `session_status === 'synced'` |
| 9.4 | Server returns 404/500 | `consent_hash` unchanged, retry on next poll tick (every `consent_poll_ms`) |
| 9.5 | `consent_store_enc: true` + `session_salt: 42` | POST body shape `{"q":"..."}` (obfuscated), not `{"e":{...}}` |
| 9.6 | `consent_poll_ms: 0` | No poll timer (`aGTM.d.timer.consent_poll === undefined`); `aGTM.f.run_cc('update')` from CMP callback still triggers POST |
| 9.7 | URL via reverse-proxy (`/rp/tp/aGTM.js`) | `aGTM.c.consent_store_url === 'https://<host>/rp/tp/aGTMconsent'` (built browser-side from `currentScript.src`) |

---

## 10 — Consent Timer & Polling

| # | Test | Expected |
|---|------|----------|
| 10.1 | Timer interval is ~500ms | Check via `aGTM.d.timer.consent` in console right after init |
| 10.2 | Timer cleared after consent | `aGTM.d.timer.consent` → undefined after consent |

---

## 11 — Edge Cases

| # | Test | Expected |
|---|------|----------|
| 11.1 | Opt-out via URL `?aGTMoptout=1` | GTM not loaded, `aGTMoptout` cookie set |
| 11.2 | Opt-out removed via `?aGTMoptout=0` | Cookie cleared |
| 11.3 | `aGTM.f.fire()` with non-object | Logged as e9, no crash |
| 11.4 | Multiple `aGTM.f.config()` calls | Second call ignored (e1 logged) |
| 11.5 | `dlStateEvents:true` | `aDOMready` and `aPAGEready` events appear in dataLayer |
| 11.6 | `aPageview:true` | `aPageview` event fires after GTM load |
| 11.7 | `vPageviews:true` + SPA navigation | `vPageview` event fires on URL change |

---

## 12 — Build Version Propagation

| # | Test | Expected |
|---|------|----------|
| 12.1 | Change `VERSION` to `1.6-pre`, run `./build.sh` | All version strings updated |
| 12.2 | `aGTM.d.version` at runtime | `'1.6-pre'` |
| 12.3 | `sgtmClient/template.tpl` displayName | `"aGTM v1.6-pre"` |
| 12.4 | `package.json` version | `"1.6-pre"` |
| 12.5 | Revert to `1.5`, rebuild | Back to `1.5` everywhere |

---

## Notes

- For session endpoint mocking: use the [Playground](../playground/index.html) which has a built-in mock
- For POST endpoint mocking: use [requestbin.com](https://requestbin.com) or the Playground mock
- For GTM verification: the Playground's fake GTM shows all dataLayer events
- Check `aGTM.l` (decoded via `aGTM_debug.js`) for internal error/success log
