# aGTM DL Repeat Template - User Documentation

## Introduction

The **aGTM DL Repeat Template** is designed to repeat events that were sent before Google Tag Manager (GTM) was fully loaded or before the `aGTMready` event was fired in the `dataLayer`. This template is especially useful for capturing events that occurred before the user's consent was given or before GTM was fully initialized.

- **Version**: 1.3
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

This template requires an existing **aGTM integration** within your GTM setup.

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
| **source**           | Replay source. `aGTM.d.f` (default) = pre-consent / pre-load buffer (original behaviour). `aGTM.d.dl` = post-load event log (late enrichment). | `aGTM.d.dl`        |
| **gateEvents**       | *(dl only)* The replay runs only once all listed events are present in the log (comma-separated, AND-joined). **Required** when the tag triggers on more than the enrichment event (e.g. with a fallback). Blank only if triggering solely on the enrichment event. | `user_data`        |
| **fallbackTimeout**  | *(dl only)* If the gate event has not arrived within this many ms, replay runs once anyway (unenriched). `0`/empty disables. Requires the trigger to also fire on `aGTM_repeat_fallback`. | `1500`             |
| **clearEcom**        | *(dl only)* Push `ecommerce: null` before each repeated event that carries an `ecommerce` object, to avoid bleed (GA4 recommendation). | Unchecked          |

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

With **source = `aGTM.d.dl`** this tag re-fires the earlier post-load events
once, marked `aGTMrepeated = true`, so the consumer tags fire again — now with
the late data available. It is storage-free (RAM only); the source is aGTM's
in-memory post-load event log `aGTM.d.dl`.

### Setup — recommended recipe (enrichment + guest fallback)

This recipe re-fires the commerce events once for **every** visitor — enriched
for logged-in users, unenriched (but on time) for guests — so consumer tags can
trigger purely on `aGTMrepeated = true`.

1. **This tag**
   - *Replay source* = `aGTM.d.dl`.
   - *Gate event(s)* = the enrichment event, e.g. `user_data`. **This is
     required for this recipe** (see the warning below).
   - *Fallback timeout* = e.g. `1500`.
   - *Whitelist* = the events that actually need enrichment, e.g.
     `view_item, view_cart, add_to_cart, begin_checkout, purchase` — so the
     replay does not re-fire unrelated events (e.g. a second `aPageview`).
   - **Trigger** = a Custom Event trigger matching the early anchor **and** the
     gate event **and** the fallback signal, e.g. regex:
     `aPageview|user_data|aGTM_repeat_fallback`.
     - On `aPageview` the gate is not yet satisfied → the tag schedules the
       fallback timer and waits (it does **not** replay yet).
     - On `user_data` (logged-in) → it replays the earlier events; consumer
       tags now see the late data.
     - On `aGTM_repeat_fallback` (guest, after the timeout) → it replays once
       unenriched, so no tags fail.
2. **Consumer tags** (Enhanced Conversions, Criteo, …) — trigger them on
   `aGTMrepeated` **equals** `true`, and **exclude** the original pass
   (so each tag fires exactly once, on the repeated round).

> ⚠️ **Gate event(s) is required when you trigger on more than the enrichment
> event.** An empty gate counts as "ready", so the replay would run on the
> **first** trigger (e.g. `aPageview`) — unenriched — and the per-page dedup
> would then block the later enriched pass. Only leave the gate blank if the
> tag triggers **solely** on the enrichment event (simpler, but then there is
> no guest fallback). The fallback timeout likewise only takes effect together
> with a gate event.

> 🔂 **Use only one `source = aGTM.d.dl` "replay engine" tag per page.** It
> replays the events once; have your GA4 / Criteo / … tags consume the repeated
> round via `aGTMrepeated = true`. Multiple `dl` replay tags on one page share
> the same per-page dedup state (`aGTM.d.repeatMax`) and would interfere.

### Guarantees

- **No double conversion:** each source event is repeated at most once per page
  (per-page watermark + an in-code skip of events already carrying
  `aGTMrepeated = true`), even if the trigger fires multiple times.
- **No loop:** repeated events are never repeated again.
- **Order preserved:** events are replayed in their original order; event data
  (incl. `ecommerce`, `transaction_id`, items) is carried over unchanged.

> The existing **source = `aGTM.d.f`** behaviour is unchanged and fully
> backward compatible — tags that do not set the field keep replaying the
> pre-load buffer exactly as before.

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