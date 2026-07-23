---
name: live-inspector
description: >
  Drive a REAL browser to run a live end-to-end aGTM check on a URL — walk the
  consent flow (accept/deny), prove GTM injects only after consent, confirm queued
  events replay into the dataLayer, verify network calls (gtm.js domain, consent
  store, sGTM), and capture what a CMP exposes at runtime. Requires a connected
  browser tool (the Claude-in-Chrome extension via `claude --chrome`, or the Chrome
  DevTools MCP). Use when someone wants to actually exercise/verify a LIVE aGTM
  integration on a page — not just audit a pasted config (that's integration-check).
---

# aGTM — Live browser inspection & consent-flow verification

This skill **drives a real browser** to exercise an aGTM integration end-to-end. It
is the active counterpart to `integration-check` (which diagnoses from provided
state). Reach for it when a browser tool is connected and you want to *do* the
consent flow, not just read a snapshot.

## Precondition — a connected browser tool

Confirm one is available: run `/mcp` → pick the browser server → **View tools**.
You want a tool that **evaluates JavaScript in the page and returns the result**
(`evaluate_script`) plus navigate / click / read-console / read-network. Both of
these provide it:

- **Claude-in-Chrome extension** — start Claude Code with `claude --chrome` (needs a
  paid Anthropic plan + `/login` auth, Chrome/Edge/Chromium, not WSL).
- **Chrome DevTools MCP** — `evaluate_script` + deeper network/performance tools.

If none is connected, say so and fall back to `integration-check` (guided console
snippets). Tool **names** vary by provider — discover the exact ones via View tools;
the snippets below are the JS you pass to whichever `evaluate_script`-equivalent exists.

## Safety (read this first)

- Only run against **trusted / staging / your own** pages. Driving a real browser
  shares your logged-in sessions; a hostile page is a prompt-injection surface.
- Keep every `evaluate_script` **read-only** — read `aGTM.d.*`/`window.dataLayer`;
  do **not** call functions that mutate state or fire test conversions on production.
- `evaluate_script` counts as a state-changing call, so in plan mode it prompts for
  approval — expected.

## The ground-truth probe (one read-only expression)

Pass this to `evaluate_script`; its return value is authoritative (screenshots/DOM
are secondary):

```js
JSON.stringify({
  present:    typeof window.aGTM !== 'undefined',
  init:       !!(window.aGTM && aGTM.d.init),
  gtmConsent: !!(window.aGTM && aGTM.d.consent && aGTM.d.consent.gtmConsent),
  hasResponse:!!(window.aGTM && aGTM.d.consent && aGTM.d.consent.hasResponse),
  queued:     (window.aGTM && aGTM.d.f) ? aGTM.d.f.length : null,
  dlLen:      window.dataLayer ? window.dataLayer.length : null,
  gtmInDom:   document.querySelectorAll('script[src*="/gtm.js"]').length,
  sessStatus: (window.aGTM && aGTM.d.session_status) || ''
})
```

## Playbook A — consent flow, end to end (the headline check)

1. **Navigate** to the URL (use a fresh/incognito-like state so the CMP prompt shows).
2. **Pre-consent snapshot** (probe above). Assert for a consent-gated setup:
   `present:true`, `init:false`, `gtmConsent:false`, `gtmInDom:0`. Any queued
   events sit in `queued > 0`. **GTM must not be loaded before consent** — if it is,
   that's the finding.
3. **Accept path:** click the CMP's *accept* control (locate it via a DOM snapshot /
   `find`). Re-probe. Assert: `hasResponse:true`, `gtmConsent:true`, `init:true`,
   `gtmInDom ≥ 1`, and the previously queued events now appear in `window.dataLayer`
   (replayed via the `aGTM_ready` / `hastyEvents` path). 
4. **Deny path:** in a fresh session (clear the consent cookie or a new profile),
   click *deny*. Assert GTM stays blocked: `gtmConsent:false`, `init:false`, no
   gtm.js request. (If a `gtm*` requirement is configured, partial consent that
   misses it must also stay blocked — fail-closed.)
5. **Report** a transition table (pre → accept → deny) and flag any assertion whose
   actual value didn't match, quoting the value.

## Playbook B — event / dataLayer verification

After consent, trigger a tracked interaction (click a tracked button, submit a
form) and re-read `window.dataLayer` and `aGTM.d.dl`. Confirm the expected event
fired **with the right parameters**. This validates the GTM tag templates
(click/form/scroll/timer/pageview) against a real page, not just unit tests.

## Playbook C — capture a CMP's runtime shape (feeds `cmp-integration`)

To author or fix a CMP `consent_check`, you need the CMP's real global structure.
After accept, and again after deny, evaluate the CMP global and dump its shape, e.g.:

```js
JSON.stringify(window.Cookiebot && window.Cookiebot.consent)   // Cookiebot
// or: window.UC_UI && UC_UI.getServicesBaseInfo && UC_UI.getServicesBaseInfo()
// or: window.__ucCmp, window.CCM, window.Shopify, window.sp … (CMP-specific)
```

Capture the keys / consent arrays / IDs the CMP exposes in each state → that is
exactly what `consent_check` must map into `aGTM.d.consent`. Hand the captured shape
to `cmp-integration`.

## Playbook D — network & sGTM verification

Read the page's network requests and confirm:
- `gtm.js` loaded from the **expected domain** — default `www.googletagmanager.com`,
  or the custom `gtmURL` / sGTM domain (this catches the sGTM case a DOM-only probe
  misses).
- On a consent change, the consent-store **POST** fired (path ends `/aGTMconsent`)
  when `consent_store_url` is configured.
- For an sGTM-served setup, `/aGTM.js` was served (and carries the library).

## Playbook E — health snapshot / report

Compose a structured snapshot for a page: effective `aGTM.c` (config), consent
object, `init`, containers loaded, dataLayer length, and a network summary. Useful
as a before/after artifact around a library upgrade. Save it to disk if the browser
tool supports it.

## Decode the debug log (optional deep dive)

`aGTM.l` is aGTM's encoded internal log. `aGTM_debug.js` (repo root) decodes it in
the console for a step-by-step trace of what the library did and when — use it when
the state alone doesn't explain a failure.

## Output

Lead with pass/fail per assertion and quote the actual `aGTM.d.*` values that prove
each. Add a screenshot only when it clarifies (e.g. the CMP banner state). If a
browser tool was **not** available, say so and hand off to `integration-check`.

## Related skills

- No browser connected → `integration-check` (guided console snippets / static audit).
- Building or adjusting a config → `config-builder`.
- Writing/fixing a CMP adapter → `cmp-integration` (Playbook C here captures the CMP
  shape it needs).
