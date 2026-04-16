# aGTM var - Consent Info

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

---

## Requirements

- aGTM must be loaded and initialized before this variable is evaluated.
- The consent data (`aGTM.d.consent`) must be populated by the configured CMP check function.
