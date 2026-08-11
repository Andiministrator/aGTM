# aGTM - Developer Documentation

![aGTM  a Galactic Tagging Modulator](assets/aGTMdeveloper-100px.png)

#### Overview

`aGTM.js` is a global implementation script designed for developers who want to extend, customize, or integrate Google Tag Manager (GTM) and Google Analytics (GA) functionality based on user consent. This documentation covers the internal workings, extensibility options, and callback functions for developers.

- **Version**: 1.5
- **Last Updated**: 16.04.2026
- **Author**: Andi Petzoldt [andi@petzoldt.net](mailto:andi@petzoldt.net)
- **Repository**: [GitHub Repository](https://github.com/Andiministrator/aGTM/)

> **Building GTM tags/variables or an sGTM handler?** For the **data contract** — what aGTM writes into
> the `aGTM` object and dataLayer (session, consent, sources/attribution) and how to read/set it from
> web GTM and server-side GTM — see [**README-for-Integrators.md**](README-for-Integrators.md). This
> document here covers the library internals and how to extend it.

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

  // --- Session feature (v1.5 redesign — see SESSION-REDESIGN.md) ---
  // Session and consent data arrive from the sGTM Client via cfg.session.
  // No client-side HTTP fetch. consent_store_url is where aGTM POSTs consent
  // diffs back; the sGTM Client persists them into the Session API record.
  // When served via sGTM Client, consent_store_url is auto-filled as
  // https://<sgtm-host>/aGTMconsent — only standalone integrators set it.
  session_salt:       42,                                  // salt for consent-store POST; also fallback for transport_salt
  consent_store_url:  'https://sgtm.example.com/aGTMconsent', // auto-filled by sGTM Client; standalone uses fixed path
  consent_store_enc:  true,                                // encrypt consent-store POST payload with session_salt
  user_id:            'user-abc-123',                      // optional: logged-in user CRM ID, exposed for integrators
  session: { sid: 's-abc', uid: 'u-123' },                 // pre-populated by the sGTM Client (accepted with sid, consent, attribution, OR source)

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
       ├─ aGTM.d.dl.push()           internal event log (always)
       ├─ [_noDLPush == true]  →  skip sendnaus/iFrameFire
       │     (event in aGTM.d.dl + aGTM.l, NOT in GTM dataLayer)
       │     └─ sendnaus_callback()   still called here
       ├─ [iframe mode && !_noDLPush] → aGTM.f.iFrameFire()
       │     ├─ internal events  → aGTM.f.sendnaus()
       │     └─ user events      → window.top.postMessage() (or queue)
       └─ [normal mode && !_noDLPush] → aGTM.f.sendnaus()
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
| `_noDLPush` | boolean | `true` skips the GTM dataLayer push (`sendnaus()`/`iFrameFire()` not called). The event is still recorded in `aGTM.d.dl` and `aGTM.l`, POST transport fires, and `sendnaus_callback` is still called. Use with `_noConsent` for Google-independent pre-consent events. See [`_noDLPush` flag](#_nodlpush-flag). |
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

aGTM sits between the page and Google Tag Manager. Its core job is: **do not inject GTM until the user's consent decision is available.** Events fired before consent are queued and replayed once GTM is loaded. Five documented options deliberately bypass that gate — see [When aGTM loads GTM without a consent decision](README.md#when-agtm-loads-gtm-without-a-consent-decision).

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

### `_noDLPush` flag

Set `_noDLPush: true` to prevent `fire()` from pushing the event to the GTM dataLayer (`sendnaus()` / `iFrameFire()` are skipped). The event is still recorded in `aGTM.d.dl` and `aGTM.l`, and POST transport still fires normally.

Use together with `_noConsent` for pre-consent events that should reach the server but must not trigger GTM tags (e.g. to avoid double-firing tags that listen to the same event name):

```javascript
aGTM.f.fire({
  event:       'page_view',
  _noConsent:  true,
  _noDLPush:   true,
  _post:       { url: 'https://collect.example.com/ae' }
});
```

Use this for events that must be tracked regardless of consent (e.g. functional events, error tracking, legal notifications).

Note: `sendnaus_callback` is still called even when `_noDLPush` is true, so any monitoring code hooked into the callback receives all events.

#### Google-independent tracking pattern

Combining all three flags sends an event **exclusively to your own server** — nothing touches the Google dataLayer:

```javascript
aGTM.f.fire({
  event:      'purchase',
  revenue:    99.90,
  _noConsent: true,  // don't wait for consent
  _noDLPush:  true,  // skip GTM dataLayer push
  _post:      { url: 'https://your-server.example.com/ae' }
});
// → Event logged in aGTM.d.dl and aGTM.l
// → POST sent to your server immediately
// → Nothing pushed to Google Tag Manager
```

GTM can still run in parallel — this pattern adds a Google-independent channel alongside it, rather than replacing GTM.

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

> **v1.5 redesign — see [SESSION-REDESIGN.md](SESSION-REDESIGN.md).** The library no longer issues a client-side HTTP call for session data; it consumes a pre-populated `cfg.session` object that the sGTM Client injects into the library response. When the response carries a stored consent block, GTM injects on the same tick — no CMP wait. Subsequent CMP decisions are diffed against the preset and POSTed back to a dedicated `consent_store_url` endpoint.

### Integration prerequisite — Consent Mode v2 / consent signals

> **Read this before enabling `cfg.session.consent` (preset_with_consent).** The v1.5 redesign trades a stricter integration requirement for a faster page load.

When `cfg.session.consent` is preset, GTM injects with that state **immediately** — before the live CMP has had a chance to respond. If the user's actual *current* CMP state is more restrictive than the cached server state — e.g. the user revoked services on another device, the user cleared cookies and the CMP banner is about to re-appear with stricter defaults, or the CMP version was upgraded with tighter category defaults — GTM tags may briefly fire under a permissive consent before the CMP responds and the adaptive poll's `aGTM_consent_update` event propagates the correction.

**Mitigation:** all GTM tags must be gated through Google Consent Mode v2 / consent signals (`gtag('consent', 'update', { analytics_storage: 'granted', … })`) so that a later `aGTM_consent_update` actually changes downstream tag behavior — drop the hit, redact PII, switch to ping-mode, etc. **Tags that use a hard-coded "fire if consent service X is granted" trigger condition (without Consent Mode) will mis-fire during the preset window.**

This is a stricter integration requirement than the pre-v1.5 "wait-for-CMP-then-load" model. To opt out: don't ship preset_with_consent. Either configure the sGTM Client to never embed `consent` (set `auto_deny_load_gtm: false` AND have the Session API never return stored consent), or set `consent_poll_ms` very low so the preset window stays short — the preset still injects synchronously, but the correction lands within the chosen poll interval.

### Activation

Active whenever the sGTM Client (or any integrator) injects `aGTM.f.config({ session: { ... } })` with a `sid`, valid `consent`, `attribution`, or `source` field.

```javascript
// Typically emitted by the sGTM Client Template into the page response:
aGTM.f.config({
  session: {
    sid:     's-abc',
    uid:     'u-123',
    ga4sid:  '17163412742',
    muidga4: 'ga4.e739429c6b5210.6c68813e',
    consent: {                       // optional; if present and valid, GTM injects synchronously
      hasResponse: true,
      services:    ',svc1,svc2,',
      purposes:    ',p1,',
      vendors:     '',
      feedback:    'CMP accepted',
      consent_id:  'cid-abc'
    }
  },
  session_salt:      42,
  consent_store_url: 'https://collect.example.com/consent',  // POST endpoint for diffs
  consent_store_enc: true,                                    // encrypt with session_salt
  user_id:           'u-12345'                                // optional, exposed for integrators
});
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `user_id` | string | `""` | Optional logged-in user CRM ID, exposed for integrators |
| `session_salt` | number | `0` | Encryption salt for the consent-store POST; also fallback salt for POST transport (`_post`) when neither the event nor `transport_salt` provides one |
| `consent_store_url` | string | `""` | POST endpoint for consent diffs. The sGTM Client handler manages the user-ID cookie AND persists the consent into the Session API record. When served via the sGTM Client, the URL is built **browser-side** at config time from `document.currentScript.src` + fixed path `/aGTMconsent` — works under any reverse-proxy prefix transparently. Standalone integrators set this manually. Empty string disables the diff/store mechanism. |
| `consent_store_enc` | boolean | `false` | If `true`, the consent-store POST payload is encrypted with `session_salt` |
| `consent_poll_ms` | number | `2000` | Interval (ms) for the periodic CMP state-change poll started after the first successful init. Set to `0` to disable. Only takes effect when `consent_store_url` is set. Catches CMPs that emit updates via direct `dataLayer.push()` (CCM19, Cookiebot, Usercentrics, …) which would otherwise bypass the `consent_events` matcher in `aGTM.f.fire()`. |
| `session` | object | `null` | Pre-populated session object from the sGTM Client; accepted when it is an object with `sid`, `consent`, `attribution`, or `source`. Extra non-meta fields the sGTM Client captures from the Sources API (e.g. `source`, the affiliate cookie value) are deep-copied through to `aGTM.d.session.*` and readable in webGTM via a JS variable (e.g. `aGTM.d.session.source`). |

**Removed in Phase 2 (no migration code, v1.5 was unreleased):** `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url`, `session_deny_service`. Functions: `aGTM.f.session_fetch`, `aGTM.f.session_apply_denial`, `aGTM.f.xfetch`. Data keys: `aGTM.d.session_ready`, `aGTM.d.consent_sent`. Auto-denial moves entirely server-side (decided by the sGTM Client based on the visit counter and stored consent record).

### Preset gate

In `aGTM.f.config()`, if `cfg.session` is an object with a `sid`, `consent`, or `attribution` field, it is deep-copied into `aGTM.d.session`. Then:

- If `cfg.session.consent` is a **valid** object (`hasResponse === true`, `typeof services === 'string'`), it is deep-copied into `aGTM.d.consent`, `aGTM.d.consent_hash` is seeded via `aGTM.f.consent_serialize`, and `aGTM.d.session_status = 'preset_with_consent'`. **At end of `config()`, `aGTM.f.call_cc()` is called synchronously** so GTM injects on this tick — no 500 ms `consent_listener` wait. (Requires `consent_check` to already be defined at config time; otherwise the sync call is a graceful no-op and a second sync attempt runs from `consent_listener()` once the CMP file finishes loading — still ahead of the polling interval.)
- Otherwise `aGTM.d.session_status = 'preset'` and the CMP path proceeds normally.

### Consent diff/store (in `run_cc()`)

At the end of every successful `run_cc()` call — **both `init` and `update` actions**:

1. `new_hash = aGTM.f.consent_serialize(aGTM.d.consent)` — stable, sorted, blacklist serialization that excludes `gtmConsent`, `blocked`, and empty/null values (so adding/removing an empty field doesn't create phantom diffs).
2. If `consent_store_url` is set AND `new_hash !== aGTM.d.consent_hash`:
   - POST `{uid, sid, consent: <copy without gtmConsent/blocked/empty>}` to `consent_store_url` via `aGTM.f.xsend()`. Payload uses the **same** blacklist as the hash so the server's full-replace persistence matches what the diff represents.
   - On `xhr.onreadystatechange` with status 2xx → `aGTM.d.consent_hash = new_hash`, `aGTM.d.session_status = 'synced'`.
   - On non-2xx → leave the hash unchanged so the next `run_cc()` retries within the same page load.
3. If `consent_store_url` is set AND hash matches: `aGTM.d.session_status = 'confirmed'` (server already had this state, no POST sent).

The init path runs the same diff/POST so first-visit CMP decisions (no preset, hash starts as `""`) and returning-visit reconciliations (preset hash matches CMP) flow through one code path.

### Update-path field reset (`run_cc('update')`)

Before `consent_check` runs on `'update'`, a snapshot of `aGTM.d.consent` is taken, then all CMP-managed fields are cleared: `hasResponse=false`, `services/purposes/vendors/consent_id/serviceIDs/feedback=""`, `delete blocked`. This guarantees a real CMP decision cannot inherit stale preset values from a server-side auto-denial. **If `consent_check` then returns `false`** (CMP not ready, user dismissed banner, etc.), the snapshot is restored so the periodic CMP poll (see below) can run repeatedly without destroying preset state.

### Adaptive CMP poll (`start_consent_poll`)

After the first successful `run_cc('init')`, aGTM starts a `setInterval` that calls `run_cc('update')` every `consent_poll_ms` (default 2000ms). This is necessary because most CMPs (CCM19, Cookiebot, Usercentrics, …) emit their consent-update events via direct `window.dataLayer.push()` — bypassing `aGTM.f.fire()` and therefore the `consent_events` matcher. The poll catches these state changes and routes them through the diff/POST path so the consent-store endpoint always sees the latest state.

**Gating:** the poll is only started when both `consent_store_url != ''` AND `consent_poll_ms > 0`. Without `consent_store_url` there is nothing to push, so polling has no value. Set `consent_poll_ms = 0` to disable; integrators can then manually trigger updates via `aGTM.f.run_cc('update')` from inside their CMP callback for zero polling overhead.

**Hash gating for `aGTM_consent_update` and `consent_callback`:** the polling loop would otherwise flood the dataLayer with `aGTM_consent_update` events and call `consent_callback` every poll tick. Both are now gated on `last_consent_hash` (the consent hash from the previous `run_cc()` call), so they only fire on actual state changes.

### Session payload (passed through the sGTM Client from api4sgtm)

The sGTM Client receives session data from the api4sgtm service and forwards it as `cfg.session`. All fields are stored as-is in `aGTM.d.session`.

| Field | Type | Description |
|---|---|---|
| `sessionId` / `sid` | string | Session ID |
| `uid` | string | User ID (typically the sGTM Client cookie value or fingerprint) |
| `vct` | number | The API's `counter` under its aGTM name: **requests within the current session, not visits.** Used server-side by the sGTM Client for the auto-denial decision; not branched on client-side. The Client emits `vct` — never `counter`. |
| `ret` | boolean | `vct > 0` — not the first request of this session. Gates the server-side consent auto-denial. |
| `sst` | boolean | Always `true`; marks the block as server-set |
| `created` | number | Unix seconds — when the session record was created |
| `lastInteraction` | number | Unix seconds — last interaction on this session |
| `pvCount` | number | Pageviews in the current session |
| `eventCount` | number | Events in the current session |
| `sessionCount` | number | **Visit** counter across sessions. This — not `vct` — is what "returning visitor, nth visit" means. |
| `ga4sid` | string | GA4-compatible session ID — usable as-is for the GA4 `sid` parameter |
| `muidga4` | string | GA4-compatible mapped user ID — usable as-is for the GA4 `cid` parameter |
| `source` | string | Flat affiliate source from the Sources API (last-cookie-wins) |
| `attribution` | object | Keyed-by-method attribution; re-activates `resolveAttribution` |
| `consent` | object | If present and valid, seeds `aGTM.d.consent` + `aGTM.d.consent_hash` and triggers synchronous GTM injection |
| *(any)* | * | Additional fields are stored as-is in `aGTM.d.session` |

> `customerId` and `user` from the API record are deliberately **not** forwarded — the
> tenant is configured in the Client and `user` is `uid`.

### Bot-check payload (`cfg.bot` → `aGTM.d.bot`)

Separate from `cfg.session`, because the sGTM Client's bot check runs *before* and
independently of the Session API: a session outage must not drop the verdict, and the
verdict must not open the session preset gate. Only ever present for a **non-blocked**
visitor — a detected bot is answered with HTTP 403 and never receives the library.

| Field | Type | Description |
|---|---|---|
| `isBot` | boolean | The definitive verdict. Effectively always `false` in the browser (see above), unless the Client runs in "only mark" mode. |
| `score` | number | 0–100. Never blocks on its own. |
| `band` | string | `clean` / `suspicious` / `bot` from the service, or **`other`** when the service sent a value outside the known vocabulary (the Client collapses unknown values and logs a warning), or **`unknown`** — the Client's own marker for "no usable verdict", so an outage is distinguishable from a clean visitor. `bot` holds exactly when `isBot === true`. |
| `primarySignal` | string | Category of the highest-scoring signal (`asn_spam`, `known_bot`, …) |
| `signals` | array | `{type, category, score, confirmed}` per evaluated signal; the list is capped at 10 and the loop is bounded independently of it. Each signal's `detail` block stays server-side. |
| `mode` | string | `"block"` or `"mark"` — what the Client does with a positive verdict. Under `"mark"` it reports but never blocks, so `isBot: true` can legitimately appear in the browser. |
| `reason` | string | Only alongside `band: "unknown"`: `no_answer` (filter unreachable/timeout), `bad_answer` (responded without a usable verdict), `no_client_ip` (never asked — the IP header did not resolve). |

### Accessing session data

```javascript
aGTM.d.session.sid           // session ID
aGTM.d.session.uid           // user ID
aGTM.d.session.ga4sid        // GA4 sid
aGTM.d.session.muidga4       // GA4 cid
aGTM.d.session_status        // see lifecycle table below
aGTM.d.consent_hash          // last successfully POSTed serialized consent
```

**`aGTM.d.session_status` lifecycle:** one of `""`, `"preset"`,
`"preset_with_consent"`, `"synced"`, `"confirmed"`. The per-value table lives in
[README-for-Integrators.md → Session status](README-for-Integrators.md#session_status-lifecycle)
and is the canonical one — it is not repeated here, because five copies of it had
already started to drift apart. GTM Custom Templates can branch on the value (e.g.
only personalize when `"preset_with_consent"` or `"confirmed"`).

### `aGTM.f.consent_serialize(c)`

Stable string serialization of a consent object. Keys are sorted alphabetically; values are stringified scalar-by-scalar (objects via `JSON.stringify`). **Blacklist excludes `gtmConsent`, `blocked`, and empty/null values.** Used by both the preset hash seed and the diff check.

```javascript
aGTM.f.consent_serialize({
  hasResponse: true,
  services:    ',svc1,',
  gtmConsent:  true,    // excluded
  blocked:     false,   // excluded
  vendors:     '',      // excluded (empty string)
  consent_id:  'cid-1'
});
// → "consent_id=cid-1|hasResponse=true|services=,svc1,"
```

### `blocked` field semantics

`aGTM.d.consent.blocked` is recognized by the `run_cc()` chelp fallback: when consent gate checks fail (services/purposes/vendors don't match the requirement), `gtmConsent` falls back to `blocked` (if boolean), otherwise `false`. The sGTM Client server-side auto-denial sets BOTH `gtmConsent: <autoDenyLoadGtm>` AND `blocked: <autoDenyLoadGtm>` so the fallback honors the server policy. The B2 update-path reset deletes `blocked` so an explicit user CMP decision always wins over server policy.

### Attribution (HYBRID merge)

When the sGTM Client is configured to request attribution (`sources_attribution`), the Sources **POST** carries `?attribution=true&method=<sources_method>` and api4sources returns the attribution object inline. The Client wraps it single-method into `cfg.session.attribution` — a keyed-by-method object, e.g. `{ last_touch: { sou:'google', ... } }`. (Earlier v1.5 builds used a separate multi-method GET; that was removed — it pointed at the wrong endpoint and 404'd. The library-side processing here is unchanged.) At the end of `aGTM.f.config()`, every method present in the preset is resolved through `aGTM.f.resolveAttribution(method)` and the result is stored on `aGTM.d.attribution[method]`.

**Why a merge:** the API has at-best-stale data (ClickHouse Materialized View propagation lag — just-written rows are not readable for ~seconds). The current page's URL is always the freshest source. The HYBRID strategy uses URL data when present and API data for cross-session memory the URL cannot provide. **Caveat:** the merge only compensates the lag for browser-derivable fields (those with a URL term in the table below). The pure API fields `afs`/`lcs`/`fss` have no URL fallback, so on the first request of a new session's source they reflect the pre-request state and can lag behind.

**Per-field source priority:**

| Field | Source | Notes |
|---|---|---|
| `sou` | URL `utm_source` → API → `""` | |
| `cam` | URL `utm_campaign` → API → `""` | |
| `med` | URL `utm_medium` → API → `""` | |
| `camid` | URL `utm_id` → API → `""` | numeric ID, stored as string |
| `cli` | first detected click-ID URL param value → API → `""` | iterates `gclid, fbclid, msclkid, ttclid, gbraid, wbraid` |
| `clp` | name of the matched URL param → API → `""` | |
| `cls` | derived from URL `clp` via lookup table → API → `""` | `gclid`/`gbraid`/`wbraid` → `Google Ads`, `fbclid` → `Meta`, `msclkid` → `Microsoft Ads`, `ttclid` → `TikTok Ads` |
| `afs` | API only | Affiliate Source — Last-Cookie-Wins, user-scoped, persisted server-side |
| `sre` | `document.referrer` → API → `""` | session-source referrer |
| `lcs` | API only | last click source across sessions |
| `fss` | API only | first session source ever for this user |

**Reading attribution:**

```javascript
aGTM.d.attribution.last_touch.sou           // 'google'
aGTM.d.attribution.last_non_direct_click.cam // marketing-attribution view
```

GTM Custom Variables reading these values must defensive-check, since `aGTM.d.attribution` is `{}` when no preset is supplied (standalone integrations without sGTM Client attribution wiring):

```javascript
function() {
  var a = window.aGTM && window.aGTM.d && window.aGTM.d.attribution
        && window.aGTM.d.attribution.last_touch;
  return a ? a.sou : '';
}
```

**Standalone callers** can build a single attribution view at any time by calling `aGTM.f.resolveAttribution('any-method-name')` directly — with no API data, the result is the URL-only view. This is useful as a one-line wrapper for tags that just want the current page's source/medium/campaign.

**`aGTM.f.parseUrlParams(qs)`** is a minimal ES5 query-string parser (handles percent-encoding, `+`-as-space, malformed sequences) used internally by `resolveAttribution`. Exposed in case integrators need it for related work.

**Backward compatibility:** when `cfg.session.attribution` is absent, the loop is a no-op and `aGTM.d.attribution` stays `{}`. Existing integrations without sGTM Client attribution wiring are unaffected.

## DL-Repeat / Late-Enrichment (`aGTM.f.dlrepeat`)

`aGTM.f.dlrepeat(cfg)` is the engine behind the **"aGTM - DL Repeat"** GTM tag (`gtm/tags/dl-repeat/`, tag template v1.5+). The tag itself is a thin wrapper: it collects its fields into `cfg` and calls `aGTM.f.dlrepeat(cfg)` **once**. The engine lives in the library because the GTM web sandbox cannot poll (`setInterval` is unavailable there) — so the tag needs only a **single trigger** (e.g. *All Pages*) and the library watches the dataLayer itself.

**Use case (late enrichment):** a shop pushes an enrichment event (e.g. `user_data` with hashed identifiers) *after* `view_item`/`purchase` already fired, so conversion tags fired without it. `dlrepeat` waits for the enrichment event, then re-fires the earlier matching events marked `aGTMrepeated = true`, so consumer tags (Enhanced Conversions, Criteo, …) fire again — now complete. Trigger consumer tags on `aGTMrepeated == true` and exclude the original pass.

**`cfg` fields** (all from the tag): `source` (`'f'` = pre-load buffer `aGTM.d.f` (default), `'dl'` = `aGTM.d.dl` (only `aGTM.f.fire` events), `'live'` = the real `dataLayer` `window[aGTM.c.gdl]` — covers raw `dataLayer.push`), `gateEvents` (csv; replay waits until all are present; empty = immediate. A token may be **conditional**: `G?if=E[A]` requires `G` only when an event `E` with a non-empty attribute `A` exists, `G?if=E[A:V]` only when `E.A === V` (strict string compare), `G?if=E` only when an event `E` exists at all; empty = `null`/`undefined`/`""`. A token without `?if=` is always required. A malformed predicate fails safe to unconditional; an as-yet-absent discriminator makes the gate wait (not replay unenriched). Use `user_data?if=user[id]` so guests — who never get `user_data` — replay in order immediately instead of hitting the timeout fallback, while logged-in visitors still wait for enrichment), `whitelist`/`blacklist` (csv, `*` wildcard), `gtmFired`/`agtmFired`/`messages`/`gtmEvents`/`clearEcom`/`debug` (booleans), `maxEvents` (number), `timeoutMs` (fallback wait; `0` = no fallback), `pollMs` (default 300), `addparameter` (`[{pkey,pvalue}]`).

**Why `aGTM.d.dl` ≠ the live dataLayer:** `aGTM.d.dl` only holds events that went through `aGTM.f.fire`. Raw `dataLayer.push({...})` (typical for shop plugins, e.g. Shopware) never enters it — those need `source: 'live'`.

**Send types** match the tag's checkbox labels: `aGTMdl === true` (raw GTM dataLayer items captured at init) → gated by `gtmFired`; events without `aGTMdl` (fired via `aGTM.f.fire`) → gated by `agtmFired`.

**Guarantees:** runs **at most once per page** (`aGTM.d.dlrepeatDone`, set at the start of the replay) + every re-fired event carries `aGTMrepeated = true` and is skipped by the filter → no double `purchase`, no loop. The replay iterates a **snapshot length** taken before firing, so re-fired events appended to the live dataLayer are not re-scanned. `aGTMts`/`aGTMparams`/`gtm.uniqueEventId` are stripped before re-firing (else `fire()`'s `aGTMts` loop-guard would drop the event). The poll is bounded (gate ready → timeout → 30 s hard cap) and never leaks an interval; `aGTM.d.dlrepeatPolling` guards against parallel polls and is released if the hard cap is hit without a fallback.

**Error signal (opt-in):** with `cfg.fallbackEvent` enabled, the library fires `aGTM_repeat_fallback` into the dataLayer **only** on the timeout-fallback path — i.e. when the wait-event(s) never arrived and the replay ran unenriched — **and only when at least one event was actually repeated** (`fired > 0`). If nothing qualified, no replay ran, so there is no missed enrichment to report and the signal stays silent (this keeps guest / non-conversion pages, whose gate event never arrives by design, from flooding a monitoring/exception stream). Nothing is emitted on a normal (enriched) replay either. It carries `aGTMrepeatCount` (always `>= 1`), `aGTMrepeatSource`, **`aGTMrepeatMissing`** (comma-list of the gate event(s) still absent at the timeout — the culprit, e.g. `user_data`; a conditional gate whose discriminator never arrived reports that discriminator event) and **`aGTMrepeatWaited`** (the give-up threshold in ms); trigger a monitoring/alert tag on it to catch missing enrichment and read `aGTMrepeatMissing` to see exactly what never arrived. The event starts with `aGTM` so it bypasses consent and is never itself replayed. Off by default; needs a fallback timeout > 0.

**Requires** the library v1.5+. The tag guards with `copyFromWindow('aGTM.f.dlrepeat')` and logs a warning + does nothing on an older library.

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
| `test/session_preset.test.js` | `cfg.session` preset gate (accepts object with `sid`, `consent`, or `attribution`, deep-copies into `aGTM.d.session`); malformed-consent validation; synchronous `call_cc()` trigger when preset consent is usable |
| `test/attribution.test.js` | HYBRID attribution merge: `aGTM.f.parseUrlParams` (encoding edge-cases, malformed input), `aGTM.f.resolveAttribution` per-field rules (URL-wins for browser-derivable, API-only for `afs/lcs/fss`, click-ID detection + collision order), and the `aGTM.f.config()` end-of-config loop populating `aGTM.d.attribution[method]` for single/multi/empty/missing/null presets, including attribution-only sessions |
| `test/session_status.test.js` | `aGTM.d.session_status` lifecycle (`""`, `"preset"`, `"preset_with_consent"`, `"synced"`, `"confirmed"`) |
| `test/consent_store.test.js` | Consent diff/store mechanism in `run_cc()` — diff detection, dedup, retry on POST failure, `consent_id`-change regression check, `gtmConsent`-only mutation excluded from hash |
| `test/run_cc.test.js` | `aGTM.f.run_cc()` — `blocked` flag deletion + B2 field-reset on `update` |
| `test/fire_salt.test.js` | `aGTM.f.fire()` — POST salt fallback chain |
| `test/bot_preset.test.js` | `cfg.bot` preset — deep-copy into `aGTM.d.bot`, `isBot`-must-be-boolean guard, and the assertion that it does **not** touch the session preset gate |
| `test/sgtm/botcheck.test.js` | sGTM Client bot check: the `botFieldsFromResponse` whitelist (extracted from the Client source and run against a sandbox-like `JSON.parse` that returns `undefined` instead of throwing), plus structural guards over the surrounding code — no 2xx status gate (F-127), the blocking decision, the `SOURCES_META` protection, and the `template.tpl` ↔ source byte-identity invariant |
| `test/devtools/botsummary.test.js` | Inspector: `botSummary()` verdict classification (absent / clean / scored / contradictory `isBot:true`) |
| `test/devtools/reader-snapshot.test.js` | Inspector: `reader.js` is actually *fed* — `aGTM.d.bot` and the Session API counters reach the snapshot (a pure-helper test alone would not catch a missing wire) |

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
