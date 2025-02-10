# aGTM Consent Mode Template - User Documentation

## Introduction

The **aGTM Consent Mode Template** is designed to set Google Consent Mode signals according to the consent information provided by aGTM. This template is especially useful for ensuring that consent signals are accurately reflected in GTM from the first event (`Consent Initialization`).

- **Version**: 1.1
- **Last Updated**: 10.02.2025
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM-tag-Consent-Mode.tpl](./tags/aGTM-tag-Consent-Mode.tpl)

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

- Sets Google Consent Mode signals based on aGTM consent values.
- Supports custom conditions for consent attributes.
- Includes options for URL passthrough and ads data redaction.

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Consent Mode Template** (`aGTM-tag-Consent-Mode.tpl`).
4. Save and publish the template.

### 2. Tag Configuration

After importing the template, follow these steps to configure it:

- **Tag Type**: Select `aGTM Consent Mode`.
- **Trigger**: Set the trigger for when you want this tag to fire (e.g., `All Pages`).

---

## Template Parameters

### Consent Mode Conditions (`cm_attributes`)

Configure the consent attributes and their conditions. Each row in the table represents a consent attribute.

| Field              | Description                                    | Example            |
|--------------------|------------------------------------------------|--------------------|
| **Consent Mode Attribute** | Select which attribute to set.               | `ad_storage`       |
| **Consent Type**   | Define the type of consent (Purpose, Service, Vendor, etc.). | `Service`          |
| **Consent Value**  | Value to check for consent.                    | `Google Ads`       |

### Additional Options

- **Use as Consent Update (`cm_update`)**: Use this tag as a consent update rather than setting defaults.
- **Wait for Consent Update (`cm_wait`)**: Delay setting the consent state (in milliseconds).
- **URL Passthrough (`url_passthrough`)**: Pass through URL parameters for better ad tracking.
- **Ads Data Redaction (`ads_data_redaction`)**: Redact ads data when `ad_storage` is denied.

### Consent Default Settings (`cm_defaults`)

Configure default consent states for the following attributes:

| Attribute                | Default Value | Options               |
|--------------------------|---------------|-----------------------|
| **ad_storage**           | `not_set`     | `granted`, `denied`, `not_set` |
| **analytics_storage**    | `not_set`     | `granted`, `denied`, `not_set` |
| **personalization_storage** | `not_set` | `granted`, `denied`, `not_set` |
| **functionality_storage** | `not_set`   | `granted`, `denied`, `not_set` |

---

## Example Configuration

Here’s an example of how to set up the Consent Mode:

1. **Consent Attributes**:
   - **Consent Mode Attribute**: `ad_storage`
   - **Consent Type**: `Service`
   - **Consent Value**: `Google Ads`

2. **Additional Options**:
   - **Wait for Consent Update**: `500ms`
   - **URL Passthrough**: Checked
   - **Ads Data Redaction**: Checked

This setup will set the `ad_storage` attribute to `granted` if the user has agreed to the `Google Ads` service.

---

## Debugging and Testing

### Enabling Debug Mode
To view debug messages in the browser console, ensure that your aGTM integration is set to `debug: true`.

### Checking Consent Data
- Use the **Google Tag Assistant** or **GTM Preview Mode** to verify that consent signals are being set as expected.
- Check the `dataLayer` to confirm that all configured parameters are included.

---

## Notes

- This template provides an alternative to manually setting Google Consent Mode signals, leveraging the flexibility of aGTM.
- Ensure that your aGTM integration is properly configured for this template to function correctly.

### Known Limitations
- This template requires JavaScript access to the `aGTM` object. Make sure it is accessible in the current page context.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**
