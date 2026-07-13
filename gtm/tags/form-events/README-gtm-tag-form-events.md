# aGTM Form Events Template - User Documentation

## Introduction

The **aGTM Form Events Template** is an advanced event listener for form interactions on your website. It provides more detailed information about form submissions and user interactions with form fields compared to the default Google Tag Manager (GTM) form listener. This template allows you to capture detailed data on form submits, clicks into form fields, and more, with highly customizable settings.

- **Version**: 1.1
- **Last Updated**: 13.07.2026
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM tag - Form Events.tpl](./aGTM%20tag%20-%20Form%20Events.tpl)

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

- Captures form submit events with detailed form information.
- Detects user interactions with form fields (e.g., clicks into input fields).
- Allows adding custom parameters to events.
- Optionally includes Universal Analytics (UA) event data (`event_category`, `event_action`, `event_label`).

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Form Events Template** (`aGTM-tag-Form-Events.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM Form Events`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### Form Submit Event (`submitevent`)

The **Form Submit Event** parameter defines the event name that is pushed into the `dataLayer` when a form is submitted.

- **Default**: `form_submit`

### Form Field Click Event (`clickevent`)

The **Form Field Click Event** parameter sets the event name for when users click into form fields.

- **Default**: `form_click`

### Maximum Field Clicks (`maxclicks`)

Defines the maximum number of times a form field click event can be fired **per form**.

- **Default**: `1`
- The counter is tracked independently for each form (keyed by form id / name / action).

### Additional Event Parameters (`addparameter`)

Allows adding custom parameters to the event.

| Field      | Description                        | Example     |
|------------|------------------------------------|-------------|
| **Name**   | Name of the custom parameter.      | `category`  |
| **Value**  | Value of the custom parameter.     | `contact`   |

### Universal Analytics Event (`ua_event`)

- **Checkbox**: `Add event_category, event_action and event_label`
- When enabled, it will add:
  - `event_category`: Set to "User Experience"
  - `event_action`: Set to the defined `Event Name`
  - `event_label`: Set to the form destination URL

---

## Example Configuration

Here’s an example of how to set up a form event:

1. **Form Submit Event**: `form_submit`
2. **Form Field Click Event**: `form_click`
3. **Maximum Field Clicks**: `3`
4. **Additional Parameters**:
   - **Name**: `category`
   - **Value**: `form_interaction`
5. **UA Event**: Checked (to include `event_category`, `event_action`, and `event_label`).

---

## Debugging and Testing

### Enabling Debug Mode

To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Event Data

- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that events are firing as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- Ensure that your aGTM integration is properly configured for this template to function correctly.
- This template is designed to provide enhanced tracking capabilities beyond the default GTM form listener.

### Known Limitations

- This template requires JavaScript access to the `aGTM` object. Ensure it is accessible in the current page context.
- The per-form click counter keys forms by their `id` / `name` / `action`. Multiple forms on the same page that expose none of these attributes share a single counter, so `maxclicks` applies to them collectively rather than individually.

### Upgrade Note (1.0 → 1.1)

In 1.0 the form-click event name was, due to a bug, always emitted as `form_start` regardless of configuration. From 1.1 the configured **Form Field Click Event** (`clickevent`, default `form_click`) is honoured. If you have GTM triggers or tags listening for `form_start`, repoint them to your configured event name (default `form_click`) — otherwise they silently stop firing after the update.

---

## License

This template is released under the Apache License 2.0. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**