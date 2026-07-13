# aGTM var - Consent Info

- **Version**: 1.1
- **Last Updated**: 13.07.2026
- **Author**: Andi Petzoldt <andi@petzoldt.net>

## What is it for?

This GTM Variable Template returns consent and Google Consent Mode signals from aGTM's consent data. Use it to make the full consent state available as a GTM variable for use in triggers, tags, or other variables.

---

## Configuration

### Return Mode

| Option | Description |
|---|---|
| All Data (Consent + Consent Mode) | Returns the complete aGTM consent object including both consent info and Consent Mode signals |
| Consent Info | Returns only the consent information object (`aGTM.d.consent`) |
| Google Consent Mode | Returns only the Google Consent Mode signals object (`aGTM.d.cm`) |

### Return it as Base64 String

Checkbox (`base64`). When enabled, the returned object is JSON-serialized and
Base64-encoded into a single string. Useful for passing the whole consent state
through a single string field (e.g. a hidden form field or a URL parameter).

---

## Consent Mode signals: tag dependency & ordering

The **Google Consent Mode** and **All Data** modes read `aGTM.d.cm`. This path
is **not** written by the aGTM library — it is written by the separate
**"aGTM - Consent Mode" tag**. Consequences:

- If the *aGTM - Consent Mode* tag is **not deployed**, the `cm`/`all` modes
  always return the all-denied default
  (`ad_storage`/`ad_user_data`/`ad_personalization`/`analytics_storage` =
  `"denied"`).
- Even with the tag deployed, if this variable is evaluated **before** the
  Consent Mode tag has run on the page, it still sees the all-denied default
  (ordering race). Make sure the Consent Mode tag fires first (e.g. on a
  *Consent Initialization* trigger) if you rely on the live signals here.

The **Consent Info** mode (`aGTM.d.consent`) is unaffected — it is populated by
the CMP check function directly.

---

## Requirements

- aGTM must be loaded and initialized before this variable is evaluated.
- The consent data (`aGTM.d.consent`) must be populated by the configured CMP check function.

---

## License

This template is released under the Apache License 2.0. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).
