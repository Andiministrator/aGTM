# aGTM - Developer Documentation

![aGTM  a Galactic Tagging Modulator](/data/_Projects/aGTM/assets/aGTMdeveloper-100px.png)

#### Overview

`aGTM.js` is a global implementation script designed for developers who want to extend, customize, or integrate Google Tag Manager (GTM) and Google Analytics (GA) functionality based on user consent. This documentation covers the internal workings, extensibility options, and callback functions for developers.

- **Version**: 1.5
- **Last Updated**: 16.04.2026
- **Author**: Andi Petzoldt [andi@petzoldt.net](mailto:andi@petzoldt.net)
- **Repository**: [GitHub Repository](https://github.com/Andiministrator/aGTM/)

## Table of Contents

1. [Initialization and Configuration](#initialization-and-configuration)
2. [Consent Management](#consent-management)
3. [GTM Integration](#gtm-integration)
   - 3a. [POST Transport](#post-transport)
4. [Callbacks](#callbacks)
5. [Utility Functions](#utility-functions)
6. [Extending `aGTM`](#extending-agtm)
7. [Usage Examples](#usage-examples)
8. [Contributing & Development Setup](#contributing--development-setup)

## Initialization and Configuration

### Initializing the `aGTM` Object

The main object is initialized if it doesn't already exist:

```javascript
window.aGTM = window.aGTM || { f: {} };
```

### Configuration Function

Use `aGTM.f.config()` to set up configurations for GTM containers, consent management, and other settings.

#### Example Configuration

```javascript
aGTM.f.config({
  gtm: { 'GTM-XYZ123': {} },
  gtmPurposes: 'statistics',
  sendConsentEvent: true
});
```

## Consent Management

### Consent Check

The `aGTM.f.run_cc()` method checks and updates the consent status.

```javascript
aGTM.f.run_cc('init');
```

### Loading Consent Tools

Load consent scripts like Cookiebot using:

```javascript
aGTM.f.load_cc('cookiebot', function() {
  console.log('Cookiebot loaded');
});
```

### Consent Callback

To execute a function when consent changes, define `aGTM.f.consent_callback`:

```javascript
aGTM.f.consent_callback = function(action) {
  console.log("Consent status updated:", action);
};
```

## GTM Integration

### Loading GTM Containers

The `aGTM.f.gtm_load()` function loads the GTM script based on a container ID.

```javascript
aGTM.f.gtm_load(window, document, 'GTM-XYZ123', 'dataLayer', {});
```

### Event Firing

To push events to GTM's dataLayer, use `aGTM.f.fire()`:

```javascript
aGTM.f.fire({ event: 'pageview', pagetype: 'blog' });
```

`fire()` is the main entry point for all user-initiated events. It handles consent gating, queuing, and delegates to the appropriate dispatch path. Do not call `sendnaus()` directly for user events — always go through `fire()`.

#### Internal call graph

```
aGTM.f.fire(o)
  │
  ├─ Deep copy via sStrf() + JSON.parse()
  ├─ Consent-event check → aGTM.f.run_cc("update")
  ├─ Get Standard DL variables
  │
  ├─ [no consent && !_noConsent]  →  queued in aGTM.d.f, replayed on consent
  │
  └─ [consent present OR _noConsent]
       ├─ [_post && !_post_sent]  → aGTM.f.xsend()  (_post_sent = true after send)
       │
       ├─ aGTM.d.dl.push()           internal event log
       ├─ [iframe mode] → aGTM.f.iFrameFire()
       │     ├─ internal events  → aGTM.f.sendnaus()
       │     └─ user events      → window.top.postMessage() (or queue)
       └─ [normal mode] → aGTM.f.sendnaus()
             ├─ dataLayer hook detection/protection
             ├─ window[gdl].push()   actual GTM dataLayer push
             └─ sendnaus_callback()
```

After the dispatch, `fire()` calls `aGTM.f.fire_callback()` if defined.

#### Consent gating

Events fired before consent is available are stored in `aGTM.d.f` and replayed automatically once consent arrives. Events whose `event` property starts with `aGTM` bypass the consent gate and are always dispatched immediately (internal lifecycle events).

#### dataLayer hook protection

`sendnaus()` detects when `dataLayer.push` has been replaced by a third party. Depending on `aGTM.c.dlOrgPush`, it can log the hook, use the original push function, or replace the hook with the original. This protects against tracking tools that intercept the dataLayer.

### Injection & Consent Flow

Understanding when and how GTM gets injected into the DOM is essential for extending aGTM or debugging consent-related issues.

#### Overview

aGTM sits between the page and Google Tag Manager. Its core job is: **do not inject GTM until the user's consent decision is available.** Events fired before consent are queued and replayed once GTM is loaded.

The flow starts with `aGTM.f.init()`, which the integrator calls after providing the configuration and the CMP-specific `consent_check` function.

#### Call graph

```
aGTM.f.init()
  │
  ├─ aGTM.f.optout()              — abort entirely if opt-out cookie/param is set
  ├─ aGTM.f.config(aGTM.c)       — apply and lock the configuration
  │
  ├─ [iframe mode: iframeSupport == true && page is inside an iframe]
  │    └─ consent forced true, listen for parent handshake → inject()
  │
  └─ [normal mode]
       ├─ [cmp == 'none']         — skip consent entirely, inject immediately
       ├─ [cmp == '<name>']       — load cmp/<name>.min.js, then start listener
       └─ [no cmp set]            — start listener directly
            │
            └─ in all non-none cases: initGTM(true)
                 — loads containers with noConsent:true immediately (no consent wait)

aGTM.f.consent_listener()
  ├─ [useListener == false]   setInterval(call_cc, 500ms)  — default polling
  └─ [useListener == true]    no timer started; integrator calls call_cc() manually
                               from their CMP event handler

aGTM.f.call_cc()
  ├─ run_cc('init')
  │    ├─ consent_check('init')   — CMP-specific; reads CMP state, writes aGTM.d.consent
  │    └─ evaluates gtmPurposes / gtmServices / gtmVendors
  │         → sets aGTM.d.consent.gtmConsent = true/false
  ├─ clears the consent interval timer
  └─ inject()

aGTM.f.inject()
  ├─ copies pre-existing window[dataLayer] items into aGTM.d.f (queue)
  ├─ [gtmConsent == true]
  │    └─ initGTM(false) → gtm_load() per container
  │         ├─ pushes aGTM_ready event (with aGTM.hastyEvents = aGTM.d.f)
  │         ├─ pushes gtm.js event
  │         └─ inserts <script id="aGTM_tm_<id>"> into the DOM
  │              GTM loads asynchronously from here
  └─ chkDPready() — fires aDOMready / aPAGEready if dlStateEvents is configured
```

#### The event queue (`aGTM.d.f`)

`aGTM.d.f` is an array that serves as a holding area for events that cannot yet be sent to GTM:

- **Before consent**: every `aGTM.f.fire()` call that fails the consent gate pushes the event to `aGTM.d.f` instead of the dataLayer.
- **Pre-existing dataLayer items**: when `inject()` runs, it copies any items already in `window[dataLayer]` into `aGTM.d.f` too, so they are not lost.
- **After GTM loads**: `aGTM.d.f` is passed as `aGTM.hastyEvents` inside the `aGTM_ready` dataLayer event. A GTM Custom Template (see `gtm/`) reads this array and re-fires each queued event through the dataLayer.

Events whose `event` name starts with `aGTM` always bypass the consent gate and are never queued — they are internal lifecycle events.

#### `noConsent` containers

A GTM container can be configured with `noConsent: true`:

```javascript
aGTM.f.config({
  cmp: 'cookiebot',
  gtm: {
    'GTM-XXXXXXXX': {},           // consent-gated
    'GTM-YYYYYYYY': { noConsent: true }  // loaded immediately, no consent wait
  }
});
```

`initGTM(true)` is called at startup and injects only `noConsent` containers. The normal consent-gated containers are injected later by `inject()`.

**Important:** `noConsent` containers receive the `aGTM_ready` event *before* any consent decision has been made. `aGTM.hastyEvents` is available, but `aGTMconsent.hasResponse` may be `false`. Do not use `noConsent` containers for anything that requires consent — they are intended for functional or legal tracking that must run unconditionally.

#### `useListener` mode

By default, aGTM polls for consent every 500ms. If your CMP fires a JavaScript event when consent is given, you can disable the timer and call `aGTM.f.call_cc()` directly:

```javascript
// In your CMP event listener:
document.addEventListener('CmpConsentGiven', function() {
  aGTM.f.call_cc();
});
```

Set `useListener: true` in the config so the polling timer is not started. The CMP file for that provider typically implements this listener.

For consent *updates* (user changes their decision after initial load), call `aGTM.f.run_cc('update')` instead — or configure `consent_events` in the config so aGTM picks up the update event automatically when it passes through `fire()`.

### `_noConsent` flag

Set `_noConsent: true` on any event to bypass the consent gate in `aGTM.f.fire()`. The event is pushed to the dataLayer immediately without waiting for consent.

```javascript
aGTM.f.fire({ event: 'form_submit', form_id: 'contact', _noConsent: true });
```

`_noConsent` is preserved in the dataLayer event so GTM tags can react to it. It also controls POST: a `_post` event without `_noConsent` will only send the POST once consent is available.

Use this for events that must be tracked regardless of consent (e.g. functional events, error tracking, legal notifications).

### POST Transport

`aGTM.f.fire()` can send events directly as HTTP POST to a configurable endpoint — independent of the webGTM container. By default, POST respects the consent gate like any other event; set `_noConsent: true` to send immediately without consent.

#### Configuration (global defaults)

```javascript
aGTM.f.config({
  transport_url:  'https://sgtm.example.com/collect',
  transport_enc:  true,
  transport_salt: 42
});
```

#### Per-event POST trigger

Add a `_post` property to the event object passed to `aGTM.f.fire()`:

```javascript
// POST with global defaults
aGTM.f.fire({ event: 'purchase', revenue: 99.9, _post: true });

// POST with per-event overrides (all keys optional)
aGTM.f.fire({
  event: 'purchase',
  revenue: 99.9,
  _post: { url: 'https://sgtm.example.com/collect', enc: true, salt: 42, consent: true }
});
```

| `_post` key | Type | Description |
|---|---|---|
| `url` | string | Endpoint URL (overrides `transport_url`) |
| `enc` | boolean | Encrypt payload (overrides `transport_enc`) |
| `salt` | number | Salt for encryption (overrides `transport_salt`) |
| `consent` | boolean | Attach current consent state to POST body |

`_post_sent: true` is set on the event object by aGTM after the POST is sent. The webGTM Community Tag checks this flag and skips its own `sendPixel` call to avoid double-sending.

#### POST body format

Plain (`enc: false`):
```json
{ "e": { "event": "purchase", "revenue": 99.9, ... } }
```

Encrypted (`enc: true`):
```json
{ "q": "<obfuscated string>" }
```

The encryption uses Base64 + Caesar shift, compatible with the aEvents GTM tag. The sGTM server can decode both formats with the same logic.

#### Standalone usage (no webGTM)

When no GTM container is configured, `aGTM.f.fire()` still sends the POST and pushes to the local dataLayer. No GTM is required:

```javascript
aGTM.f.config({ transport_url: 'https://sgtm.example.com/collect', transport_salt: 42 });
aGTM.f.init();
aGTM.f.fire({ event: 'pageview', _post: { enc: true } });
```

## Callbacks

### Available Callback Functions

Developers can utilize or override the following callbacks:

- **`aGTM.f.consent_callback(action)`**: Executes when consent status is checked or updated.
  - `action`: `'init'` or `'update'`
- **`aGTM.f.inject_callback()`**: Executes after GTM scripts are injected.
- **`aGTM.f.fire_callback(eventObj)`**: Executes after an event is fired into the dataLayer.
  - `eventObj`: The event object pushed to the dataLayer.
- **`aGTM.f.optout_callback()`**: Executes when the user opts out via a cookie or URL parameter.

### Example Usage of Callbacks

```javascript
aGTM.f.fire_callback = function(event) {
  console.log("Event fired:", event);
};
aGTM.f.inject_callback = function() {
  console.log("GTM scripts injected");
};
```

## Utility Functions

### Logging and Debugging

Log messages and errors using `aGTM.f.log()`:

```javascript
aGTM.f.log('m3', { message: 'Event triggered' });
```

### String Sanitization

Clean strings using:

```javascript
var cleanStr = aGTM.f.strclean('dirty;string');
```

### URL Parameter Handling

Extract URL parameters using:

```javascript
var param = aGTM.f.urlParam('utm_source', window.location.href);
```

## Extending `aGTM`

### Adding Custom GTM Containers

You can extend the existing functionality by adding new GTM containers dynamically:

```javascript
aGTM.c.gtm['GTM-NEWID'] = { debug_mode: true };
aGTM.f.initGTM();
```

### Creating Custom Consent Checks

Override the default consent check function:

```javascript
aGTM.f.consent_check = function(action) {
  return myCustomConsentFunction();
};
```

### Handling Dynamic Elements

Use the `aGTM.f.observer()` function to track dynamically added elements:

```javascript
aGTM.f.observer('button', 'click', function(event) {
  console.log('Button clicked:', event);
});
```

## Usage Examples

### Minimal Setup with Cookiebot

```javascript
aGTM.f.config({
  cmp: 'cookiebot',
  gtm: { 'GTM-XYZ123': {} }
});
aGTM.f.init();
```

### Tracking Form Interactions

```javascript
aGTM.f.addElLst('form', 'submit', function(event) {
  console.log('Form submitted:', event);
});
```

### Error Monitoring

Monitor JavaScript errors:

```javascript
aGTM.f.jserrors();
```

## Contributing & Development Setup

### ES5 Requirement

**All JavaScript in this repository must be written in ES5.** This applies to `aGTM.js`, all `cmp/*.js` files, GTM templates, and extensions.

Reason: The code may be executed inside the Google Tag Manager sandboxed JavaScript environment, which only supports ECMAScript 5. Do **not** use:
- `let` / `const` → use `var`
- Arrow functions `() => {}` → use `function() {}`
- Classes, template literals, destructuring, spread operator, `Promise`, etc.

### Build Process

The derived files (`aGTM.min.js`, `cmp/*.min.js`, `aGTM.base64`) are generated from source using a build script. **Do not edit the `.min.js` or `.base64` files directly** — they will be overwritten on the next build.

**Setup (first time):**
```bash
# Install Node.js and npm if not present (Arch/CachyOS)
sudo pacman -S nodejs npm

# Install build dependencies (--no-bin-links required on FAT32/vfat filesystems)
npm install --no-bin-links
```

**Build:**
```bash
./build.sh
```

**What gets built:**

| Source | Output | Notes |
|---|---|---|
| `aGTM.js` | `aGTM.min.js` | Minified (terser, ES5, keep_fnames) |
| `cmp/cc_<name>.js` | `cmp/cc_<name>.min.js` | Minified |
| `aGTM.min.js` | `aGTM.base64` | Base64-encoded, embedded in sGTM client template |

**Minification flags:** `--ecma 5 --keep-fnames --compress --mangle`
- `--ecma 5`: enforces ES5-compatible output
- `--keep-fnames`: function names are preserved because aGTM references them by name internally

### The `aGTM.f.init()` call

`aGTM.js` intentionally has **no active `aGTM.f.init()` call** at the end of the library code:
- Line ~1761: `//aGTM.f.init();` — commented out (marks the insertion point for single-file usage)
- A second occurrence exists inside a `/*** ... ***/` block comment (example code only)

Both are stripped automatically by the minifier. The build script also checks for any accidentally uncommented init call and aborts if one is found. The init call is the responsibility of the integrating developer, not the library.

### Git Workflow

- **`dev`** — all development happens here
- **`main`** — stable releases only; updated by merging from `dev`
- **Tags** — Git tags ARE the version numbers. Every release gets a tag matching the version (e.g. `v1.4.1`, `v1.5`). The tag is the authoritative reference for a release.

**Tag naming:** `v` prefix + semantic version, matching the version in `aGTM.js` and the changelog in `README.md`.

**Release flow:**
1. Update version in `aGTM.js` (`@version` in the header comment and `aGTM.d.version` in `aGTM.f.objinit()`)
2. Add changelog entry in `README.md`
3. Run `./build.sh` to regenerate all derived files
4. Merge `dev` → `main`
5. Tag the release: `git tag v<version>`

### Adding a new CMP

1. Create `cmp/cc_<name>.js` — implement `aGTM.f.consent_check = function(action) { ... }`
   - `action` is either `"init"` or `"update"`
   - Return `true` on success, `false` otherwise
   - Write consent results to `aGTM.d.consent`
2. Run `./build.sh` — this generates `cmp/cc_<name>.min.js` automatically
3. Document the new CMP in `cmp/README-cmp.md`

### GTM Template File Naming

Template files use spaces in their names: `aGTM tag - Click Events.tpl` (not dashes like `aGTM-tag-Click-Events.tpl`). Each template lives in its own subdirectory under `gtm/tags/` or `gtm/variables/` alongside a `README-gtm-*.md` documentation file.

---

**Roadmap:** [ROADMAP.md](ROADMAP.md)

---

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](https://github.com/Andiministrator/aGTM/blob/main/LICENSE) file for details.

---

**End of Documentation**
