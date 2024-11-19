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
