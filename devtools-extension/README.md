# aGTM Inspector — Chrome DevTools Extension

A read-only DevTools panel that surfaces aGTM's internal state live while you build,
validate, or debug a tracking integration: the consent lifecycle, the event
queue/replay, GTM injection, session & attribution, the effective config, and the
aGTM-relevant network calls.

It is the human-facing companion to the `live-inspector` Claude Code skill.

> **Status:** MVP (v0.1.0). Part of aGTM v1.5. Read-only — it never writes to the page.

## What it shows

| Tab | Source in `window.aGTM` | Purpose |
|---|---|---|
| **Consent** | `aGTM.d.consent`, `aGTM.d.session_status`, `consent_hash`/`last_consent_hash`, `aGTM.c.cmp` | Does GTM load, and why / why not? |
| **Events** | `aGTM.d.f` (queue), `aGTM.d.dl` (dispatched), `aGTM.l` (decoded log) | Event stream, queued-until-consent, `_noConsent`/`_noDLPush`/`_post` flags |
| **GTM** | `aGTM.d.init`, `aGTM.c.gtm`, `aGTM.d.gtmLoaded` | Container injection status & order |
| **Session** | `aGTM.d.session.source`, `aGTM.d.attribution.<method>.*` | Session source & attribution |
| **Config** | `aGTM.c` + highlighted config traps | Static setup audit |
| **Netzwerk** | `chrome.devtools.network` | gtm.js / `/aGTMconsent` / `/aGTM.js` / sources / GA hits |

## How it works (and why it needs no permissions)

The panel reads the page **only** through `chrome.devtools.inspectedWindow.eval()`
(running `reader.js` in the page context and returning a JSON-serialisable snapshot)
and observes traffic through `chrome.devtools.network`. Both are inherent to a
`devtools_page` — so `manifest.json` declares **no** `permissions` and **no**
`host_permissions`. That keeps the review surface minimal if it is ever published to
the Chrome Web Store.

The panel polls the reader every ~700 ms and re-renders. `reader.js` is defensive:
if `window.aGTM` is absent or half-initialised it returns `{loaded:false}` and the
panel shows a hint instead of throwing.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select this `devtools-extension/` folder.
4. Open DevTools (F12) on any page → the **aGTM** panel.

No Chrome Web Store account needed. Updating = edit files → **Reload** on the
extensions page → reopen DevTools.

## Files

```
manifest.json   MV3, no permissions, registers a devtools_page
devtools.js     registers the "aGTM" panel
panel.html      panel UI + styles (light/dark aware)
panel.js        poll loop, six renderers, network capture
reader.js       page-context snapshot expression (eval'd, read-only, ES5-safe)
logmap.js       aGTM.l decode table (copy of aGTM_debug.js's logmap)
icons/          16 / 48 / 128 px placeholder icons
```

## Caveats

- The `logmap.js` decode table is a **copy** of `aGTM.d.logmap` from `aGTM_debug.js`.
  If that map changes, update this copy (a build-time sync could automate it later).
- The panel reflects aGTM's internal `aGTM.d` shape; it reads defensively and
  version-gates on `aGTM.d.version`, but a future internal rename may need a tweak here.
- Decoded log (`aGTM.l`) is only populated when logging is active / `aGTM_debug.js`
  is loaded on the page.

## License

Apache-2.0 — same as aGTM.
