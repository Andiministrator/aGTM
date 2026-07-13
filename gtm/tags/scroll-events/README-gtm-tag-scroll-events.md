# aGTM Scroll Events Template - User Documentation

## Introduction

The **aGTM Scroll Events Template** provides enhanced scroll tracking functionality for Google Tag Manager (GTM). This template allows you to define custom scroll events at specific scroll depths, detect when users start scrolling, and even handle cases where the viewport is too small for scrolling. This is particularly useful when the default GTM scroll tracking does not provide the precision you need.

- **Version**: 1.1
- **Last Updated**: 13.07.2026
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM tag - Scroll Events.tpl](./aGTM%20tag%20-%20Scroll%20Events.tpl)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Requirements](#requirements)
3. [Template Features](#template-features)
4. [Configuration Instructions](#configuration-instructions)
5. [Template Parameters](#template-parameters)
6. [Example Configuration](#example-configuration)
7. [Debugging and Testing](#debugging-and-testing)
8. [Notes](#notes)
9. [License](#license)

---

## Requirements

This template requires an existing **aGTM integration** within your GTM setup.

## Template Features

- Tracks custom scroll depths with flexible configuration.
- Sends events when users start scrolling.
- Handles scenarios where the viewport is too small to scroll.
- Supports additional event parameters and Universal Analytics event tracking.

---

## Configuration Instructions

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Scroll Events Template** (`aGTM tag - Scroll Events.tpl`).
4. Save and publish the template.
5. Create a new tag using the imported template.

---

## Template Parameters

### Event Name (`eventname`)

- **Description**: The name of the event to push into the `dataLayer`.
- **Default Value**: `scroll`

### Additional Event Parameters (`addparameter`)

You can add custom parameters to the event using this table.

| Field      | Description                        | Example     |
|------------|------------------------------------|-------------|
| **Name**   | Name of the custom parameter.      | `category`  |
| **Value**  | Value of the custom parameter.     | `button`    |

### Universal Analytics Event Parameters (`ua_event`)

- **Checkbox**: `Add event_category, event_action and event_label`
- When enabled, it will add:
  - `event_category`: Set to "User Experience"
  - `event_action`: Set to the defined `Event Name`
  - `event_label`: Indicates scroll depth or scroll action.

### Scroll Steps (`steps`)

- **Description**: Comma-separated list of scroll depth percentages to track.
- **Default Value**: `25,50,75,90`
- **Example**: `10,30,60,100`
- **Note**: The list is trimmed, coerced to numbers, de-duplicated and sorted
  ascending automatically, so order and stray whitespace/trailing commas do not
  matter (`"90, 25 ,50,"` behaves like `25,50,90`). Values outside 1–100 are
  dropped.

### No Scroll Event (`noscrollevent`)

- **Checkbox**: `Send an event if the viewport is too small to scroll`
- **Description**: Sends an event if the content does not require scrolling.

### Scroll Event (`isscrollevent`)

- **Checkbox**: `Send an event when the user starts scrolling (only once per page)`
- **Description**: Detects the first scroll action by the user and sends an event.

---

## Example Configuration

Here’s an example of how to set up scroll events:

1. **Event Name**: `scroll_event`
2. **Scroll Steps**: `10,50,100`
3. **Additional Parameters**:
   - **Name**: `category`
   - **Value**: `scrollTracking`
4. **Universal Analytics Event Parameters**: Checked
5. **No Scroll Event**: Checked
6. **Scroll Event**: Checked

This configuration will send events at 10%, 50%, and 100% scroll depths, include additional parameters, and fire an event if the user starts scrolling.

---

## Debugging and Testing

### Enabling Debug Mode
To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Event Data
- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that events are firing as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- This template improves upon the default GTM scroll tracking by offering more precise control over scroll events.
- Ensure that your aGTM integration is properly configured for this template to function correctly.
- **Performance (Core Web Vitals)**: the scroll and resize listeners are
  registered as *passive* (they never block scrolling) and *throttled* (scroll
  200 ms, resize 250 ms), so scroll tracking does not cause scroll jank or hurt
  INP. This relies on the `aGTM.f.evLstn` options added in aGTM library **v1.5**.

### Known Limitations
- This template requires JavaScript access to the `aGTM` object. Make sure it is accessible in the current page context.
- Requires the aGTM library **v1.5+** (uses the passive/throttle `aGTM.f.evLstn`
  options).
- **Run only one scroll-tracking tag per page.** The listeners are registered
  once per page via a shared guard; a second scroll tag would not register its
  own listeners. On single-page-app route changes the first listener is reused —
  the tracked scroll depth is not reset per virtual page.

---

## License

This template is released under the Apache License 2.0. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**