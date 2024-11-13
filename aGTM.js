/*** aGTM.js | BOF ***/

/**
 * Global implementation script/object for Google GTAG and Tag Manager, depending on the user consent.
 * @version 1.2
 * @lastupdate 07.11.2024 by Andi Petzoldt <andi@petzoldt.net>
 * @repository https://github.com/Andiministrator/aGTM/
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @documentation see README.md or https://github.com/Andiministrator/aGTM/
 */

/***** Initialization and Configuration *****/

// Initialize the main object if it doesn't exist
window.aGTM = window.aGTM || { c:{}, d:{}, f:{}, n:{} };

// Function to set properties within the aGTM object with default values
aGTM.f.propset = function (obj, prop, defaultValue) {
  obj[prop] = obj[prop] || defaultValue;
};

// Function to initiate the basic aGTM container
aGTM.f.objinit = function() {
  var props = [
    [aGTM.d, "version", "1.2"],
    [aGTM.d, "f", []],
    [aGTM.d, "config", false],
    [aGTM.d, "init", false],
    [aGTM.d, "dom_ready", false],
    [aGTM.d, "page_ready", false],
    [aGTM.d, "is_iframe", window.self !== window.top],
    [aGTM.d, "ev_fct_ctr", 0],
    [aGTM.d, "timer", {}],
    [aGTM.d, "error_counter", 0],
    [aGTM.d, "errors", []],
    [aGTM.d, "dl", []],
    [aGTM.d, "iframe", {
      counter: { events: 0 },
      origin: "",
      ifListen: false,
      topListen: false,
      handshake: false,
      timer: null
    }],
    [aGTM.f, "tl", {}],
    [aGTM.f, "dl", {}],
    [aGTM.f, "pl", {}],
    [aGTM, "l", []],
    [aGTM.n, "ck", "co" + "o" + "kie"],
    [aGTM.n, "tm", "goo" + "glet" + "agmanager"],
    [aGTM.n, "ta", "tag" + "assi" + "stant.goo" + "gle"]
  ];
  props.forEach(function(item) {
    aGTM.f.propset(item[0], item[1], item[2]);
  });
};
aGTM.f.objinit();

/**
 * Function to log a message or an error
 * @property {function} aGTM.f.log
 * @param {string} id - id of log message, e.g., 'm3'
 * @param {object} obj - object for additional information
 * Usage: aGTM.f.log('m3', ev);
 */
aGTM.f.log = function (id, obj) {
  // Clone the object if it's an object to avoid mutations
  var clonedObj =
    typeof obj === "object" && obj ? JSON.parse(JSON.stringify(obj)) : obj;
  aGTM.l.push({ id: id, timestamp: new Date().getTime(), obj: clonedObj });
};

/**
 * Function to clean a string
 * @property {function} aGTM.f.strclean
 * @param {string} str - string to clean
 * @returns {string} - cleaned string
 * Usage: aGTM.f.strclean('any "dirty"; string');
 */
aGTM.f.strclean = function (str) {
  if (typeof str == "undefined" || (typeof str == "object" && !str)) return "";
  if (typeof str != "string") str = str.toString();
  return str.replace(/[^a-zäöüßA-ZÄÖÜ0-9_-]/g, "");
};

/**
 * Assigns a property to a target object, using a value from a source object or a default value.
 * @param {object} target - The target object where the property will be assigned.
 * @param {string} property - The name of the property to an.
 * @param {object} source - The source object from which to retrieve the value.
 * @param {*} defaultValue - The default value to use if the property is not found in the source.
 */
aGTM.f.an = function (target, property, source, defaultValue) {
  // Assign the property from the source or use the default value
  target[property] = source.hasOwnProperty(property)
    ? source[property]
    : defaultValue;
};

/**
 * Configures the aGTM object with user-defined settings.
 * @param {object} cfg - Configuration settings provided by the user.
 */
aGTM.f.config = function (cfg) {
  // Check whether config was already set to avoid reconfiguration
  if (aGTM.d.config) {
    if (typeof aGTM.f.log == "function") aGTM.f.log("e1", aGTM.c);
    return;
  }
  // Assigning user-defined configurations or default values
  aGTM.f.an(aGTM.c, "debug", cfg, false); // If this is true, the optout cookie will be ignored
  aGTM.f.an(aGTM.c, "path", cfg, ""); // (relative) path to the directory where aGTM is located, e.g. '/js/''
  aGTM.f.an(aGTM.c, "file", cfg, "aGTM.js"); // Filename of aGTM, default is 'aGTM.js'
  aGTM.f.an(aGTM.c, "cmp", cfg, ""); // Type of Consent Tool (Cookie Banner) you use in lower case, e.g. 'cookiebot'. See README.md for possible options.
  aGTM.c.min = typeof cfg.min == "boolean" ? cfg.min : true; // inject the files as minified versions
  aGTM.f.an(aGTM.c, "nonce", cfg, ""); // Nonce value for the file injections
  aGTM.f.an(aGTM.c, "iframeSupport", cfg, false); // Nonce value for the file injections
  aGTM.f.an(aGTM.c, "useListener", cfg, false); // Use an event listener to check the consent (true). If it is false, a timer will be used (default) to check the consent

  // GTM-specific configuration
  aGTM.f.an(aGTM.c, "gtmID", cfg, ""); // GTM ID for fire hasty Events, by default the last GTM ID of the following object will be used
  if (cfg.gtm) {
    // Object with GTM container config, example: cfg.gtm = { 'GTM-xxx': { debug_mode:true } };
    for (var k in cfg.gtm) {
      if (cfg.gtm.hasOwnProperty(k)) {
        aGTM.c.gtmID = aGTM.c.gtmID || k; // GTM ID
        // Assign GTM-container-specific configurations
        aGTM.c.gtm = aGTM.c.gtm || {};
        aGTM.c.gtm[k] = cfg.gtm[k] || {};
        aGTM.f.an(aGTM.c.gtm[k], "noConsent", cfg.gtm[k], false); // Load this GTM without Consent Check, if this setting is true
        aGTM.f.an(aGTM.c.gtm[k], "env", cfg.gtm[k], ""); // Environment string (leave it blank you you don't know, what it is)
        aGTM.f.an(aGTM.c.gtm[k], "idParam", cfg.gtm[k], ""); // GTM ID URL parameter name (leave it blank you you don't know, what it is)
        aGTM.f.an(aGTM.c.gtm[k], "gtmURL", cfg.gtm[k], ""); // If you use an own url to the GTM (e.g. using the serverside Google Tag Manager), you can set your URL here. Leave it blank if you don't know what this means.
        aGTM.f.an(aGTM.c.gtm[k], "gtmJS", cfg.gtm[k], ""); // Possibility to give the GTM JS direct as Javascript content, but Base64-encoded. In this case, no external JS script will be loaded.
      }
    }
  }
  aGTM.f.an(aGTM.c, "gdl", cfg, "dataLayer"); // GTM dataLayer name
  aGTM.f.an(aGTM.c, "gtmPurposes", cfg, ""); // The purpose(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Functional'
  aGTM.f.an(aGTM.c, "gtmServices", cfg, ""); // The services(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Google Tag Manager'
  aGTM.f.an(aGTM.c, "gtmVendors", cfg, ""); // The vendors(s) that must be agreed to in order to activate the GTM (comma-separated), e.g. 'Google Inc'
  aGTM.f.an(aGTM.c, "gtmAttr", cfg, null); // Set HTML tag attributes to add in the GTM script tag, e.g. { 'data-cmp-ab':'c905' }
  aGTM.f.an(aGTM.c, "dlSet", cfg, {}); // Set dataLayer variables, that should always be attached to an event
  aGTM.c.dlStateEvents = typeof cfg.dlStateEvents == "boolean" ? cfg.dlStateEvents : false; // Fire GTM dataLayer Events for DOMloaded and PAGEready
  aGTM.c.vPageview = typeof cfg.vPageview == "boolean" ? cfg.vPageview : false; // Fire vPageview Event
  aGTM.c.sendConsentEvent = typeof cfg.sendConsentEvent == "boolean" ? cfg.sendConsentEvent : false; // Should aGTM send a separate Event with Consent Info?

  // Consent configuration
  cfg.consent = cfg.consent || {}; // object with consent information that should be set by default (if no consent is given or not yet).
  aGTM.c.consent = aGTM.c.consent || cfg.consent; // object with consent information that should be set by default (if no consent is given or not yet).
  // Initialize the nested consent properties with default values or from cfg
  aGTM.f.an(aGTM.c.consent, "hasResponse", cfg.consent, false); // true (or string) if consent was given, false if consent was not (yet) given (user hasn't interacted with the consent banner)
  aGTM.f.an(aGTM.c.consent, "feedback", cfg.consent, ""); // contains a string with a CMP info about whether/how the consent was given
  aGTM.f.an(aGTM.c.consent, "purposes", cfg.consent, ""); // contains a string with the acknowledged consent purposes
  aGTM.f.an(aGTM.c.consent, "services", cfg.consent, ""); // contains a string with the acknowledged consent services
  aGTM.f.an(aGTM.c.consent, "vendors", cfg.consent, ""); // contains a string with the acknowledged consent vendors
  aGTM.f.an(aGTM.c.consent, "consent_id", cfg.consent, ""); // ID of the current CMP User to request consent info

  // Initialise the dataLayer
  window[aGTM.c.gdl] = window[aGTM.c.gdl] || [];

  // Initialize after settings
  aGTM.d.consent = aGTM.d.consent || JSON.parse(JSON.stringify(aGTM.c.consent)); // Deep copy to avoid reference issues
  aGTM.d.consent.gtmConsent = false; // Initialize GTM consent as false
  aGTM.d.config = true; // Set the configuration status to true
  aGTM.d.gtmLoaded = [];
  if (typeof aGTM.f.log == "function") aGTM.f.log("m1", aGTM.c); // Log the configuration
};

/***** Consent Functions *****/

/**
 * Loads the consent_check function specific to the user's Consent Management Platform (CMP).
 * @property {function} aGTM.f.load_cc
 * @param {string} cmp - The identifier of the consent tool, e.g., 'cookiebot'.
 * @param {function} callback - The callback function to execute once the script is fully loaded.
 * Usage: aGTM.f.load_cc('cookiebot', callbackFunction);
 */
aGTM.f.load_cc = function (cmp, callback) {
  var scriptTag = document.createElement("script");
  // Get the script path, adding a trailing slash if it's missing
  var scriptPath = aGTM.c.path || "";
  if (scriptPath.length > 0 && scriptPath.charAt(scriptPath.length - 1) !== "/")
    scriptPath += "/";
  // Construct the full script URL, cleaning the CMP name and appending the minified suffix if needed
  var scriptFile =
    "cmp/cc_" + aGTM.f.strclean(cmp) + (aGTM.c.min ? ".min" : "") + ".js";
  scriptTag.src = scriptPath + scriptFile;
  // Add nonce for Content Security Policy (CSP) if it's provided
  if (aGTM.c.nonce) scriptTag.nonce = aGTM.c.nonce;
  // Set up the callback to execute when the script is loaded
  //t.onreadystatechange=callback;
  //t.onload=callback;
  scriptTag.onreadystatechange = scriptTag.onload = function () {
    // Ensure the script is fully loaded or completed before executing the callback
    if (!scriptTag.readyState || /loaded|complete/.test(scriptTag.readyState)) {
      // Check if the callback is a function before executing it
      if (typeof callback === "function") {
        callback();
      }
    }
  };
  // Load the script asynchronously
  scriptTag.async = true;
  // Append the script tag to the head of the document
  document.head.appendChild(scriptTag);
};

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @type: No consent tool, this is the fallback function
 * @property {function} aGTM.f.consent_check
 * @param {string} action - the action, what the function should do. can be "init" (for the first consent check) or "update" (for updating existing consent info)
 * @returns {boolean} - true, if consent is available, false if not
 * Usage: aGTM.f.consent_check('init');
 */
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

/**
 * Helper fuction for the consent function
 * @property {function} aGTM.f.chelp
 * @param {string} need_cons - a string with the purposes/vendors that need consent (comma-separated)
 * @param {string} given_cons - a string with the purposes/vendors that need consent (comma-separated and with a comma at the beginning and at the end)
 * Usage: aGTM.f.chelp('Google Analytics, Google Remarketing', 'Google Analytics');
 */
aGTM.f.chelp = function (need_cons, given_cons) {
  var c = true;
  if (need_cons && given_cons) {
    need_cons.split(",").forEach(function (consent) {
      if (given_cons.indexOf("," + consent.trim() + ",") < 0) c = false;
    });
  }
  return c;
};

/**
 * Helper Function - Evaluates whether the given consents satisfy the required consents for a specific type.
 * @param {object} obj - The type object containing status, purposes, services, and vendors.
 * @param {object} consents - The given consents object containing purposes, services, and vendors.
 * @return {boolean} - True if all required consents are given, false otherwise.
 */
aGTM.f.evalCons = function (obj, consents) {
  var isConsentGiven = function (list, consentString) {
    return list.every(function (item) {
      return consentString.indexOf("," + item + ",") >= 0;
    });
  };
  var purposesGiven =
    !obj.purposes.length || isConsentGiven(obj.purposes, consents.purposes);
  var servicesGiven =
    !obj.services.length || isConsentGiven(obj.services, consents.services);
  var vendorsGiven =
    !obj.vendors.length || isConsentGiven(obj.vendors, consents.vendors);
  return purposesGiven && servicesGiven && vendorsGiven;
};

/**
 * Executes the consent check and updates the consent status accordingly.
 * @property {function} aGTM.f.run_cc
 * @param {string} action - The action to perform: "init" for initial consent check or "update" for updating existing consent info.
 * Usage: aGTM.f.run_cc('init');
 */
aGTM.f.run_cc = function (action) {
  // Ensure configuration is set before proceeding
  if (!aGTM.d.config) {
    aGTM.f.log("e4", null);
    return false;
  }
  // Validate the action parameter
  if (
    typeof action !== "string" ||
    (action !== "init" && action !== "update")
  ) {
    aGTM.f.log("e5", { action: action });
    return false;
  }
  // Check if consent_check function is defined
  if (typeof aGTM.f.consent_check !== "function") {
    aGTM.f.log("e14", { action: action });
    return false;
  }
  // Perform the consent check
  var consentCheck = aGTM.f.consent_check(action);
  if (!consentCheck) {
    aGTM.f.log("m8", null);
    return false;
  }
  // Set GTM consent status
  window[aGTM.c.gdl] = window[aGTM.c.gdl] || [];
  if (
    aGTM.f.chelp(aGTM.c.gtmPurposes, aGTM.d.consent.purposes) &&
    aGTM.f.chelp(aGTM.c.gtmServices, aGTM.d.consent.services) &&
    aGTM.f.chelp(aGTM.c.gtmVendors, aGTM.d.consent.vendors)
  ) {
    aGTM.d.consent.gtmConsent = true;
  } else {
    aGTM.d.consent.gtmConsent =
      typeof aGTM.d.consent.blocked == "boolean"
        ? aGTM.d.consent.blocked
        : false;
  }
  // Update consent status if action is 'update'
  if (action == "update") {
    if (!aGTM.d.init) aGTM.f.inject();
    window[aGTM.c.gdl].push({
      event: "aGTM_consent_update",
      aGTMts: new Date().getTime(),
      aGTMconsent: aGTM.d.consent ? JSON.parse(JSON.stringify(aGTM.d.consent)) : {}
    });
  }
  // Execute callback if defined
  if (typeof aGTM.f.consent_callback === "function")
    aGTM.f.consent_callback(action);
  // Log the current consent status
  aGTM.f.log("m3", aGTM.d.consent);
  return true;
};

/**
 * Executes the consent check and performs subsequent actions based on the consent status.
 * @property {function} aGTM.f.call_cc
 * @return {boolean} Returns true if consent was checked successfully, false otherwise.
 * Usage: var res = aGTM.f.call_cc();
 */
aGTM.f.call_cc = function () {
  // Run the consent check
  if (typeof aGTM.f.run_cc != "function" || !aGTM.f.run_cc("init")) return false; // If consent check failed, return false
  // Clear the consent timer if it's set
  if (typeof aGTM.d.timer.consent != "undefined") {
    clearInterval(aGTM.d.timer.consent);
    delete aGTM.d.timer.consent;
  }
  // If initialization hasn't been done, call the inject function
  if (!aGTM.d.init) return aGTM.f.inject();
  // Return true if consent was checked successfully
  return true;
};

/**
 * Initializes a consent check process, either by setting an event listener or by creating a timer for periodic checks.
 * @property {function} aGTM.f.consent_listener
 * Usage: aGTM.f.consent_listener();
 */
if (typeof aGTM.f.consent_listener != "function") aGTM.f.consent_listener = function () {
  if (!aGTM.c.useListener) {
    aGTM.d.timer.consent = setInterval(aGTM.f.call_cc, 1000);
  }
};


/***** Cookie, URL and OptOut Functions *****/

/**
 * Retrieves the value of a cookie.
 * @property {function} aGTM.f.gc
 * @param {string} n - The name of the cookie.
 * @returns {string|null} - The value of the cookie or null if the cookie does not exist.
 * Usage: aGTM.f.gc('consent');
 */
aGTM.f.gc = function (n) {
  var re = new RegExp(n + "=([^;]+)");
  var value = null;
  try {
    var d = document;
    var match = re.exec(d[aGTM.n.ck]);
    if (match && match.length > 1) value = decodeURIComponent(match[1]);
  } catch (e) {}
  return value;
};

/**
 * Sets a session cookie.
 * @property {function} aGTM.f.sc
 * @param {string} n - The name of the cookie.
 * @param {string} v - The value of the cookie.
 * Usage: aGTM.f.sc('consent','true');
 */
aGTM.f.sc = function (n, v) {
  if (typeof n != "string" || !n || !v) return;
  try {
    var d = document;
    d[aGTM.n.ck] = n + "=" + v + "; Secure; SameSite=Lax; path=/";
  } catch (e) {}
};

/**
 * Retrieves the value of a specified URL parameter from a given URL.
 * @function aGTM.f.urlParam
 * @param {string} name - The name of the URL parameter to retrieve.
 * @param {string} url - The URL string to search for the parameter.
 * @returns {string|null} - The decoded value of the parameter if it exists, otherwise null.
 * Usage: aGTM.f.urlParam('aGTMoptout', window.location.href);
 */
aGTM.f.urlParam = function(name, url) {
  var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
  var results = regex.exec(url);
  return results && results[2] ? decodeURIComponent(results[2].replace(/\+/g, " ")) : null;
};

/**
 * Manages the opt-out functionality for the aGTM object based on URL parameters and cookies.
 * - Checks if the URL contains the `aGTMoptout` parameter.
 * - If `aGTMoptout` is set and not equal to "0", sets a cookie `aGTMoptout` with value "1" and enables opt-out.
 * - If `aGTMoptout` is equal to "0", removes the `aGTMoptout` cookie if it exists.
 * - If no URL parameter is present, checks if a `aGTMoptout` cookie exists with a value greater than "0".
 * - If opt-out is enabled, clears all properties of `aGTM` except `f`, reinitializes the object,
 *   and calls an optional callback function `aGTM.f.optout_callback`.
 * @function aGTM.f.optout
 * @returns {boolean} - Returns true if opt-out is active, otherwise false.
 */
aGTM.f.optout = function() {
  // Initialize the optout variable to false
  var optout = false;
  // Check the URL for the aGTMoptout parameter
  var urlOptoutValue = aGTM.f.urlParam("aGTMoptout",window.location.href);
  // Handle cases based on the URL parameter value
  if (urlOptoutValue && urlOptoutValue !== "0") {
    // If the parameter exists and is not "0", set the cookie and optout flag
    aGTM.f.sc("aGTMoptout", "1");
    optout = true;
  } else if (urlOptoutValue === "0") {
    // If the parameter exists and is "0", remove the cookie
    aGTM.f.sc("aGTMoptout", "0"); // Clear the cookie by setting an empty value
  } else {
    // If no parameter, check the cookie value
    var cookieValue = aGTM.f.gc("aGTMoptout");
    if (cookieValue && cookieValue !== "0") optout = true;
  }
  // If optout is true, reset the aGTM object properties and execute callbacks
  if (optout) {
    // Delete all properties in aGTM except "f"
    for (var key in aGTM) {
      if (aGTM.hasOwnProperty(key) && key !== "f") delete aGTM[key];
    }
    // Re-initialize the aGTM object and execute the callback if it exists
    aGTM.f.objinit();
    if (typeof aGTM.f.optout_callback === "function") aGTM.f.optout_callback();
    return true; // End the function and return true
  }
  return false; // End the function and return false if optout is not true
};


/***** Google Tag Manager specific Functions *****/

/**
 * Returns an aGTM Object to fire it into the GTM dataLayer
 * @property {function} aGTM.f.aGTM_event
 * @param {string} eventname - The Event Name
 * @returns {object} - the event object
 * Usage: aGTM.f.aGTM_event("aGTM_ready");
 */
aGTM.f.aGTM_event = function (eventname) {
  if (typeof aGTM.d.consent != 'object') aGTM.d.consent = null;
  if (!eventname) eventname = 'aGTM_event';
  var obj = {
    event: eventname,
    aGTMts: new Date().getTime(),
    aGTMconsent: aGTM.d.consent ? JSON.parse(JSON.stringify(aGTM.d.consent)) : {}
  };
  if (eventname == 'aGTM_ready')
    obj.aGTM = {
      version: aGTM.d.version,
      is_iframe: aGTM.d.is_iframe,
      hastyEvents: aGTM.d.f,
      errors: aGTM.d.errors
    };
  return obj;
};

/**
 * Initializes the Google Tag Manager with provided settings.
 * @property {function} aGTM.f.gtm_load
 * @param {object} w - The window object, usually: window.
 * @param {object} d - The document object, usually: document.
 * @param {string} i - Google Tag Manager Container ID without "GTM-", e.g. "XYZ123".
 * @param {string} p - Name of GTM container ID URL Parameter, e.g. "st".
 * @param {string} l - Name of the GTM dataLayer, usually: "dataLayer".
 * @param {object} o - Object with further GTM settings like environment string, GTM URL, and GTM code.
 * Usage: aGTM.f.gtm_load(window, document, 'XYZ123', 'dataLayer', {gtm_auth: 'abc123', gtm_preview: 'env-1', gtm_cookies_win: 'x'});
 */
aGTM.f.gtm_load = function (w, d, i, p, l, o) {
  if (!aGTM.d.config) { aGTM.f.log("e7", null); return; }
  if (typeof aGTM.d.gtmLoaded != 'object') aGTM.d.gtmLoaded = [];
  // Push Start element in DL
  if (aGTM.d.gtmLoaded.length<1) {
    window[aGTM.c.gdl].push(aGTM.f.aGTM_event('aGTM_ready'));
    if (i) window[aGTM.c.gdl].push({ event: "gtm.js", "gtm.start": new Date().getTime() });
    if (aGTM.c.vPageview) window[aGTM.c.gdl].push({ event: "vPageview", aGTMts: new Date().getTime() });
  }
  // Fire aGTM Consent event
  aGTM.d.consentEvent_fired = typeof aGTM.d.consentEvent_fired == 'boolean' ? aGTM.d.consentEvent_fired : false;
  if (
    aGTM.c.sendConsentEvent &&
    !aGTM.d.consentEvent_fired &&
    typeof aGTM.d.consent == "object" &&
    aGTM.d.consent.hasResponse
  ) {
    window[aGTM.c.gdl].push(aGTM.f.aGTM_event('aGTM_consent'));
    aGTM.d.consentEvent_fired = true;
  }
  // Return if no container id
  if (!i) return;
  // Set default for GTM ID Parameter
  if (!p) p = 'id';
  // Debug Mode
  var gtm_debug = false;
  // Check Debug Cookie
  var dc = aGTM.f.gc("aGTMdebug");
  if (dc && parseInt(dc) > 0) gtm_debug = true;
  // Get Debug param
  if (!gtm_debug) {
    var url = new URL(document.location.href);
    //if (url.searchParams.get("gtm_debug")) gtm_debug = true;
    if (aGTM.f.urlParam("gtm_debug",url)) gtm_debug = true;
  }
  // Get debug referrer
  if (!gtm_debug && document.referrer) {
    var url = new URL(document.referrer);
    if (url.hostname == aGTM.n.ta + ".com") gtm_debug = true;
  }
  // Set debug cookie
  if (!dc && gtm_debug) aGTM.f.sc("aGTMdebug", "1");
  // Create a new DOM node (tag) of type "script"
  var scriptTag = d.createElement("script");
  scriptTag.id = "aGTM_tm_" + i;
  scriptTag.async = true;
  if (typeof aGTM.c.gtmAttr == "object") {
    for (var k in aGTM.c.gtmAttr) {
      scriptTag.setAttribute(k, aGTM.c.gtmAttr[k]);
    }
  }
  if (aGTM.c.nonce) scriptTag.nonce = aGTM.c.nonce;
  // Set the script content directly if GTM code is provided
  if (o.gtmJS && !gtm_debug) {
    scriptTag.innerHTML = atob(o.gtmJS);
  } else {
    // Construct the GTM script URL
    var gtmUrl = o.gtmURL || "https://www." + aGTM.n.tm + ".com/gtm.js";
    var envParam = o.env || "";
    scriptTag.src = gtmUrl + "?" + p + "=" + i + "&l=" + l + envParam;
  }
  // Insert the GTM script tag into the document
  var firstScriptTag = d.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(scriptTag, firstScriptTag);
  // Add the GTM Container ID to control object
  aGTM.d.gtmLoaded.push(i ? i : 'no_gtm_id');
};

/**
 * Executes actions when the DOM is fully loaded and ready.
 * It fires a custom event if dlStateEvents is true.
 * @property {function} aGTM.f.domready
 * Usage: aGTM.f.domready();
 */
aGTM.f.domready = function (evob) {
  var is_intern = false;
  if (!aGTM.f.vOb(evob)) {
    evob = {};
    is_intern = true;
  }
  if (!evob.event) evob.event = "vDOMready";
  // Ensure the function runs only once
  if (!aGTM.d.dom_ready || !is_intern) {
    // Fire a custom event if dlStateEvents is enabled
    if (aGTM.c.dlStateEvents || !is_intern) aGTM.f.fire(evob);
    // Mark DOM as ready to prevent future executions
    if (is_intern) aGTM.d.dom_ready = true;
  }
};

/**
 * Executes actions when the entire page, including all dependent resources, is fully loaded.
 * It fires a custom event if dlStateEvents is true.
 * @property {function} aGTM.f.pageready
 * Usage: aGTM.f.pageready();
 */
aGTM.f.pageready = function (evob) {
  var is_intern = false;
  if (!aGTM.f.vOb(evob)) {
    evob = {};
    is_intern = true;
  }
  if (!evob.event) evob.event = "vPAGEready";
  // Ensure the function runs only once
  if (!aGTM.d.page_ready || !is_intern) {
    // Fire a custom event if dlStateEvents is enabled
    if (aGTM.c.dlStateEvents || !is_intern) aGTM.f.fire(evob);
    // Mark page as ready to prevent future executions
    if (is_intern) aGTM.d.page_ready = true;
  }
};

/***** Injection *****/

/**
 * Initializes GTM with the given consent status and configuration.
 * @property {function} aGTM.f.initGTM
 * @param {boolean} noConsentGTM - Loads only GTM container where the setting "noConsent" is true.
 * Usage: aGTM.f.initGTM(false);
 */
aGTM.f.initGTM = function (noConsentGTM) {
  if (typeof aGTM.c.gtm != 'object' || !aGTM.c.gtm) return;
  var count = 0;
  for (var containerId in aGTM.c.gtm) {
    count++;
    if (aGTM.c.gtm.hasOwnProperty(containerId)) {
      if (typeof aGTM.c.gtm[containerId].hasLoaded != 'boolean') aGTM.c.gtm[containerId].hasLoaded = false;
      if (!aGTM.c.gtm[containerId].hasLoaded && (!noConsentGTM || aGTM.c.gtm[containerId].noConsent)) {
        aGTM.f.gtm_load(
          window,
          document,
          containerId,
          aGTM.c.gtm[containerId].idParam ? aGTM.c.gtm[containerId].idParam : '',
          aGTM.c.gdl,
          aGTM.c.gtm[containerId]
        );
        aGTM.c.gtm[containerId].hasLoaded = true;
      }
    }
  }
  if (!count) {
    aGTM.f.gtm_load(
      window,
      document,
      '',
      aGTM.c.gtm[containerId].idParam ? aGTM.c.gtm[containerId].idParam : '',
      aGTM.c.gdl,
      null
    );
  }
};

/**
 * Checks the document's and page ready state and calls the domready and pageready functions accordingly.
 * If the document is already loaded, it triggers the functions immediately;
 * otherwise, it sets up listeners for the DOMContentLoaded and PAGEready and load events.
 * @property {function} aGTM.f.chkDPready
 * Usage: aGTM.f.chkDPready();
 */
aGTM.f.chkDPready = function () {
  var state = document.readyState;
  // Check if DOM is ready
  if (state === "interactive" || state === "complete") {
    aGTM.f.domready(null);
  } else {
    aGTM.f.evLstn(document, "DOMContentLoaded", aGTM.f.domready);
  }
  // Check if Page is fully loaded
  if (state === "complete") {
    aGTM.f.pageready(null);
  } else {
    aGTM.f.evLstn(window, "load", aGTM.f.pageready);
  }
};

/**
 * Injects GTM scripts based on consent.
 * @property {function} aGTM.f.inject
 * Usage: aGTM.f.inject();
 */
aGTM.f.inject = function () {
  // Ensure configuration is loaded before proceeding
  if (!aGTM.d.config) {
    aGTM.f.log("e8", null);
    return false;
  }
  // Check if consent object exists and has a valid response
  if (
    typeof aGTM.d.consent != "object" ||
    typeof aGTM.d.consent.hasResponse != "boolean" ||
    !aGTM.d.consent.hasResponse
  ) {
    aGTM.f.log("e13", null);
    return false;
  }
  // Proceed only if not already initialized
  if (!aGTM.d.init) {
    // Temporary store and process dataLayer items
    var dl = window[aGTM.c.gdl] || [];
    dl.forEach(function (ev, index) {
      if (!ev.aGTMchk) {
        ev.aGTMdl = true;
        var evClone = JSON.parse(JSON.stringify(ev));
        if (typeof evClone["gtm.uniqueEventId"] != "undefined")
          delete evClone["gtm.uniqueEventId"];
        aGTM.d.f.push(evClone);
      }
    });
    // Initialize GTM if enabled and consent given
    if (aGTM.d.consent.gtmConsent) {
      aGTM.f.initGTM(false);
      aGTM.d.init = true;
    }
    // Check DOM ready state and call corresponding functions
    if (aGTM.d.init) aGTM.f.chkDPready();
  }
  // Call inject callback if defined and return
  if (typeof aGTM.f.inject_callback == "function") aGTM.f.inject_callback();
  aGTM.f.log("m6", null);
  return true;
};

/***** iFrame Support *****/

/**
 * Sends an event from the iframe to the parent window.
 * @param {Object} ev - The event object to send, containing event details.
 */
aGTM.f.iFrameFire = function (ev) {
  if (typeof ev != "object" || !ev) return;
  if (
    aGTM.d.is_iframe &&
    typeof ev.event == "string" &&
    /^(aGTM|gtm\.|vDOMready|vPAGEready)/.test(ev.event)
  ) {
    window[aGTM.c.gdl].push(ev);
    return;
  }
  ev.aGTM_source = "iFrame " + document.location.hostname;
  aGTM.d.iframe.counter.events++;
  ev.ifEvCtr = aGTM.d.iframe.counter.events;
  if (typeof ev.event == "string" && ev.event) {
    aGTM.d.iframe.counter[ev.event] = aGTM.d.iframe.counter[ev.event] || 0;
    aGTM.d.iframe.counter[ev.event]++;
    ev["ifEvCtr_" + ev.event] = aGTM.d.iframe.counter[ev.event];
  }
  if (ev.aGTMts) delete ev.aGTMts;
  if (ev.aGTMparams) delete ev.aGTMparams;
  if (aGTM.d.iframe.origin) {
    window.top.postMessage(ev, aGTM.d.iframe.origin);
  } else {
    aGTM.d.f.queue.push(ev);
  }
};

/**
 * Sends a handshake message to all iframes on the page if the current window is not an iframe and no origin is defined.
 */
aGTM.f.ifHandshake = function () {
  // Führe die Operation nur aus, wenn dies nicht ein iFrame ist und der Handshake noch nicht erfolgt ist.
  if (!aGTM.d.is_iframe && !aGTM.d.iframe.handshake) {
    var iframes = document.getElementsByTagName("iframe");
    // Verwende eine frühzeitige Rückkehr, um eine zusätzliche Verschachtelung zu vermeiden
    if (!iframes.length) return;
    // Schleife durch alle iFrames und sende die Handshake-Nachricht
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      if (!iframe || !iframe.contentWindow || !iframe.contentWindow.postMessage)
        continue;
      iframe.contentWindow.postMessage("aGTM_Top2iFrame Handshake", "*");
    }
    // Markiere, dass der Handshake-Versuch unternommen wurde
    aGTM.d.iframe.handshake = true;
  }
};

/**
 * Event Listener Function - Handles messages from the top window, setting the origin for secure communication and sends the queue.
 * @param {MessageEvent} e - The message event object received.
 */
aGTM.f.ifHSlisten = function (e) {
  if (
    aGTM.d.is_iframe &&
    typeof e.data == "string" &&
    e.data == "aGTM_Top2iFrame Handshake"
  ) {
    aGTM.d.iframe.origin = e.origin;
    aGTM.d.iframe.ifListen = false;
    window.removeEventListener("message", aGTM.f.ifHSlisten, false);
    while (aGTM.d.f.length) {
      var ev = aGTM.d.f.shift();
      aGTM.f.iFrameFire(ev);
    }
  }
};

/***** Helper Functions *****/

/**
 * Function to check if a variable is an object and nut null
 * @property {function} aGTM.f.vOb
 * @param {*} i - The input to be checked.
 * @returns {boolean} - Returns true if the input is an object and not null, false otherwise.
 * Usage: if (!aGTM.f.vOb(null)) return;
 */
aGTM.f.vOb = function (i) {
  return typeof i === "object" && i !== null;
};

/**
 * Checks if the input is a non-empty string or all elements in an array are non-empty strings.
 * @property {function} aGTM.f.vSt
 * @param {string|Array} input - The input to be checked, which can be a string or an array of strings.
 * @returns {boolean} - Returns true if the input is a non-empty string or if all elements in an array are non-empty strings; returns false otherwise.
 * Usage: if (!aGTM.f.vSt(['Mia',''])) return;
 */
aGTM.f.vSt = function (input) {
  // Convert the input to an array if it's a string, or use an empty array if it's neither
  var inputArray = Array.isArray(input)
    ? input
    : typeof input == "string"
      ? [input]
      : [];
  // Return false immediately if the array is empty
  if (inputArray.length === 0) return false;
  // Check every element in the array to ensure it's a non-empty string
  return inputArray.every(function (element) {
    return typeof element == "string" && element !== "";
  });
};

/**
 * Adds an event listener to a specified DOM element.
 * @property {function} aGTM.f.evLstn
 * @param {object|string} el - The DOM object to which you want to add the event listener, or a string 'window'/'document'.
 * @param {string} ev - The name of the event, e.g., 'mousedown'.
 * @param {function} fct - The function to execute when the event is triggered.
 * Usage: aGTM.f.evLstn(document.querySelector('div.button'), 'mousedown', click_fct);
 */
aGTM.f.evLstn = function (el, ev, fct) {
  // If 'el' is 'window' or 'document' string, convert it to the actual object
  if (el === "window") el = window;
  if (el === "document") el = document;
  // Validate input parameters
  if (
    typeof el != "object" ||
    !el ||
    typeof ev != "string" ||
    typeof fct != "function"
  ) {
    aGTM.f.log("e11", { el: el, ev: ev, fct: fct });
    return;
  }
  // Try to add the event listener
  try {
    if (ev == "message") {
      if (!aGTM.d.iframe.topListen && !aGTM.d.is_iframe) {
        aGTM.d.iframe.topListen = true;
        el.addEventListener(ev, function (e) {
          fct(
            typeof e.data != "undefined" ? e.data : null,
            typeof e.origin == "string" ? e.origin : "",
          );
        });
      }
    } else {
      el.addEventListener(ev, fct);
    }
  } catch (e) {
    // Log if there is an error adding the event listener
    aGTM.f.log("e12", { error: e, el: el, ev: ev, fct: fct });
  }
};

/**
 * Adds an event listener to a specified DOM element.
 * @property {function} aGTM.f.rmLstn
 * @param {object|string} el - The DOM object to which you want to add the event listener, or a string 'window'/'document'.
 * @param {string} ev - The name of the event, e.g., 'mousedown'.
 * @param {function} fct - The function to execute when the event is triggered.
 * Usage: aGTM.f.rmLstn(document.querySelector('div.button'), 'mousedown', click_fct);
 */
aGTM.f.rmLstn = function (el, ev, fct) {
  // If 'el' is 'window' or 'document' string, convert it to the actual object
  if (el === "window") el = window;
  if (el === "document") el = document;
  // Try to remove the event listener
  try {
    el.removeEventListener(ev, fct);
  } catch (e) {
    // Log if there is an error removing the event listener
    //aGTM.f.log('e12', {error: e, el: el, ev: ev, fct: fct});
  }
};

/**
 * Retrieves a specific attribute value from window, document, or body.
 * @property {function} aGTM.f.getVal
 * @param {string} o - A single character representing the DOM object ('w' for window, 'n' for navigator, 'd' for document, 'h' for head, 'b' for body, 's' for scroll top, 'm' for window.screen (monitor)).
 * @param {string} v - The name of the attribute to retrieve.
 * @returns {string|number|boolean|object|undefined} - The value of the requested attribute, or undefined if not found or invalid.
 * Usage: aGTM.f.getVal('w', 'location');
 */
aGTM.f.getVal = function (o, v) {
  if (!aGTM.f.vSt([o, v]) || !v.match(/[a-z]+/i)) return undefined;
  if (o == "p" && (typeof performance != "object" || !performance))
    return undefined;
  switch (o) {
    case "w":
      return aGTM.f.vOb(window[v])
        ? JSON.parse(JSON.stringify(window[v]))
        : window[v];
    case "n":
      return aGTM.f.vOb(navigator[v])
        ? JSON.parse(JSON.stringify(navigator[v]))
        : navigator[v];
    case "d":
      return document[v];
    case "l":
      return document.location[v];
    case "h":
      return document.head[v];
    case "b":
      return document.body[v];
    case "s":
      return document.getElementsByTagName("html")[0].scrollTop || 0;
    case "m":
      return window.screen[v];
    case "c":
      if (window.google_tag_data && window.google_tag_data.ics) {
        return JSON.parse(JSON.stringify(window.google_tag_data.ics));
      } else {
        return null;
      }
    case "p":
      return v == "now" ? performance.now() : performance[v];
    default:
      return undefined;
  }
};

/**
 * Retrieves a specific attribute value from a DOM element.
 * @property {function} aGTM.f.getNodeAttr
 * @param {string} s - The selector (for use with querySelector).
 * @param {string} a - The name of the attribute to retrieve.
 * @returns {string|null} - The value of the requested attribute, or null if not found.
 * Usage Example (getting a Canonical Tag URL): aGTM.f.getNodeAttr('link[rel="canonical"]', 'href');
 */
aGTM.f.getNodeAttr = function (s, a) {
  var r = document.querySelector(s);
  return r ? r.getAttribute(a) : null;
};

/**
 * Creates a DOM node (HTML element) in the document DOM.
 * @property {function} aGTM.f.newNode
 * @param {string} t - The Node type, e.g. "div".
 * @param {string} p - The parent Node to attach the new element, e.g. "head".
 * @param {object} o - An object with the Node attributes, e.g.: { id:'my_node_42', class:'my_class' }
 * Usage Example (creating a Canonical Tag URL): aGTM.f.newNode('link','head',{ rel:'canonical', href:'https://www.MySite.com/CurrentPage' });
 */
aGTM.f.newNode = function (t, p, o) {
  if (!aGTM.f.vSt([t, p]) || typeof o != "object") return;
  var n = document.createElement(t);
  var parent = document.querySelector(p);
  if (!parent) return;
  for (var k in o) {
    if (o.hasOwnProperty(k)) {
      var parts = k.split(".");
      if (parts.length === 1) {
        n.setAttribute(k, o[k]);
      } else {
        if (!n[parts[0]]) n[parts[0]] = {};
        n[parts[0]][parts[1]] = o[k];
      }
    }
  }
  parent.appendChild(n);
};

/**
 * Deletes a DOM node (HTML element) from the document DOM.
 * @property {function} aGTM.f.delNode
 * @param {string} s - The selector (for use with querySelector).
 * Usage Example (deletes a Canonical Tag): aGTM.f.delNode('link[rel="canonical"]');
 */
aGTM.f.delNode = function (s) {
  if (!aGTM.f.vSt(s)) return;
  var n = document.querySelector(s);
  if (!n) return;
  n.parentNode.removeChild(n);
};

/**
 * Counts the words and/or images on a webpage.
 * @property {function} aGTM.f.pageinfo
 * @param {Object} options - The options to specify what to count.
 * @param {boolean} [options.countWords=true] - Whether to count words.
 * @param {boolean} [options.countImages=true] - Whether to count images.
 * @returns {Object} - An object containing the counts of words and/or images.
 */
aGTM.f.pageinfo = function (options) {
  options = options || {};
  var wordCount = 0,
    imageCount = 0;
  if (options.countWords) {
    (function getText(node) {
      if (node.nodeType === 3) {
        wordCount += node.textContent.trim().split(/\s+/).length;
      } else if (
        node.nodeType === 1 &&
        !/^(script|style|noscript)$/i.test(node.tagName)
      ) {
        for (var i = 0; i < node.childNodes.length; i++) {
          getText(node.childNodes[i]);
        }
      }
    })(document.body);
  }
  if (options.countImages) {
    var images = document.getElementsByTagName("img");
    for (var i = 0; i < images.length; i++) {
      if (images[i].naturalWidth > 250 && images[i].naturalHeight > 250) {
        imageCount++;
      }
    }
  }
  return { words: wordCount, images: imageCount };
};

/**
 * Adds an event listener to a specified DOM element for capturing the copy event or any other specified event.
 * @property {function} aGTM.f.cpLst
 * @param {object} o - The DOM element to which the event listener will be added.
 * @param {string} e - The name of the event to listen for, e.g., 'copy'.
 * @param {function} f - The callback function to execute when the event is triggered. It receives the selected text as a parameter.
 * Usage: aGTM.f.cpLst(document.body, 'copy', myFunction);
 */
aGTM.f.cpLst = function (o, e, f) {
  try {
    o.addEventListener(e, function (event) {
      var selectedText = "";
      if (!window.getSelection) return;
      selectedText = window.getSelection().toString();
      if (selectedText) f(selectedText);
    });
  } catch (error) {
    aGTM.f.log("e12", { element: o, error: error });
  }
};

/**
 * Adds an event listener to a specified DOM element and collects detailed information when the event is triggered.
 * @property {function} aGTM.f.elLst
 * @param {object} el - The DOM element to which the event listener will be added.
 * @param {string} ev - The name of the event, e.g., 'mousedown'.
 * @param {function} cb - The callback function to execute when the event is triggered. It receives a detailed event object as a parameter.
 * Usage: aGTM.f.elLst(document.querySelector('a'), 'mousedown', myFunction);
 */
aGTM.f.elLst = function (el, ev, cb) {
  try {
    el.addEventListener(ev, function (event) {
      var tagName = this.tagName.toLowerCase();
      var parentId = "";
      var parentClass = "";
      var parentForm = null;
      var position = null;
      var elementCount = 0;
      var currentElement = this;
      // Collect parent ID and class
      while (currentElement && currentElement.parentElement) {
        currentElement = currentElement.parentElement;
        if (!parentId && currentElement.id)
          parentId =
            (typeof currentElement.nodeName === "string"
              ? currentElement.nodeName.toLowerCase() + ":"
              : "") + currentElement.id;
        if (!parentClass && currentElement.getAttribute("class"))
          parentClass =
            (typeof currentElement.nodeName === "string"
              ? currentElement.nodeName.toLowerCase() + ":"
              : "") + currentElement.getAttribute("class");
      }
      // Collect form-related information if the element is a form field
      if (
        tagName === "input" ||
        tagName === "select" ||
        tagName === "textarea"
      ) {
        currentElement = this;
        while (
          currentElement &&
          currentElement.parentElement &&
          currentElement.tagName.toLowerCase() !== "form"
        ) {
          currentElement = currentElement.parentElement;
        }
        if (currentElement.tagName.toLowerCase() === "form") {
          parentForm = {
            id: currentElement.id,
            class: currentElement.getAttribute("class"),
            name: currentElement.getAttribute("name"),
            action: currentElement.action,
            elements: currentElement.elements.length
          };
          position =
            Array.prototype.indexOf.call(currentElement.elements, this) + 1;
        }
      }
      // Count elements if applicable
      if (
        typeof this.elements == "object" &&
        typeof this.elements.length == "number"
      )
        elementCount = this.elements.length;
      // Construct the event object
      var eventObj = {
        tagName: tagName,
        target: this.target || "",
        parentID: parentId,
        parentClass: parentClass,
        id: this.id || "",
        name: this.getAttribute("name") || "",
        class: this.getAttribute("class") || "",
        href: this.href || "",
        src: this.src || "",
        action: this.action || "",
        type: this.type || "",
        elements: elementCount,
        position: position,
        form: parentForm,
        html: this.outerHTML ? this.outerHTML.toString() : "",
        text: this.outerText ? this.outerText.toString() : ""
      };
      if (eventObj.html.length > 512)
        eventObj.html = eventObj.html.slice(0, 509) + "...";
      if (eventObj.text.length > 512)
        eventObj.text = eventObj.text.slice(0, 509) + "...";
      // Trigger the callback function with the event object
      cb(eventObj);
    });
  } catch (e) {
    aGTM.f.log("e12", { element: el, error: e });
  }
};

/**
 * Adds an event listener to multiple DOM elements selected by a CSS selector.
 * @property {function} aGTM.f.addElLst
 * @param {string} selector - CSS selector for the DOM elements, e.g., 'a.menu'.
 * @param {string} event - The name of the event to listen for, e.g., 'mousedown'.
 * @param {function} callback - The function to execute when the event is triggered.
 * Usage: aGTM.f.addElLst('a', 'mousedown', myClickFunction);
 */
aGTM.f.addElLst = function (selector, event, callback) {
  // Validate inputs
  if (!aGTM.f.vSt([selector, event]) || typeof callback != "function") return;
  // Select nodes based on the provided selector
  var nodes = document.querySelectorAll(selector);
  // Validate the selected nodes
  if (!aGTM.f.vOb(nodes) || nodes.length == 0) return;
  // Iterate over each node and add the appropriate event listener
  nodes.forEach(function (node) {
    switch (event) {
      case "copy": // Special case for 'copy' event
        aGTM.f.cpLst(node, event, callback);
        break;
      default: // Default case for other events
        aGTM.f.elLst(node, event, callback);
    }
  });
};

/**
 * Adds an event listener to elements dynamically added to the DOM that match a specified selector.
 * @property {function} aGTM.f.observer
 * @param {string} selector - The selector for the DOM elements to watch, e.g., 'a'.
 * @param {string} event - The event to listen for, e.g., 'mousedown'.
 * @param {function} callback - The function to execute when the event is triggered.
 * Usage: aGTM.f.observer('a', 'mousedown', myClickFunction);
 */
aGTM.f.observer = function (selector, event, callback) {
  // Validate input parameters
  if (!aGTM.f.vSt([selector, event]) || typeof callback != "function") return;
  // Create a new MutationObserver to watch for changes in the DOM
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      // Check if the mutation type is 'childList' and there are added nodes
      if (mutation.type === "childList" && mutation.addedNodes.length) {
        Array.prototype.forEach.call(mutation.addedNodes, function (node) {
          // If the node is an Element and matches the selector, add the event listener
          if (
            node.nodeType === 1 &&
            typeof node.tagName == "string" &&
            node.tagName.toLowerCase() === selector.toLowerCase()
          ) {
            aGTM.f.elLst(node, event, callback);
          }
          // If the added node has children, check each child node
          if (node.nodeType === 1 && node.querySelectorAll) {
            var matchingElements = node.querySelectorAll(
              selector.toLowerCase(),
            );
            Array.prototype.forEach.call(matchingElements, function (element) {
              aGTM.f.elLst(element, event, callback);
            });
          }
        });
      }
    });
  });
  // Configure the observer to watch for added elements
  var config = { childList: true, subtree: true, attributes: false };
  // Start observing the document body
  observer.observe(document.body, config);
};

/**
 * Tests whether a string matches a given regular expression pattern.
 * @property {function} aGTM.f.rTest
 * @param {string} s - The string to test.
 * @param {string} p - The regex pattern to test against the string.
 * @returns {boolean} - True if the pattern matches the string, false otherwise.
 * Usage: aGTM.f.rTest('cmpUpdateEvent', 'cmp.*Event');
 */
aGTM.f.rTest = function (s, p) {
  return aGTM.f.vSt([s, p]) && new RegExp(p, "i").test(s);
};

/**
 * Matches a string against a regular expression pattern and returns the match results.
 * @property {function} aGTM.f.rMatch
 * @param {string} s - The string to match.
 * @param {string} p - The regex pattern to match against the string.
 * @returns {Array|null} - The match results if successful, null otherwise.
 * Usage: aGTM.f.rMatch('Hello World', 'World');
 */
aGTM.f.rMatch = function (s, p) {
  return s.match(new RegExp(p));
};

/**
 * Replaces parts of a string that match a given pattern with a replacement string.
 * @property {function} aGTM.f.rReplace
 * @param {string} t - The original text to be processed.
 * @param {string|RegExp} p - The pattern to search for, which can be a string or a RegExp.
 * @param {string} r - The replacement text.
 * @returns {string} - The text after replacements have been made.
 * Usage: aGTM.f.rReplace('Hello World', 'World', 'Andi');
 */
aGTM.f.rReplace = function (t, p, r) {
  return aGTM.f.vSt([t, p, r]) ? t.replace(new RegExp(p, "gi"), r) : t;
};

/**
 * Checks if the current web page is loaded inside an iframe.
 * @property {function} aGTM.f.isIFrame
 * @returns {boolean} - True if the page is inside an iframe, false otherwise.
 */
aGTM.f.isIFrame = function () {
  return window.self !== window.top;
};

/**
 * Sets up an error listener to capture JavaScript errors and push them to the GTM dataLayer.
 * @property {function} aGTM.f.jserrors
 * Usage: aGTM.f.jserrors();
 */
aGTM.f.jserrors = function () {
  // Listen for error events on the window object
  aGTM.f.evLstn(window, "error", function (ev) {
    // Ensure the event object is not null
    if (ev !== null) {
      // Construct the error message and the filename
      var msg = typeof ev.message == "string" ? ev.message : "";
      var filename = typeof ev.filename == "string" ? ev.filename : "";
      // Handle "Script error." for CORS issues
      if (msg.toLowerCase() == "script error.") {
        if (!filename) return;
        msg = msg.replace(".", ":") + " error from other domain.";
      }
      // Append filename, line number, and column number to the message
      if (filename) msg += " | file: " + filename;
      var lineno = aGTM.f.strclean(ev.lineno);
      if (lineno == "0") lineno = "";
      if (lineno) msg += " | line: " + lineno;
      var colno = aGTM.f.strclean(ev.colno);
      if (colno == "0") colno = "";
      if (colno) msg += " | col: " + colno;
      // Push the error message to the internal error log
      aGTM.d.errors.push(msg);
      // Collect browser information
      var browser = "";
      try {
        browser =
          navigator.appCodeName +
          " | " +
          navigator.appName +
          " | " +
          navigator.appVersion +
          " | " +
          navigator.platform;
      } catch (e) {}
      // Limit the number of errors sent to avoid overwhelming the dataLayer
      if (aGTM.d.error_counter++ >= 100) return;
      if (aGTM.d.error_counter <= 5)
        aGTM.f.fire({
          event: "exception",
          errmsg: msg,
          browser: browser,
          errtype: "JS Error",
          timestamp: new Date().getTime(),
          errct: aGTM.d.error_counter,
          eventModel: null
        }); // Push the error information to the GTM dataLayer
    }
    //return;
  });
};

/**
 * Triggers timed events based on the provided configuration object.
 * @property {function} aGTM.f.timerfkt
 * @param {object} obj - Configuration object for the timed event.
 *   Expected object properties:
 *   - timer_ms: Interval in milliseconds for the timer.
 *   - timer_ct: The current count of the timer.
 *   - event: (optional) The name of the event to trigger. Can include '[s]' to be replaced by timer seconds.
 * Usage: aGTM.f.timerfkt({ timer_ms: 1000, timer_ct: 1, event: 'timerEvent[s]' });
 */
aGTM.f.timerfkt = function (obj) {
  var ev = JSON.parse(JSON.stringify(obj)); // Create a deep copy of the event object to prevent mutating the original object
  ev.timer_ms = ev.timer_ms * 1; // Ensure timer_ms is a number
  ev.timer_ct++; // Increment the timer count
  ev.timer_tm = ev.timer_ms * ev.timer_ct; // Calculate the total time in milliseconds
  ev.timer_sc = parseFloat((ev.timer_tm / 1000).toFixed(3)); // Convert total time to seconds, formatted to three decimal places
  ev.event = ev.event || "timer"; // Set a default event name if not provided
  if (ev.event.indexOf("[s]") !== -1)
    ev.event = ev.event.replace("[s]", ev.timer_sc.toString()); // Replace '[s]' in the event name with the total seconds
  ev.eventModel = null; // Initialize eventModel properties
  aGTM.f.fire(ev); // Trigger the event with the updated properties
};

/**
 * Sets a timer to execute a function or trigger an event after a specified time interval.
 * @property {function} aGTM.f.timer
 * @param {string} nm - The name of the timer for debugging purposes. If not provided, it will be auto-generated.
 * @param {function} ft - The function to execute when the timer expires. Defaults to aGTM.f.timerfkt if not provided.
 * @param {object} ev - The event object to pass to the timer function. Can be omitted if not needed.
 * @param {number} ms - The time in milliseconds after which the function or event should be triggered.
 * @param {boolean} rp - How many times the timer should fire. Use 0 for unlimited repetitions.
 * Usage: aGTM.f.timer('myTimer', myFunction, { event: 'myEvent' }, 15000, 3);
 */
aGTM.f.timer = function (nm, ft, ev, ms, rp) {
  if (!nm && typeof ev == "object" && typeof ev.event == "string")
    nm = ev.event;
  nm = nm || "timer";
  nm +=
    "_" +
    new Date().getTime().toString() +
    "_" +
    Math.floor(Math.random() * 999999 + 1).toString();
  // Check if the timer already exists and stop/delete it if it does
  aGTM.f.stoptimer(nm);
  // Initialize the timer object
  var obj = typeof ev == "object" ? JSON.parse(JSON.stringify(ev)) : {};
  obj.timer_nm = nm;
  obj.timer_ms = ms;
  obj.timer_rp = rp;
  obj.timer_ct = 0;
  // Set the timer
  obj.id =
    obj.timer_rp === 1
      ? setTimeout(function () {
          if (ft) {
            ft(obj);
          } else {
            aGTM.f.timerfkt(obj);
          }
        }, ms)
      : setInterval(function () {
          if (ft) {
            ft(obj);
          } else {
            aGTM.f.timerfkt(obj);
          }
          obj.timer_ct++;
          if (obj.timer_rp > 0 && obj.timer_ct >= obj.timer_rp)
            aGTM.f.stoptimer(obj.timer_nm);
        }, ms);
  aGTM.d.timer[nm] = obj;
};

/**
 * Stops and deletes a timer.
 * @property {function} aGTM.f.stoptimer
 * @param {string} nm - The name of the timer to stop and delete.
 * Usage: aGTM.f.stoptimer('myTimer');
 */
aGTM.f.stoptimer = function (nm) {
  if (typeof aGTM.d.timer != "object") aGTM.d.timer = {};
  if (typeof aGTM.d.timer[nm] == "object") {
    var t = aGTM.d.timer[nm];
    if (t.timer_rp) {
      clearInterval(t.id);
    } else {
      clearTimeout(t.id);
    }
    delete aGTM.d.timer[nm];
  }
};

/***** Init and Fire Functions *****/

/**
 * Function for to initialize and inject the aGTM
 * @property {function} aGTM.f.init
 * Usage: aGTM.f.init();
 */
aGTM.f.init = function () {
  // Return (and do nothing) if there is a cookie with the name 'aGTMoptout' (and a value)
  if (!aGTM.c.debug && aGTM.f.optout()) return;
  // Read and set the config
  aGTM.f.config(aGTM.c);
  // Inject the aGTM for iFrame
  if (aGTM.c.iframeSupport && aGTM.d.is_iframe) {
    aGTM.d.consent.gtmConsent = true;
    aGTM.d.consent.hasResponse = true;
    aGTM.d.consent.feedback = "Page is iFrame";
    if (!aGTM.d.iframe.ifListen) {
      aGTM.d.iframe.ifListen = true;
      window.addEventListener("message", aGTM.f.ifHSlisten);
    }
    if (!aGTM.d.init) aGTM.f.inject();
  // Inject aGTM for (non-iFrame) Pages
  } else {
    // Check consent check
    if (typeof aGTM.c.cmp == 'string' && aGTM.c.cmp) {
      // Insert GTM, if no Consent Check is required
      if (aGTM.c.cmp == 'none') {
        aGTM.d.consent = { gtmConsent: true, hasResponse: true, feedback: "No Consent Check configured" };
        aGTM.f.inject();
      // Otherwise load Consent Check
      } else {
        aGTM.f.load_cc(aGTM.c.cmp, aGTM.f.consent_listener);
        aGTM.f.initGTM(true);
      }
    // Use Consent Listener, if no Consent Check was specified
    } else {
      aGTM.f.consent_listener();
      aGTM.f.initGTM(true);
    }
  }
  // Run JS error monitoring
  aGTM.f.jserrors();
};

/**
 * Pushes an event object to the GTM dataLayer with additional logic for consent and error checking.
 * @property {function} aGTM.f.fire
 * @param {object} o - The event object to be pushed to the dataLayer.
 * Usage: aGTM.f.fire({ event: 'pageview', pagetype: 'blogarticle' });
 */
aGTM.f.fire = function (o) {
  // Ensure the event object is valid
  if (typeof o !== "object") {
    aGTM.f.log("e9", { o: typeof o });
    return;
  }
  // Create a deep copy of the event object
  var obj = JSON.parse(JSON.stringify(o));
  if (
    typeof obj.aGTMts == "number" ||
    (typeof obj.eventModel == "object" && obj.eventModel)
  )
    return;
  if (
    typeof obj.event != "string" &&
    typeof obj.type == "string" &&
    typeof obj.flags == "object" &&
    typeof obj.flags.enableUntaggedPageReporting == "boolean" &&
    obj.flags.enableUntaggedPageReporting
  )
    return;
  obj.aGTMts = Date.now();
  obj.eventModel = null;
  // Check for consent update events
  if (
    aGTM.c.consent_events &&
    typeof obj.event == "string" &&
    aGTM.c.consent_events.indexOf("," + obj.event + ",") >= 0
  ) {
    if (typeof aGTM.c.consent_event_attr[obj.event] == "object") {
      for (var k in aGTM.c.consent_event_attr[obj.event]) {
        if (typeof obj[k] != "undefined") {
          if (
            !aGTM.c.consent_event_attr[obj.event][k] ||
            obj[k] == aGTM.c.consent_event_attr[obj.event][k]
          )
            aGTM.f.run_cc("update");
        }
      }
    } else {
      aGTM.f.run_cc("update");
    }
  }
  // Get Standard DL variables
  if (
    aGTM.c.dlSet &&
    typeof google_tag_manager == "object" &&
    typeof google_tag_manager[aGTM.c.gtmID] == "object"
  ) {
    Object.keys(aGTM.c.dlSet).forEach(function (key) {
      var dlkey = aGTM.c.dlSet[key];
      var dlvar = google_tag_manager[aGTM.c.gtmID][aGTM.c.gdl].get(dlkey);
      if (typeof dlvar != "undefined") obj[key] = dlvar;
    });
  }
  // Delay event if no consent is available
  if (
    ((typeof aGTM.d.consent != "object" ||
      !aGTM.d.consent.hasResponse ||
      !aGTM.d.consent.gtmConsent) &&
      (typeof obj.event != "string" || obj.event.indexOf("aGTM") !== 0)) ||
    (aGTM.c.iframeSupport && aGTM.d.is_iframe && !aGTM.d.iframe.origin)
  ) {
    delete obj.aGTMts;
    delete obj.eventModel;
    aGTM.d.f.push(JSON.parse(JSON.stringify(obj)));
    return;
  }
  // Push event to GTM if enabled and consented
  if (
    aGTM.d.consent.gtmConsent ||
    (typeof obj.event == "string" && obj.event.indexOf("aGTM") === 0)
  ) {
    //var gtmobj = JSON.parse(JSON.stringify(obj));
    if (typeof obj.event != "string" || obj.event.indexOf("aGTM") !== 0) {
      delete obj["gtm.uniqueEventId"];
      delete obj.aGTMparams;
      obj.aGTMparams = JSON.parse(JSON.stringify(obj));
    }
    aGTM.d.dl.push(obj);
    if (
      aGTM.c.iframeSupport &&
      aGTM.d.is_iframe &&
      typeof obj.event == "string"
    ) {
      aGTM.f.iFrameFire(obj);
    } else {
      window[aGTM.c.gdl].push(obj);
    }
  }
  // Execute the callback function if defined and initialized
  if (typeof aGTM.f.fire_callback == "function" && aGTM.d.init)
    aGTM.f.fire_callback(obj);
  aGTM.f.log("m7", obj);
};

// Initialization --> Delete the following line for One-File-Usage and read the instructions below
aGTM.f.init();



/***
 * Use this place for One-File-Usage.
 * Important: First delete the line "aGTM.f.init();" above !!!
 * Insert the consent_check function here, after that the config function call with your configuration and after that the init call.
 * Here an example with Cookiebot and a minimal configuration:

aGTM.f.consent_check=function(t){if("string"!=typeof t||"init"!=t&&"update"!=t)return"function"==typeof aGTM.f.log&&aGTM.f.log("e10",{action:t}),!1;if(aGTM.d.consent=aGTM.d.consent||{},"init"==t&&aGTM.d.consent.hasResponse)return!0;if("object"!=typeof Cookiebot)return!1;var n=Cookiebot;if("boolean"!=typeof n.hasResponse||"object"!=typeof n.consent)return!1;if(!n.hasResponse)return!1;var e=aGTM.c.purposes?aGTM.c.purposes.split(","):[],o=0,r=0;for(k in n.consent)"stamp"!=k&&"method"!=k&&"boolean"==typeof n.consent[k]&&(r++,n.consent[k]&&(o++,e.push(k)));aGTM.d.consent.purposes=e.length>0?","+e.join(",")+",":"";var s="Consent available";return 0==r?s="No purposes available":o<=r?s="Consent (partially or full) declined":o>r&&(s="Consent accepted"),aGTM.d.consent.feedback=s,"string"==typeof n.consentID&&(aGTM.d.consent.consent_id=n.consentID),aGTM.d.consent.hasResponse=!0,"function"==typeof aGTM.f.log&&aGTM.f.log("m2",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};

aGTM.f.config({
   gtm: { 'GTM-XYZ123': {} }
  ,gtmPurposes: 'statistics'
});

aGTM.f.init();

 * End of example for One-File-Usage.
***/



/*** aGTM.js | EOF ***/