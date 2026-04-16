# aGTM var - Consent Check

## What is it for?

This GTM Variable Template checks whether a specific value (e.g. a purpose, service, or vendor name) is present in aGTM's consent data. It allows you to use consent signals directly as GTM variables in triggers or tags.

---

## Configuration

### Field to check

The consent data field to search in:

| Option | Description |
|---|---|
| Purposes | Check in the consented purposes list |
| Services | Check in the consented services list |
| Vendors | Check in the consented vendors list |
| Purpose IDs | Check in the consented purpose IDs list |
| Service IDs | Check in the consented service IDs list |
| Vendor IDs | Check in the consented vendor ID list |

### String value to check

The value to look for in the selected field. Uses comma-separated format as stored by aGTM, e.g. `,Google Analytics,`

### Return Value

How the result should be returned:

| Option | Description |
|---|---|
| as Boolean (true/false) | Returns `true` if the value is found, `false` otherwise |
| as Integer (0/1) | Returns `1` if found, `0` otherwise |
| as Consent Mode (denied/granted) | Returns `"granted"` if found, `"denied"` otherwise |

---

## Requirements

- aGTM must be loaded and initialized before this variable is evaluated.
- The consent data (`aGTM.d.consent`) must be populated by the configured CMP check function.
