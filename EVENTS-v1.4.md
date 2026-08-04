# aGTM Event Reference — v1.4.x (DEPRECATED)

> **⚠️ This document describes aGTM v1.4.x and is no longer maintained.**
> Current version: **[EVENTS.md](EVENTS.md)** (v1.5).
> This file exists for sites still running v1.4.x — see [What changed in v1.5](#6-what-changed-in-v15)
> at the bottom before you upgrade. **Three of those changes are breaking.**

What aGTM v1.4.x pushes into the GTM dataLayer, and with which attributes.

> **Which v1.4 exactly:** this describes **v1.4.1**, the last *tagged* v1.4 release (tag
> `v1.4.1`, and the state of `main`). Two later states shipped unofficially, without a tag:
> **1.4.2** (`CHANGELOG.md` has an entry; `aGTM.js` carries `@version 1.4.2` from
> 2025-09-09 until the v1.5 bump) and **1.4.3pre**, which is a *sGTM Client* version, not a
> library one — the library embedded in that client still reports `1.4.2`. Everything below
> applies to all three: they differ in CMP adapters, the two GTM variable templates, build
> tooling and server-side client behaviour, **not** in events. The changes listed in
> [§6](#6-what-changed-in-v15) likewise came *after* the whole v1.4 line, so they apply to
> it whichever of the three you run.

**As a spreadsheet:** [assets/aGTM-Events-v1.4.xlsx](assets/aGTM-Events-v1.4.xlsx) (also deprecated).

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

Events whose name starts with `aGTM` are never parked and never consent-gated —
they are aGTM's own control signals and must reach GTM before the consent decision.

> v1.4.x has **no per-event flags**. `_noConsent`, `_noDLPush` and `_post` (POST transport)
> were added in v1.5 — in v1.4.x every non-`aGTM*` event is consent-gated, without exception.

> **Parked events are not replayed by themselves.** Everything fired before the consent
> decision stays in `aGTM.d.f` (the queue is never cleared) and is additionally handed to
> GTM **once**, as `aGTM.hastyEvents` inside the `aGTM_ready` event. Something has to pick
> it up: the GTM tag **"aGTM - DL Repeat"**, which reads `aGTM.d.f`, or your own code
> reading `aGTM.hastyEvents`. Without one of the two, those events never reach the dataLayer.

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
| `aGTM_consent_update` | on **every** `run_cc('update')` run — also when nothing changed | `aGTMconsent`, `aGTMts` |
| `aPageview` | pageview, if `aPageview: true` (or via the Pageview tag) | `aGTMts` |
| `aDOMready` / `aPAGEready` | DOM ready / page fully loaded, if configured. When aGTM fires them itself they carry `aMSG` instead of a payload | `aGTMts`, `aMSG` |
| `exception` | caught JS error or a dataLayer problem | `errmsg`, `errtype` (`"JS Error"` / `"DL Error"`); on `"JS Error"` also `errct` (error counter, max 5 pushed / 100 counted) + `browser` + `timestamp`; on `"DL Error"` instead `obj_type`/`obj_value` or `fct_hook`/`fct_orig` |
| `vPageview` | **deprecated** — legacy name of `aPageview`, incl. the SPA URL listener (`oldURL`, `newURL`, `newTitle`) | `aGTMts` |

**Replayed events** (DL-Repeat tag) carry `aGTMrepeated: true`.
Point conversion tags at that marker and exclude the original pass.

**iFrame mode:** events forwarded from an iframe carry `aGTM_source: "iFrame <hostname>"`,
`ifEvCtr` (running number of all forwarded events) and `ifEvCtr_<event>` (per event name);
the iFrame Support tag can additionally prefix event names (default `iframe_`).

---

## 3. Template events (`gtm/tags/`)

Event names are the tag defaults — all of them are configurable in the tag,
**except the form-click event** (see below).

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
| `form_start` | first interaction with a form field |
| `form_submit` | form submit |

> **The tag field "Event Name, if a user clicks into a form" has no effect in v1.4.x** —
> the code reads a field name that does not exist, so the event is always called
> `form_start`. Fixed in v1.5, where it is called `form_click` (see §6).

`form_start`: `form_id`, `form_name`, `form_class`, `form_destination`, `form_length`
(number of fields), `form_clicks` (how often a form field was targeted — in v1.4.x this is a
**page-global** counter across all forms, not per form),
`field_id`, `field_name`, `field_type`, `field_position`, `target`, `parentID`,
`parentClass`, `text`, `html`, plus an always-empty `form` object.

`form_submit`: `form_id`, `form_name`, `form_destination`, `form_length`,
`class` (CSS class of the form — note: **not** `form_class`), `target`, `parentID`,
`parentClass`, `text`, `html`.

### Scroll Events

| Event | Trigger |
|---|---|
| `scroll` | a configured scroll step is reached (default `25,50,75,90`) |
| `scrolled` | the user scrolled at all (optional) |

Attributes: `scrolldepth` (the reached step as a **number**, e.g. `25`), `scroll_depth`
(the same step as a **string**, e.g. `"25"`), `viewport_relation` (page height ÷ viewport
height). `event_label` (`">25%"` / `"User has scrolled"`) is always set here, regardless
of the "UA event" option.

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

Read these directly from the `aGTM` object with a GTM "JavaScript Variable":

| Path | Content |
|---|---|
| `aGTM.d.consent` | current consent state (`hasResponse`, `services`, `purposes`, `vendors`, `gtmConsent`, …) |
| `aGTM.d.dl` | every event that **passed** the consent gate (parked events are only in `aGTM.d.f`) |
| `aGTM.l` | internal log (decode with `aGTM_debug.js`) |

> `aGTM.d.session`, `aGTM.d.attribution` and `aGTM.d.bot` do **not** exist in v1.4.x —
> they come with the v1.5 sGTM Client.

v1.4.1 ships exactly one GTM **variable** template: **aGTM var - Content Counter**
(number of words or of images > 250 px on the page). **aGTM var - Consent Check** and
**aGTM var - Consent Info** came with the unofficial 1.4.2 — so whether you have them
depends on which of the three v1.4 states you run.

---

## 5. Naming conventions

- `aGTM_*` — aGTM's own control events: never parked, never consent-gated.
- `a*` (`aPageview`, `aDOMready`, `aPAGEready`) — aGTM-generated page lifecycle events.
- `v*` (`vPageview`, …) — **deprecated** legacy names, removal planned for v2.0.
- All other names are yours: `fire()` accepts any event name and any attributes.

---

## 6. What changed in v1.5

### Breaking — check this before you upgrade

| Change | What to do |
|---|---|
| **`form_start` → `form_click`** | In v1.4.x the form-click event was hard-coded to `form_start` (the tag's own field was dead). v1.5 fixes the field, so the default name is now `form_click`. **Repoint any GTM trigger listening for `form_start`, or set the tag field back to `form_start`** — otherwise it silently stops firing. |
| **`scroll_depth` is a number now** | In v1.4.x `scroll_depth` was a string (`"25"`), in v1.5 it is a number (`25`) and thus identical to `scrolldepth`. A trigger comparing to the string stops matching. |
| **Click tag: subdomains are no longer "outbound"** | The Click tag's `cross_matching` setting had no working default in v1.4.x, so it fell back to *hostname* scope: a link from `www.example.com` to `sub.example.com` fired `click_outbound` with `outbound: 1` and `type: "link_click_outbound"`. v1.5 defaults to *domain* scope, so the same click now fires `click` with `outbound: 0` and `type: "link_click"`. **Triggers on `click_outbound` or on `outbound = 1` lose those clicks** — set the tag explicitly to "hostname" if you want the old behaviour. |

### Behaviour change (not trigger-breaking, but changes volume)

| Change | What to expect |
|---|---|
| **`maxclicks` works now** | In v1.4.x the "maximum of form field clicks" field was read with the wrong type and therefore always `1`, counted **once per page**. v1.5 honours the configured number **per form**. With `maxclicks: 5` and several forms you will see noticeably more `form_click` events than you saw `form_start` events before. |
| **`form_clicks` counts per form** | Same root cause: in v1.4.x the counter was page-global across all forms, in v1.5 it counts per form. |

### Additions

| Addition | What it does |
|---|---|
| `_noConsent` / `_noDLPush` / `_post` | per-event flags: bypass the consent gate, skip the dataLayer push, send the event via POST |
| `aGTM_consent_mode` | new event of the Consent Mode tag (option "DataLayer Event"), carries `cm_signals` |
| `aGTM_repeat_fallback` | DL-Repeat gave up waiting for its gate event(s); carries `aGTMrepeatCount`, `aGTMrepeatSource`, `aGTMrepeatMissing`, `aGTMrepeatWaited` |
| DL-Repeat as `aGTM.f.dlrepeat()` | the replay engine moved into the library (gate wait, poll, late enrichment); the tag is a thin wrapper and needs only a single trigger |
| `aGTM_consent_update` is hash-gated | fires only on a **changed** consent state, so the periodic CMP poll stays quiet |
| `aGTM.d.session` / `.attribution` / `.bot` | session, attribution and bot-check data from the sGTM Client — none of them exist anywhere in the v1.4 line, including the unofficial states |
| Two new GTM variables | aGTM var - Consent Check, aGTM var - Consent Info — unless you already run the unofficial 1.4.2, which brought them |

Apart from the items above, upgrading is additive for event tracking. The list is compiled
from the diff `v1.4.1..v1.5` over `aGTM.js` and `gtm/`, focusing on event names, attribute
names and attribute types — check your own triggers against
[CHANGELOG.md](CHANGELOG.md) as well, which carries the complete change list.
