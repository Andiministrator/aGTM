# aGTM Timer Events Template - User Documentation

## Introduction

The **aGTM Timer Events Template** offers a more flexible and robust alternative to the default Google Tag Manager (GTM) timer functionality. It allows you to create precise timer events with customizable repeat settings, add custom event parameters, and optionally include Universal Analytics (UA) event data. This template is especially useful when the default GTM timer does not meet your specific requirements.

- **Version**: 1.0
- **Last Updated**: 12.02.2024
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM-tag-Timer-Events.tpl](./aGTM-tag-Timer-Events.tpl)

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

- Allows you to define multiple timer events.
- Supports setting additional event parameters.
- Can include Universal Analytics (UA) event data (`event_category`, `event_action`, `event_label`).

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Timer Events Template** (`aGTM-tag-Timer-Events.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM Timer Events`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### Timer Events (`timers`)

The **Timer Events** parameter allows you to configure multiple timers. Each row in the table represents a separate timer event.

| Field          | Description                                                                 | Example                  |
|----------------|-----------------------------------------------------------------------------|--------------------------|
| **Seconds**    | Time in seconds to wait before firing the event. You can include milliseconds (e.g., `0.2` for 200ms). | `5`, `0.5`, `10`         |
| **Repeat**     | Number of times the event should repeat. Use `0` for unlimited repetitions. | `3`, `0`, `1`            |
| **Event Name** | Name of the event to push into the `dataLayer`. Use `[s]` to include seconds in the name. | `timer_event_[s]`        |

- **Help Text**: Enter the seconds (comma-separated) for each timer event. For example, `1, 5, 10` will create events after 1, 5, and 10 seconds respectively.

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
  - `event_label`: Set to the format `{seconds}s x {repeat}`

---

## Example Configuration

Here’s an example of how to set up a timer event:

1. **Timer Events**:
   - **Seconds**: `3`
   - **Repeat**: `2`
   - **Event Name**: `timer_event_[s]`

2. **Additional Parameters**:
   - **Name**: `category`
   - **Value**: `interaction`

3. **UA Event**: Checked (to include `event_category`, `event_action`, and `event_label`).

This setup will trigger an event named `timer_event_3` after 3 seconds, repeat it twice, and include additional data in the `dataLayer`.

---

## Debugging and Testing

### Enabling Debug Mode
To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Event Data
- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that events are firing as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- This template provides an alternative to GTM's built-in timer events, offering more control over timing and repetition.
- Ensure that your aGTM integration is properly configured for this template to function correctly.

### Known Limitations
- This template requires JavaScript access to the `aGTM` object. Make sure it is accessible in the current page context.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**