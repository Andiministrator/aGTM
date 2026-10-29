# aGTM - GTM Templates

## Table of Contents

- [What is it for?](#what-is-this-document-it-for)
- [Available GTM Templates and Variables](#available-gtm-templates-and-variables)

---

## What is this document for?

There are a lot of Google Tag Manager templates you can use (if the GTM is injected with aGTM).
This extensions spends a lot of cool features for your GTM setup.

This Documentation lists the available GTM Templates and describes how to use them.

---

## Available GTM Templates and Variables

List of available **GTM Tag Templates***:

- **[Click Events](tags/click-events/README-gtm-tag-click-events.md)**
  Event Listener for Clicks in a page. Extremely customizable and provides much more information about the clicked object as the GTM-integrated click listener.
- **[Consent Mode](tags/consent-mode/README-gtm-tag-consent-mode.md)**
  This is the aGTM Consent Mode Tag Template. It uses the Consent Information what aGTM provides and is therefore useable with the first GTM event (Consent Initialisation).
  Optionally it also sets the Microsoft consent signals (UET and Clarity) from the same values — see the template README.
- **[Copy Events](tags/copy-events/README-gtm-tag-copy-events.md)**
  If the user copies a text (e.g. EMail-Address, Phone Number, Product Name, ...), this Event Listener will send an dataLayer Event with information about the copied object.
- **[DataLayer Repeat](tags/dl-repeat/README-gtm-tag-dl-repeat.md)**
  This Template can re-send events that were send before the GTM was injected into the page or before the aGTMready event came into the dataLayer.
- **[Form Events](tags/form-events/README-gtm-tag-form-events.md)**
  Event Listener for Form Submits. Extremely customizable and provides much more information about the form (and form fields) as the GTM-integrated form listener.
- **[iFrame Support](tags/iframe-support/README-gtm-tag-iframe-support.md)**
  If activated, aGTM sends automatically events from an iFrame to the Top Frame of a page. This Tag Template is listening to this kind of messages and can send them into the dataLayer of the Top Frame Page. You can filter what events should pass or filtered out, whether the events should have an event name prefix, and so on.
- **[Pageview Events](tags/pageview-events/README-gtm-tag-pageview-events.md)**
  With this Tag Template you can define when a Pageview event should be fired and what information it should have (e.g. Browser or Device Information, Page Information like Canonical or Robots Tag, Human Check, ...). The Tag can also be used as an Event Listener for DOM Ready and Window Loaded, providing additional information.
- **[Scroll Events](tags/scroll-events/README-gtm-tag-scroll-events.md)**
  This Event Listener sends customizable events when a user scrolls. You can define at what scrolling steps events should be fired or even if the user has started to scroll. Or whether the viewport is to small for Scrolling.
- **[Timer Events](tags/timer-events/README-gtm-tag-timer-events.md)**
  This Tag Template fires Events after a customizable time. You can define the seconds and how often the event has to repeat and a lot more ...

List of available **GTM Variable Templates**:

- **[Content Counter](variables/content-counter/README-gtm-var-content-counter.md)**
  Counts the words and images of a page.
- **[Consent Check](variables/consent-check/README-gtm-var-consent-check.md)**
  Variable to check a specific consent signal (purpose, service, or vendor) from aGTM's consent data.
- **[Consent Info](variables/consent-info/README-gtm-var-consent-info.md)**
  Variable that returns consent and Google Consent Mode signals from aGTM's consent data.

---

## Container templates

Two GTM container exports are a starting point for a new setup: one for the web container, one
for the server container. They embed the current templates from this repository (`gtm/` and
`sgtmClient/template.tpl`); `./build.sh` keeps those embedded copies in sync, and a test fails if
they drift.

**Every object you have to fill in is marked:** its name starts with **⚠** and its note (the
*Notes* field in GTM) starts with `ADJUST:`. After filling it in you can rename it.

Import each file into the matching container type via *Admin → Import Container*; choose
**Merge** and *Rename conflicting tags, triggers and variables* if the container is not empty.

### Server: `aGTM-container-template-server.json`

> **The consent condition table is empty — with it empty, the Client loads no GTM at all.**
> Since v1.5 an empty table is fail-closed. Add at least one condition (*Consent Check
> Conditions*) before you publish, or tick *Load GTM without any consent gate* if you
> deliberately want no consent gate.

Choose the condition deliberately: a service or purpose that your CMP classifies as essential
is granted on every visit, so with such a condition the gate never closes — not even after
"reject all". Pick that only if GTM itself is meant to run without consent.

The file contains the client **⚠ aGTM** and nothing else. Every field is on its template
default except three:

| Field | Value in the file | Why |
|---|---|---|
| *Fire GTM dataLayer Event "aPageview"* (`aPageview`) | on | the web container's tags fire on `aPageview` |
| *Fire GTM dataLayer Events "DOMloaded" and "PAGEready"* (`dlStateEvents`) | on | the event tags (forms, scroll, copy, click) fire on `aPAGEready` |
| *Tenant ID* (`tenant_id`) | `example` | required field; any short identifier |

Fill in:

| Field | Placeholder | What to enter |
|---|---|---|
| *Configure GTM Container* | `GTM-XXXXXXX`, comment `example.com` | your web container ID |
| *Used CMP* | not set | your CMP |
| *Consent Check Conditions* | empty | see the box above |
| Session / Sources API, transport | empty | only if you run those services |

### Web: `aGTM-container-template-web.json`

The seven aGTM tags and the GA4 e-commerce tags are in the folder *GTM Stuff / Consent*; the
Google tag, `GA - Pageview` and their configuration variables are in *Web Analytics*.

| Object | Placeholder | What to enter |
|---|---|---|
| Variable `⚠ GA - GTAG ID - 100` | `G-XXXXXXXXXX` | your GA4 measurement ID |
| Variable `⚠ cmp - consent - Google Analytics` | `,Google Analytics,` | the name of the analytics service in your CMP |
| Tag `⚠ ~aGTM - Consent Mode`, condition table | CMP service names such as `Google Analytics` | the names your CMP uses; check *regions* (`cm_regions`: EEA + CH + GB) |
| Tag `⚠ ~aGTM - Click - Links, Buttons`, *cross domains* | `example.com,example.org` | your own domains, or empty |

Requirements and behaviour:

- **The tags need the aGTM events `aPageview` and `aPAGEready`.** With the server template they
  are on. Without the Client, configure the library with `aPageview: true` and
  `dlStateEvents: true`; otherwise only Consent Mode and GA fire.
- **The e-commerce triggers only accept events that carry `aGTMts`**, i.e. events sent with
  `aGTM.f.fire()` or replayed once by the DL Repeat tag. A plain `dataLayer.push()` after the
  page is ready does not reach GA4 — this prevents double counting. Send shop events through
  `aGTM.f.fire()`, or remove the `{{dl - aGTMts}}` condition from the `ec - …` triggers.
- **GA4 runs after the CMP has answered, not necessarily after consent.** The GA4 tags have no
  consent check of their own. If your gate condition lets GTM load without analytics consent,
  they send cookieless pings under Consent Mode (`analytics_storage` denied). For no requests
  without consent, choose a gate condition that requires analytics consent or add a consent
  check to the tags. `allow_google_signals` follows the variable `js - analytics storage = true`.
- The Google tag has no `server_container_url` / `transport_url`. To send GA4 through a server
  container, add them to `GA - GTAG Config - 100`.
- The Consent Mode tag fires on *Consent Initialization* and on `aGTM_consent_update`, firing
  option *Once per event* (see `tags/consent-mode/README-gtm-tag-consent-mode.md`). Microsoft
  consent and "grant outside the regions" are off (template defaults).
- DL Repeat runs without a gate (template default); its blacklist is `cmp*,gtag_loaded`.
- Scroll Events 1.2 warns once in the console when the library is older than v1.5.

### History

Until October 2026 this folder held `aGTM-GTM-Workspace-Template-18.json`, a container
export from July 2025 with library 1.4.1, a Consent Mode tag before its fail-open fix and the
iFrame Support tag before its hardening. It is still in the git history; do not import it.
