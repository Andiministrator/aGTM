# aGTM Device and Page Info - User Documentation

## Introduction

The **aGTM Device and Page Info** template provides detailed information about the user's device and the current webpage. It captures data such as browser type, operating system, screen dimensions, bot detection, page content analysis, and more. This template is highly useful for advanced tracking and analysis within Google Tag Manager (GTM).

- **Version**: 1.0
- **Last Updated**: 29.05.2024
- **Author**: Andi Petzoldt <andi@petzoldt.net>

**Template File**: [aGTM-var-Device-and-Page-Info.tpl](./aGTM-var-Device-and-Page-Info.tpl)

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

- Provides detailed device and page information.
- Supports bot detection, human interaction tests, and ad-blocker detection.
- Counts the number of words and images on the page.
- Sends data via custom events to the `dataLayer`.
- Optionally uses cookies to avoid redundant tests.

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Variable Templates** > **New**.
3. Import the **aGTM Device and Page Info Template** (`aGTM-var-Device-and-Page-Info.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM Device and Page Info`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### General Settings

| Field                | Description                                          | Default Value        |
|----------------------|------------------------------------------------------|----------------------|
| **Event Name**       | Name of the event to push into the `dataLayer`.      | `page_info`          |
| **Count Words**      | Count the number of words on the page.               | `false`              |
| **Count Images**     | Count the number of images on the page.              | `false`              |
| **Bot Detection**    | Detect if the user is a bot based on various checks. | `false`              |
| **Human Test**       | Detect if the user is a human by monitoring interactions. | `false`          |
| **AdBlocker Test**   | Detect if the user has an ad-blocker enabled.        | `false`              |
| **Use Cookie**       | Use a cookie to avoid repeated tests.                | `false`              |
| **Cookie Name**      | Name of the cookie to store test results.            | `_tr_Test_Result`    |

### Additional Event Parameters (`addparameter`)

You can add custom parameters to the event using this table.

| Field      | Description                        | Example     |
|------------|------------------------------------|-------------|
| **Name**   | Name of the custom parameter.      | `category`  |
| **Value**  | Value of the custom parameter.     | `device`    |

---

## Example Configuration

Here’s an example of how to set up a configuration:

1. **General Settings**:
   - **Event Name**: `device_info`
   - **Count Words**: Checked
   - **Count Images**: Checked
   - **Bot Detection**: Checked

2. **Additional Parameters**:
   - **Name**: `page_type`
   - **Value**: `landing_page`

---

## Debugging and Testing

### Enabling Debug Mode

To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Event Data

- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that events are firing as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- This template provides extensive device and page data for advanced tracking needs.
- Ensure that your aGTM integration is properly configured for this template to function correctly.

### Known Limitations

- The template relies on browser features which may be restricted in certain privacy-focused browsers.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**