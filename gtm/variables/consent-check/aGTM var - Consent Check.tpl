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
  "displayName": "aGTM var - Consent Check",
  "description": "Variable to check a special consent signal",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "SELECT",
    "name": "mode",
    "displayName": "Field to check",
    "macrosInSelect": true,
    "selectItems": [
      {
        "value": "purposes",
        "displayValue": "Purposes"
      },
      {
        "value": "services",
        "displayValue": "Services"
      },
      {
        "value": "vendors",
        "displayValue": "Vendors"
      },
      {
        "value": "purposeIDs",
        "displayValue": "Purpose IDs"
      },
      {
        "value": "serviceIDs",
        "displayValue": "Service IDs"
      },
      {
        "value": "vendorIDs",
        "displayValue": "Vendor IDs"
      }
    ],
    "simpleValueType": true
  },
  {
    "type": "TEXT",
    "name": "value",
    "displayName": "String value to check",
    "simpleValueType": true,
    "help": "e.g. \",Google Analytics,\""
  },
  {
    "type": "SELECT",
    "name": "return",
    "displayName": "Return Value",
    "macrosInSelect": false,
    "selectItems": [
      {
        "value": "boolean",
        "displayValue": "as Boolean (true/false)"
      },
      {
        "value": "integer",
        "displayValue": "as Integer (0/1)"
      },
      {
        "value": "cm",
        "displayValue": "as Consent Mode (denied/granted)"
      }
    ],
    "simpleValueType": true
  },
  {
    "type": "CHECKBOX",
    "name": "stringify",
    "checkboxText": "Return as string?",
    "simpleValueType": true
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

// https://developers.google.com/tag-platform/tag-manager/templates/api?hl=de

// Import needed libraries
const log = require('logToConsole');
const callInWindow = require('callInWindow');
const makeString = require('makeString');

// Get settings
var mode = data.mode;
var v = data.value;
var r = data.return;
var s = typeof data.stringify=='boolean' ? data.stringify : false;

// Set Default
var f = '';
var consent = false;

// Get aGTM
var agtm = callInWindow('aGTM.f.getVal', 'w', 'aGTM');
if (typeof agtm!='object' || typeof agtm.d!='object' || typeof agtm.d.consent!='object') return consent;

// Check and get field
if (typeof mode=='string' && mode && typeof agtm.d.consent[mode]=='string') { f = agtm.d.consent[mode]; }

// Check Consent
if (f && f.indexOf(v)!==-1) { consent = true; }

// Build return value
var c = consent;
switch (r) {
  case 'integer':
    c = consent ? 1 : 0;
    break;
  case 'cm':
    c = consent ? 'granted' : 'denied';
    break;
}

// Return
return s ? makeString(c) : c;

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
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios: []
setup: ''


___NOTES___

Created on 7.6.2024, 14:10:22


