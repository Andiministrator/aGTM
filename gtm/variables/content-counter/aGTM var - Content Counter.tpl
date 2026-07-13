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
const callInWindow = require('callInWindow');

// Get Config
var thing = typeof data.thing=='string' ? data.thing : '';

// Pageinfo Config
var pi = {
  countWords: thing=='words' ? true : false,
  countImages: thing=='images' ? true : false,
};

// get info. Guard against aGTM not being loaded yet: pageinfo returns undefined
// then, and o.words/o.images below would throw. Fall back to an empty object.
var o = callInWindow('aGTM.f.pageinfo',pi) || {};

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

scenarios:
- name: Counts words from pageinfo
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.pageinfo') return { words: 42, images: 3 };
    });
    let r = runCode({ thing: 'words' });
    assertThat(r).isEqualTo(42);
- name: Counts images from pageinfo
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.pageinfo') return { words: 42, images: 3 };
    });
    let r = runCode({ thing: 'images' });
    assertThat(r).isEqualTo(3);
- name: Missing aGTM returns 0 instead of throwing
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.pageinfo') return undefined;
    });
    let r = runCode({ thing: 'words' });
    assertThat(r).isEqualTo(0);
- name: Unknown selection returns null
  code: |-
    mock('callInWindow', function(fn) {
      if (fn === 'aGTM.f.pageinfo') return { words: 42, images: 3 };
    });
    let r = runCode({ thing: '-' });
    assertThat(r).isEqualTo(null);
setup: ''


___NOTES___

# aGTM Custom Template

- Version 1.1
- Autor: Andi Petzoldt <andi@petzoldt.net>
- Last Update: 13.07.2026

## Description

Variable counting the words or images of the current document via
`aGTM.f.pageinfo`.

## Changelog

### Version 1.1 (13.07.2026)

- Null guard: if aGTM is not loaded yet, `aGTM.f.pageinfo` returns undefined
  and the `o.words`/`o.images` access threw. It now falls back to an empty
  object and returns `0` instead.
- Least-privilege permissions: removed the dead `logToConsole` require and the
  unused `logging` permission (only execute on `aGTM.f.pageinfo` remains).
- Added ___TESTS___ scenarios.


