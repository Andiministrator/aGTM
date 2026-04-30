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
├── cmp/                 # Consent check functions, one file per CMP provider
│   ├── cc_<name>.js     # Source version
│   └── cc_<name>.min.js # Minified version
├── gtm/                 # GTM Custom Templates (.tpl files) and their READMEs
│   ├── tags/            # Tag templates (click, form, scroll, pageview, etc.)
│   └── variables/       # Variable templates
├── sgtmClient/          # Server-side GTM client template
├── ext/                 # Extensions (e.g. Stape.io integration)
├── assets/              # Images, Excel event overview
├── tmp/                 # Temporary files / backups (not production-relevant)
└── CLAUDE.md            # This file
```

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
| `scripts/inject-version.js` | Reads `VERSION`, writes `@version` + `aGTM.d.version` in `aGTM.js`, updates `@lastupdate`, updates `package.json` |
| `scripts/check-init.js` | Strips comments from `aGTM.js` and checks for an accidental uncommented `aGTM.f.init()` call |
| `scripts/update-sgtm-template.js` | Reads `aGTM.base64` and version from `aGTM.js`, injects both into `sgtmClient/template.tpl` |
| `bunfig.toml` | Configures `bun test`: preloads `test/setup.js` before every test file |
| `test/setup.js` | Sets up browser globals (`window`, `document`, etc.) and loads `aGTM.js` into global scope via indirect eval |
| `test/helpers.js` | `MockXHR` class and `resetAGTM()` — used in every test file |

**Release flow:** edit `VERSION` → `./build.sh` → commit → merge `dev` → `main` → `git tag v<version>`

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
  ├─ [cfg.session is an object with sid OR consent]
  │    └─ aGTM.d.session = deep-copy of cfg.session
  │       ├─ [cfg.session.consent is a valid object: hasResponse===true,
  │       │   typeof services==='string']
  │       │    → aGTM.d.consent = deep-copy of cfg.session.consent
  │       │      aGTM.d.consent_hash = consent_serialize(...)
  │       │      session_status = 'preset_with_consent'
  │       └─ [otherwise]
  │            → session_status = 'preset'
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
  ├─ [useListener == false]  setInterval(aGTM.f.call_cc, 500ms)
  └─ [useListener == true]   — no timer; integrator calls aGTM.f.call_cc() manually
                                from their own CMP event listener

aGTM.f.call_cc()             — called by timer, manually, or sync from config()
  ├─ aGTM.f.run_cc('init' | 'update')
  │    ├─ [action === 'update'] B2 field-reset:
  │    │    aGTM.d.consent.hasResponse = false; services/purposes/vendors = "";
  │    │    consent_id/serviceIDs/feedback = ""; delete blocked.
  │    │    Stale preset values cannot survive a real CMP decision.
  │    │
  │    ├─ aGTM.f.consent_check(action)    — CMP-specific function (from cmp/ file)
  │    │    └─ on 'init' with hasResponse=true → short-circuit returns true
  │    │       (load-bearing for preset_with_consent path)
  │    │
  │    ├─ evaluates gtmPurposes/Services/Vendors → sets aGTM.d.consent.gtmConsent
  │    │   (fallback: aGTM.d.consent.blocked === true → gtmConsent=true.
  │    │    Set by sGTM Client server-side auto-denial in cfg.session.consent.)
  │    │
  │    └─ [end of run_cc()] consent diff/store:
  │         new_hash = consent_serialize(aGTM.d.consent)   — blacklist gtmConsent/blocked
  │         if (consent_store_url && new_hash !== aGTM.d.consent_hash):
  │            xhr = xsend(consent_store_url, {uid, sid, consent: <without gtm/blocked>})
  │            xhr.onreadystatechange: on 2xx → consent_hash = new_hash;
  │                                              session_status = 'synced'
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
| `aGTM.c.consent_store_url` | Phase 3: POST endpoint for consent diffs (sGTM Client persists into Session API record) |
| `aGTM.c.consent_store_enc` | Phase 3: encrypt consent-store POST payload with `session_salt` |
| `aGTM.d` | Runtime data (consent state, queues, counters, …) |
| `aGTM.d.f` | Queue for events delayed until consent is available; also carries pre-existing DL items for `hastyEvents` replay |
| `aGTM.d.dl` | Internal copy of all events passed through `fire()` |
| `aGTM.d.consent` | Current consent state written by `consent_check`; `.gtmConsent` controls GTM injection |
| `aGTM.d.consent_hash` | Phase 3: stable serialization of `aGTM.d.consent` (blacklist of `gtmConsent`/`blocked`) at the last successful consent-store POST. Used by `run_cc()` to detect change. |
| `aGTM.d.init` | `true` once GTM has been injected; guards `inject()` from running twice |
| `aGTM.d.session` | Session & user data pre-populated from `cfg.session` (sGTM Client injection — see Session Feature below) |
| `aGTM.d.session_status` | Consent-sync lifecycle: `""` (no preset), `"preset"` (cfg.session accepted, no usable consent), `"preset_with_consent"` (preset consent seeded into `aGTM.d.consent`), `"synced"` (CMP decision diffed and POSTed to `consent_store_url`), `"confirmed"` (CMP decision matches the preset, no POST needed). |
| `aGTM.l` | Log array (decoded by `aGTM_debug.js`) |

### Session Feature

> **Status (v1.5 redesign, Phase 3 complete):** Full design in [SESSION-REDESIGN.md](SESSION-REDESIGN.md) at the repo root — read it before working on session/consent code. The session feature is now driven entirely by the sGTM Client (no client-side HTTP fetch). Phase 3 adds consent passthrough on read, diff-driven POST on update, and a synchronous fast-path for returning visitors with stored consent.

**Config options (v1.5):**

| Option | Type | Default | Description |
|---|---|---|---|
| `user_id` | string | `""` | Optional logged-in user CRM ID, exposed for integrators |
| `session_salt` | number | `0` | Encryption salt for the consent-store POST (also fallback for POST transport) |
| `consent_store_url` | string | `""` | POST endpoint for consent diffs. The sGTM Client handler manages the user-ID cookie AND persists the consent into the Session API record. Empty string disables the feature. |
| `consent_store_enc` | boolean | `false` | If `true`, the consent-store POST payload is encrypted with `session_salt` |
| `session` | object | `null` | Pre-populated session object from sGTM Client; accepted when it is an object containing a `sid` **or** a `consent` field |

**Removed (gone, no migration code, v1.5 unreleased):** Config: `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url`, `session_deny_service`. Functions: `aGTM.f.session_fetch`, `aGTM.f.session_apply_denial`, `aGTM.f.xfetch`. Data keys: `aGTM.d.session_ready`, `aGTM.d.consent_sent`.

**Preset gate** (in `aGTM.f.config()`): if `cfg.session` is an object with `sid` or `consent`, it is deep-copied into `aGTM.d.session`. Then:
- If `cfg.session.consent` is a valid object (`hasResponse === true`, `typeof services === 'string'`), it is deep-copied into `aGTM.d.consent`, `aGTM.d.consent_hash` is seeded via `consent_serialize`, `session_status = 'preset_with_consent'`. At end of `config()`, `aGTM.f.call_cc()` is called synchronously so GTM injects on this tick — without waiting for the 500 ms `consent_listener` poll.
- Otherwise `session_status = 'preset'` and the CMP path proceeds normally.

**Consent diff/store** (in `aGTM.f.run_cc()`, end of success path):
- `new_hash = aGTM.f.consent_serialize(aGTM.d.consent)` — blacklist serialization (excludes `gtmConsent`/`blocked` and empty/null values).
- If `consent_store_url` is set AND `new_hash !== aGTM.d.consent_hash` → POST `{uid, sid, consent: <without gtmConsent/blocked>}` to `consent_store_url` via `aGTM.f.xsend()`. On 2xx response (`xhr.onreadystatechange` gate): update `aGTM.d.consent_hash = new_hash`, set `session_status = 'synced'`. On non-2xx: leave the hash unchanged so the next `run_cc()` retries.
- If hash matches: `session_status = 'confirmed'` (server already had this state, no POST).

**Update-path field reset** (in `aGTM.f.run_cc('update')`, before `consent_check`): `hasResponse=false`, `services/purposes/vendors/consent_id/serviceIDs/feedback=""`, `delete blocked`. Ensures stale preset values from server-side auto-denial don't survive a real CMP decision.

**`aGTM.f.consent_serialize(c)`**: stable, sorted, blacklist-based serialization of a consent object. Used by both the preset hash seed and the diff check. Excludes `gtmConsent`, `blocked`, and empty/null values (so adding/removing an empty field doesn't create phantom diffs).

**`blocked` field semantics**: server-side auto-denial in the sGTM Client sets both `gtmConsent: <autoDenyLoadGtm>` AND `blocked: <autoDenyLoadGtm>` in `cfg.session.consent`. The `blocked` field is recognised by the `run_cc()` chelp fallback: when chelp checks fail (services don't match the requirement), `gtmConsent` falls back to `blocked`. The B2 update-path reset deletes `blocked` so an explicit user CMP decision always wins over server policy.

### POST Transport & consent bypass

- **`aGTM.c.transport_url`** / **`transport_enc`** / **`transport_salt`** — global defaults for POST, set via `aGTM.f.config()`
- **`_post`** event property — per-event POST control; `true` uses global defaults, or an object `{ url, enc, salt, consent }` with optional overrides; POST respects the consent gate like any other event
- **`_post_sent`** — deduplication flag; set to `true` by aGTM after the POST is sent, prevents double-sending during dataLayer replay
- **`_noConsent`** event property — bypasses the consent gate for both DL push and POST; the property remains visible in the dataLayer event; use for functional/legal events that must be tracked regardless of consent
- **`_noDLPush`** event property — skips `sendnaus()`/`iFrameFire()` so the event is **not** pushed to the GTM dataLayer; the event is still recorded in `aGTM.d.dl` and `aGTM.l`, and POST transport still fires; use with `_noConsent` for pre-consent events that should not trigger GTM tags

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

---

**Roadmap:** [ROADMAP.md](ROADMAP.md)
