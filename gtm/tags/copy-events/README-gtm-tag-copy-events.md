# aGTM Copy Events Template - User Documentation

## Introduction

The **aGTM Copy Events Template** allows you to track whenever users copy text from your website. It provides detailed information about the copied content, such as whether it was an email address or a phone number, and allows you to filter or modify the captured text. This template is ideal for monitoring user engagement with specific content.

- **Version**: 1.0
- **Last Updated**: 20.03.2024
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM-tag-Copy-Events.tpl](./aGTM-tag-Copy-Events.tpl)

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

- Tracks when users copy text from your website.
- Can distinguish between copying of regular text, email addresses, or phone numbers.
- Supports filtering and modifying copied content.
- Allows adding custom event parameters.
- Can include Universal Analytics (UA) event data (`event_category`, `event_action`, `event_label`).

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Copy Events Template** (`aGTM-tag-Copy-Events.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM Copy Events`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### Event Name (`eventname`)

The event name to be pushed to the `dataLayer` when a user copies text. Default is `text_copy`.

### Contact Detection (`usecontact`)

Checkbox to enable detection of whether the copied text is an email address or phone number. If enabled, a prefix will be added to the event name.

- **Prefix** (`contactprefix`): The prefix to use if the text is an email address or phone number. Default is `contact_`.

### Text Filter (`textfilter`)

Allows filtering of copied text based on patterns. Text that matches the pattern will be replaced.

| Field            | Description                                         | Example               |
|------------------|-----------------------------------------------------|-----------------------|
| **Text Filter**  | The pattern to match (supports regex).              | `^\d{3}-\d{3}-\d{4}$` |
| **Is RegEx**     | Checkbox to specify if the pattern is a regex.      |                       |
| **Replacement**  | The text to replace matched patterns with.          | `***FILTERED***`      |

### Additional Event Parameters (`addparameter`)

You can add custom parameters to the event using this table.

| Field      | Description                        | Example     |
|------------|------------------------------------|-------------|
| **Name**   | Name of the custom parameter.      | `category`  |
| **Value**  | Value of the custom parameter.     | `interaction`|

### Universal Analytics Event (`ua_event`)

- **Checkbox**: `Add event_category, event_action and event_label`
- When enabled, it will add:
  - `event_category`: Set to "User Experience"
  - `event_action`: Set to the defined `Event Name`
  - `event_label`: Set to the copied text.

---

## Example Configuration

Here’s an example of how to set up a copy event:

1. **Event Name**: `text_copy`
2. **Contact Detection**: Enabled with prefix `contact_`.
3. **Text Filter**:
   - **Pattern**: `^\d{3}-\d{3}-\d{4}$`
   - **Is RegEx**: Checked
   - **Replacement Text**: `***FILTERED***`
4. **Additional Parameters**:
   - **Name**: `category`
   - **Value**: `interaction`
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

- This template is designed to track user interactions with copied text, providing insights into user behavior.
- Ensure that your aGTM integration is properly configured for this template to function correctly.

### Known Limitations
- This template requires JavaScript access to the `aGTM` object. Make sure it is accessible in the current page context.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**