# aGTM Event Reference — v1.5

What aGTM pushes into the GTM dataLayer, and with which attributes.
For the full API see [README-for-Developers.md](README-for-Developers.md),
for the session/consent data contract [README-for-Integrators.md](README-for-Integrators.md).

**Other versions:** [EVENTS-v1.4.md](EVENTS-v1.4.md) (v1.4.x, deprecated).
**As a spreadsheet:** [assets/aGTM-Events-v1.5.xlsx](assets/aGTM-Events-v1.5.xlsx) —
same content as an event × attribute matrix, for tracking concepts.

---

## 1. How an event gets into the dataLayer

Everything goes through **`aGTM.f.fire(obj)`**:

```
aGTM.f.fire({ event: 'add_to_cart', value: 49.9 })
   → deep copy + aGTMts timestamp
   → dlSet enrichment (if configured)
   → no consent yet?  → parked in aGTM.d.f, NOT pushed  (see below)
   → consent?         → eventModel = null, aGTMparams, window.dataLayer.push(obj)
```

Three per-event flags control that gate:

| Flag | Effect |
|---|---|
| `_noConsent: true` | bypasses the consent gate — event is pushed immediately (functional/legal events). From an iFrame only if the "aGTM iFrame Support" tag in the top frame opts in (off by default, v1.5+) |
| `_noDLPush: true` | event is **not** pushed to the GTM dataLayer; still recorded in `aGTM.d.dl` + `aGTM.l`, POST transport still fires |
| `_post: true \| {url,enc,salt,consent}` | additionally sends the event via POST (server-side transport); `_post_sent` marks it as sent |

Events whose name starts with `aGTM` are never parked and never consent-gated —
they are aGTM's own control signals and must reach GTM before the consent decision.

> **Parked events are not replayed by themselves.** Everything fired before the consent
> decision stays in `aGTM.d.f` (the queue is never cleared) and is additionally handed to
> GTM **once**, as `aGTM.hastyEvents` inside the `aGTM_ready` event. Something has to pick
> it up: the GTM tag **"aGTM - DL Repeat"**, whose default source *is* `aGTM.d.f`, or your
> own code reading `aGTM.hastyEvents`. Without one of the two, those events never reach
> the dataLayer.

**Attributes present on (almost) every aGTM event:**

| Attribute | Meaning |
|---|---|
| `event` | event name |
| `aGTMts` | timestamp in milliseconds |
| `eventModel: null` | resets GA4's inherited event model — set by `fire()`, so the `aGTM_*` events that go straight through `sendnaus()` do not carry it |
| `aGTMparams` | copy of the event's own attributes, added by `fire()` to every **non-`aGTM*`** event (internal use) |
| `event_category` / `event_action` / `event_label` | only if the tag's "UA event" option is on — **except** the Scroll tag, which always sets `event_label` |

---

## 2. Library events (`aGTM.js`)

| Event | When | Key attributes |
|---|---|---|
| `aGTM_ready` | right before GTM is injected — the signal that aGTM is live. Pushed **once**, with the first container | `aGTM.version`, `aGTM.is_iframe`, **`aGTM.hastyEvents`** (the parked events), `aGTM.errors`, `aGTMconsent` (full consent object) |
| `gtm.js` | immediately after `aGTM_ready`, also once | `gtm.start` |
| `aGTM_consent` | once after injection, if `sendConsentEvent: true` | `aGTMconsent`, `aGTMts` |
| `aGTM_consent_update` | on every **changed** CMP decision (`run_cc('update')`, hash-gated so the 2 s poll stays quiet) | `aGTMconsent`, `aGTMts` |
| `aGTM_consent_mode` | Consent Mode tag, option "DataLayer Event" | `cm_signals` (the Google Consent Mode object) |
| `aGTM_repeat_fallback` | DL-Repeat gave up waiting for its gate event(s) — only if something was actually replayed | `aGTMrepeatCount`, `aGTMrepeatSource`, `aGTMrepeatMissing` (the gate event(s) that never arrived), `aGTMrepeatWaited` (ms) |
| `aPageview` | pageview, if `aPageview: true` (or via the Pageview tag) | `aGTMts` |
| `aDOMready` / `aPAGEready` | DOM ready / page fully loaded, if configured. When aGTM fires them itself they carry `aMSG` instead of a payload | `aGTMts`, `aMSG` |
| `exception` | caught JS error or a dataLayer problem | `errmsg`, `errtype` (`"JS Error"` / `"DL Error"`); on `"JS Error"` also `errct` (error counter, max 5 pushed / 100 counted) + `browser` + `timestamp`; on `"DL Error"` instead `obj_type`/`obj_value` or `fct_hook`/`fct_orig` |
| `vPageview` | **deprecated** — legacy name of `aPageview`, incl. the SPA URL listener (`oldURL`, `newURL`, `newTitle`) | `aGTMts` |

**Replayed events** (DL-Repeat / late enrichment) carry `aGTMrepeated: true`.
Point conversion tags at that marker and exclude the original pass.

**iFrame mode:** events forwarded from an iframe carry `aGTM_source: "iFrame <hostname>"`,
`ifEvCtr` (running number of all forwarded events) and `ifEvCtr_<event>` (per event name);
the iFrame Support tag can additionally prefix event names (default `iframe_`).

---

## 3. Template events (`gtm/tags/`)

Event names are the tag defaults — all of them are configurable in the tag.

### Click Events

| Event | Trigger |
|---|---|
| `click` | click on the configured selector (default `a`) |
| `click_outbound` | click leaving the own domain (optional own event name) |
| `contact_email` / `contact_phone` | click on a `mailto:` / `tel:` link — **only with the tag's contact option enabled** (off by default); prefix `contact_` is configurable |
| `file_download` | click on a file link |

Attributes: `text` (link text, max. 512 chars), `href`, `host` (target host),
`outbound` (`0`/`1`, only on `<a>` elements), `id`, `name`, `class`, `parentID`,
`parentClass`, `src`, `target`, `tagName`, `html` (max. 512 chars), `action: "click"`,
plus `file_name` + `file_extension` for `file_download`.

`type` is always set and says what was recognised: `email`, `phone`, `download`,
`link`, `link_<event>` or `<tagName>_click`.

> **Name collision:** with its contact option enabled the Copy tag produces the *same*
> event names `contact_email` / `contact_phone`. If both tags run with the option on,
> tell them apart by `action` (`"click"` vs. `"copy"`) — or give one of them a different prefix.

### Form Events

| Event | Trigger |
|---|---|
| `form_click` | first interaction with a form field |
| `form_submit` | form submit |

`form_click`: `form_id`, `form_name`, `form_class`, `form_destination`, `form_length`
(number of fields), `form_clicks` (how often a field of this form was targeted),
`field_id`, `field_name`, `field_type`, `field_position`, `target`, `parentID`,
`parentClass`, `text`, `html`.

`form_submit`: `form_id`, `form_name`, `form_destination`, `form_length`,
`class` (CSS class of the form — note: **not** `form_class`), `target`, `parentID`,
`parentClass`, `text`, `html`.

### Scroll Events

| Event | Trigger |
|---|---|
| `scroll` | a configured scroll step is reached (default `25,50,75,90`) |
| `scrolled` | the user scrolled at all (optional) |

Attributes: `scrolldepth` and `scroll_depth` — both the reached step as a **number**
(e.g. `25`; they are duplicates of each other), `viewport_relation` (page height ÷
viewport height). `event_label` (`">25%"` / `"User has scrolled"`) is always set here,
regardless of the "UA event" option.

> With the option "send an event if the viewport is too small to scroll", a `scroll`
> event can also fire **without** `scrolldepth`/`scroll_depth`, carrying
> `event_label: "scroll tracking not necessary"`.

### Copy Events

| Event | Trigger |
|---|---|
| `text_copy` | user copies text |
| `contact_email` / `contact_phone` | the copied text is an email address / phone number — **only with the tag's contact option enabled** (off by default); prefix configurable, see the collision note above |

Attributes: `text` (the copied text — truncated at 512 chars only when it is plain text,
not when it was recognised as an email address or phone number), `text_length`,
`action: "copy"`, and `type` — `string`, `email` or `phone`. Note that `type` reports the
recognised kind even when the event is still called `text_copy`.

### Timer Events

| Event | Trigger |
|---|---|
| `timer` | a configured timer fires (name may contain `[s]` — replaced by the elapsed seconds) |

Attributes: `timer_nm` (internal timer name), `timer_ms` (interval), `timer_ct` (run count),
`timer_rp` (configured repeats), `timer_tm` (total ms), `timer_sc` (total seconds),
`id` (internal timer handle).

### Pageview / Page State Events

| Event | Trigger |
|---|---|
| `aPageview` | pageview (`early` / on DOM ready / on load) |
| `human_check` | user identified as human → `human_detected: 1` |
| `adblock_check` | ad blocker check → `adblock_detected: 1` (blocker active) or `0` |

> Both flags are sent as **numbers**, not booleans — a GTM trigger comparing against
> `true` will not fire.

Selectable page/device attributes — you pick which ones to send and name the dataLayer key
yourself; the names below are the usual ones:
`page_title`, `canonical`, `robots`, `browser`, `browser_version`, `os`, `device`
(`Desktop` / `Mobile` / `Bot` / `Bot (JS Time)`), `screen_width`, `screen_height`,
`viewport_width`, `viewport_height`, `viewport_relation` (page height ÷ viewport height),
`page_width`, `page_height`, `locale`, `dnt` (Do-Not-Track), `js_ex_time` (real duration
of a 100 ms delay — bot detection), `cm` (Google Consent Mode as object), `cm_str` (same
as string), `count` (event counter, how often the tag has fired on this page).

> The JS-time bot check has one **hard-wired** key: if it runs without the attribute being
> selected in the table, the value arrives as `bottest_jsexct`.

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
| `aGTM.d.dl` | every event that **passed** the consent gate (parked events are only in `aGTM.d.f`) |
| `aGTM.l` | internal log (decode with `aGTM_debug.js` or the aGTM Inspector) |

There are also three GTM **variable** templates in `gtm/variables/` for the same data:

| Variable | Returns |
|---|---|
| aGTM var - Consent Check | whether a given purpose/service/vendor is consented |
| aGTM var - Consent Info | a field of the consent state / the Google Consent Mode signals |
| aGTM var - Content Counter | number of words or of images (> 250 px) on the page |

See [README-for-Integrators.md](README-for-Integrators.md) for the full data contract.

---

## 5. Naming conventions

- `aGTM_*` — aGTM's own control events: never parked, never consent-gated.
- `a*` (`aPageview`, `aDOMready`, `aPAGEready`) — aGTM-generated page lifecycle events.
- `v*` (`vPageview`, …) — **deprecated** legacy names, removal planned for v2.0.
- All other names are yours: `fire()` accepts any event name and any attributes.
