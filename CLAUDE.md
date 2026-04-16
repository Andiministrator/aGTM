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

Requires Node.js and npm. On Arch/CachyOS:
```bash
sudo pacman -S npm
npm install --no-bin-links
```

Note: `--no-bin-links` is required because the `/data` partition is vfat (FAT32), which does not support symlinks. The build script calls terser directly via `node ./node_modules/terser/bin/terser` for the same reason.

This installs `terser` as a dev dependency (defined in `package.json`).

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

### Event dispatch call graph

The central path from an external event push to the GTM dataLayer:

```
aGTM.f.fire(o)
  │
  ├─ aGTM.f.sStrf(o) + JSON.parse()   — deep copy of event object
  ├─ obj.aGTMts = Date.now()           — timestamp
  ├─ aGTM.f.run_cc("update")          — triggered when o.event matches a consent_event
  ├─ Get Standard DL variables         — enrich obj from GTM data model if loaded
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
       ├─ [iframe mode]
       │    └─ aGTM.f.iFrameFire(obj)
       │         ├─ [aGTM/GTM internal events] → aGTM.f.sendnaus(obj)
       │         └─ [user events] → window.top.postMessage(obj, origin)
       │                            (or queue until handshake)
       │
       ├─ [normal mode]
       │    └─ aGTM.f.sendnaus(obj)
       │         ├─ detect/protect against dataLayer.push hooks
       │         ├─ window[gdl].push(obj)   — actual GTM dataLayer push
       │         └─ aGTM.f.sendnaus_callback(obj)  — if defined
       │
       └─ aGTM.f.fire_callback(obj)    — if defined
```

### Key callbacks (overridable by integrators)

| Callback | Triggered by | Receives |
|---|---|---|
| `aGTM.f.fire_callback` | end of `fire()` | final event object |
| `aGTM.f.sendnaus_callback` | end of `sendnaus()` | event object pushed to DL |
| `aGTM.f.consent_callback` | end of `run_cc()` | action (`"init"` / `"update"`) |
| `aGTM.f.inject_callback` | after GTM script injection | — |
| `aGTM.f.optout_callback` | on opt-out detection | — |

### Data stores

| Object | Purpose |
|---|---|
| `aGTM.c` | Configuration (set via `aGTM.f.config()`) |
| `aGTM.d` | Runtime data (consent state, queues, counters, …) |
| `aGTM.d.f` | Queue for events delayed until consent is available |
| `aGTM.d.dl` | Internal copy of all events passed through `fire()` |
| `aGTM.d.consent` | Current consent state written by `consent_check` |
| `aGTM.l` | Log array (decoded by `aGTM_debug.js`) |

### POST Transport & consent bypass

- **`aGTM.c.transport_url`** / **`transport_enc`** / **`transport_salt`** — global defaults for POST, set via `aGTM.f.config()`
- **`_post`** event property — per-event POST control; `true` uses global defaults, or an object `{ url, enc, salt, consent }` with optional overrides; POST respects the consent gate like any other event
- **`_post_sent`** — deduplication flag; set to `true` by aGTM after the POST is sent, prevents double-sending during dataLayer replay
- **`_noConsent`** event property — bypasses the consent gate for both DL push and POST; the property remains visible in the dataLayer event; use for functional/legal events that must be tracked regardless of consent

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
