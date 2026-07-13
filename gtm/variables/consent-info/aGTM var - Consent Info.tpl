___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.


___INFO___

{
  "type": "MACRO",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "aGTM var - Consent Info",
  "description": "Variable with Consent and Google Consent Mode signals",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "SELECT",
    "name": "mode",
    "displayName": "Return Mode",
    "macrosInSelect": false,
    "selectItems": [
      {
        "value": "all",
        "displayValue": "All Data (Consent + Consent Mode)"
      },
      {
        "value": "consent",
        "displayValue": "Consent Info"
      },
      {
        "value": "cm",
        "displayValue": "Google Consent Mode"
      }
    ],
    "simpleValueType": true
  },
  {
    "type": "CHECKBOX",
    "name": "base64",
    "checkboxText": "Return it as Base64 String",
    "simpleValueType": true
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

// https://developers.google.com/tag-platform/tag-manager/templates/api?hl=de

// Import needed libraries
const callInWindow = require('callInWindow');
const toBase64 = require('toBase64');
const JSON = require('JSON');

// Get settings
var mode = data.mode;
if (typeof mode!='string') mode = 'all';
const base64 = typeof data.base64=='boolean' ? data.base64 : false;

// Set Default Object
var obj = {};
var consent = { hasResponse:false };
var cm = { ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', analytics_storage:'denied' };

// Get aGTM
var agtm = callInWindow('aGTM.f.getVal', 'w', 'aGTM');
if (typeof agtm!='object' || typeof agtm.d!='object') return obj;

// Get Consent
if (typeof agtm.d.consent=='object') { consent = agtm.d.consent; }

// Get Consent Mode Signals.
// NOTE: aGTM.d.cm is written by the "aGTM - Consent Mode" TAG, not by the
// library. If that tag is not deployed, or this variable is evaluated before
// it has run, cm falls back to the all-denied default above (see README).
if (typeof agtm.d.cm=='object') { cm = agtm.d.cm; }

// Build return object
if (mode=='consent') { obj = consent; }
else if (mode=='cm') { obj = cm; }
else { obj = { consent:consent, cm:cm }; }

// as Base64?
if (base64) { return toBase64(JSON.stringify(obj)); }

// Return
return obj;

// EOF


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "aGTM.f.getVal"
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios:
- name: Consent mode returns the aGTM consent object
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.getVal') return { d: { consent: { hasResponse: true, services: ',GA,' } } };
    });
    let r = runCode({ mode: 'consent', base64: false });
    assertThat(r.hasResponse).isEqualTo(true);
    assertThat(r.services).isEqualTo(',GA,');
- name: Consent Mode mode returns the cm signals when present
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.getVal') return { d: { cm: { ad_storage: 'granted', analytics_storage: 'granted' } } };
    });
    let r = runCode({ mode: 'cm', base64: false });
    assertThat(r.ad_storage).isEqualTo('granted');
- name: Consent Mode falls back to all-denied when aGTM.d.cm is absent
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.getVal') return { d: { consent: { hasResponse: true } } };
    });
    let r = runCode({ mode: 'cm', base64: false });
    assertThat(r.ad_storage).isEqualTo('denied');
    assertThat(r.analytics_storage).isEqualTo('denied');
- name: All mode wraps consent and cm together
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.getVal') return { d: { consent: { hasResponse: true }, cm: { ad_storage: 'granted' } } };
    });
    let r = runCode({ mode: 'all', base64: false });
    assertThat(r.consent.hasResponse).isEqualTo(true);
    assertThat(r.cm.ad_storage).isEqualTo('granted');
- name: Base64 output is a string
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.getVal') return { d: { consent: { hasResponse: true } } };
    });
    let r = runCode({ mode: 'consent', base64: true });
    assertThat(typeof r).isEqualTo('string');
- name: Missing aGTM returns an empty object
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.getVal') return undefined;
    });
    let r = runCode({ mode: 'all', base64: false });
    assertThat(r).isDefined();
    assertThat(r.consent).isEqualTo(undefined);
setup: ''


___NOTES___

# aGTM Custom Template

- Version 1.1
- Autor: Andi Petzoldt <andi@petzoldt.net>
- Last Update: 13.07.2026

## Description

Variable exposing the current aGTM consent state and/or the Google Consent Mode
signals.

## Changelog

### Version 1.1 (13.07.2026)

- Fixed the internal displayName ("aGTM var - Consent" -> "aGTM var - Consent
  Info").
- Documented that the `cm`/`all` modes read `aGTM.d.cm`, which is written by
  the "aGTM - Consent Mode" TAG (not the library). Without that tag, or when
  evaluated before it runs, the Consent Mode signals fall back to all-denied
  (README + inline note).
- Least-privilege permissions: removed the dead `logToConsole` require, the
  `logging` permission and the unused read `aGTM` global (only execute on
  `aGTM.f.getVal` remains).
- Added ___TESTS___ scenarios.


