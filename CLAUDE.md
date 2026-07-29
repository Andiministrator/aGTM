# aGTM – Developer & Agent Guide

## Project Summary

**aGTM (a Galactic Tagging Modulator)** is a JavaScript library that loads Google Tag Manager only after the user's cookie consent decision is available. It supports Google Consent Mode, many CMP providers, GTM Custom Templates, and a server-side GTM (sGTM) client.

- **Repository:** https://github.com/Andiministrator/aGTM
- **Author:** Andi Petzoldt <andi@petzoldt.net>
- **License:** Apache 2.0
- **Language constraint:** ECMAScript 5 only — GTM's sandboxed JS environment does not support ES6+. Use `var`, not `let`/`const`. No arrow functions, no classes.

---

## Repository Structure

```
aGTM/
├── aGTM.js              # Main library (source, human-readable)
├── aGTM.min.js          # Minified version (derived from aGTM.js, see Build Process)
├── aGTM.base64          # Base64-encoded version of aGTM.min.js (used in sGTM)
├── aGTM_debug.js        # Debug helper — loads in browser console to decode aGTM.l log entries
├── README-for-Integrators.md  # Data contract for sGTM/webGTM devs (aGTM object, dataLayer, session/consent/attribution)
├── cmp/                 # Consent check functions, one file per CMP provider
│   ├── cc_<name>.js     # Source version
│   └── cc_<name>.min.js # Minified version
├── gtm/                 # GTM Custom Templates (.tpl files) and their READMEs
│   ├── tags/            # Tag templates (click, form, scroll, pageview, etc.)
│   └── variables/       # Variable templates
├── sgtmClient/          # Server-side GTM client template
├── ext/                 # Extensions (e.g. Stape.io integration)
├── devtools-extension/  # "aGTM Inspector" Chrome DevTools panel (read-only + opt-in Simulation write channel; ES6+, NOT on the ES5/build.sh path)
├── configurator/        # Standalone visual config builder (GitHub Pages, linked from README)
├── aGTM-Inspector.zip   # Packaged aGTM Inspector (derived — see scripts/pack-devtools-extension.sh)
├── assets/              # Images, Excel event overview
├── tmp/                 # Temporary files / backups (not production-relevant)
├── .claude/skills/      # Claude Code skills (see below); only these are tracked under .claude/
└── CLAUDE.md            # This file
```

### Claude Code skills

The repo ships [Claude Code](https://claude.com/claude-code) **skills** under
`.claude/skills/` (Apache 2.0, available automatically on clone). Each is a
`SKILL.md` that Claude loads on demand when a task matches; see
`.claude/skills/README.md` for install & usage:

- **`cmp-integration`** — add, fix, or test a CMP `consent_check` adapter.
- **`config-builder`** — generate an `aGTM.f.config({…})` + init snippet and
  sanity-check it.
- **`integration-check`** — diagnose & audit a live or configured integration.
- **`live-inspector`** — drive a real browser through the live consent flow
  end-to-end (needs `claude --chrome` or the Chrome DevTools MCP).

Only these skill files are git-tracked under `.claude/`; the rest of `.claude/`
(local settings, worktrees) stays ignored via targeted `.gitignore` negations.

### aGTM Inspector (Chrome DevTools extension)

`devtools-extension/` ships an MV3 DevTools panel ("aGTM Inspector") for people
who build/validate/debug an integration — the human-facing companion to the
`live-inspector` skill. Eight tabs: **Diagnose** (health-score, consent timeline,
compliance report, session & IDs, GTM injection), **Consent** (consent lifecycle,
Google Consent Mode sequence, non-Google vendor detection), **Events** (queue/replay,
decoded `aGTM.l`), **dataLayer**, **Session** (session/attribution), **Config**
(effective config + traps + runtime diff), **Netzwerk** (`chrome.devtools.network`,
gzip/aEvents payload decode, pre-consent leak detection) and **Simulation**.

Every tab **except Simulation** is strictly read-only: the panel reads the page only
via `chrome.devtools.inspectedWindow.eval()` (running `reader.js`, a pure reader) and
`chrome.devtools.network`. **Simulation is the one deliberate write exception**
(`sim.js`): behind a per-session "Write-Modus" toggle (default off, never persisted)
it drives the page — simulated consent decisions, event firing, forced GTM injection,
Google-Consent-Mode pushes, cookie reset — through that same `eval()` bridge, which is
why `manifest.json` still declares **no** `permissions`/`host_permissions`. The cookie
reset also evaluates inside the page's **third-party frames** (a CMP keeps its own copy
of the consent in its own origin), via `eval(code, {frameURL})`. That stays inside the
same posture: DevTools gates frame evaluation on schemes, `chrome://`, Web-Store and
enterprise-policy hosts — **not** on `host_permissions`. It does require the frame's
exact committed **document URL** (an origin resolves to no frame — F-115), which is why
the candidates come from `getResources()` filtered to `type === "document"`.

It is ES6+ (own browser context — **not** on the ES5/`build.sh` path), and its version
is coupled to the library version (see the build table). Distribution is "load
unpacked" or the tracked `aGTM-Inspector.zip` at the repo root. The pure modules are
unit-tested under `test/devtools/` (`netclassify`, `consentsignals`, `diagnose`,
`jsonview`, the `sim` code builders) plus a `panel-smoke` integration test. See
`devtools-extension/README.md`.

---

## Build Process

Run the build script to generate all derived files from source:

```bash
./build.sh
```

See setup instructions below if running for the first time.

### What gets built

| Source | Output | Notes |
|---|---|---|
| `aGTM.js` | `aGTM.min.js` | Minified, no init call (see below) |
| `cmp/cc_<name>.js` | `cmp/cc_<name>.min.js` | Minified |
| `aGTM.min.js` | `aGTM.base64` | Base64-encoded, used in sGTM client template |

### The `aGTM.f.init()` situation

`aGTM.js` intentionally contains **no active `aGTM.f.init()` call** at the end of the library code. There are two references to it, but both are non-executable:
- `//aGTM.f.init();` — commented out (marks where init would go in single-file usage)
- A second occurrence inside a `/*** ... ***/` block comment (example code for documentation)

A standard minifier strips all comments, so both are removed automatically. **No manual deletion is required** before minifying. This is by design: the init call is the responsibility of the integrating developer, not the library.

If an uncommented `aGTM.f.init();` ever appears at the end of `aGTM.js` (e.g. left in from local testing), the build script will warn and abort.

### Build setup (first time)

Requires Bun. On Arch/CachyOS:
```bash
sudo pacman -S bun
```

No `npm install` needed — `bunx terser` fetches terser from Bun's cache on first run.

### Running tests

```bash
bun test
```

Tests live in `test/`. Browser globals are set up via `test/setup.js` (loaded automatically by `bunfig.toml`). See `test/helpers.js` for `MockXHR` and `resetAGTM()`.

### Build system overview

| File | Role |
|---|---|
| `VERSION` | Single source of truth for the version number. Change this, run `./build.sh`. Convention: `1.6-pre` on `dev`, `1.6` before release merge. |
| `build.sh` | Orchestrates the full build: inject version → safety check → minify → base64 → update sGTM template |
| `scripts/inject-version.js` | Reads `VERSION`, writes `@version` + `aGTM.d.version` in `aGTM.js`, updates `@lastupdate`, updates `package.json`, and writes `devtools-extension/manifest.json` (Chrome-manifest version — pre-release suffix stripped, e.g. `1.6-pre`→`1.6`; the aGTM Inspector version is coupled to the library version) |
| `scripts/check-init.js` | Strips comments from `aGTM.js` and checks for an accidental uncommented `aGTM.f.init()` call |
| `scripts/update-sgtm-template.js` | Reads `aGTM.base64` and version from `aGTM.js`, injects both into `sgtmClient/template.tpl` **and** re-syncs the same base64 blob into `sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js` so the client source stays byte-identical to the template's sandboxed block (the blob is the only line that drifts across a library rebuild — see below). **Also** re-syncs the embedded CMP `consent_check` codes in the template's "Used CMP" SELECT from `cmp/*.min.js` (F-52 — see "Embedded CMP consent_check sync" below) |
| `scripts/cmp-sync-lib.js` | Shared, side-effect-free helpers for the embedded-CMP-code sync: `CMP_MAP` (displayValue → `cc_<name>` file), consent_check extraction, GTM string encoding, template parsing. Imported by both `update-sgtm-template.js` (writer) and `test/cmp/template-sync.test.js` (drift guard) so the mapping lives in one place |
| `scripts/pack-devtools-extension.sh` | Packs `devtools-extension/` reproducibly into the tracked `aGTM-Inspector.zip`. Deliberately **not** part of `build.sh` (the extension is off the ES5 path) — but `build.sh` *does* rewrite `devtools-extension/manifest.json`, so **re-run this after every version bump**, or the tracked ZIP ships a stale manifest. Reproducible in the byte sense: entries are pinned to a fixed timestamp (`SOURCE_DATE_EPOCH`, override via env) and zipped in sorted order, so identical sources give an identical archive — re-pack and compare the hash to answer "is the tracked ZIP current?" instead of guessing. |
| `bunfig.toml` | Configures `bun test`: preloads `test/setup.js` before every test file |
| `test/setup.js` | Sets up browser globals (`window`, `document`, etc.) and loads `aGTM.js` into global scope via indirect eval |
| `test/helpers.js` | `MockXHR` class and `resetAGTM()` — used in every test file |

**Release flow:** edit `VERSION` → `./build.sh` → commit → merge `dev` → `main` → `git tag v<version>`

### sGTM Client source ↔ template sync invariant

The server logic ships in two places that must stay **byte-identical**: the
`___SANDBOXED_JS_FOR_SERVER___` block inside `sgtmClient/template.tpl` (what GTM
actually runs) and the human-readable `sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js`.
`build.sh` does **not** regenerate the logic block from the source — so any
edit to the server logic must be applied to **both** files identically. The one
exception is the embedded aGTM-library base64 blob (`const agtm = fromBase64('…')`):
`scripts/update-sgtm-template.js` injects the freshly built `aGTM.base64` into
that line in **both** files, so the blob never drifts across a library rebuild
(previously it did — finding F-43). After any change, verify with a `diff` of
the extracted block against the source; only the `___TESTS___` block of the
template has no source counterpart and may diverge freely.

### Embedded CMP `consent_check` sync (F-52)

The Client template's "Used CMP (Consent Tool)" SELECT field (in
`___TEMPLATE_PARAMETERS___`) carries one **minified** `consent_check` function
per CMP as its option `value`. This is the production copy the Client injects
inline into `/aGTM.js` — so a CMP fix in `cmp/cc_<name>.js` only reaches Client
users (fc-moto & co) once this embedded copy is regenerated. It used to drift
silently (a CMP fix landed in `cmp/*` but not here — F-52, the F-51 comma-strip
was found un-synced in Usercentrics v2).

`scripts/update-sgtm-template.js` now regenerates every embedded value from the
freshly built `cmp/*.min.js` on each `./build.sh`. Mechanics (all in
`scripts/cmp-sync-lib.js`, shared with the drift-guard test):
- **`CMP_MAP`** maps each SELECT `displayValue` → its `cc_<name>` file. Two CMPs
  (`cc_jtl_consent`, `cc_jtl_eu_cookie`) are **not** offered as embedded options,
  so 23 of the 25 `cmp/` files are embedded.
- The embedded value is the min.js **from `aGTM.f.consent_check=function` onward**
  — the leading namespace-bootstrap prefix (`window.aGTM=…,aGTM.n=aGTM.n||{},`)
  is dropped because the Client has already initialised `aGTM`.
- Values are re-escaped GTM-style (JSON escaping **plus** `\u00xx` for `=`/`&`/
  `<`/`>`); the encoder is verified to reproduce every already-synced value
  byte-for-byte.
- The writer **fails loud** if a template CMP option has no `CMP_MAP` entry (a
  new/renamed CMP added without wiring the sync) or a mapped value can't be
  located. Adding a CMP to the SELECT ⇒ add its `CMP_MAP` entry.
- **Template-only:** these values live solely in `___TEMPLATE_PARAMETERS___`; the
  sandboxed server block reads the *selected* value at runtime, so the
  client-source file has no counterpart to sync.
- **Drift guard:** `test/cmp/template-sync.test.js` asserts every embedded value
  equals its `cmp/*.min.js` source, so a future un-synced CMP fix fails `bun test`
  instead of shipping stale. **A CMP fix is not done until `./build.sh` has been
  run and the embedded copy re-synced.**

### Minification rules

All minification uses **terser** with these flags:
- `--ecma 5` — ES5-compatible output (required: code may run inside GTM's sandboxed JS environment which only supports ES5)
- `--keep-fnames` — function names are preserved (required: internal aGTM functions are referenced by name)
- `--compress --mangle` — standard size optimizations

**ES5 requirement applies to all files in this repo** — not just the minified output. The source files (`aGTM.js`, `cmp/*.js`) must also be written in ES5. No `let`, `const`, arrow functions, classes, template literals, etc.

---

## Git Workflow

- **`dev`** — active development branch. All changes go here first.
- **`main`** — stable release branch. Only updated when a version is finished and tested.
- **Tags** — Git tags ARE the version numbers. Every release on `main` gets a tag matching the version (e.g. `v1.4.1`, `v1.5`). The tag is the authoritative reference for a release.

**Release flow:** develop on `dev` → test → update version number in `aGTM.js` (`@version` header + `aGTM.d.version`) + changelog entry in `CHANGELOG.md` → run `./build.sh` → merge to `main` → `git tag v<version>`.

**Tag naming:** `v` prefix + semantic version, e.g. `v1.0`, `v1.2.1`, `v1.5`. Matches the version in `aGTM.js` and the changelog in `README.md`.

There are no feature branches or hotfix branches by convention — the project is maintained by a single author.

---

## Core Function Architecture

> **Documentation maintenance:** When modifying any core function (`fire`, `inject`, `run_cc`, `call_cc`, `consent_listener`, `gtm_load`, `initGTM`, `sendnaus`), update the call graphs and reference tables in this section **and** in `README-for-Developers.md` in the same commit. These documents are the primary source of truth for future agents and developers — outdated docs are worse than no docs.

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
       │         ├─ detect/protect against dataLayer.push hooks
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
  ├─ aGTM.f.optout()              — abort if opt-out cookie/param set
  ├─ aGTM.f.config(aGTM.c)       — apply configuration (see above)
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
  │    ├─ [action === 'update'] snapshot aGTM.d.consent, then B2 field-reset:
  │    │    aGTM.d.consent.hasResponse = false; services/purposes/vendors = "";
  │    │    consent_id/serviceIDs/feedback = ""; delete blocked.
  │    │    Stale preset values cannot survive a real CMP decision.
  │    │    On consent_check returning false → restore snapshot (poll-safe).
  │    │
  │    ├─ aGTM.f.consent_check(action)    — CMP-specific function (from cmp/ file)
  │    │    └─ on 'init' with hasResponse=true → short-circuit returns true
  │    │       (load-bearing for preset_with_consent path)
  │    │
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
  │            xhr = xsend(consent_store_url, {uid, sid, consent: <without gtm/blocked>})
  │            xhr.onreadystatechange: on 2xx → consent_hash = new_hash;
  │                                              session_status = 'synced'
  │                                              parse responseText: if response.uid
  │                                              is non-empty string and differs from
  │                                              aGTM.d.session.uid, adopt it (server
  │                                              just ran F→C promote — see SESSION-
  │                                              REDESIGN.md §7b)
  │                                  on non-2xx → leave hash; next run_cc retries
  │         elif (consent_store_url):
  │            session_status = 'confirmed'   — server already had this state
  │
  ├─ clearInterval(consent timer)
  └─ aGTM.f.inject()

aGTM.f.inject()
  ├─ copy pre-existing window[gdl] items → aGTM.d.f (queue)
  ├─ [gtmConsent == true]
  │    ├─ aGTM.f.initGTM(false)
  │    │    └─ aGTM.f.gtm_load() per container
  │    │         ├─ sendnaus(aGTM_ready)  — carries aGTM.hastyEvents = aGTM.d.f
  │    │         ├─ sendnaus(gtm.js)
  │    │         └─ insert <script> tag into DOM  — GTM loads asynchronously
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
| `aGTM.c.consent_events` | Comma-separated event names that trigger `run_cc('update')` when seen in `fire()` |
| `aGTM.c.consent_event_attr` | Parsed attribute conditions for `consent_events` (keyed by event name) |
| `aGTM.c.dlSet` | Map of `{ targetProp: dlVariableName }` — auto-appended to every event in `fire()` |
| `aGTM.c.consent_store_url` | Phase 3: POST endpoint for consent diffs (sGTM Client persists into Session API record). When the library is served by the sGTM Client, the URL is built **browser-side** at config time from `document.currentScript.src` + the fixed path `/aGTMconsent` — so reverse-proxy setups (e.g. `/rp/tp/aGTM.js` upstream stripped to `/aGTM.js`) work transparently. Standalone integrators set this manually. |
| `aGTM.c.consent_store_enc` | Phase 3: encrypt consent-store POST payload with `session_salt` |
| `aGTM.d` | Runtime data (consent state, queues, counters, …) |
| `aGTM.d.f` | Queue for events delayed until consent is available; also carries pre-existing DL items for `hastyEvents` replay |
| `aGTM.d.dl` | Internal copy of all events passed through `fire()` |
| `aGTM.d.consent` | Current consent state written by `consent_check`; `.gtmConsent` controls GTM injection |
| `aGTM.d.consent_hash` | Phase 3: stable serialization of `aGTM.d.consent` (blacklist of `gtmConsent`/`blocked`) at the **last successful consent-store POST**. Used to gate the diff/POST in `run_cc()` and to support retry on 5xx (advances only on 2xx). |
| `aGTM.d.last_consent_hash` | State-change hash, advanced on **every** `run_cc()` regardless of POST success. Used to gate `sendnaus(aGTM_consent_update)` + `consent_callback` so the periodic CMP poll does not flood when the consent state is stable. |
| `aGTM.d.init` | `true` once GTM has been injected; guards `inject()` from running twice |
| `aGTM.d.session` | Session & user data pre-populated from `cfg.session` (sGTM Client injection — see Session Feature below). Carries the Session API record: `uid`/`sid`/`ret`/`sst`/`vct`/`ga4sid`/`muidga4`, the counters `created`/`lastInteraction`/`pvCount`/`eventCount`/`sessionCount`, plus `consent`, `source` and `attribution` when present. **`vct` is the API's `counter` (requests within the session), NOT the visit count — that is `sessionCount`.** `counter` is not repeated under its own name; `customerId`/`user` are dropped as redundant. `ret`/`vct` semantics stay as they are because `ret` gates the server-side consent auto-denial. |
| `aGTM.d.session_status` | Consent-sync lifecycle: `""` (no preset), `"preset"` (cfg.session accepted, no usable consent — this also covers a source-/attribution-only delivery that carries no `sid`), `"preset_with_consent"` (preset consent seeded into `aGTM.d.consent`), `"synced"` (CMP decision diffed and POSTed to `consent_store_url`), `"confirmed"` (CMP decision matches the preset, no POST needed). |
| `aGTM.d.bot` | Bot-check verdict from the sGTM Client (`cfg.bot`), `{}` when the check is off. Shape `{isBot, score, band, primarySignal, signals[]}`. Only ever present for a **non-blocked** visitor — a definitive bot gets HTTP 403 and no library. Meant for *marking* (a webGTM `traffic_type` dimension), never for blocking. See "Bot check" below. |
| `aGTM.d.attribution` | Keyed-by-method attribution object populated at end of `config()` from `aGTM.d.session.attribution` merged with current URL/referrer. Empty `{}` when no preset is supplied. Read e.g. `aGTM.d.attribution.last_touch.sou`. See `internal/api/integration-guide.md` §7 (gitignored maintainer reference). |
| `aGTM.d.dlrepeatDone` / `dlrepeatPolling` / `dlrepeatGate` | DL-Repeat state: replay already ran once · a gate poll is currently active · the gate spec (`cfg.gateEvents`) being awaited, exposed read-only for the aGTM Inspector. Consumers of `dlrepeatPolling` must also check `!dlrepeatDone` — the flag is not cleared after a successful replay (F-74). |
| `aGTM.l` | Log array (decoded by `aGTM_debug.js`) |

### Session Feature

> **Status (v1.5 redesign, Phase 3 complete):** Full design in [SESSION-REDESIGN.md](SESSION-REDESIGN.md) at the repo root — read it before working on session/consent code. The session feature is now driven entirely by the sGTM Client (no client-side HTTP fetch). Phase 3 adds consent passthrough on read, diff-driven POST on update, and a synchronous fast-path for returning visitors with stored consent.

**Config options (v1.5):**

| Option | Type | Default | Description |
|---|---|---|---|
| `user_id` | string | `""` | Optional logged-in user CRM ID, exposed for integrators |
| `session_salt` | number | `0` | Encryption salt for the consent-store POST (also fallback for POST transport) |
| `consent_store_url` | string | `""` | POST endpoint for consent diffs. The sGTM Client handler manages the user-ID cookie AND persists the consent into the Session API record. When the library is served by the sGTM Client, the URL is built **browser-side** at config time from `document.currentScript.src` (the URL the browser actually fetched aGTM.js from) + fixed path `/aGTMconsent` — works under any reverse-proxy prefix without server-side knowledge. Standalone integrators set this manually. Empty string disables the feature. |
| `consent_store_enc` | boolean | `false` | If `true`, the consent-store POST payload is encrypted with `session_salt` |
| `consent_poll_ms` | number | `2000` | Interval (ms) for the periodic CMP state-change poll started after a successful init. Set to `0` to disable. Only takes effect when `consent_store_url` is set (without it, polling has nothing to push). Catches CMPs that emit updates via direct `dataLayer.push()` (CCM19, Cookiebot, Usercentrics, …) — i.e. without going through `aGTM.f.fire()` — so the diff/POST mechanism still triggers. |
| `session` | object | `null` | Pre-populated session object from sGTM Client; accepted when it is an object containing a `sid`, `consent`, `attribution`, **or** `source` field |

**Removed (gone, no migration code, v1.5 unreleased):** Config: `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url`, `session_deny_service`. Functions: `aGTM.f.session_fetch`, `aGTM.f.session_apply_denial`, `aGTM.f.xfetch`. Data keys: `aGTM.d.session_ready`, `aGTM.d.consent_sent`.

**Preset gate** (in `aGTM.f.config()`): if `cfg.session` is an object with `sid`, `consent`, `attribution`, or `source`, it is deep-copied into `aGTM.d.session` (so any extra field such as `source` is carried through verbatim). Then:
- If `cfg.session.consent` is a valid object (`hasResponse === true`, `typeof services === 'string'`), it is deep-copied into `aGTM.d.consent`, `aGTM.d.consent_hash` is seeded via `consent_serialize`, `session_status = 'preset_with_consent'`. At end of `config()`, `aGTM.f.call_cc()` is called synchronously so GTM injects on this tick — without waiting for the 500 ms `consent_listener` poll.
- Otherwise `session_status = 'preset'` and the CMP path proceeds normally.

**Consent diff/store** (in `aGTM.f.run_cc()`, end of success path — runs on **both** `'init'` and `'update'`):
- `new_hash = aGTM.f.consent_serialize(aGTM.d.consent)` — blacklist serialization (excludes `gtmConsent`/`blocked` and empty/null values).
- If `consent_store_url` is set AND `new_hash !== aGTM.d.consent_hash` → POST `{uid, sid, consent: <without gtmConsent/blocked/empty>}` to `consent_store_url` via `aGTM.f.xsend()`. On 2xx response (`xhr.onreadystatechange` gate): update `aGTM.d.consent_hash = new_hash`, set `session_status = 'synced'`. On non-2xx: leave the hash unchanged so the next `run_cc()` retries.
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

### Bot check (sGTM Client only)

Optional. Before any session/cookie work, the Client GETs `{botCheck}/{base64url payload}`
with `{UserAgent, ClientIP}` and reads the verdict from the response body.

- **No status-code gate** (F-127). The filter service couples the HTTP status to the
  verdict — **403 when `isBot`, 200 otherwise** — so a `2xx only` gate skips the body of
  exactly the responses that report a bot. Such a gate existed from the v1.5 single-session
  refactor (`9d302d7`) until F-127 and silently let **every** bot through; v1.4.x had none.
  `sendHttpGet` resolves for any completed response, so the body is read regardless of status.
  `test/sgtm/botcheck.test.js` guards this structurally.
- `isBot === true` → 403 + `returnResponse()`, no library is served. `isBot` is the **sole**
  block trigger (definitive signals only); `score`/`band`/`signals` never block by themselves.
- **`botCheckMode`** (SELECT, default `block`) — `mark` reports the verdict but never blocks.
  It exists because a blocked visitor is *invisible*: no library, no `aGTM.d.bot`, no way to
  count false positives. Recommended rollout on an existing site: `mark` first, count
  `aGTM.d.bot.isBot === true` in webGTM, then switch to `block`. Normalized so that only the
  literal `'mark'` disables blocking — a misconfigured SELECT can never silently switch the
  filter off (F-29 lesson).
- **`botCheckExpose`** (CHECKBOX, opt-out: absent ⇒ on) — whether the verdict is published to
  the page at all. `aGTM.d` is readable by every script on the page and is written *before*
  any consent decision, so "filter yes, publish no" has to be expressible.
- Only a real boolean `isBot` counts as a verdict. Anything else — a 5xx whose body happens to
  parse, an empty body, a transport error — becomes `{isBot:false, band:'unknown'}`, so an
  outage stays distinguishable from a clean visitor. Without that, a webGTM traffic-type
  variable reports `regular` for 100% of traffic for as long as the filter is down.
- The verdict carries **`mode`** (`block`/`mark`). Otherwise `mark` is invisible: a page under
  `mark` looks exactly like one under `block` until a bot shows up, and nothing reminds anyone
  that the filter is off. The Inspector renders it as a chip and adds a health-check line
  (status `na`, not `warn` — `mark` runs for weeks by design, and weeks of WARN would wear the
  overall status out; an outage or a `bot` verdict under `mark` still warns, and those are
  checked *before* the mode so the severe finding is never hidden by it).
- **Measuring the `mark` phase depends on what carries the number out.** `aGTM.d.bot` itself is
  set inside `aGTM.f.config()`, i.e. while `/aGTM.js` executes — **before** any consent
  decision, so the value is there for every visitor. The bottleneck is the *sender*: a webGTM
  variable is only read when a tag fires, tags need GTM, and GTM needs consent, so a
  consent-gated tag misses every visitor who never answers the CMP (most non-human traffic).
  A consent-free sender — a cookieless analytics call in the page, a `noConsent` container —
  sees all of them and makes the browser count a real rate. With a consent-gated sender it is
  a false-positive detector for humans only. The Client also writes a **non-debug** `warn` line
  for each bot it sees under `mark`; that log, or the filter service's own numbers, is complete
  either way — the `logging` permission is scoped to **all** environments for exactly that
  reason (`debug` would make both warn lines silent no-ops in a live container, and the field
  help would promise a record the container cannot keep).
- A missing verdict carries **`reason`**: `no_answer` · `bad_answer` · `no_client_ip`. Lumping
  them into a bare `unknown` would hide that "the filter is down" and "the IP header did not
  resolve" call for completely different responses.
- **Values are whitelisted, not just keys** (`botEnum` against `BOT_BANDS`/`BOT_CATEGORIES`/
  `BOT_TYPES`; `botScore` floors and rejects anything outside 0–100 — a score above 100 is a
  contract violation, and clamping it to 100 would hand the most incriminating legal value to a
  broken response). **How well each table is backed differs**: `BOT_CATEGORIES` is enumerated
  verbatim in the service spec; `suspicious` in `BOT_BANDS` is inferred; four of the six
  `BOT_TYPES` are back-translated from a prose sentence and may not match the real identifiers —
  the spec enumerates `type` nowhere. A wrong guess costs resolution, not safety. **The collapse
  is logged** (one `warn` per affected request), because a silent vocabulary drift would be the
  same failure class as the bugs this hardening pass was about. A key whitelist alone does not stop an
  existing key whose value the service later widens — `primarySignal: "asn_spam:AS55967/Baidu/76ip"`
  is 27 characters and would sail through any length cap. Unknown values collapse to `'other'`:
  still visible as "something fired", but unable to carry a payload. The lookup uses `=== 1`,
  not truthiness, so `toString`/`constructor` cannot inherit their way past it.
- The signals loop bounds **the work, not only the output**: `{"length": 50000000}` passes the
  duck-check and never grows the result, so an output-only cap would spin 50 million times and
  stall `/aGTM.js` — and with it the GTM load — on ~40 bytes of response body.
- `buildAndSend` is declared **before** its callers. It used to sit at the end of the file,
  making every *synchronous* serve path (no Session API, or an unresolvable session uid) a
  forward reference to a `const` function expression — a temporal-dead-zone error that killed
  the whole response. The async path masked it, which is why it survived from `9d302d7` to
  F-130. `test/sgtm/serve-paths.test.js` runs the real source against stubbed server APIs and
  asserts every path reaches a response.
- Otherwise the verdict is forwarded to the browser as **`c.bot`** → `aGTM.d.bot`, so webGTM
  can mark borderline traffic (e.g. a `traffic_type` dimension) instead of only hard-blocking.
- **Own top-level config key, not part of `session`**: the check runs before and independently
  of the Session API, so a session outage must not drop the verdict, and the verdict must not
  open the library's session preset gate (which drives `session_status`).
- `botFieldsFromResponse()` is a **whitelist** — the opposite of the Sources API capture,
  which blacklists. This payload is readable by every script on the page, so a field the
  service adds later must be opted in by a code change instead of leaking on the next API
  deploy. Forwarded: `isBot`, `score`, `band`, `primarySignal`, and `signals[]` reduced to
  `{type, category, score, confirmed}` (capped at 10). **`signals[].detail` is deliberately
  dropped** — for `asn_reputation` it carries tenant-wide aggregates about *other* visitors
  (`asn`, `asnOrg`, `uniqueIps`, `requests`, `consecutiveWindows`).

### Sources API integration (sGTM Client only)

Server-side POST to a Sources API (`api4sources`) on every aGTM.js request. The POST is the Client's; its **response** flows into the library: every non-meta field is captured into `cfg.session.*`, which the library deep-copies into `aGTM.d.session.*` so webGTM can read it via a plain JS variable.

- After the Session API step completes (so the session is committed in the shared Redis), the Client POSTs `{user_id, page_location, referrer, timestamp}` to `{sources_api_url}/{tenant}`.
- `page_location` and `referrer` come from the integration code's `?c=` base64 payload; `user_id` is the resolved session uid; tenant is reused from the existing `tenant_id` config.
- **URL build:** `sources_api_url` holds the bare base **WITHOUT** tenant or query (e.g. `…/tp/sources`); the Client appends `/{tenant}` at runtime (same convention as the session/consent/promote endpoints). With attribution on, `?attribution=true&method=<…>` is appended **after** the tenant. Putting tenant/query into the field produces a malformed URL like `…/tp/sources/fcm/?attribution=true/fcm` (double tenant).
- Race-free with api4sources' Redis lookup (`customer_sessions:{tenant}:{user_id}`) — the Session API write happened first within the same Client request.
- **Sequential before `buildAndSend`** (changed from fire-and-forget): the POST is awaited because its response carries tracking payload. On 2xx, the Client copies **every non-meta top-level field** of the response into `sessionData` (meta = `ok`/`tenant`/`session_id`/`ts`/`skipped`/`reason`; reserved session keys `uid`/`sid`/`consent`/… **and the Session API counters** `created`/`lastInteraction`/`pvCount`/`eventCount`/`sessionCount` are blacklisted too so the API cannot clobber the session — `fireSources()` runs *after* the Session API step has filled those in and writes into the same object; empty/null values are skipped). **Note the deliberate asymmetry to the bot check:** the Sources response is payload the tenant configured and wants in the browser, so a new field there is a feature and the filter is a blacklist. The bot-check response is a classifier's verdict about the visitor, so a new field there is a leak and the filter is a whitelist (see §"Bot check"). The flat affiliate `source` (last-cookie-win, e.g. `"it_webgains"`) thus lands at `aGTM.d.session.source`. On timeout/error/non-2xx nothing is captured and delivery proceeds. Adds one internal round-trip to /aGTM.js latency — **operational caveat:** an api4sources outage now blocks `/aGTM.js` (and GTM loading) by up to the 1500 ms timeout for every visitor while `sources_enabled` is on; monitor api4sources latency.
- **Attribution (inline, opt-in):** with `sources_attribution` on, the POST appends `?attribution=true&method=<sources_method>` and api4sources returns an `attribution` object **in the same response** (no separate request). The Client wraps it by method — `sessionData.attribution = { <method>: <obj> }` — which **re-activates** the library's attribution machinery: `config()` runs `resolveAttribution` per method (HYBRID merge: current URL wins for browser-derivable fields like utm/click-IDs, API wins for cross-session memory like `afs`/`lcs`/`fss`). webGTM reads e.g. `aGTM.d.attribution.last_touch.sou`. Note: the inline attribution reflects the state **before** this request (ClickHouse Materialized-View lag); the HYBRID merge compensates this only for the browser-derivable fields (via the fresh URL) — the pure API fields `afs`/`lcs`/`fss` have no URL fallback and can lag on the first request of a new session's source. The POST is single-method (`method=`), so `sources_method` is a single SELECT.
- **webGTM read path:** a standard GTM "JavaScript Variable" — `aGTM.d.session.source` for the affiliate source, `aGTM.d.attribution.<method>.<field>` for attribution. No custom template needed. The preset gate (Client + library) accepts a session carrying only a **non-empty** `source`/`attribution`, so the value survives even a degraded Session API response (no `sid`/`consent`). (An empty `source` is skipped at capture, so it does not by itself keep an otherwise-empty session.)
- Template options (sGTM Client): `sources_enabled` (boolean, default false), `sources_api_url` (text, bare base), `sources_attribution` (boolean, default false), `sources_method` (SELECT: `last_touch`/`first_touch`/`last_click`/`first_click`/`last_non_direct_click`, default `last_touch`). Tenant reused from `tenant_id`.
- API specs (api4sources + api4sgtm) + integration guide + combined smoketest live in `internal/api/` (gitignored). Smoketest steps 5-8 cover sources POST contract; 9-10 + 15 cover read/attribution; 16-18 cover sources edge cases; 19-20 cover api4sgtm session promote; 21 covers content-store hash roundtrip. All steps run in one HTTP request; output is a slim HTML overview by default and `?format=json` for the full report.
- **Standalone Attribution GET removed (client-side, 2026-06-22):** the externally-added Attribution API call (`fireAttribution` + template fields `attribution_enabled`/`attribution_api_url`/`attribution_methods`) was end-to-end non-functional — it pointed at `…/tp/sources/…?methods=` instead of the `…/tp/attribution/…` endpoint (404). It is replaced by the inline `?attribution=true` on the Sources POST above (one request instead of two). The **library-side** attribution code is unchanged and now fed by the inline path.
- Tradeoff: SPA virtual pageviews mid-session are not captured. Acceptable because attribution cares about session source, not in-session navigation; and api4sources dedups on source fingerprint anyway. SPA-source capture is a v1.6+ topic (would need a `/aGTMsources` browser proxy path).

---

## CMP Files

Each file in `cmp/` implements the `aGTM.f.consent_check` function for a specific Consent Management Platform. The function signature is always:

```javascript
aGTM.f.consent_check = function(action) { ... }
```

where `action` is either `"init"` or `"update"`. The function returns `true` on success, `false` otherwise. It writes results into `aGTM.d.consent`.

**Available CMPs** (as of v1.5): Borlabs 2, Borlabs 3, CCM19, Clickskeks, Consentmanager, Cookiebot, Cookiefirst, JTL Consent, JTL EU Cookie, Klaro, Magento CC Cookie, Matomo, OneTrust/CookiePro, Orestbida CookieConsent, Perspective Funnel, Secure Privacy, Shopify Consent, Shopware 5 Cookie, Shopware 6 Cookie, Shopware Acris Cookie, Sourcepoint, Tramino, Usercentrics v2, Usercentrics v3, Simple Cookie Regex Check.

---

## GTM Custom Templates

Template files use the `.tpl` format (GTM's JSON-based template format). File naming convention uses spaces: `aGTM tag - Click Events.tpl` (not dashes). This applies to all templates in `gtm/`.

Each template subdirectory contains:
- The `.tpl` file
- A `README-gtm-tag-<name>.md` documentation file

### DL-Repeat tag → `aGTM.f.dlrepeat` (v1.5+)

The **"aGTM - DL Repeat"** tag (`gtm/tags/dl-repeat/`) is, from v1.5, a thin wrapper: it collects its fields into a `cfg` object and calls **`aGTM.f.dlrepeat(cfg)`** in the library once. The replay/late-enrichment engine (gate-wait, poll, source `f`/`dl`/`live`, `aGTMrepeated` marking, once-per-page dedup) lives in `aGTM.js` because the GTM web sandbox has no `setInterval` — so the tag needs only a **single trigger**. **Conditional gate (v1.5):** a `gateEvents` token may be `G?if=E[A]` / `G?if=E[A:V]` (or `G?if=E` = presence of `E`) — `G` is only required when an event `E` has a non-empty attr `A` / `A===V` / exists (empty = `null`/`undefined`/`""`; a token without `?if=` is unconditional). An absent discriminator `E` keeps the gate **waiting** (tri-state), it is not an instant skip — so the bare `?if=E` form waits like listing `E` itself; the `[A]` form gives a fast skip only because its discriminator (`user`) is always emitted. The predicate reuses the `consent_events` `event[attr]` **parse** syntax, but note the empty-value handling differs: a bare `[A]` here means **non-empty**, whereas `consent_events`' `[attr]` matches on mere presence. A malformed predicate (no `]`, empty attr/event, trailing junk after `]`) falls back to **unconditional** (fails safe) + a debug warning; a token with an empty gate name before `?if=` is skipped. If the discriminator `E` is absent at gate-check the gate waits (tri-state), so a late `E` can't cause a silent unenriched replay. Use `user_data?if=user[id]` so guests — who never receive `user_data` — replay in order immediately instead of hitting the timeout fallback, while logged-in visitors still wait for enrichment. The fallback control event also requires `fired > 0` (no alert when nothing was replayed) and carries `aGTMrepeatMissing` (comma-list of gate event(s) absent at the timeout — the culprit) + `aGTMrepeatWaited` (give-up ms) for diagnostics. The tag therefore **requires the aGTM library v1.5+** (guarded: warns + no-op on older). See `README-for-Developers.md` §"DL-Repeat / Late-Enrichment" and `gtm/tags/dl-repeat/README-gtm-tag-dl-repeat.md`.

> **GTM web template sandbox** (distinct from the sGTM server sandbox): no `delete` operator (set the property to `undefined` instead — `JSON.stringify` drops it), no `setInterval`, only the required APIs (`callInWindow`/`copyFromWindow`/`setInWindow`/`queryPermission`/`logToConsole`/`JSON`). Every global path used must be declared in `___WEB_PERMISSIONS___`.

---

**Roadmap:** [ROADMAP.md](ROADMAP.md)
