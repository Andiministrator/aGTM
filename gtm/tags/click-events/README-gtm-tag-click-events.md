# aGTM Click Events Template - User Documentation

## Introduction

The **aGTM Click Events Template** provides a highly customizable click event listener that captures detailed information about user interactions on a webpage. This template offers more flexibility and data compared to the built-in GTM click listeners. It's especially useful for tracking outbound links, file downloads, email, and phone clicks.

- **Version**: 1.0
- **Last Updated**: 07.03.2024
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM-tag-Click-Events.tpl](./tags/aGTM-tag-Click-Events.tpl)

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

- Allows tracking of outbound clicks, file downloads, email, and phone link interactions.
- Supports custom event names, additional event parameters, and Universal Analytics event data.
- Provides text filtering to mask sensitive data in event tracking.

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Click Events Template** (`aGTM-tag-Click-Events.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM Click Events`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### Event Name (`eventname`)

- **Default**: `click`
- The event name to push into the `dataLayer` when a click is detected.

### Selector (`selector`)

- **Default**: `a`
- The CSS selector to target elements for click tracking.

### Download Event (`downloadevent`)

- **Default**: `file_download`
- Event name for clicks on downloadable files.

### Outbound Settings (`outbound_settings`)

| Field                | Description                                 | Example               |
|----------------------|---------------------------------------------|-----------------------|
| **Cross Domains**    | Comma-separated list of internal domains.   | `example.com, sub.example.com` |
| **Cross Matching**   | Determines the matching level (domain/hostname). | `domain` |
| **Attach Outbound**  | Appends `_outbound` to event names for outbound links. | Checked/Unchecked |

### Contact Options (`contact_options`)

| Field                   | Description                                | Example               |
|-------------------------|--------------------------------------------|-----------------------|
| **Use Contact**         | Use a different event name for email/phone clicks. | Checked/Unchecked    |
| **Contact Prefix**      | Prefix for contact-related events.         | `contact_`            |

### Additional Event Parameters (`addparameter`)

You can add custom parameters to the event using this table.

| Field      | Description                        | Example     |
|------------|------------------------------------|-------------|
| **Name**   | Name of the custom parameter.      | `category`  |
| **Value**  | Value of the custom parameter.     | `button`    |

**Note**: These parameters are set when the tag is triggered.

### Universal Analytics Event (`ua_event`)

- **Checkbox**: `Add event_category, event_action and event_label`
- When enabled, it will add:
  - `event_category`: Set to "User Experience"
  - `event_action`: Set to the defined `Event Name`
  - `event_label`: Set to the element text

---

## Example Configuration

Here’s an example of how to set up click tracking:

1. **Event Name**: `click_event`
2. **Selector**: `a`
3. **Download Event**: `file_download`
4. **Outbound Settings**:
   - **Cross Domains**: `example.com`
   - **Attach Outbound**: Checked

5. **Contact Options**:
   - **Use Contact**: Checked
   - **Contact Prefix**: `contact_`

6. **Additional Parameters**:
   - **Name**: `category`
   - **Value**: `interaction`

7. **UA Event**: Checked (to include `event_category`, `event_action`, and `event_label`).

This setup will track clicks on all `<a>` elements, identify outbound links, and categorize email/phone clicks with a prefix.

---

## Debugging and Testing

### Enabling Debug Mode
To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Event Data
- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that events are firing as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- This template provides an alternative to GTM's built-in click tracking, offering more control and customization.
- Ensure that your aGTM integration is properly configured for this template to function correctly.

### Known Limitations
- This template requires JavaScript access to the `aGTM` object. Make sure it is accessible in the current page context.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**