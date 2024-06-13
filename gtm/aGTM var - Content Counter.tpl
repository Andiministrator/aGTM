___INFO___

{
  "type": "MACRO",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "aGTM var - Content Counter",
  "description": "Counts the words or images of a document",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "SELECT",
    "name": "thing",
    "displayName": "What to count?",
    "macrosInSelect": false,
    "selectItems": [
      {
        "value": "-",
        "displayValue": "What would you like to count?"
      },
      {
        "value": "words",
        "displayValue": "Words"
      },
      {
        "value": "images",
        "displayValue": "Images"
      }
    ],
    "simpleValueType": true
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

// Import needed libraries
const log = require('logToConsole');
const callInWindow = require('callInWindow');

// Get Config
var thing = typeof data.thing=='string' ? data.thing : '';

// Pageinfo Config
var pi = {
  countWords: thing=='words' ? true : false,
  countImages: thing=='images' ? true : false,
};

// get info
var o = callInWindow('aGTM.f.pageinfo',pi);

// Return
switch (thing) {
  case 'words': return typeof o.words=='number' ? o.words : 0;
  case 'images': return typeof o.images=='number' ? o.images : 0;
  default: return null;
}

// EOF


___WEB_PERMISSIONS___

[
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
            "string": "all"
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
                    "string": "aGTM.f.pageinfo"
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

scenarios: []


___NOTES___

Created on 7.6.2024, 14:10:22


