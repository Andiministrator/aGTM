# aGTM DL Repeat Template - User Documentation

## Introduction

The **aGTM DL Repeat Template** is designed to repeat events that were sent before Google Tag Manager (GTM) was fully loaded or before the `aGTMready` event was fired in the `dataLayer`. This template is especially useful for capturing events that occurred before the user's consent was given or before GTM was fully initialized.

- **Version**: 1.5
- **Last Updated**: 24.06.2026
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM tag - DL Repeat.tpl](<./aGTM tag - DL Repeat.tpl>)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Requirements](#requirements)
3. [Template Features](#template-features)
4. [Configuration Instructions](#configuration-instructions)
5. [Template Parameters](#template-parameters)
6. [Debugging and Testing](#debugging-and-testing)
7. [Notes](#notes)
8. [License](#license)

---

## Requirements

This template requires an existing **aGTM integration** within your GTM setup, and the **aGTM library v1.5+** (it uses `aGTM.f.dlrepeat`). With an older library the tag logs a warning and does nothing.

## Template Features

- Repeats dataLayer events that occurred before GTM was loaded or before consent was given.
- **Late-enrichment mode:** optionally replays the post-load event log (`aGTM.d.dl`) after a gate event arrives, so tags needing late data re-fire with full data — with a timeout fallback, loop protection and once-per-page dedup (no double conversion).
- Supports whitelisting and blacklisting of events.
- Allows for setting a maximum number of events to repeat to prevent infinite loops.
- Includes options for adding custom parameters to repeated events.

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM DL Repeat Template** (`aGTM tag - DL Repeat.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM DL Repeat`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### Main Settings

| Parameter       | Description                                                                 | Example                          |
|-----------------|-----------------------------------------------------------------------------|---------------------------------|
| **gtmFired**    | Repeat events from the GTM `dataLayer`.                                     | Unchecked (default)              |
| **agtmFired**   | Repeat events fired using `aGTM.f.fire`. **Enabled by default.**            | Checked (default)                |
| **messages**    | Repeat dataLayer messages (events without an event name).                   | Unchecked                        |
| **whitelist**   | Event names to include (comma-separated). Use `*` as a wildcard.            | `eventA, eventB_*`               |
| **blacklist**   | Event names to exclude (comma-separated). Use `*` as a wildcard.            | `eventC, eventD_*`               |

> **Note:** At least one of **gtmFired** / **agtmFired** must be enabled — otherwise the tag skips every event and does nothing. `agtmFired` is on by default so the tag works out of the box.

### Late-Enrichment (post-load replay)

| Parameter            | Description                                                                                              | Example            |
|----------------------|----------------------------------------------------------------------------------------------------------|--------------------|
| **source** *(What should be repeated?)* | `Before consent / before GTM loaded` (default, original behaviour) · `Everything in the dataLayer` (covers raw `dataLayer.push` — **recommended for shops**) · `Only events sent via aGTM.f.fire` (advanced). | Everything in the dataLayer |
| **gateEvents** *(Wait for event(s) before repeating)* | Repeat only once **all** of these events have appeared (comma-separated, e.g. `user_data`). Empty = repeat immediately. The tag waits on its own — no extra trigger needed. | `user_data` |
| **fallbackTimeout** *(Give up waiting after (ms))* | How long to wait for the events above before repeating anyway (e.g. `1500`). Covers guests without the awaited event. `0` = no time limit. | `1500` |
| **clearEcom**        | Reset ecommerce (`ecommerce: null`) before each repeated event, so GA4 values don't bleed between events. | Unchecked          |

### Advanced Settings

| Parameter           | Description                                                               | Example            |
|---------------------|---------------------------------------------------------------------------|--------------------|
| **maxEvents**       | Maximum number of events to repeat (set to 0 for no limit).               | `100`              |
| **gtmEvents**       | Repeat internal GTM events (`gtm.start`, `gtm.load`, etc.).               | Unchecked          |
| **addparameter**    | Additional parameters to include in the repeated events.                  | `key=value`        |

---

## Late-Enrichment Replay (post-load)

Some shops push an enrichment event **late** — for example a logged-in user's
hashed identifiers arrive *after* the conversion event:

```js
dataLayer.push({ event: "user_data", sha256_email: "…", sha256_phone: "…" });
```

By then `view_item`, `view_cart`, `purchase` have already fired, so tags that
need those hashes (Enhanced Conversions, Criteo, …) fired **without** them.

With a post-load **Replay source** this tag re-fires the earlier events once,
marked `aGTMrepeated = true`, so the consumer tags fire again — now with the
late data available. Storage-free (RAM only).

### Pick the right source

Critical: **`aGTM.d.dl` contains only events that went through `aGTM.f.fire`.**
Raw `dataLayer.push({...})` events — which is all most shop plugins (e.g.
Shopware) can do — never enter `aGTM.d.dl`. Check what is actually available in
GTM Preview:

```js
aGTM.d.dl.map(function(e){return e.event})   // only aGTM.f.fire events
dataLayer.map(function(e){return e.event})    // everything, incl. raw pushes
```

- If your `view_cart` / `purchase` / `user_data` show up in `aGTM.d.dl` → use
  **`aGTM.d.dl`**.
- If they only show up in the **live dataLayer** (the normal case for Shopware
  & co. that just `dataLayer.push`) → use **Live GTM dataLayer**.

### Setup — one trigger, the tag waits on its own

The replay engine lives in the aGTM library (`aGTM.f.dlrepeat`), so the tag
needs only a **single trigger** and watches the dataLayer itself — no
multi-event trigger, no extra control event.

1. **This tag**
   - *What should be repeated?* = **Everything in the dataLayer** (the usual
     choice for shops; see "Pick the right source" above).
   - *Wait for event(s) before repeating* = the late event, e.g. `user_data`.
   - *Give up waiting after (ms)* = e.g. `1500`, so guests without `user_data`
     still get one repeat.
   - *Whitelist* = the events that need enrichment, e.g.
     `view_item, view_cart, add_to_cart, begin_checkout, purchase`.
   - **Trigger** = a **single** trigger, e.g. **All Pages** (or an early event
     like `aPageview`). One trigger is enough — the tag waits for the
     wait-event(s) on its own.
   - **Tag firing options** = `Once per event` or `Unlimited` — **not** "Once
     per page" (that would limit the tag to a single firing).
2. **Consumer tags** (Enhanced Conversions, Criteo, …) — trigger them on
   `aGTMrepeated` **equals** `true`, and **exclude** the original pass (so each
   fires exactly once, on the repeated round).

### How it works

On its single run the tag hands its settings to `aGTM.f.dlrepeat()` in the
library. That function watches the chosen source for the wait-event(s) and, once
they are all present (or after the timeout), repeats the matching earlier events
once, marked `aGTMrepeated = true`.

- **Logged-in:** `user_data` arrives → the earlier `view_item` / `purchase` are
  repeated **with** the user data, so Enhanced Conversions / Criteo fire complete.
- **Guest (no `user_data`):** after the timeout the repeat runs once anyway, so
  no tags are missed.

### Monitoring / error detection

Enable **"Fire an error event if the wait-event(s) never arrive"**. Then — and
**only** in the error case (the timeout elapsed and the wait-event(s) had not
arrived, so the replay ran unenriched) — the library pushes **`aGTM_repeat_fallback`**
into the dataLayer:

| Key | Meaning |
|---|---|
| `aGTMrepeatCount` | number of events repeated (**may be `0`** — e.g. a guest with nothing to replay; the event still signals "fallback ran") |
| `aGTMrepeatSource` | `f` / `dl` / `live` |

Trigger a monitoring/alert tag on **`aGTM_repeat_fallback`** to catch missing
enrichment (e.g. `user_data` not firing). Nothing is pushed on a normal,
enriched replay. Needs a fallback timeout > 0.

### Guarantees

- **No double conversion:** the replay runs **at most once per page**.
- **No loop:** repeated events (`aGTMrepeated = true`) are never repeated again.
- **Order preserved:** events keep their original order and data (incl.
  `ecommerce`, `transaction_id`, items).

> Use **one** DL-Repeat tag per page as the "replay engine"; let your GA4 /
> Criteo / … tags consume the repeated round via `aGTMrepeated = true`.

> The default source **Before consent / before GTM loaded** keeps the original
> behaviour and is fully backward compatible.

> **Requires the aGTM library v1.5+** (provides `aGTM.f.dlrepeat`). With an older
> library the tag logs a warning and does nothing.

---

## Debugging and Testing

### Enabling Debug Mode
To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Event Data
- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that events are firing as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- This template helps capture events that occurred before GTM initialization or user consent was given.
- Ensure that your aGTM integration is properly configured for this template to function correctly.

### Known Limitations
- This template is dependent on the `aGTM` object being available on the page.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**