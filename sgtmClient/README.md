# aGTM Client into Server-Side Google Tag Manager

**An Client Template for the server-side Google Tag Manager**
This guide explains how to use the aGTM Client inside a Server-Side Google Tag Manager container.

## Table of Contents

- [What is it for? - General Information](#what-is-it-for----general-information)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Usage](#usage)
- [Configuration Options](#configuration-options)
- [Testing](#testing)
- [Contact and more Information](#contact-and-more-information)
- [Changelog](#changelog)

---

## What is it for? – General Information

The **aGTM Client** is part of the [aGTM project](https://github.com/Andiministrator/aGTM), a flexible and privacy-focused enhancement layer for Google Tag Manager.
It provides advanced functionality like consent-aware tracking, tag queuing, auto-events and cross-tag communication.

The **server-side client** allows easy integration of aGTM into server-side GTM containers (ssGTM), enabling reliable communication between client-side GTM and the server.

For full context of the aGTM ecosystem, visit the [aGTM README](https://github.com/Andiministrator/aGTM/blob/main/README.md).

## How it works

1. A lightweight script is loaded on the client via your `<head>` tag.
2. This script communicates with your server-side GTM endpoint.
3. The aGTM client in your sGTM instance parses and handles incoming requests.
4. Events are processed and forwarded to other tags (e.g., GA4, custom endpoints).

More details on the internal data structure and behavior can be found in the [aGTM Documentation](https://github.com/Andiministrator/aGTM).

## Requirements

- A working [Server-Side Google Tag Manager setup](https://developers.google.com/tag-platform/tag-manager/server-side).
- The aGTM Client template (`template.tpl`) imported into your ssGTM container.
- A domain/subdomain set up to serve the ssGTM (e.g., `https://sgtm.yourdomain.com`).
- The Implementation Code script must be embedded on your website (see next section).

---

## Usage

### 1. Embed the aGTM Script on your Website

Insert the following into your site’s `<head>`:

```html
<script>
(function(w,d,s,u){
  var t=d.getElementsByTagName(s)[0],e=d.createElement(s);
  e.async=true;e.src=u;
  t.parentNode.insertBefore(e,t);
})(window,document,'script','https://sgtm.yourdomain.com/aGTM.js?id=GTM-XYZ123');
</script>
```

Replace:
- sgtm.yourdomain.com with your sGTM endpoint.
- GTM-XYZ123 with the GTM ID you assign to the aGTM client.

### 2. Import the Client Template

- Open your sGTM container.
- Go to Templates > Clients.
- Import template.tpl.

### 3. Create and Configure a New Client

- Go to Clients > New and select the aGTM template.
- Set the GTM ID to match the one from your embed code.
- Save and publish the client.

---

## Configuration Options ⚙

The aGTM client in sGTM provides some different configuration areas to control its behavior.
This documentationis structured like the sections from the sGTM Config Dialog and the containing options.

**Minimal Configuration:**
You'll need at least one entry for the GTM Container Setup.
And if you set the Consent Check to "Yes" you'll need to select a CMP in Consent Check and at least one Consent Check Condition for the Google Tag Manager to fire.

### Use different aGTM Setups using ID's

If you use only one aGTM Client and one client-side GTM, you can leave this Section empty.
The Client will claim every request than, does'nt matter if (or which) id is set in the url.

Otherwise you could enter different GTM Container IDs that should be allowed to fire.
Is the at least one "Allowed (a)GTM ID" is configured, no other ID will be allowed.
**Attention!** If there is no ID configured, all possible IDs are allowed (the filter is deactivated in this case). That means, if you use a Query Parameter "id" as an GTM variable for the GTM Container ID, you can specify the GTM Container ID via URL, e.g. https://ssgtm.yourdomain.com/aGTM.js?id=GTM-XYZ123. But if the filter is inactive, every ID can be placed and someone could abuse the serverside GTM through that.

The ID has not to be a GTM Container ID, you could use any string here as allowed ID.
So you could configure different clients with different configuration options but with own (allowed) IDs.
Or you could use it to load a normal container for the Live/Production Website and a configuration with environment string for the Staging Website.

### GTM Container Setup

You need to configurate one or more clientside GTM Containers. There are 4 options for each container:

- **GTM Container ID**
  The ID of the clientside GTM Container, e.g.: `GTM-XYZ123`.
  You can use GTM variables here. So you could configure a variable for the URL Query Parameter `id` to send the GTM Container ID with the URL of the integration code, e.g.: `https://ssgtm.yourdomain.com/aGTM.js?id=GTM-XYZ123`
- **Consent Check**
  If you set this to `Yes`, the clientside GTM will only fire, if the user has given a consent to fire the GTM.
- **Environment String**
  You can use this to fire a special Environment of a clientside GTM Container.
- **Container URL**
  You can use this option to overwrite the Standard GTM URL (`https://www.googletagmanager.com/gtm.js`) with your own Container URL.

### Consent Check

Here you need to specify which Consent Tool you use and under what conditions the GTM should fire.

#### Used CMP

Select the Consent Tool what you use.
In case you have a special consent tool, you could create an own consent_check funktion within a GTM variable and select this here (more information will follow).

#### Consent Check Conditions

Setup the Consent Conditions. Add at least one consition, otherwise no consent check will run.
Depending, which CMP you have selected, it will provide the given Consent for Purposes, Services and/or Vendors.
Now you could say, that the GTM should only fire, if the user has given consent for the Category "Statistics".
And (in addition) the user has given consent for the special service "Google Tag Manager"
That is what you can configure here:

- **Type**
  Select what you want to check (e.g. Services).
- **Value**
  The Value (String/Text) what has the selected Type to contain (e.g. ",Google Tag Manager,").

#### Advanced CMP Settings

This options are more for experts, e.g. if a seperate Consent Event has to be send.

### Other aGTM Settings

You'll find different configuration options here:

#### Fire GTM dataLayer Event "aPageview"

After the GTM Container and the aGTM library has loaded and the user has given consent (if configured), a DataLayer Event will be send with the name "aPageview".

#### Send Virtual Pageviews

If ticked, aGTM sends virtual pageviews (as Event "vPageview") if the URL changes (HistoryChange), but the page doesn't reload.

#### Fire GTM dataLayer Events "DOMloaded" and "PAGEready"

If this is ticked. aGTM will automatically fire dataLayer Events for DOMloaded and PAGEready.

#### Name of GTM Datalayer

If you need a diffrenet name (as "dataLayer") for the GTM Datalayer, you can specify the Datalayer Name here.

#### Action for dataLayer.push Hook

The dataLayer.push function is the connection from the dataLayer Array to the Google Tag Manager. If this function is changed, the connection can be lost. With this feature you can decide, what to do in this case.

#### Nonce Value (for Consent Security Policy)

The dataLayer.push function is the connection from the dataLayer Array to the Google Tag Manager. If this function is changed, the connection can be lost. With this feature you can decide, what to do in this case.

#### aGTM Debug Mode

If this is ticked, the optout cookie will be ignored.

You can find more information about configuration options in the Installation section of the [aGTM README](https://github.com/Andiministrator/aGTM/blob/main/README.md).

---

## Testing

1. Activate Preview Mode in sGTM.
2. Trigger the request via your browser though visiting a Webpage what has the sGTM integrated.
3. Verify:
   - The client was invoked
   - The Events are fired in the dataLayer, at least the aGTM_ready event.
4. Optionally confirm the events in GA4 DebugView.

---

## Contact and more Information

Feel free to use or change the code. If you have suggestions for improvement, please write to me.

- **Licence:** Apache 2.0
- **Repository:** [GA4 Event Importer - Github Repository](https://github.com/Andiministrator/ga4-tracking-pixel)

### Author and Contact

Please contact me if you found problems or have improvements:

**Andi Petzoldt**

- ☛ https://andiministrator.de
- ✉ andi@petzoldt.net
- 🧳 https://www.linkedin.com/in/andiministrator/
- 🐘 https://mastodon.social/@andiministrator
- 👥 https://friendica.opensocial.space/profile/andiministrator
- 📷 https://pixelfed.de/Andiministrator
- 🎧 https://open.audio/@Andiministrator/

---

## Changelog

- Version 1.0, *01.06.2025*
  - Initial Version

---
