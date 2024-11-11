# aGTM - GTM Templates

## Table of Contents

- [What is it for?](#what-is-this-document-it-for)
- [Available GTM Templates and Variables](#available-gtm-templates-and-variables)

---

## What is this document for?

There are a lot of Google Tag Manager templates you can use (if the GTM is injected with aGTM).
This extensions spends a lot of cool features for your GTM setup.

This Documentation lists the available GTM Templates and describes how to use them.

---

## Available GTM Templates and Variables

List of available **GTM Tag Templates***:

- **Click Events**
  Event Listener for Clicks in a page. Extremely customizable and provides much more information about the clicked object as the GTM-integrated click listener.
- **Consent Mode**
  This is the aGTM Consent Mode Tag Template. It uses the Consent Information what aGTM provides and is therefore useable with the first GTM event (Consent Initialisation).
- **Copy Events**
  If the user copies a text (e.g. EMail-Address, Phone Number, Product Name, ...), this Event Listener will send an dataLayer Event with information about the copied object.
- **DataLayer Repeat**
  This Template can re-send events that were send before the GTM was injected into the page or before the aGTMready event came into the dataLayer.
- **Form Events**
  Event Listener for Form Submits. Extremely customizable and provides much more information about the form (and form fields) as the GTM-integrated form listener.
- **iFrame Support**
  If activated, aGTM sends automatically events from an iFrame to the Top Frame of a page. This Tag Template is listening to this kind of messages and can send them into the dataLayer of the Top Frame Page. You can filter what events should pass or filtered out, whether the events should have an event name prefix, and so on.
- **Pageview Events**
  With this Tag Template you can define when a Pageview event should be fired and what information it should have (e.g. Browser or Device Information, Page Information like Canonical or Robots Tag, Human Check, ...). The Tag can also be used as an Event Listener for DOM Ready and Window Loaded, providing additional information.
- **Scroll Events**
  This Event Listener sends customizable events when a user scrolls. You can define at what scrolling steps events should be fired or even if the user has started to scroll. Or whether the viewport is to small for Scrolling.
- **Timer Events**
  This Tag Template fires Events after a customizable time. You can define the seconds and how often the event has to repeat and a lot more ...

List of available **GTM Variable Templates**:

- **Device and Page Info**
  Provides information about the Page and the User Device, like Browser Info, Screen, Canonical Tag, ...

- **Content Counter**
  Counts the word and images of a page.

---
