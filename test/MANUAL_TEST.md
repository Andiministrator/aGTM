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
| 1.5 | `bun test` → all pass | `79 pass, 0 fail` |
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

## 7 — Session Feature

Setup: configure `user_id:'u-test'`, `session_url` pointing to playground mock or requestbin.

| # | Test | Expected |
|---|------|----------|
| 7.1 | `aGTM.d.session_status` immediately after init (before response) | `""` |
| 7.2 | Feature inactive when `user_id` missing | `aGTM.d.session_status === 'inactive'`, `aGTM.d.session_ready === true` |
| 7.3 | Feature inactive when `session_url` missing | Same |
| 7.4 | Valid response: `aGTM.d.session` populated | `aGTM.d.session.sid` present |
| 7.5 | Valid response: `session_status === 'ok'` | Check in console |
| 7.6 | Response without `sid`: `session_status === 'invalid'` | |
| 7.7 | Network error / non-2xx: `session_status === 'error'` | |
| 7.8 | Timeout (set `session_timeout:500`, slow mock): `session_status === 'timeout'` | |
| 7.9 | Payload sent to session endpoint contains `user_id`, `url`, `ref` | Check Network tab |
| 7.10 | `session_salt >= 1`: payload is encrypted `{"q":"..."}` | Check Network tab |

---

## 8 — Auto-Denial

Setup: session endpoint returns `{sid:'s1', ret:true, cst:false}`.

| # | Test | Expected |
|---|------|----------|
| 8.1 | `aGTM.d.consent.hasResponse` after session | `true` |
| 8.2 | `aGTM.d.consent.feedback` | `"Consent denied by aGTM"` |
| 8.3 | `aGTM.d.consent.services` | `",aGTMconsent,"` |
| 8.4 | GTM still loads (default `session_gtm_on_deny:true`) | Script tag present |
| 8.5 | `session_gtm_on_deny:false`: GTM not loaded | Script tag absent |
| 8.6 | CMP fires real decline after auto-denial | `gtmConsent` becomes `false`, GTM tags react |
| 8.7 | CMP fires real accept after auto-denial | `gtmConsent` becomes `true` |

---

## 9 — `session_wait: true`

| # | Test | Expected |
|---|------|----------|
| 9.1 | GTM not loaded until session AND consent both ready | Monitor init during load |
| 9.2 | Session arrives before consent: GTM waits for consent | `aGTM.d.init` still `false` |
| 9.3 | Consent before session: GTM waits for session | `aGTM.d.init` still `false` |
| 9.4 | Both ready: GTM loads | `aGTM.d.init === true` |
| 9.5 | Timeout fires: GTM proceeds after `session_timeout` ms | Even without valid session response |

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
