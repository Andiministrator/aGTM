# aGTM (v)Pageview and Page State Events

**Template Filename**: `aGTM-tag-Pageview-Events.tpl`
**Last Update**: 02.06.2024
**Author**: Andi Petzoldt
**Description**: This template allows you to send customizable Pageview events or use it as an event listener for `DOMready` and `PAGEready` states. It includes options to collect additional information, such as browser details, device data, bot detection, and more.

[Back to GTM Templates Overview](../../README-gtm-templates.md)

---

## Table of Contents
- [Introduction](#introduction)
- [Configuration Options](#configuration-options)
  - [Pageview Event Name](#pageview-event-name)
  - [When Should the Pageview Event Fire](#when-should-the-pageview-event-fire)
  - [Maximum Event Firings](#maximum-event-firings)
  - [Pageview Attributes](#pageview-attributes)
  - [Bot Detection](#bot-detection)
  - [Human Test](#human-test)
  - [AdBlocker Test](#adblocker-test)
  - [Cookie Settings](#cookie-settings)
- [Examples](#examples)

---

## Introduction

With this template, you can define when a Pageview event should be fired and specify what information it should include, such as browser or device data, page metadata like the Canonical or Robots tags, or even a bot detection. The template can also act as an event listener for `DOMready` and `PAGEready`, making it versatile for various tracking needs.

---

## Configuration Options

### Pageview Event Name
- **Parameter**: `eventname`
- **Default**: `vPageview`
- Defines the name of the Pageview event that will be pushed to the dataLayer.

### When Should the Pageview Event Fire
- **Parameter**: `pv_fire`
- **Options**:
  - `early`: Fires the event as soon as possible.
  - `dom`: Fires when the DOM is fully loaded.
  - `page`: Fires after all page resources have loaded.
- **Default**: `early`

### Maximum Event Firings
- **Parameter**: `max_fire`
- **Default**: `1`
- Sets the maximum number of times this event can fire for the same trigger and event name. Use `0` for unlimited firings.

### Pageview Attributes
You can define additional attributes to be included in the dataLayer with the Pageview event.

| Internal Field           | DataLayer Field Name | Description                                      |
|--------------------------|----------------------|--------------------------------------------------|
| `f_pagetitle`            | `pagetitle`          | Captures the page title.                         |
| `f_canonical`            | `canonical`          | Retrieves the value of the Canonical tag.        |
| `f_robots`               | `robots`             | Retrieves the value of the Robots tag.           |
| `f_browser`              | `browser`            | Captures the browser type.                       |
| `f_browser_version`      | `browser_version`    | Captures the browser version.                    |
| `f_device`               | `device`             | Captures the device type (Desktop/Mobile).       |
| `f_os`                   | `os`                 | Captures the operating system.                   |
| `f_screen_width`         | `screen_width`       | Retrieves the screen width in pixels.            |
| `f_screen_height`        | `screen_height`      | Retrieves the screen height in pixels.           |
| `f_locale`               | `locale`             | Captures the browser language and country code.  |
| `f_dnt`                  | `dnt`                | Captures the DoNotTrack setting of the browser.  |
| `f_count`                | `count`              | Event counter for this Pageview event.           |

### Bot Detection
- **Parameter**: `use_js_check`
- Enables bot detection using JavaScript execution time checks.

### Human Test
- **Parameter**: `humanTest`
- Allows you to check if the user is a human based on interactions like mouse movement or scroll events.
  - **Event Name**: `humanEvent`
  - **DataLayer Field Name**: `humanField`

### AdBlocker Test
- **Parameter**: `adblockTest`
- Detects if an AdBlocker is active.
  - **Event Name**: `adblockEvent`
  - **DataLayer Field Name**: `adblockField`

### Cookie Settings
- **Parameter**: `useCookie`
- Use cookies to avoid repeated tests for bot detection or human checks.
  - **Cookie Name**: `cookieName`
  - **Default**: `_tr_Test_Result`

---

## Examples

### Example 1: Basic Pageview Event
To send a basic Pageview event with additional attributes:

```json
{
  "eventname": "vPageview",
  "pv_fire": "page",
  "max_fire": 1,
  "pv_attributes": [
    {"pv_attribute": "f_pagetitle", "pv_dl_name": "page_title"},
    {"pv_attribute": "f_browser", "pv_dl_name": "browser"}
  ]
}
```

### Example 2: Human and AdBlock Detection
To include a human test and AdBlock detection:

```json
{
  "useHumanTest": true,
  "humanEvent": "human_check",
  "humanField": "human_detected",
  "useAdBlockTest": true,
  "adblockEvent": "adblock_check",
  "adblockField": "adblock_detected"
}
```

---

For more details, refer to the [GTM Templates Overview](../README-gtm-templates.md).
