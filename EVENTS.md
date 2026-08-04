# aGTM Event Reference

What aGTM pushes into the GTM dataLayer, and with which attributes.
Applies to **v1.5**. For the full API see [README-for-Developers.md](README-for-Developers.md),
for the session/consent data contract [README-for-Integrators.md](README-for-Integrators.md).

> The spreadsheet in `assets/aGTM-Events.xlsx` is the older matrix view (v1.1) and is
> kept for reference only — **this file is the current one**.

---

## 1. How an event gets into the dataLayer

Everything goes through **`aGTM.f.fire(obj)`**:

```
aGTM.f.fire({ event: 'add_to_cart', value: 49.9 })
   → deep copy + aGTMts timestamp
   → dlSet enrichment (if configured)
   → no consent yet?  → queued in aGTM.d.f, replayed after consent as `hastyEvents`
   → consent?         → window.dataLayer.push(obj)
```

Three per-event flags control that gate:

| Flag | Effect |
|---|---|
| `_noConsent: true` | bypasses the consent gate — event is pushed immediately (functional/legal events) |
| `_noDLPush: true` | event is **not** pushed to the GTM dataLayer; still recorded in `aGTM.d.dl` + `aGTM.l`, POST transport still fires |
| `_post: true \| {url,enc,salt,consent}` | additionally sends the event via POST (server-side transport); `_post_sent` marks it as sent |

Events whose name starts with `aGTM` are never queued and never consent-gated —
they are aGTM's own control signals and must reach GTM before the consent decision.

**Attributes present on (almost) every aGTM event:**

| Attribute | Meaning |
|---|---|
| `event` | event name |
| `aGTMts` | timestamp in milliseconds |
| `eventModel: null` | resets GA4's inherited event model (set by the templates) |
| `event_category` / `event_action` / `event_label` | only if the template's "UA event" option is on |

---

## 2. Library events (`aGTM.js`)

| Event | When | Key attributes |
|---|---|---|
| `aGTM_ready` | right before GTM is injected — the signal that aGTM is live | `aGTM.version`, `aGTM.is_iframe`, **`aGTM.hastyEvents`** (the queued events to replay), `aGTM.errors`, `aGTMconsent` (full consent object) |
| `gtm.js` | immediately after `aGTM_ready`, per container | `gtm.start` |
| `aGTM_consent` | once after injection, if `sendConsentEvent: true` | `aGTMconsent`, `aGTMts` |
| `aGTM_consent_update` | on every **changed** CMP decision (`run_cc('update')`, hash-gated so the 2 s poll stays quiet) | `aGTMconsent`, `aGTMts` |
| `aGTM_consent_mode` | Consent Mode tag, option "DataLayer Event" | `cm_signals` (the Google Consent Mode object) |
| `aGTM_repeat_fallback` | DL-Repeat gave up waiting for its gate event(s) — only if something was actually replayed | `aGTMrepeatCount`, `aGTMrepeatSource`, `aGTMrepeatMissing` (the gate event(s) that never arrived), `aGTMrepeatWaited` (ms) |
| `aPageview` | pageview, if `aPageview: true` (or via the Pageview tag) | `aGTMts` |
| `aDOMready` / `aPAGEready` | DOM ready / page fully loaded, if configured | `aGTMts` |
| `exception` | caught JS error or a dataLayer problem | `errmsg`, `errtype` (`"JS Error"` / `"DL Error"`), `errct` (error counter, max 5 pushed / 100 counted), `browser`, `timestamp` |
| `vPageview` | **deprecated** — legacy name of `aPageview`, incl. the SPA URL listener (`oldURL`, `newURL`, `newTitle`) | `aGTMts` |

**Replayed events** (DL-Repeat / late enrichment) carry `aGTMrepeated: true`.
Point conversion tags at that marker and exclude the original pass.

**iFrame mode:** events forwarded from an iframe carry `aGTM_source: "iFrame <hostname>"`;
the iFrame Support tag can additionally prefix event names (default `iframe_`).

---

## 3. Template events (`gtm/tags/`)

Event names are the tag defaults — all of them are configurable in the tag.

### Click Events

| Event | Trigger |
|---|---|
| `click` | click on the configured selector (default `a`) |
| `click_outbound` | click leaving the own domain (optional own event name) |
| `contact_click_email` / `contact_click_phone` | click on a `mailto:` / `tel:` link |
| `file_download` | click on a file link |

Attributes: `text` (link text), `href`, `host` (target host), `outbound` (`0`/`1`),
`id`, `name`, `class`, `parentID`, `parentClass`, `src`, `target`, `html`,
`type` (`email` / `phone` / `download`), `action: "click"`,
plus `file_name` + `file_extension` for `file_download`.

### Form Events

| Event | Trigger |
|---|---|
| `form_click` | first interaction with a form field |
| `form_submit` | form submit |

Attributes: `form_id`, `form_name`, `form_class`, `form_destination`, `form_length`
(number of fields), `form_clicks` (how often a field was targeted), and for `form_click`
also `field_id`, `field_name`, `field_type`, `field_position`, `text`, `html`.

### Scroll Events

| Event | Trigger |
|---|---|
| `scroll` | a configured scroll step is reached (default `25,50,75,90`) |
| `scrolled` | the user scrolled at all (optional) |

Attributes: `scrolldepth` (number, e.g. `25`), `scroll_depth` (string, e.g. `"25"`),
`viewport_relation` (page height ÷ viewport height).

### Copy Events

| Event | Trigger |
|---|---|
| `text_copy` | user copies text |
| `contact_copy_email` / `contact_copy_phone` | the copied text is an email address / phone number |

Attributes: `text` (copied text), `text_length`, `type` (`string` / `email` / `phone`), `action: "copy"`.

### Timer Events

| Event | Trigger |
|---|---|
| `timer` | a configured timer fires (name may contain `[s]` — replaced by the elapsed seconds) |

Attributes: `timer_nm` (internal timer name), `timer_ms` (interval), `timer_ct` (run count),
`timer_rp` (configured repeats), `timer_tm` (total ms), `timer_sc` (total seconds).

### Pageview / Page State Events

| Event | Trigger |
|---|---|
| `aPageview` | pageview (`early` / on DOM ready / on load) |
| `human_check` | user identified as human → `human_detected: true` |
| `adblock_check` | ad blocker check → `adblock_detected: true/false` |

Selectable page/device attributes (dataLayer key is freely nameable per attribute):
`page_title`, `canonical`, `robots`, `browser`, `browser_version`, `os`, `device`
(`Desktop` / `Mobile` / `Bot`), `screen_width`, `screen_height`, `viewport_width`,
`viewport_height`, `viewport_relation`, `page_width`, `page_height`, `locale`,
`dnt` (Do-Not-Track), `js_ex_time` (JS execution time, bot detection).

---

## 4. Data that is *not* an event

Read these directly from the `aGTM` object with a GTM "JavaScript Variable" —
no custom template needed:

| Path | Content |
|---|---|
| `aGTM.d.consent` | current consent state (`hasResponse`, `services`, `purposes`, `vendors`, `gtmConsent`, …) |
| `aGTM.d.session` | session/user record from the sGTM Client (`uid`, `sid`, `sessionCount`, `source`, …) |
| `aGTM.d.attribution.<method>.<field>` | attribution, e.g. `aGTM.d.attribution.last_touch.sou` |
| `aGTM.d.bot` | bot-check verdict (`isBot`, `score`, `band`, `mode`), sGTM Client only |
| `aGTM.d.dl` | every event that went through `fire()` |
| `aGTM.l` | internal log (decode with `aGTM_debug.js` or the aGTM Inspector) |

See [README-for-Integrators.md](README-for-Integrators.md) for the full data contract.

---

## 5. Naming conventions

- `aGTM_*` — aGTM's own control events: never queued, never consent-gated.
- `a*` (`aPageview`, `aDOMready`, `aPAGEready`) — aGTM-generated page lifecycle events.
- `v*` (`vPageview`, …) — **deprecated** legacy names, removal planned for v2.0.
- All other names are yours: `fire()` accepts any event name and any attributes.
