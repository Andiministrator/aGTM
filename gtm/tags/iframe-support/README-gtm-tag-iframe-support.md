# aGTM iFrame Support

**Version**: 1.1
**Author**: Andi Petzoldt (<andi@petzoldt.net>)
**Last Update**: 13.07.2026

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

> **Security — fail-closed origin handling.** Foreign-origin `postMessage`s are
> validated before an event is fired:
> - **Opaque / non-http origins** (sandboxed or `srcdoc` frames reporting origin
>   `"null"`, `data:`/`blob:`) are **always rejected** — they can never be
>   allow-listed.
> - When you configure a hostname allow-list, the sender hostname **must** match
>   an entry, otherwise the message is dropped.
> - Only messages carrying a non-empty `event` are fired; event-less foreign
>   messages are ignored (no dataLayer injection).
> - Leaving the list empty accepts events from **any** http/https iFrame origin —
>   use this only for trusted same-site setups; for production, list the exact
>   hostnames you expect.
>
> On the library side, the iFrame accepts the top→iFrame handshake only from
> `window.top`, so a sibling frame or injected script cannot hijack the return
> origin.

### Event Filter and Modifications
- **Event Prefix**: Add a prefix to the event names (e.g., `iframe_`).
- **Event Filter**: Define filters to include, exclude, or prefix certain events.

### Event Parameters
Define custom dataLayer variables and additional parameters to be included in the event.

- **dataLayer Variables**: Names of dataLayer variables to capture.
- **Additional Event Parameters**: Key-value pairs to override existing event parameters.

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
| Hostname       | Specify the hostname for filtering   |
| Regexp?        | Check if the hostname is a regex     |

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
