# aGTM Consent Mode Template - User Documentation

## Introduction

The **aGTM Consent Mode Template** is designed to set Google Consent Mode signals according to the consent information provided by aGTM. This template is especially useful for ensuring that consent signals are accurately reflected in GTM from the first event (`Consent Initialization`).

- **Version**: 1.5
- **Last Updated**: 19.08.2026
- **Author**: Andi Petzoldt <andi@petzoldt.net>

For an overview of other available GTM templates, see the [GTM Templates Overview](../../README-gtm-templates.md).

**Template File**: [aGTM tag - Consent Mode.tpl](./aGTM%20tag%20-%20Consent%20Mode.tpl)

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
- Optionally sets the **Microsoft** consent signals (UET and Clarity) from the same values.
- Supports custom conditions for consent attributes.
- Includes options for URL passthrough and ads data redaction.

---

## Configuration Instructions

### 1. Adding the Template to GTM

1. Open your **Google Tag Manager** container.
2. Navigate to **Templates** > **Tag Templates** > **New**.
3. Import the **aGTM Consent Mode Template** (`aGTM tag - Consent Mode.tpl`).
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
| **Consent Value**  | Value to check for consent. aGTM stores consent as comma-wrapped token strings (e.g. `,Google Ads,Google Tag Manager,`), and the match is a substring check — so **wrap the value in commas** (`,Google Ads,`) for an exact token match. Without the commas, `Google Ads` would also match a service named `Google Ads Remarketing` (false grant). | `,Google Ads,`     |

### Additional Options

- **Use as Consent Update (`cm_update`)**: Use this tag as a consent update rather than setting defaults.
- **Update after Default (`cm_update_after_default`)**: Set an all-denied default first, then immediately apply the real consent as an update (one tag, one page load).
- **Wait for Consent Update (`cm_wait`)**: Delay setting the consent state (in milliseconds).
- **CM Regions (`cm_regions`)**: Comma-separated ISO 3166-2 region codes (e.g. `DE,AT,US-CA`) that scope the **default** consent state. Leave at `all` (or empty) for a global default.
- **Grant consent by default outside the configured regions (`cm_grant_outside`)**: When specific regions are set, also emit a **global granted default** (Google's two-default pattern) so visitors **outside** those regions are granted by default instead of being left unset. Ideal when the consent banner is suppressed outside those regions and everything should be allowed there.
- **URL Passthrough (`url_passthrough`)**: Pass through URL parameters for better ad tracking.
- **Ads Data Redaction (`ads_data_redaction`)**: Redact ads data when `ad_storage` is denied.
- **Fire Microsoft Consent Mode (`ms_consent_mode`)**: Also send the consent state to
  Microsoft UET and Microsoft Clarity. Off by default — see the section below.

> **How `cm_regions` interacts with "Update after Default":** Consent Mode's
> `region` parameter is only valid on the **default** state, not on updates
> (`updateConsentState` is location-independent). So in *Update after Default*
> mode the all-denied **default** is scoped to `cm_regions`, and the following
> **update** (region-less) applies the real consent to the current visitor
> everywhere. **Outside** the configured regions there is then *no aGTM default*
> — Google Consent Mode treats that as unset, and the region-less update provides
> the actual state. To set an explicit *granted* baseline outside the regions,
> enable **Grant consent by default outside the configured regions**
> (`cm_grant_outside`) — the tag then emits a global granted default (for the
> signals it manages) in addition to the region-scoped one (Google's recommended
> two-default pattern), all from this single tag.
>
> **Important interaction with the two modes:**
> - In **plain default mode** (no update), `cm_grant_outside` is fully effective:
>   the granted baseline is the final state for visitors outside the regions.
> - In **Update after Default** mode, the region-less `updateConsentState` runs
>   right after and applies **each visitor's actual consent globally** — so the
>   *final* state outside the regions is that visitor's real consent, not the
>   granted baseline. For a region where you suppress the banner and the CMP
>   auto-consents, that real consent is granted, so it works; the granted baseline
>   mainly covers the brief pre-update window. It does **not** override a visitor
>   whose CMP actually reports denied. In other words, in this mode make sure your
>   CMP auto-grants outside the regions — `cm_grant_outside` alone cannot force it.

### Microsoft Consent Mode (`ms_consent_mode`)

Off by default. When enabled, the tag additionally sends the consent state to
Microsoft — through Microsoft's own APIs, not Google's:

| Channel | Call | Signals |
|---|---|---|
| Microsoft UET | `window.uetq.push('consent', 'default'\|'update', {…})` | `ad_storage`, `ad_user_data`, `ad_personalization` (+ `wait_for_update`) |
| Microsoft Clarity | `clarity('consentv2', {…})` | `ad_Storage`, `analytics_Storage` |

#### Do you actually need this checkbox?

Often not, and it is worth deciding deliberately, because **any** consent push
changes how UET behaves. Read from the live `bat.bing.com/bat.js` (2026-08-19):

- **UET enforces consent by itself in the EEA, the UK and Switzerland.** In
  those regions its default is **denied**; elsewhere it is granted.
- **UET can read Google Consent Mode on its own.** About 1.5 s after load,
  `preEnforce()` looks at `window.google_tag_data.ics` — the very state the
  Google half of *this* tag has just set — and also subscribes to TCF.
- **The first consent push switches both of those off.** `uetConfig.consent.enabled`
  is set to `true` before the payload is even inspected, and from then on UET's
  `shouldEnforce()` returns `false`.

So on a site that already uses the Google half of this tag, leaving the box
**off** is a defensible setup: UET picks the state up by itself and keeps its own
regional enforcement. Switch it on when you want the consent state to reach UET
immediately and explicitly rather than after that delay — and then configure it
properly, because you have taken over responsibility for a signal UET would
otherwise have handled.

#### What is sent, and when nothing is sent

- **`ad_storage` decides whether anything is sent at all.** It is the only signal
  UET evaluates — `ad_user_data` and `ad_personalization` do not appear in
  `bat.js` at all. If `ad_storage` is left at `not_set` (or a variable in that
  field resolves to something other than `granted`/`denied`), the tag sends
  **nothing** to UET. That is deliberate and it is the *safer* branch: UET then
  keeps its own default — denied and enforced in the EEA/UK/CH — instead of
  being switched to "consent handled externally" while `ad_storage` silently
  stays granted. A partial payload would be the worst of both.
- `ad_user_data` and `ad_personalization` are sent when configured. Microsoft
  accepts them but does not currently evaluate them.
- **UET has no `analytics_storage`** — it is a pure advertising tag. That signal
  goes to Clarity only.
- **`cm_regions` does not apply.** UET has no region parameter (zero occurrences
  in `bat.js`), so the Microsoft signals are always global. Only the Google
  default is region-scoped.
- **`cm_wait` does apply** and is passed on as UET's `wait_for_update` (UET caps
  it at 10 000 ms). Without it UET would fire hits carrying the default state
  during exactly the window you asked it to wait.
- **"Update after Default" is honoured.** UET receives an all-denied `default`
  covering all three signals, then the real state as an `update`. Clarity's
  `consentv2` has no default/update modes and is sent once.
- **Clarity is all-or-nothing.** Microsoft documents *both* `consentv2` fields as
  required, so the call is made only when `ad_storage` **and**
  `analytics_storage` are configured. Otherwise Clarity keeps its own
  project-level consent setting.

#### Verifying it

UET appends **`asc`** to its hits against `bat.bing.com`: the value on the wire
is **`G`** or **`D`** (the UET Tag Helper extension displays that as
*granted* / *denied*). Note that `asc` is only present once a consent push has
happened — if the tag deliberately sent nothing, the parameter is **absent**,
which looks the same as "not implemented". The aGTM Inspector's Netzwerk tab
shows these requests.

> **Note on the Conversions API (CAPI):** this tag covers the *browser* side
> only. Microsoft's server-side CAPI carries its consent in a different field
> (`adStorageConsent`, `"G"` / `"D"`), and its documented default there is
> **granted** — so a server-side CAPI tag that omits the field reports consent
> nobody gave. If you run CAPI alongside UET, also mind the shared `eventId` for
> deduplication, and that CAPI's ID Sync (`c.bing.com`) is a **client-side**
> pixel and therefore consent-relevant.

### Consent Default Settings (`cm_defaults`)

Configure default consent states for the following attributes:

| Attribute                | Default Value | Options               |
|--------------------------|---------------|-----------------------|
| **ad_storage**           | `not_set`     | `granted`, `denied`, `not_set` |
| **ad_user_data**         | `not_set`     | `granted`, `denied`, `not_set` |
| **ad_personalization**   | `not_set`     | `granted`, `denied`, `not_set` |
| **analytics_storage**    | `not_set`     | `granted`, `denied`, `not_set` |
| **personalization_storage** | `not_set` | `granted`, `denied`, `not_set` |
| **functionality_storage** | `not_set`   | `granted`, `denied`, `not_set` |
| **security_storage**     | `not_set`     | `granted`, `denied`, `not_set` |

---

## Example Configuration

Here’s an example of how to set up the Consent Mode:

1. **Consent Attributes**:
   - **Consent Mode Attribute**: `ad_storage`
   - **Consent Type**: `Service`
   - **Consent Value**: `,Google Ads,` (comma-wrapped for an exact token match — see note above)

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

This template is released under the Apache License 2.0. For more details, visit the [GitHub Repository](https://github.com/Andiministrator/aGTM/).

---

**End of Documentation**
