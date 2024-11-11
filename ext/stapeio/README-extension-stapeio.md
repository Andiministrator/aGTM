# aGTM - Integration with STAPE.io

<img title="" src="file:///data/_Projects/aGTM/ext/stapeio/assets/agtm-stapeio-250px.png" alt="aGTM - STAPE.io Integration" data-align="inline">

## Table of Contents

- [What is it for? - General Information](#what-is-it-for----general-information)
- [Usage](#usage)
- [Configuration options](#configuration-options)
- [Frequently Asked Questions (FAQ)](#frequently-asked-questions--faq-)
- [Author and Contact](#author-and-contact)
- [Changelog](#changelog)

---

## What is it for? - General Information

aGTM can help you to make your live easier, if you use the Google Tag Manager depending on user consent.
The “aGTM” provides functions for an easier and more data privacy friendly integration/handling of Google Tag Manager. GTM will not be fired before or without consent. In addition there is some basic functionality provided for the use in GTM Custom Templates. And there are some cool GTM Custom Templates ...
See the the [Documentation of aGTM](../../README.md) for more details.
This document describes how you can use the aGTM with an existing Stape.io (GTM) Container.

---

## Usage

Some help for the usage of STAPE.io-aGTM:

### In General

For using Stape.io with aGTM we need to combine both integration codes.
Therefore we provide an JavaScript Code to get necessary information from the Stape.io configuration.
This information is used for the configuration object of aGTM.

That means, we need an JavaScript Code that fullfills the following steps:

1. Prepare the Script-Placeholder and insert the aGTM library object.

2. Insert the Consent Function.

3. Get configuration options from Stape.io.

4. Build (and overhand) the configuration object for aGTM - using the Stape.io configuration object we got in step 2.

5. Initialise the aGTM to inject the GTM container.

### 1. Add a Script Tag with the aGTM library object to your website

First, we need to add a `<script>` Tag to your website. It doen't matter where you add it into your website source code, but we recommend to add it to the HTML Head.
This Script-Tag is needed to contain/run the Stape.io/aGTM code.

Now get the aGTM library - you can use the normal code from aGTM.js (from the aGTM root directory) or (recommended) the minimized code from aGTM.min.js.
Open the file and copy the code to your script tag.

**Important!**
It is necessary to remove the init() command at the end of the code!
Therefore go to the end of the code.
In the normal code you'll find a line with the content: `aGTM.f.init();` Delete it.
If you use the minimized version of aGTM (aGTM.min.js), you'll find only one line.
Go to the end of this line and remove this: `,aGTM.f.init()` But leave the semicolon at the end!

The Script Tag after that step could look like this (shortened, un-complete!):

```html
<script>

/* 1. aGTM Library object - minimized version - and without the init() command */
function aGTMinit(e,t,n){/*shortened*/else aGTM.f.log("e9",{o:typeof e})};

/* 2. Consent Function */

/* 3. Stape.io Configuration */

/* 4. aGTM Configuration */

/* 5. aGTM Initialisation */

</script>
```

### 2. Insert the Consent Function

Now we need to insert the Consent Function to the Script Tag.
Read therefor the [Documentation of aGTM](../../README.md), especially the parts for Consent/CMP.

Choise the right Consent Function and open the file (we recommend to use the minimized version).
Copy the code and paste it to your Script Tag.

The code could now look like this (we used Cookiebot as Consent Function - shortened):

```html
<script>

/* 1. aGTM Library object - minimized version - and without the init() command */
function aGTMinit(e,t,n){/*shortened*/else aGTM.f.log("e9",{o:typeof e})};

/* 2. Consent Function - Cookiebot - minimized version */
window.aGTM=window.aGTM||{},aGTM.d=aGTM.d||{config:!1,init:!1,fired:!1},aGTM.f=aGTM.f||{},aGTM.l=aGTM.l||[],aGTM.f.consent_check=function(n){/*shortened*/!0};

/* 3. Stape.io Configuration */

/* 4. aGTM Configuration */

/* 5. aGTM Initialisation */

</script>
```

### 3. Get STAPE.io Configuration

Within the aGTM root directory you'll find a sub-directory `ext` and there a sub-directory `stapeio` (where this README comes from).
This directory contains the file `stapeio-get-config.js` and the minimized version of it `stapeio-get-config.min.js`.

Please open one of this files (we recommend the minimized version) and copy the code to your Script Tag.

Now you have to justify the Stape.io settings - read therefore the chapter "STAPE.io Configuration Options" (further down in this document).

Here you can find, how the code could look like after this step (the values are just examples):

```html
<script>

/* 1. aGTM Library object - minimized version - and without the init() command */
function aGTMinit(e,t,n){/*shortened*/else aGTM.f.log("e9",{o:typeof e})};

/* 2. Consent Function - Cookiebot - minimized version */
window.aGTM=window.aGTM||{},aGTM.d=aGTM.d||{config:!1,init:!1,fired:!1},aGTM.f=aGTM.f||{},aGTM.l=aGTM.l||[],aGTM.f.consent_check=function(n){/*shortened*/!0};

/* 3. Stape.io Configuration */
var agtm_stapeio_cfg = function(e){"use strict";var r=e.dl||"dataLayer",t=e.cid,a=e.ep||"",n=e.cdn||"",i=e.sid||"",s=e.usc||"stapeUserId",o=e.dlv||"",l=e.kid||"",c={};function d(e){if(!document.cookie)return null;for(var r=e,t=0,a=document.cookie.split(";");t<a.length;t++){var n=a[t].split("=");if(n[0].trim()===r)return n[1]}}function u(e){return localStorage.getItem(e)}function f(e){return window[e]}function p(e,r){return e=document.querySelector(e),r?null==e?void 0:e.getAttribute(r):null==e?void 0:e.textContent}try{c.saf=!1;var v=navigator.userAgent;if("string"==typeof v&&v){var m=new RegExp("Version/([0-9._]+)(.*Mobile)?.*Safari.*").exec(v);m&&m[1]&&parseFloat(m[1])>=16.4&&s&&(c.saf=!0)}c.st_uid="stapeUserId"===s;var _=c.saf&&!c.st_uid?function(e,r,t){var a={cookie:d,localStorage:u,jsVariable:f,cssSelector:p};if(r=r||"",r=Array.isArray(r)?r:[r],e&&a[e])for(var n=a[e],i=0;i<r.length;i++){var s=r[i],o=t?n(s,t):n(s);if(o)return o}else console.warn("Invalid UserID source for CookieKeeper",e)}(s,o,l):null;c.saf=c.saf&&(!!_||c.st_uid)}catch(e){console.error(e)}return c.gtm_id=t,c.ck_src=s,c.ck_uid=l,c.ck_param=_?"&bi="+encodeURIComponent(_):"",c.dl_name=r,c.dl_param="dataLayer"===r?"":"&l="+r,c.jsfile=c.saf?"kp"+i:i,c.urlpre=!c.saf&&n?n:a,c.url=c.urlpre+"/"+c.jsfile+".js?st="+t+c.dl_param+c.ck_param,c}
({
   cid: 'ABZXYZ' /* GTM Container-ID (without GTM-) */
  ,ep:  'https://ep.agtm.net' /* Endpoint */
  ,sid: 'abcXYZ' /* Identifier for the custom loader (optional) */
  ,usc: 'stapeUserId' /* User ID Source for Cookie Keeper */
});

/* 4. aGTM Configuration */

/* 5. aGTM Initialisation */

</script>
```

Now you'll find some configuration options from Stape.io with the variable `agtm_stapeio_cfg` - we need this for the next step.

### 4. Set the aGTM Configuration

After getting the configuration options from Stape.io we use them for our aGTM configuration.
The Stape.io Settings are now stored in the variable `agtm_stapeio_cfg` as an object.
Some of the Stape.io settings have to be assigned to the aGTM setting object `gtm`. Therefore we create a temporarry object:

```javascript
var aGTM_gtm = {};
aGTM_gtm[agtm_stapeio_cfg.cid] = {
   gtmURL:  agtm_stapeio_cfg.url
  ,idParam: agtm_stapeio_cfg.id_param
  ,env:     agtm_stapeio_cfg.ck_param
};
```

And then use this object for setting the aGTM configuration and set the rest of the configuration to your needs:

```javascript
aGTM.f.config({
   gtm: aGTM_gtm /* your STAPE.io GTM Container - with ID, ...*/
  ,gdl: agtm_stapeio_cfg.dl_name /* The GTM dataLayer, which you configured in Stape.io */
  ,gtmPurposes: 'Functional' /* The purpose(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Marketing' */
});
```

After that, your Script Tag could look like this (if your GTM should be fired after Consent for the Purpose "Functional"):

```javascript
<script>

/* 1. aGTM Library object - minimized version - and without the init() command */
function aGTMinit(e,t,n){/*shortened*/else aGTM.f.log("e9",{o:typeof e})};

/* 2. Consent Function - Cookiebot - minimized version */
window.aGTM=window.aGTM||{},aGTM.d=aGTM.d||{config:!1,init:!1,fired:!1},aGTM.f=aGTM.f||{},aGTM.l=aGTM.l||[],aGTM.f.consent_check=function(n){/*shortened*/!0};

/* 3. Stape.io Configuration */
var agtm_stapeio_cfg = function(e){"use strict";/*shortened*/c.url=c.urlpre+"/"+c.jsfile+".js?st="+t+c.dl_param+c.ck_param,c}
({
   cid: 'ABZXYZ' /* GTM Container-ID (without GTM-) */
  ,ep:  'https://ep.agtm.net' /* Endpoint */
  ,sid: 'abcXYZ' /* Identifier for the custom loader (optional) */
  ,usc: 'stapeUserId' /* User ID Source for Cookie Keeper */
});

/* 4. aGTM Configuration */
var aGTM_gtm = {};
aGTM_gtm[agtm_stapeio_cfg.cid] = {
   gtmURL:  agtm_stapeio_cfg.url
  ,idParam: agtm_stapeio_cfg.id_param
  ,env:     agtm_stapeio_cfg.ck_param
};
aGTM.f.config({
   gtm: aGTM_gtm /* your STAPE.io GTM Container - with ID, ...*/
  ,gdl: agtm_stapeio_cfg.dl_name /* The GTM dataLayer, which you configured in Stape.io */
  ,gtmPurposes: 'Functional' /* The purpose(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Marketing' */
});

/* 5. aGTM Initialisation */

</script>
```

### ### 5. Initialization of aGTM

The last step is the easiest...
Just add the `aGTM.f.init();` command to your Script Tag.

The complete Script Tag could then look like this:

```javascript
<script>

/* 1. aGTM Library object - minimized version - and without the init() command */
function aGTMinit(e,t,n){/*shortened*/else aGTM.f.log("e9",{o:typeof e})};

/* 2. Consent Function - Cookiebot - minimized version */
window.aGTM=window.aGTM||{},aGTM.d=aGTM.d||{config:!1,init:!1,fired:!1},aGTM.f=aGTM.f||{},aGTM.l=aGTM.l||[],aGTM.f.consent_check=function(n){/*shortened*/!0};

/* 3. Stape.io Configuration */
var agtm_stapeio_cfg = function(e){"use strict";/*shortened*/c.url=c.urlpre+"/"+c.jsfile+".js?st="+t+c.dl_param+c.ck_param,c}
({
   cid: 'ABZXYZ' /* GTM Container-ID (without GTM-) */
  ,ep:  'https://ep.agtm.net' /* Endpoint */
  ,sid: 'abcXYZ' /* Identifier for the custom loader (optional) */
  ,usc: 'stapeUserId' /* User ID Source for Cookie Keeper */
});

/* 4. aGTM Configuration */
var aGTM_gtm = {};
aGTM_gtm[agtm_stapeio_cfg.cid] = {
   gtmURL:  agtm_stapeio_cfg.url
  ,idParam: agtm_stapeio_cfg.id_param
  ,env:     agtm_stapeio_cfg.ck_param
};
aGTM.f.config({
   gtm: aGTM_gtm /* your STAPE.io GTM Container - with ID, ...*/
  ,gdl: agtm_stapeio_cfg.dl_name /* The GTM dataLayer, which you configured in Stape.io */
  ,gtmPurposes: 'Functional' /* The purpose(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Marketing' */
});

/* 5. aGTM Initialisation */
aGTM.f.init();

</script>
```

Find the complete code of this example in the file `agtm-stapeio-example.html`.

---

## Configuration options

Here you'll find some useful information about the configuration options of STAPE.io what we can use for the integration with aGTM.

### Where to find the Configuration of the STAPE.io GTM Container?

Login to STAPE.io and find the Dashboard:

![STAPE.io Dashboard](/data/_Projects/aGTM/ext/stapeio/assets/stapeio-dashboard.png)

Click on the regarding sGTM Container and you come to the Detail page:

![Stape.io Configure](/data/_Projects/aGTM/ext/stapeio/assets/stapeio-configure.png)

Click on the tab "Power-Ups" and from there to "Configure" the Custom Loader.

Now you get the dialog with the GTM Settings:

![STAPE.io GTM Settings](/data/_Projects/aGTM/ext/stapeio/assets/stapeio-settings.png)

Below we explain some of the Settings, that are important for aGTM.

### STAPE.io Configuration Options for aGTM

#### Domain (1)

This is a part of the Endpoint `ep` for our STAPE.io Configuration. Use it the in the form of "https://" + YOURDOMAIN (this setting).

#### GTM Container ID (2)

That's the `cid` for our STAPE.io Configuration. Put it the (in the code) without "GTM-".

#### DataLayer Name (4)

The name of the GTM dataLayer, which you can configure in (4). Copy the name (you've entered here) into the field `dl` of our STAPE.io Configuration. Leave it blank to use the Default Value (dataLayer).

#### User ID Type (7)

Selection of the STAPE.io User ID Type. In most cases you select "Stape User ID" - in this case you need to use `stapeUserId`for our STAPE.io Configuration of the field `usc`.

#### sid

???

---

## Frequently Asked Questions (FAQ)

Q: *Where can I find more information about STAPE.io?*
A: Go to the [Website of STAPE.io](https://stape.io).

---

## Author and Contact

Feel free to contact me if you found problems or improvements:

**Andi Petzoldt**
🕮 https://andiministrator.de
🖂 andi@petzoldt.net
🧳 https://www.linkedin.com/in/andiministrator/
🐘 https://mastodon.social/@andiministrator
👥 https://friendica.opensocial.space/profile/andiministrator
📷 https://pixelfed.de/Andiministrator
🎧 https://open.audio/@Andiministrator/
🎥 https://diode.zone/a/andiministrator/video-channels

---

## Changelog

- Version 1.0, *08.11.2024*
  - Initial Version of aGTM StapeIO Integration
