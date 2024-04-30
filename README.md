# aGTM - a Galactic Tagging Modulator #

![aGTM - a Galactic Tagging Modulator](assets/aGTM-100px.png)

## Table of Contents ##

- [What is it for? - General Information](#what-is-it-for----general-information)
- [Usage](#usage)
- [Configuration options](#configuration-options)
- [Consent Handling](#consent-handling)
- [Integration options for Google Tag Manager](#integration-options-for-google-tag-manager)
- [Function execution sequence](#function-execution-sequence)
- [Debugging](#debugging)
- [Frequently Asked Questions (FAQ)](#frequently-asked-questions--faq-)
- [Author and Contact](#author-and-contact)
- [Changelog](#changelog)


## What is it for? - General Information ##

aGTM can help you to make your live easier, if you use the Google Tag Manager depending on user consent.

### In short ###
The “aGTM” provides functions for an easier and more data privacy friendly integration/handling of Google Tag Manager. GTM will not be fired before or without consent. In addition there is some basic functionality provided for the use in GTM Custom Templates. And there are some cool GTM Custom Templates ...

### Something more detailed ###
Handling Google Tag Manager and (cookie) consent is often very tiring and frustrating.
Especially when, for example, eCommerce events come into the GTM dataLayer, but the consent information only comes later, the setup in Google Tag Manager becomes difficult.
If there is also a requirement to use Google Consent Mode with GTM, further problems arise.
This Javascript library replaces the normal code to integrate the Google Tag Manager into the website.
The advantage is that the (cookie) consent information is already available before the Google Tag Manager is loaded. Or (in other words) the Google Tag Manager is only loaded when the consent is available. And (depending on the configuration) only if the visitor has agreed to the delivery of the GTM in the consent banner - so it is also a very data protection-friendly solution.
In any case, with the GTM setup you no longer have to worry about whether and when the consent is available, but can take care of the actual setup.

### Even more information ###
Feel free to use or change the code. If you have suggestions for improvement, please write to me.
**Licence:** MIT License
**Repository:** [Github aGTM Repository](https://github.com/Andiministrator/aGTM)


## Usage ##

Some help for the usage of aGTM:

### Complete short integration code example ###
Before you include the code to your website (template), you need to upload the necessary files. In this code example it was uploaded to the public directory /templates/scripts/.
*For Consentmanager and without consent mode support*:
```html
<!-- aGTM Start -->
<script type="text/javascript">
(function(c){
var w=window,d=document;w.aGTM=w.aGTM||{};aGTM.d=aGTM.d||{};aGTM.d.f=aGTM.d.f||[];aGTM.f=aGTM.f||{};aGTM.f.fire=aGTM.f.fire||function(o){aGTM.d.f.push(o);};
aGTM.c=c;var s='script',t=d.createElement(s),m=c.min?'.min':'',p=c.path;if(p.length>0&&p.substring(p.length-1)!='/')p+='/';t.src=c.path+'aGTM'+m+'.js';t.async=true;d.head.appendChild(t);
})({
  // aGTM Config Start
   path: '/templates/scripts/'
  ,cmp: 'consentmanager'
  ,gtm: { 'GTM-XYZ123': {} } // your GTM Container - with ID, ...
  ,gtmPurposes:'Funktional'
  ,gtmServices:'Google Tag Manager'
  // aGTM Config End
});
</script>
<!-- aGTM End -->
```

### Normal Usage in explained steps ###

This is the normal usage, where you upload the aGTM folder to your webserver.
_There is also a possibility to use it just in one file (or Javascript code), see the next chapter for that._
To use it as normal, follow these steps:

1. **Upload the necessary files**
   Upload the necessary files, that means at least the library itself (aGTM.js and/or the minified version aGTM.min.js) and the directory with the consent check function files.
   Assuming you uploaded aGTM direct to a directory "js", it should at least look like this:
   ```
   js/
     |--> cmp/
     |      |--> cc_ccm19.js
     |      |--> cc_ccm19.min.js
     |      |--> cc_magento_cc_cookie.js
     |      |--> ...
     |      `--> index.html
     |--> aGTM.js
     `--> aGTM.min.js
   ```

2. **Add the aGTM integration (with the configuration) script to your website templates**
   To understand, what settings you can use and what the meaning of each setting is, read the chapter "Configuration options".
   Here we give you an integration example with the most of available configuration options. In a normal setup you need just a few of them.
   Example integration code:
   ```html
   <!-- aGTM Start -->
   <script type="text/javascript" id="aGTMcontainer" nonce="abc123">
   (function(c){
   var w=window,d=document;w.aGTM=w.aGTM||{};aGTM.d=aGTM.d||{};aGTM.d.f=aGTM.d.f||[];aGTM.f=aGTM.f||{};aGTM.f.fire=aGTM.f.fire||function(o){aGTM.d.f.push(o);};
   aGTM.c=c;var s='script',t=d.createElement(s),m=c.min?'.min':'',p=c.path;if(p.length>0&&p.substring(p.length-1)!='/')p+='/';t.src=c.path+'aGTM'+m+'.js';t.async=true;d.head.appendChild(t);
   })({
   // aGTM Config Start
      path: '/js/' // (relative) path to the directory where aGTM is located, e.g. '/js/''
     ,file: 'aGTM.js' // Filename of aGTM
     ,min:true // inject the files as minified versions
     ,cmp: 'cookiebot' // Type of Consent Tool (Cookie Banner) you use in lower case, e.g. 'cookiebot'. See chapters below for possible options.
     ,nonce: 'ABC123' // Nonce value for the file injections
     ,gtm: { 'GTM-XYZ123': { 'debug_mode':true } } // your GTM Container - with ID, ...
     ,gtmPurposes: 'Functional' // The purpose(s) that must be agreed to in order to activate the GTM (comma-separated)
     ,gtmServices: 'Google Tag Manager' // The services(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Google Tag Manager'
     ,gtmVendors: 'Google Inc' // The vendor(s) that must be agreed to in order to activate the GTM (comma-separated)
     ,gdl: 'dataLayer' // Name of GTM dataLayer
     ,env: '' // Environment string (leave it blank you you don't know, what it is)
     ,dlStateEvents: true // Fire GTM dataLayer Events for DOMloaded and PAGEready
     ,useListener: false // Use an event listener to check the consent (true). If it is false, a timer will be used (default) to check the consent
     ,consent_events: 'cmpEvent,cmpUpdate' // string with consent events (comma-separated) for updating the consent (leave it blank you you don't know, what it is)
   // aGTM Config End
   });
   </script>
   <!-- aGTM End -->
   ```

3. _optional_ **Send events**
   You can now send events using the following command:
   ```javascript
   aGTM.f.fire({ event:'button_click', button:'Sign Up Button' });
   ```

### One-File Usage in explained steps ###

With this integration variant you get out a Javascript code, which conatins all you need. You can use this code either to have just one Javascript file or to integrate it in a CMS script field, or GTM container or whatever you have.

1. **Get the code of the consent_check function**
   First of all you need to know, which Consent Tool (Cookie Banner) you use for your website. See the point "cmp" in the chapter "Configuration options" for available Consent Tools.
   You'll find a folder with the name "cmp" within the project folder. This folder contains different files, two files for one Consent Tool (each in a normal and a minimized version). Open the file for your Consent Tool in a Text- or Code-Editor (we recommend to use the minimized version).
   Copy the file's code to your clipboard.
   _Notice:_ You don't need to copy the first part of the file. You can start from the part with `aGTM.f.consent_check = function `...

2. **Insert the consent_check function code to the aGTM.js**
   Now open the aGTM.js file with your Text- or Code-Editor.
   Search in the file for a function called "aGTM.f.consent_check". This function is commented out and should look like this:
   ```javascript
   /*aGTM.f.consent_check = aGTM.f.consent_check || function (action) {
     if (!aGTM.d.config) { aGTM.f.log('e2', null); return false; }
     if (typeof action!='string' || (action!='init'&&action!='update')) { aGTM.f.log('e3', {action:action}); return false; }
     // Check whether response was already given
     aGTM.d.consent = aGTM.d.consent || {};
     if (action=='init' && aGTM.d.consent.hasResponse) return true;
     // Get Consent
     var purposes = typeof aGTM.c.purposes=='string' ? ','+aGTM.c.purposes+',' : '';
     var services = typeof aGTM.c.services=='string' ? ','+aGTM.c.services+',' : '';
     var vendors = typeof aGTM.c.vendors=='string' ? ','+aGTM.c.vendors+',' : '';
     // Set Response and Feedback and Return
     aGTM.d.consent.purposes = purposes;
     aGTM.d.consent.services = services;
     aGTM.d.consent.vendors = vendors;
     aGTM.d.consent.feedback = 'no valid check fct given, cfg used';
     aGTM.d.consent.hasResponse = true;
     aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
     return true;
   };*/
   ```
   Delete this code (including the comment characters) and replace it with the code of your clipboard.
   For the consent tool Cookiebot (as minified version) it should look like this:
   ```javascript
   aGTM.f.consent_check=function(t){if("string"!=typeof t||"init"!=t&&"update"!=t)return"function"==typeof aGTM.f.log&&aGTM.f.log("e10",{action:t}),!1;if(aGTM.d.consent=aGTM.d.consent||{},"init"==t&&aGTM.d.consent.hasResponse)return!0;if("object"!=typeof Cookiebot)return!1;var n=Cookiebot;if("boolean"!=typeof n.hasResponse||"object"!=typeof n.consent)return!1;if(!n.hasResponse)return!1;var e=aGTM.c.purposes?aGTM.c.purposes.split(","):[],o=0,r=0;for(k in n.consent)"stamp"!=k&&"method"!=k&&"boolean"==typeof n.consent[k]&&(r++,n.consent[k]&&(o++,e.push(k)));aGTM.d.consent.purposes=e.length>0?","+e.join(",")+",":"";var s="Consent available";return 0==r?s="No purposes available":o<=r?s="Consent (partially or full) declined":o>r&&(s="Consent accepted"),aGTM.d.consent.feedback=s,"string"==typeof n.consentID&&(aGTM.d.consent.consent_id=n.consentID),aGTM.d.consent.hasResponse=!0,"function"==typeof aGTM.f.log&&aGTM.f.log("m2",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};
   ```

3. **Add the configuration and injection**
   Now we need to add the configuration and injection code at the end of the file "aGTM.js".
   Navigate to the end of the aGTM.js file and insert the following code.
   To understand, what settings you can use and what the meaning of each setting is, read the chapter "Configuration options".
   Here we give you an integration example with the most of available configuration options. In a normal setup you need just a few of them.
   Example integration code:
   ```javascript
   (function(c){
   var w=window,d=document;w.aGTM=w.aGTM||{};aGTM.d=aGTM.d||{};aGTM.d.f=aGTM.d.f||[];aGTM.f=aGTM.f||{};aGTM.f.fire=aGTM.f.fire||function(o){aGTM.d.f.push(o);};
   aGTM.c=c;var s='script',t=d.createElement(s),m=c.min?'.min':'',p=c.path;if(p.length>0&&p.substring(p.length-1)!='/')p+='/';t.src=c.path+'aGTM'+m+'.js';t.async=true;d.head.appendChild(t);
   })({
   // aGTM Config Start
      path: '/js/' // (relative) path to the directory where aGTM is located, e.g. '/js/''
     ,file: 'aGTM.js' // Filename of aGTM
     ,min:true // inject the files as minified versions
     ,cmp: 'cookiebot' // Type of Consent Tool (Cookie Banner) you use in lower case, e.g. 'cookiebot'. See chapters below for possible options.
     ,nonce: 'ABC123' // Nonce value for the file injections
     ,gtm: { 'GTM-XYZ123': { 'debug_mode':true } } // your GTM Container - with ID, ...
     ,gtmPurposes: 'Functional' // The purpose(s) that must be agreed to in order to activate the GTM (comma-separated)
     ,gtmServices: 'Google Tag Manager' // The services(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Google Tag Manager'
     ,gtmVendors: 'Google Inc' // The vendor(s) that must be agreed to in order to activate the GTM (comma-separated)
     ,gdl: 'dataLayer' // Name of GTM dataLayer
     ,env: '' // Environment string (leave it blank you you don't know, what it is)
     ,dlStateEvents: true // Fire GTM dataLayer Events for DOMloaded and PAGEready
     ,useListener: false // Use an event listener to check the consent (true). If it is false, a timer will be used (default) to check the consent
     ,consent_events: 'cmpEvent,cmpUpdate' // string with consent events (comma-separated) for updating the consent (leave it blank you you don't know, what it is)
   // aGTM Config End
   });
   ```

4. **Use the aGTM.js code**
   Now the code is complete and you can do whatever you want with the code.
   Save the file or put the code in a Javascript field of your CMS or use it in a GTM container or include it direct to your website.
   We recommend to minify the code (e.g. with https://minify-js.com/). Keep care that you don't minify the function names (option "keep_fnames" for minify-js.com).

5. _optional_ **Send events**
   You can now send events using the following command:
   ```javascript
   aGTM.f.fire({ event:'button_click', button:'Sign Up Button' });
   ```


## Configuration options ##

There are a lot configuration options. But you need only to use the options, where you want another setting as the default value.

### debug ###
If this is true, the optout cookie will be ignored
Type: boolean
Example: `true`
Default: `false`

### path ###
The (relative) path to the directory where aGTM is located, e.g. '/js/''
Type: string
Example: `'/js/'`
Default: ``


### file ###
Filename of aGTM
Type: string
Example: `'aGTM-1.4.1.js'`
Default: `aGTM.js`

### cmp ###
Type of Consent Tool (Cookie Banner) you use in lower case, e.g. 'cookiebot'.
Available options:
   - Borlabs Cookie: borlabs
   - CCM19: ccm19
   - Consentmanager: consentmanager
   - Cookiebot: cookiebot
   - Cookie First: cookiefirst
   - Klaro: klaro
   - Magento CC Cookie: magento_cc_cookie
   - Sourcepoint: sourcepoint
   - Usercentrics: usercentrics
Type: string
Example: `'cookiebot'`
Default: `''`

### min ###
Inject the files as minified versions
Type: boolean
Example: `false`
Default: `true`

### nonce ###
Nonce value for the file injections. If it is set, the nonce will be added to all script-injections.
Type: string
Example: `ABC123`
Default: ``

### useListener ###
Use an event listener to check the consent (true). If it is false, a timer will be used (default) to check the consent.
You should add the following command to your Consent Event Listener:
`aGTM.f.call_cc();`
The function returns `true`, if the consent info has loaded successful, otherwise `false`.
*Make sure, that the aGTM lib is loaded before the event listener runs!*
If you don't know what that means, leave this option to false (default).
For more information, read the chapter "[Use Event Listeners instead of the default timer](#use-event-listeners-instead-of-the-default-timer)".
Type: boolean
Example: `true`
Default: `false`

### gtmID ###
your GTM Container ID - leave it empty if you don't want to use the Google Tag Manager
Type: string
Example: `'GTM-XYZ123'`
Default: `''`

### gdl ###
Name of GTM dataLayer
Type: string
Example: `'dataLayer'`
Default: `'dataLayer'`

### dlStateEvents ###
Fire GTM dataLayer Events for DOMloaded and PAGEready
Type: boolean
Example: `false`
Default: `true`

### gtmURL ###
If you use an own url to the GTM (e.g. using the serverside Google Tag Manager), you can set your URL here.
Leave it blank if you don't know what this means.
If the option is not set (or if it is empty) the standard GTM URL will be used (https://www.googletagmanager.com/gtm.js).
Type: string
Example: `'https://tm.my-own-website.org/my-gtm.js'`
Default: `''`

### gtmJS ###
Possibility to give the GTM JS direct as Javascript content, but Base64-encoded. In this case, no external JS script will be loaded.
Type: string
Example: The content of the JS file https://www.googletagmanager.com/gtm.js?id=GTM-XYZ123
Default: `''`

### env ###
Environment string (leave it blank you you don't know, what it is)
Type: string
Example: `'&gtm_auth=ABC123xyz&gtm_preview=env-1&gtm_cookies_win=x'`
Default: `''`

### gtmPurposes ###
The purpose(s) that must be agreed to in order to activate the GTM (comma-separated)
Type: string
Example: `'Functional'`
Default: `''`

### gtmServices ###
The services(s) that must be agreed to in order to activate the GTM (comma-separated)
Type: string
Example: `'Google Tag Manager'`
Default: `''`

### gtmVendors ###
The vendor(s) that must be agreed to in order to activate the GTM (comma-separated)
Type: string
Example: `'Google Inc'`
Default: `''`

### consent_events ###
string with consent events (comma-separated) for updating the consent
For more Information, read the chapter [Updating Consent Information](#updating-consent-information)
Type: string
Example: `'cmpEvent,cmpUpdate'`
Default: `''`


## Consent Handling ##

### Use Event Listeners instead of the default timer ###
By default, a timer is used to check whether the initial consent information is available. It will check every 100ms, whether the user hase given his consent (or declined it).
If you have the possibility to use an Event Listener for this, you can set the option "useListener" to true. In this case, no timer will start. But you need to add the following command to your Event Listener function:
`aGTM.f.call_cc();`
This command should run after the user has initial decided for consent.
The function returns `true`, if the consent info has loaded successful, otherwise `false`.
*Don't use it for consent update - read therefor the next point).*

### Updating Consent Information ###
There are two options to update existing consent information (e.g. if the user accept the consent in the first step but declines it later on).
The **first option** is to send an event with a special name to the dataLayer. You can configure the event name(s) with the config option "consent.consent_events". If you have more than one event name, you can configure more event names (comma-separated).
If an event comes into the dataLayer with one of the configured event names, the consent will be re-checked and updated.
The **second option** is to run the update function through an event listener. Add the following command to the Event Listener for updating the consent info:
`aGTM.f.run_cc('update')`
*Don't use this command for the initial check of the consent. Read therefore the point above.*

### See consented Purposes and Vendors ###
You can check, which purposes and vendors have consent by the following command (enter it in the browser console):
`aGTM.d.consent`
If it is empty (or undefined), the aGTM got no consent information (yet).

### GTM and/or GTAG Purposes and Vendors ###
There are 4 config options to inject the GTM consent-depending:
- gtmPurposes
- gtmServices
- gtmVendors
You can use it to inject the GTM only if the regarding consent for it was given.
That means, you can add one or more purpose(s), service(s) or vendor(s) to the option(s). If there is one or more missing consent of it, the GTM or GTAG will not be injected (only if all configured purposes and vendors have consent).

### consent_events ###
Here you can specify one (or more) event name(s) (comma-separated), which are used for updating the consent information, e.g.: `consent_events:'cmpEvent,cmpUpdate'`
If such an event was sent (through aGTM.f.fire), the internal consent check runs and updates the consent info (and sends the internal consent update event `aGTM_consent_update`).
You can even add one or more parameters that have to match for recognizing the event as a consent update event.
Therefore you just add the parameter(s) with it value in [] after the event name, e.g. `consent_events:'cmpEvent[userChoiceType:useraction]'`.
If a parameter just have to exists, but the value doesn't matter, you can leave out the value, e.g.: `consent_events:'cmpEvent[userChoiceType]'`.

### Consent Mode Settings in Google Tag Manager ###
To activate the Google Consent Mode in GTM, you should enable the consent overview in the GTM Container Settings:
![GTM Container Settings](assets/aGTM-gtm-enable-cm.png)
All other settings are in each GTM Tag. There you can configure, for what service (Consent Type Name) the consent is needed:
![GTM Tag Consent Settings](assets/aGTM-gtm-tag-cm-settings.png)
The Tag is only fired, if alle configured services (in that special tag) have consent. In case the tag is triggered and should be fired, but the consent is not available yet (or denied), the Tag can wait. If the consent comes later, the tag will be fired than (at normally). Because you use the aGTM, you'll not need this GTM feature in most cases - you have the consent always from the GTM start. So it is only interesting, if a user declines the consent and accept it later on the same pageload.


## Integration options for Google Tag Managaer ##

There are three options to integrate the Google Tag Manager code:
- Normal use of Google Tag Manager
- Loading the GTM from an own URL
- Loading the GTM code direct as Javascript (Base64-encoded)
These three options are explained below.

### Normal use of Google Tag Manager ###
This is just the normal integration option for using the Google Tag Manager as usual (from Google directly).
Therefore you just need to specify the GTM Container ID with the configuration option "gtmID".
Don't use the configuration options "gtmURL" or "gtmJS".

### Loading the GTM from an own URL ###
If you use an own Google Tag Manager server (e.g. using the serverside GTM), you can specify an own URL therefore using the configuration option "gtmURL".
This will replace the standard GTM URL (https://www.googletagmanager.com/gtm.js).
In addition you need to set the GTM Container ID with the configuration option "gtmID".
Don't use the configuration option "gtmJS".

### Loading the GTM code direct as Javascript (Base64-encoded) ###
In case you have the output of your Google Tag Manager container stored in a database or somewhere else, you can use this option.
The Javascript code must be assigned to the "gtmJS" configuration option (as string and  base64-encoded).
The configuration options "gtmID" or "gtmURL" will be ignored in this case.


## Function execution sequence ##

### init() ###
_called from the integration script_
Initialization of aGTM.
Calls **config(aGTM.c);**
- If a CMP (aGTM.c.cmp) was specified: **load_cc(aGTM.c.cmp, aGTM.f.consent_listener);**
- If no CMP (aGTM.c.cmp) was specified: **consent_listener();**

### config(config) ###
_called from init()_
Gets the configuration options and stes the necessary data options.

### consent_listener ###
_called from init()_
Checks, whether an Event Listener calls the call_cc() or if a timer has top be set for calling call_cc().
Calls **call_cc()**

### call_cc ###
_called from consent_listener() or an external event listener_
Checks the consent with `run_cc('init')` and returns `false` if the consent isn't ready. Otherwise it deletes the timer (if it is set), runs `inject()` and returns true.
Calls **run_cc('init')**, **inject()**

### run_cc ###
_called from call_cc() or fire(o)_
Runs the Consent Check. Returns `true` if the consent is available and `false` if not.
Calls **consent_check('init|update')**, **gtag(update)**, **fire(event:aGTM_consent_update)**
Callback: consent_callback(init|update)

### load_cc() ###
_called from init()_
Loads the Consent Check function (as external file or code) for the specified CMP.
Calls: **consent_listener()** (after consent_check function has loaded)

### inject() ###
_called from call_cc() through timer or event listener_
Injects the GTM and/or GTAG(for Analytics).
Calls: **gtag(init)**, **gtag(for Analytics)**, **gtm_load(GTM-Config)**, **fire(event:aGTM_consent_init)**, **domready()**, **pageready()**, **evLstn(DOMContentLoaded)**, **evLstn([window]load)**
Callbacks: gtag_inject_callback(), inject_callback()

### gtm_load(GTM-Config) ###
_called from inject()_
Function to initialize the Google Tag Manager

### evLstn(DOMobject,EventName,Fkt) ###
_called from inject()_
Function for adding an Event Listener

### domready() ###
_called from inject()_
Function to run by DOMready state, fires a dataLayer event 'vDOMready'
Calls: **fire(event:vDOMready)**

### pageready() ###
_called from inject()_
Function to run by PAGEloaded state, fires a dataLayer event 'vPAGEready'
Calls: **fire(event:vPAGEready)**

### gc(cookiename) ###
_called from init()_
Returns a value of a cookie

### fire(event) ###
_called from inject(), run_cc(), domready(), pageready()_
Function for GTM dataLayer.push()
Calls: **gtag(for Analytics)**
Callback: fire_callback()


## Debugging ##

All settings, data and functions are stored in only one object: `aGTM`
You can enter the name of the object (aGTM) into the browser console and you'll get all settings and all data for debugging.

Also, the library logs some errors or success messages into an internal array (aGTM.l). But this array contains only IDs of the messages. To understand it, you need our mapping:
There is an additional file for translating and printing these messages to the browser console.
The file has the name "aGTM_debug.js" and is hopefully uploaded.
To get the debug messages, follow these two steps:
1. Load the file by entering this line into the browser console:
   `var s=document.createElement('script'); s.src='https://www.YOUR-DOMAIN.COM/PATH/TO/aGTM_debug.js'; document.body.appendChild(s);`
   *Note: replace the domain and path to the file with your correct path*
2. Wait a second.
3. Enter this command into the browser console:
   `aGTM.f.view_log();`
Now you get all the log messages. The last command gives you also an object with all messages.
I hope, this helps you to find your problem.


## Callback Functions ##

There are some callback function that you can use:

### Callback after (successful) Consent Check ###
If the consent (check) function got the available consent information, the following callback function is called:
`aGTM.f.consent_callback(a)`
The Parameter "a" gives you the action that was submitted to the original consent. It can be 'init' or 'update'.
'init' stands for the (first) initial consent check on a page, 'update', if the consent was changed  (after an init).

### Callback after injecting the Google Tag Manager ###
After the Google Tag Manager was (successful) injected into a page, the following callback function is called:
`aGTM.f.inject_callback()`

### Callback after an event was fired ###
If an event was fired (through aGTM.f.fire), the following callback function is called:
`aGTM.f.fire_callback(obj)`
The parameter "obj" contains the whole event object.


## Frequently Asked Questions (FAQ) ##

Q: *Why is outdated Javascript code used, e.g. var instead of let/const or objects instead of classes?*
A: There are tracking setups where it is not possible to integrate source code directly. Sometimes you can enter a Google Tag Manager Container ID there, which will fire a Google Tag Manager.
You can use this to fire a second GTM container with this code, which then has the logic provided by this script.
It's not nice, but sometimes it's the only solution.
In any case, the Google Tag Manager unfortunately only accepts Javascript up to ECMAscript 5, which means we are tied to old spellings.

Q: *What happens if there are Events were pushed in the GTM dataLayer (or fired via aGTM.f.fire), before the GTM was injected?*
A: There is a GTM Custom Template you can use to repeat these events.


## Author and Contact ##

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


## Changelog ##

- Version 1.0, *10.04.2024*
  - Initial Version of aGTM
