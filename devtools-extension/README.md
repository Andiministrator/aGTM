# aGTM Inspector — Chrome DevTools Extension

A read-only DevTools panel that surfaces aGTM's internal state live while you build,
validate, or debug a tracking integration: the consent lifecycle, the event
queue/replay, GTM injection, session & attribution, the effective config, and the
aGTM-relevant network calls.

It is the human-facing companion to the `live-inspector` Claude Code skill.

> **Status:** MVP. The extension version is **coupled to the aGTM library version**
> (currently 1.5) — `scripts/inject-version.js` writes `manifest.json` from `VERSION`
> on every build. Read-only — it never writes to the page.

## What it shows

| Tab | Source in `window.aGTM` | Purpose |
|---|---|---|
| **Diagnose** | aggregates the other tabs (config traps + pre-consent leaks + consent presence + GTM injection) plus `reader` timestamps (`navStart`, `aGTM.l`, `aGTM.d.dl`, network capture) | At-a-glance overview instead of clicking through every tab. **(1) Health-Score** — a pass/warn/fail traffic-light aggregating the known failure modes (consent mechanism, consent recognised, GTM injected, pre-consent leaks, config traps) into one readout with a per-check list. **(2) Consent-Timeline** — a ms-stamped waterfall (page load → `config()` → CMP decision → GTM inject → first tag fire) that answers *"why did X fire before consent"* visually, plus a **"waiting on"** block showing the milestones aGTM is still blocked on and the events that unblock them (the CMP decision + its `consent_events` triggers, queued events awaiting replay, a polling DL-Repeat gate). **(3) Compliance-Report** — a one-click shareable snapshot (**Markdown/JSON** to clipboard, or `.md` download) built from leaks + consent flow + config traps + `consent_check` status, for the consulting/hand-off scenario. **(4) Session & IDs** — current `sid`/`uid`/CRM `user_id` with a first-observed timestamp **and a live change history** (from → to, timestamped, **persisted per host**) so the v1.5 F→C user-id promote (`F.…` → `C.…` after consent) is visible as it happens; plus the Session-API payload from the `/aGTM.js` request as a **KPI stat-tile row** (returning-visitor from `sessionCount`, events-per-pageview engagement, live session age from the authentic server `created` time) — clearly flagged as a **page-load snapshot** (the counters don't advance during the page; only the age is live) |
| **Consent** | `aGTM.d.consent`, `aGTM.d.session_status`, `consent_hash`/`last_consent_hash`, `aGTM.c.cmp`, `google_tag_data.ics`, dataLayer `consent` commands, vendor globals | Does GTM load, and why / why not? Plus a **Google Consent Mode sequence** (declare/implicit → default → update in order, with the final per-category state + timestamp, `update > default > declare/implicit`) and a **non-Google vendor box** detecting TCF/GPP/USP/GPC + Meta/UET/TikTok/LinkedIn/Pinterest/Amazon/Criteo, the consent signal each expects, and the state that's synchronously readable (GPC, `euconsent-v2`/`usprivacy`/`amzn_consent` cookies). Consent-command rows expand into the full sent payload |
| **Events** | `aGTM.d.f` (queue), `aGTM.d.dl` (dispatched), `aGTM.l` (decoded log) | Event stream, queued-until-consent, `_noConsent`/`_noDLPush`/`_post` flags. Rows are **click-to-expand** into a syntax-highlighted full object. The decoded log is **bundled by id+event with a count** (so the ~2s consent poll's repeated `m2`/`m3` collapse into one counted row) and shows *which event* (`obj.event`) each entry belongs to. Once consent is present the queue is relabelled as **history** (its events were already replayed as `hastyEvents`). |
| **GTM** | `aGTM.d.init`, `aGTM.c.gtm`, `aGTM.d.gtmLoaded` | Container injection status & order, live `dataLayer` length, per-container load mode (Google / custom-sGTM / inline base64 + env), and the **actual injected `<script>` tags** (DOM-level proof + load domain) |
| **dataLayer** | `window[gdl]` | The **real GTM dataLayer** contents (click-to-expand), each push **colour-categorised** (aGTM / GTM / E-Commerce / Pageview / Consent / gtag / Message) and badged by its aGTM relationship: **via aGTM** (`aGTMts` → came through `aGTM.f.fire()`), **repeated** (DL-Repeat tag), `_noConsent`/`_post` |
| **Session** | `aGTM.d.session`, `aGTM.d.attribution.<method>.*`, `window.se_data` | Session source & attribution, syntax-highlighted. Falls back to a site's `window.se_data` object when `aGTM.d.session` is empty |
| **Config** | `aGTM.c` + highlighted config traps | The **effective** config in effect after `config()` (defaults + integrator + sGTM-Client injection), syntax-highlighted, plus known config-trap warnings and a **runtime-diff** (first snapshot → current) showing what aGTM derived/changed at runtime |
| **Netzwerk** | `chrome.devtools.network` | gtm.js / `/aGTMconsent` / `/aGTM.js` / sources / GA hits, **plus** event/collect POSTs to the sGTM (aEvents pipeline) — matched by host + learned path-prefix so first-party traffic isn't swept in under reverse-proxy setups. A **pre-consent leak banner** flags any tracking/marketing request (Google tags + Meta/TikTok/UET/LinkedIn/Pinterest/Criteo/Snap/X/Clarity/… pixels) that fired while `gtmConsent` was still false, with a per-row `⚠ pre-consent` badge (reconciled against the consent timestamp so a hit right after "Accept" isn't false-flagged). A **consent fingerprint** — a compact per-category granted/denied/unset pill cluster decoded from the request's `gcs`/`gcd` params — is shown inline in the list (also on dataLayer consent-command rows). A **search box** (prefix `-` to exclude, e.g. `-clarity`) + per-host checkboxes to filter, **smart URL** (dimmed host, emphasised path, key params as chips), the request's **event name** (`en`) and **property/measurement/stream ID** (`id`/`tid`) under the type badge, a **payload preview** (gzip bodies auto-decompressed via `DecompressionStream`; **aEvents** `?e=`/`?q=` payloads decoded — obfuscated ones by brute-forcing the 63 Caesar shifts, no salt needed), and rows **click-to-expand** into separate collapsible sub-sections (General · **Consent-Signale gcs/gcd decoded** · Query-String · Request-/Response-Header · Payload · aEvents entschlüsselt) |

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

**Prefer a ZIP?** A packaged `aGTM-Inspector.zip` lives at the repo root — download
it, unzip, and **Load unpacked** the extracted `aGTM-Inspector/` folder. Regenerate
it after any change with `./scripts/pack-devtools-extension.sh` (the ZIP is a derived
artifact and must be rebuilt so it doesn't drift from source).

## Files

```
manifest.json   MV3, no permissions, registers a devtools_page
devtools.js     registers the "aGTM" panel
panel.html      panel UI + styles (light/dark aware)
panel.js        poll loop, seven renderers, network capture, row expand/collapse
reader.js       page-context snapshot expression (eval'd, read-only, ES5-safe)
netclassify.js  network classification + tracker/leak detection (browser global + node-require, unit-tested)
consentsignals.js  gcs/gcd Consent-Mode signal decoders (browser global + node-require, unit-tested)
diagnose.js     Diagnose-tab aggregation: health-score, consent-timeline, compliance-report (browser global + node-require, unit-tested)
jsonview.js     pure JSON syntax highlighter (browser global + node-require, unit-tested)
logmap.js       aGTM.l decode table (copy of aGTM_debug.js's logmap)
icons/          the aGTM brand icon (16 / 48 / 128, resized from assets/aGTM.png)
```

## Caveats

- The `logmap.js` decode table is a **copy** of `aGTM.d.logmap` from `aGTM_debug.js`.
  If that map changes, update this copy (a build-time sync could automate it later).
- The panel reflects aGTM's internal `aGTM.d` shape; it reads defensively and
  version-gates on `aGTM.d.version`, but a future internal rename may need a tweak here.
- Decoded log (`aGTM.l`) is only populated when logging is active / `aGTM_debug.js`
  is loaded on the page.
- The Diagnose **pre-consent-leak** health-check only reports a green *pass* when the
  pre-consent window was actually observed (a navigation was witnessed, or the capture
  began at page load). Open the panel and **reload** the page for a trustworthy result;
  otherwise the check stays **N/A** rather than a false green. A *captured* leak is always
  flagged regardless. The **Consent-Timeline** likewise needs the reload to time the page
  load → CMP-decision → inject sequence (its markers come from `aGTM.l`/`aGTM.d.dl`
  timestamps + the network capture, which only records from when the panel opened).

## License

Apache-2.0 — same as aGTM.
