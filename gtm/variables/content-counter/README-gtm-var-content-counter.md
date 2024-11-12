# aGTM Variable - Content Counter

## Overview

The **aGTM var - Content Counter** template counts either the number of words or images on a webpage. It is designed to be used within Google Tag Manager (GTM) as a variable.

- **Version**: 1.0
- **Last Updated**: 7.6.2024
- **Author**: Andi Petzoldt <andi@petzoldt.net>

**Template File**: [aGTM-var-Content-Counter.tpl](./aGTM-var-Content-Counter.tpl)

---

## Features

- Counts words or images on the current page.
- Can be configured via a simple dropdown menu in GTM.

---

## Configuration Instructions

### 1. Adding the Variable to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Variables** > **User-Defined Variables** > **New**.
3. Import the **aGTM var - Content Counter** template (`aGTM-var-Content-Counter.tpl`).
4. Save and publish the template.

### 2. Variable Configuration

- **Variable Type**: Select `aGTM var - Content Counter`.
- **What to count?**: Choose between:
  - **Words**: Counts the total number of words on the page.
  - **Images**: Counts the total number of images on the page.

---

## Example Usage

If you want to count the number of words on a specific page and push this data to the `dataLayer`, configure the variable with:

- **What to count?**: `Words`

Then, use this variable in your GTM tags or triggers as needed.

---

## Notes

- This variable uses the `aGTM.f.pageinfo` function to retrieve information about the page content.
- Ensure that the `aGTM` integration is correctly set up in your GTM container.

---

## License

This template is released under the MIT License. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**
