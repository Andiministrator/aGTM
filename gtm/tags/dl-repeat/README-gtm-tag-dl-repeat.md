# aGTM DL Repeat Template - User Documentation

## Introduction

The **aGTM DL Repeat Template** is designed to repeat events that were sent before Google Tag Manager (GTM) was fully loaded or before the `aGTMready` event was fired in the `dataLayer`. This template is especially useful for capturing events that occurred before the user's consent was given or before GTM was fully initialized.

- **Version**: 1.1
- **Last Updated**: 25.06.2024
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM-tag-DL-Repeat.tpl](./aGTM-tag-DL-Repeat.tpl)

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
- Supports whitelisting and blacklisting of events.
- Allows for setting a maximum number of events to repeat to prevent infinite loops.
- Includes options for adding custom parameters to repeated events.

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM DL Repeat Template** (`aGTM-tag-DL-Repeat.tpl`).
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
| **gtmFired**    | Repeat events from the GTM `dataLayer`.                                     | Checked                          |
| **agtmFired**   | Repeat events fired using `aGTM.f.fire`.                                    | Checked                          |
| **messages**    | Repeat dataLayer messages (events without an event name).                   | Unchecked                        |
| **whitelist**   | Event names to include (comma-separated). Use `*` as a wildcard.            | `eventA, eventB_*`               |
| **blacklist**   | Event names to exclude (comma-separated). Use `*` as a wildcard.            | `eventC, eventD_*`               |

### Advanced Settings

| Parameter           | Description                                                               | Example            |
|---------------------|---------------------------------------------------------------------------|--------------------|
| **maxEvents**       | Maximum number of events to repeat (set to 0 for no limit).               | `100`              |
| **gtmEvents**       | Repeat internal GTM events (`gtm.start`, `gtm.load`, etc.).               | Unchecked          |
| **addparameter**    | Additional parameters to include in the repeated events.                  | `key=value`        |

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