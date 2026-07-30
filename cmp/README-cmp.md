# aGTM - Supported Consent Tools (CMP)

## Table of Contents

- [What is it for?](#what-is-this-document-it-for)
- [General Usage](#general-usage)
- [No Consent Check](#no-consent-check)
- [Supported CMPs](#supported-cmps)
- [Debugging](#debugging)

---

## What is this document for?

This Documentation describes the options for the aGTM Configuration Parameter "cmp".
You'll find here a description for every supported Consent Tool.

---

## General Usage

This document describes the aGTM Configuration Parameter `cmp`. Read the aGTM README for other/general questions about aGTM.

Just to remember here an example of the aGTM configuration:

```javascript
aGTM.f.config({
   cmp: "cookiebot"
  ,gtm: { 'GTM-XYZ123': {} }
  ,gtmPurposes: "statistics"
});
```

The following chapters describe only the `cmp` Parameter.

---

## No Consent Check

If you don't need a Consent Check, you can use the following value for the `cmp` Parameter:

- `"none"`

---

## Supported CMPs

Select the value of `cmp` from the following options of your CMP.
If you can't find your Consent Tool listet here, feel free to contact us.

### Acris Cookie (Shopware)

Use the following value for the `cmp` Parameter:

- shopware_acris_cookie

### JTL Consent

Consent check for the JTL shop platform using the JTL Consent Manager.

Use the following value for the `cmp` Parameter:

- jtl_consent

### JTL EU Cookie

Consent check for the JTL shop platform using the JTL EU Cookie plugin.

Use the following value for the `cmp` Parameter:

- jtl_eu_cookie

### Perspective Funnel

Consent check for Perspective Funnel.

Use the following value for the `cmp` Parameter:

- perspectivefunnel

### PP Consent Manager (PixelPoint)

Consent check for the PixelPoint Consent Manager (`window.PPConsentManager`). Written
against its `filesVersion` 1.5.4 (read 2026-07-30).

Use the following value for the `cmp` Parameter:

- ppcm

This CMP stores one cookie per granted item — `ppcm-consent-category-<name>` for a
category (e.g. `statistics`, `media`, and the always-on essentials category) and
`ppcm-consent-service-<name>` for a service/content blocker (e.g. `youtube`).
Granted categories end up in `aGTM.d.consent.purposes`, granted services in
`aGTM.d.consent.services`, so configure `gtmPurposes: "statistics"` (or whichever
category your site uses for tracking) rather than `gtmServices`.

**A cookie's presence alone is not consent.** Its value is
`<consentVersion>,<timestamp>`, and the CMP's reader honours a cookie only while its
version field matches the site's current `consentVersion` (it also treats a second
field of `0` as not granted). Bumping `consentVersion` therefore voids every stored
decision and re-opens the banner. The verdict per item is delegated to the CMP's own
`hasConsentCategory()` / `hasConsentService()`, so that rule lives in exactly one
place; if the CMP object is not on the page (yet), the check returns `false` and aGTM
keeps polling — GTM is never loaded on a guess. No category name is hardcoded: the
always-on category comes from the site's banner template and occurs as both
`essential` and `essentials`.

Two things to know about your own setup:

- **How a decline is recognised.** Any interaction with the banner — accept *or*
  decline — stores at least the always-on essentials category (confirmed by the
  operator of a production deployment, 2026-07-30), so a decision that grants
  nothing still leaves evidence. The check therefore counts *any* category/service
  cookie whose version field matches the current `consentVersion` as an answer,
  rather than looking for a category by name: the essentials cookie qualifies
  either way, its name differs between banner templates (`essential` /
  `essentials`), and a name-only check would read a leftover cookie as an answer
  after a `consentVersion` bump — exactly when the CMP re-opens the banner. If a
  banner template ever stored nothing at all on decline, that visitor would leave
  no evidence and the check would keep returning `false`: GTM stays out (the safe
  direction), but no `declined` state is reported either.
- **Consent *changes* need a trigger.** aGTM detects the first decision through its
  own init poll. Anything after that — the visitor widening their selection, or
  revoking via the revocation link — is only picked up if something calls
  `aGTM.f.run_cc('update')`. The built-in 2000 ms CMP poll (`consent_poll_ms`) only
  starts when `consent_store_url` is set, so a standalone integration has no
  automatic path. Either register the CMP's own change hook:

  ```javascript
  // after aGTM.f.init(); PPConsentManager._onConsentChanged is undocumented but
  // stable in 1.5.4 — it takes a callback and is what the CMP uses internally.
  if (window.PPConsentManager && typeof PPConsentManager._onConsentChanged === 'function') {
    PPConsentManager._onConsentChanged(function () { aGTM.f.run_cc('update'); });
  }
  ```

  or poll yourself: `setInterval(function () { aGTM.f.run_cc('update'); }, 2000);`
- **A revoke deletes the cookies**, which by itself looks exactly like "never
  answered". Within a page load the check remembers that a decision was seen
  (`aGTM.d.ppcm_decided`) and reports the withdrawal as "decided, nothing granted",
  so the consent update propagates and the GTM gate closes. This needs one of the
  triggers above to be in place — and it is per page load by design: on the next
  load there is no stored decision, so the check reports "no response" and GTM
  stays out.

For diagnostics the check writes one `m_ppcm_scan` log entry per page load naming the
cookie prefix it searched and how many cookies matched — that is how you tell "the
visitor has not answered" apart from "the cookie prefix no longer matches".

### Secure Privacy

Consent check for Secure Privacy.

Use the following value for the `cmp` Parameter:

- secure_privacy

### Shopify Consent

Consent check for the Shopify built-in Customer Privacy API.

Use the following value for the `cmp` Parameter:

- shopify_consent

### Shopware 5 Cookie

Consent check for the Shopware 5 built-in cookie consent.

Use the following value for the `cmp` Parameter:

- shopware5_cookie

### Shopware 6 Cookie

Consent check for the Shopware 6 built-in cookie consent.

Use the following value for the `cmp` Parameter:

- shopware6_cookie

### Simple Cookie Regex Check

A generic consent check based on reading a cookie value via a regular expression. Useful as a fallback for custom or less common cookie banners.

Use the following value for the `cmp` Parameter:

- simple_cookie_regex_check

### Borlabs Cookie (Wordpress)

Use the following value for the `cmp` Parameter for Borlabs Version 2:

- borlabs2

And for Borlabs Version 3:

- borlabs3

### CCM19

Use the following value for the `cmp` Parameter:

- ccm19

### Clickskeks

Use the following value for the `cmp` Parameter:

- clickskeks

### Consentmanager

Use the following value for the `cmp` Parameter:

- consentmanager

### Cookiebot

Use the following value for the `cmp` Parameter:

- cookiebot

### Cookie First

Use the following value for the `cmp` Parameter:

- cookiefirst

### Klaro

Use the following value for the `cmp` Parameter:

- klaro

### Magento CC Cookie

Use the following value for the `cmp` Parameter:

- magento_cc_cookie

### Matomo Consent Check

Use the following value for the `cmp` Parameter:

- matomo

### Onetrust CookiePro

Use the following value for the `cmp` Parameter:

- onetrust_cookiepro

### Orest Bida Cookie Consent

Use the following value for the `cmp` Parameter:

- orestbida_cookieconsent

### Sourcepoint

Use the following value for the `cmp` Parameter:

- sourcepoint

### Tramino

Use the following value for the `cmp` Parameter:

- tramino

### Usercentrics

Use the following value for the `cmp` Parameter for Usercentrics Version 2:

- usercentrics

And for Usercentrics Version 3:

- usercentrics3

---

## Debugging

You can check the output of the Consent Check within your Browser Console.

Open your Browser Console (Button "F12" in most cases), type `aGTM` and press "Enter".
You'll get the object aof aGTM. Open it using the small arrow (click on "►").

Now you see a lot of data from aGTM, ordered by letters - but we need only a few pieces of data:

- "c" stands for configuration - here you can find, what configuration options were used by aGTM.

- "d" stands for data - here yo find all data of aGTM (mostly within sub-objects).
  Following the information of "d" what we need:
  
  - "cm" stands for Consent Mode (data).
  
  - "consent" stands for Consent Information - here you'll find whether the consent was accepted or not (yet) and for what purposes/services the Consent was given.
    Following some explanations:
    
    - "hasResponse" - if this parameter is false, we have no consent information yet. If it is true, the consent information is available (either the user gave it or the CMP restored it from a cookie).
    
    - "feedback" - this is a readable short information about the users choise.
    
    - "blocked" - the Consent Tool was blocked by a Tracking Blocker.

---
