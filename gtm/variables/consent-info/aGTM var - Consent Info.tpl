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
  "displayName": "aGTM var - Consent",
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
const log = require('logToConsole');
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

// Get Consent Mode Signals
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
              },
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
                    "string": "aGTM"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": false
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
  },
  {
    "instance": {
      "key": {
        "publicId": "logging",
        "versionId": "1"
      },
      "param": [
        {
          "key": "environments",
          "value": {
            "type": 1,
            "string": "debug"
          }
        }
      ]
    },
    "isRequired": true
  }
]


___TESTS___

scenarios: []
setup: ''


___NOTES___

Created on 7.6.2024, 14:10:22


