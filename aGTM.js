/*** aGTM.js | BOF ***/

/**
 * Global implementation script/object for Google GTAG and Tag Manager, depending on the user consent.
 * @version 1.5
 * @lastupdate 15.07.2026 by Andi Petzoldt <andi@petzoldt.net>
 * @repository https://github.com/Andiministrator/aGTM/
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @documentation see README.md or https://github.com/Andiministrator/aGTM/
 */

/***** Initialization and Configuration *****/

// Initialize the main object if it doesn't exist
window.aGTM = window.aGTM || {};
window.aGTM.c = window.aGTM.c || {};
window.aGTM.d = window.aGTM.d || {};
window.aGTM.f = window.aGTM.f || {};
window.aGTM.l = window.aGTM.l || [];
window.aGTM.n = window.aGTM.n || {};

// Function to set properties within the aGTM object with default values
aGTM.f.propset = function (obj, prop, defaultValue) {
  try { obj[prop] = obj[prop] || defaultValue; }
  catch (e) {
    //console.warn('aGTM (aGTM.f.propset): Cannot create variable '+prop+'. Object Type: '+typeof obj+', Value:', defaultValue);
  }
};

// Function to initiate the basic aGTM container
aGTM.f.objinit = function() {
  var props = [
    [aGTM.d, "version", "1.5"],
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
    [aGTM.d, "session", {}],
    [aGTM.d, "session_status", ""],
    [aGTM.d, "consent_hash", ""],
    [aGTM.d, "last_consent_hash", ""],
    [aGTM.d, "attribution", {}],
    [aGTM.d, "iframe", {
      counter: { events: 0 },
      origin: "",
      ifListen: false,
      topListen: false,
      handshake: false,
      timer: null
    }],
    [aGTM.d, "last_url", location.href],
    [aGTM.d, "urlListener_active", false],
    [aGTM.d, "passive_supported", null],
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
  var clonedObj = typeof obj === "object" && obj ? JSON.parse(JSON.stringify(obj)) : obj;
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
 * Function for safe JSON.stringify
 * @property {function} aGTM.f.sStrf
 * @param {object} obj - object to stringify
 * @returns {string} - cleaned stringified object
 * Usage: aGTM.f.sStrf(obj);
 */
aGTM.f.sStrf = function (obj) {
  if (typeof obj!='object' || !obj) {
    var o = JSON.stringify({ event: 'exception', errmsg: 'DataLayer Entry is no object', errtype: "DL Error", obj_type: typeof obj, obj_value: obj });
    aGTM.f.log("e16", JSON.parse(o));
    return JSON.stringify(null);
  }
  var seen = [];
  return JSON.stringify(obj, function(key, value) {
    if (typeof value === "object" && value !== null) {
      if (seen.indexOf(value) !== -1) {
        return "[Circular]";
      }
      seen.push(value);
    }
    return value;
  });
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
 * Stable string serialization of a consent object, used to detect change.
 * Blacklist strategy: hash everything EXCEPT client-derived fields
 * (gtmConsent, blocked). Auto-includes any new CMP-specific field
 * (consent_id, serviceIDs, ...).
 * @property {function} aGTM.f.consent_serialize
 * @param {object} c - consent object (typically aGTM.d.consent)
 * @returns {string} - stable serialized form
 */
aGTM.f.consent_serialize = function (c) {
  if (!c || typeof c !== "object") return "";
  var skip = { gtmConsent: 1, blocked: 1 };
  var keys = [];
  for (var k in c) { if (c.hasOwnProperty(k) && !skip[k]) keys.push(k); }
  keys.sort();
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], v = c[key];
    // Skip empty strings, null and undefined — these are semantically "absent"
    // and would otherwise create phantom diffs whenever the B2 reset clears a
    // field that the preset never contained.
    if (v === "" || v == null) continue;
    out.push(key + "=" + (typeof v === "object" ? JSON.stringify(v) : String(v)));
  }
  return out.join("|");
};

/**
 * Parses a URL query string into a flat object. Empty input or input that
 * does not start with '?' returns {}. Values are URL-decoded; '+' is decoded
 * to space (form-encoding convention).
 * @property {function} aGTM.f.parseUrlParams
 * @param {string} qs - Query string including the leading '?', e.g. location.search
 * @returns {object} - Map of param name → decoded value (string)
 */
aGTM.f.parseUrlParams = function (qs) {
  var out = {};
  if (!qs || qs.charAt(0) !== "?") return out;
  var pairs = qs.substring(1).split("&");
  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i].split("=");
    if (!p[0]) continue;
    var key, val;
    try { key = decodeURIComponent(p[0]); } catch (e) { key = p[0]; }
    if (p[1]) {
      var raw = p[1].replace(/\+/g, " ");
      try { val = decodeURIComponent(raw); } catch (e) { val = raw; }
    } else {
      val = "";
    }
    out[key] = val;
  }
  return out;
};

/**
 * Resolves attribution for a single method via HYBRID merge: the current page's
 * URL/referrer wins for browser-derivable fields (sou/cam/med/camid/cli/clp/cls/sre);
 * the API-delivered attribution from aGTM.d.session.attribution[method] fills in
 * cross-session-memory fields (afs/lcs/fss) and serves as fallback when the URL
 * is empty. See internal/api/integration-guide.md §7 for the rationale.
 * @property {function} aGTM.f.resolveAttribution
 * @param {string} method - Attribution method key (e.g. 'last_touch')
 * @returns {object} - 11-field attribution object (all string values)
 */
aGTM.f.resolveAttribution = function (method) {
  var urlParams = aGTM.f.parseUrlParams(window.location.search);
  var apiKeyed  = (aGTM.d.session && aGTM.d.session.attribution) || {};
  // Defensive: a method named after Object.prototype member ('constructor',
  // '__proto__', 'hasOwnProperty', …) would otherwise return a non-data value.
  var apiAttrib = apiKeyed[method];
  if (!apiAttrib || typeof apiAttrib !== "object") apiAttrib = {};
  // Ordered list (ES5 for..in order is implementation-defined for string keys);
  // first match wins on collision (e.g. ?gclid=…&fbclid=… → gclid).
  var clickIdParams = ["gclid", "fbclid", "msclkid", "ttclid", "gbraid", "wbraid"];
  var clickIdLabels = {
    gclid:   "Google Ads",
    fbclid:  "Meta",
    msclkid: "Microsoft Ads",
    ttclid:  "TikTok Ads",
    gbraid:  "Google Ads",
    wbraid:  "Google Ads"
  };
  var detectedClp = "";
  var detectedCli = "";
  for (var i = 0; i < clickIdParams.length; i++) {
    var n = clickIdParams[i];
    if (urlParams[n]) { detectedClp = n; detectedCli = urlParams[n]; break; }
  }
  return {
    sou:   urlParams.utm_source   || apiAttrib.sou   || "",
    cam:   urlParams.utm_campaign || apiAttrib.cam   || "",
    med:   urlParams.utm_medium   || apiAttrib.med   || "",
    camid: urlParams.utm_id       || apiAttrib.camid || "",
    cli:   detectedCli            || apiAttrib.cli   || "",
    clp:   detectedClp            || apiAttrib.clp   || "",
    cls:   (detectedClp && clickIdLabels[detectedClp]) || apiAttrib.cls || "",
    afs:                             apiAttrib.afs   || "",
    sre:   document.referrer      || apiAttrib.sre   || "",
    lcs:                             apiAttrib.lcs   || "",
    fss:                             apiAttrib.fss   || ""
  };
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
  aGTM.f.an(aGTM.c, "iframeSupport", cfg, false); // Enable aGTM inside an iframe: bypasses CMP consent check, listens for parent postMessage handshake
  aGTM.f.an(aGTM.c, "vPageviews", cfg, false); // Send (dataLayer) Events if the URL changes, but no page reload takes place (virtual Pageviews through History Change)
  aGTM.f.an(aGTM.c, "vPageviewsTimer", cfg, 0); // Timer to continuous checking the url for changes (set it to 0 for deactivating)
  aGTM.f.an(aGTM.c, "vPageviewsFallback", cfg, false); // If Proxy Object is not available (older browsers), activate vPageviewsTimer with 500(ms) automatically

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
  aGTM.f.an(aGTM.c, "useListener", cfg, false); // Use an event listener to check the consent (true). If it is false, a timer will be used (default) to check the consent
  aGTM.f.an(aGTM.c, "dlOrgPush", cfg, ""); // "" or "log" or "use" or "restore": If the (GTM-)original dataLayer.push Function is changed (hooked), send an exception event ("log") or use the original dataLayer.push ("use") or replace the hooked dataLayer.push ("restore"). If you don't want to use it, leave it blank.
  aGTM.c.dlStateEvents = typeof cfg.dlStateEvents == "boolean" ? cfg.dlStateEvents : false; // Fire GTM dataLayer Events for DOMloaded and PAGEready
  aGTM.c.aPageview = typeof cfg.aPageview == "boolean" ? cfg.aPageview : false; // Fire aPageview Event
/* deprecated */  aGTM.c.vPageview = typeof cfg.vPageview == "boolean" ? cfg.vPageview : false; // Fire vPageview Event
  aGTM.c.sendConsentEvent = typeof cfg.sendConsentEvent == "boolean" ? cfg.sendConsentEvent : false; // Should aGTM send a separate Event with Consent Info?

  // Consent-event triggers: comma-separated event names that trigger run_cc('update') in fire()
  // Bracket notation: 'cmpEvent[userChoiceType:useraction],cmpUpdate'
  //   'cmpEvent[attr:val]' - triggers only when event.attr === 'val'
  //   'cmpEvent[attr]'     - triggers when event.attr exists (any value)
  //   'cmpUpdate'          - triggers on event name match alone
  aGTM.f.an(aGTM.c, "consent_events", cfg, "");
  aGTM.c.consent_event_attr = aGTM.c.consent_event_attr || {};
  if (typeof aGTM.c.consent_events == "string" && aGTM.c.consent_events) {
    var ce_parts = aGTM.c.consent_events.split(",");
    var ce_clean = [];
    for (var ce_i = 0; ce_i < ce_parts.length; ce_i++) {
      var ce_part = ce_parts[ce_i].replace(/^\s+|\s+$/g, "");
      if (!ce_part) continue;
      var ce_bracket = ce_part.indexOf("[");
      if (ce_bracket >= 0) {
        var ce_name = ce_part.substring(0, ce_bracket);
        var ce_inner = ce_part.substring(ce_bracket + 1, ce_part.indexOf("]"));
        var ce_colon = ce_inner.indexOf(":");
        var ce_attr = {};
        if (ce_colon >= 0) {
          ce_attr[ce_inner.substring(0, ce_colon)] = ce_inner.substring(ce_colon + 1);
        } else {
          ce_attr[ce_inner] = "";
        }
        aGTM.c.consent_event_attr[ce_name] = ce_attr;
        ce_clean.push(ce_name);
      } else {
        ce_clean.push(ce_part);
      }
    }
    aGTM.c.consent_events = ce_clean.join(",");
  }

  // Transport/POST configuration
  aGTM.f.an(aGTM.c, "transport_url", cfg, ""); // Endpoint URL for direct POST transport (e.g. sGTM collect endpoint)
  aGTM.f.an(aGTM.c, "transport_enc", cfg, false); // Default: encrypt POST payload
  aGTM.f.an(aGTM.c, "transport_salt", cfg, 0); // Default salt for POST payload encryption (integer >= 1)

  // Session configuration
  aGTM.f.an(aGTM.c, "user_id", cfg, ""); // User identifier (logged-in CRM ID), exposed for integrators
  aGTM.f.an(aGTM.c, "session_salt", cfg, 0); // Salt for consent-store POST encryption; also fallback for POST transport salt
  aGTM.f.an(aGTM.c, "consent_store_url", cfg, ""); // POST endpoint for consent diffs (sGTM Client persists into Session API)
  aGTM.f.an(aGTM.c, "consent_store_enc", cfg, false); // Encrypt consent-store POST payload with session_salt
  aGTM.f.an(aGTM.c, "consent_poll_ms", cfg, 2000); // CMP state-change poll interval (ms) after init success; 0 disables polling. Only active when consent_store_url is set (otherwise nothing to push)
  // If session data is pre-populated by the sGTM Client, store it directly.
  // Accept any object with sid, consent, attribution, or source.
  if (cfg.session && typeof cfg.session === 'object' && (cfg.session.sid || cfg.session.consent || cfg.session.attribution || cfg.session.source)) {
    aGTM.d.session = JSON.parse(aGTM.f.sStrf(cfg.session));
    // If the preset carries a valid consent block, seed aGTM.d.consent + hash
    // so GTM can inject without waiting for the CMP. Validation: must be an
    // object with hasResponse === true and string services field.
    var presetConsent = cfg.session.consent;
    if (presetConsent && typeof presetConsent === 'object'
        && presetConsent.hasResponse === true
        && typeof presetConsent.services === 'string') {
      aGTM.d.consent = JSON.parse(aGTM.f.sStrf(presetConsent));
      aGTM.d.consent_hash = aGTM.f.consent_serialize(aGTM.d.consent);
      aGTM.d.last_consent_hash = aGTM.d.consent_hash;
      aGTM.d.session_status = 'preset_with_consent';
      aGTM.f.log('m_session_preset_consent', presetConsent);
    } else {
      aGTM.d.session_status = 'preset';
      aGTM.f.log('m_session_preset', cfg.session);
    }
  }

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
  aGTM.d.consent = aGTM.d.consent || JSON.parse(aGTM.f.sStrf(aGTM.c.consent)); // Deep copy to avoid reference issues
  // Only default gtmConsent to false when it was NOT supplied by a preset
  // (otherwise we'd clobber the server-side auto-denial decision).
  if (typeof aGTM.d.consent.gtmConsent !== 'boolean') aGTM.d.consent.gtmConsent = false;
  aGTM.d.config = true; // Set the configuration status to true
  aGTM.d.gtmLoaded = [];

  // HYBRID attribution merge — see resolveAttribution + integration-guide.md §7.
  if (aGTM.d.session && aGTM.d.session.attribution && typeof aGTM.d.session.attribution === "object") {
    for (var attM in aGTM.d.session.attribution) {
      if (aGTM.d.session.attribution.hasOwnProperty(attM)) {
        aGTM.d.attribution[attM] = aGTM.f.resolveAttribution(attM);
      }
    }
  }

  if (typeof aGTM.f.log == "function") aGTM.f.log("m1", aGTM.c); // Log the configuration
  // Phase 3 B1: when preset consent is usable, trigger consent flow synchronously
  // so GTM injects on this tick — without waiting for the 500 ms consent_listener.
  if (aGTM.d.consent.hasResponse === true && typeof aGTM.f.call_cc === "function") {
    aGTM.f.call_cc();
  }
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
  // On 'update' (explicit user CMP decision OR periodic CMP poll), reset all
  // CMP-managed fields BEFORE consent_check so stale preset values cannot
  // survive a real CMP decision (Phase 3 B2 fix). consent_check then
  // repopulates whatever the CMP knows; missing fields stay cleared. blocked
  // is dropped because it's a server/preset-only signal that any explicit
  // user decision overrides.
  // Snapshot before B2 reset so we can restore if consent_check returns false
  // — keeps the periodic update poll (start_consent_poll) safe to run even
  // when the CMP is briefly not ready or the user dismisses the banner.
  var consentSnapshot = null;
  if (action === 'update' && aGTM.d.consent) {
    consentSnapshot = JSON.parse(aGTM.f.sStrf(aGTM.d.consent));
    var c = aGTM.d.consent;
    c.hasResponse = false;
    c.services = ""; c.purposes = ""; c.vendors = "";
    c.consent_id = ""; c.serviceIDs = ""; c.feedback = "";
    delete c.blocked;
  }
  // Perform the consent check
  var consentCheck = aGTM.f.consent_check(action);
  if (!consentCheck) {
    if (consentSnapshot) aGTM.d.consent = consentSnapshot; // restore preset
    aGTM.f.log("m8", null);
    return false;
  }
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
  // Compute the new hash once. Polling calls run_cc('update') on a timer, so
  // we must avoid event-floods: only emit aGTM_consent_update + run the
  // consent callback when the consent state actually changed since the last
  // run_cc — gated on last_consent_hash (always updated, separate from
  // consent_hash which only advances on a successful POST 2xx so the
  // diff/POST block below can retry independently).
  var newHash = aGTM.f.consent_serialize(aGTM.d.consent);
  var hashChanged = newHash !== aGTM.d.last_consent_hash;
  aGTM.d.last_consent_hash = newHash;
  // Update consent status if action is 'update' AND something actually changed
  if (action == "update" && hashChanged) {
    if (!aGTM.d.init) aGTM.f.inject();
    aGTM.f.sendnaus({
      event: "aGTM_consent_update",
      aGTMts: new Date().getTime(),
      aGTMconsent: aGTM.d.consent ? JSON.parse(aGTM.f.sStrf(aGTM.d.consent)) : {}
    });
  }
  // Execute callback if defined. For 'update' we gate on hashChanged so a
  // periodic poll without state change does not flood the integrator's
  // callback. 'init' always fires the callback (one-shot path).
  if ((action !== "update" || hashChanged) &&
      typeof aGTM.f.consent_callback === "function") {
    aGTM.f.consent_callback(action);
  }
  // Phase 3: consent diff/store. Compare the new hash against consent_hash —
  // the hash of the last successfully POSTed state. consent_hash advances
  // ONLY on a 2xx response so a network/server failure transparently retries
  // on the next run_cc. session_status reflects the lifecycle state.
  // Note: this is independent of hashChanged above (which gates sendnaus +
  // callback) because that compares against last_consent_hash. After a 5xx
  // POST, hashChanged becomes false on the retry tick (state stable since
  // last run_cc) but the diff vs consent_hash still triggers the retry POST.
  if (aGTM.c.consent_store_url) {
    if (newHash !== aGTM.d.consent_hash) {
      // Build payload: uid + sid (when available) + consent block (without
      // client-derived fields, matching the hash's blacklist).
      var consentPayload = {};
      if (aGTM.d.session && aGTM.d.session.uid) consentPayload.uid = aGTM.d.session.uid;
      if (aGTM.d.session && aGTM.d.session.sid) consentPayload.sid = aGTM.d.session.sid;
      // Build payload with the same blacklist as consent_serialize (gtmConsent
      // and blocked are client-derived; empty/null values are semantically
      // absent — keep payload symmetric with the hash so the server's
      // full-replace persistence matches what the diff hash represents.
      var consentBody = {};
      var skip = { gtmConsent: 1, blocked: 1 };
      for (var k in aGTM.d.consent) {
        if (!aGTM.d.consent.hasOwnProperty(k) || skip[k]) continue;
        var cv = aGTM.d.consent[k];
        if (cv === "" || cv == null) continue;
        consentBody[k] = cv;
      }
      consentPayload.consent = consentBody;
      var encrypt = aGTM.c.consent_store_enc === true;
      var salt = (typeof aGTM.c.session_salt === 'number' && aGTM.c.session_salt >= 1) ? aGTM.c.session_salt : 0;
      aGTM.f.log('m_consent_store_post', {url: aGTM.c.consent_store_url, hash: newHash});
      var xhr = aGTM.f.xsend(aGTM.c.consent_store_url, consentPayload, encrypt, salt);
      if (xhr) {
        // onreadystatechange-gated hash update: leave hash unchanged on
        // non-2xx so the next run_cc retries within the same page load.
        xhr.onreadystatechange = function() {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            aGTM.d.consent_hash = newHash;
            aGTM.d.session_status = 'synced';
            aGTM.f.log('m_consent_store_synced', {hash: newHash});
            // F→C promote handoff: the sGTM Client's /aGTMconsent handler
            // can return a new uid in the body when it just promoted a
            // fingerprint user to a stable cookie user (api4sgtm /promote
            // atomic Redis TxPipeline: session pointer migration + consent
            // record write). When the echoed uid is a C.* prefix and
            // differs from the one we currently hold, adopt it so the
            // next run_cc POST and any downstream consumers see the new
            // value. We only adopt strict C.* values to avoid a race-
            // condition where a second consent POST with a `finalUid=F.*`
            // fallback (promote failed on the second attempt because the
            // session was already migrated by the first) overwrites a
            // previously-adopted C.* uid. The empty-body / non-JSON cases
            // short-circuit before parse to avoid log noise on legacy
            // server responses.
            if (xhr.responseText) {
              try {
                var resp = JSON.parse(xhr.responseText);
                if (resp && typeof resp.uid === 'string' && resp.uid.indexOf('C.') === 0 && aGTM.d.session && resp.uid !== aGTM.d.session.uid) {
                  aGTM.f.log('m_uid_promoted', {old: aGTM.d.session.uid, new: resp.uid});
                  aGTM.d.session.uid = resp.uid;
                }
              } catch(e) {
                aGTM.f.log('e_consent_store_parse', {msg: e.message});
              }
            }
          } else {
            aGTM.f.log('e_consent_store', {status: xhr.status});
          }
        };
      }
    } else {
      aGTM.d.session_status = 'confirmed';
    }
  }
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
  if (aGTM.c.useListener) return;
  // Phase 3 B1: try once synchronously before starting the 500 ms poll. For
  // preset_with_consent flows (cfg.session.consent valid, hasResponse=true),
  // consent_check's load-bearing short-circuit returns true on the first
  // call, so run_cc → inject runs immediately. If the call fails (no preset
  // or CMP not yet ready), fall through to the polling loop as before.
  if (typeof aGTM.f.call_cc == "function" && aGTM.f.call_cc()) {
    if (typeof aGTM.f.start_consent_poll == "function") aGTM.f.start_consent_poll();
    return;
  }
  // Init poll: keep trying call_cc every 500 ms until consent_check is ready.
  // call_cc clears timer.consent itself on success; we then start the slower
  // CMP-state-change poll for run_cc('update').
  aGTM.d.timer.consent = setInterval(function () {
    if (aGTM.f.call_cc()) {
      if (typeof aGTM.f.start_consent_poll == "function") aGTM.f.start_consent_poll();
    }
  }, 500);
};

/**
 * Starts the periodic CMP state-change poll. Triggered after the first
 * successful run_cc('init'). Only active when both consent_store_url and
 * consent_poll_ms are set (otherwise there is nothing to push and no value
 * in detecting changes). Idempotent — second call is a no-op.
 * The poll calls run_cc('update'), which is now snapshot/restore-guarded:
 * if consent_check returns false (CMP not ready, user dismissed banner,
 * etc.), aGTM.d.consent is restored to its pre-poll state, so the poll
 * is safe to run repeatedly without destroying preset state.
 * @property {function} aGTM.f.start_consent_poll
 */
aGTM.f.start_consent_poll = function () {
  if (!aGTM.c.consent_store_url) return;
  if (typeof aGTM.c.consent_poll_ms !== "number" || aGTM.c.consent_poll_ms <= 0) return;
  if (aGTM.d.timer && aGTM.d.timer.consent_poll) return;
  aGTM.d.timer = aGTM.d.timer || {};
  aGTM.d.timer.consent_poll = setInterval(function () {
    if (typeof aGTM.f.run_cc === "function") aGTM.f.run_cc("update");
  }, aGTM.c.consent_poll_ms);
};


/***** Cookie, URL and OptOut Functions *****/

/**
 * Retrieves the value of a cookie.
 * @property {function} aGTM.f.gc
 * @param {string} n - The name of the cookie. Expected to be a literal name
 *   without cookie separators; it is regex-escaped and left-anchored so a name
 *   that is a suffix of another cookie name (e.g. reading 'b' with 'ab=…' present)
 *   or that contains regex metacharacters can no longer produce a wrong/crashing
 *   read (F-45).
 * @returns {string|null} - The value of the cookie or null if the cookie does not exist.
 * Usage: aGTM.f.gc('consent');
 */
aGTM.f.gc = function (n) {
  if (typeof n != "string" || !n) return null;
  // Escape regex metacharacters in the name, then anchor it to a cookie boundary
  // (start of string or after a "; " separator) so it cannot match inside another
  // cookie's name. The value group stays match[1] (the boundary is non-capturing).
  var esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp("(?:^|;\\s*)" + esc + "=([^;]+)");
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
 * @param {string} n - The name of the cookie. Written verbatim, so it must not
 *   contain a cookie separator (";"/"=") or whitespace — aGTM.f.gc() looks the
 *   value up by the raw name and does not decode it, so an encoded name could
 *   not be read back. A name with such a character is rejected (no-op).
 * @param {string} v - The value of the cookie. URL-encoded on write so a
 *   separator (";"/"="/",") in it cannot corrupt the cookie string; this is
 *   symmetric with gc()'s decodeURIComponent on read (write-side of F-45/F-47).
 * Usage: aGTM.f.sc('consent','true');
 */
aGTM.f.sc = function (n, v) {
  if (typeof n != "string" || !n || !v) return;
  // A separator/whitespace in the name cannot be stored and read back safely
  // (gc reads by the raw name) — fail safe rather than write a corrupt cookie.
  if (/[;=\s]/.test(n)) return;
  try {
    var d = document;
    d[aGTM.n.ck] = n + "=" + encodeURIComponent(v) + "; Secure; SameSite=Lax; path=/";
  } catch (e) {}
};

/**
 * Retrieves the value of a specified URL parameter from a given URL.
 * @function aGTM.f.urlParam
 * @param {string} name - The name of the URL parameter to retrieve. Expected to
 *   be a literal name; it is regex-escaped before being placed into the pattern
 *   so a name containing regex metacharacters can no longer match the wrong
 *   parameter or crash the RegExp constructor (F-47, sibling of gc's F-45). No
 *   anchoring is needed here — the leading "[?&]" and trailing "=" already fence
 *   the name to a full query-parameter boundary.
 * @param {string} url - The URL string to search for the parameter.
 * @returns {string|null} - The decoded value of the parameter if it exists, otherwise null.
 * Usage: aGTM.f.urlParam('aGTMoptout', window.location.href);
 */
aGTM.f.urlParam = function(name, url) {
  if (typeof name != "string" || !name) return null;
  var esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var regex = new RegExp("[?&]" + esc + "(=([^&#]*)|&|#|$)");
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
    aGTMconsent: aGTM.d.consent ? JSON.parse(aGTM.f.sStrf(aGTM.d.consent)) : {}
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
 * Checks whether the JavaScript Proxy API is fully supported and usable.
 * This includes basic detection and a functional test for the "apply" trap.
 * Some older or non-standard environments may define Proxy but throw errors on use.
 * This function ensures that a Proxy can be instantiated and used safely.
 * @property {function} aGTM.f.proxySupport
 * @returns {boolean} True if Proxy is fully supported and usable, false otherwise.
 * @example
 * if (proxySupport()) { console.log('Safe to use new Proxy(...)'; }
 */
aGTM.f.proxySupport = function () {
  if (typeof Proxy !== 'function') return false;
  try {
    var test = new Proxy(function () {}, {
      apply: function () { return true; }
    });
    return test();
  } catch (e) {
    return false;
  }
};

/**
 * Listens for URL changes without full page reload using Proxy and/or polling fallback.
 * Supported mechanisms:
 * - Intercepts history.pushState and history.replaceState using Proxy (if available)
 * - Monitors popstate and hashchange events
 * - Uses polling as fallback (if enabled)
 * @property {function} aGTM.f.urlListener
 * @param {string} eventname - The Event Name
 * @param {number} interval - Polling interval in milliseconds. Set to 0 to disable polling completely.
 * @param {boolean} fallback - If true, enables polling as a fallback when Proxy is not supported.
 * Example usage: Include this code early in your HTML to track client-side navigation changes.
 */
aGTM.f.urlListener = function (eventname, interval, fallback) {
  // Idempotency guard: urlListener may be invoked more than once (e.g. from
  // gtm_load AND the Pageview tag, or a multi-trigger SPA setup). Each call would
  // otherwise leak resources — the shared last_url dedup already suppresses
  // duplicate events, but without this guard every call would (a) re-wrap
  // history.pushState/replaceState in another Proxy (unbounded nesting), (b)
  // register another polling interval (timer names get a unique suffix, so there
  // is no dedup — the extra setInterval is never stopped) and (c) add another
  // popstate/hashchange listener. First caller wins; a later call with different
  // parameters is intentionally ignored (single active listener per page).
  if (aGTM.d.urlListener_active) return;
  aGTM.d.urlListener_active = true;
  if (typeof interval != 'number') interval = 500;
  if (typeof fallback != 'boolean') fallback = false;
  aGTM.d.last_url = aGTM.d.last_url || aGTM.f.getVal('l', 'href');
  if (typeof aGTM.d.last_url != 'string' || !aGTM.d.last_url) aGTM.d.last_url = '';
  // Core function
  var checkUrlChange = function() {
    var currentURL = aGTM.f.getVal('l', 'href') || '';
    if (currentURL != aGTM.d.last_url) {
      if (typeof eventname != 'string') eventname = 'vPageview';
      var ev = { event: eventname };
      ev.oldURL = aGTM.d.last_url;
      ev.newURL = currentURL;
      ev.newTitle = document.title;
      aGTM.f.fire(ev);
      aGTM.d.last_url = currentURL;
    }
  };
  // Listener
  aGTM.f.evLstn('window', 'popstate', checkUrlChange);
  aGTM.f.evLstn('window', 'hashchange', checkUrlChange);
  // Try Proxy-based interception, fallback to timer if configured
  var proxyUsed = false;
  if(aGTM.f.proxySupport()) {
    var handler = {
      apply: function (target, thisArg, argumentsList) {
        var result = target.apply(thisArg, argumentsList);
        checkUrlChange();
        return result;
      }
    };
    history.pushState = new Proxy(history.pushState, handler);
    history.replaceState = new Proxy(history.replaceState, handler);
    proxyUsed = true;
  }
  // Fallback polling if Proxy isn't available or polling is explicitly enabled
  if ((interval > 0 && !proxyUsed && fallback) || (interval > 0 && !fallback)) {
    aGTM.f.timer('urlListener', checkUrlChange, null, interval, 0);
    //setInterval(checkUrlChange, interval);
  }
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
    aGTM.f.sendnaus(aGTM.f.aGTM_event('aGTM_ready'));
    if (i) aGTM.f.sendnaus({ event: "gtm.js", "gtm.start": new Date().getTime() });
    if (aGTM.c.aPageview) aGTM.f.sendnaus({ event: "aPageview", aGTMts: new Date().getTime() });
/* deprecated */    if (aGTM.c.vPageview) aGTM.f.sendnaus({ event: "vPageview", aGTMts: new Date().getTime() });
    if (aGTM.c.vPageviews) aGTM.f.urlListener ('vPageview', aGTM.c.vPageviewsTimer, aGTM.c.vPageviewsFallback);
  }
  // Fire aGTM Consent event
  aGTM.d.consentEvent_fired = typeof aGTM.d.consentEvent_fired == 'boolean' ? aGTM.d.consentEvent_fired : false;
  if (
    aGTM.c.sendConsentEvent &&
    !aGTM.d.consentEvent_fired &&
    typeof aGTM.d.consent == "object" &&
    aGTM.d.consent.hasResponse
  ) {
    aGTM.f.sendnaus(aGTM.f.aGTM_event('aGTM_consent'));
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
    if (aGTM.f.urlParam("gtm_debug", document.location.href)) gtm_debug = true;
  }
  // Get debug referrer
  if (!gtm_debug && document.referrer) {
    var refA = d.createElement('a');
    refA.href = document.referrer;
    if (refA.hostname == aGTM.n.ta + ".com") gtm_debug = true;
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
    var q = gtmUrl.indexOf("?")===-1 ? "?" : "&";
    scriptTag.src = gtmUrl + q + p + "=" + i + "&l=" + l + envParam;
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
    evob = { aMSG: 'Empty DOMready event fired.' };
    is_intern = true;
  }
  if (!evob.event) evob.event = "aDOMready";
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
    evob = { aMSG: 'Empty PAGEready event fired.' };
    is_intern = true;
  }
  if (!evob.event) evob.event = "aPAGEready";
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
      if (typeof ev != 'object' || !ev) {
        aGTM.f.log("e17", { obj_type: typeof ev, obj_value: ev, index: index });
        aGTM.d.f.push({ event: 'exception', errmsg: 'DataLayer Entry is no object', errtype: "DL Error", obj_type: typeof ev, obj_value: ev });
      } else if (!ev.aGTMchk) {
        ev.aGTMdl = true;
        var evClone = JSON.parse(aGTM.f.sStrf(ev));
        if (typeof evClone["gtm.uniqueEventId"] != "undefined") delete evClone["gtm.uniqueEventId"];
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
    /^(aGTM|gtm\.|[av]DOMready|[av]PAGEready)/.test(ev.event)
  ) {
    aGTM.f.sendnaus(ev);
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
    aGTM.d.f.push(ev);
  }
};

/**
 * Sends a handshake message to all iframes on the page if the current window is not an iframe and no origin is defined.
 */
aGTM.f.ifHandshake = function () {
  // Only run if this is not an iframe and the handshake has not been sent yet.
  if (!aGTM.d.is_iframe && !aGTM.d.iframe.handshake) {
    var iframes = document.getElementsByTagName("iframe");
    // Early return to avoid unnecessary nesting
    if (!iframes.length) return;
    // Loop through all iframes and send the handshake message
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      if (!iframe || !iframe.contentWindow || !iframe.contentWindow.postMessage)
        continue;
      // targetOrigin "*" is intentional: the handshake carries only a fixed,
      // non-sensitive token and the top window cannot enumerate each child's
      // origin. Security is enforced on the receiver side (ifHSlisten verifies
      // e.source === window.top before adopting the origin).
      iframe.contentWindow.postMessage("aGTM_Top2iFrame Handshake", "*");
    }
    // Mark that the handshake attempt was made
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
    // Only accept the handshake from the actual parent/top window. Without this
    // check a sibling iframe or an injected script could forge the handshake
    // string and hijack aGTM.d.iframe.origin, redirecting all outgoing events.
    e.source === window.top &&
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
 * @returns {boolean} - Returns true if the input is an valid object and not null, false otherwise.
 * Usage: if (!aGTM.f.vOb(null)) return;
 */
aGTM.f.vOb = function (i) {
  if (typeof i != 'object' || !i) return false;
  try { var o = JSON.parse(JSON.stringify(i)); } catch (e) { return false; };
  return true;
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
 * Feature-detects support for the passive event-listener option (cached).
 * A passive listener promises never to call preventDefault(), so the browser
 * can start scrolling/panning without waiting for the handler — this is the
 * key Core-Web-Vitals lever for scroll/touch/wheel listeners (better INP, no
 * scroll-blocking jank). On old engines that treat the 3rd addEventListener
 * argument as a boolean useCapture, passing an options object would silently
 * turn on capture, so we only pass it when real support is detected.
 * @property {function} aGTM.f.passiveSupported
 * @returns {boolean} true if { passive: ... } is honoured by addEventListener.
 */
aGTM.f.passiveSupported = function () {
  if (typeof aGTM.d.passive_supported == "boolean") return aGTM.d.passive_supported;
  var supported = false;
  try {
    var opts = Object.defineProperty({}, "passive", {
      get: function () { supported = true; return true; }
    });
    var noop = function () {};
    window.addEventListener("aGTMpassivetest", noop, opts);
    window.removeEventListener("aGTMpassivetest", noop, opts);
  } catch (e) {
    supported = false;
  }
  aGTM.d.passive_supported = supported;
  return supported;
};

/**
 * Wraps a function in a leading+trailing throttle. High-frequency events
 * (scroll, resize) then run the wrapped handler at most once per `wait` ms
 * instead of on every event — this bounds how often the handler's layout
 * reads (offsetHeight/scrollHeight/…) force a reflow, keeping the main thread
 * responsive (Core Web Vitals). The trailing call guarantees the final state
 * (e.g. the deepest scroll position) is still measured, so no threshold is
 * missed when the user stops between throttle windows.
 * @property {function} aGTM.f.throttle
 * @param {function} fct - the function to throttle.
 * @param {number} wait - minimum milliseconds between invocations.
 * @returns {function} the throttled wrapper.
 */
aGTM.f.throttle = function (fct, wait) {
  if (typeof fct != "function") return fct;
  if (typeof wait != "number" || wait <= 0) return fct;
  var last = 0;
  var timer = null;
  var lastCtx = null;
  var lastArgs = null;
  return function () {
    var now = Date.now();
    // Always capture the latest context/args so the trailing call reflects the
    // most recent event, not the one that happened to schedule the timer.
    lastCtx = this;
    lastArgs = arguments;
    var remaining = wait - (now - last);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fct.apply(lastCtx, lastArgs);
    } else if (!timer) {
      timer = setTimeout(function () {
        last = Date.now();
        timer = null;
        fct.apply(lastCtx, lastArgs);
      }, remaining);
    }
  };
};

/**
 * Adds an event listener to a specified DOM element.
 * @property {function} aGTM.f.evLstn
 * @param {object|string} el - The DOM object to which you want to add the event listener, or a string 'window'/'document'.
 * @param {string} ev - The name of the event, e.g., 'mousedown'.
 * @param {function} fct - The function to execute when the event is triggered.
 * @param {object} [opts] - Optional listener tuning (ignored for 'message'):
 *   @param {boolean} [opts.passive] - register as a passive listener when the
 *     browser supports it (CWV: never blocks scrolling). Falls back to a normal
 *     listener on unsupported engines.
 *   @param {number} [opts.throttle] - throttle the handler to at most one call
 *     per this many ms (leading+trailing); use for scroll/resize.
 * Usage: aGTM.f.evLstn(document.querySelector('div.button'), 'mousedown', click_fct);
 * Usage: aGTM.f.evLstn('window', 'scroll', onScroll, { passive: true, throttle: 200 });
 */
aGTM.f.evLstn = function (el, ev, fct, opts) {
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
  if (typeof opts != "object" || !opts) opts = {};
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
      // Coalesce high-frequency events before they hit the handler (CWV).
      var handler = (typeof opts.throttle == "number" && opts.throttle > 0)
        ? aGTM.f.throttle(fct, opts.throttle)
        : fct;
      // Only pass a real options object when passive is both requested and
      // supported; otherwise keep the classic boolean-useCapture signature.
      if (opts.passive === true && aGTM.f.passiveSupported()) {
        el.addEventListener(ev, handler, { passive: true });
      } else {
        el.addEventListener(ev, handler);
      }
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
 * @param {string} o - A single character representing the DOM object ( 'w' for window, 'n' for navigator, 'd' for document, 'l' for location, 'h' for head, 'b' for body, 's' for scroll top, 'm' for window.screen (monitor), 'c' for google_tag_data (consent), 'p' for performance (v="now" for performance.now()), 'u' for (URL) window.history ).
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
        ? JSON.parse(aGTM.f.sStrf(window[v]))
        : window[v];
    case "n":
      return aGTM.f.vOb(navigator[v])
        ? JSON.parse(aGTM.f.sStrf(navigator[v]))
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
        return JSON.parse(aGTM.f.sStrf(window.google_tag_data.ics));
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
  if (typeof nodes!='object' || typeof nodes.length!='number' || nodes.length == 0) return;
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
  var ev = JSON.parse(aGTM.f.sStrf(obj)); // Create a deep copy of the event object to prevent mutating the original object
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
  if (!nm && typeof ev == "object" && ev && typeof ev.event == "string") nm = ev.event;
  nm = nm || "timer";
  nm+= "_" + new Date().getTime().toString() + "_" + Math.floor(Math.random() * 999999 + 1).toString();
  // Check if the timer already exists and stop/delete it if it does
  aGTM.f.stoptimer(nm);
  // Initialize the timer object
  if (typeof ev == "object" && ev) { var obj = JSON.parse(aGTM.f.sStrf(ev)); } else { var obj = {}; }
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
    if (t.timer_rp === 1) {
      clearTimeout(t.id);
    } else {
      clearInterval(t.id);
    }
    delete aGTM.d.timer[nm];
  }
};

/**
 * Late-enrichment / DL-repeat engine (driven by the "aGTM - DL Repeat" GTM tag).
 * The tag is triggered ONCE (e.g. on aPageview) and hands its configuration
 * here; this function then watches the chosen source for the configured gate
 * event(s) and, once they are all present (or after a timeout), repeats the
 * matching earlier events back into the dataLayer marked aGTMrepeated=true, so
 * downstream tags fire again with the now-complete data. Runs at most once per
 * page. Keeping the logic in the library lets the tag use a single trigger and
 * avoids the GTM-sandbox limitations (no setInterval there).
 * @property {function} aGTM.f.dlrepeat
 * @param {object} cfg - configuration from the tag:
 *   source ('f'|'dl'|'live'), gateEvents (csv string; a token may be
 *   conditional: "G?if=E[A]" / "G?if=E[A:V]" - G is only required when event E
 *   has a non-empty attr A / A===V, see gateReady below), whitelist, blacklist
 *   (csv, '*' wildcard), maxEvents (number), gtmFired/agtmFired/messages/
 *   gtmEvents/clearEcom/fallbackEvent/debug (booleans), addparameter (array of
 *   {pkey,pvalue}), pollMs (poll interval, default 300), timeoutMs (fallback
 *   timeout, 0 = none). With fallbackEvent on, an "aGTM_repeat_fallback" event
 *   is fired ONLY on the timeout path when at least one event was replayed
 *   (see doReplay).
 * Usage: aGTM.f.dlrepeat({ source:'live', gateEvents:'user_data', timeoutMs:1500 });
 */
aGTM.f.dlrepeat = function (cfg) {
  if (typeof cfg != "object" || !cfg) return;
  // Run at most once per page
  if (aGTM.d.dlrepeatDone) return;
  var dbg = function (m, o) { if (cfg.debug && typeof window.console == "object" && window.console.log) window.console.log("aGTM dlrepeat: " + m, o); };
  // Resolve the replay source array
  var getSrc = function () {
    if (cfg.source == "live") return window[aGTM.c.gdl] || [];
    if (cfg.source == "dl") return aGTM.d.dl || [];
    return aGTM.d.f || [];
  };
  // Does an event name match a csv list of patterns ('*' = wildcard, trimmed)?
  var matchList = function (list, name) {
    var arr = list.split(",");
    for (var k = 0; k < arr.length; k++) {
      var p = arr[k].replace(/^\s+|\s+$/g, "");
      if (!p) continue;
      // Escape every regex metacharacter first, THEN turn the (now-escaped) '*'
      // back into '.*' so only '*' acts as a wildcard. Without this a literal
      // '(' / '[' / '+' in a white-/blacklist entry (e.g. "view_item(") makes
      // the RegExp constructor throw and aborts the replay mid-loop (partial
      // replay -> some conversion tags never re-fire). The try/catch is a
      // belt-and-suspenders guard: a malformed pattern skips, it never throws.
      var rx = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      try {
        if (new RegExp("^" + rx + "$", "i").test(name)) return true;
      } catch (e) { /* malformed pattern: treat as non-match, keep scanning */ }
    }
    return false;
  };
  // Parse the gate tokens once. A token may be CONDITIONAL:
  //   "G"               - G is always required (pre-v1.5 behaviour, unchanged)
  //   "G?if=E[A]"       - G is required ONLY IF an event named E with a
  //                       non-empty attribute A is present in the source
  //   "G?if=E[A:V]"     - G is required ONLY IF an event E with A === V exists
  //   "G?if=E"          - G is required until an event named E appears (an
  //                       absent E means "not yet known" -> keep waiting, not
  //                       "skip"; see condState tri-state below). Prefer the
  //                       [A] form with an always-present discriminator for a
  //                       fast skip; this bare form waits like listing E itself.
  // The predicate reuses the "event[attr]"/"event[attr:value]" PARSE syntax of
  // aGTM.c.consent_events - but note the empty-value handling differs: the gate
  // treats a bare [A] as "A non-empty" (null, undefined and "" all count as
  // empty), whereas consent_events' [attr] matches on mere presence. [A:V] is a
  // strict string compare (String(v) === V). Use case: gate on user_data only
  // for logged-in visitors (user_data?if=user[id]) so guests - who never get
  // user_data - replay in order right away instead of hitting the timeout
  // fallback. A malformed predicate (no closing "]", empty attr/event, trailing
  // junk after "]", empty "?if=") is treated as UNCONDITIONAL (G stays required)
  // so a typo fails safe (never silently drops the gate); with cfg.debug it also
  // logs a warning.
  var parseCond = function (s) {
    if (!s) return null; // "?if=" with nothing -> invalid
    var b = s.indexOf("[");
    if (b < 0) return { ev: s, attr: null, val: null }; // "E" - presence only
    var close = s.indexOf("]");
    if (close < b || !s.substring(0, b)) return null; // no "]" after "[" / no event name
    if (close + 1 !== s.length) return null; // trailing chars after "]" -> malformed
    var inner = s.substring(b + 1, close);
    var c = inner.indexOf(":");
    var attr = c >= 0 ? inner.substring(0, c) : inner;
    if (!attr) return null; // "E[]" / "E[:v]" - empty attribute
    return { ev: s.substring(0, b), attr: attr, val: c >= 0 ? inner.substring(c + 1) : null };
  };
  var trim = function (s) { return s.replace(/^\s+|\s+$/g, ""); };
  var parsedGates = [];
  if (cfg.gateEvents) {
    var gparts = cfg.gateEvents.split(",");
    for (var gi = 0; gi < gparts.length; gi++) {
      var tok = trim(gparts[gi]);
      if (!tok) continue;
      var q = tok.indexOf("?if=");
      if (q < 0) { parsedGates.push({ name: tok, cond: null }); continue; }
      var gname = trim(tok.substring(0, q));
      if (!gname) { dbg("gate token with empty name before ?if=, skipped: " + tok); continue; }
      var cond = parseCond(trim(tok.substring(q + 4)));
      if (!cond) dbg("invalid ?if= predicate, gate treated as unconditional: " + tok);
      parsedGates.push({ name: gname, cond: cond });
    }
  }
  // Is an event with the given name present in the source?
  var hasEvent = function (arr, name) {
    for (var e = 0; e < arr.length; e++) { if (arr[e] && arr[e].event === name) return true; }
    return false;
  };
  // Evaluate a conditional-gate predicate against the source. Tri-state so an
  // as-yet-absent discriminator event is NOT mistaken for "not required":
  //    1  discriminator present AND matches   -> gate G is required
  //    0  discriminator present, does NOT match -> gate G is not required (skip)
  //   -1  discriminator not present yet -> unresolved, keep waiting
  // (-1 avoids a silent false-negative where a logged-in visitor whose "user"
  // event arrives after the gate check would replay unenriched with no fallback.)
  var condState = function (arr, c) {
    var present = false;
    for (var e = 0; e < arr.length; e++) {
      var it = arr[e];
      if (!it || it.event !== c.ev) continue;
      present = true;
      if (c.attr == null) return 1;
      var v = it[c.attr];
      if (c.val == null) { if (v != null && v !== "") return 1; }
      else if (String(v) === c.val) return 1;
    }
    return present ? 0 : -1;
  };
  // Are all REQUIRED gate events present in the source? (no gates = ready now.
  // A conditional gate: predicate matched -> require it; predicate false but
  // discriminator present -> skip it; discriminator absent -> not ready, wait.)
  var gateReady = function (arr) {
    for (var g = 0; g < parsedGates.length; g++) {
      var pg = parsedGates[g];
      if (pg.cond) {
        var st = condState(arr, pg.cond);
        if (st === 0) continue;      // not required
        if (st === -1) return false; // unresolved -> keep waiting
      }
      if (!hasEvent(arr, pg.name)) return false;
    }
    return true;
  };
  // Which required gate events are still absent? Used only for the timeout-
  // fallback diagnostic: it names the culprit(s) so a monitor can see WHAT never
  // arrived - e.g. "user_data" for a logged-in visitor whose enrichment was too
  // slow. A conditional gate whose discriminator is absent reports the missing
  // discriminator event; a skipped (not-required) conditional gate reports
  // nothing.
  var missingGates = function (arr) {
    var miss = [];
    for (var g = 0; g < parsedGates.length; g++) {
      var pg = parsedGates[g];
      if (pg.cond) {
        var st = condState(arr, pg.cond);
        if (st === 0) continue;                              // not required
        if (st === -1) { miss.push(pg.cond.ev); continue; }  // discriminator never arrived
      }
      if (!hasEvent(arr, pg.name)) miss.push(pg.name);
    }
    return miss;
  };
  // Should one source event be repeated?
  var passes = function (ev) {
    if (typeof ev != "object" || !ev) return false;
    if (ev.aGTMrepeated === true) return false; // loop protection
    // Send type: aGTMdl===true marks raw GTM dataLayer items captured at init;
    // aGTM.f.fire events carry no aGTMdl.
    if (ev.aGTMdl === true) { if (!cfg.gtmFired) return false; }
    else if (!cfg.agtmFired) return false;
    if (typeof ev.event == "string" && ev.event.indexOf("aGTM") === 0) return false; // aGTM control events
    if (typeof ev.event != "string" && typeof ev.type == "string" && typeof ev.flags == "object" && ev.flags && ev.flags.enableUntaggedPageReporting) return false;
    if (!cfg.gtmEvents && typeof ev.event == "string" && /^gtm\.(start|init_consent|init|js|dom|load)$/i.test(ev.event)) return false;
    if (cfg.whitelist && typeof ev.event == "string" && !matchList(cfg.whitelist, ev.event)) return false;
    if (cfg.blacklist && typeof ev.event == "string" && matchList(cfg.blacklist, ev.event)) return false;
    if (!cfg.messages && typeof ev.event != "string") return false;
    return true;
  };
  // Repeat all currently-qualifying events once, then mark done
  var doReplay = function (enriched) {
    aGTM.d.dlrepeatDone = true; // set FIRST so a re-entrant call/fire() can never start a second replay
    var arr = getSrc();
    var n = (arr && typeof arr.length == "number") ? arr.length : 0; // snapshot length: appended replays are not re-scanned
    var hasConsent = typeof aGTM.d.consent == "object" && aGTM.d.consent && aGTM.d.consent.gtmConsent;
    var count = 0, max = cfg.maxEvents || 0, fired = 0;
    for (var i = 0; i < n; i++) {
      if (!passes(arr[i])) continue;
      if (max && count >= max) break;
      count++;
      var clone = JSON.parse(aGTM.f.sStrf(arr[i]));
      // Optional ecommerce reset before the event. Only when GTM consent is
      // present, so the reset is not queued without its event (and to keep its
      // order relative to the event it precedes).
      if (cfg.clearEcom && hasConsent && typeof clone.ecommerce != "undefined") aGTM.f.fire({ ecommerce: null, aGTMrepeated: true });
      delete clone.aGTMts; // else fire()'s loop guard would drop the event
      delete clone.aGTMparams;
      delete clone.eventModel; // fire() also drops events with a truthy eventModel; strip it so a live-source item is not silently dropped while still counted in `fired`
      delete clone["gtm.uniqueEventId"];
      clone.aGTMrepeated = true;
      if (cfg.addparameter && cfg.addparameter.length) {
        for (var p = 0; p < cfg.addparameter.length; p++) {
          if (cfg.addparameter[p] && cfg.addparameter[p].pkey) clone[cfg.addparameter[p].pkey] = cfg.addparameter[p].pvalue;
        }
      }
      aGTM.f.fire(clone);
      fired++;
    }
    // Optional error signal: ONLY on the timeout fallback (gate event never
    // arrived, so the replay ran unenriched) AND only when at least one event
    // was actually repeated (fired > 0). If nothing matched, no replay ran, so
    // there is no missed enrichment to report - a fallback alert would be pure
    // noise (the normal case for guests / non-conversion pages that never carry
    // the gate event). Off by default; enable via cfg.fallbackEvent. Trigger an
    // alert/monitoring tag on it. Starts with "aGTM" so it bypasses consent and
    // is skipped by passes().
    // aGTMrepeatMissing names the gate event(s) still absent at the timeout (the
    // culprit, e.g. "user_data"); aGTMrepeatWaited is the give-up threshold (ms).
    // Computed once here, only on the fallback path.
    var missing = enriched ? "" : missingGates(arr).join(",");
    if (!enriched && cfg.fallbackEvent && fired > 0) aGTM.f.fire({ event: "aGTM_repeat_fallback", aGTMrepeatCount: fired, aGTMrepeatSource: cfg.source, aGTMrepeatMissing: missing, aGTMrepeatWaited: timeoutMs });
    dbg("replayed " + fired + " event(s), enriched=" + (enriched ? "yes" : "no(fallback)") + (enriched ? "" : ", missing=" + missing));
  };
  dbg("start", cfg);
  // Re-entrancy guard: if a poll is already running, do not start a second
  // replay or a second poll. A single trigger can still call the tag more than
  // once (e.g. multiple triggers, a SPA navigation) - the running poll owns it.
  if (aGTM.d.dlrepeatPolling) return;
  // Gate satisfied already? Replay now.
  if (gateReady(getSrc())) { doReplay(true); return; }
  // Otherwise poll until the gate is ready, the fallback timeout hits, or a hard cap.
  aGTM.d.dlrepeatPolling = true;
  var pollMs = (typeof cfg.pollMs == "number" && cfg.pollMs >= 50) ? cfg.pollMs : 300;
  var timeoutMs = (typeof cfg.timeoutMs == "number" && cfg.timeoutMs > 0) ? cfg.timeoutMs : 0;
  var hardCap = timeoutMs > 0 ? timeoutMs : 30000; // never poll forever
  var waited = 0;
  var iv = setInterval(function () {
    if (aGTM.d.dlrepeatDone) { clearInterval(iv); return; }
    if (gateReady(getSrc())) { clearInterval(iv); doReplay(true); return; }
    waited += pollMs;
    if (waited >= hardCap) {
      clearInterval(iv);
      if (timeoutMs > 0) { doReplay(false); } // fallback: replay unenriched so no tags fail
      else { aGTM.d.dlrepeatPolling = false; dbg("gate never satisfied within cap and no fallback - nothing repeated; polling released for a later call"); }
    }
  }, pollMs);
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
 * Obfuscates a string using Base64 + Caesar shift. Compatible with the aEvents GTM tag encoder.
 * @property {function} aGTM.f.enc
 * @param {string} str - The string to encode.
 * @param {number} salt - Integer >= 1. Effective shift = salt % 63 + 1 (range 1-63).
 * @returns {string} URL-safe encoded string [a-zA-Z0-9\-_~].
 */
aGTM.f.enc = function(str, salt) {
  var B64_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var OUT_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var PAD_CHAR = '~';
  var PAD_POS = 3;
  var shift = salt % 63 + 1;
  var b = btoa(unescape(encodeURIComponent(str)));
  var pad = 0;
  if (b.charAt(b.length - 1) === '=') pad++;
  if (b.charAt(b.length - 2) === '=') pad++;
  b = b.slice(0, b.length - pad);
  var padStr = pad === 1 ? PAD_CHAR : (pad === 2 ? PAD_CHAR + PAD_CHAR : '');
  var out = '';
  for (var i = 0; i < b.length; i++) {
    var idx = B64_ALPHA.indexOf(b.charAt(i));
    out += idx < 0 ? b.charAt(i) : OUT_ALPHA.charAt((idx + shift) % 64);
  }
  return pad ? out.slice(0, PAD_POS) + padStr + out.slice(PAD_POS) : out;
};

/**
 * Sends data as an HTTP POST request to a given URL.
 * Plain body format:     {"e": <data object>}
 * Encrypted body format: {"q": "<encoded string>"}
 * @property {function} aGTM.f.xsend
 * @param {string} url - The endpoint URL.
 * @param {object} data - The data object to send.
 * @param {boolean} encrypt - Whether to encrypt the payload.
 * @param {number} salt - Salt for encryption (integer >= 1).
 */
aGTM.f.xsend = function(url, data, encrypt, salt) {
  if (!url || typeof url !== 'string') return;
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    var body;
    if (encrypt && typeof salt === 'number' && salt >= 1) {
      body = '{"q":"' + aGTM.f.enc(aGTM.f.sStrf(data), salt) + '"}';
    } else {
      body = '{"e":' + aGTM.f.sStrf(data) + '}';
    }
    xhr.send(body);
    return xhr;
  } catch(e) {
    aGTM.f.log('e_xsend', { msg: e.message, url: url });
    return null;
  }
};

/**
 * Pushes an event object to the GTM dataLayer with checking dataLayer.
 * @property {function} aGTM.f.sendnaus
 * @param {object} o - The event object to be pushed to the dataLayer.
 * Usage: aGTM.f.send({ event: 'pageview', pagetype: 'blogarticle' });
 */
aGTM.f.sendnaus = function (o) {
  // Preparations
  if (!o || typeof o !== 'object') return;
  var currentPush = window[aGTM.c.gdl].push;
  // Save original push function if not already saved and if it looks like sandboxed
  if (!aGTM.d.originalDLpush && /sandbox/i.test(currentPush.toString())) aGTM.d.originalDLpush = currentPush;
  // Check if push was overwritten - log it and replace it if configured
  var useOrgPush = false;
  if (aGTM.c.dlOrgPush && aGTM.d.originalDLpush && aGTM.d.originalDLpush !== currentPush) {
    var pushStr = currentPush.toString();
    if (/sandbox/i.test(pushStr)) {
      // GTM re-wrapped its own push (e.g. gtag.js or second container loaded) — update baseline silently
      aGTM.d.originalDLpush = currentPush;
    } else {
      useOrgPush = true;
      if (!aGTM.d.dlHookLogged) {
        aGTM.d.originalDLpush({
          event: 'exception',
          errtype: 'DL Error',
          errmsg: 'Function dataLayer.push hooked - no longer from GTM',
          fct_hook: pushStr,
          fct_orig: aGTM.d.originalDLpush.toString(),
          timestamp: new Date().getTime(),
          eventModel: null
        });
        aGTM.d.dlHookLogged = true;
      }
      if (aGTM.c.dlOrgPush === 'restore') {
        window[aGTM.c.gdl].push = aGTM.d.originalDLpush;
        useOrgPush = false;
      }
    }
  }
  // Decide which push Function to use and fire
  if (useOrgPush && aGTM.c.dlOrgPush==='use') {
    aGTM.d.originalDLpush(o);
  } else {
    window[aGTM.c.gdl].push(o);
  }
  // Execute the callback function if defined and initialized
  if (typeof aGTM.f.sendnaus_callback=='function') aGTM.f.sendnaus_callback(o);
  aGTM.f.log('m9', o);
};

/**
 * Prepares an event object to send it to the GTM dataLayer with additional logic for consent and error checking.
 * @property {function} aGTM.f.fire
 * @param {object} o - The event object to be pushed to the dataLayer.
 * Usage: aGTM.f.fire({ event: 'pageview', pagetype: 'blogarticle' });
 */
aGTM.f.fire = function (o) {
  // Ensure the event object is valid
  if (typeof o != "object" || !o) {
    aGTM.f.log("e9", { o: typeof o });
    return;
  }
  // Create a deep copy of the event object
  try {
    var obj = JSON.parse(aGTM.f.sStrf(o));
    if (!obj) {
      aGTM.f.log("e15", obj);
      return;
    }
  } catch (e) {
    var m = 'aGTM Fire Error (JSON.parse)';
    if (typeof o.event == 'string') m = m + ' (Event: '+o.event+')';
    var obj = {
      event: "exception",
      errmsg: e.message,
      errtype: m,
      timestamp: new Date().getTime(),
      errct: aGTM.d.error_counter || 1,
      eventModel: null
    };
    aGTM.f.log("e15", obj);
  }
  // Some more checks
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
    ("," + aGTM.c.consent_events + ",").indexOf("," + obj.event + ",") >= 0
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
  // Delay event if no consent is available (bypass for aGTM-internal events and _noConsent flag)
  if (
    ((typeof aGTM.d.consent != "object" ||
      !aGTM.d.consent.hasResponse ||
      !aGTM.d.consent.gtmConsent) &&
      (typeof obj.event != "string" || obj.event.indexOf("aGTM") !== 0) &&
      !obj._noConsent) ||
    (aGTM.c.iframeSupport && aGTM.d.is_iframe && !aGTM.d.iframe.origin)
  ) {
    delete obj.aGTMts;
    delete obj.eventModel;
    aGTM.d.f.push(JSON.parse(aGTM.f.sStrf(obj)));
    return;
  }
  // Send as POST if _post is configured and not yet sent
  if (obj._post && !obj._post_sent) {
    var postCfg = (typeof obj._post === 'object') ? obj._post : {};
    var postUrl = (typeof postCfg.url === 'string' && postCfg.url) ? postCfg.url : aGTM.c.transport_url;
    if (postUrl) {
      var postEnc = (typeof postCfg.enc === 'boolean') ? postCfg.enc : !!aGTM.c.transport_enc;
      var postSalt = (typeof postCfg.salt === 'number' && postCfg.salt >= 1) ? postCfg.salt : ((typeof aGTM.c.transport_salt === 'number' && aGTM.c.transport_salt >= 1) ? aGTM.c.transport_salt : (aGTM.c.session_salt || 0));
      var postData = JSON.parse(aGTM.f.sStrf(obj));
      delete postData._post;
      delete postData._post_sent;
      delete postData.eventModel;
      if (postCfg.consent && typeof aGTM.d.consent === 'object') {
        postData.consent = JSON.parse(aGTM.f.sStrf(aGTM.d.consent));
      }
      aGTM.f.xsend(postUrl, postData, postEnc, postSalt);
      obj._post_sent = true;
    }
  }
  // Push event to GTM if enabled and consented (or _noConsent bypass active)
  if (
    aGTM.d.consent.gtmConsent ||
    (typeof obj.event == "string" && obj.event.indexOf("aGTM") === 0) ||
    obj._noConsent
  ) {
    //var gtmobj = JSON.parse(aGTM.f.sStrf(obj));
    if (typeof obj.event != "string" || obj.event.indexOf("aGTM") !== 0) {
      delete obj["gtm.uniqueEventId"];
      delete obj.aGTMparams;
      obj.aGTMparams = JSON.parse(aGTM.f.sStrf(obj));
    }
    aGTM.d.dl.push(obj);
    if (!obj._noDLPush) {
      if (
        aGTM.c.iframeSupport &&
        aGTM.d.is_iframe &&
        typeof obj.event == "string"
      ) {
        aGTM.f.iFrameFire(obj);
      } else {
        aGTM.f.sendnaus(obj);
      }
    } else if (typeof aGTM.f.sendnaus_callback == "function") {
      aGTM.f.sendnaus_callback(obj);
    }
  }
  // Execute the callback function if defined and initialized
  if (typeof aGTM.f.fire_callback == "function") aGTM.f.fire_callback(obj);
  aGTM.f.log("m7", obj);
};

// Initialization --> Delete the following line for One-File-Usage and read the instructions below
//aGTM.f.init();



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
