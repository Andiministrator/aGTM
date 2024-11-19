# aGTM - Developer Documentation

![aGTM  a Galactic Tagging Modulator](/data/_Projects/aGTM/assets/aGTMdeveloper-100px.png)

#### Overview

`aGTM.js` is a global implementation script designed for developers who want to extend, customize, or integrate Google Tag Manager (GTM) and Google Analytics (GA) functionality based on user consent. This documentation covers the internal workings, extensibility options, and callback functions for developers.

- **Version**: 1.0
- **Last Updated**: 07.11.2024
- **Author**: Andi Petzoldt [andi@petzoldt.net](mailto:andi@petzoldt.net)
- **Repository**: [GitHub Repository](https://github.com/Andiministrator/aGTM/)

## Table of Contents

1. [Initialization and Configuration](#initialization-and-configuration)
2. [Consent Management](#consent-management)
3. [GTM Integration](#gtm-integration)
4. [Callbacks](#callbacks)
5. [Utility Functions](#utility-functions)
6. [Extending `aGTM`](#extending-agtm)
7. [Usage Examples](#usage-examples)

## Initialization and Configuration

### Initializing the `aGTM` Object

The main object is initialized if it doesn't already exist:

```javascript
window.aGTM = window.aGTM || { f: {} };
```

### Configuration Function

Use `aGTM.f.config()` to set up configurations for GTM containers, consent management, and other settings.

#### Example Configuration

```javascript
aGTM.f.config({
  gtm: { 'GTM-XYZ123': {} },
  gtmPurposes: 'statistics',
  sendConsentEvent: true
});
```

## Consent Management

### Consent Check

The `aGTM.f.run_cc()` method checks and updates the consent status.

```javascript
aGTM.f.run_cc('init');
```

### Loading Consent Tools

Load consent scripts like Cookiebot using:

```javascript
aGTM.f.load_cc('cookiebot', function() {
  console.log('Cookiebot loaded');
});
```

### Consent Callback

To execute a function when consent changes, define `aGTM.f.consent_callback`:

```javascript
aGTM.f.consent_callback = function(action) {
  console.log("Consent status updated:", action);
};
```

## GTM Integration

### Loading GTM Containers

The `aGTM.f.gtm_load()` function loads the GTM script based on a container ID.

```javascript
aGTM.f.gtm_load(window, document, 'GTM-XYZ123', 'dataLayer', {});
```

### Event Firing

To push events to GTM's dataLayer:

```javascript
aGTM.f.fire({ event: 'pageview', pagetype: 'blog' });
```

## Callbacks

### Available Callback Functions

Developers can utilize or override the following callbacks:

- **`aGTM.f.consent_callback(action)`**: Executes when consent status is checked or updated.
  - `action`: `'init'` or `'update'`
- **`aGTM.f.inject_callback()`**: Executes after GTM scripts are injected.
- **`aGTM.f.fire_callback(eventObj)`**: Executes after an event is fired into the dataLayer.
  - `eventObj`: The event object pushed to the dataLayer.
- **`aGTM.f.optout_callback()`**: Executes when the user opts out via a cookie or URL parameter.

### Example Usage of Callbacks

```javascript
aGTM.f.fire_callback = function(event) {
  console.log("Event fired:", event);
};
aGTM.f.inject_callback = function() {
  console.log("GTM scripts injected");
};
```

## Utility Functions

### Logging and Debugging

Log messages and errors using `aGTM.f.log()`:

```javascript
aGTM.f.log('m3', { message: 'Event triggered' });
```

### String Sanitization

Clean strings using:

```javascript
var cleanStr = aGTM.f.strclean('dirty;string');
```

### URL Parameter Handling

Extract URL parameters using:

```javascript
var param = aGTM.f.urlParam('utm_source', window.location.href);
```

## Extending `aGTM`

### Adding Custom GTM Containers

You can extend the existing functionality by adding new GTM containers dynamically:

```javascript
aGTM.c.gtm['GTM-NEWID'] = { debug_mode: true };
aGTM.f.initGTM();
```

### Creating Custom Consent Checks

Override the default consent check function:

```javascript
aGTM.f.consent_check = function(action) {
  return myCustomConsentFunction();
};
```

### Handling Dynamic Elements

Use the `aGTM.f.observer()` function to track dynamically added elements:

```javascript
aGTM.f.observer('button', 'click', function(event) {
  console.log('Button clicked:', event);
});
```

## Usage Examples

### Minimal Setup with Cookiebot

```javascript
aGTM.f.config({
  cmp: 'cookiebot',
  gtm: { 'GTM-XYZ123': {} }
});
aGTM.f.init();
```

### Tracking Form Interactions

```javascript
aGTM.f.addElLst('form', 'submit', function(event) {
  console.log('Form submitted:', event);
});
```

### Error Monitoring

Monitor JavaScript errors:

```javascript
aGTM.f.jserrors();
```

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/Andiministrator/aGTM/blob/main/LICENSE) file for details.

---

**End of Documentation**
