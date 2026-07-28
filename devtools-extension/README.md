# aGTM Inspector — Chrome DevTools Extension

A read-only DevTools panel that surfaces aGTM's internal state live while you build,
validate, or debug a tracking integration: the consent lifecycle, the event
queue/replay, GTM injection, session & attribution, the effective config, and the
aGTM-relevant network calls.

It is the human-facing companion to the `live-inspector` Claude Code skill.

> **Status:** Ships with aGTM v1.5. The extension version is **coupled to the aGTM library version**
> (currently 1.5) — `scripts/inject-version.js` writes `manifest.json` from `VERSION`
> on every build. **Read-only by default** — every tab except **Simulation** only
> reads the page. The Simulation tab is an explicit, opt-in exception (a per-session
> "Write-Modus" toggle, off by default) that drives the page for testing; see
> [Simulation & the write channel](#simulation--the-write-channel) below.

## What it shows

| Tab | Source in `window.aGTM` | Purpose |
|---|---|---|
| **Diagnose** | aggregates the other tabs (config traps + pre-consent leaks + consent presence + GTM injection) plus `reader` timestamps (`navStart`, `aGTM.l`, `aGTM.d.dl`, network capture) | At-a-glance overview instead of clicking through every tab. **(1) Health-Score** — a pass/warn/fail traffic-light aggregating the known failure modes (consent mechanism, consent recognised, GTM injected, pre-consent leaks, config traps) into one readout with a per-check list. **(2) Consent-Timeline** — a ms-stamped waterfall (page load → `config()` → CMP decision → GTM inject → first tag fire) that answers *"why did X fire before consent"* visually, plus a **"waiting on"** block showing the milestones aGTM is still blocked on and the events that unblock them (the CMP decision + its `consent_events` triggers, GTM injection when consent is granted but no container is in the DOM yet, queued events awaiting replay, a polling DL-Repeat gate with its awaited gate spec). **(3) Compliance-Report** — a one-click shareable snapshot (**Markdown/JSON** to clipboard, or `.md` download) built from leaks + consent flow + config traps + `consent_check` status, for the consulting/hand-off scenario. **(4) Session & IDs** — current `sid`/`uid`/CRM `user_id` with a first-observed timestamp **and a live change history** (from → to, timestamped, **persisted per host**) so the v1.5 F→C user-id promote (`F.…` → `C.…` after consent) is visible as it happens; plus the Session-API payload from the `/aGTM.js` request as a **KPI stat-tile row** (returning-visitor from `sessionCount`, events-per-pageview engagement, live session age from the authentic server `created` time) — clearly flagged as a **page-load snapshot** (the counters don't advance during the page; only the age is live). **(5) GTM-Injektion** (at the bottom) — container injection status & order, live `dataLayer` length, per-container load mode (Google / custom-sGTM / inline base64 + env), and the **actual injected `<script>` tags** (DOM-level proof + load domain). *(This was a separate GTM tab before; folded into Diagnose — a dedicated tab wasn't worth it.)* |
| **Consent** | `aGTM.d.consent`, `aGTM.d.session_status`, `consent_hash`/`last_consent_hash`, `aGTM.c.cmp`, `google_tag_data.ics`, dataLayer `consent` commands, vendor globals | Does GTM load, and why / why not? Plus a **Google Consent Mode sequence** (declare/implicit → default → update in order, with the final per-category state + timestamp, `update > default > implicit > declare`) and a **non-Google vendor box** detecting TCF/GPP/USP/GPC + Meta/UET/TikTok/LinkedIn/Pinterest/Amazon/Criteo, the consent signal each expects, and the state that's synchronously readable (GPC, `euconsent-v2`/`usprivacy`/`amzn_consent` cookies). Consent-command rows expand into the full sent payload |
| **Events** | `aGTM.d.f` (queue), `aGTM.d.dl` (dispatched), `aGTM.l` (decoded log) | Event stream, queued-until-consent, `_noConsent`/`_noDLPush`/`_post` flags. Rows are **click-to-expand** into a syntax-highlighted full object. The decoded log is **bundled by id+event with a count** (so the ~2s consent poll's repeated `m2`/`m3` collapse into one counted row) and shows *which event* (`obj.event`) each entry belongs to. Once consent is present the queue is relabelled as **history** (its events were already replayed as `hastyEvents`). |
| **dataLayer** | `window[gdl]` | The **real GTM dataLayer** contents (click-to-expand), each push **colour-categorised** (aGTM / GTM / E-Commerce / Pageview / Consent / gtag / Message) and badged by its aGTM relationship: **via aGTM** (`aGTMts` → came through `aGTM.f.fire()`), **repeated** (DL-Repeat tag), `_noConsent`/`_post` |
| **Session** | `aGTM.d.session`, `aGTM.d.bot`, `aGTM.d.attribution.<method>.*`, `window.se_data` | Session source & attribution, syntax-highlighted. Falls back to a site's `window.se_data` object when `aGTM.d.session` is empty. Also shows the **bot-check verdict** (`aGTM.d.bot`): score/band/primarySignal plus a per-signal table. Note the verdict only ever reaches a **non-blocked** visitor — a detected bot gets HTTP 403 and no library — so `isBot: true` is flagged as a contradiction rather than rendered as a neutral value. The signals' `detail` block (ASN, ASN org, unique-IP/request counts) is deliberately not forwarded to the browser by the sGTM Client. |
| **Config** | `aGTM.c` + highlighted config traps | The **effective** config in effect after `config()` (defaults + integrator + sGTM-Client injection), syntax-highlighted, plus known config-trap warnings and a **runtime-diff** (first snapshot → current) showing what aGTM derived/changed at runtime |
| **Netzwerk** | `chrome.devtools.network` | gtm.js / `/aGTMconsent` / `/aGTM.js` / sources / GA hits, **plus** event/collect POSTs to the sGTM (aEvents pipeline) — matched by host + learned path-prefix so first-party traffic isn't swept in under reverse-proxy setups. A **pre-consent leak banner** flags any tracking/marketing request (Google tags + Meta/TikTok/UET/LinkedIn/Pinterest/Criteo/Snap/X/Clarity/… pixels) that fired while `gtmConsent` was still false, with a per-row `⚠ pre-consent` badge. The capture-time stamp is taken against the last polled snapshot (700 ms), so it is deliberately coarse; what makes the flag trustworthy is the **reconcile** against the *consent moment* (the same anchor the Consent-Timeline uses: the `aGTM.l` consent milestone, else the first consent event, else the GTM injection — never the *last* consent event, which the library's 2 s CMP poll keeps pushing forward). The comparison uses each request's **start** time, so a slow request that left before the decision stays flagged. Without any usable anchor the stamp stands, so the check never goes quietly green — though a stamp younger than two poll intervals with no anchor yet counts as *undecided*, so the banner no longer flashes red during page load while the reconcile is still catching up. A **consent fingerprint** — a compact per-category granted/denied/unset pill cluster decoded from the request's `gcs`/`gcd` params — is shown inline in the list (also on dataLayer consent-command rows). A **search box** (prefix `-` to exclude, e.g. `-clarity`) + per-host checkboxes to filter, **smart URL** (dimmed host, emphasised path, key params as chips), the request's **event name** (`en`) and **property/measurement/stream ID** (`id`/`tid`) under the type badge, **exception hits show their `type` and message inline** (from a GA4 query string, a GA4 POST body or a decoded aEvents payload) — an event named `exception` says nothing on its own, so what actually broke is readable without expanding the row, with the full text on hover, a **payload preview** (gzip bodies auto-decompressed via `DecompressionStream`; **aEvents** `?e=`/`?q=` payloads decoded — obfuscated ones by brute-forcing the 63 Caesar shifts, no salt needed), and rows **click-to-expand** into separate collapsible sub-sections (General · **Consent-Signale gcs/gcd decoded** · Query-String · Request-/Response-Header · Payload · aEvents entschlüsselt). Query-string values are **URL-decoded** for display — Chrome hands them over raw, so a GA4 error text arrives as `Uncaught%20ReferenceError%3A%20…` and an ID list as `%2C50%2C39`. Decoding is one level deep and per-value fault-tolerant (a value containing a literal `%` keeps its raw form instead of breaking the row), and the section header states how many values were decoded — including how many were **double-encoded**, which is surfaced rather than silently unwrapped because it is usually a real tagging bug |
| **Simulation** | **writes** `window.aGTM` via `inspectedWindow.eval` (opt-in) | **The one write-enabled tab.** Drive the page to exercise the flow instead of clicking a real banner. Laid out as four labelled groups — **Consent · Events · GTM & Integration · Umgebung** — under a pinned write-toggle + live-effect panel. **Consent:** simulate a decision with granular control (toggle exactly which **purposes / services / vendors** are granted, each with an **ID field** and a per-group **"IDs" toggle** to express consent by ID instead of name — pre-filled from `gtmPurposes`/`gtmServices`/`gtmVendors` — persisted per host, saveable as **named presets**), plus **deny / reset / restore** (Grant installs a persistent `consent_check` stub = mocks the CMP; Restore undoes it). **Events:** **fire an event** (`aGTM.f.fire` with editable JSON + `_noConsent`/`_noDLPush`/`_post` flags + history) and a one-click **scenario runner** (deny→fire→grant→replay). **GTM & Integration:** **load a different GTM container** than the config (staging/demo), **force GTM injection** (consent-independent `initGTM`), a **consent-store POST test** (`/aGTMconsent`), **block an existing aGTM integration** (reversible), and **inject an aGTM integration snippet** into a page with no aGTM. **Umgebung:** **push a Google Consent Mode command** (`update` / `default` — an ordinary page-pushed `declare` is dropped by Google's tag, see below; with a timing guard that refuses a `default` that would arrive too late) and **reset cookies + reload** (both aGTM-independent). A live effect panel shows the resulting `gtmConsent`/injection/dataLayer state. Everything is gated behind a per-session **Write-Modus** toggle (default **off**, never persisted). See below. |

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

### Layout

The tab is a flat stack under four labelled section headers — **Consent · Events ·
GTM & Integration · Umgebung** — with the write-toggle and live-effect panel pinned
at the top. Grant already installs a persistent `consent_check` stub (so it *is* the
"mock the CMP" action); **Restore** (undo the stub) sits next to Deny/Reset in the
Consent group rather than in a separate box.

### Extra features

Further tools round out the tab (all gated by the same Write-Modus toggle,
persisted per host):

- **Load a different GTM container** (GTM & Integration) — injects one or more container
  IDs directly via `aGTM.f.gtm_load`, **independent of consent and of the integration
  config**, so a live page can be pointed at a staging/demo container without editing the
  real config (pairs with "block an existing integration"). Does not touch *other*
  configured containers' load state (entering an id that is itself a configured container
  does mark that one loaded).
- **Google Consent Mode push** — sends a `gtag('consent',<verb>,{…})` straight to the
  dataLayer (a **genuine `arguments` object**, exactly what `gtag()` pushes — a plain
  array would not be treated as a consent command), so GCM signals can be tested
  **independently of aGTM**. One checkbox per canonical signal (checked = `granted`).
  The two verbs a page can push are available:
  - `update` — revises consent; works at any time, the normal case after a CMP decision.
  - `default` — seeds the pre-consent baseline. Adds the two fields that only exist on
    this verb: **`wait_for_update`** (ms) and **`region`** (comma-separated; one push =
    one region scope, push again for another).

  **Why there is no `declare` button.** The verb is real, but this tab cannot reach it
  honestly. Google's shipped code — `gtm.js` of a real container and `gtag.js`,
  byte-identical — dispatches consent commands as
  `d==="default" ? … : d==="update" ? … : d==="declare" && b.fromContainerExecution && …`.
  That flag is stamped on messages the container itself enqueues (its message queue,
  `registerChild`, `load_google_tags`), and the same line uses it as exactly that
  page-vs-container discriminator one clause earlier. An ordinary page push — array or
  plain object — carries no flag, so its `declare` is dropped without a trace.

  It is not strictly unforgeable: the unwrapper duck-types on the presence of
  `getUntrustedMessageValue`, so a non-plain object exposing that method would be taken
  for container output. But the flag also switches on Google's container-execution model
  handling and suppresses its own page-push diagnostics — a tool whose job is to
  *observe* the page must not lie to the tag about where a message came from. In
  practice the verb belongs to Google's own and whitelisted CMP/vendor templates, which
  reach it through the **internal** API `internal.declareConsentState`; a custom template
  cannot `require()` that.

  `declare` stays fully visible on the **read** side: the reader captures it from
  `google_tag_data.ics`, and the **Consent** tab keeps both a `declare` column in its
  per-category table and a `declare` step row in the sequence — so a CMP template's
  declare stays visible even once a later `default`/`update` outranks it. In the
  Ist-Zustand line below it appears as a state's *origin*, which by precedence
  (`update > default > implicit > declare`) only happens when nothing else is set.

  **Timing guard.** `default` is only read while the Google tag has not yet evaluated
  consent; pushed later it lands in the dataLayer and changes nothing. The box therefore
  **refuses** a late `default` and says why, instead of reporting
  a success that did not happen — "too late" is detected via `google_tag_data.ics` or,
  on an aGTM page, `aGTM.d.init`. On a typical aGTM page both are false until consent is
  given, which is exactly why a `default` push is useful here. A **"trotzdem pushen"**
  checkbox overrides the guard for deliberate experiments; the effect panel then flags
  the push as ineffective. `update` is never guarded.

  An **Ist-Zustand** line above the checkboxes shows the current effective state per
  category *and where it came from* (`update` > `default` > `implizit` > `declare`),
  refreshed with the poll, so a push has a visible before/after. This is also the answer
  to "what is the implicit state?" — **implicit cannot be pushed**: it is what Google
  assumes when no `default` ever arrived, so it is a reading, not a fourth button. To
  reach it, clear cookies and reload (the box below) and push nothing. The precedence
  rule lives in `consentsignals.js` and is shared with the Consent tab, so the two views
  cannot disagree.
- **Cookie reset + reload** — expires cookies whose name matches one of the given
  patterns (a plain fragment matches as a **substring**, and `*` anchors it: `__cmp*` =
  starts with, `*consent` = ends with, `*` = everything; regex metacharacters stay
  literal). A **"restore the default list"** link appears whenever the field differs from
  the shipped patterns, and the effect panel **names** the cookies it removed, so you can
  see at a glance whether your CMP was covered (the shipped list leads with prefixes such as `__cmp`, which covers Consentmanager's whole `__cmpconsent…`/`__cmpccu…` family; a run that matches nothing says so instead of reporting success. The effect line survives the reload it triggers) (across the `/` + current-path × parent-domain grid), optionally clears
  matching `localStorage` keys, then optionally reloads — the real first-visit re-test
  that plain reset can't do. **Empty pattern field = match every cookie** (nuclear;
  spelled out in-UI) — and, combined with "clear localStorage", that wipes the
  **entire** `localStorage` too (login tokens included). Also aGTM-independent.
  **Third-party CMP frames** (`auch in CMP-Frames`, on by default): many CMPs keep a
  second copy of the consent inside their own iframe origin — cookies on
  `.consentmanager.net` plus that origin's `localStorage` — which the page cannot reach
  and which restores consent on the next load. DevTools can, so the same patterns are
  cleared in every foreign frame of the page first (never with the reload — that would
  cut them short), addressed by the frame's exact **document URL** taken from the
  document-typed `getResources()` entries; an origin resolves to no frame at all. This
  needs **no** Chrome permission: frame evaluation is gated on schemes, `chrome://`,
  Web-Store and enterprise-policy hosts, not on `host_permissions`. The pass is
  best-effort behind a 1.2 s watchdog — it can delay the top-frame reset by at most that,
  but never prevent it — and reports **per host** what went, which frame refused and why,
  and which had not answered yet. It writes into third-party origins, so it obeys the same
  write-mode gate as everything else here, and it is **skipped entirely when the pattern
  field is empty**: "delete every cookie" stays on the page's own domain rather than
  wiping embedded payment/SSO/chat widgets. It only reaches origins that are framed at
  that moment (and document resources from removed frames simply report back as not
  found) — when the effect line reports nothing removed there, an **incognito window**
  remains the reliable route to a genuine first visit.
- **Scenario runner** — one click walks the whole lifecycle: **deny** → **fire** the
  listed events (parked in `aGTM.d.f` because there's no consent) → **grant** the chosen
  consent (`run_cc('update')` → inject → replay). The effect panel reports how many
  events were fired and queued. The replay step needs GTM to be **not yet injected**
  (aGTM's inject-once guard); on an already-injected page the panel says so instead of
  silently orphaning the queued events. Mirrors the v1.6 roadmap's scenario runner.
- **Consent-store POST test** — deliberately exercises the `/aGTMconsent` path: installs
  the chosen consent, blanks `aGTM.d.consent_hash` (forcing the diff) and calls
  `run_cc('update')` so the genuine `aGTM.f.xsend()` POST to `consent_store_url` fires.
  Disabled (with a hint) when no `consent_store_url` is configured.

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
devtools.html   the devtools_page host document that loads devtools.js
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
