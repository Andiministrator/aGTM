# aGTM iFrame Support

**Version**: 1.2
**Author**: Andi Petzoldt (<andi@petzoldt.net>)
**Last Update**: 12.08.2026

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM tag - iFrame Support.tpl](./aGTM%20tag%20-%20iFrame%20Support.tpl)

---

## Description

This GTM Template allows you to receive and process events sent from an iFrame to the top frame. If activated, aGTM sends events from the iFrame into the dataLayer of the top frame. You can filter which events should be passed or filtered out, add prefixes to event names, and customize event parameters.

**Note**: Requires an aGTM integration of the GTM.

## Table of Contents

- [Introduction](#introduction)
- [Setup Instructions](#setup-instructions)
- [Template Configuration](#template-configuration)
- [Usage Examples](#usage-examples)
- [Available Parameters](#available-parameters)

---

## Introduction

This template is used to capture events fired from an embedded iFrame and send them to the top frame. The template allows for hostname filtering, event prefixing, and event filtering based on patterns. It also supports defining custom dataLayer variables for further customization.

## Setup Instructions

1. **Download the Template**: Ensure that the template file `aGTM tag - iFrame Support.tpl` is placed in your GTM workspace.
2. **Configure the Tag**: Add a new tag in your GTM container using this template.
3. **Customize the Parameters**: Follow the configuration options below to set up your iFrame event tracking.

## Template Configuration

### Hostname Filter
Define a list of hostnames to specify which iFrames should be allowed to send events. You can also use regular expressions.

- **Hostname**: The domain name from which events are allowed.
- **Regexp?**: Enable if the hostname is a regular expression.

> ⚠️ **After updating to v1.5: enter your hostnames.** An empty list used to accept
> events from **any** http/https origin. It now rejects **everything** — see the
> breaking change below. If iFrame events stop arriving after the update, that is
> the reason, and the tag says so once in the browser console.

> **Security — fail-closed origin handling.** Foreign-origin `postMessage`s are
> validated before an event is fired:
> - **Opaque / non-http origins** (sandboxed or `srcdoc` frames reporting origin
>   `"null"`, `data:`/`blob:`) are **always rejected** — they can never be
>   allow-listed.
> - The sender hostname **must** match an entry of the allow-list, otherwise the
>   message is dropped. **An empty list matches nothing** (breaking change in
>   v1.5, see above).
> - A **regex** entry is anchored (`^(?:…)$`) before it is matched. Without that,
>   an entry `shop.example.com` also matched `shop.example.com.attacker.net` and
>   `evilshop.example.com`. **You still have to escape the dots yourself** —
>   write `shop\.example\.com`, otherwise `shopXexample.com` matches too. If you
>   do not need a pattern, leave "Regexp?" off; the plain comparison is exact.
> - aGTM's **control flags are never taken from a foreign message**: every key
>   starting with `_` is skipped (`_noConsent` only with the opt-in below), as are
>   `aGTMts`, `aGTMparams`, `aGTMchk`, `aGTMdl`, `eventModel` and
>   `__proto__`/`constructor`/`prototype`. Without this, an embedded frame could
>   POST page data to its own endpoint (`_post`) past the consent gate
>   (`_noConsent`) and invisibly (`_noDLPush`) — or suppress **every** event of
>   the page, because `fire()` silently skips an event carrying `eventModel` or a
>   numeric `aGTMts`.
> - **Event names reserved for the library** (`aGTM*`, `gtm.*`, `[av]DOMready`,
>   `[av]PAGEready`) are rejected. The check runs on the **final** name, after any
>   prefix was applied — an Event Prefix starting with `aGTM` would otherwise
>   create exactly such a name.
> - Only messages carrying a non-empty `event` are fired; event-less foreign
>   messages are ignored.
>
> On the library side, the iFrame accepts the top→iFrame handshake only from
> `window.top`, so a sibling frame or injected script cannot hijack the return
> origin.
>
> **What this does not do:** the allow-list is the trust boundary, the event
> *content* is not checked. An allow-listed frame can fire any non-reserved event
> with any payload, and the sender is not verified beyond its origin (the message
> event's `source` never reaches the template), so anything running inside an
> allow-listed origin can send events in its name. Keep the list to origins you
> control.

### Allow `_noConsent` from iFrames

**Off by default.** While off, a `_noConsent` flag arriving by `postMessage` is
stripped, so an iFrame cannot push its events past the consent gate of the top
frame. Switch it on only if your own allow-listed iFrame deliberately sends
functional or legally required events that must be tracked without consent.

`_post`, `_post_sent` and `_noDLPush` are **always** stripped and cannot be
re-enabled here.

### Event Filter and Modifications
- **Event Prefix**: Add a prefix to the event names (e.g., `iframe_`).
- **Event Filter**: Define filters to include, exclude, or prefix certain events.

### Event Parameters
Define custom dataLayer variables and additional parameters to be included in the event.

- **dataLayer Variables**: Names of dataLayer variables to capture.
- **Additional Event Parameters**: Key-value pairs to override existing event parameters. They are applied **after** the iFrame message, so they really do win — until v1.5 a value from the foreign message silently overwrote a configured `traffic_type`/`user_id`, contradicting this very help text.

## Usage Examples

### Example 1: Capturing Events from Specific iFrames
Set up the hostname filter to only capture events from `example.com` iFrames:
```
Hostname: example.com
Regexp?: No
```

### Example 2: Adding Prefix to Events
To distinguish iFrame events, set the prefix to `iframe_`:
```
Event Prefix: iframe_
Add Prefix to all Events: Yes
```

---

## Available Parameters

### Hostname Filter Table
| Parameter      | Description                          |
|----------------|--------------------------------------|
| Hostname       | Specify the hostname for filtering. **An empty table rejects every message.** |
| Regexp?        | Check if the hostname is a regex. The pattern is anchored, but escape the dots yourself. |

### Security Options
| Parameter                       | Description                          |
|---------------------------------|--------------------------------------|
| Allow `_noConsent` from iFrames | Off by default. Off = an iFrame cannot bypass the consent gate. `_post`/`_post_sent`/`_noDLPush` are always stripped. |

### Event Filter Table
| Parameter       | Description                          |
|-----------------|--------------------------------------|
| Filter Type     | Include, exclude, or prefix events   |
| Filter Pattern  | Pattern to match event names         |
| Is RegEx?       | Check if the pattern is a regex      |

### Additional Event Parameters Table
| Parameter Name  | Parameter Value                      |
|-----------------|--------------------------------------|
| Name            | Key of the event parameter           |
| Value           | Value to assign to the parameter     |

---

## Notes
This template is intended for use with aGTM-enabled websites and requires prior integration of aGTM with Google Tag Manager.
