# aGTM Client into Server-Side Google Tag Manager

**An Client Template for the server-side Google Tag Manager**
This guide explains how to use the aGTM Client inside a Server-Side Google Tag Manager container.

## Table of Contents

- [What is it for? - General Information](#what-is-it-for----general-information)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Usage](#usage)
- [Configuration Options](#configuration-options)
  - [Server-Side Session](#server-side-session)
  - [POST Transport](#post-transport)
- [Testing](#testing)
- [Contact and more Information](#contact-and-more-information)
- [Changelog](#changelog)

---

## What is it for? – General Information

The **aGTM Client** is part of the [aGTM project](https://github.com/Andiministrator/aGTM), a flexible and privacy-focused enhancement layer for Google Tag Manager.
It provides advanced functionality like consent-aware tracking, tag queuing, auto-events and cross-tag communication.

The **server-side client** allows easy integration of aGTM into server-side GTM containers (ssGTM), enabling reliable communication between client-side GTM and the server.

For full context of the aGTM ecosystem, visit the [aGTM README](https://github.com/Andiministrator/aGTM/blob/main/README.md).

## How it works

1. A lightweight script is loaded on the client via your `<head>` tag.
2. This script communicates with your server-side GTM endpoint.
3. The aGTM client in your sGTM instance parses and handles incoming requests.
4. Events are processed and forwarded to other tags (e.g., GA4, custom endpoints).

More details on the internal data structure and behavior can be found in the [aGTM Documentation](https://github.com/Andiministrator/aGTM).

## Requirements

- A working [Server-Side Google Tag Manager setup](https://developers.google.com/tag-platform/tag-manager/server-side).
- The aGTM Client template (`template.tpl`) imported into your ssGTM container.
- A domain/subdomain set up to serve the ssGTM (e.g., `https://sgtm.yourdomain.com`).
- The Implementation Code script must be embedded on your website (see next section).

---

## Usage

### 1. Embed the aGTM Script on your Website

Insert the following into your site’s `<head>`:

```html
<script>
(function(){
  var src=’https://sgtm.yourdomain.com/aGTM.js?id=GTM-XYZ123’;
  var d=’doc’,f=’ref’,l=’loc’,s=document.createElement(‘script’);
  s.src=src+’&c=’+btoa(JSON.stringify({u:window[l+’ation’].href,r:window[d+’ument’][f+’errer’]}));
  document.head.appendChild(s);
})();
</script>
```

Replace:
- `sgtm.yourdomain.com` with your sGTM endpoint.
- `GTM-XYZ123` with the GTM ID you assign to the aGTM client.

The sGTM Client reads the `c` parameter (Base64-encoded JSON with current URL and referrer) server-side, fetches session data, and appends `aGTM.f.config({...}); aGTM.f.init();` to the returned JavaScript. **No separate config or init call is needed** in your integration code.

### 2. Import the Client Template

- Open your sGTM container.
- Go to Templates > Clients.
- Import template.tpl.

### 3. Create and Configure a New Client

- Go to Clients > New and select the aGTM template.
- Set the GTM ID to match the one from your embed code.
- Save and publish the client.

---

## Configuration Options ⚙

The aGTM client in sGTM provides some different configuration areas to control its behavior.
This documentationis structured like the sections from the sGTM Config Dialog and the containing options.

**Minimal Configuration:**
You'll need at least one entry for the GTM Container Setup.
And if you set the Consent Check to "Yes" you'll need to select a CMP in Consent Check and at least one Consent Check Condition for the Google Tag Manager to fire.

### Use different aGTM Setups using ID's

If you use only one aGTM Client and one client-side GTM, you can leave this Section empty.
The Client will claim every request than, does'nt matter if (or which) id is set in the url.

Otherwise you could enter different GTM Container IDs that should be allowed to fire.
Is the at least one "Allowed (a)GTM ID" is configured, no other ID will be allowed.
**Attention!** If there is no ID configured, all possible IDs are allowed (the filter is deactivated in this case). That means, if you use a Query Parameter "id" as an GTM variable for the GTM Container ID, you can specify the GTM Container ID via URL, e.g. https://ssgtm.yourdomain.com/aGTM.js?id=GTM-XYZ123. But if the filter is inactive, every ID can be placed and someone could abuse the serverside GTM through that.

The ID has not to be a GTM Container ID, you could use any string here as allowed ID.
So you could configure different clients with different configuration options but with own (allowed) IDs.
Or you could use it to load a normal container for the Live/Production Website and a configuration with environment string for the Staging Website.

### GTM Container Setup

You need to configurate one or more clientside GTM Containers. There are 4 options for each container:

- **GTM Container ID**
  The ID of the clientside GTM Container, e.g.: `GTM-XYZ123`.
  You can use GTM variables here. So you could configure a variable for the URL Query Parameter `id` to send the GTM Container ID with the URL of the integration code, e.g.: `https://ssgtm.yourdomain.com/aGTM.js?id=GTM-XYZ123`
- **Consent Check**
  If you set this to `Yes`, the clientside GTM will only fire, if the user has given a consent to fire the GTM.
- **Environment String**
  You can use this to fire a special Environment of a clientside GTM Container.
- **Container URL**
  You can use this option to overwrite the Standard GTM URL (`https://www.googletagmanager.com/gtm.js`) with your own Container URL.

### Consent Check

Here you need to specify which Consent Tool you use and under what conditions the GTM should fire.

#### Used CMP

Select the Consent Tool what you use.
In case you have a special consent tool, you could create an own consent_check funktion within a GTM variable and select this here (more information will follow).

#### Consent Check Conditions

Setup the Consent Conditions. Add at least one consition, otherwise no consent check will run.
Depending, which CMP you have selected, it will provide the given Consent for Purposes, Services and/or Vendors.
Now you could say, that the GTM should only fire, if the user has given consent for the Category "Statistics".
And (in addition) the user has given consent for the special service "Google Tag Manager"
That is what you can configure here:

- **Type**
  Select what you want to check (e.g. Services).
- **Value**
  The Value (String/Text) what has the selected Type to contain (e.g. ",Google Tag Manager,").

#### Advanced CMP Settings

This options are more for experts, e.g. if a seperate Consent Event has to be send.

### Other aGTM Settings

You'll find different configuration options here:

#### Fire GTM dataLayer Event "aPageview"

After the GTM Container and the aGTM library has loaded and the user has given consent (if configured), a DataLayer Event will be send with the name "aPageview".

#### Send Virtual Pageviews

If ticked, aGTM sends virtual pageviews (as Event "vPageview") if the URL changes (HistoryChange), but the page doesn't reload.

#### Fire GTM dataLayer Events "DOMloaded" and "PAGEready"

If this is ticked. aGTM will automatically fire dataLayer Events for DOMloaded and PAGEready.

#### Name of GTM Datalayer

If you need a diffrenet name (as "dataLayer") for the GTM Datalayer, you can specify the Datalayer Name here.

#### Action for dataLayer.push Hook

The dataLayer.push function is the connection from the dataLayer Array to the Google Tag Manager. If this function is changed, the connection can be lost. With this feature you can decide, what to do in this case.

#### Nonce Value (for Consent Security Policy)

The dataLayer.push function is the connection from the dataLayer Array to the Google Tag Manager. If this function is changed, the connection can be lost. With this feature you can decide, what to do in this case.

#### aGTM Debug Mode

If this is ticked, the optout cookie will be ignored.

---

### Server-Side Session

The aGTM sGTM Client Template (v1.5 redesign, Phase 1) handles session management entirely server-side via a **single Session API call**. The earlier two-step presession + session model has been collapsed. When a browser requests `/aGTM.js`, the sGTM client:

1. Checks for bots (via the filter API) — if a bot is detected, returns 403 and stops.
2. Resolves a user ID: existing cookie wins; otherwise a server-side fingerprint (`F$...`). The same uid is used for the session API call AND for the cookie write — so consent persisted under that uid is found on the next load.
3. Calls the Session API (`GET /tp/session/{tenant}/{uid}`). The response includes `sessionId`, `counter`, `ga4sid`, `muidga4` and — once consent has ever been written for this user — a `consent` object.
4. **Consent passthrough**: if the response carries a valid `consent` object (`hasResponse: true`), it is forwarded into `cfg.session.consent` for aGTM to consume.
5. **Server-side auto-denial**: if no consent is on file but the user is returning (`counter > 0`), the Client constructs a denial-consent block (`hasResponse: true`, `services: ',aGTMconsent,'`, `gtmConsent: <auto_deny_load_gtm>`) and embeds it in `cfg.session.consent`. This replaces the old client-side `session_apply_denial()`.
6. Sets the user-ID cookie via `Set-Cookie` if the resulting consent state grants the required services (or if `cookie_mode: always`).
7. Embeds `aGTM.f.config({ session: { sid, uid, ga4sid, muidga4, consent? }, consent_store_url })` in the returned JavaScript.

aGTM receives the pre-populated `session` object (Phase 2 preset gate accepts any object with `sid` or `consent`); Phase 3 will additionally seed `aGTM.d.consent` and `aGTM.d.consent_hash` from `cfg.session.consent`. No client-side session fetch is performed.

When the browser POSTs consent updates to `consent_store_url`, the handler:
1. Manages the user-ID cookie (`cookie_mode: consent` only) based on whether the new consent grants the required services.
2. **Persists the consent** into the Session API record (`POST /tp/session/{tenant}/{uid}/consent`) so the next library load returns it via `cfg.session.consent`.

Returns `{ "ok": true }`.

#### Tenant ID

The tenant identifier used in API paths (`/tp/session/{tenant}/{uid}`). Required.

#### Session API URL

Base URL for the Session API (`GET /tp/session/{tenant}/{uid}` for read, `POST /tp/session/{tenant}/{uid}/consent` for write). Without tenant or user suffix, e.g. `https://api.example.com/tp/session`.

#### Consent Store URL

Full URL that aGTM (Phase 3) POSTs consent diffs to. The last path segment becomes the sGTM listener path. The handler manages the user-ID cookie AND persists the consent into the Session API record. Leave empty to disable.

#### Load GTM even under server-side auto-denial (`auto_deny_load_gtm`)

When the Session API has no recorded consent for a returning visitor, the Client constructs a server-side auto-denial. If checked (default), the embedded `gtmConsent` flag is set to `true` so GTM still loads (only services requiring `aGTMconsent` fire). Uncheck to block GTM entirely under auto-denial.

#### Cookie Mode

Controls when the user ID cookie is set:

| Value | Behaviour |
|---|---|
| `always` | Cookie is always set, regardless of consent |
| `never` | Cookie is never set; fingerprint-based ID is used |
| `consent` | Cookie is only set when the Session API consent state grants the required services (or when an existing cookie is already present) |

#### Cookie Name / Cookie Lifetime / Cookie Domain

Name, max-age in seconds, and domain for the user ID cookie. The cookie is set via `Set-Cookie` in the server response (not via JavaScript), making it ITP-resistant.

#### Fingerprint Allowed

If checked, a fingerprint-based user ID (`F$...`) is generated when no cookie is available. Used both as the Session API key on first visits and as the value written to the cookie on consent (so the same uid is retained across loads).

#### Consent Service / Purpose / Vendor

The consent condition required to consider consent "granted" in `cookie_mode: consent`. Mirrors the GTM Container Setup consent check logic.

#### Debug Suffix

An optional suffix appended to the `/aGTM.js` path for debug/staging variants. Useful for testing different configurations without affecting production traffic.

---

### POST Transport

Allows aGTM to send event data directly to a server-side endpoint via HTTP POST, independently of the GTM dataLayer. Useful for tracking events reliably even when GTM is blocked, or before consent is available (using the `_noConsent` event property on individual events).

Individual events can override these global defaults via the `_post` property in `aGTM.f.fire()`.

#### Transport URL

The global default URL for HTTP POST transport. Leave empty to disable POST transport globally.

#### Encrypt POST payload

If checked, the POST payload is obfuscated using the Transport Salt before sending. Requires Transport Salt to be set.

#### Transport Encryption Salt

A numeric salt for encrypting POST payloads. Only active when payload encryption is checked. If not set here, the Session Encryption Salt is used as fallback.

---

You can find more information about configuration options in the Installation section of the [aGTM README](https://github.com/Andiministrator/aGTM/blob/main/README.md).

---

## Testing

1. Activate Preview Mode in sGTM.
2. Trigger the request via your browser though visiting a Webpage what has the sGTM integrated.
3. Verify:
   - The client was invoked
   - The Events are fired in the dataLayer, at least the aGTM_ready event.
4. Optionally confirm the events in GA4 DebugView.

---

## Contact and more Information

Feel free to use or change the code. If you have suggestions for improvement, please write to me.

- **Licence:** Apache 2.0
- **Repository:** [GA4 Event Importer - Github Repository](https://github.com/Andiministrator/ga4-tracking-pixel)

### Author and Contact

Please contact me if you found problems or have improvements:

**Andi Petzoldt**

- ☛ https://andiministrator.de
- ✉ andi@petzoldt.net
- 🧳 https://www.linkedin.com/in/andiministrator/
- 🐘 https://mastodon.social/@andiministrator
- 👥 https://friendica.opensocial.space/profile/andiministrator
- 📷 https://pixelfed.de/Andiministrator
- 🎧 https://open.audio/@Andiministrator/

---

## Changelog

- Version 1.3, *in development*
  - aGTM Client Template updated to v1.5 (matches the v1.5 redesign of aGTM)
  - **Single Session API model** (Phase 1 of the v1.5 redesign): the previous two-step presession + session flow is collapsed. The Session API itself stores the consent record (`GET` returns it, `POST /consent` writes it)
  - **Server-side auto-denial** moved here: when the Session API has no consent on file for a returning visitor, the Client constructs the denial-consent block and embeds it into `cfg.session.consent`. Replaces the deleted client-side `aGTM.f.session_apply_denial()`
  - **Consent passthrough**: when the Session API returns a stored consent block, it is forwarded as `cfg.session.consent` so aGTM can inject GTM immediately on returning visits, no CMP wait needed
  - **`consent_store_url` POST handler** now both manages the user-ID cookie AND persists the consent into the Session API record (`POST /tp/session/{tenant}/{uid}/consent`), closing the loop
  - **uid stays consistent**: existing cookie or fingerprint, used identically for the Session API key AND the cookie write — no random uid generation, no key mismatch across loads
  - Bot check runs first — 403 returned for detected bots, no session created
  - ITP-resistant cookie setting via `Set-Cookie` header in the `/aGTM.js` response
  - `cookie_mode` parameter: `always` / `never` / `consent`
  - Removed parameters: `presession_api_url` (no more presession), `session_gtm_on_deny` (replaced by `auto_deny_load_gtm`, semantics moved server-side), `session_deny_service` (auto-denial service is now hard-coded as `aGTMconsent`)
  - Renamed parameter: `consent_url` → `consent_store_url` (clearer intent: the endpoint persists consent into the session record)
  - New parameter: `auto_deny_load_gtm` (boolean, default true) — server-side replacement for `session_gtm_on_deny`
  - Required Session API endpoints (api4sgtm-compatible):
    - `GET /tp/session/{tenant}/{user}` → `{sessionId, counter, ga4sid, muidga4, consent?}`
    - `POST /tp/session/{tenant}/{user}/consent` (body = `ConsentState` JSON, full replace) → `{ok: true, sessionId}`

- Version 1.2, *27.04.2026*
  - aGTM Client Template updated to v1.5
  - New config group: **Session & User Data** — `user_id`, `session_url`, `session_salt`, `session_wait`, `session_timeout`, `session_gtm_on_deny`
  - New config group: **POST Transport** — `transport_url`, `transport_enc`, `transport_salt`
  - Template icon size reduced

- Version 1.1, *11.09.2025*
  - aGTM version update to v1.4.2
  - Some Features and Consent Checks added

- Version 1.0, *01.06.2025*
  - Initial Version

---
