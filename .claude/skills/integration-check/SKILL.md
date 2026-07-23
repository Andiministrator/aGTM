---
name: integration-check
description: >
  Diagnose and audit an aGTM integration — why GTM isn't loading, why consent
  isn't recognised, why an event never reaches the dataLayer — and check a setup
  against the known traps. Use this skill for any "it's not working" / "is my aGTM
  setup correct?" question. Works from a pasted config (static audit) or from
  runtime state collected on the live page (console snippets, or a browser tool if
  one is connected).
---

# aGTM — Diagnose & audit an integration

Two modes; use whichever the situation allows. Prefer runtime state when a live
page is available — it turns guesses into facts.

## Collecting the live runtime state

**There is no built-in browser control here.** `WebFetch` only retrieves static
HTML (no JavaScript runs, so `window.aGTM` is never populated) — it cannot read a
live integration's state. Two viable paths:

1. **Guided console (default):** ask the user to open the page, open DevTools →
   Console, and paste back the output of the snippets below.
2. **Connected browser tool:** if a browser-automation MCP/extension is connected
   to this session, use it instead of copy-paste. For evaluating the `window.aGTM.*`
   expressions below directly and reading the result, the **Chrome DevTools MCP**
   (`evaluate_script`) is the surest fit. The official **Claude-in-Chrome** extension
   (`claude --chrome`) drives a real Chrome and reads DOM/console/network — great for
   "did GTM inject / any console errors", though it is oriented to page/console reads
   rather than arbitrary JS evaluation. Check your available tools first; if none is
   present, fall back to path 1 and say so plainly.

### Console snippets (user pastes the results)

```js
// 0. Did aGTM itself load?  'MISSING' = the library never ran (wrong src/path,
//    404, blocked, or wrong script order) — fix that before anything else.
typeof window.aGTM === 'undefined' ? 'MISSING' : 'loaded'
// 1. Consent state — the gate that decides whether GTM loads
JSON.stringify(aGTM.d.consent, null, 2)
// 2. Did GTM inject?  true once a container was inserted
aGTM.d.init
// 3. Effective config actually in use
JSON.stringify(aGTM.c, null, 2)
// 4. Events that went THROUGH aGTM.f.fire()
aGTM.d.dl
// 5. Events queued before consent (waiting for replay)
aGTM.d.f
// 6. Session / consent-store status (v1.5)
JSON.stringify({ status: aGTM.d.session_status, session: aGTM.d.session })
// 7. The real dataLayer (use aGTM.c.gdl's value if custom, default 'dataLayer')
window.dataLayer
// 8. Is a GTM script tag actually in the DOM?  NOTE: matches any *.gtm.js load;
//    still, sGTM/custom-domain setups vary — trust snippet #2 (aGTM.d.init) as the
//    authoritative "did GTM inject?" signal, not this DOM probe.
document.querySelectorAll('script[src*="/gtm.js"]').length
```

The encoded log `aGTM.l` is decoded by loading `aGTM_debug.js` in the console
(see that file's header) — useful for a step-by-step trace of what the library
did and when.

## Failure modes → what to check

**aGTM itself never loaded (`typeof window.aGTM === 'undefined'`):** check this
first — every `aGTM.d.*` snippet throws `ReferenceError` in this state. The library
script 404'd, was blocked (CSP / ad-blocker), the `src`/`path` is wrong, or the tag
order is broken (`config()`/`init()` ran before `aGTM.js`). Fix loading before
anything else applies.

**GTM never loads (`aGTM.d.init` stays `false` / no gtm.js in DOM):**
- `aGTM.d.consent.gtmConsent` is `false` → the gate is closed. Then:
  - No consent decision yet — the CMP hasn't resolved (check the CMP's own state /
    that its script is present before aGTM checks it; see the CMP Loader Pattern in
    `sgtmClient/README.md`).
  - A requirement is configured (`gtmServices`/`gtmPurposes`/`gtmVendors`) but the
    granted categories don't satisfy it → gate correctly stays closed (fail-closed).
  - `cmp` value is wrong (must be an exact slug from `cmp/README-cmp.md`, not a
    display name) → the consent adapter never loads → `hasResponse` never becomes
    `true`.
- An opt-out cookie/param is set (`aGTM.f.optout` aborted init).
- `config()`/`init()` missing or in the wrong order (see `config-builder`).

**Consent decision not picked up (user accepted, nothing changes):**
- The CMP signals via a dataLayer event, but `consent_events` doesn't list that
  exact event name → the update matcher never fires. Fix the name(s).
- The CMP pushes updates **directly** to the dataLayer (bypassing
  `aGTM.f.fire()`), so `consent_events` can't catch it → needs the periodic poll
  (`consent_poll_ms > 0` **and** `consent_store_url` set), or a manual
  `aGTM.f.run_cc('update')` from a CMP callback.
- `useListener` semantics: with a manual listener, the integrator must call
  `aGTM.f.call_cc()` themselves.

**An event never reaches the dataLayer:**
- It's sitting in `aGTM.d.f` (fired before consent, awaiting replay) and the replay
  path isn't set up → check the queue vs. `window.dataLayer`.
- The event carries `_noDLPush: true` → intentionally not pushed (it's still in
  `aGTM.d.dl`/`aGTM.l`).
- A custom dataLayer name (`gdl`) mismatch → you're inspecting the wrong array.

**Other traps:**
- Deprecated `vPageview` in use instead of `aPageview`.
- Custom `consent_check`/config code with ES6 (arrow/`let`/`const`/…) placed where
  ES5 is required.
- Consent Mode wiring: the Consent-Mode signal (`aGTM.d.cm`) is written by the
  Consent-Mode **tag**, not the library — an ordering race can read all-denied if
  evaluated too early.

## Static audit (no live page)

Given just a pasted `aGTM.f.config({…})` / integration snippet, audit it against the
failure modes above plus: `config()` precedes `init()` and `init()` is actually
called; the `cmp` value is an exact slug from `cmp/README-cmp.md`; `consent_events`
matches the CMP's real event name(s); no deprecated `vPageview`. Report each finding
with its concrete fix. Reference `README.md` for authoritative option semantics
rather than asserting from memory.

## Output

Lead with the single most likely cause, then the ordered checks to confirm it, then
the fix. When you relied on runtime state, quote the exact value that proved it
(e.g. `aGTM.d.consent.gtmConsent === false`).
