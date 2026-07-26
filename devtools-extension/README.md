# aGTM Inspector — Chrome DevTools Extension

A read-only DevTools panel that surfaces aGTM's internal state live while you build,
validate, or debug a tracking integration: the consent lifecycle, the event
queue/replay, GTM injection, session & attribution, the effective config, and the
aGTM-relevant network calls.

It is the human-facing companion to the `live-inspector` Claude Code skill.

> **Status:** MVP. The extension version is **coupled to the aGTM library version**
> (currently 1.5) — `scripts/inject-version.js` writes `manifest.json` from `VERSION`
> on every build. **Read-only by default** — every tab except **Simulation** only
> reads the page. The Simulation tab is an explicit, opt-in exception (a per-session
> "Write-Modus" toggle, off by default) that drives the page for testing; see
> [Simulation & the write channel](#simulation--the-write-channel) below.

## What it shows

| Tab | Source in `window.aGTM` | Purpose |
|---|---|---|
| **Diagnose** | aggregates the other tabs (config traps + pre-consent leaks + consent presence + GTM injection) plus `reader` timestamps (`navStart`, `aGTM.l`, `aGTM.d.dl`, network capture) | At-a-glance overview instead of clicking through every tab. **(1) Health-Score** — a pass/warn/fail traffic-light aggregating the known failure modes (consent mechanism, consent recognised, GTM injected, pre-consent leaks, config traps) into one readout with a per-check list. **(2) Consent-Timeline** — a ms-stamped waterfall (page load → `config()` → CMP decision → GTM inject → first tag fire) that answers *"why did X fire before consent"* visually, plus a **"waiting on"** block showing the milestones aGTM is still blocked on and the events that unblock them (the CMP decision + its `consent_events` triggers, GTM injection when consent is granted but no container is in the DOM yet, queued events awaiting replay, a polling DL-Repeat gate with its awaited gate spec). **(3) Compliance-Report** — a one-click shareable snapshot (**Markdown/JSON** to clipboard, or `.md` download) built from leaks + consent flow + config traps + `consent_check` status, for the consulting/hand-off scenario. **(4) Session & IDs** — current `sid`/`uid`/CRM `user_id` with a first-observed timestamp **and a live change history** (from → to, timestamped, **persisted per host**) so the v1.5 F→C user-id promote (`F.…` → `C.…` after consent) is visible as it happens; plus the Session-API payload from the `/aGTM.js` request as a **KPI stat-tile row** (returning-visitor from `sessionCount`, events-per-pageview engagement, live session age from the authentic server `created` time) — clearly flagged as a **page-load snapshot** (the counters don't advance during the page; only the age is live). **(5) GTM-Injektion** (at the bottom) — container injection status & order, live `dataLayer` length, per-container load mode (Google / custom-sGTM / inline base64 + env), and the **actual injected `<script>` tags** (DOM-level proof + load domain). *(This was a separate GTM tab before; folded into Diagnose — a dedicated tab wasn't worth it.)* |
| **Consent** | `aGTM.d.consent`, `aGTM.d.session_status`, `consent_hash`/`last_consent_hash`, `aGTM.c.cmp`, `google_tag_data.ics`, dataLayer `consent` commands, vendor globals | Does GTM load, and why / why not? Plus a **Google Consent Mode sequence** (declare/implicit → default → update in order, with the final per-category state + timestamp, `update > default > declare/implicit`) and a **non-Google vendor box** detecting TCF/GPP/USP/GPC + Meta/UET/TikTok/LinkedIn/Pinterest/Amazon/Criteo, the consent signal each expects, and the state that's synchronously readable (GPC, `euconsent-v2`/`usprivacy`/`amzn_consent` cookies). Consent-command rows expand into the full sent payload |
| **Events** | `aGTM.d.f` (queue), `aGTM.d.dl` (dispatched), `aGTM.l` (decoded log) | Event stream, queued-until-consent, `_noConsent`/`_noDLPush`/`_post` flags. Rows are **click-to-expand** into a syntax-highlighted full object. The decoded log is **bundled by id+event with a count** (so the ~2s consent poll's repeated `m2`/`m3` collapse into one counted row) and shows *which event* (`obj.event`) each entry belongs to. Once consent is present the queue is relabelled as **history** (its events were already replayed as `hastyEvents`). |
| **dataLayer** | `window[gdl]` | The **real GTM dataLayer** contents (click-to-expand), each push **colour-categorised** (aGTM / GTM / E-Commerce / Pageview / Consent / gtag / Message) and badged by its aGTM relationship: **via aGTM** (`aGTMts` → came through `aGTM.f.fire()`), **repeated** (DL-Repeat tag), `_noConsent`/`_post` |
| **Session** | `aGTM.d.session`, `aGTM.d.attribution.<method>.*`, `window.se_data` | Session source & attribution, syntax-highlighted. Falls back to a site's `window.se_data` object when `aGTM.d.session` is empty |
| **Config** | `aGTM.c` + highlighted config traps | The **effective** config in effect after `config()` (defaults + integrator + sGTM-Client injection), syntax-highlighted, plus known config-trap warnings and a **runtime-diff** (first snapshot → current) showing what aGTM derived/changed at runtime |
| **Netzwerk** | `chrome.devtools.network` | gtm.js / `/aGTMconsent` / `/aGTM.js` / sources / GA hits, **plus** event/collect POSTs to the sGTM (aEvents pipeline) — matched by host + learned path-prefix so first-party traffic isn't swept in under reverse-proxy setups. A **pre-consent leak banner** flags any tracking/marketing request (Google tags + Meta/TikTok/UET/LinkedIn/Pinterest/Criteo/Snap/X/Clarity/… pixels) that fired while `gtmConsent` was still false, with a per-row `⚠ pre-consent` badge (reconciled against the consent timestamp so a hit right after "Accept" isn't false-flagged). A **consent fingerprint** — a compact per-category granted/denied/unset pill cluster decoded from the request's `gcs`/`gcd` params — is shown inline in the list (also on dataLayer consent-command rows). A **search box** (prefix `-` to exclude, e.g. `-clarity`) + per-host checkboxes to filter, **smart URL** (dimmed host, emphasised path, key params as chips), the request's **event name** (`en`) and **property/measurement/stream ID** (`id`/`tid`) under the type badge, a **payload preview** (gzip bodies auto-decompressed via `DecompressionStream`; **aEvents** `?e=`/`?q=` payloads decoded — obfuscated ones by brute-forcing the 63 Caesar shifts, no salt needed), and rows **click-to-expand** into separate collapsible sub-sections (General · **Consent-Signale gcs/gcd decoded** · Query-String · Request-/Response-Header · Payload · aEvents entschlüsselt) |
| **Simulation** | **writes** `window.aGTM` via `inspectedWindow.eval` (opt-in) | **The one write-enabled tab.** Drive the page to exercise the flow instead of clicking a real banner: **simulate a consent decision** with granular control (toggle exactly which **purposes / services / vendors** are granted, each with an **ID field** and a per-group **"IDs" toggle** to express consent by ID instead of name — pre-filled from `gtmPurposes`/`gtmServices`/`gtmVendors` so you see what GTM actually requires — persisted per host, saveable as **named presets**), **deny/reset**, **mock the CMP** (install a persistent `consent_check` stub, restorable), **fire an event** (`aGTM.f.fire` with editable JSON + `_noConsent`/`_noDLPush`/`_post` flags + recent-event history), and **force GTM injection**. For prospect/demo work it can also **block an existing aGTM integration** (neutralise its loaders + consent check, reversibly) and **inject an aGTM integration snippet** into a page that has no aGTM yet (this box works even when `window.aGTM` is absent). A live effect panel shows the resulting `gtmConsent`/injection/dataLayer state. Everything is gated behind a per-session **Write-Modus** toggle (default **off**, never persisted). See below. |

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

## Simulation & the write channel

Every tab except **Simulation** is strictly read-only. The Simulation tab is the one
deliberate exception: it *drives* the inspected page (sets consent, fires events,
forces GTM injection, mocks the CMP). It does so through the **same**
`chrome.devtools.inspectedWindow.eval()` bridge — which can already mutate the page,
so **no new Chrome permission is required** and `manifest.json` still declares none.
What changes is the *posture*, and that is handled deliberately, not silently:

- **`reader.js` stays a pure reader.** All writes live in `sim.js`, in their own
  `eval` calls, cleanly separated from the read-only snapshot poll.
- **Nothing writes until you opt in.** A per-session **Write-Modus** toggle gates
  every action; it defaults to **off** and is **never persisted**, so each time you
  open the panel the tab is as read-only as the rest until you flip it.
- **The mechanism mirrors the real library path.** A simulated consent decision
  installs a temporary `aGTM.f.consent_check` (backed up under `aGTM.f.__inspOrigCC`,
  restorable) and calls `aGTM.f.run_cc('update')` — so the genuine
  reset → check → `chelp` → `gtmConsent` → `inject` → replay path runs, exactly as a
  real CMP decision would. The consent selection (which purposes/services/vendors)
  is stored per host in `localStorage`, with named presets.
- **Honesty caveat surfaced in-UI:** simulation cannot *un-inject* an already-loaded
  GTM (the `<script>` is in the DOM). A true first-visit re-test needs a consent-cookie
  clear + reload; the tab says so.
- **Integration management (demo/prospect flows):** a **block** checkbox neutralises a
  loaded aGTM (`inject`/`initGTM`/`gtm_load` → no-op, `consent_check` → false; backed
  up under `aGTM.f.__inspBlockBak`, reversible) so a fresh integration can be tested in
  isolation — the block is **persisted per host** and, while write-mode is on, re-applied
  once after a page reload (so it survives reloads during a demo). `reader.js` exposes
  the block state (`aGTM.d.__inspBlocked`) read-only so the panel knows when to re-apply.
  An **inject** box runs a pasted aGTM integration snippet (also **persisted per host**)
  at global scope via a `<script>` element — it needs no existing aGTM, so the Simulation
  tab renders even on a page where `window.aGTM` is absent.

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
panel.js        poll loop, eight renderers, network capture, row expand/collapse
reader.js       page-context snapshot expression (eval'd, read-only, ES5-safe)
sim.js          Simulation tab — opt-in WRITE channel (mutating eval builders + UI; ES5-safe injected code; builders unit-tested)
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
