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

#### Complete configuration example (v1.5)

The snippet below shows all major options in context. Most are optional — only `gtm` (the container ID) is required for a standard setup.

```javascript
aGTM.f.config({

  // --- GTM container(s) ---
  gtm: {
    'GTM-XYZ123': {
      noConsent: false,           // load without consent? (default: false)
      gtmURL: 'https://gtm.example.com'  // custom sGTM delivery URL (optional)
    }
  },
  gtmServices: 'Google Tag Manager', // consent condition for GTM injection
  gdl: 'dataLayer',                  // dataLayer name (default: 'dataLayer')

  // --- CMP ---
  cmp: 'cookiebot',            // CMP provider name (see cmp/ directory)
                               // use 'none' to skip consent entirely

  // --- POST transport (new in v1.5) ---
  transport_url:  'https://collect.example.com/event', // sGTM collect endpoint
  transport_enc:  true,  // encrypt payload with Base64 + Caesar shift (default: false)
  transport_salt: 42,    // encryption salt, integer >= 1

  // --- Session feature (new in v1.5) ---
  user_id:             'user-abc-123',                    // user identifier for session endpoint
  session_url:         'https://collect.example.com/session', // session POST endpoint
  session_salt:        42,    // salt for session request; also fallback for transport_salt
  session_wait:        true,  // delay GTM injection until session data arrives (default: false)
  session_timeout:     3000,  // ms before session fetch is abandoned (default: 5000)
  session_gtm_on_deny: true,  // inject GTM even when auto-denial is applied (default: true)

  // --- Other options ---
  dlSet:            { 'page_type': 'pageType' }, // append GTM DL variable to every fire() event
  sendConsentEvent: true,   // push a separate consent-state event to the dataLayer
  dlStateEvents:    true,   // push aDOMready / aPAGEready events
  iframeSupport:    false   // enable aGTM inside an iframe (bypasses CMP)

});

aGTM.f.init();
```

**Salt shorthand:** when `session_salt` and `transport_salt` are the same value, you only need to set `session_salt` — it is used automatically as the fallback for POST transport.

#### Per-event properties

These are not config options but are set directly on the event object passed to `aGTM.f.fire()`:

```javascript
// POST with global transport defaults:
aGTM.f.fire({ event: 'purchase', revenue: 99.90, _post: true });

// POST with per-event overrides (all keys optional):
aGTM.f.fire({
  event:   'purchase',
  revenue: 99.90,
  _post:   { url: 'https://collect.example.com/order', enc: true, salt: 42 }
});

// Bypass consent gate (functional/legal events that must fire regardless of consent):
aGTM.f.fire({ event: 'cookie_consent_given', _noConsent: true });
```

See [Event property reference](#event-property-reference) for the complete list.

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

#### Event property reference

This is the complete reference for all properties on the event object that `fire()` reads, acts upon, or writes. Properties are grouped by direction.

##### Properties you can set (read by `fire()`)

| Property | Type | Effect |
|---|---|---|
| `event` | string | If the value starts with `aGTM`, the consent gate is bypassed — the event is always dispatched immediately. |
| `_noConsent` | boolean | `true` bypasses the consent gate entirely. The event is pushed to the dataLayer and POST is sent without waiting for consent. The property is preserved in the dataLayer event. See [`_noConsent` flag](#_noconsent-flag). |
| `_post` | boolean \| object | Triggers an HTTP POST via `aGTM.f.xsend()`. `true` uses global transport defaults. An object `{ url, enc, salt, consent }` overrides individual settings. POST respects the consent gate unless `_noConsent: true` is also set. See [POST Transport](#post-transport). |
| `_post_sent` | boolean | If `true` when `fire()` is called, the POST step is skipped. Prevents double-sending when the event is replayed from the queue. Set by aGTM after sending; can also be set externally. |
| `aGTMts` | number | If already set to a number when `fire()` is called, the event is **skipped entirely** — it is considered already processed. Do not set this manually. |
| `eventModel` | object \| null | If set to a non-null value when `fire()` is called, the event is **skipped** (it is a GTM-internal ping event). `fire()` sets this to `null` on all events it processes. Do not set this manually. |

##### Properties written by `fire()`

| Property | Type | Written when | Description |
|---|---|---|---|
| `aGTMts` | number | Always, early in `fire()` | Timestamp (`Date.now()`). Also serves as the "already processed" guard — its presence causes a second pass through `fire()` to be skipped. |
| `eventModel` | null | Always, early in `fire()` | Set to `null` to neutralise GTM-internal ping detection. |
| `aGTMparams` | object | On dispatch (non-aGTM events) | Deep copy of the final event object, attached to the event before the dataLayer push. GTM variables can read individual fields from `aGTMparams` without depending on dataLayer scoping. |
| `_post_sent` | boolean `true` | After POST is sent | Deduplication flag. Prevents the POST from being sent a second time if the event passes through `fire()` again (e.g. during queue replay). |

##### Auto-enrichment from config (`dlSet`)

If `aGTM.c.dlSet` is configured and a GTM container is already loaded, `fire()` reads the specified variables from the GTM data model and adds them to every event before dispatch:

```javascript
aGTM.f.config({
  dlSet: { 'userId': 'user_id' }  // reads GTM DL variable 'user_id', adds as 'userId'
});
```

This is useful for automatically appending persistent context (e.g. user ID, page type) to all events without repeating it in every `fire()` call.

##### Consent-event triggers (`consent_events` / `consent_event_attr`)

If `aGTM.c.consent_events` is set, `fire()` checks every incoming event name against that list. A match triggers `aGTM.f.run_cc('update')` to re-read and update the consent state.

You can optionally require a specific attribute value on the event for the trigger to fire, using bracket notation in the config:

```javascript
aGTM.f.config({
  consent_events: 'cmpEvent[userChoiceType:useraction],cmpUpdate'
});
```

- `cmpEvent[userChoiceType:useraction]` — triggers consent update only when `event == 'cmpEvent'` AND `userChoiceType == 'useraction'`
- `cmpEvent[userChoiceType]` — triggers when `event == 'cmpEvent'` AND `userChoiceType` exists (any value)
- `cmpUpdate` — triggers on event name match alone, no attribute check

The parsed attribute conditions are stored in `aGTM.c.consent_event_attr` (object keyed by event name).

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

#### Combining `useListener: true` with `session_wait: true`

When both options are active, the two async processes run in parallel:

- `session_fetch()` starts immediately in `init()` and will call `inject()` once session data arrives
- The consent decision is signalled manually by the integrator via `aGTM.f.call_cc()`

`inject()` requires **both** to be ready before it proceeds:
1. `session_ready === true` (session data received or timed out)
2. `aGTM.d.consent.hasResponse === true` (consent decision or auto-denial)

Whichever arrives last triggers `inject()`, which then checks both conditions and proceeds if both are met. **No deadlock is possible**: the session timeout guarantees `session_ready` becomes `true` after at most `session_timeout` ms even if the endpoint is unavailable.

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

## Session & User Data

aGTM can fetch session and user data from a server-side endpoint early in the page lifecycle, before GTM is injected. The data is stored in `aGTM.d.session` and is accessible from webGTM variables, GTM Custom Templates, and any JavaScript on the page.

### Activation

The feature is active when **both** `user_id` and `session_url` are set in the config. If either is missing, the feature is silently disabled.

```javascript
aGTM.f.config({
  user_id:      'u-12345',
  session_url:  'https://session.example.com/api/session',
  session_salt: 42
});
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `user_id` | string | `""` | User identifier sent to the session endpoint |
| `session_url` | string | `""` | POST endpoint URL |
| `session_salt` | number | `0` | Encryption salt for the request payload; also used as fallback salt for POST transport (`_post`) when neither the event nor `transport_salt` provides one |
| `session_wait` | boolean | `false` | Delay GTM injection until session data is available (or timeout reached) |
| `session_timeout` | number | `5000` | Milliseconds before the session fetch is abandoned; GTM injection proceeds regardless |
| `session_gtm_on_deny` | boolean | `true` | Inject GTM even when auto-denial is applied (see below) |

### How it works

During `aGTM.f.init()`, the session fetch starts immediately — in parallel with the CMP consent check. The request is sent via `aGTM.f.xfetch()` as an encrypted POST.

**Request payload:**
```json
{ "user_id": "u-12345", "url": "<current page URL>", "ref": "<referrer>" }
```
The payload is encrypted using `aGTM.f.enc()` with `session_salt`.

**On response:**
1. Response JSON is parsed.
2. If `sid` (session ID) is missing or empty → feature disabled at this point, `aGTM.d.session` remains empty.
3. Otherwise: all response fields are stored in `aGTM.d.session`, and `aGTM.d.session_ready` is set to `true`.
4. Auto-denial logic is evaluated (see below).
5. If `session_wait: true` and GTM was waiting → injection proceeds now.

**On timeout or error:** `aGTM.d.session_ready` is set to `true` (so `session_wait` doesn't block indefinitely), `aGTM.d.session` stays empty.

### `aGTM.f.xfetch(url, data, encrypt, salt, callback)`

New function for POST requests that need to read the response. Same body format and encryption logic as `aGTM.f.xsend()`.

**Returns:** the `XMLHttpRequest` instance (or `null` on a synchronous setup error). Useful for aborting the request externally if needed.

**Callback behaviour:**
- `callback(parsedJSON)` — on HTTP 2xx with valid JSON response body
- `callback(null)` — on HTTP non-2xx, JSON parse error, network error, or synchronous setup failure

```javascript
var xhr = aGTM.f.xfetch(
  'https://session.example.com/api/session',
  { user_id: 'u-12345', url: location.href, ref: document.referrer },
  true,   // encrypt
  42,     // salt
  function(response) {
    if (response && response.sid) {
      console.log('Session:', response);
    } else {
      console.warn('Session fetch failed or invalid response');
    }
  }
);
// xhr can be used to abort the request if needed: xhr.abort();
```

### Session response format

The endpoint must return JSON. `sid` is the only required field — everything else is optional. All fields are stored as-is in `aGTM.d.session`.

| Field | Type | Description |
|---|---|---|
| `sid` | string | **Required.** Session ID. Missing or empty → feature disabled. |
| `uid` | string | User ID (server-side) |
| `sst` | boolean | Session status: `true` = real/validated user, `false` = bot or uncertain |
| `ret` | boolean | `true` = returning visitor |
| `cst` | boolean | `true` = consent decision already on record for this user |
| `ref` | string | Referrer as seen server-side |
| `vct` | number | Visit count (number of sessions for this user) |
| *(any)* | * | Additional fields (click IDs, attribution, etc.) are passed through and stored |

### Accessing session data

```javascript
// In any JavaScript on the page:
aGTM.d.session.sid        // session ID
aGTM.d.session.sst        // real user?
aGTM.d.session.ret        // returning visitor?
aGTM.d.session_ready      // true once fetch completed (or timed out)
aGTM.d.session_status     // outcome — see table below
```

**`aGTM.d.session_status` values:**

| Value | Meaning |
|---|---|
| `""` | Session fetch not yet started (initial state) |
| `"ok"` | Valid response received, `sid` present, data stored |
| `"invalid"` | Response received but `sid` missing or not a string |
| `"error"` | Network error or non-2xx HTTP status |
| `"timeout"` | Endpoint did not respond within `session_timeout` ms |
| `"inactive"` | Feature disabled — `user_id` or `session_url` not configured |

GTM Custom Templates can read `aGTM.d.session_status` to branch logic (e.g. skip personalisation on `"timeout"` or `"error"`).

In a GTM Custom Template or variable, the same paths are accessible via the `aGTM` object in the dataLayer.

### Auto-denial

When the session data indicates a **returning visitor without a recorded consent decision** (`ret === true && cst === false`), this means the consent banner was likely blocked (e.g. by an ad blocker or browser setting) or was never shown. In this case, aGTM applies auto-denial:

| Property | Value set |
|---|---|
| `aGTM.d.consent.hasResponse` | `true` |
| `aGTM.d.consent.feedback` | `"Consent denied by aGTM"` |
| `aGTM.d.consent.services` | `",aGTMconsent,"` |
| `aGTM.d.consent.gtmConsent` | `true` if `session_gtm_on_deny: true`, otherwise `false` |

**Effect:** The consent gate in `aGTM.f.fire()` opens (events are no longer queued). GTM is injected (if `session_gtm_on_deny: true`). Tags configured to require `aGTMconsent` will fire; tags requiring any other consent signal (e.g. `Google Analytics`) will not.

Auto-denial only has its full effect on GTM delivery when `session_wait: true`, because then the session data is guaranteed to arrive before `inject()` runs. With `session_wait: false`, GTM may already be loaded by the time auto-denial fires.

**Interaction with later CMP decisions (`blocked` flag):**

Auto-denial sets `aGTM.d.consent.blocked = true` (when `session_gtm_on_deny: true`). This flag is used by `run_cc()` as a fallback: when no consent purposes/services match, `gtmConsent` is set to `blocked` instead of `false`. This ensures GTM stays loaded through subsequent `run_cc("init")` calls (e.g. from the consent polling timer).

However, if the user later makes an **explicit decision in the CMP** (which triggers `run_cc("update")`), `blocked` is deleted before re-evaluation. This means a real user decline always overrides auto-denial — `gtmConsent` becomes `false` correctly. A real user acceptance sets `gtmConsent = true` normally.

In short: `blocked` survives `init` re-checks but is cleared by any explicit user CMP decision.

### `session_wait` and timing

```
init()
  ├─ start xfetch(session_url)         — async, runs in parallel
  ├─ load CMP script (if configured)
  ├─ start consent polling timer
  │
  ├─ [session_wait: false]
  │    └─ inject() runs as soon as consent is available
  │         session data stored whenever xfetch completes
  │
  └─ [session_wait: true]
       └─ inject() waits until BOTH are true:
            - consent available (or auto-denial applied)
            - session_ready == true (data received or timeout)
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
# Install Bun (Arch/CachyOS)
sudo pacman -S bun
# No further installation needed — bunx fetches terser automatically on first build
```

**Build:**
```bash
./build.sh
```

### Tests

Tests are written for [Bun](https://bun.sh) and live in the `test/` directory.

```bash
bun test
```

**Structure:**

| File | What it tests |
|---|---|
| `test/setup.js` | Browser globals + loads aGTM.js (auto-loaded via `bunfig.toml`) |
| `test/helpers.js` | `MockXHR` class, `resetAGTM()` helper |
| `test/xfetch.test.js` | `aGTM.f.xfetch()` — response handling, encryption, return value |
| `test/session_fetch.test.js` | `aGTM.f.session_fetch()` — activation, storage, auto-denial, timeout |
| `test/inject.test.js` | `aGTM.f.inject()` — `session_wait` gate |
| `test/run_cc.test.js` | `aGTM.f.run_cc()` — `blocked` flag deletion on `update` |
| `test/fire_salt.test.js` | `aGTM.f.fire()` — POST salt fallback chain |

**Helpers:**

- `resetAGTM(cfg?)` — wipes `aGTM.d`/`aGTM.c`, calls `objinit()`, optionally applies config. Call in `beforeEach()`.
- `MockXHR.install()` — replaces `globalThis.XMLHttpRequest` with a controllable mock.
- `MockXHR.last.respond(status, data)` — simulates a server response synchronously.

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

**Tag naming:** `v` prefix + semantic version, matching the version in `aGTM.js` and the changelog in `CHANGELOG.md`.

**Release flow:**
1. Update version in `aGTM.js` (`@version` in the header comment and `aGTM.d.version` in `aGTM.f.objinit()`)
2. Add changelog entry in `CHANGELOG.md`
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
