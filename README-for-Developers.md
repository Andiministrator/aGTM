# aGTM - Developer Documentation

![aGTM  a Galactic Tagging Modulator](/data/_Projects/aGTM/assets/aGTMdeveloper-100px.png)

## Table of Contents

- [What is it for? - General Information](#what-is-this-document-it-for)
- [Function execution sequence](#function-execution-sequence)
- [Callback Functions](#callback-functions)

---

## What is this document for?

This is the Documentation for Developers. It describes how aGTM works internal, what functions it container, which extensions exist and so on.

It may be also useful for developers to dive deeper into the aGTM, e.g. to use callback functions, ...

---

## Function execution sequence

### init()

*called from the integration script* Initialization of aGTM.
Calls **config(aGTM.c);**

- If the CMP setting is "none" or page is within an iFrame, it will skip tzhe Consent Check and start to inject the GTM(s)
- If a CMP (aGTM.c.cmp) was specified: **load_cc(aGTM.c.cmp, aGTM.f.consent_listener);**
- If no CMP (aGTM.c.cmp) was specified: **consent_listener();**

### config(config)

*called from init()* Gets the configuration options and stes the necessary data options.

### consent_listener

*called from init()* Checks, whether an Event Listener calls the call_cc() or if a timer has top be set for calling call_cc().
Calls **call_cc()**

### call_cc

*called from consent_listener() or an external event listener* Checks the consent with `run_cc('init')` and returns `false` if the consent isn't ready. Otherwise it deletes the timer (if it is set), runs `inject()` and returns true.
Calls **run_cc('init')**, **inject()**

### run_cc

*called from call_cc() or fire(o)* Runs the Consent Check. Returns `true` if the consent is available and `false` if not.
Calls **consent_check('init|update')**, **gtag(update)**, **fire(event:aGTM_consent_update)** Callback: consent_callback(init|update)

### load_cc()

*called from init()* Loads the Consent Check function (as external file or code) for the specified CMP.
Calls: **consent_listener()** (after consent_check function has loaded)

### inject()

*called from call_cc() through timer or event listener* Injects the GTM and/or GTAG(for Analytics).
Calls: **gtag(init)**, **gtag(for Analytics)**, **gtm_load(GTM-Config)**, **fire(event:aGTM_consent_init)**, **domready()**, **pageready()**, **evLstn(DOMContentLoaded)**, **evLstn([window]load)** Callbacks: gtag_inject_callback(), inject_callback()

### gtm_load(GTM-Config)

*called from inject()* Function to initialize the Google Tag Manager

### evLstn(DOMobject,EventName,Fkt)

*called from inject()* Function for adding an Event Listener

### domready()

*called from inject()* Function to run by DOMready state, fires a dataLayer event 'vDOMready'
Calls: **fire(event:vDOMready)**

### pageready()

*called from inject()* Function to run by PAGEloaded state, fires a dataLayer event 'vPAGEready'
Calls: **fire(event:vPAGEready)**

### gc(cookiename)

*called from init()* Returns a value of a cookie

### fire(event)

*called from inject(), run_cc(), domready(), pageready()* Function for GTM dataLayer.push()
Calls: **gtag(for Analytics)** Callback: fire_callback()

---

## Callback Functions

There are some callback function that you can use:

### Callback after (successful) Consent Check

If the consent (check) function got the available consent information, the following callback function is called: `aGTM.f.consent_callback(a)` The Parameter "a" gives you the action that was submitted to the original consent. It can be 'init' or 'update'.
'init' stands for the (first) initial consent check on a page, 'update', if the consent was changed (after an init).

### Callback after injecting the Google Tag Manager

After the Google Tag Manager was (successful) injected into a page, the following callback function is called: `aGTM.f.inject_callback()`

### Callback after an event was fired

If an event was fired (through aGTM.f.fire), the following callback function is called: `aGTM.f.fire_callback(obj)` The parameter "obj" contains the whole event object.
