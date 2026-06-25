___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.


___INFO___

{
  "type": "CLIENT",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "aGTM v1.5",
  "brand": {
    "id": "brand_dummy",
    "displayName": "Andiministrator",
    "thumbnail": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAC0UExURRwjMyQpNBUcLXRqUW1vbhQdMg0ZNDY2NlNINmZbTFhSTEdGST1BSystM1RZZXtjNMuYMtSnSqqVZB0jLrSLNViCeix0jSeOrFSWpI6PlOG2WaOjooZ0VGtWOd6mM1R0bRFxqA6ayhmsziytymfJ4qzT6RkyViFScCFfnRltm7W7yf/ae1ppW2d7hBU9hdHP0WFdZ0eHlI9xMP39/c2ubi5neVSdzQgJIkE7MjmDk4Okx////1LXy/oAAAABYktHRDs5DvRsAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAB3RJTUUH6gQbDAgpiuIPGgAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNS0wNi0wM1QxNTowNDoyNiswMDowMFs/7osAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjUtMDYtMDNUMTU6MDQ6MjYrMDA6MDAqYlY3AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA0LTI3VDEyOjA4OjQxKzAwOjAwVDHRxgAAAahJREFUOMvdkuuSojAQhXMhhBCCEBSIEWVwBh0WQRBc8f0fbEGdKapmX2D3q/xIVZ9UTncfAP4tIJzd/1JH2EAAEBOhsTwJ0FwHISSUmqbFbO6QSQKEg7j4fs1dRAlYeJ4/Il0zgIC6zEHzT4nlLVdhFMVKrjUIgNhw9G1oPGay3aVvWZbt3z+Ur00qOZp3QKzt7m2fRqNgUqy1dNCrrdEyJAJ4OI+y9HD8DOPwo7B/uQgS8jQorISViZ+rU6Xq86kuakMpTzKcWGJqFW+MJv5sZa5qo3BPTq0uqi7aro8bjDEEkq2yK//tYV3XunAvho7ry6XAHbnF2Y5JIHEZ7ZuDdEcB17VGytBnQ9vy0EdRiTcAMYzLVTMMQ9yEfdOPhH04hOFwKjG2RxMooKNLxnBZ7r4oS4ZZYtEAPWcYBGLRupzbL7hhb7ggJPiaBBHtbdkdq/xQVdUxTa93ryOzMRK6ECbc6utxIt2/35ddjmYJoZZFKRDe+n6duCu/cx6peCFuRDwW3279Tned72MYwPOPeEFgCqtt2wWnggDIf0ZykjyA4hm4/4g/u14pfQWVTDQAAAAASUVORK5CYII\u003d"
  },
  "description": "aGTM Client for serverside Google Tag Manager",
  "containerContexts": [
    "SERVER"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "GROUP",
    "name": "aGTMsetup",
    "displayName": "GTM Container Setup",
    "groupStyle": "ZIPPY_OPEN",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "gtm_id_match",
        "checkboxText": "Fire only GTM container matching the ID in URL",
        "simpleValueType": true,
        "help": "If not checked, all of the following GTM Containers will be fired."
      },
      {
        "type": "SIMPLE_TABLE",
        "name": "gtm",
        "displayName": "Configure GTM Container",
        "simpleTableColumns": [
          {
            "defaultValue": "",
            "displayName": "GTM Container ID",
            "name": "gtm_id",
            "type": "TEXT",
            "valueHint": "GTM-XYZ123",
            "isUnique": true
          },
          {
            "defaultValue": true,
            "displayName": "Consent Check",
            "name": "gtm_consent",
            "type": "SELECT",
            "selectItems": [
              {
                "value": true,
                "displayValue": "yes"
              },
              {
                "value": false,
                "displayValue": "no"
              }
            ],
            "macrosInSelect": true
          },
          {
            "defaultValue": false,
            "displayName": "Use env Parameter",
            "name": "gtm_use",
            "type": "SELECT",
            "valueHint": "Example: \u0027\u0026gtm_auth\u003dABC123xyz\u0026gtm_preview\u003denv-1\u0026gtm_cookies_win\u003dx\u0027",
            "selectItems": [
              {
                "value": true,
                "displayValue": "yes"
              },
              {
                "value": false,
                "displayValue": "no"
              }
            ]
          },
          {
            "defaultValue": "https://www.googletagmanager.com/gtm.js",
            "displayName": "GTM Container URL",
            "name": "gtm_url",
            "type": "TEXT",
            "valueHint": "If you use an own url to the GTM (e.g. using the serverside Google Tag Manager), you can set your URL here. Leave it blank if you don\u0027t know what this means. If this option is not set (or if it is empty) the standard GTM URL will be used (https://www.googletagmanager.com/gtm.js)."
          },
          {
            "defaultValue": "",
            "displayName": "Comment",
            "name": "comment",
            "type": "TEXT"
          }
        ],
        "newRowButtonText": "Add a GTM Container",
        "notSetText": "Please setup at least one GTM Container.\u003cbr/\u003e Otherwise no GTM Container will load (through aGTM) ...",
        "help": "\u003cb\u003eConfigure the GTM Container(s)\u003c/b\u003e that should fire. \u003cbr /\u003e\u003cbr /\u003e\nSettings: \u003cbr /\u003e\u003cbr /\u003e\n\u003cul\u003e\n  \u003cli\u003e\u003cb\u003eGTM Container ID:\u003c/b\u003e The ID of the (web)GTM Container, \u003cbr /\u003ee.g. GTM-XYZ123\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n  \u003cli\u003e\u003cb\u003eConsent Check:\u003c/b\u003e If \"Yes\", the GTM container will only be fired once user consent is obtained. \u003cbr /\u003eOtherwise the Container will be fired independing on the User Consent.\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n  \u003cli\u003e\u003cb\u003eUse env Parameter:\u003c/b\u003e If \"Yes\", all (env-)URL parameters (of the aGTM Request), that starts with \"gtm_\" are adopted and appended to the container URL. \u003cbr /\u003eExample for env Parameters: \u003cbr /\u003e\"...aGTM.js?id\u003dGTM-XXXXX\u003cb\u003e\u0026amp;gtm_auth\u003dABC123xyz\u0026amp;gtm_preview\u003denv-1\u0026amp;gtm_cookies_win\u003dx\u003c/b\u003e\"\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n  \u003cli\u003e\u003cb\u003eGTM Container URL:\u003c/b\u003e The source URL from which the GTM container should be loaded. \u003cbr /\u003eTypically: \u003cbr /\u003ehttps://YOUR.SERVERSIDE-TAG-MANAGER-HOSTNAME/gtm.js \u003cbr /\u003eor (without serverside tagging) \u003cbr /\u003ehttps://www.googletagmanager.com/gtm.js\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n  \u003cli\u003e\u003cb\u003eComment:\u003c/b\u003e Just a comment, \u003cbr /\u003ee.g. to better distinguish between different containers/customers\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n\u003c/ul\u003e"
      },
      {
        "type": "LABEL",
        "name": "gtm_help",
        "displayName": "Read the \u003ca href\u003d\"https://github.com/Andiministrator/aGTM?tab\u003dreadme-ov-file#gtm\"\u003eDocumentation Chapter\u003c/a\u003e for more information."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMoptions",
    "displayName": "aGTM Options",
    "groupStyle": "ZIPPY_OPEN",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "aPageview",
        "checkboxText": "Fire GTM dataLayer Event \"aPageview\"",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If this is ticked. aGTM will automatically fire a dataLayer Event for aPageview."
      },
      {
        "type": "CHECKBOX",
        "name": "vPageview",
        "checkboxText": "Fire GTM dataLayer Event \"vPageview\" (deprecated)",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If this is ticked. aGTM will automatically fire a dataLayer Event for vPageview."
      },
      {
        "type": "CHECKBOX",
        "name": "vPageviews",
        "checkboxText": "Send Virtual Pageviews",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "Send virtual pageviews (as vPageview) if the URL changes (HistoryChange), but the page doesn\u0027t reload."
      },
      {
        "type": "CHECKBOX",
        "name": "dlStateEvents",
        "checkboxText": "Fire GTM dataLayer Events \"DOMloaded\" and \"PAGEready\"",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If this is ticked. aGTM will automatically fire dataLayer Events for DOMloaded and PAGEready."
      },
      {
        "type": "CHECKBOX",
        "name": "sendConsentEvent",
        "checkboxText": "Send a dataLayer Event (\"aGTM_consent\") for Consent Data.",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If ticked, a separate Consent Event named \"aGTM_consent\" will be fired (after Consent Info is available)"
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMcmp",
    "displayName": "Consent Check",
    "groupStyle": "ZIPPY_OPEN",
    "subParams": [
      {
        "type": "SELECT",
        "name": "cmp",
        "displayName": "Used CMP (Consent Tool)",
        "macrosInSelect": true,
        "selectItems": [
          {
            "value": "aGTM.f.consent_check\u003dfunction(o){if(\"string\"!\u003dtypeof o||\"init\"!\u003do\u0026\u0026\"update\"!\u003do)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:o}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003do\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"\u003d\u003dtypeof BorlabsCookie\u0026\u0026\"function\"\u003d\u003dtypeof BorlabsCookie.getCookie){if(\"object\"!\u003dtypeof borlabsCookieConfig||\"object\"!\u003dtypeof borlabsCookieConfig.cookies)return!1;var e\u003dborlabsCookieConfig.cookies;if(\"object\"!\u003dtypeof BorlabsCookie||\"function\"!\u003dtypeof BorlabsCookie.getCookie)return!1;var n\u003dBorlabsCookie.getCookie()}else{if(\"object\"!\u003dtypeof borlabsCookieConfig||\"object\"!\u003dtypeof borlabsCookieConfig.services)return!1;e\u003dborlabsCookieConfig.services;if(\"object\"!\u003dtypeof BorlabsCookie)return!1;if(\"object\"!\u003dtypeof BorlabsCookie.Cookie._pluginCookie)return!1;if(\"string\"!\u003dtypeof(n\u003dBorlabsCookie.Cookie._pluginCookie).expires||!n.expires)return!1}if(\"object\"!\u003dtypeof n||\"object\"!\u003dtypeof n.consents)return!1;var t\u003dn.consents;\"string\"\u003d\u003dtypeof n.uid\u0026\u0026(aGTM.d.consent.consent_id\u003dn.uid);var i\u003d[],s\u003d[],r\u003d[],a\u003d[],f\u003d0;for(var c in e)if(\"string\"\u003d\u003dtypeof c){s.push(c);for(var l\u003d0;l\u003cc.length;l++)\"string\"\u003d\u003dtypeof c[l]\u0026\u0026c[l]\u0026\u0026a.push(c[l])}for(var c in t)if(\"string\"\u003d\u003dtypeof c){i.push(c),\"essential\"\u003d\u003dc\u0026\u00260;var p\u003dt[c];for(l\u003d0;l\u003cp.length;l++)\"string\"\u003d\u003dtypeof p[l]\u0026\u0026p[l]\u0026\u0026r.push(p[l]),\"essential\"\u003d\u003dc\u0026\u0026f++}i.length\u003e0\u0026\u0026(aGTM.d.consent.purposes\u003d\",\"+i.join(\",\")+\",\"),r.length\u003e0\u0026\u0026(aGTM.d.consent.services\u003d\",\"+r.join(\",\")+\",\");var g\u003d\"No Services\";r.length\u003e0\u0026\u0026r.length\u003d\u003da.length?g\u003d\"Consent full accepted\":r.length\u003e0\u0026\u0026r.length\u003d\u003df?g\u003d\"Consent declined\":r.length\u003e0\u0026\u0026r.length\u003ca.length?g\u003d\"Consent partially accepted\":r.length\u003e0\u0026\u0026(g\u003d\"Consent given by user\"),aGTM.d.consent.feedback\u003dg,aGTM.d.consent.hasResponse\u003d!0};",
            "displayValue": "Borlabs v2"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof borlabsCookieConfig||\"object\"!\u003dtypeof borlabsCookieConfig.serviceGroups)return!1;var n\u003dborlabsCookieConfig.serviceGroups;if(\"object\"!\u003dtypeof BorlabsCookie)return!1;if(\"object\"!\u003dtypeof BorlabsCookie.Cookie._pluginCookie)return!1;var o\u003dBorlabsCookie.Cookie._pluginCookie;if(\"string\"!\u003dtypeof o.expires||!o.expires)return!1;if(\"object\"!\u003dtypeof o||\"object\"!\u003dtypeof o.consents)return!1;var s\u003do.consents;\"string\"\u003d\u003dtypeof o.uid\u0026\u0026(aGTM.d.consent.consent_id\u003do.uid);var t\u003d[],r\u003d[],i\u003d0,a\u003d[],l\u003d[],c\u003d0;for(var f in n)if(\"string\"\u003d\u003dtypeof f\u0026\u0026(r.push(f),n[f].serviceIds,n[f].serviceIds\u0026\u0026n[f].serviceIds.length\u003e0))for(var p\u003dn[f].serviceIds,g\u003d0;g\u003cp.length;g++)\"string\"\u003d\u003dtypeof p[g]\u0026\u0026p[g]\u0026\u0026l.push(p[g]);for(var f in s)if(\"string\"\u003d\u003dtypeof f){t.push(f),\"essential\"\u003d\u003df\u0026\u0026i++;var b\u003ds[f];for(g\u003d0;g\u003cb.length;g++)\"string\"\u003d\u003dtypeof b[g]\u0026\u0026b[g]\u0026\u0026a.push(b[g]),\"essential\"\u003d\u003df\u0026\u0026c++}t.length\u003e0\u0026\u0026(aGTM.d.consent.purposes\u003d\",\"+t.join(\",\")+\",\"),a.length\u003e0\u0026\u0026(aGTM.d.consent.services\u003d\",\"+a.join(\",\")+\",\");var d\u003d\"No Services\";a.length\u003e0\u0026\u0026a.length\u003d\u003dl.length?d\u003d\"Consent full accepted\":a.length\u003e0\u0026\u0026a.length\u003d\u003dc?d\u003d\"Consent declined\":a.length\u003e0\u0026\u0026a.length\u003cl.length?d\u003d\"Consent partially accepted\":a.length\u003e0\u0026\u0026(d\u003d\"Consent given by user\"),aGTM.d.consent.feedback\u003dd;var u\u003dJSON.parse(JSON.stringify(aGTM.d.consent));return u.borlabs_purposes_configured\u003dr,u.borlabs_services_configured\u003dl,u.borlabs_purposes_essential\u003di,u.borlabs_purposes_all\u003dr.length,u.borlabs_purposes_consented\u003dt.length,u.borlabs_services_essential\u003dc,u.borlabs_services_all\u003dl.length,u.borlabs_services_consented\u003da.length,window.borlabs_aData\u003du,aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Borlabs v3"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"init\"!\u003d\u003de\u0026\u0026\"update\"!\u003d\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;var n\u003dwindow.CCM\u0026\u0026\"object\"\u003d\u003dtypeof window.CCM?window.CCM:{},t\u003d[],o\u003d[],a\u003d!1,i\u003d\"\";if(!0\u003d\u003d\u003dn.unavailable\u0026\u0026\"string\"\u003d\u003dtypeof n.error\u0026\u0026(a\u003d!0,i\u003d\"Consent error: \"+n.error),!a\u0026\u0026(!0\u003d\u003d\u003dn.consentRequired\u0026\u0026!0!\u003d\u003dn.consent||\"object\"!\u003dtypeof n.acceptedEmbeddings))return!1;if(n.acceptedEmbeddings\u0026\u0026\"number\"\u003d\u003dtypeof n.acceptedEmbeddings.length)for(var d\u003d0;d\u003cn.acceptedEmbeddings.length;d++){var c\u003dn.acceptedEmbeddings[d]||null;c\u0026\u0026\"string\"\u003d\u003dtypeof c.id\u0026\u0026\"string\"\u003d\u003dtypeof c.name\u0026\u0026(t.push(c.name.replace(/,/g,\"\")),o.push(c.id.replace(/,/g,\"\")))}return t.length\u003e0\u0026\u0026(aGTM.d.consent.services\u003d\",\"+t.join(\",\")+\",\"),o.length\u003e0\u0026\u0026(aGTM.d.consent.serviceIDs\u003d\",\"+o.join(\",\")+\",\"),a||!0!\u003d\u003dn.fullConsentGiven?a||(i\u003d\"Consent (partially or full) declined\"):i\u003d\"Consent full accepted\",aGTM.d.consent.feedback\u003di,\"string\"\u003d\u003dtypeof n.ucid\u0026\u0026(aGTM.d.consent.consent_id\u003dn.ucid),aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "CCM19"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(n){if(\"string\"!\u003dtypeof n||\"init\"!\u003dn\u0026\u0026\"update\"!\u003dn)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:n}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},aGTM.d.consent.req_ctr\u003daGTM.d.consent.req_ctr||0,aGTM.d.consent.blocked\u003d\"boolean\"\u003d\u003dtypeof aGTM.d.consent.blocked\u0026\u0026aGTM.d.consent.blocked,\"init\"\u003d\u003dn\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof Clickskeks||\"function\"!\u003dtypeof Clickskeks.getCurrentAllowedConfig)return!1;var e\u003dClickskeks.getCurrentAllowedConfig(),t\u003d[],o\u003d0;for(var a in e)e[a]\u0026\u0026t.push(a),o++;if(!o)return!1;aGTM.d.consent.purposes\u003d\",\"+t.join(\",\")+\",\";var c\u003d\"Consent available\";return 0\u003d\u003do?c\u003d\"Consent declined\":o\u003d\u003dt.length?c\u003d\"Consent full accepted\":o\u003et.length\u0026\u0026(c\u003d\"Consent partially accepted\"),aGTM.d.consent.feedback\u003dc,aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Clickkeks"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},aGTM.d.consent.req_ctr\u003daGTM.d.consent.req_ctr||0,aGTM.d.consent.blocked\u003d\"boolean\"\u003d\u003dtypeof aGTM.d.consent.blocked\u0026\u0026aGTM.d.consent.blocked,\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"function\"!\u003dtypeof __cmp)return!(!aGTM.d.consent.blocked||!aGTM.d.consent.hasResponse)||(10\u003d\u003daGTM.d.consent.req_ctr++\u0026\u0026fetch(\"https://cdn.consentmanager.net/delivery/1x1.gif\").catch((function(e){aGTM.d.consent.blocked\u003d!0,aGTM.d.consent.feedback\u003d\"CMP is blocked\",aGTM.d.consent.hasResponse\u003d!0})),aGTM.d.consent.blocked);var n\u003d__cmp(\"getCMPData\");if(\"object\"!\u003dtypeof n)return!1;if(\"boolean\"!\u003dtypeof n.consentExists||!n.consentExists)return!1;if(\"boolean\"!\u003dtypeof n.userChoiceExists||!n.userChoiceExists)return!1;if(\"object\"!\u003dtypeof n.purposeConsents||\"object\"!\u003dtypeof n.purposesList||\"object\"!\u003dtypeof n.purposeLI)return!1;if(\"object\"!\u003dtypeof n.vendorConsents||\"object\"!\u003dtypeof n.vendorsList||\"object\"!\u003dtypeof n.vendorLI)return!1;for(var o\u003d0,s\u003d0,t\u003d[],c\u003d[],r\u003d0;r\u003cn.purposesList.length;r++)s++,n.purposeConsents[n.purposesList[r].id]||n.purposeLI[n.purposesList[r].id]?(c.push(n.purposesList[r].id),t.push(n.purposesList[r].name)):0,n.purposeConsents[n.purposesList[r].id]\u0026\u0026o++;var i\u003d[],a\u003d[];for(r\u003d0;r\u003cn.vendorsList.length;r++)s++,n.vendorConsents[n.vendorsList[r].id]||n.vendorLI[n.vendorsList[r].id]?(a.push(n.vendorsList[r].id),i.push(n.vendorsList[r].name)):0,n.vendorConsents[n.vendorsList[r].id]\u0026\u0026o++;aGTM.d.consent.purposes\u003d\",\"+t.join(\",\")+\",\",aGTM.d.consent.purposeIDs\u003d\",\"+c.join(\",\")+\",\",aGTM.d.consent.vendors\u003d\",\"+i.join(\",\")+\",\",aGTM.d.consent.vendorIDs\u003d\",\"+a.join(\",\")+\",\";var d\u003d\"Consent available\";return s\u003d\u003do?d\u003d\"Consent full accepted\":s\u0026\u0026!o?d\u003d\"Consent declined\":s\u0026\u0026o\u003cs\u0026\u0026(d\u003d\"Consent partially accepted\"),aGTM.d.consent.feedback\u003dd,\"string\"\u003d\u003dtypeof n.consentstring\u0026\u0026(aGTM.d.consent.consent_id\u003dn.consentstring),aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Consentmanager"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(n){if(\"string\"!\u003dtypeof n||\"init\"!\u003dn\u0026\u0026\"update\"!\u003dn)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:n}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003dn\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof Cookiebot)return!1;var e\u003dCookiebot;if(\"boolean\"!\u003dtypeof e.hasResponse||\"object\"!\u003dtypeof e.consent)return!1;if(!e.hasResponse)return!1;var o\u003daGTM.c.purposes?aGTM.c.purposes.split(\",\"):[],t\u003d0,a\u003d0;for(k in e.consent)\"stamp\"!\u003dk\u0026\u0026\"method\"!\u003dk\u0026\u0026\"boolean\"\u003d\u003dtypeof e.consent[k]\u0026\u0026(a++,e.consent[k]\u0026\u0026(t++,o.push(k)));aGTM.d.consent.purposes\u003do.length\u003e0?\",\"+o.join(\",\")+\",\":\"\";var s\u003d\"Consent available\";return 0\u003d\u003da?s\u003d\"No purposes available\":t\u003ca?s\u003d\"Consent (partially or full) declined\":t\u003e\u003da\u0026\u0026(s\u003d\"Consent accepted\"),aGTM.d.consent.feedback\u003ds,\"string\"\u003d\u003dtypeof e.consentID\u0026\u0026(aGTM.d.consent.consent_id\u003de.consentID),aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Cookiebot"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof CookieFirst||\"boolean\"!\u003dtypeof CookieFirst.hasConsented)return!1;var n\u003dCookieFirst;if(\"object\"!\u003dtypeof n.consent||\"object\"!\u003dtypeof n.acceptedServices)return!1;if(!n.hasConsented)return!1;var o\u003d[],t\u003dn.consent?n.consent:{};for(k in t)\"string\"\u003d\u003dtypeof k\u0026\u0026\"boolean\"\u003d\u003dtypeof t[k]\u0026\u0026t[k]\u0026\u0026(o.push(k.replace(\",\",\"\")));var a\u003d[],s\u003dn.acceptedServices?n.acceptedServices:{},i\u003d0,r\u003d0;for(k in s)\"string\"\u003d\u003dtypeof k\u0026\u0026\"boolean\"\u003d\u003dtypeof s[k]\u0026\u0026(r++,s[k]\u0026\u0026(i++,a.push(k.replace(\",\",\"\"))));o.length\u003e0\u0026\u0026(o.sort(),aGTM.d.consent.purposes\u003d\",\"+o.join(\",\")+\",\"),a.length\u003e0\u0026\u0026(a.sort(),aGTM.d.consent.services\u003d\",\"+a.join(\",\")+\",\");var c\u003d\"Consent available\";return r\u003e\u003di?c\u003d\"Consent (partially or full) declined\":r\u003d\u003di\u0026\u0026(c\u003d\"Consent full accepted\"),aGTM.d.consent.feedback\u003dc,\"string\"\u003d\u003dtypeof n.visitorId\u0026\u0026(aGTM.d.consent.consent_id\u003dn.visitorId),aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "CookieFirst"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof klaro||\"function\"!\u003dtypeof klaro.getManager)return!1;var n\u003dklaro.getManager();if(\"boolean\"!\u003dtypeof n.confirmed||!n.confirmed)return!1;if(\"object\"!\u003dtypeof n.config||\"object\"!\u003dtypeof n.config.services)return!1;for(var o\u003d{},t\u003dn.config.services,s\u003d0;s\u003ct.length;s++)if(\"string\"\u003d\u003dtypeof t[s].name){var a\u003d[],r\u003dt[s].name;if(\"object\"\u003d\u003dtypeof t[s].purposes\u0026\u0026\"number\"\u003d\u003dtypeof t[s].purposes.length\u0026\u0026t[s].purposes.length\u003e0){a\u003dt[s].purposes;for(var c\u003d0;c\u003ca.length;c++){var f\u003da[c];\"object\"\u003d\u003dtypeof o[f]?o[f].push(r):o[f]\u003d[r]}}}if(\"object\"!\u003dtypeof n.consents||!n.consents)return!1;var i\u003daGTM.c.purposes?aGTM.c.purposes.split(\",\"):[];for(var p in o){0;var l\u003d!0;for(s\u003d0;s\u003co[p].length;s++){var M\u003do[p];\"boolean\"!\u003dtypeof n.consents[M]||n.consents[M]||(l\u003d!1)}l\u0026\u0026i.push(p)}var G\u003daGTM.c.services?aGTM.c.services.split(\",\"):[],T\u003d0;for(var M in n.consents)T++,\"boolean\"\u003d\u003dtypeof n.consents[M]\u0026\u0026n.consents[M]\u0026\u0026G.push(M);aGTM.d.consent.purposes\u003di.length\u003e0?\",\"+i.join(\",\")+\",\":\"\",aGTM.d.consent.services\u003dG.length\u003e0?\",\"+G.join(\",\")+\",\":\"\";var g\u003d\"Consent available\";return 0\u003d\u003dT?g\u003d\"No services available\":0\u003d\u003dG.length\u0026\u0026T\u003e0?g\u003d\"Consent declined\":G.length\u003d\u003dT?g\u003d\"Consent full accepted\":G.length\u003e0\u0026\u0026G.length\u003cT\u0026\u0026(g\u003d\"Consent partially accepted\"),aGTM.d.consent.feedback\u003dg,aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Klaro!"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;var n\u003d\"co\";n+\u003d\"ok\",n+\u003d\"ie\";var t\u003dnew RegExp(\"cc_\"+n+\"\u003d([^;]+)\");try{var o\u003ddocument,s\u003dt.exec(o[n])}catch(e){}if(void 0\u003d\u003d\u003ds)s\u003d\"\";else\"string\"!\u003dtypeof(s\u003dnull!\u003ds?s[1]:\"\")\u0026\u0026(s\u003ds.toString());if(!s)return g;try{var r\u003dJSON.parse(decodeURIComponent(s))}catch(e){return console.log(\"Error by Consent Check: \"+e.message),!1}if(\"object\"!\u003dtypeof r||\"object\"!\u003dtypeof r.categories||\"object\"!\u003dtypeof r.services)return!1;for(var a\u003d[],c\u003d[],i\u003d0,f\u003d0;f\u003cr.categories.length;f++)\"string\"\u003d\u003dtypeof r.categories[f]\u0026\u0026r.categories[f]\u0026\u0026a.push(r.categories[f]);for(k in r.services)if(\"string\"\u003d\u003dtypeof k\u0026\u0026\"object\"\u003d\u003dtypeof r.services[k]){var g\u003dr.services[k];for(f\u003d0;f\u003cg.length;f++)\"string\"\u003d\u003dtypeof g[f]\u0026\u0026g[f]\u0026\u0026(c.push(g[f]),\"necessary\"!\u003dk\u0026\u0026\"essential\"!\u003dk||i++)}a.length\u003e0\u0026\u0026(a.sort(),aGTM.d.consent.purposes\u003d\",\"+a.join(\",\")+\",\"),c.length\u003e0\u0026\u0026(c.sort(),aGTM.d.consent.services\u003d\",\"+c.join(\",\")+\",\");var p\u003d\"No Services\";return c.length\u003e0\u0026\u0026c.length\u003d\u003di?p\u003d\"Consent declined\":c.length\u003e0\u0026\u0026c.length\u003ei\u0026\u0026(p\u003d\"Consent accepted\"),aGTM.d.consent.feedback\u003dp,aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Magento CC Cookie"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof localStorage||!localStorage)return!1;if(\"object\"!\u003dtypeof sessionStorage||!sessionStorage)return!1;var n\u003dlocalStorage.getItem(\"consent\");if(\"string\"!\u003dtypeof n||!n)return!1;var t\u003dJSON.parse(n);if(\"object\"!\u003dtypeof t||!t||!t.created||!t.services)return!1;var o\u003dsessionStorage.getItem(\"consent-cache\");if(\"string\"!\u003dtypeof o||!o)return!1;var s\u003dJSON.parse(o);if(\"object\"!\u003dtypeof s||!s||!s.categories)return!1;for(var a\u003d[],r\u003d[],c\u003d[],i\u003d0;i\u003cs.categories.length;i++){var d\u003ds.categories[i];\"object\"\u003d\u003dtypeof d\u0026\u0026d\u0026\u0026d.name\u0026\u0026d.id\u0026\u0026(d.required\u0026\u0026c.push(d.name),(d.checked||d.required)\u0026\u0026(a.push(d.name),r.push(d.id)))}var f\u003d[],p\u003d0,g\u003d[];for(i\u003d0;i\u003ct.services.length;i++){var G\u003dt.services[i];\"object\"\u003d\u003dtypeof G\u0026\u0026G\u0026\u0026G.name\u0026\u0026G.id\u0026\u0026(p++,G.hasConsent\u0026\u0026(f.push(G.name),g.push(G.id)))}a.length\u003e0\u0026\u0026(a.sort(),r.sort(),c.sort()),aGTM.d.consent.purposes\u003d\",\"+a.join(\",\")+\",\",aGTM.d.consent.purposes_ids\u003d\",\"+r.join(\",\")+\",\",aGTM.d.consent.purposes_essential\u003d\",\"+c.join(\",\")+\",\",f.length\u003e0\u0026\u0026(f.sort(),g.sort()),aGTM.d.consent.services\u003d\",\"+f.join(\",\")+\",\",aGTM.d.consent.services_ids\u003d\",\"+g.join(\",\")+\",\",aGTM.d.consent.feedback\u003d\"Consent given by user\",f.length\u003e0\u0026\u0026f.length\u003d\u003dp?aGTM.d.consent.feedback\u003d\"Consent full accepted\":f.length\u003e0\u0026\u0026f.length\u003cp?aGTM.d.consent.feedback\u003d\"Consent partially accepted\":0\u003d\u003df.length\u0026\u0026p\u003e0\u0026\u0026(aGTM.d.consent.feedback\u003d\"Consent declined\"),aGTM.d.consent.hasResponse\u003d!0};",
            "displayValue": "Matomo Consent Check"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(t){if(\"string\"!\u003dtypeof t||\"init\"!\u003dt\u0026\u0026\"update\"!\u003dt)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:t}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003dt\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof Optanon||\"function\"!\u003dtypeof Optanon.GetDomainData)return!1;var n\u003dOptanon.GetDomainData();if(\"object\"!\u003dtypeof n.ConsentIntegrationData||\"object\"!\u003dtypeof n.ConsentIntegrationData.consentPayload||\"object\"!\u003dtypeof n.ConsentIntegrationData.consentPayload.customPayload||\"object\"!\u003dtypeof n.ConsentIntegrationData.consentPayload.purposes||\"object\"!\u003dtypeof n.ConsentModel||\"string\"!\u003dtypeof n.ConsentModel.Name)return!1;var e\u003dn.ConsentIntegrationData.consentPayload;if(\"number\"!\u003dtypeof e.customPayload.Interaction)return!1;if(\"object\"!\u003dtypeof e.dsDataElements||\"string\"!\u003dtypeof e.dsDataElements.Country)return!1;aGTM.d.consent.interactions\u003de.customPayload.Interaction;var o\u003d!1;if(\"string\"\u003d\u003dtypeof e.dsDataElements.InteractionType\u0026\u0026e.dsDataElements.InteractionType\u0026\u0026(o\u003d!0),\"opt-in\"\u003d\u003dn.ConsentModel.Name\u0026\u0026\"number\"\u003d\u003dtypeof e.customPayload.Interaction\u0026\u0026e.customPayload.Interaction\u003e0\u0026\u0026(o\u003d!0),!o)return!1;aGTM.d.consent.consent_model\u003dn.ConsentModel.Name,\"string\"\u003d\u003dtypeof n.cctId\u0026\u0026(aGTM.d.consent.consent_id\u003dn.cctId),\"object\"\u003d\u003dtypeof e.dsDataElements\u0026\u0026\"string\"\u003d\u003dtypeof e.dsDataElements.InteractionType\u0026\u0026(aGTM.d.consent.interaction_type\u003de.dsDataElements.InteractionType),\"object\"\u003d\u003dtypeof e.dsDataElements\u0026\u0026\"string\"\u003d\u003dtypeof e.dsDataElements.Country\u0026\u0026(aGTM.d.consent.country\u003de.dsDataElements.Country);for(var a\u003d{},s\u003d0,r\u003d{},p\u003d0,c\u003d0,i\u003d{},d\u003d0;d\u003ce.purposes.length;d++)i[e.purposes[d].Id]\u003de.purposes[d].TransactionType;for(d\u003d0;d\u003cn.Groups.length;d++)\"string\"\u003d\u003dtypeof i[n.Groups[d].PurposeId]\u0026\u0026(\"NO_CHOICE\"\u003d\u003di[n.Groups[d].PurposeId]\u0026\u0026(r[n.Groups[d].OptanonGroupId]\u003dn.Groups[d].GroupName.replace(/[^\\w\\d _-]+/g,\"\"),p++),\"NO_CHOICE\"!\u003di[n.Groups[d].PurposeId]\u0026\u0026\"CONFIRMED\"!\u003di[n.Groups[d].PurposeId]||(a[n.Groups[d].OptanonGroupId]\u003dn.Groups[d].GroupName.replace(/[^\\w\\d _-]+/g,\"\"),s++),c++);var u\u003d[],f\u003d[];for(k in a)u.push(k),f.push(a[k]);return aGTM.d.consent.purposeIDs\u003d\",\"+u.join(\",\")+\",\",aGTM.d.consent.purposes\u003d\",\"+f.join(\",\")+\",\",aGTM.d.consent.interaction_type?aGTM.d.consent.feedback\u003daGTM.d.consent.interaction_type:aGTM.d.consent.feedback\u003dc\u003d\u003dp?\"No OptIn Categories available\":s\u003d\u003dc?\"Consent full accepted\":s\u003d\u003dp?\"Consent declined\":s\u003cc?\"Consent partially accepted\":\"Consent given\",aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "OneTrust CookiePro"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;var n\u003daGTM.c.purposes?aGTM.c.purposes.split(\",\"):[];if(\"object\"!\u003dtypeof cc||\"function\"!\u003dtypeof cc.getUserPreferences)return!1;var t\u003dcc.getUserPreferences(),a\u003dt.accept_type,o\u003dt.accepted_categories,c\u003dt.rejected_categories;if(\"string\"!\u003dtypeof a||\"object\"!\u003dtypeof o||\"object\"!\u003dtypeof c)return!1;for(var s\u003do.length,r\u003ds+c.length,f\u003d0;f\u003cs;f++)\"string\"\u003d\u003dtypeof o[f]\u0026\u0026n.push(o[f]);aGTM.d.consent.purposes\u003dn.length\u003e0?\",\"+n.join(\",\")+\",\":\"\";var i\u003d\"Consent available\";return 0\u003d\u003dr?i\u003d\"No purposes available\":s\u003cr?i\u003d\"Consent (partially) declined\":\"all\"\u003d\u003da\u0026\u0026(i\u003d\"Consent full accepted\"),aGTM.d.consent.feedback\u003di,aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Orestbida Cookie Consent"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},aGTM.d.consent.req_ctr\u003daGTM.d.consent.req_ctr||0,aGTM.d.consent.blocked\u003d\"boolean\"\u003d\u003dtypeof aGTM.d.consent.blocked\u0026\u0026aGTM.d.consent.blocked,\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;var n\u003dnew RegExp(\"acris_cookie_acc\u003d([^;]+)\");try{var o\u003ddocument;a\u003dn.exec(o.cookie)}catch(e){}if(void 0\u003d\u003d\u003da)var a\u003d\"\";else a\u003dnull!\u003da?unescape(a[1]):\"\";if(!a)return!1;n\u003dnew RegExp(\"acris_cookie_first_activated\u003d([^;]+)\");try{o\u003ddocument;t\u003dn.exec(o.cookie)}catch(e){}if(void 0\u003d\u003d\u003dt)var t\u003d\"\";else t\u003dnull!\u003dt?decodeURI(t[1]):\"\";if(!t)return!1;var i\u003d[],c\u003dt.split(\"|\").filter(Boolean);if(!c.length)return!1;for(var s\u003d{11:\"Google Analytics\",14:\"Google Adsense\",15:\"Google Ads Conversion Tracking\",18:\"Awin Affiliate Marketing\",49:\"Facebook Pixel\",230:\"Criteo Retargeting\",287:\"Emarsys\",446:\"Bing Ads\"},r\u003d0;r\u003cc.length;r++)i.push(s[c[r]]?s[c[r]]:c[r]);return aGTM.d.consent.services\u003d\",\"+i.join(\",\")+\",\",aGTM.d.consent.serviceIDs\u003d\",\"+c.join(\",\")+\",\",aGTM.d.consent.feedback\u003d\"Consent available\",aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Shopware Acris Cookie"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(n){if(\"string\"!\u003dtypeof n||\"init\"!\u003dn\u0026\u0026\"update\"!\u003dn)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:n}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003dn\u0026\u0026aGTM.d.consent.hasResponse)return!0;var e\u003d\"co\";e+\u003d\"ok\",e+\u003d\"ie\";var t\u003dnew RegExp(\"Consent\u003d([^;]+)\");try{var a\u003ddocument,o\u003dt.exec(a[e])}catch(n){}if(void 0\u003d\u003d\u003do)o\u003d\"\";else\"string\"!\u003dtypeof(o\u003dnull!\u003do?o[1]:\"\")\u0026\u0026(o\u003do.toString());if(!o)return!1;var s\u003d\"string\"\u003d\u003dtypeof o\u0026\u0026o.length\u003e0\u0026\u0026/..+/.test(o);return aGTM.d.consent.purposes\u003ds?\",all,\":\"\",aGTM.d.consent.services\u003ds?\",all,\":\"\",aGTM.d.consent.vendors\u003ds?\",all,\":\"\",aGTM.d.consent.feedback\u003ds?\"Consent accepted\":\"Consent declined\",aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Simple Cookie RegEx Check"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"function\"!\u003dtypeof __tcfapi)return!1;var a\u003d!1,n\u003dnull;__tcfapi(\"getCustomVendorConsents\",2,(function(e,o){a\u003do,n\u003de}));if(\"boolean\"!\u003dtypeof a||!a)return!1;if(\"object\"!\u003dtypeof n||!n)return!1;if(\"boolean\"!\u003dtypeof n.newUser||n.newUser)return!1;if(\"object\"!\u003dtypeof n.grants||!n.grants)return!1;var o\u003daGTM.c.purposes?aGTM.c.purposes.split(\",\"):[],t\u003d[],r\u003d0,s\u003d{\"64480473796ea90689e58702\":\"Store and/or access information on a device\",\"64480473796ea90689e58722\":\"Use limited data to select advertising\",\"64480473796ea90689e58740\":\"Create profiles for personalised advertising\",\"64480473796ea90689e5875e\":\"Use profiles to select personalised advertising\",\"64480473796ea90689e5877c\":\"Create profiles to personalise content\",\"64480473796ea90689e58782\":\"Use profiles to select personalised content\",\"64480473796ea90689e58788\":\"Measure advertising performance\",\"64480473796ea90689e587a7\":\"Measure content performance\",\"64480473796ea90689e587ac\":\"Understand audiences through statistics or combinations of data from different sources\",\"64480473796ea90689e587ca\":\"Develop and improve services\",\"654b93ba18140306b70499b7\":\"Use limited data to select content\",\"64ff0f9f653e3805a8662e8c\":\"Functional\",\"64ff0f9f653e3805a8662e95\":\"Data Share\",\"64ff0f9f653e3805a8662e9b\":\"Social Media\",\"654b9434a5bdb40569d39098\":\"Data use for Identification\",\"64480473796ea90689e58722\":\"Use limited data to select advertising\",\"64480473796ea90689e58788\":\"Measure advertising performance\",\"64480473796ea90689e587a7\":\"Measure content performance\",\"64480473796ea90689e587ac\":\"Understand audiences through statistics or combinations of data from different sources\",\"64480473796ea90689e587ca\":\"Develop and improve services\"},c\u003daGTM.c.vendors?aGTM.c.vendors.split(\",\"):[],i\u003d[],f\u003d0,d\u003d{\"5e7e1298b8e05c4854221be9\":\"Google Inc.\",\"5ee7add94c24944fdb5c5ac6\":\"Hotjar\",\"5e717c8e69966540e4554f05\":\"Instagram\",\"5e839a38b8e05c4e491e738e\":\"Pinterest Inc.\",\"64ad94508c172204ffdb22a4\":\"plista GmbH\",\"5e7ac3fae30e7d1bc1ebf5e8\":\"YouTube\",\"5e542b3a4cd8884eb41b5a72\":\"Google Analytics\",\"63657be8bcb5be04a169758e\":\"Google Maps\",\"5f0f1187b8e05c109c2b8464\":\"JW Player\",\"5e952f6107d9d20c88e7c975\":\"Google Tag Manager\",\"5e7ced57b8e05c5a7d171cda\":\"Adform A/S\",\"62d1372b293cdf1ca87a36f0\":\"CleverPush GmbH\",\"5e98e7f1b8e05c111d01b462\":\"Criteo SA\",\"5ed6aeb2b8e05c2bbe33f4fa\":\"EASYmedia GmbH\",\"5f1aada6b8e05c306c0597d7\":\"Google Advertising Products\",\"5f48d229b8e05c60a307ad97\":\"Kameleoon SAS\",\"5e7ced57b8e05c485246ccde\":\"Outbrain UK Ltd\",\"5ee15bc6b8e05c164c398ae3\":\"RTB House S.A.\",\"5f23e826b8e05c0c0d4fdb8f\":\"Sourcepoint Technologies Inc. (non-CMP)\",\"5e37fc3e56a5e6615502f9c4\":\"Taboola Europe Limited\",\"5efefe25b8e05c109c2b8324\":\"The Reach Group GmbH\",\"5e865b36b8e05c48537f60a7\":\"The UK Trade Desk Ltd\",\"5e716fc09a0b5040d575080f\":\"Facebook Inc.\"};for(k in n.grants){var b\u003dJSON.parse(JSON.stringify(n.grants[k]));f++;var l\u003d!0;if(\"object\"\u003d\u003dtypeof b.purposeGrants)for(p in b.purposeGrants){for(var u\u003d!1,G\u003d0;G\u003ct.length;G++)t[G]\u003d\u003d\u003dp\u0026\u0026(u\u003d!0);u||(r++,\"boolean\"\u003d\u003dtypeof b.purposeGrants[p]\u0026\u0026b.purposeGrants[p]?(t.push(p),o.push(\"string\"\u003d\u003dtypeof s[p]?s[p]:p)):\"boolean\"!\u003dtypeof b.purposeGrants[p]||b.purposeGrants[p]||(l\u003d!1))}\"boolean\"\u003d\u003dtypeof b.vendorGrant\u0026\u0026b.vendorGrant\u0026\u0026l\u0026\u0026(i.push(k),c.push(\"string\"\u003d\u003dtypeof d[k]?d[k]:k))}var M\u003do.map((function(e){return e.replace(\",\",\"\")})),T\u003dc.map((function(e){return e.replace(\",\",\"\")}));return aGTM.d.consent\u003daGTM.d.consent||{},aGTM.d.consent.purposes\u003d\",\"+M.join(\",\")+\",\",aGTM.d.consent.purposeIDs\u003d\",\"+t.join(\",\")+\",\",aGTM.d.consent.vendors\u003d\",\"+T.join(\",\")+\",\",aGTM.d.consent.vendorIDs\u003d\",\"+i.join(\",\")+\",\",aGTM.d.consent.feedback\u003d\"Consent available\",c.length\u003c\u003df\u0026\u0026o.length\u003c\u003dr?aGTM.d.consent.feedback\u003d\"Consent (partially) declined\":c.length\u003d\u003df\u0026\u0026o.length\u003d\u003dr\u0026\u0026(aGTM.d.consent.feedback\u003d\"Consent full accepted\"),aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Sourcepoint"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(n){if(\"string\"!\u003dtypeof n||\"init\"!\u003dn\u0026\u0026\"update\"!\u003dn)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:n}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003dn\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof localStorage||!localStorage)return!1;var e\u003dlocalStorage.getItem(\"consentPermission\");if(\"string\"!\u003dtypeof e||!e)return!1;if(\"true\"!\u003de)return!1;var t\u003d[];\"true\"\u003d\u003de\u0026\u0026t.push(\"Consent\"),aGTM.d.consent.purposes\u003d\",\"+t.join(\",\")+\",\",aGTM.d.consent.feedback\u003d\"Consent accepted\",aGTM.d.consent.hasResponse\u003d!0};",
            "displayValue": "Tramino"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(n){if(\"string\"!\u003dtypeof n||\"init\"!\u003dn\u0026\u0026\"update\"!\u003dn)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:n}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003dn\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof UC_UI||\"function\"!\u003dtypeof UC_UI.getServicesBaseInfo)return!1;var t\u003dUC_UI.getServicesBaseInfo();if(\"object\"!\u003dtypeof t)return!1;if(0\u003d\u003dt.length)return!1;for(var e\u003d\"string\"\u003d\u003dtypeof aGTM.c.purposes?aGTM.c.purposes:\"\",o\u003d0,s\u003daGTM.c.services?aGTM.c.services.split(\",\"):[],a\u003d[],i\u003d0,r\u003d0,c\u003d0;c\u003ct.length;c++){if(\"object\"!\u003dtypeof t[c].consent)return!1;if(\"string\"\u003d\u003dtypeof t[c].id){var f\u003dt[c].consent;if(\"object\"!\u003dtypeof f.history)return!1;if(\"boolean\"!\u003dtypeof f.status||0\u003d\u003df.history.length)return!1;if(1\u003d\u003df.history.length\u0026\u0026\"string\"\u003d\u003dtypeof f.history[0].action\u0026\u0026\"onInitialPageLoad\"\u003d\u003df.history[0].action\u0026\u0026!f.status)return!1;if(aGTM.d.consent.nonEU\u003daGTM.d.consent.nonEU||!1,f.history.length\u003e0)for(var l\u003d0;l\u003cf.history.length;l++)\"string\"\u003d\u003dtypeof f.history[l].action\u0026\u0026\"boolean\"\u003d\u003dtypeof f.history[l].status\u0026\u0026\"onNonEURegion\"\u003d\u003df.history[l].action\u0026\u0026f.history[l].status\u0026\u0026(aGTM.d.consent.nonEU\u003d!0);if(i++,(aGTM.d.consent.nonEU||\"boolean\"\u003d\u003dtypeof t[c].isEssential\u0026\u0026t[c].isEssential)\u0026\u0026r++,f.status){s.push(\"string\"\u003d\u003dtypeof t[c].name?t[c].name.replace(\",\",\"\"):t[c].id),a.push(t[c].id);var p\u003d\"string\"\u003d\u003dtypeof t[c].categorySlug?t[c].categorySlug.replace(\",\",\"\"):\"Unknown Purpose \"+(o+1).toString();e.indexOf(\",\"+p+\",\")\u003c0\u0026\u0026(o++,e||(e\u003d\",\"),e\u003de+p+\",\")}}}aGTM.d.consent.purposes\u003de,s.length\u003e0\u0026\u0026(aGTM.d.consent.services\u003d\",\"+s.join(\",\")+\",\"),a.length\u003e0\u0026\u0026(aGTM.d.consent.serviceIDs\u003d\",\"+a.join(\",\")+\",\");var g\u003d\"Consent available\";return s.length\u003c\u003dr?g\u003d\"Consent declined\":s.length\u003d\u003di?g\u003d\"Consent full accepted\":i\u003es.length\u0026\u0026(g\u003d\"Consent partially accepted\"),aGTM.d.consent.feedback\u003dg,\"function\"\u003d\u003dtypeof UC_UI.getControllerId\u0026\u0026(aGTM.d.consent.consent_id\u003dUC_UI.getControllerId()),aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Usercentrics v2"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(n){if(\"string\"!\u003dtypeof n||\"init\"!\u003dn\u0026\u0026\"update\"!\u003dn)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:n}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003dn\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof __ucCmp||\"object\"!\u003dtypeof __ucCmp.cmpController||\"object\"!\u003dtypeof __ucCmp.cmpController.consent||\"object\"!\u003dtypeof __ucCmp.cmpController.dps||\"object\"!\u003dtypeof __ucCmp.cmpController.dps.categories||\"object\"!\u003dtypeof __ucCmp.cmpController.dps.services)return!1;if(\"boolean\"!\u003dtypeof __ucCmp.cmpController.consent.required||__ucCmp.cmpController.consent.required)return!1;var e\u003d__ucCmp.cmpController.dps.categories,t\u003d[];for(var o in e)if(e.hasOwnProperty(o)\u0026\u0026-1\u003d\u003d\u003dt.indexOf(o)){0;var c\u003de[o].state;\"ALL_ACCEPTED\"!\u003d\u003dc\u0026\u0026\"SOME_ACCEPTED\"!\u003d\u003dc||t.push(o)}var s\u003d__ucCmp.cmpController.dps.services,r\u003d[],l\u003d[],a\u003d0,p\u003d0;for(var i in s)if(s.hasOwnProperty(i)){a++;var u\u003ds[i];if(u.essential\u0026\u0026-1\u003d\u003d\u003dl.indexOf(i)\u0026\u0026p++,u.consent\u0026\u0026u.consent.given\u0026\u0026(-1\u003d\u003d\u003dr.indexOf(u.name)\u0026\u0026r.push(u.name),-1\u003d\u003d\u003dl.indexOf(i)\u0026\u0026l.push(i)),u.subservices)for(var d in u.subservices)if(u.subservices.hasOwnProperty(d)){a++;var C\u003du.subservices[d];C.essential\u0026\u0026-1\u003d\u003d\u003dl.indexOf(d)\u0026\u0026p++,C.consent\u0026\u0026C.consent.given\u0026\u0026(r.push(C.name),l.push(d))}}t.length\u003e0\u0026\u0026(aGTM.d.consent.purposes\u003d\",\"+t.join(\",\")+\",\"),r.length\u003e0\u0026\u0026(aGTM.d.consent.services\u003d\",\"+r.join(\",\")+\",\"),l.length\u003e0\u0026\u0026(aGTM.d.consent.serviceIDs\u003d\",\"+l.join(\",\")+\",\");var _\u003d\"Consent available\";r.length\u003e0\u0026\u0026r.length\u003d\u003da?_\u003d\"Consent full accepted\":r.length\u003e0\u0026\u0026r.length\u003ep?_\u003d\"Consent partially accepted\":r.length\u003e0\u0026\u0026r.length\u003d\u003dp?_\u003d\"Consent declined\":0\u003d\u003dr.length\u0026\u0026(_\u003d\"No Consent configured\"),aGTM.d.consent.feedback\u003d_,aGTM.d.consent.consent_id\u003d\"\",\"string\"\u003d\u003dtypeof __ucCmp.cmpController.consent.controllerId\u0026\u0026(aGTM.d.consent.consent_id\u003d__ucCmp.cmpController.consent.controllerId),\"object\"\u003d\u003dtypeof __ucCmp.cmpController.consent.setting\u0026\u0026__ucCmp.cmpController.consent.setting\u0026\u0026(aGTM.d.consent.cmp_id\u003d__ucCmp.cmpController.consent.setting.id||null,aGTM.d.consent.legal\u003d__ucCmp.cmpController.consent.setting.legal||null),aGTM.d.consent.language\u003d__ucCmp.cmpController.consent.language||null,aGTM.d.consent.required\u003d__ucCmp.cmpController.consent.required||null,aGTM.d.consent.status\u003d__ucCmp.cmpController.consent.status||null,aGTM.d.consent.type\u003d__ucCmp.cmpController.consent.type||null,aGTM.d.consent.updatedBy\u003d__ucCmp.cmpController.consent.updatedBy||null,aGTM.d.consent.version\u003d__ucCmp.cmpController.consent.version||null;var m\u003dJSON.parse(JSON.stringify(aGTM.d.consent));return m.hasResponse\u003d!0,window.usercentrics_aData\u003dm,aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Usercentrics v3 and newer Cookiebot"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(window.Shopify.loadFeatures([{name:\"consent-tracking-api\",version:\"0.1\"}],(e\u003d\u003e{})),\"object\"!\u003dtypeof Shopify||\"object\"!\u003dtypeof Shopify.customerPrivacy||\"function\"!\u003dtypeof Shopify.customerPrivacy.currentVisitorConsent||\"function\"!\u003dtypeof Shopify.customerPrivacy.getTrackingConsent)return!1;var n\u003dShopify.customerPrivacy.getTrackingConsent();if(\"string\"!\u003dtypeof n||\"yes\"!\u003dn\u0026\u0026\"no\"!\u003dn)return!1;var o\u003dShopify.customerPrivacy.currentVisitorConsent();o.sale_of_data||\"function\"!\u003dtypeof Shopify.customerPrivacy.saleOfDataAllowed||(o.sale_of_data\u003dShopify.customerPrivacy.saleOfDataAllowed()?\"yes\":\"no\");var t\u003d!0;\"function\"!\u003dtypeof Shopify.customerPrivacy.shouldShowBanner||Shopify.customerPrivacy.shouldShowBanner()||(t\u003d!1);var a\u003d[],i\u003d0;for(var c in o)i++,\"yes\"!\u003d\u003do[c]\u0026\u0026t||a.push(c);a.length\u003e0\u0026\u0026a.sort(),aGTM.d.consent.purposes\u003d\",essential,\"+a.join(\",\")+\",\",\"function\"\u003d\u003dtypeof Shopify.customerPrivacy.consentId\u0026\u0026(aGTM.d.consent.consent_id\u003dShopify.customerPrivacy.consentId()),\"function\"\u003d\u003dtypeof Shopify.customerPrivacy.getRegion\u0026\u0026(aGTM.d.consent.region\u003dShopify.customerPrivacy.getRegion()),aGTM.d.consent.feedback\u003d\"Consent given by user\",a.length\u003e0\u0026\u0026a.length\u003d\u003di?aGTM.d.consent.feedback\u003d\"Consent full accepted\":a.length\u003e0\u0026\u0026a.length\u003ci?aGTM.d.consent.feedback\u003d\"Consent partially accepted\":0\u003d\u003da.length\u0026\u0026i\u003e0\u0026\u0026(aGTM.d.consent.feedback\u003d\"Consent declined\"),aGTM.d.consent.hasResponse\u003d!0};",
            "displayValue": "Shopify Consent Tool"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"object\"!\u003dtypeof localStorage||!localStorage)return!1;if(\"object\"!\u003dtypeof perspectiveData||!perspectiveData||\"string\"!\u003dtypeof perspectiveData.campaignId)return!1;var n\u003dperspectiveData.campaignId,t\u003dlocalStorage.getItem(\"perspective.tracking-preferences.\"+n);if(\"string\"!\u003dtypeof t||!t)return!1;var a\u003dJSON.parse(t),o\u003d[],c\u003d0;for(var i in a)c++,!0\u003d\u003d\u003da[i]\u0026\u0026o.push(i);o.length\u003e0\u0026\u0026o.sort(),aGTM.d.consent.services\u003d\",\"+o.join(\",\")+\",Google Analytics,LinkedIn Insight Tag,Meta Pixel,\",aGTM.d.consent.feedback\u003d\"Consent given by user\",o.length\u003e0\u0026\u0026o.length\u003d\u003dc?aGTM.d.consent.feedback\u003d\"Consent full accepted\":o.length\u003e0\u0026\u0026o.length\u003cc?aGTM.d.consent.feedback\u003d\"Consent partially accepted\":0\u003d\u003do.length\u0026\u0026c\u003e0\u0026\u0026(aGTM.d.consent.feedback\u003d\"Consent declined\"),aGTM.d.consent.hasResponse\u003d!0};",
            "displayValue": "Perspective Funnel Consent Banner"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;if(\"function\"!\u003dtypeof sp||\"object\"!\u003dtypeof sp.allGivenConsents||!sp.allGivenConsents||\"function\"!\u003dtypeof sp.checkConsent)return!1;for(var n\u003d[],o\u003d[],t\u003d[],s\u003d[],a\u003d0,c\u003d0;c\u003csp.allGivenConsents.length;c++){var i\u003dsp.allGivenConsents[c];if(\"object\"\u003d\u003dtypeof i\u0026\u0026i\u0026\u0026void 0!\u003d\u003di.ComplianceTypeID\u0026\u0026\"string\"\u003d\u003dtypeof i.ComplianceType\u0026\u0026(i.ConsentGiven\u0026\u0026(n.push(i.ComplianceType),o.push(String(i.ComplianceTypeID))),\"string\"\u003d\u003dtypeof i.PluginPreferences)){try{var p\u003dJSON.parse(i.PluginPreferences)}catch(e){p\u003d[]}if(\"object\"\u003d\u003dtypeof p\u0026\u0026\"number\"\u003d\u003dtypeof p.length\u0026\u0026p)for(var f\u003d0;f\u003cp.length;f++){var l\u003dp[f];\"object\"\u003d\u003dtypeof l\u0026\u0026l\u0026\u0026void 0!\u003d\u003di.ComplianceTypeID\u0026\u0026\"string\"\u003d\u003dtypeof l.ComplianceType\u0026\u0026(a++,sp.checkConsent(l.ComplianceType)\u0026\u0026(t.push(l.ComplianceType),s.push(String(l.ComplianceTypeID))))}}}aGTM.d.consent.purposes\u003d\",\"+n.join(\",\")+\",\",aGTM.d.consent.purposesIDs\u003d\",\"+o.join(\",\")+\",\",aGTM.d.consent.services\u003d\",\"+t.join(\",\")+\",\",aGTM.d.consent.servicesIDs\u003d\",\"+s.join(\",\")+\",\",aGTM.d.consent.feedback\u003d\"Consent given by user\",t.length\u003e0\u0026\u0026t.length\u003d\u003da?aGTM.d.consent.feedback\u003d\"Consent full accepted\":t.length\u003e0\u0026\u0026t.length\u003ca?aGTM.d.consent.feedback\u003d\"Consent partially accepted\":0\u003d\u003dt.length\u0026\u0026a\u003e0\u0026\u0026(aGTM.d.consent.feedback\u003d\"Consent declined\"),aGTM.d.consent.hasResponse\u003d!0};",
            "displayValue": "Secure Privacy"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;var n\u003dnew RegExp(\"(^|;\\\\s*)cookiePreferences\u003d([^;]*)\").exec(document.cookie);if(!n)return!1;var o,a\u003ddecodeURIComponent(n[2]);try{o\u003dJSON.parse(a)}catch(e){return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e11\",{error:\"invalid JSON\"}),!1}var t\u003d[],i\u003d[];if(o\u0026\u0026o.groups)for(var r in o.groups)if(o.groups.hasOwnProperty(r)){var s\u003do.groups[r];if(s\u0026\u0026!0\u003d\u003d\u003ds.active\u0026\u0026i.push(s.name),s\u0026\u0026s.cookies)for(var c in s.cookies)if(s.cookies.hasOwnProperty(c)){var f\u003ds.cookies[c];f\u0026\u0026!0\u003d\u003d\u003df.active\u0026\u0026\"string\"\u003d\u003dtypeof f.name\u0026\u0026t.push(f.name)}}return aGTM.d.consent.services\u003dt.length?\",\"+t.join(\",\")+\",\":\"\",aGTM.d.consent.purposes\u003di.length?\",\"+i.join(\",\")+\",\":\"\",aGTM.d.consent.feedback\u003dt.length?\"Consent accepted\":\"Consent declined\",aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Shopware 5 Cookie"
          },
          {
            "value": "aGTM.f.consent_check\u003dfunction(e){if(\"string\"!\u003dtypeof e||\"init\"!\u003de\u0026\u0026\"update\"!\u003de)return\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"e10\",{action:e}),!1;if(aGTM.d.consent\u003daGTM.d.consent||{},\"init\"\u003d\u003de\u0026\u0026aGTM.d.consent.hasResponse)return!0;var n\u003d\"co\";n+\u003d\"ok\",n+\u003d\"ie\";var t\u003dnew RegExp(\"cookie-preference\u003d([^;]+)\");try{var o\u003ddocument,a\u003dt.exec(o[n])}catch(e){return!1}if(void 0\u003d\u003d\u003da)a\u003d\"\";else\"string\"!\u003dtypeof(a\u003dnull!\u003da?a[1]:\"\")\u0026\u0026(a\u003da.toString());if(!a||\"1\"!\u003da)return!1;for(var i\u003d[],c\u003ddocument.cookie.split(\";\"),s\u003d0;s\u003cc.length;s++){var r\u003dc[s].split(\"\u003d\");if(!(r.length\u003c2)){var f\u003dr[0].replace(/^\\s+|\\s+$/g,\"\"),d\u003dr[1]?decodeURIComponent(r[1]):\"\";/-enabled$/.test(f)\u0026\u0026\"1\"\u003d\u003d\u003dd\u0026\u0026i.push(f)}}return aGTM.d.consent.services\u003di.length?\",\"+i.join(\",\")+\",\":\"\",aGTM.d.consent.feedback\u003di.length?\"Consent accepted\":\"Consent declined\",aGTM.d.consent.hasResponse\u003d!0,\"function\"\u003d\u003dtypeof aGTM.f.log\u0026\u0026aGTM.f.log(\"m2\",JSON.parse(JSON.stringify(aGTM.d.consent))),!0};",
            "displayValue": "Shopware 6 Cookie"
          }
        ],
        "simpleValueType": true,
        "notSetText": "Not set / Custom"
      },
      {
        "type": "CHECKBOX",
        "name": "cmp_custom_active",
        "checkboxText": "Custom CMP Check",
        "simpleValueType": true,
        "enablingConditions": [
          {
            "paramName": "cmp",
            "paramValue": "",
            "type": "NOT_PRESENT"
          }
        ]
      },
      {
        "type": "TEXT",
        "name": "cmp_custom_code",
        "displayName": "Your Code for CMP Check",
        "simpleValueType": true,
        "defaultValue": "aGTM.f.consent_check \u003d aGTM.f.consent_check || function (action) { if (!aGTM.d.config) { aGTM.f.log(\u0027e2\u0027, null); return false; } if (typeof action!\u003d\u0027string\u0027 || (action!\u003d\u0027init\u0027\u0026\u0026action!\u003d\u0027update\u0027)) { aGTM.f.log(\u0027e3\u0027, {action:action}); return false; } aGTM.d.consent \u003d aGTM.d.consent || {}; if (action\u003d\u003d\u0027init\u0027 \u0026\u0026 aGTM.d.consent.hasResponse) return true; var purposes \u003d typeof aGTM.c.purposes\u003d\u003d\u0027string\u0027 ? \u0027,\u0027+aGTM.c.purposes+\u0027,\u0027 : \u0027\u0027; var services \u003d typeof aGTM.c.services\u003d\u003d\u0027string\u0027 ? \u0027,\u0027+aGTM.c.services+\u0027,\u0027 : \u0027\u0027; var vendors \u003d typeof aGTM.c.vendors\u003d\u003d\u0027string\u0027 ? \u0027,\u0027+aGTM.c.vendors+\u0027,\u0027 : \u0027\u0027; aGTM.d.consent.purposes \u003d purposes; aGTM.d.consent.services \u003d services; aGTM.d.consent.vendors \u003d vendors; aGTM.d.consent.feedback \u003d \u0027no valid check fct given, cfg used\u0027; aGTM.d.consent.hasResponse \u003d true; aGTM.f.log(\u0027m2\u0027, JSON.parse(JSON.stringify(aGTM.d.consent))); return true; };",
        "enablingConditions": [
          {
            "paramName": "cmp_custom_active",
            "paramValue": true,
            "type": "EQUALS"
          }
        ]
      },
      {
        "type": "PARAM_TABLE",
        "name": "consent",
        "displayName": "Consent Check Conditions",
        "paramTableColumns": [
          {
            "param": {
              "type": "SELECT",
              "name": "consent_type",
              "displayName": "Type",
              "macrosInSelect": true,
              "selectItems": [
                {
                  "value": "gtmPurposes",
                  "displayValue": "gtmPurposes"
                },
                {
                  "value": "gtmServices",
                  "displayValue": "gtmServices"
                },
                {
                  "value": "gtmVendors",
                  "displayValue": "gtmVendors"
                }
              ],
              "simpleValueType": true
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "TEXT",
              "name": "consent_value",
              "displayName": "Value",
              "simpleValueType": true
            },
            "isUnique": false
          }
        ],
        "newRowButtonText": "Add Consent Check",
        "notSetText": "Add at least one consition, otherwise no consent check will run.",
        "help": "Setup the Consent Conditions. Add at least one consition, otherwise no consent check will run."
      },
      {
        "type": "GROUP",
        "name": "cmp_other",
        "displayName": "Advanced CMP Settings",
        "groupStyle": "ZIPPY_OPEN_ON_PARAM",
        "subParams": [
          {
            "type": "CHECKBOX",
            "name": "useListener",
            "checkboxText": "Use Event Listener (instead of a Timer)",
            "simpleValueType": true,
            "defaultValue": false,
            "help": "Use an event listener to check the consent (true). If it is false, a timer will be used (default) to check the consent. You should add the following command to your Consent Event Listener: aGTM.f.call_cc(); The function returns true, if the consent info has loaded successful, otherwise false. Make sure, that the aGTM lib is loaded before the event listener runs!* If you don\u0027t know what that means, leave this option to false (default). For more information, read the \u003ca href\u003d\"https://github.com/Andiministrator/aGTM#use-event-listeners-instead-of-the-default-timer\"\u003eDocumentation for \"Use Event Listeners instead of the default timer\"\u003c/a\u003e."
          },
          {
            "type": "TEXT",
            "name": "consent_events",
            "displayName": "Name(s) of Consent Event(s) in the dataLayer to update the Consent Data.",
            "simpleValueType": true,
            "canBeEmptyString": true,
            "defaultValue": "",
            "help": "Consent events (comma-separated) for updating the consent.\u003cbr /\u003e For more Information, read the \u003ca href\u003d\"https://github.com/Andiministrator/aGTM#updating-consent-information\"\u003eDocumentation Chapter Updating Consent Information\u003c/a\u003e.",
            "valueHint": "cmpEvent,cmpUpdate"
          }
        ]
      },
      {
        "type": "LABEL",
        "name": "cmp_help",
        "displayName": "Read the \u003ca href\u003d\"https://github.com/Andiministrator/aGTM?tab\u003dreadme-ov-file#consent-handling\"\u003eDocumentation Chapter\u003c/a\u003e for more information."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMother",
    "displayName": "Other aGTM Settings",
    "groupStyle": "ZIPPY_OPEN_ON_PARAM",
    "subParams": [
      {
        "type": "TEXT",
        "name": "gdl",
        "displayName": "Name of GTM Datalayer",
        "simpleValueType": true,
        "help": "If you need a diffrenet name (as \"dataLayer\") for the GTM Datalayer, you can specify the Datalayer Name here.",
        "valueHint": "dataLayer"
      },
      {
        "type": "SELECT",
        "name": "dlOrgPush",
        "displayName": "Action for dataLayer.push Hook",
        "macrosInSelect": false,
        "selectItems": [
          {
            "value": "-",
            "displayValue": "Do Nothing"
          },
          {
            "value": "log",
            "displayValue": "Just send an Exception Event"
          },
          {
            "value": "use",
            "displayValue": "Use the original function"
          },
          {
            "value": "restore",
            "displayValue": "Restore the overwritten function with the original function"
          }
        ],
        "simpleValueType": true,
        "defaultValue": "-",
        "help": "\u003cp\u003eThe dataLayer.push function is the connection from the dataLayer Array to the Google Tag Manager. If this function is changed, the connection can be lost. With this feature you can decide, what to do in this case.\u003c/p\u003e"
      },
      {
        "type": "GROUP",
        "name": "apiServices",
        "displayName": "Client Detection (Fingerprint \u0026 Bot Check)",
        "groupStyle": "ZIPPY_OPEN_ON_PARAM",
        "subParams": [
          {
            "type": "TEXT",
            "name": "client_ip",
            "displayName": "Client IP Address",
            "simpleValueType": true,
            "help": "Client IP address — used for <b>fingerprint generation</b> and (if enabled) <b>bot check</b>. Use the same variable as in your serverside_fingerprint template."
          },
          {
            "type": "TEXT",
            "name": "sgtm_host",
            "displayName": "sGTM Hostname (for Fingerprint)",
            "simpleValueType": true,
            "help": "Hostname of this sGTM instance — used for <b>fingerprint generation</b>. Must match the value in your serverside_fingerprint template (e.g. www.example.com)."
          },
          {
            "type": "CHECKBOX",
            "name": "botCheckEnabled",
            "checkboxText": "Enable Bot Check",
            "simpleValueType": true
          },
          {
            "type": "TEXT",
            "name": "botCheck",
            "displayName": "API URL for Bot Check",
            "simpleValueType": true,
            "help": "Optional \u003cb\u003eURL to check if a visitor is a bot\u003c/b\u003e. Leave empty to disable.\u003cbr /\u003e\u003cbr /\u003e\n\nIf set, a request will be sent to this URL with a \u003cb\u003eBase64-encoded JSON object\u003c/b\u003e:\u003cbr /\u003e\n\u003ccode\u003e{\"UserAgent\":\"\u0026lt;visitor user agent\u0026gt;\",\"ClientIP\":\"\u0026lt;visitor IP\u0026gt;\"}\u003c/code\u003e\u003cbr /\u003e\u003cbr /\u003e\nThe JSON object will be converted to Base64 and attached to the URL.\u003cbr /\u003e\nExample URL structure for the field value \"https://api.example.com/botCheckService/\":\u003cbr /\u003e\n\u003ccode\u003ehttps://api.example.com/botCheckService/BASE64VALUEOFJSONOBJECT\u003c/code\u003e\u003cbr /\u003e\u003cbr /\u003e\n\n\u003cb\u003eExample request URL:\u003c/b\u003e\u003cbr /\u003e\n\u003ccode\u003ehttps://api.example.com/botCheckService/eyJVc2VyQWdlbnQiOiAiTW96aWxsYS8uLi4iLCAiQ2xpZW50SVAiOiAiODcuMTIxLjE5Mi42NCJ9\u003c/code\u003e\u003cbr /\u003e\u003cbr /\u003e\n\nThe service must respond with \u003ccode\u003eContent-Type: application/json\u003c/code\u003e and a JSON object containing an \u003cb\u003e\u003ccode\u003eisBot\u003c/code\u003e\u003c/b\u003e field (\u003ccode\u003etrue\u003c/code\u003e or \u003ccode\u003efalse\u003c/code\u003e).\u003cbr /\u003e\u003cbr /\u003e\n\n\u003cb\u003eExample response:\u003c/b\u003e\u003cbr /\u003e\n\u003ccode\u003e{\"isBot\": false}\u003c/code\u003e\u003cbr /\u003e\u003cbr /\u003e\n\nIf \u003cb\u003e\u003ccode\u003eisBot\u003c/code\u003e \u003d true\u003c/b\u003e, the request will be aborted and the client-side GTM will \u003cb\u003enot\u003c/b\u003e be delivered."
          }
        ]
      },
      {
        "type": "GROUP",
        "name": "ckSettings",
        "displayName": "Consent-based GTM URL Parameter Handling",
        "groupStyle": "ZIPPY_OPEN_ON_PARAM",
        "subParams": [
          {
            "type": "PARAM_TABLE",
            "name": "ck_consent",
            "displayName": "Consent-based GTM URL Parameter Handling",
            "paramTableColumns": [
              {
                "param": {
                  "type": "SELECT",
                  "name": "ck_consent_type",
                  "displayName": "Type",
                  "macrosInSelect": true,
                  "selectItems": [
                    {
                      "value": "ckPurposes",
                      "displayValue": "ckPurposes"
                    },
                    {
                      "value": "ckServices",
                      "displayValue": "ckServices"
                    },
                    {
                      "value": "ckVendors",
                      "displayValue": "ckVendors"
                    }
                  ],
                  "simpleValueType": true
                },
                "isUnique": false
              },
              {
                "param": {
                  "type": "TEXT",
                  "name": "ck_consent_value",
                  "displayName": "Value",
                  "simpleValueType": true,
                  "help": "Add one or more (comma-separated) values ..."
                },
                "isUnique": false
              }
            ],
            "newRowButtonText": "Add Consent Check",
            "help": "\u003cp\u003e   Adds a \u003ccode\u003eck\u003c/code\u003e parameter to the GTM request URL (\u003ccode\u003egtm.js\u003c/code\u003e)    based on the user’s consent state. \u003c/p\u003e \u003cul\u003e   \u003cli\u003e\u003ccode\u003eck\u003d0\u003c/code\u003e → Feature inactive\u003c/li\u003e   \u003cli\u003e\u003ccode\u003eck\u003d1\u003c/code\u003e → Active, but no consent\u003c/li\u003e   \u003cli\u003e\u003ccode\u003eck\u003d2\u003c/code\u003e → Active, consent granted\u003c/li\u003e \u003c/ul\u003e \u003cp\u003e   Use this to pass consent information from your CMP to the client-side GTM (webGTM)    and the server-side GTM (sGTM). \u003c/p\u003e\n\u003cp\u003e⚠️ If multiple options are configured, all of them must be granted for the parameter value to switch to `2.\u003c/p\u003e"
          }
        ]
      },
      {
        "type": "TEXT",
        "name": "nonce",
        "displayName": "Nonce Value (for Consent Security Policy)",
        "simpleValueType": true,
        "help": "Nonce value for the file injections if CSP (Consent Security Policy) is used.\u003cbr /\u003e If it is set, the nonce will be added to all script-injections.",
        "defaultValue": ""
      },
      {
        "type": "CHECKBOX",
        "name": "debug",
        "checkboxText": "aGTM Debug Mode",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If this is ticked, the optout cookie will be ignored"
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMsession",
    "displayName": "Session \u0026 User Data",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "TEXT",
        "name": "tenant_id",
        "displayName": "Tenant ID",
        "simpleValueType": true,
        "defaultValue": "",
        "valueValidators": [
          {
            "type": "NON_EMPTY"
          }
        ],
        "help": "Tenant ID for the session API (e.g. cl_planai). Used in all API calls."
      },
      {
        "type": "TEXT",
        "name": "session_api_url",
        "displayName": "Session API URL",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Base URL for session API WITHOUT tenant and user suffix, e.g. http://api:5000/tp/session"
      },
      {
        "type": "CHECKBOX",
        "name": "consent_store_enabled",
        "checkboxText": "Enable Consent Store route",
        "simpleValueType": true,
        "defaultValue": true,
        "help": "If checked, aGTM POSTs consent diffs to a fixed path <code>/aGTMconsent</code> on this sGTM host. The handler manages the user-ID cookie AND persists the consent into the Session API record. Uncheck to disable the consent-store mechanism entirely (no POSTs, no server-side persistence)."
      },
      {
        "type": "CHECKBOX",
        "name": "consent_store_enc",
        "checkboxText": "Encrypt Consent Store POST payload",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If checked, the consent-store POST body is obfuscated using the Session Encryption Salt below."
      },
      {
        "type": "TEXT",
        "name": "session_salt",
        "displayName": "Session Encryption Salt (number)",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Numeric salt used by aGTM to obfuscate the consent-store POST payload (when Encrypt Consent Store POST is on) and as a fallback for the Transport Salt below."
      },
      {
        "type": "SELECT",
        "name": "cookie_mode",
        "displayName": "Cookie Mode",
        "macrosInSelect": false,
        "selectItems": [
          {
            "value": "always",
            "displayValue": "Always"
          },
          {
            "value": "never",
            "displayValue": "Never"
          },
          {
            "value": "consent",
            "displayValue": "Consent Required"
          }
        ],
        "simpleValueType": true,
        "defaultValue": "always",
        "help": "When to set a server-side user ID cookie"
      },
      {
        "type": "TEXT",
        "name": "consent_service",
        "displayName": "Consent Service",
        "simpleValueType": true,
        "defaultValue": "",
        "enablingConditions": [
          {
            "paramName": "cookie_mode",
            "paramValue": "consent",
            "type": "EQUALS"
          }
        ],
        "help": "Service name required in aGTM.d.consent.services to allow cookie"
      },
      {
        "type": "TEXT",
        "name": "consent_purpose",
        "displayName": "Consent Purpose",
        "simpleValueType": true,
        "defaultValue": "",
        "enablingConditions": [
          {
            "paramName": "cookie_mode",
            "paramValue": "consent",
            "type": "EQUALS"
          }
        ],
        "help": "Purpose name required in aGTM.d.consent.purposes to allow cookie"
      },
      {
        "type": "TEXT",
        "name": "consent_vendor",
        "displayName": "Consent Vendor",
        "simpleValueType": true,
        "defaultValue": "",
        "enablingConditions": [
          {
            "paramName": "cookie_mode",
            "paramValue": "consent",
            "type": "EQUALS"
          }
        ],
        "help": "Vendor name required in aGTM.d.consent.vendors to allow cookie"
      },
      {
        "type": "CHECKBOX",
        "name": "cookie_delete",
        "checkboxText": "Delete Cookie if Consent is denied",
        "simpleValueType": true,
        "help": "If checked, the user ID cookie is deleted when cookie_mode is \"consent\" and the required consent is not present.",
        "enablingConditions": [
          {
            "paramName": "cookie_mode",
            "paramValue": "consent",
            "type": "EQUALS"
          }
        ]
      },
      {
        "type": "TEXT",
        "name": "cookie_name",
        "displayName": "Cookie Name",
        "simpleValueType": true,
        "defaultValue": "_TPU",
        "help": "Name of the server-side user ID cookie"
      },
      {
        "type": "TEXT",
        "name": "cookie_lifetime",
        "displayName": "Cookie Lifetime (days)",
        "simpleValueType": true,
        "defaultValue": "365",
        "help": "Cookie lifetime in days"
      },
      {
        "type": "TEXT",
        "name": "cookie_domain",
        "displayName": "Cookie Domain",
        "simpleValueType": true,
        "defaultValue": "auto",
        "help": "Cookie domain (prefix with dot for subdomains)"
      },
      {
        "type": "TEXT",
        "name": "fip_limiter",
        "displayName": "User ID Separator",
        "simpleValueType": true,
        "defaultValue": "$",
        "help": "Separator between the parts of the User ID (e.g. $ or .). Must match the setting in your User ID variable template.",
        "valueValidators": [
          {
            "type": "NON_EMPTY"
          }
        ]
      },
      {
        "type": "CHECKBOX",
        "name": "fingerprint_allowed",
        "checkboxText": "Allow server-side fingerprint as fallback user ID",
        "simpleValueType": true,
        "defaultValue": true,
        "help": "Use server-side fingerprint as fallback when cookie is not set"
      },
      {
        "type": "TEXT",
        "name": "debug_suffix",
        "displayName": "Debug Suffix",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Suffix appended to user ID for debugging (leave empty in production)"
      },
      {
        "type": "CHECKBOX",
        "name": "auto_deny_load_gtm",
        "checkboxText": "Load GTM even under server-side auto-denial",
        "simpleValueType": true,
        "defaultValue": true,
        "help": "Phase 1 redesign: when this Client encounters a returning visitor with no recorded consent in the Session API, it constructs a server-side auto-denial consent block. If checked (default), the embedded gtmConsent flag is set to true so GTM still loads (only services requiring aGTMconsent fire). Uncheck to block GTM entirely on auto-denial."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMsources",
    "displayName": "Sources API",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "sources_enabled",
        "checkboxText": "Enable Sources API call",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If checked, this Client fires a POST to the Sources API after the Session step on every aGTM.js request, carrying user_id + page_location + referrer + timestamp. The Sources API stores the data and returns the resolved <code>source</code> (e.g. <code>it_webgains</code>), which is captured into <code>cfg.session.source</code> so webGTM can read it via a JS variable pointing at <code>aGTM.d.session.source</code>. <b>Sequential before the aGTM.js response</b> — adds one internal round-trip to delivery latency. The Tenant ID configured above is used. Page URL and referrer come from the integration code's ?c= base64 payload."
      },
      {
        "type": "TEXT",
        "name": "sources_api_url",
        "displayName": "Sources API URL",
        "simpleValueType": true,
        "defaultValue": "",
        "enablingConditions": [
          {
            "paramName": "sources_enabled",
            "paramValue": true,
            "type": "EQUALS"
          }
        ],
        "help": "Base URL of the Sources API up to and including the path prefix WITHOUT the tenant and WITHOUT any query string. The tenant is appended at runtime (and the attribution query, if enabled). Example: <code>https://your-sources-host.example.com/tp/sources</code> &rarr; POST goes to <code>.../tp/sources/{tenant}</code>. Do NOT put the tenant or <code>?attribution=true</code> here — that produces a malformed URL (e.g. <code>.../tp/sources/fcm/?attribution=true/fcm</code>)."
      },
      {
        "type": "CHECKBOX",
        "name": "sources_attribution",
        "checkboxText": "Request attribution in Sources response",
        "simpleValueType": true,
        "defaultValue": false,
        "enablingConditions": [
          {
            "paramName": "sources_enabled",
            "paramValue": true,
            "type": "EQUALS"
          }
        ],
        "help": "If checked, the Sources POST appends <code>?attribution=true&method=&lt;selected&gt;</code> so api4sources returns an <code>attribution</code> object in the same response (no extra round-trip). It is wrapped by method into <code>cfg.session.attribution</code>; the aGTM library merges it per-method with the current page URL (HYBRID strategy — URL wins for browser-derivable fields like utm/click-IDs, API for cross-session memory like <code>afs</code>/<code>lcs</code>/<code>fss</code>). webGTM reads e.g. <code>aGTM.d.attribution.last_touch.sou</code>. Note: the inline attribution reflects the state BEFORE this request (ClickHouse Materialized-View lag) — the HYBRID merge compensates with the fresh URL."
      },
      {
        "type": "SELECT",
        "name": "sources_method",
        "displayName": "Attribution method",
        "macrosInSelect": false,
        "selectItems": [
          {
            "value": "last_touch",
            "displayValue": "last_touch"
          },
          {
            "value": "first_touch",
            "displayValue": "first_touch"
          },
          {
            "value": "last_click",
            "displayValue": "last_click"
          },
          {
            "value": "first_click",
            "displayValue": "first_click"
          },
          {
            "value": "last_non_direct_click",
            "displayValue": "last_non_direct_click"
          }
        ],
        "simpleValueType": true,
        "defaultValue": "last_touch",
        "enablingConditions": [
          {
            "paramName": "sources_attribution",
            "paramValue": true,
            "type": "EQUALS"
          }
        ],
        "help": "Attribution method requested from api4sources (POST is single-method). The result lands under this key: <code>aGTM.d.attribution.&lt;method&gt;</code>. Use <code>last_non_direct_click</code> for GA4-style marketing-conversion reporting; <code>last_touch</code> for plain last-source analytics."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMpost",
    "displayName": "POST Transport",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "TEXT",
        "name": "transport_url",
        "displayName": "Transport URL",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "Global default URL for HTTP POST transport. Individual events can override this via the \u003ccode\u003e_post\u003c/code\u003e event property. Leave empty to disable POST transport globally."
      },
      {
        "type": "CHECKBOX",
        "name": "transport_enc",
        "checkboxText": "Encrypt POST payload",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If checked, POST payloads are obfuscated using the Transport Salt below."
      },
      {
        "type": "TEXT",
        "name": "transport_salt",
        "displayName": "Transport Encryption Salt (number)",
        "simpleValueType": true,
        "defaultValue": "",
        "help": "A numeric salt for encrypting POST payloads. Only used when Encrypt POST Payload is checked. If not set, the Session Encryption Salt is used as fallback."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMpreInit",
    "displayName": "Pre-aGTM Init Script",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "pre_init_enabled",
        "checkboxText": "Enable Pre-aGTM Init Script",
        "simpleValueType": true,
        "defaultValue": false,
        "help": "If checked, the JavaScript below is prepended to the /aGTM.js response. Use for CMP loaders or other code that must run before aGTM initializes. Uncheck to disable without deleting the code.<br><br><b>Prefer the noConsent-container pattern when possible.</b> Configure a separate Web GTM container with \"Consent Check: No\" in the GTM Container Setup above and put your CMP loader there as a Custom HTML tag fired on All Pages — that path has no shared blast radius with aGTM. This script field is the fallback for cases where a separate container is not viable. See <a href=\"https://github.com/Andiministrator/aGTM/blob/main/sgtmClient/README.md#cmp-loader-pattern\">CMP Loader Pattern documentation</a>."
      },
      {
        "type": "TEXT",
        "name": "pre_init_code",
        "displayName": "JavaScript Code",
        "simpleValueType": true,
        "defaultValue": "",
        "lineCount": 12,
        "enablingConditions": [
          {
            "paramName": "pre_init_enabled",
            "paramValue": true,
            "type": "EQUALS"
          }
        ],
        "help": "Inserted verbatim at the very top of the /aGTM.js response, before the aGTM library is parsed. The Client wraps your code in an IIFE inside try/catch — runtime errors are logged to the browser console as <code>[aGTM preInit]</code> and do not break aGTM. <b>Syntax errors are NOT caught</b> — a typo (e.g. unterminated string, unbalanced bracket) aborts parsing of the entire /aGTM.js response and breaks the consent flow for all visitors. Write/test the code in a syntax checker before pasting. ES5 syntax is recommended for maximum browser compatibility but not enforced (the wrapper IIFE itself is ES5)."
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "aGTMinfo",
    "displayName": "aGTM Info and Implementation Code",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "LABEL",
        "name": "space1",
        "displayName": "\u0026nbsp;"
      },
      {
        "type": "LABEL",
        "name": "aGTM Version",
        "displayName": "\u003cb\u003eaGTM Version:\u003c/b\u003e v1.5"
      },
      {
        "type": "LABEL",
        "name": "implementation_code",
        "displayName": "\u003cb\u003eaGTM Implementation Code:\u003c/b\u003e\u003cbr /\u003e\u003cbr /\u003e\n\n\u0026lt;script\u0026gt;\u003cbr /\u003e\n(function(){\u003cbr /\u003e\n\u0026nbsp;\u0026nbsp;var src\u003d\u0027https://[HOSTNAME]/[PATH]/aGTM.js?id\u003d[GTM-ID]\u0027;\u003cbr /\u003e\n\u0026nbsp;\u0026nbsp;var l\u003d\u0027locat\u0027,d\u003d\u0027docu\u0027,s\u003ddocument.createElement(\u0027script\u0027),f\u003d\u0027refer\u0027;\u003cbr /\u003e\n\u0026nbsp;\u0026nbsp;s.async\u003dtrue;s.src\u003dsrc+\u0027\u0026amp;c\u003d\u0027+btoa(JSON.stringify({u:window[l+\u0027ion\u0027].href,r:window[d+\u0027men\u0027+\u0027t\u0027][f+\u0027rer\u0027]}));\u003cbr /\u003e\n\u0026nbsp;\u0026nbsp;document.head.appendChild(s);\u003cbr /\u003e\n})();\u003cbr /\u003e\n\u0026lt;/script\u0026gt;\u003cbr /\u003e\u003cbr /\u003e\n\nPlaceholder:\u003cbr /\u003e\u003cbr /\u003e\n\u003cul\u003e\n  \u003cli\u003e[HOSTNAME]: The Hostname of the sGTM server.\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n  \u003cli\u003e\u003ci\u003e[PATH] (optional):\u003c/i\u003e The path on your sGTM server.\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n  \u003cli\u003e\u003ci\u003e[GTM-ID] (optional):\u003c/i\u003e The ID of the webGTM Container.\u003cbr /\u003e\u003cbr /\u003e\u003c/li\u003e\n\u003c/ul\u003e"
      }
    ]
  }
]


___SANDBOXED_JS_FOR_SERVER___

// ssGTM Doku: https://developers.google.com/tag-platform/tag-manager/server-side/api?hl=de
// aGTM Doku: https://github.com/Andiministrator/aGTM
const aGTMversion = "1.5";

// Fixed path the browser POSTs consent diffs to. The path is hard-coded so
// integrators don't have to assemble a URL — the sGTM Client builds the full
// URL from its own host. Keep in sync with the docs: a path collision with
// another claimed route on the same sGTM host would require patching this
// constant.
const CONSENT_STORE_PATH = '/aGTMconsent';

// Load Libraries
const claimRequest = require('claimRequest');
const setResponseStatus = require('setResponseStatus');
const setResponseHeader = require('setResponseHeader');
const setResponseBody = require('setResponseBody');
const returnResponse = require('returnResponse');
const getRequestPath = require('getRequestPath');
const getRequestMethod = require('getRequestMethod');
const getRequestQueryParameters = require('getRequestQueryParameters');
const getRequestBody = require('getRequestBody');
const sendHttpGet = require('sendHttpGet');
const sendHttpRequest = require('sendHttpRequest');
const getRequestHeader = require('getRequestHeader');
const getRemoteAddress = require('getRemoteAddress');
const getCookieValues = require('getCookieValues');
const setCookie = require('setCookie');
const fromBase64 = require('fromBase64');
const toBase64 = require('toBase64');
const sha256Sync = require('sha256Sync');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const generateRandom = require('generateRandom');
const getTimestampMillis = require('getTimestampMillis');
const Math = require('Math');

// Template config
const CFG = {
  debug: data.debug === true,
  tenantID: data.tenant_id || '',
  sessionApiUrl: data.session_api_url || '',
  // Consent-store route is enabled by default; integrator can disable via the
  // template UI. The route path is fixed (CONSENT_STORE_PATH); the browser-
  // facing URL is assembled from the request host.
  consentStoreEnabled: data.consent_store_enabled !== false,
  cookieMode: data.cookie_mode || 'always',
  consentService: data.consent_service || '',
  consentPurpose: data.consent_purpose || '',
  consentVendor: data.consent_vendor || '',
  cookieName: data.cookie_name || '_TPU',
  cookieLifetimeDays: makeNumber(data.cookie_lifetime || 365),
  cookieDomain: data.cookie_domain || 'auto',
  fingerprintAllowed: data.fingerprint_allowed !== false,
  sgtmHost: data.sgtm_host || '',
  debugSuffix: data.debug_suffix || '',
  fipLimiter: data.fip_limiter || '$',
  // Server-side auto-denial: when a returning visitor has no recorded consent,
  // the Client constructs a denial-consent block. autoDenyLoadGtm controls
  // whether GTM is allowed to load under that denial. Default true.
  autoDenyLoadGtm: data.auto_deny_load_gtm !== false,
  // Sources API: POST after the session step on every aGTM.js request. Tenant
  // is reused from tenantID. Disabled by default. Race-free: the session is
  // already committed in Redis when this fires, so api4sources' user_id ->
  // session_id lookup hits. Sequential before buildAndSend — every non-meta
  // field of the response is captured into sessionData (e.g. `source`, the
  // affiliate cookie value by last-cookie-win) so it flows through cfg.session
  // into aGTM.d.session.* (readable in webGTM via a JS variable). With
  // sourcesAttribution on, the POST also requests ?attribution=true&method=...
  // and the returned attribution object is wrapped by method into
  // sessionData.attribution, feeding the library's resolveAttribution HYBRID
  // merge (aGTM.d.attribution[method]). Adds one internal round-trip to /aGTM.js.
  sourcesEnabled: data.sources_enabled === true,
  sourcesApiUrl: data.sources_api_url || '',
  sourcesAttribution: data.sources_attribution === true,
  sourcesMethod: data.sources_method || 'last_touch',
  // Pre-aGTM Init Code: arbitrary JS prepended verbatim to the /aGTM.js
  // response. Use case: CMP loaders that must define globals before aGTM
  // starts. Must be ES5; no try/catch wrap (silent errors hide bugs).
  preInitEnabled: data.pre_init_enabled === true,
  preInitCode: data.pre_init_code || ''
};

// ── Helper: check comma-delimited consent string ───────────────────────────
const inConsentStr = function(str, val) {
  return !!(val && str && str.indexOf(',' + val + ',') >= 0);
};
const hasRequiredConsent = function(services, purposes, vendors) {
  if (!CFG.consentService && !CFG.consentPurpose && !CFG.consentVendor) return true;
  return inConsentStr(services, CFG.consentService) ||
         inConsentStr(purposes, CFG.consentPurpose) ||
         inConsentStr(vendors, CFG.consentVendor);
};

// ── F→C user-ID promotion helpers ────────────────────────────────────────────
// Declared up-front because the /aGTMconsent POST handler below references
// them, and GTM's sandboxed-JS parser rejects forward references to
// const-bound function expressions at parse time with "Illegal variable
// reference before declaration".

// Generate a stable cookie-based user ID. Format:
//   `C.1{lim}{tenant}{lim}{rand12}.{ms}`
// where `{lim}` is `CFG.fipLimiter` (default `$`).
//
// The literal `C.` prefix is mandated by the api4sgtm /promote endpoint
// (`new_user_id` must start with `"C."` — see
// internal/api/api4sgtm/team-spec.md §"Promote / Migrate session"). After
// the version digit `1` we switch to the configured `fipLimiter` so the
// C-format mirrors the F-format (`F{lim}1{lim}…`) for visual consistency
// in cookies, logs, and analytics dumps. With the default `$` limiter the
// resulting cookie value is e.g. `C.1$cl_planai$987654321012.1714900000000`
// — matches the F-side shape `F$1$cl_planai$<hash>.<date>` byte-for-byte
// after the second character.
const generateCookieUid = function() {
  const rand = generateRandom(123456789012, 999999999999);
  const tsm = getTimestampMillis();
  return 'C.1' + CFG.fipLimiter + CFG.tenantID + CFG.fipLimiter + makeString(rand) + '.' + makeString(tsm);
};

// Detect F.* fingerprint UID. Returns true when `uid` starts with the
// fingerprint prefix `F{lim}1{lim}` (e.g. `F$1$`). Gates F→C promote so
// only fingerprint users get promoted; cookie-based UIDs are already in
// their final form.
const fingerprintPrefix = 'F' + CFG.fipLimiter + '1' + CFG.fipLimiter;
const isFingerprintUid = function(uid) {
  return !!(uid && typeof uid === 'string' && uid.indexOf(fingerprintPrefix) === 0);
};

// F→C promote via api4sgtm /promote endpoint. Atomic Redis TxPipeline
// server-side: migrates the active session pointer from oldUid to newUid
// AND records the consent in one operation. Returns the new UID on success
// (via `then(newUid)`), `''` on failure (caller falls back to legacy F.*).
// Smoketest steps 19-20 verify the contract.
const tryPromote = function(oldUid, newUid, consent, then) {
  if (!CFG.sessionApiUrl || !CFG.tenantID || !oldUid || !newUid) {
    then('');
    return;
  }
  const promoteUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + oldUid + '/promote';
  const promoteBody = JSON.stringify({new_user_id: newUid, consent: consent || {}});
  if (CFG.debug) logToConsole('debug', '→ Promote F→C', {url: promoteUrl, body: promoteBody});
  sendHttpRequest(promoteUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, promoteBody).then(function(res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (CFG.debug) logToConsole('debug', '✓ Promote success', {old: oldUid, new: newUid, status: res.statusCode});
      then(newUid);
    } else {
      logToConsole('warn', '✗ Promote non-2xx — falling back to legacy F.* path', {status: res.statusCode, body: res.body});
      then('');
    }
  }, function(e) {
    logToConsole('error', '✗ Promote error — falling back to legacy F.* path', e);
    then('');
  });
};

const rpath = getRequestPath();
const rmethod = getRequestMethod();

// ── POST CONSENT_STORE_PATH handler ─────────────────────────────────────────
// Browser POSTs the latest consent state here. Two responsibilities:
//  1. Manage the user-ID cookie based on consent (cookieMode === 'consent').
//  2. Persist the consent block into the Session API record so that the next
//     library load returns it via cfg.session.consent (Phase 1 redesign).
if (CFG.consentStoreEnabled && rmethod === 'POST' && rpath.slice(-CONSENT_STORE_PATH.length) === CONSENT_STORE_PATH) {
  claimRequest();
  const body = getRequestBody();
  if (CFG.debug) logToConsole('debug', '✓ Consent POST received', body);
  const cp = body ? JSON.parse(body) : null;

  // Encrypted-mode guard: when the library sends `consent_store_enc=true`,
  // the request body is `{"q":"<enc>"}`. Server-side decryption is not
  // implemented (would need a symmetric counterpart to aGTM.f.enc). Without
  // it, the legacy parser at the next line would silently treat the
  // encrypted blob as a flat object, falling back to the cookie value for
  // uid and an empty consent block — and the F→C promote would then write
  // that empty consent into the migrated session record (full-replace
  // semantics). Fail loudly instead so misconfiguration is visible.
  if (cp && cp.q && !cp.e) {
    logToConsole('warn', '✗ Encrypted consent_store payload not supported server-side — disable consent_store_enc until decrypt is implemented');
    setResponseStatus(501);
    setResponseHeader('Content-Type', 'application/json');
    setResponseBody('{"ok":false,"err":"consent_store_enc not supported server-side"}');
    returnResponse();
    return;
  }

  const cpData = (cp && cp.e) ? cp.e : (cp || {});

  // Resolve uid: explicit in payload first, then fall back to cookie.
  let cpUid = cpData.uid || '';
  if (!cpUid && CFG.cookieName) {
    const fbVals = getCookieValues(CFG.cookieName, true);
    cpUid = (fbVals && fbVals.length > 0) ? fbVals[0] : '';
  }

  // Phase 3 payload shape: { uid, sid, consent: {...} }.
  // Backwards-compat: flat { uid, services, purposes, vendors, feedback }.
  // Ternary kept on a single line for the GTM sandboxed-JS parser.
  const cpConsent = (cpData.consent && typeof cpData.consent === 'object') ? cpData.consent : {hasResponse: true, services: cpData.services || '', purposes: cpData.purposes || '', vendors: cpData.vendors || '', feedback: cpData.feedback || ''};
  const cpServices = cpConsent.services || '';
  const cpPurposes = cpConsent.purposes || '';
  const cpVendors = cpConsent.vendors || '';
  const granted = hasRequiredConsent(cpServices, cpPurposes, cpVendors);
  // Reject the auto-denial sentinel even if it ever leaked into a CMP-driven
  // POST: the server-side auto-denial constructs `services: ',aGTMconsent,'`
  // — a real CMP never emits that exact value, so a match here is either
  // misconfiguration or a replay of the auto-denial block. Combined with the
  // explicit-signal check below, this protects against promoting a
  // non-consenting visitor.
  const isAutoDenialSentinel = cpServices === ',aGTMconsent,';
  // Explicit consent signal: at least one of services/purposes/vendors must
  // be non-empty. Without this, hasRequiredConsent() returns true on empty
  // input when no consent_service is configured (line ~95, default-permissive
  // for tenants that don't use the consent gate) — and a corrupt or empty
  // POST payload would otherwise be considered "granted" and trigger promote.
  const hasExplicitSignal = !!(cpServices || cpPurposes || cpVendors);
  if (CFG.debug) logToConsole('debug', '✓ Consent POST parsed', {uid: cpUid, services: cpServices, purposes: cpPurposes, granted: granted, explicit: hasExplicitSignal});

  // F→C promote applicability: when the visitor still carries an F.*
  // fingerprint UID and the CMP just granted consent (with an explicit
  // services/purposes/vendors signal, not just an empty payload), atomically
  // transition to a stable C.* cookie UID via api4sgtm /promote (one Redis
  // TxPipeline: session pointer migration + consent record write).
  // cookieMode='never' skips because the new C.* could not be persisted
  // browser-side and would be lost on the next visit. Single-line form
  // because GTM's sandboxed-JS parser is brittle around multi-line boolean
  // chains in some template-import paths.
  const shouldPromote = granted && hasExplicitSignal && !isAutoDenialSentinel && isFingerprintUid(cpUid) && CFG.sessionApiUrl && CFG.tenantID && CFG.cookieMode !== 'never';

  // Final stage: cookie write + consent persistence + response. `finalUid`
  // is the post-promote C.* uid when promote succeeded, else the original
  // cpUid. `consentAlreadyWritten` is true only when /promote returned 2xx
  // (it bundles consent atomically — skip the legacy /consent POST in that
  // case to avoid a redundant write).
  const writeCookieAndPersist = function(finalUid, consentAlreadyWritten) {
    const promoted = !!finalUid && finalUid !== cpUid;

    // 1. Cookie management
    if (CFG.cookieName) {
      const cookieOpts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
      if (promoted) {
        // F→C migration: write the new C.* cookie regardless of cookieMode
        // (always/consent — never is gated out earlier). Without this the
        // browser would keep the old F.* and the migration would be one-way
        // server-only on next /aGTM.js the cookie still says F.*.
        const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
        if (maxAge > 0) cookieOpts['max-age'] = maxAge;
        setCookie(CFG.cookieName, finalUid, cookieOpts, true);
        if (CFG.debug) logToConsole('debug', '✓ User ID cookie set after promote', finalUid);
      } else if (CFG.cookieMode === 'consent') {
        // Legacy consent-mode cookie management. cookieMode='always' cookie
        // is refreshed by /aGTM.js GET, not here.
        if (granted && finalUid) {
          const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
          if (maxAge > 0) cookieOpts['max-age'] = maxAge;
          setCookie(CFG.cookieName, finalUid, cookieOpts, true);
          if (CFG.debug) logToConsole('debug', '✓ User ID cookie set (consent granted)', finalUid);
        } else if (!granted && data.cookie_delete) {
          cookieOpts['max-age'] = 0;
          setCookie(CFG.cookieName, '', cookieOpts, true);
          if (CFG.debug) logToConsole('debug', '✓ User ID cookie deleted (consent withdrawn)');
        }
      }
    }

    const finishConsentPost = function() {
      setResponseStatus(200);
      setResponseHeader('Content-Type', 'application/json');
      // Always echo finalUid so the browser can update aGTM.d.session.uid
      // after a successful F→C promote. When no promote happened the value
      // matches what the browser already holds — browser-side noop.
      setResponseBody(JSON.stringify({ok: true, uid: finalUid || cpUid}));
      returnResponse();
    };

    // 2. Persist consent into the Session API record so the next library
    //    load returns it via cfg.session.consent. Skip when /promote
    //    already wrote it atomically.
    if (consentAlreadyWritten) {
      if (CFG.debug) logToConsole('debug', '✓ Consent persistence skipped (already written by /promote)');
      finishConsentPost();
      return;
    }

    if (CFG.sessionApiUrl && CFG.tenantID && finalUid) {
      const writeUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + finalUid + '/consent';
      const writeBody = JSON.stringify(cpConsent);
      if (CFG.debug) logToConsole('debug', '→ Persisting consent to Session API', {url: writeUrl, body: writeBody});
      sendHttpRequest(writeUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, writeBody).then(function(res) {
        if (CFG.debug) logToConsole('debug', '✓ Consent persisted', {uid: finalUid, status: res.statusCode});
        finishConsentPost();
      }, function(e) {
        logToConsole('error', '✗ Consent persistence error', e);
        // Still return 200 — cookie management already done; persistence is server-side concern
        finishConsentPost();
      });
    } else {
      if (CFG.debug) logToConsole('debug', '✗ Consent persistence skipped (no Session API or no uid)');
      finishConsentPost();
    }
  };

  if (shouldPromote) {
    const newUid = generateCookieUid();
    if (CFG.debug) logToConsole('debug', '→ F→C promote applicable', {old: cpUid, new: newUid});
    tryPromote(cpUid, newUid, cpConsent, function(promotedUid) {
      if (promotedUid) {
        writeCookieAndPersist(promotedUid, true);
      } else {
        // Promote failed — fall back to legacy path under the original F.*
        writeCookieAndPersist(cpUid, false);
      }
    });
  } else {
    writeCookieAndPersist(cpUid, false);
  }
  return;
}

// ── GET /aGTM.js handler ─────────────────────────────────────────────────────
if (rpath.length < 8 || rpath.slice(rpath.length - 8) !== '/aGTM.js') return;

// Decode ?c= → {u: pageUrl, r: referrer}
const queryParameters = getRequestQueryParameters();
const id = queryParameters.id || null;
let pageUrl = '', pageRef = '';
if (queryParameters.c) {
  const dec = JSON.parse(fromBase64(queryParameters.c));
  if (dec && typeof dec.u === 'string') pageUrl = dec.u;
  if (dec && typeof dec.r === 'string') pageRef = dec.r;
}
if (CFG.debug) logToConsole('debug', 'Request', {path: rpath, id: id, url: pageUrl, ref: pageRef});

if (!data.gtm) logToConsole('warn', '\u2717 No GTM Container configured');

if (id && data.gtm) {
  let ok = false;
  for (const v of data.gtm) { if (v.gtm_id === id) { ok = true; break; } }
  if (!ok) { logToConsole('warn', '\u2717 No matching GTM ID', id); return; }
}

claimRequest();

// Shared state
const clientIP = data.client_ip || getRemoteAddress() || '';
const userAgent = getRequestHeader('User-Agent') || '';

// ── Helper: generate fingerprint (exact logic from serverside_fingerprint v1.1.tpl)
var getFingerprintString = function() {
  var requestHeaders = {
    'accept-language': getRequestHeader('accept-language'),
    'client-ip': clientIP,
    'sgtm-host': CFG.sgtmHost,
    'user-agent': userAgent,
    'sec-ch-ua': getRequestHeader('sec-ch-ua'),
    'sec-ch-ua-mobile': getRequestHeader('sec-ch-ua-mobile'),
    'sec-ch-ua-platform': getRequestHeader('sec-ch-ua-platform'),
    'x-geoip-asn': getRequestHeader('x-geoip-asn'),
    'x-geoip-country': getRequestHeader('x-geoip-country'),
    'x-geoip-country-code': getRequestHeader('x-geoip-country-code'),
    'x-geoip-org': getRequestHeader('x-geoip-org'),
    'x-scheme': getRequestHeader('x-scheme')
  };
  var buildStr = '';
  for (var key in requestHeaders) {
    if (requestHeaders[key]) buildStr += key + ':' + requestHeaders[key];
  }
  if (CFG.debug) logToConsole('debug', 'FP buildStr:', buildStr);
  return toBase64(sha256Sync(buildStr));
};
var getFingerprintTimestamp = function() {
  var ms = getTimestampMillis();
  var z = Math.floor(ms / 86400000);
  var rd = z + 719163;
  var d = rd - 1;
  var n400 = Math.floor(d / 146097); d = d - n400 * 146097;
  var n100 = Math.floor(d / 36524);  d = d - n100 * 36524;
  var n4   = Math.floor(d / 1461);   d = d - n4   * 1461;
  var n1   = Math.floor(d / 365);    d = d - n1   * 365;
  var year = 400 * n400 + 100 * n100 + 4 * n4 + n1 + 1;
  var doy  = d + 1;
  var ml   = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((year % 4 === 0) && (year % 100 !== 0 || year % 400 === 0)) ml[1] = 29;
  var month = 0;
  while (doy > ml[month]) { doy = doy - ml[month]; month = month + 1; }
  return '' + year + (month + 1 < 10 ? '0' : '') + (month + 1) + (doy < 10 ? '0' : '') + doy;
};
const getFingerprint = function() {
  return 'F' + CFG.fipLimiter + '1' + CFG.fipLimiter + CFG.tenantID + CFG.fipLimiter + getFingerprintString() + '.' + getFingerprintTimestamp();
};

// ── Helper: write cookie ──────────────────────────────────────────────────────
const writeCookie = function(val, maxAgeSec) {
  if (!CFG.cookieName) return;
  const opts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
  const maxAge = (typeof maxAgeSec === 'number') ? maxAgeSec : (CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0);
  opts['max-age'] = maxAge;
  setCookie(CFG.cookieName, val, opts, true);
};

// (generateCookieUid, isFingerprintUid, fingerprintPrefix, tryPromote
// are declared earlier — before the /aGTMconsent POST handler — because
// that handler uses them. GTM's sandboxed-JS parser rejects forward
// references to const-bound function expressions even at parse time
// ("Illegal variable reference before declaration"), and at runtime
// the const TDZ would throw before the function existed anyway.)

// SOURCES_META: api4sources response fields that are POST/transport status,
// NOT tracking payload. Every OTHER top-level field is passed through to
// sessionData verbatim (e.g. `source`); `attribution` is handled separately
// (wrapped by method). Reserved session keys (uid/sid/consent/...) are listed
// too so a future API field can never clobber the session record.
const SOURCES_META = {ok: 1, tenant: 1, session_id: 1, ts: 1, skipped: 1, reason: 1, attribution: 1, uid: 1, sid: 1, consent: 1, ret: 1, vct: 1, sst: 1, ga4sid: 1, muidga4: 1};

// ── Helper: fire Sources API POST (sequential before buildAndSend) ───────────
// Called from afterSession() once the session is committed in Redis. The POST
// is awaited because its response carries tracking payload: `source` (the
// affiliate cookie value, last-cookie-win) and, when sourcesAttribution is on
// (?attribution=true&method=...), an `attribution` object. Every non-meta field
// is captured into sessionData so it flows through cfg.session into
// aGTM.d.session.* — readable in webGTM via a JS variable. attribution is
// wrapped by method into sessionData.attribution so the library's
// resolveAttribution() HYBRID merge lights up (aGTM.d.attribution[method]).
// page_location/referrer come from the ?c= payload; tenant from CFG; user_id
// from the resolved uid. api4sources looks up the active session_id from Redis
// (key customer_sessions:{tenant}:{user_id}) — race-free because the Session
// API write completed before this runs. On timeout/error/non-2xx nothing is
// captured and the rest proceeds (then() always runs).
const fireSources = function(sessionData, then) {
  const uid = sessionData && sessionData.uid;
  if (!CFG.sourcesEnabled) { then(); return; }
  if (!CFG.sourcesApiUrl || !CFG.tenantID || !uid || !pageUrl) {
    if (CFG.debug) logToConsole('debug', '✗ Sources skipped', {enabled: CFG.sourcesEnabled, url: !!CFG.sourcesApiUrl, tenant: !!CFG.tenantID, uid: !!uid, pageUrl: !!pageUrl});
    then();
    return;
  }
  const sep = CFG.sourcesApiUrl.charAt(CFG.sourcesApiUrl.length - 1) === '/' ? '' : '/';
  // Tenant is appended at runtime (field holds the bare base URL, WITHOUT tenant
  // or query). The attribution query, when enabled, goes AFTER the tenant so the
  // path stays /tp/sources/{tenant}?attribution=true&method=... per api4sources.
  let url = CFG.sourcesApiUrl + sep + CFG.tenantID;
  if (CFG.sourcesAttribution) url = url + '?attribution=true&method=' + CFG.sourcesMethod;
  const body = JSON.stringify({
    user_id: uid,
    page_location: pageUrl,
    referrer: pageRef,
    timestamp: getTimestampMillis()
  });
  if (CFG.debug) logToConsole('debug', '→ Sources POST', {url: url, body: body});
  sendHttpRequest(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 1500}, body).then(function(res) {
    if (res.statusCode >= 200 && res.statusCode < 300 && res.body) {
      const parsed = JSON.parse(res.body);
      if (parsed && typeof parsed === 'object') {
        // Pass through every non-meta top-level field verbatim. JSON.parse output
        // has only own enumerable keys, so no hasOwnProperty guard is needed.
        // Empty/null values are skipped so a present-but-empty field (e.g.
        // source='' when no affiliate cookie is set) creates no hollow session
        // entry — keeps the library's truthy preset gate meaningful.
        for (const k in parsed) {
          if (!SOURCES_META[k] && parsed[k] !== '' && parsed[k] !== null) sessionData[k] = parsed[k];
        }
        // attribution: wrap the flat object under the requested method key so the
        // library expects aGTM.d.session.attribution keyed by method.
        if (parsed.attribution && typeof parsed.attribution === 'object') {
          sessionData.attribution = {};
          sessionData.attribution[CFG.sourcesMethod || 'last_touch'] = parsed.attribution;
        }
        if (CFG.debug) logToConsole('debug', '✓ Sources response', {status: res.statusCode, source: parsed.source, attribution: !!parsed.attribution});
      } else if (CFG.debug) {
        logToConsole('debug', '✗ Sources response not an object', res.body);
      }
    } else if (CFG.debug) {
      logToConsole('debug', '✗ Sources non-2xx', {status: res.statusCode, body: res.body});
    }
    then();
  }, function(e) {
    logToConsole('error', '✗ Sources error', e);
    then();
  });
};

// ── 1. Bot Check (first — no session/cookie for bots) ────────────────────────
const botCheckEnabled = data.botCheckEnabled === true;
const botCheckUrl = data.botCheck || '';

const afterBotCheck = function(isBot) {
  if (isBot) {
    logToConsole('warn', '\u2717 Bot detected', userAgent);
    setResponseStatus(403);
    returnResponse();
    return;
  }

  // ── 2. User ID resolution ──────────────────────────────────────────────────
  // Phase 1 redesign collapses presession + session into a single Session API
  // call. The same uid is used throughout the lifecycle: existing cookie wins,
  // otherwise fingerprint. No more random uid generation — the session API
  // record key stays consistent across loads, so consent persisted under it on
  // one page is found on the next.
  const uidVals = getCookieValues(CFG.cookieName, true);
  const existingCookie = (uidVals && uidVals.length > 0) ? uidVals[0] : '';
  const fpUid = CFG.fingerprintAllowed ? getFingerprint() + (CFG.debugSuffix ? '_' + CFG.debugSuffix : '') : '';
  const sessionUid = existingCookie || fpUid;
  if (CFG.debug) logToConsole('debug', 'User ID for session', sessionUid);


  // ── 3. Single Session API call ────────────────────────────────────────────
  // Response may include a `consent` object (passed through to cfg.session.consent)
  // OR the Client constructs server-side auto-denial when the user is a returning
  // visitor with no recorded consent. Cookie management runs after this, based on
  // whether the resulting consent state grants the required services.
  const afterSession = function(sessionData) {
    // Lazy F→C promote: returning visitor whose cookie still carries an
    // F.* fingerprint while the Session API already has a real (non-auto-
    // denial) consent on file. Migrates them on this request so subsequent
    // api4sources/Session API writes land under C.* without waiting for
    // the cookie to expire (default 365 days). One-shot per visitor — once
    // the C.* cookie is set, existingCookie starts with C.* on the next
    // visit and this branch skips.
    //
    // Auto-denial guards (must all be defensive):
    //  - services sentinel `',aGTMconsent,'` — a real CMP never emits this.
    //  - `typeof blocked !== 'undefined'` — the auto-denial constructor
    //    sets `blocked` regardless of its value (CFG.autoDenyLoadGtm can
    //    be `false`, in which case `blocked: false` and a `blocked !== true`
    //    check would let promote fire on a denied visitor). Also: GTM's
    //    sandboxed-JS template parser does not accept the `in` membership
    //    operator (`'k' in obj`) outside of `for (k in obj)` loops, so the
    //    `typeof` form is required.
    //  - explicit signal: at least one of services/purposes/vendors must
    //    be non-empty, so we don't promote on an empty/corrupt session
    //    consent block when no consent_service is configured.
    const sessionConsent = sessionData.consent;
    const sessionIsAutoDenial = !!sessionConsent && (sessionConsent.services === ',aGTMconsent,' || typeof sessionConsent.blocked !== 'undefined');
    const sessionHasExplicitSignal = !!sessionConsent && !!((sessionConsent.services || '') || (sessionConsent.purposes || '') || (sessionConsent.vendors || ''));
    const sessionConsentGranted = !!sessionConsent && sessionConsent.hasResponse === true && !sessionIsAutoDenial && sessionHasExplicitSignal && hasRequiredConsent(sessionConsent.services || '', sessionConsent.purposes || '', sessionConsent.vendors || '');
    const shouldLazyPromote = sessionConsentGranted && isFingerprintUid(existingCookie) && CFG.sessionApiUrl && CFG.tenantID && CFG.cookieMode !== 'never';

    const continueAfterSession = function() {
      let cookieAllowed = (CFG.cookieMode === 'always') ||
                         (CFG.cookieMode === 'consent' && !!existingCookie);
      if (CFG.cookieMode === 'consent' && !cookieAllowed && sessionData.consent) {
        const c = sessionData.consent;
        if (hasRequiredConsent(c.services || '', c.purposes || '', c.vendors || '')) {
          cookieAllowed = true;
        }
      }

      // Delete cookie if consent required but not granted
      if (!cookieAllowed && data.cookie_delete && existingCookie && CFG.cookieMode === 'consent') {
        writeCookie('', 0);
      }
      // Write/refresh cookie if allowed. For returning visitors with stored
      // granted consent this restores parity (otherwise the cookie max-age
      // expires until the user re-interacts with the CMP). When a lazy
      // promote happened above, sessionData.uid is now the new C.* — this
      // is what gets written, replacing the F.* in the browser.
      if (cookieAllowed && sessionData.uid) {
        writeCookie(sessionData.uid);
      }

      if (CFG.debug) logToConsole('debug', '✓ Session', sessionData);
      // Sequential Sources API POST. Its response carries `source`, captured
      // into sessionData.source before buildAndSend so it flows into
      // cfg.session.source. No-op (then() runs on this tick) when sources_enabled
      // is false. Session is already committed in Redis — no race against
      // api4sources' session lookup.
      fireSources(sessionData, function() { buildAndSend(sessionData); });
    };

    if (shouldLazyPromote) {
      const newUid = generateCookieUid();
      if (CFG.debug) logToConsole('debug', '→ Lazy F→C promote (returning visitor with F.* cookie + stored consent)', {old: existingCookie, new: newUid});
      tryPromote(existingCookie, newUid, sessionConsent, function(promotedUid) {
        if (promotedUid) {
          sessionData.uid = promotedUid;
        }
        continueAfterSession();
      });
    } else {
      continueAfterSession();
    }
  };

  if (CFG.sessionApiUrl && CFG.tenantID && sessionUid) {
    const sUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + sessionUid;
    sendHttpGet(sUrl, {timeout: 5000}).then(function(res) {
      const sd = {uid: sessionUid, sid: '', ret: false, sst: true, vct: 0};
      if (res.statusCode === 200 && res.body) {
        const r = JSON.parse(res.body);
        if (r && r.sessionId) {
          sd.sid = r.sessionId;
          sd.vct = r.counter || 0;
          sd.ret = sd.vct > 0;
          if (r.ga4sid) sd.ga4sid = r.ga4sid;
          if (r.muidga4) sd.muidga4 = r.muidga4;
          // Pass through stored consent if present and valid
          if (r.consent && typeof r.consent === 'object' && r.consent.hasResponse === true) {
            sd.consent = r.consent;
            if (CFG.debug) logToConsole('debug', '✓ Session API returned stored consent', sd.consent);
          } else if (sd.ret) {
            // Returning visitor with no recorded consent -> server-side auto-denial.
            // Replaces the old client-side session_apply_denial() (Phase 2 removal).
            // `blocked` mirrors `gtmConsent` so the aGTM run_cc() chelp fallback
            // honors the server policy: when chelp checks fail (services don't
            // match the requirement), gtmConsent falls back to `blocked`.
            sd.consent = {
              hasResponse: true,
              feedback: 'Consent denied by aGTM',
              services: ',aGTMconsent,',
              purposes: '',
              vendors: '',
              gtmConsent: CFG.autoDenyLoadGtm,
              blocked: CFG.autoDenyLoadGtm
            };
            if (CFG.debug) logToConsole('debug', '✓ Server-side auto-denial applied', sd.consent);
          }
        }
      }
      afterSession(sd);
    }, function(e) {
      logToConsole('error', '✗ Session API error', e);
      afterSession({uid: sessionUid, sid: '', ret: false, sst: true, vct: 0});
    });
  } else {
    afterSession({uid: sessionUid, sid: '', ret: false, sst: true, vct: 0});
  }
};

if (botCheckEnabled && botCheckUrl) {
  if (!clientIP) {
    logToConsole('error', '\u2717 Bot check enabled but no client IP');
    setResponseStatus(403);
    setResponseBody(fromBase64('Y29uc29sZS5lcnJvcignYUdUTSBFcnJvcjogSW52YWxpZCBvciBibG9ja2VkIElQIGFkZHJlc3MnKTs='));
    returnResponse();
  } else {
    const plObj = {UserAgent: userAgent, ClientIP: clientIP};
    sendHttpGet(botCheckUrl + '/' + toBase64(JSON.stringify(plObj)), {timeout: 5000}).then(function(r) {
      let bot = false;
      if (r.statusCode >= 200 && r.statusCode < 300 && r.body) { const o = JSON.parse(r.body); if (o && o.isBot) bot = true; }
      afterBotCheck(bot);
    }, function(e) { logToConsole('error', '\u2717 Bot check error', e); afterBotCheck(false); });
  }
} else {
  afterBotCheck(false);
}

// ── Build and send response ───────────────────────────────────────────────────
const buildAndSend = function(sessionData) {
  // CMP
  let cmp = data.cmp || '';
  if (!cmp && data.cmp_custom_active) cmp = data.cmp_custom_code || '';

  // Config
  const c = {};
  if (data.gtm) {
    const qp_id = typeof id === 'string' ? id : '';
    const gtm = {};
    for (const v of data.gtm) {
      if (v.gtm_id && v.gtm_id === qp_id) {
        gtm[v.gtm_id] = {};
        if (!v.gtm_consent) gtm[v.gtm_id].noConsent = true;
        if (v.gtm_env) gtm[v.gtm_id].env = v.gtm_env;
        if (v.gtm_url) gtm[v.gtm_id].gtmURL = v.gtm_url;
      }
    }
    c.gtm = gtm;
  }
  if (data.consent) { for (const v of data.consent) { c[v.consent_type] = v.consent_value; } }
  if (data.ck_consent) { for (const v of data.ck_consent) { c[v.ck_consent_type] = v.ck_consent_value; } }
  if (data.sendConsentEvent) c.sendConsentEvent = true;
  if (data.useListener) c.useListener = true;
  if (data.consent_events) c.consent_events = data.consent_events;
  if (data.aPageview) c.aPageview = true;
  if (data.vPageview) c.vPageview = true;
  if (data.vPageviews) c.vPageviews = true;
  if (data.dlStateEvents) c.dlStateEvents = true;
  if (data.gdl) c.gdl = data.gdl;
  if (data.dlOrgPush) c.dlOrgPush = data.dlOrgPush;
  if (typeof c.dlOrgPush !== 'string' || c.dlOrgPush === '-') c.dlOrgPush = '';
  if (data.iframeSupport) c.iframeSupport = true;
  if (data.iframeOrigins) c.iframeOrigins = data.iframeOrigins;
  if (data.nonce) c.nonce = data.nonce;
  if (data.debug) c.debug = true;
  // Session (pre-populated by sGTM Client; aGTM consumes via cfg.session).
  // aGTM's preset gate requires sid OR a valid consent block OR an attribution
  // object OR a source string — uid alone is ignored, so we don't bother
  // emitting in that case.
  if (sessionData && (sessionData.sid || sessionData.consent || sessionData.attribution || sessionData.source)) {
    c.session = sessionData;
  } else if (CFG.debug) {
    logToConsole('debug', '✗ session: nothing to pass through', sessionData);
  }
  // Consent-store endpoint: NOT set server-side. The browser builds the URL
  // at runtime from document.currentScript.src (the URL it actually fetched
  // aGTM.js from) — see the IIFE injected into `config` below. Reason:
  // reverse-proxy setups (e.g. site /rp/tp/aGTM.js → upstream /aGTM.js)
  // strip the path prefix before the request reaches us, so rpath is wrong
  // here. Only the browser knows the real prefix. Standalone integrators
  // (without sGTM Client) set aGTM.c.consent_store_url manually.
  if (CFG.debug) {
    logToConsole('debug', CFG.consentStoreEnabled ? '✓ consent_store_url will be built browser-side from document.currentScript.src' : '✗ consent_store_url disabled by template config');
  }
  if (data.consent_store_enc) c.consent_store_enc = true;
  // session_salt is reused by aGTM for the consent-store POST encryption
  // (consent_store_enc) AND as a fallback for transport_salt.
  if (data.session_salt) { const ss = makeInteger(data.session_salt); if (ss > 0) c.session_salt = ss; }
  // POST Transport
  if (data.transport_url) c.transport_url = data.transport_url;
  if (data.transport_enc) c.transport_enc = true;
  if (data.transport_salt) { const ts = makeInteger(data.transport_salt); if (ts > 0) c.transport_salt = ts; }

  // Wrap config(c) in an IIFE that builds consent_store_url at runtime from
  // document.currentScript.src (the URL the browser actually fetched aGTM.js
  // from). This handles reverse-proxy setups: server sees /aGTM.js but the
  // browser came from /rp/tp/aGTM.js — only the browser knows the real
  // prefix. Builder runs before aGTM.f.config() so the URL is already on
  // aGTM.c.consent_store_url when run_cc fires from the B1 sync trigger.
  const storeUrlBuilder = CFG.consentStoreEnabled ? '(function(c){var s=document.currentScript;if(s&&s.src){var i=s.src.lastIndexOf("/aGTM.js");if(i>=0)c.consent_store_url=s.src.substring(0,i)+"' + CONSENT_STORE_PATH + '";}return c;})' : '(function(c){return c;})';
  const config = 'aGTM.f.config(' + storeUrlBuilder + '(' + JSON.stringify(c) + '));';
  logToConsole('info', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImF0dHJpYnV0aW9uIix7fV0sW2FHVE0uZCwiaWZyYW1lIix7Y291bnRlcjp7ZXZlbnRzOjB9LG9yaWdpbjoiIixpZkxpc3RlbjohMSx0b3BMaXN0ZW46ITEsaGFuZHNoYWtlOiExLHRpbWVyOm51bGx9XSxbYUdUTS5kLCJsYXN0X3VybCIsbG9jYXRpb24uaHJlZl0sW2FHVE0uZiwidGwiLHt9XSxbYUdUTS5mLCJkbCIse31dLFthR1RNLmYsInBsIix7fV0sW2FHVE0sImwiLFtdXSxbYUdUTS5uLCJjayIsImNvb2tpZSJdLFthR1RNLm4sInRtIiwiZ29vZ2xldGFnbWFuYWdlciJdLFthR1RNLm4sInRhIiwidGFnYXNzaXN0YW50Lmdvb2dsZSJdXS5mb3JFYWNoKGZ1bmN0aW9uKGUpe2FHVE0uZi5wcm9wc2V0KGVbMF0sZVsxXSxlWzJdKX0pfSxhR1RNLmYub2JqaW5pdCgpLGFHVE0uZi5sb2c9ZnVuY3Rpb24oZSx0KXt2YXIgYT0ib2JqZWN0Ij09dHlwZW9mIHQmJnQ/SlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh0KSk6dDthR1RNLmwucHVzaCh7aWQ6ZSx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksb2JqOmF9KX0sYUdUTS5mLnN0cmNsZWFuPWZ1bmN0aW9uKGUpe3JldHVybiB2b2lkIDA9PT1lfHwib2JqZWN0Ij09dHlwZW9mIGUmJiFlPyIiOigic3RyaW5nIiE9dHlwZW9mIGUmJihlPWUudG9TdHJpbmcoKSksZS5yZXBsYWNlKC9bXmEtesOkw7bDvMOfQS1aw4TDlsOcMC05Xy1dL2csIiIpKX0sYUdUTS5mLnNTdHJmPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpe3ZhciB0PUpTT04uc3RyaW5naWZ5KHtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6IkRhdGFMYXllciBFbnRyeSBpcyBubyBvYmplY3QiLGVycnR5cGU6IkRMIEVycm9yIixvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZX0pO3JldHVybiBhR1RNLmYubG9nKCJlMTYiLEpTT04ucGFyc2UodCkpLEpTT04uc3RyaW5naWZ5KG51bGwpfXZhciBhPVtdO3JldHVybiBKU09OLnN0cmluZ2lmeShlLGZ1bmN0aW9uKGUsdCl7aWYoIm9iamVjdCI9PXR5cGVvZiB0JiZudWxsIT09dCl7aWYoLTEhPT1hLmluZGV4T2YodCkpcmV0dXJuIltDaXJjdWxhcl0iO2EucHVzaCh0KX1yZXR1cm4gdH0pfSxhR1RNLmYuYW49ZnVuY3Rpb24oZSx0LGEsbil7ZVt0XT1hLmhhc093blByb3BlcnR5KHQpP2FbdF06bn0sYUdUTS5mLmNvbnNlbnRfc2VyaWFsaXplPWZ1bmN0aW9uKGUpe2lmKCFlfHwib2JqZWN0IiE9dHlwZW9mIGUpcmV0dXJuIiI7dmFyIHQ9e2d0bUNvbnNlbnQ6MSxibG9ja2VkOjF9LGE9W107Zm9yKHZhciBuIGluIGUpZS5oYXNPd25Qcm9wZXJ0eShuKSYmIXRbbl0mJmEucHVzaChuKTthLnNvcnQoKTtmb3IodmFyIG89W10scj0wO3I8YS5sZW5ndGg7cisrKXt2YXIgcz1hW3JdLGk9ZVtzXTsiIiE9PWkmJm51bGwhPWkmJm8ucHVzaChzKyI9IisoIm9iamVjdCI9PXR5cGVvZiBpP0pTT04uc3RyaW5naWZ5KGkpOlN0cmluZyhpKSkpfXJldHVybiBvLmpvaW4oInwiKX0sYUdUTS5mLnBhcnNlVXJsUGFyYW1zPWZ1bmN0aW9uKGUpe3ZhciB0PXt9O2lmKCFlfHwiPyIhPT1lLmNoYXJBdCgwKSlyZXR1cm4gdDtmb3IodmFyIGE9ZS5zdWJzdHJpbmcoMSkuc3BsaXQoIiYiKSxuPTA7bjxhLmxlbmd0aDtuKyspe3ZhciBvPWFbbl0uc3BsaXQoIj0iKTtpZihvWzBdKXt2YXIgcixzO3RyeXtyPWRlY29kZVVSSUNvbXBvbmVudChvWzBdKX1jYXRjaChlKXtyPW9bMF19aWYob1sxXSl7dmFyIGk9b1sxXS5yZXBsYWNlKC9cKy9nLCIgIik7dHJ5e3M9ZGVjb2RlVVJJQ29tcG9uZW50KGkpfWNhdGNoKGUpe3M9aX19ZWxzZSBzPSIiO3Rbcl09c319cmV0dXJuIHR9LGFHVE0uZi5yZXNvbHZlQXR0cmlidXRpb249ZnVuY3Rpb24oZSl7dmFyIHQ9YUdUTS5mLnBhcnNlVXJsUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLGE9KGFHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi5hdHRyaWJ1dGlvbnx8e30pW2VdO2EmJiJvYmplY3QiPT10eXBlb2YgYXx8KGE9e30pO2Zvcih2YXIgbj1bImdjbGlkIiwiZmJjbGlkIiwibXNjbGtpZCIsInR0Y2xpZCIsImdicmFpZCIsIndicmFpZCJdLG89IiIscj0iIixzPTA7czxuLmxlbmd0aDtzKyspe3ZhciBpPW5bc107aWYodFtpXSl7bz1pLHI9dFtpXTticmVha319cmV0dXJue3NvdTp0LnV0bV9zb3VyY2V8fGEuc291fHwiIixjYW06dC51dG1fY2FtcGFpZ258fGEuY2FtfHwiIixtZWQ6dC51dG1fbWVkaXVtfHxhLm1lZHx8IiIsY2FtaWQ6dC51dG1faWR8fGEuY2FtaWR8fCIiLGNsaTpyfHxhLmNsaXx8IiIsY2xwOm98fGEuY2xwfHwiIixjbHM6byYme2djbGlkOiJHb29nbGUgQWRzIixmYmNsaWQ6Ik1ldGEiLG1zY2xraWQ6Ik1pY3Jvc29mdCBBZHMiLHR0Y2xpZDoiVGlrVG9rIEFkcyIsZ2JyYWlkOiJHb29nbGUgQWRzIix3YnJhaWQ6Ikdvb2dsZSBBZHMifVtvXXx8YS5jbHN8fCIiLGFmczphLmFmc3x8IiIsc3JlOmRvY3VtZW50LnJlZmVycmVyfHxhLnNyZXx8IiIsbGNzOmEubGNzfHwiIixmc3M6YS5mc3N8fCIifX0sYUdUTS5mLmNvbmZpZz1mdW5jdGlvbihlKXtpZihhR1RNLmQuY29uZmlnKSJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJlMSIsYUdUTS5jKTtlbHNle2lmKGFHVE0uZi5hbihhR1RNLmMsImRlYnVnIixlLCExKSxhR1RNLmYuYW4oYUdUTS5jLCJwYXRoIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJmaWxlIixlLCJhR1RNLmpzIiksYUdUTS5mLmFuKGFHVE0uYywiY21wIixlLCIiKSxhR1RNLmMubWluPSJib29sZWFuIiE9dHlwZW9mIGUubWlufHxlLm1pbixhR1RNLmYuYW4oYUdUTS5jLCJub25jZSIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiaWZyYW1lU3VwcG9ydCIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidlBhZ2V2aWV3cyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidlBhZ2V2aWV3c1RpbWVyIixlLDApLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NGYWxsYmFjayIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiZ3RtSUQiLGUsIiIpLGUuZ3RtKWZvcih2YXIgdCBpbiBlLmd0bSllLmd0bS5oYXNPd25Qcm9wZXJ0eSh0KSYmKGFHVE0uYy5ndG1JRD1hR1RNLmMuZ3RtSUR8fHQsYUdUTS5jLmd0bT1hR1RNLmMuZ3RtfHx7fSxhR1RNLmMuZ3RtW3RdPWUuZ3RtW3RdfHx7fSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwibm9Db25zZW50IixlLmd0bVt0XSwhMSksYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sImVudiIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJpZFBhcmFtIixlLmd0bVt0XSwiIiksYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sImd0bVVSTCIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1KUyIsZS5ndG1bdF0sIiIpKTtpZihhR1RNLmYuYW4oYUdUTS5jLCJnZGwiLGUsImRhdGFMYXllciIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVB1cnBvc2VzIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1TZXJ2aWNlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtVmVuZG9ycyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtQXR0ciIsZSxudWxsKSxhR1RNLmYuYW4oYUdUTS5jLCJkbFNldCIsZSx7fSksYUdUTS5mLmFuKGFHVE0uYywidXNlTGlzdGVuZXIiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImRsT3JnUHVzaCIsZSwiIiksYUdUTS5jLmRsU3RhdGVFdmVudHM9ImJvb2xlYW4iPT10eXBlb2YgZS5kbFN0YXRlRXZlbnRzJiZlLmRsU3RhdGVFdmVudHMsYUdUTS5jLmFQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLmFQYWdldmlldyYmZS5hUGFnZXZpZXcsYUdUTS5jLnZQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLnZQYWdldmlldyYmZS52UGFnZXZpZXcsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQ9ImJvb2xlYW4iPT10eXBlb2YgZS5zZW5kQ29uc2VudEV2ZW50JiZlLnNlbmRDb25zZW50RXZlbnQsYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9ldmVudHMiLGUsIiIpLGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHI9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cnx8e30sInN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY29uc2VudF9ldmVudHMmJmFHVE0uYy5jb25zZW50X2V2ZW50cyl7Zm9yKHZhciBhPWFHVE0uYy5jb25zZW50X2V2ZW50cy5zcGxpdCgiLCIpLG49W10sbz0wO288YS5sZW5ndGg7bysrKXt2YXIgcj1hW29dLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihyKXt2YXIgcz1yLmluZGV4T2YoIlsiKTtpZihzPj0wKXt2YXIgaT1yLnN1YnN0cmluZygwLHMpLGM9ci5zdWJzdHJpbmcocysxLHIuaW5kZXhPZigiXSIpKSxmPWMuaW5kZXhPZigiOiIpLFQ9e307Zj49MD9UW2Muc3Vic3RyaW5nKDAsZildPWMuc3Vic3RyaW5nKGYrMSk6VFtjXT0iIixhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2ldPVQsbi5wdXNoKGkpfWVsc2Ugbi5wdXNoKHIpfX1hR1RNLmMuY29uc2VudF9ldmVudHM9bi5qb2luKCIsIil9aWYoYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3NhbHQiLGUsMCksYUdUTS5mLmFuKGFHVE0uYywidXNlcl9pZCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywic2Vzc2lvbl9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfc3RvcmVfdXJsIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9wb2xsX21zIixlLDJlMyksZS5zZXNzaW9uJiYib2JqZWN0Ij09dHlwZW9mIGUuc2Vzc2lvbiYmKGUuc2Vzc2lvbi5zaWR8fGUuc2Vzc2lvbi5jb25zZW50fHxlLnNlc3Npb24uYXR0cmlidXRpb258fGUuc2Vzc2lvbi5zb3VyY2UpKXthR1RNLmQuc2Vzc2lvbj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlLnNlc3Npb24pKTt2YXIgTT1lLnNlc3Npb24uY29uc2VudDtNJiYib2JqZWN0Ij09dHlwZW9mIE0mJiEwPT09TS5oYXNSZXNwb25zZSYmInN0cmluZyI9PXR5cGVvZiBNLnNlcnZpY2VzPyhhR1RNLmQuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihNKSksYUdUTS5kLmNvbnNlbnRfaGFzaD1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1hR1RNLmQuY29uc2VudF9oYXNoLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0X3dpdGhfY29uc2VudCIsYUdUTS5mLmxvZygibV9zZXNzaW9uX3ByZXNldF9jb25zZW50IixNKSk6KGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0IixhR1RNLmYubG9nKCJtX3Nlc3Npb25fcHJlc2V0IixlLnNlc3Npb24pKX1pZihlLmNvbnNlbnQ9ZS5jb25zZW50fHx7fSxhR1RNLmMuY29uc2VudD1hR1RNLmMuY29uc2VudHx8ZS5jb25zZW50LGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiaGFzUmVzcG9uc2UiLGUuY29uc2VudCwhMSksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJmZWVkYmFjayIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInB1cnBvc2VzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwic2VydmljZXMiLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJ2ZW5kb3JzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiY29uc2VudF9pZCIsZS5jb25zZW50LCIiKSx3aW5kb3dbYUdUTS5jLmdkbF09d2luZG93W2FHVE0uYy5nZGxdfHxbXSxhR1RNLmQuY29uc2VudD1hR1RNLmQuY29uc2VudHx8SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5jLmNvbnNlbnQpKSwiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmQuY29uc2VudC5ndG1Db25zZW50JiYoYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMSksYUdUTS5kLmNvbmZpZz0hMCxhR1RNLmQuZ3RtTG9hZGVkPVtdLGFHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi5hdHRyaWJ1dGlvbiYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuc2Vzc2lvbi5hdHRyaWJ1dGlvbilmb3IodmFyIEcgaW4gYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24pYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24uaGFzT3duUHJvcGVydHkoRykmJihhR1RNLmQuYXR0cmlidXRpb25bR109YUdUTS5mLnJlc29sdmVBdHRyaWJ1dGlvbihHKSk7ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5sb2cmJmFHVE0uZi5sb2coIm0xIixhR1RNLmMpLCEwPT09YUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuY2FsbF9jYyYmYUdUTS5mLmNhbGxfY2MoKX19LGFHVE0uZi5sb2FkX2NjPWZ1bmN0aW9uKGUsdCl7dmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgic2NyaXB0Iiksbj1hR1RNLmMucGF0aHx8IiI7bi5sZW5ndGg+MCYmIi8iIT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJihuKz0iLyIpO3ZhciBvPSJjbXAvY2NfIithR1RNLmYuc3RyY2xlYW4oZSkrKGFHVE0uYy5taW4/Ii5taW4iOiIiKSsiLmpzIjthLnNyYz1uK28sYUdUTS5jLm5vbmNlJiYoYS5ub25jZT1hR1RNLmMubm9uY2UpLGEub25yZWFkeXN0YXRlY2hhbmdlPWEub25sb2FkPWZ1bmN0aW9uKCl7YS5yZWFkeVN0YXRlJiYhL2xvYWRlZHxjb21wbGV0ZS8udGVzdChhLnJlYWR5U3RhdGUpfHwiZnVuY3Rpb24iPT10eXBlb2YgdCYmdCgpfSxhLmFzeW5jPSEwLGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoYSl9LGFHVE0uZi5jaGVscD1mdW5jdGlvbihlLHQpe3ZhciBhPSEwO3JldHVybiBlJiZ0JiZlLnNwbGl0KCIsIikuZm9yRWFjaChmdW5jdGlvbihlKXt0LmluZGV4T2YoIiwiK2UudHJpbSgpKyIsIik8MCYmKGE9ITEpfSksYX0sYUdUTS5mLmV2YWxDb25zPWZ1bmN0aW9uKGUsdCl7dmFyIGlzQ29uc2VudEdpdmVuPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuIHQuaW5kZXhPZigiLCIrZSsiLCIpPj0wfSl9LGE9IWUucHVycG9zZXMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnB1cnBvc2VzLHQucHVycG9zZXMpLG49IWUuc2VydmljZXMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnNlcnZpY2VzLHQuc2VydmljZXMpLG89IWUudmVuZG9ycy5sZW5ndGh8fGlzQ29uc2VudEdpdmVuKGUudmVuZG9ycyx0LnZlbmRvcnMpO3JldHVybiBhJiZuJiZvfSxhR1RNLmYucnVuX2NjPWZ1bmN0aW9uKGUpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlNCIsbnVsbCksITE7aWYoInN0cmluZyIhPXR5cGVvZiBlfHwiaW5pdCIhPT1lJiYidXBkYXRlIiE9PWUpcmV0dXJuIGFHVE0uZi5sb2coImU1Iix7YWN0aW9uOmV9KSwhMTtpZigiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2hlY2spcmV0dXJuIGFHVE0uZi5sb2coImUxNCIse2FjdGlvbjplfSksITE7dmFyIHQ9bnVsbDtpZigidXBkYXRlIj09PWUmJmFHVE0uZC5jb25zZW50KXt0PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk7dmFyIGE9YUdUTS5kLmNvbnNlbnQ7YS5oYXNSZXNwb25zZT0hMSxhLnNlcnZpY2VzPSIiLGEucHVycG9zZXM9IiIsYS52ZW5kb3JzPSIiLGEuY29uc2VudF9pZD0iIixhLnNlcnZpY2VJRHM9IiIsYS5mZWVkYmFjaz0iIixkZWxldGUgYS5ibG9ja2VkfWlmKCFhR1RNLmYuY29uc2VudF9jaGVjayhlKSlyZXR1cm4gdCYmKGFHVE0uZC5jb25zZW50PXQpLGFHVE0uZi5sb2coIm04IixudWxsKSwhMTt3aW5kb3dbYUdUTS5jLmdkbF09d2luZG93W2FHVE0uYy5nZGxdfHxbXSxhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVB1cnBvc2VzLGFHVE0uZC5jb25zZW50LnB1cnBvc2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1TZXJ2aWNlcyxhR1RNLmQuY29uc2VudC5zZXJ2aWNlcykmJmFHVE0uZi5jaGVscChhR1RNLmMuZ3RtVmVuZG9ycyxhR1RNLmQuY29uc2VudC52ZW5kb3JzKT9hR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSEwOmFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuYmxvY2tlZCYmYUdUTS5kLmNvbnNlbnQuYmxvY2tlZDt2YXIgbj1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLG89biE9PWFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaDtpZihhR1RNLmQubGFzdF9jb25zZW50X2hhc2g9biwidXBkYXRlIj09ZSYmbyYmKGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCksYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiYUdUTV9jb25zZW50X3VwZGF0ZSIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGFHVE1jb25zZW50OmFHVE0uZC5jb25zZW50P0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk6e319KSksInVwZGF0ZSI9PT1lJiYhb3x8ImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NhbGxiYWNrfHxhR1RNLmYuY29uc2VudF9jYWxsYmFjayhlKSxhR1RNLmMuY29uc2VudF9zdG9yZV91cmwpaWYobiE9PWFHVE0uZC5jb25zZW50X2hhc2gpe3ZhciByPXt9O2FHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi51aWQmJihyLnVpZD1hR1RNLmQuc2Vzc2lvbi51aWQpLGFHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi5zaWQmJihyLnNpZD1hR1RNLmQuc2Vzc2lvbi5zaWQpO3ZhciBzPXt9LGk9e2d0bUNvbnNlbnQ6MSxibG9ja2VkOjF9O2Zvcih2YXIgYyBpbiBhR1RNLmQuY29uc2VudClpZihhR1RNLmQuY29uc2VudC5oYXNPd25Qcm9wZXJ0eShjKSYmIWlbY10pe3ZhciBmPWFHVE0uZC5jb25zZW50W2NdOyIiIT09ZiYmbnVsbCE9ZiYmKHNbY109Zil9ci5jb25zZW50PXM7dmFyIFQ9ITA9PT1hR1RNLmMuY29uc2VudF9zdG9yZV9lbmMsTT0ibnVtYmVyIj09dHlwZW9mIGFHVE0uYy5zZXNzaW9uX3NhbHQmJmFHVE0uYy5zZXNzaW9uX3NhbHQ+PTE/YUdUTS5jLnNlc3Npb25fc2FsdDowO2FHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9wb3N0Iix7dXJsOmFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxoYXNoOm59KTt2YXIgRz1hR1RNLmYueHNlbmQoYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsLHIsVCxNKTtHJiYoRy5vbnJlYWR5c3RhdGVjaGFuZ2U9ZnVuY3Rpb24oKXtpZig0PT09Ry5yZWFkeVN0YXRlKWlmKEcuc3RhdHVzPj0yMDAmJkcuc3RhdHVzPDMwMCl7aWYoYUdUTS5kLmNvbnNlbnRfaGFzaD1uLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0ic3luY2VkIixhR1RNLmYubG9nKCJtX2NvbnNlbnRfc3RvcmVfc3luY2VkIix7aGFzaDpufSksRy5yZXNwb25zZVRleHQpdHJ5e3ZhciBlPUpTT04ucGFyc2UoRy5yZXNwb25zZVRleHQpO2UmJiJzdHJpbmciPT10eXBlb2YgZS51aWQmJjA9PT1lLnVpZC5pbmRleE9mKCJDLiIpJiZhR1RNLmQuc2Vzc2lvbiYmZS51aWQhPT1hR1RNLmQuc2Vzc2lvbi51aWQmJihhR1RNLmYubG9nKCJtX3VpZF9wcm9tb3RlZCIse29sZDphR1RNLmQuc2Vzc2lvbi51aWQsbmV3OmUudWlkfSksYUdUTS5kLnNlc3Npb24udWlkPWUudWlkKX1jYXRjaChlKXthR1RNLmYubG9nKCJlX2NvbnNlbnRfc3RvcmVfcGFyc2UiLHttc2c6ZS5tZXNzYWdlfSl9fWVsc2UgYUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlIix7c3RhdHVzOkcuc3RhdHVzfSl9KX1lbHNlIGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0iY29uZmlybWVkIjtyZXR1cm4gYUdUTS5mLmxvZygibTMiLGFHVE0uZC5jb25zZW50KSwhMH0sYUdUTS5mLmNhbGxfY2M9ZnVuY3Rpb24oKXtyZXR1cm4hKCJmdW5jdGlvbiIhPXR5cGVvZiBhR1RNLmYucnVuX2NjfHwhYUdUTS5mLnJ1bl9jYygiaW5pdCIpKSYmKHZvaWQgMCE9PWFHVE0uZC50aW1lci5jb25zZW50JiYoY2xlYXJJbnRlcnZhbChhR1RNLmQudGltZXIuY29uc2VudCksZGVsZXRlIGFHVE0uZC50aW1lci5jb25zZW50KSwhIWFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpfSwiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXImJihhR1RNLmYuY29uc2VudF9saXN0ZW5lcj1mdW5jdGlvbigpe2FHVE0uYy51c2VMaXN0ZW5lcnx8KCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuY2FsbF9jYyYmYUdUTS5mLmNhbGxfY2MoKT8iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbCYmYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbCgpOmFHVE0uZC50aW1lci5jb25zZW50PXNldEludGVydmFsKGZ1bmN0aW9uKCl7YUdUTS5mLmNhbGxfY2MoKSYmImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKX0sNTAwKSl9KSxhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsPWZ1bmN0aW9uKCl7YUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsJiYoIm51bWJlciIhPXR5cGVvZiBhR1RNLmMuY29uc2VudF9wb2xsX21zfHxhR1RNLmMuY29uc2VudF9wb2xsX21zPD0wfHxhR1RNLmQudGltZXImJmFHVE0uZC50aW1lci5jb25zZW50X3BvbGx8fChhR1RNLmQudGltZXI9YUdUTS5kLnRpbWVyfHx7fSxhR1RNLmQudGltZXIuY29uc2VudF9wb2xsPXNldEludGVydmFsKGZ1bmN0aW9uKCl7ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5ydW5fY2MmJmFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpfSxhR1RNLmMuY29uc2VudF9wb2xsX21zKSkpfSxhR1RNLmYuZ2M9ZnVuY3Rpb24oZSl7dmFyIHQ9bmV3IFJlZ0V4cChlKyI9KFteO10rKSIpLGE9bnVsbDt0cnl7dmFyIG49ZG9jdW1lbnQsbz10LmV4ZWMoblthR1RNLm4uY2tdKTtvJiZvLmxlbmd0aD4xJiYoYT1kZWNvZGVVUklDb21wb25lbnQob1sxXSkpfWNhdGNoKGUpe31yZXR1cm4gYX0sYUdUTS5mLnNjPWZ1bmN0aW9uKGUsdCl7aWYoInN0cmluZyI9PXR5cGVvZiBlJiZlJiZ0KXRyeXtkb2N1bWVudFthR1RNLm4uY2tdPWUrIj0iK3QrIjsgU2VjdXJlOyBTYW1lU2l0ZT1MYXg7IHBhdGg9LyJ9Y2F0Y2goZSl7fX0sYUdUTS5mLnVybFBhcmFtPWZ1bmN0aW9uKGUsdCl7dmFyIGE9bmV3IFJlZ0V4cCgiWz8mXSIrZSsiKD0oW14mI10qKXwmfCN8JCkiKS5leGVjKHQpO3JldHVybiBhJiZhWzJdP2RlY29kZVVSSUNvbXBvbmVudChhWzJdLnJlcGxhY2UoL1wrL2csIiAiKSk6bnVsbH0sYUdUTS5mLm9wdG91dD1mdW5jdGlvbigpe3ZhciBlPSExLHQ9YUdUTS5mLnVybFBhcmFtKCJhR1RNb3B0b3V0Iix3aW5kb3cubG9jYXRpb24uaHJlZik7aWYodCYmIjAiIT09dClhR1RNLmYuc2MoImFHVE1vcHRvdXQiLCIxIiksZT0hMDtlbHNlIGlmKCIwIj09PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMCIpO2Vsc2V7dmFyIGE9YUdUTS5mLmdjKCJhR1RNb3B0b3V0Iik7YSYmIjAiIT09YSYmKGU9ITApfWlmKGUpe2Zvcih2YXIgbiBpbiBhR1RNKWFHVE0uaGFzT3duUHJvcGVydHkobikmJiJmIiE9PW4mJmRlbGV0ZSBhR1RNW25dO3JldHVybiBhR1RNLmYub2JqaW5pdCgpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYub3B0b3V0X2NhbGxiYWNrJiZhR1RNLmYub3B0b3V0X2NhbGxiYWNrKCksITB9cmV0dXJuITF9LGFHVE0uZi5hR1RNX2V2ZW50PWZ1bmN0aW9uKGUpeyJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJihhR1RNLmQuY29uc2VudD1udWxsKSxlfHwoZT0iYUdUTV9ldmVudCIpO3ZhciB0PXtldmVudDplLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKSxhR1RNY29uc2VudDphR1RNLmQuY29uc2VudD9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpOnt9fTtyZXR1cm4iYUdUTV9yZWFkeSI9PWUmJih0LmFHVE09e3ZlcnNpb246YUdUTS5kLnZlcnNpb24saXNfaWZyYW1lOmFHVE0uZC5pc19pZnJhbWUsaGFzdHlFdmVudHM6YUdUTS5kLmYsZXJyb3JzOmFHVE0uZC5lcnJvcnN9KSx0fSxhR1RNLmYucHJveHlTdXBwb3J0PWZ1bmN0aW9uKCl7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIFByb3h5KXJldHVybiExO3RyeXtyZXR1cm4gbmV3IFByb3h5KGZ1bmN0aW9uKCl7fSx7YXBwbHk6ZnVuY3Rpb24oKXtyZXR1cm4hMH19KSgpfWNhdGNoKGUpe3JldHVybiExfX0sYUdUTS5mLnVybExpc3RlbmVyPWZ1bmN0aW9uKGUsdCxhKXsibnVtYmVyIiE9dHlwZW9mIHQmJih0PTUwMCksImJvb2xlYW4iIT10eXBlb2YgYSYmKGE9ITEpLGFHVE0uZC5sYXN0X3VybD1hR1RNLmQubGFzdF91cmx8fGFHVE0uZi5nZXRWYWwoImwiLCJocmVmIiksInN0cmluZyI9PXR5cGVvZiBhR1RNLmQubGFzdF91cmwmJmFHVE0uZC5sYXN0X3VybHx8KGFHVE0uZC5sYXN0X3VybD0iIik7dmFyIGNoZWNrVXJsQ2hhbmdlPWZ1bmN0aW9uKCl7dmFyIHQ9YUdUTS5mLmdldFZhbCgibCIsImhyZWYiKXx8IiI7aWYodCE9YUdUTS5kLmxhc3RfdXJsKXsic3RyaW5nIiE9dHlwZW9mIGUmJihlPSJ2UGFnZXZpZXciKTt2YXIgYT17ZXZlbnQ6ZX07YS5vbGRVUkw9YUdUTS5kLmxhc3RfdXJsLGEubmV3VVJMPXQsYS5uZXdUaXRsZT1kb2N1bWVudC50aXRsZSxhR1RNLmYuZmlyZShhKSxhR1RNLmQubGFzdF91cmw9dH19O2FHVE0uZi5ldkxzdG4oIndpbmRvdyIsInBvcHN0YXRlIixjaGVja1VybENoYW5nZSksYUdUTS5mLmV2THN0bigid2luZG93IiwiaGFzaGNoYW5nZSIsY2hlY2tVcmxDaGFuZ2UpO3ZhciBuPSExO2lmKGFHVE0uZi5wcm94eVN1cHBvcnQoKSl7dmFyIG89e2FwcGx5OmZ1bmN0aW9uKGUsdCxhKXt2YXIgbj1lLmFwcGx5KHQsYSk7cmV0dXJuIGNoZWNrVXJsQ2hhbmdlKCksbn19O2hpc3RvcnkucHVzaFN0YXRlPW5ldyBQcm94eShoaXN0b3J5LnB1c2hTdGF0ZSxvKSxoaXN0b3J5LnJlcGxhY2VTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5yZXBsYWNlU3RhdGUsbyksbj0hMH0odD4wJiYhbiYmYXx8dD4wJiYhYSkmJmFHVE0uZi50aW1lcigidXJsTGlzdGVuZXIiLGNoZWNrVXJsQ2hhbmdlLG51bGwsdCwwKX0sYUdUTS5mLmd0bV9sb2FkPWZ1bmN0aW9uKGUsdCxhLG4sbyxyKXtpZihhR1RNLmQuY29uZmlnKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5ndG1Mb2FkZWQmJihhR1RNLmQuZ3RtTG9hZGVkPVtdKSxhR1RNLmQuZ3RtTG9hZGVkLmxlbmd0aDwxJiYoYUdUTS5mLnNlbmRuYXVzKGFHVE0uZi5hR1RNX2V2ZW50KCJhR1RNX3JlYWR5IikpLGEmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6Imd0bS5qcyIsImd0bS5zdGFydCI6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMuYVBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhUGFnZXZpZXciLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy52UGFnZXZpZXcmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6InZQYWdldmlldyIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLnZQYWdldmlld3MmJmFHVE0uZi51cmxMaXN0ZW5lcigidlBhZ2V2aWV3IixhR1RNLmMudlBhZ2V2aWV3c1RpbWVyLGFHVE0uYy52UGFnZXZpZXdzRmFsbGJhY2spKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQmJmFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQmJiFhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9jb25zZW50IikpLGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQ9ITApLGEpe258fChuPSJpZCIpO3ZhciBzPSExLGk9YUdUTS5mLmdjKCJhR1RNZGVidWciKTtpZihpJiZwYXJzZUludChpKT4wJiYocz0hMCksc3x8YUdUTS5mLnVybFBhcmFtKCJndG1fZGVidWciLGRvY3VtZW50LmxvY2F0aW9uLmhyZWYpJiYocz0hMCksIXMmJmRvY3VtZW50LnJlZmVycmVyKXt2YXIgYz10LmNyZWF0ZUVsZW1lbnQoImEiKTtjLmhyZWY9ZG9jdW1lbnQucmVmZXJyZXIsYy5ob3N0bmFtZT09YUdUTS5uLnRhKyIuY29tIiYmKHM9ITApfSFpJiZzJiZhR1RNLmYuc2MoImFHVE1kZWJ1ZyIsIjEiKTt2YXIgZj10LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpO2lmKGYuaWQ9ImFHVE1fdG1fIithLGYuYXN5bmM9ITAsIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtQXR0cilmb3IodmFyIFQgaW4gYUdUTS5jLmd0bUF0dHIpZi5zZXRBdHRyaWJ1dGUoVCxhR1RNLmMuZ3RtQXR0cltUXSk7aWYoYUdUTS5jLm5vbmNlJiYoZi5ub25jZT1hR1RNLmMubm9uY2UpLHIuZ3RtSlMmJiFzKWYuaW5uZXJIVE1MPWF0b2Ioci5ndG1KUyk7ZWxzZXt2YXIgTT1yLmd0bVVSTHx8Imh0dHBzOi8vd3d3LiIrYUdUTS5uLnRtKyIuY29tL2d0bS5qcyIsRz1yLmVudnx8IiIsZD0tMT09PU0uaW5kZXhPZigiPyIpPyI/IjoiJiI7Zi5zcmM9TStkK24rIj0iK2ErIiZsPSIrbytHfXZhciBsPXQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoInNjcmlwdCIpWzBdO2wucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoZixsKSxhR1RNLmQuZ3RtTG9hZGVkLnB1c2goYXx8Im5vX2d0bV9pZCIpfX1lbHNlIGFHVE0uZi5sb2coImU3IixudWxsKX0sYUdUTS5mLmRvbXJlYWR5PWZ1bmN0aW9uKGUpe3ZhciB0PSExO2FHVE0uZi52T2IoZSl8fChlPXthTVNHOiJFbXB0eSBET01yZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYURPTXJlYWR5IiksYUdUTS5kLmRvbV9yZWFkeSYmdHx8KCFhR1RNLmMuZGxTdGF0ZUV2ZW50cyYmdHx8YUdUTS5mLmZpcmUoZSksdCYmKGFHVE0uZC5kb21fcmVhZHk9ITApKX0sYUdUTS5mLnBhZ2VyZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgUEFHRXJlYWR5IGV2ZW50IGZpcmVkLiJ9LHQ9ITApLGUuZXZlbnR8fChlLmV2ZW50PSJhUEFHRXJlYWR5IiksYUdUTS5kLnBhZ2VfcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQucGFnZV9yZWFkeT0hMCkpfSxhR1RNLmYuaW5pdEdUTT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5ndG0mJmFHVE0uYy5ndG0pe3ZhciB0PTA7Zm9yKHZhciBhIGluIGFHVE0uYy5ndG0pdCsrLGFHVE0uYy5ndG0uaGFzT3duUHJvcGVydHkoYSkmJigiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZCYmKGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkPSExKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZHx8ZSYmIWFHVE0uYy5ndG1bYV0ubm9Db25zZW50fHwoYUdUTS5mLmd0bV9sb2FkKHdpbmRvdyxkb2N1bWVudCxhLGFHVE0uYy5ndG1bYV0uaWRQYXJhbT9hR1RNLmMuZ3RtW2FdLmlkUGFyYW06IiIsYUdUTS5jLmdkbCxhR1RNLmMuZ3RtW2FdKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZD0hMCkpO3R8fGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsIiIsYUdUTS5jLmd0bVthXS5pZFBhcmFtP2FHVE0uYy5ndG1bYV0uaWRQYXJhbToiIixhR1RNLmMuZ2RsLG51bGwpfX0sYUdUTS5mLmNoa0RQcmVhZHk9ZnVuY3Rpb24oKXt2YXIgZT1kb2N1bWVudC5yZWFkeVN0YXRlOyJpbnRlcmFjdGl2ZSI9PT1lfHwiY29tcGxldGUiPT09ZT9hR1RNLmYuZG9tcmVhZHkobnVsbCk6YUdUTS5mLmV2THN0bihkb2N1bWVudCwiRE9NQ29udGVudExvYWRlZCIsYUdUTS5mLmRvbXJlYWR5KSwiY29tcGxldGUiPT09ZT9hR1RNLmYucGFnZXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4od2luZG93LCJsb2FkIixhR1RNLmYucGFnZXJlYWR5KX0sYUdUTS5mLmluamVjdD1mdW5jdGlvbigpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlOCIsbnVsbCksITE7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8ImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2V8fCFhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSlyZXR1cm4gYUdUTS5mLmxvZygiZTEzIixudWxsKSwhMTthR1RNLmQuaW5pdHx8KCh3aW5kb3dbYUdUTS5jLmdkbF18fFtdKS5mb3JFYWNoKGZ1bmN0aW9uKGUsdCl7aWYoIm9iamVjdCI9PXR5cGVvZiBlJiZlKXtpZighZS5hR1RNY2hrKXtlLmFHVE1kbD0hMDt2YXIgYT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dm9pZCAwIT09YVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSYmZGVsZXRlIGFbImd0bS51bmlxdWVFdmVudElkIl0sYUdUTS5kLmYucHVzaChhKX19ZWxzZSBhR1RNLmYubG9nKCJlMTciLHtvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZSxpbmRleDp0fSksYUdUTS5kLmYucHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KX0pLGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQmJihhR1RNLmYuaW5pdEdUTSghMSksYUdUTS5kLmluaXQ9ITApLGFHVE0uZC5pbml0JiZhR1RNLmYuY2hrRFByZWFkeSgpKTtyZXR1cm4iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmluamVjdF9jYWxsYmFjayYmYUdUTS5mLmluamVjdF9jYWxsYmFjaygpLGFHVE0uZi5sb2coIm02IixudWxsKSwhMH0sYUdUTS5mLmlGcmFtZUZpcmU9ZnVuY3Rpb24oZSl7Im9iamVjdCI9PXR5cGVvZiBlJiZlJiYoYUdUTS5kLmlzX2lmcmFtZSYmInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiYvXihhR1RNfGd0bVwufFthdl1ET01yZWFkeXxbYXZdUEFHRXJlYWR5KS8udGVzdChlLmV2ZW50KT9hR1RNLmYuc2VuZG5hdXMoZSk6KGUuYUdUTV9zb3VyY2U9ImlGcmFtZSAiK2RvY3VtZW50LmxvY2F0aW9uLmhvc3RuYW1lLGFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMrKyxlLmlmRXZDdHI9YUdUTS5kLmlmcmFtZS5jb3VudGVyLmV2ZW50cywic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJmUuZXZlbnQmJihhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdfHwwLGFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XSsrLGVbImlmRXZDdHJfIitlLmV2ZW50XT1hR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0pLGUuYUdUTXRzJiZkZWxldGUgZS5hR1RNdHMsZS5hR1RNcGFyYW1zJiZkZWxldGUgZS5hR1RNcGFyYW1zLGFHVE0uZC5pZnJhbWUub3JpZ2luP3dpbmRvdy50b3AucG9zdE1lc3NhZ2UoZSxhR1RNLmQuaWZyYW1lLm9yaWdpbik6YUdUTS5kLmYucHVzaChlKSkpfSxhR1RNLmYuaWZIYW5kc2hha2U9ZnVuY3Rpb24oKXtpZighYUdUTS5kLmlzX2lmcmFtZSYmIWFHVE0uZC5pZnJhbWUuaGFuZHNoYWtlKXt2YXIgZT1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaWZyYW1lIik7aWYoIWUubGVuZ3RoKXJldHVybjtmb3IodmFyIHQ9MDt0PGUubGVuZ3RoO3QrKyl7dmFyIGE9ZVt0XTthJiZhLmNvbnRlbnRXaW5kb3cmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSYmYS5jb250ZW50V2luZG93LnBvc3RNZXNzYWdlKCJhR1RNX1RvcDJpRnJhbWUgSGFuZHNoYWtlIiwiKiIpfWFHVE0uZC5pZnJhbWUuaGFuZHNoYWtlPSEwfX0sYUdUTS5mLmlmSFNsaXN0ZW49ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmlzX2lmcmFtZSYmInN0cmluZyI9PXR5cGVvZiBlLmRhdGEmJiJhR1RNX1RvcDJpRnJhbWUgSGFuZHNoYWtlIj09ZS5kYXRhKWZvcihhR1RNLmQuaWZyYW1lLm9yaWdpbj1lLm9yaWdpbixhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSExLHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbiwhMSk7YUdUTS5kLmYubGVuZ3RoOyl7dmFyIHQ9YUdUTS5kLmYuc2hpZnQoKTthR1RNLmYuaUZyYW1lRmlyZSh0KX19LGFHVE0uZi52T2I9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCIhPXR5cGVvZiBlfHwhZSlyZXR1cm4hMTt0cnl7SlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShlKSl9Y2F0Y2goZSl7cmV0dXJuITF9cmV0dXJuITB9LGFHVE0uZi52U3Q9ZnVuY3Rpb24oZSl7dmFyIHQ9QXJyYXkuaXNBcnJheShlKT9lOiJzdHJpbmciPT10eXBlb2YgZT9bZV06W107cmV0dXJuIDAhPT10Lmxlbmd0aCYmdC5ldmVyeShmdW5jdGlvbihlKXtyZXR1cm4ic3RyaW5nIj09dHlwZW9mIGUmJiIiIT09ZX0pfSxhR1RNLmYuZXZMc3RuPWZ1bmN0aW9uKGUsdCxhKXtpZigid2luZG93Ij09PWUmJihlPXdpbmRvdyksImRvY3VtZW50Ij09PWUmJihlPWRvY3VtZW50KSwib2JqZWN0Ij09dHlwZW9mIGUmJmUmJiJzdHJpbmciPT10eXBlb2YgdCYmImZ1bmN0aW9uIj09dHlwZW9mIGEpdHJ5eyJtZXNzYWdlIj09dD9hR1RNLmQuaWZyYW1lLnRvcExpc3Rlbnx8YUdUTS5kLmlzX2lmcmFtZXx8KGFHVE0uZC5pZnJhbWUudG9wTGlzdGVuPSEwLGUuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe2Eodm9pZCAwIT09ZS5kYXRhP2UuZGF0YTpudWxsLCJzdHJpbmciPT10eXBlb2YgZS5vcmlnaW4/ZS5vcmlnaW46IiIpfSkpOmUuYWRkRXZlbnRMaXN0ZW5lcih0LGEpfWNhdGNoKG4pe2FHVE0uZi5sb2coImUxMiIse2Vycm9yOm4sZWw6ZSxldjp0LGZjdDphfSl9ZWxzZSBhR1RNLmYubG9nKCJlMTEiLHtlbDplLGV2OnQsZmN0OmF9KX0sYUdUTS5mLnJtTHN0bj1mdW5jdGlvbihlLHQsYSl7IndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCk7dHJ5e2UucmVtb3ZlRXZlbnRMaXN0ZW5lcih0LGEpfWNhdGNoKGUpe319LGFHVE0uZi5nZXRWYWw9ZnVuY3Rpb24oZSx0KXtpZihhR1RNLmYudlN0KFtlLHRdKSYmdC5tYXRjaCgvW2Etel0rL2kpJiYoInAiIT1lfHwib2JqZWN0Ij09dHlwZW9mIHBlcmZvcm1hbmNlJiZwZXJmb3JtYW5jZSkpc3dpdGNoKGUpe2Nhc2UidyI6cmV0dXJuIGFHVE0uZi52T2Iod2luZG93W3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZih3aW5kb3dbdF0pKTp3aW5kb3dbdF07Y2FzZSJuIjpyZXR1cm4gYUdUTS5mLnZPYihuYXZpZ2F0b3JbdF0pP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKG5hdmlnYXRvclt0XSkpOm5hdmlnYXRvclt0XTtjYXNlImQiOnJldHVybiBkb2N1bWVudFt0XTtjYXNlImwiOnJldHVybiBkb2N1bWVudC5sb2NhdGlvblt0XTtjYXNlImgiOnJldHVybiBkb2N1bWVudC5oZWFkW3RdO2Nhc2UiYiI6cmV0dXJuIGRvY3VtZW50LmJvZHlbdF07Y2FzZSJzIjpyZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImh0bWwiKVswXS5zY3JvbGxUb3B8fDA7Y2FzZSJtIjpyZXR1cm4gd2luZG93LnNjcmVlblt0XTtjYXNlImMiOnJldHVybiB3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhJiZ3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhLmljcz9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZih3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhLmljcykpOm51bGw7Y2FzZSJwIjpyZXR1cm4ibm93Ij09dD9wZXJmb3JtYW5jZS5ub3coKTpwZXJmb3JtYW5jZVt0XTtkZWZhdWx0OnJldHVybn19LGFHVE0uZi5nZXROb2RlQXR0cj1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZSk7cmV0dXJuIGE/YS5nZXRBdHRyaWJ1dGUodCk6bnVsbH0sYUdUTS5mLm5ld05vZGU9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYib2JqZWN0Ij09dHlwZW9mIGEpe3ZhciBuPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoZSksbz1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHQpO2lmKG8pe2Zvcih2YXIgciBpbiBhKWlmKGEuaGFzT3duUHJvcGVydHkocikpe3ZhciBzPXIuc3BsaXQoIi4iKTsxPT09cy5sZW5ndGg/bi5zZXRBdHRyaWJ1dGUocixhW3JdKToobltzWzBdXXx8KG5bc1swXV09e30pLG5bc1swXV1bc1sxXV09YVtyXSl9by5hcHBlbmRDaGlsZChuKX19fSxhR1RNLmYuZGVsTm9kZT1mdW5jdGlvbihlKXtpZihhR1RNLmYudlN0KGUpKXt2YXIgdD1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3QmJnQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0KX19LGFHVE0uZi5wYWdlaW5mbz1mdW5jdGlvbihlKXt2YXIgdD0wLGE9MDtpZigoZT1lfHx7fSkuY291bnRXb3JkcyYmZnVuY3Rpb24gZ2V0VGV4dChlKXtpZigzPT09ZS5ub2RlVHlwZSl0Kz1lLnRleHRDb250ZW50LnRyaW0oKS5zcGxpdCgvXHMrLykubGVuZ3RoO2Vsc2UgaWYoMT09PWUubm9kZVR5cGUmJiEvXihzY3JpcHR8c3R5bGV8bm9zY3JpcHQpJC9pLnRlc3QoZS50YWdOYW1lKSlmb3IodmFyIGE9MDthPGUuY2hpbGROb2Rlcy5sZW5ndGg7YSsrKWdldFRleHQoZS5jaGlsZE5vZGVzW2FdKX0oZG9jdW1lbnQuYm9keSksZS5jb3VudEltYWdlcylmb3IodmFyIG49ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImltZyIpLG89MDtvPG4ubGVuZ3RoO28rKyluW29dLm5hdHVyYWxXaWR0aD4yNTAmJm5bb10ubmF0dXJhbEhlaWdodD4yNTAmJmErKztyZXR1cm57d29yZHM6dCxpbWFnZXM6YX19LGFHVE0uZi5jcExzdD1mdW5jdGlvbihlLHQsYSl7dHJ5e2UuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe3ZhciB0O3dpbmRvdy5nZXRTZWxlY3Rpb24mJih0PXdpbmRvdy5nZXRTZWxlY3Rpb24oKS50b1N0cmluZygpKSYmYSh0KX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuZWxMc3Q9ZnVuY3Rpb24oZSx0LGEpe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXtmb3IodmFyIHQ9dGhpcy50YWdOYW1lLnRvTG93ZXJDYXNlKCksbj0iIixvPSIiLHI9bnVsbCxzPW51bGwsaT0wLGM9dGhpcztjJiZjLnBhcmVudEVsZW1lbnQ7KWM9Yy5wYXJlbnRFbGVtZW50LCFuJiZjLmlkJiYobj0oInN0cmluZyI9PXR5cGVvZiBjLm5vZGVOYW1lP2Mubm9kZU5hbWUudG9Mb3dlckNhc2UoKSsiOiI6IiIpK2MuaWQpLCFvJiZjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSYmKG89KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSk7aWYoImlucHV0Ij09PXR8fCJzZWxlY3QiPT09dHx8InRleHRhcmVhIj09PXQpe2ZvcihjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50JiYiZm9ybSIhPT1jLnRhZ05hbWUudG9Mb3dlckNhc2UoKTspYz1jLnBhcmVudEVsZW1lbnQ7ImZvcm0iPT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCkmJihyPXtpZDpjLmlkLGNsYXNzOmMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpLG5hbWU6Yy5nZXRBdHRyaWJ1dGUoIm5hbWUiKSxhY3Rpb246Yy5hY3Rpb24sZWxlbWVudHM6Yy5lbGVtZW50cy5sZW5ndGh9LHM9QXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChjLmVsZW1lbnRzLHRoaXMpKzEpfSJvYmplY3QiPT10eXBlb2YgdGhpcy5lbGVtZW50cyYmIm51bWJlciI9PXR5cGVvZiB0aGlzLmVsZW1lbnRzLmxlbmd0aCYmKGk9dGhpcy5lbGVtZW50cy5sZW5ndGgpO3ZhciBmPXt0YWdOYW1lOnQsdGFyZ2V0OnRoaXMudGFyZ2V0fHwiIixwYXJlbnRJRDpuLHBhcmVudENsYXNzOm8saWQ6dGhpcy5pZHx8IiIsbmFtZTp0aGlzLmdldEF0dHJpYnV0ZSgibmFtZSIpfHwiIixjbGFzczp0aGlzLmdldEF0dHJpYnV0ZSgiY2xhc3MiKXx8IiIsaHJlZjp0aGlzLmhyZWZ8fCIiLHNyYzp0aGlzLnNyY3x8IiIsYWN0aW9uOnRoaXMuYWN0aW9ufHwiIix0eXBlOnRoaXMudHlwZXx8IiIsZWxlbWVudHM6aSxwb3NpdGlvbjpzLGZvcm06cixodG1sOnRoaXMub3V0ZXJIVE1MP3RoaXMub3V0ZXJIVE1MLnRvU3RyaW5nKCk6IiIsdGV4dDp0aGlzLm91dGVyVGV4dD90aGlzLm91dGVyVGV4dC50b1N0cmluZygpOiIifTtmLmh0bWwubGVuZ3RoPjUxMiYmKGYuaHRtbD1mLmh0bWwuc2xpY2UoMCw1MDkpKyIuLi4iKSxmLnRleHQubGVuZ3RoPjUxMiYmKGYudGV4dD1mLnRleHQuc2xpY2UoMCw1MDkpKyIuLi4iKSxhKGYpfSl9Y2F0Y2godCl7YUdUTS5mLmxvZygiZTEyIix7ZWxlbWVudDplLGVycm9yOnR9KX19LGFHVE0uZi5hZGRFbExzdD1mdW5jdGlvbihlLHQsYSl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGUpOyJvYmplY3QiPT10eXBlb2YgbiYmIm51bWJlciI9PXR5cGVvZiBuLmxlbmd0aCYmMCE9bi5sZW5ndGgmJm4uZm9yRWFjaChmdW5jdGlvbihlKXtpZigiY29weSI9PT10KWFHVE0uZi5jcExzdChlLHQsYSk7ZWxzZSBhR1RNLmYuZWxMc3QoZSx0LGEpfSl9fSxhR1RNLmYub2JzZXJ2ZXI9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7bmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24obil7bi5mb3JFYWNoKGZ1bmN0aW9uKG4peyJjaGlsZExpc3QiPT09bi50eXBlJiZuLmFkZGVkTm9kZXMubGVuZ3RoJiZBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG4uYWRkZWROb2RlcyxmdW5jdGlvbihuKXtpZigxPT09bi5ub2RlVHlwZSYmInN0cmluZyI9PXR5cGVvZiBuLnRhZ05hbWUmJm4udGFnTmFtZS50b0xvd2VyQ2FzZSgpPT09ZS50b0xvd2VyQ2FzZSgpJiZhR1RNLmYuZWxMc3Qobix0LGEpLDE9PT1uLm5vZGVUeXBlJiZuLnF1ZXJ5U2VsZWN0b3JBbGwpe3ZhciBvPW4ucXVlcnlTZWxlY3RvckFsbChlLnRvTG93ZXJDYXNlKCkpO0FycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwobyxmdW5jdGlvbihlKXthR1RNLmYuZWxMc3QoZSx0LGEpfSl9fSl9KX0pLm9ic2VydmUoZG9jdW1lbnQuYm9keSx7Y2hpbGRMaXN0OiEwLHN1YnRyZWU6ITAsYXR0cmlidXRlczohMX0pfX0sYUdUTS5mLnJUZXN0PWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGFHVE0uZi52U3QoW2UsdF0pJiZuZXcgUmVnRXhwKHQsImkiKS50ZXN0KGUpfSxhR1RNLmYuck1hdGNoPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUubWF0Y2gobmV3IFJlZ0V4cCh0KSl9LGFHVE0uZi5yUmVwbGFjZT1mdW5jdGlvbihlLHQsYSl7cmV0dXJuIGFHVE0uZi52U3QoW2UsdCxhXSk/ZS5yZXBsYWNlKG5ldyBSZWdFeHAodCwiZ2kiKSxhKTplfSxhR1RNLmYuaXNJRnJhbWU9ZnVuY3Rpb24oKXtyZXR1cm4gd2luZG93LnNlbGYhPT13aW5kb3cudG9wfSxhR1RNLmYuanNlcnJvcnM9ZnVuY3Rpb24oKXthR1RNLmYuZXZMc3RuKHdpbmRvdywiZXJyb3IiLGZ1bmN0aW9uKGUpe2lmKG51bGwhPT1lKXt2YXIgdD0ic3RyaW5nIj09dHlwZW9mIGUubWVzc2FnZT9lLm1lc3NhZ2U6IiIsYT0ic3RyaW5nIj09dHlwZW9mIGUuZmlsZW5hbWU/ZS5maWxlbmFtZToiIjtpZigic2NyaXB0IGVycm9yLiI9PXQudG9Mb3dlckNhc2UoKSl7aWYoIWEpcmV0dXJuO3Q9dC5yZXBsYWNlKCIuIiwiOiIpKyIgZXJyb3IgZnJvbSBvdGhlciBkb21haW4uIn1hJiYodCs9IiB8IGZpbGU6ICIrYSk7dmFyIG49YUdUTS5mLnN0cmNsZWFuKGUubGluZW5vKTsiMCI9PW4mJihuPSIiKSxuJiYodCs9IiB8IGxpbmU6ICIrbik7dmFyIG89YUdUTS5mLnN0cmNsZWFuKGUuY29sbm8pOyIwIj09byYmKG89IiIpLG8mJih0Kz0iIHwgY29sOiAiK28pLGFHVE0uZC5lcnJvcnMucHVzaCh0KTt2YXIgcj0iIjt0cnl7cj1uYXZpZ2F0b3IuYXBwQ29kZU5hbWUrIiB8ICIrbmF2aWdhdG9yLmFwcE5hbWUrIiB8ICIrbmF2aWdhdG9yLmFwcFZlcnNpb24rIiB8ICIrbmF2aWdhdG9yLnBsYXRmb3JtfWNhdGNoKGUpe31pZihhR1RNLmQuZXJyb3JfY291bnRlcisrPj0xMDApcmV0dXJuO2FHVE0uZC5lcnJvcl9jb3VudGVyPD01JiZhR1RNLmYuZmlyZSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOnQsYnJvd3NlcjpyLGVycnR5cGU6IkpTIEVycm9yIix0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXIsZXZlbnRNb2RlbDpudWxsfSl9fSl9LGFHVE0uZi50aW1lcmZrdD1mdW5jdGlvbihlKXt2YXIgdD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dC50aW1lcl9tcz0xKnQudGltZXJfbXMsdC50aW1lcl9jdCsrLHQudGltZXJfdG09dC50aW1lcl9tcyp0LnRpbWVyX2N0LHQudGltZXJfc2M9cGFyc2VGbG9hdCgodC50aW1lcl90bS8xZTMpLnRvRml4ZWQoMykpLHQuZXZlbnQ9dC5ldmVudHx8InRpbWVyIiwtMSE9PXQuZXZlbnQuaW5kZXhPZigiW3NdIikmJih0LmV2ZW50PXQuZXZlbnQucmVwbGFjZSgiW3NdIix0LnRpbWVyX3NjLnRvU3RyaW5nKCkpKSx0LmV2ZW50TW9kZWw9bnVsbCxhR1RNLmYuZmlyZSh0KX0sYUdUTS5mLnRpbWVyPWZ1bmN0aW9uKGUsdCxhLG4sbyl7aWYoIWUmJiJvYmplY3QiPT10eXBlb2YgYSYmYSYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoZT1hLmV2ZW50KSxlPWV8fCJ0aW1lciIsZSs9Il8iKyhuZXcgRGF0ZSkuZ2V0VGltZSgpLnRvU3RyaW5nKCkrIl8iK01hdGguZmxvb3IoOTk5OTk5Kk1hdGgucmFuZG9tKCkrMSkudG9TdHJpbmcoKSxhR1RNLmYuc3RvcHRpbWVyKGUpLCJvYmplY3QiPT10eXBlb2YgYSYmYSl2YXIgcj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZWxzZSByPXt9O3IudGltZXJfbm09ZSxyLnRpbWVyX21zPW4sci50aW1lcl9ycD1vLHIudGltZXJfY3Q9MCxyLmlkPTE9PT1yLnRpbWVyX3JwP3NldFRpbWVvdXQoZnVuY3Rpb24oKXt0P3Qocik6YUdUTS5mLnRpbWVyZmt0KHIpfSxuKTpzZXRJbnRlcnZhbChmdW5jdGlvbigpe3Q/dChyKTphR1RNLmYudGltZXJma3Qociksci50aW1lcl9jdCsrLHIudGltZXJfcnA+MCYmci50aW1lcl9jdD49ci50aW1lcl9ycCYmYUdUTS5mLnN0b3B0aW1lcihyLnRpbWVyX25tKX0sbiksYUdUTS5kLnRpbWVyW2VdPXJ9LGFHVE0uZi5zdG9wdGltZXI9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQudGltZXImJihhR1RNLmQudGltZXI9e30pLCJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnRpbWVyW2VdKXt2YXIgdD1hR1RNLmQudGltZXJbZV07MT09PXQudGltZXJfcnA/Y2xlYXJUaW1lb3V0KHQuaWQpOmNsZWFySW50ZXJ2YWwodC5pZCksZGVsZXRlIGFHVE0uZC50aW1lcltlXX19LGFHVE0uZi5kbHJlcGVhdD1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUmJiFhR1RNLmQuZGxyZXBlYXREb25lKXt2YXIgZGJnPWZ1bmN0aW9uKHQsYSl7ZS5kZWJ1ZyYmIm9iamVjdCI9PXR5cGVvZiB3aW5kb3cuY29uc29sZSYmd2luZG93LmNvbnNvbGUubG9nJiZ3aW5kb3cuY29uc29sZS5sb2coImFHVE0gZGxyZXBlYXQ6ICIrdCxhKX0sZ2V0U3JjPWZ1bmN0aW9uKCl7cmV0dXJuImxpdmUiPT1lLnNvdXJjZT93aW5kb3dbYUdUTS5jLmdkbF18fFtdOiJkbCI9PWUuc291cmNlP2FHVE0uZC5kbHx8W106YUdUTS5kLmZ8fFtdfSxtYXRjaExpc3Q9ZnVuY3Rpb24oZSx0KXtmb3IodmFyIGE9ZS5zcGxpdCgiLCIpLG49MDtuPGEubGVuZ3RoO24rKyl7dmFyIG89YVtuXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYobyYmbmV3IFJlZ0V4cCgiXiIrby5yZXBsYWNlKC9cKi9nLCIuKiIpKyIkIiwiaSIpLnRlc3QodCkpcmV0dXJuITB9cmV0dXJuITF9LGdhdGVSZWFkeT1mdW5jdGlvbih0KXtpZighZS5nYXRlRXZlbnRzKXJldHVybiEwO2Zvcih2YXIgYT1lLmdhdGVFdmVudHMuc3BsaXQoIiwiKSxuPTA7bjxhLmxlbmd0aDtuKyspe3ZhciBvPWFbbl0ucmVwbGFjZSgvXlxzK3xccyskL2csIiIpO2lmKG8pe2Zvcih2YXIgcj0hMSxzPTA7czx0Lmxlbmd0aDtzKyspaWYodFtzXSYmdFtzXS5ldmVudD09PW8pe3I9ITA7YnJlYWt9aWYoIXIpcmV0dXJuITF9fXJldHVybiEwfSxwYXNzZXM9ZnVuY3Rpb24odCl7aWYoIm9iamVjdCIhPXR5cGVvZiB0fHwhdClyZXR1cm4hMTtpZighMD09PXQuYUdUTXJlcGVhdGVkKXJldHVybiExO2lmKCEwPT09dC5hR1RNZGwpe2lmKCFlLmd0bUZpcmVkKXJldHVybiExfWVsc2UgaWYoIWUuYWd0bUZpcmVkKXJldHVybiExO3JldHVybigic3RyaW5nIiE9dHlwZW9mIHQuZXZlbnR8fDAhPT10LmV2ZW50LmluZGV4T2YoImFHVE0iKSkmJigoInN0cmluZyI9PXR5cGVvZiB0LmV2ZW50fHwic3RyaW5nIiE9dHlwZW9mIHQudHlwZXx8Im9iamVjdCIhPXR5cGVvZiB0LmZsYWdzfHwhdC5mbGFnc3x8IXQuZmxhZ3MuZW5hYmxlVW50YWdnZWRQYWdlUmVwb3J0aW5nKSYmKCEoIWUuZ3RtRXZlbnRzJiYic3RyaW5nIj09dHlwZW9mIHQuZXZlbnQmJi9eZ3RtXC4oc3RhcnR8aW5pdF9jb25zZW50fGluaXR8anN8ZG9tfGxvYWQpJC9pLnRlc3QodC5ldmVudCkpJiYoIShlLndoaXRlbGlzdCYmInN0cmluZyI9PXR5cGVvZiB0LmV2ZW50JiYhbWF0Y2hMaXN0KGUud2hpdGVsaXN0LHQuZXZlbnQpKSYmKCghZS5ibGFja2xpc3R8fCJzdHJpbmciIT10eXBlb2YgdC5ldmVudHx8IW1hdGNoTGlzdChlLmJsYWNrbGlzdCx0LmV2ZW50KSkmJiEoIWUubWVzc2FnZXMmJiJzdHJpbmciIT10eXBlb2YgdC5ldmVudCkpKSkpfSxkb1JlcGxheT1mdW5jdGlvbih0KXthR1RNLmQuZGxyZXBlYXREb25lPSEwO2Zvcih2YXIgYT1nZXRTcmMoKSxuPWEmJiJudW1iZXIiPT10eXBlb2YgYS5sZW5ndGg/YS5sZW5ndGg6MCxvPSJvYmplY3QiPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJmFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudC5ndG1Db25zZW50LHI9MCxzPWUubWF4RXZlbnRzfHwwLGk9MCxjPTA7YzxuO2MrKylpZihwYXNzZXMoYVtjXSkpe2lmKHMmJnI+PXMpYnJlYWs7cisrO3ZhciBmPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFbY10pKTtpZihlLmNsZWFyRWNvbSYmbyYmdm9pZCAwIT09Zi5lY29tbWVyY2UmJmFHVE0uZi5maXJlKHtlY29tbWVyY2U6bnVsbCxhR1RNcmVwZWF0ZWQ6ITB9KSxkZWxldGUgZi5hR1RNdHMsZGVsZXRlIGYuYUdUTXBhcmFtcyxkZWxldGUgZlsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxmLmFHVE1yZXBlYXRlZD0hMCxlLmFkZHBhcmFtZXRlciYmZS5hZGRwYXJhbWV0ZXIubGVuZ3RoKWZvcih2YXIgVD0wO1Q8ZS5hZGRwYXJhbWV0ZXIubGVuZ3RoO1QrKyllLmFkZHBhcmFtZXRlcltUXSYmZS5hZGRwYXJhbWV0ZXJbVF0ucGtleSYmKGZbZS5hZGRwYXJhbWV0ZXJbVF0ucGtleV09ZS5hZGRwYXJhbWV0ZXJbVF0ucHZhbHVlKTthR1RNLmYuZmlyZShmKSxpKyt9YUdUTS5mLmZpcmUoe2V2ZW50OiJhR1RNX3JlcGVhdF9kb25lIixhR1RNcmVwZWF0RW5yaWNoZWQ6ISF0LGFHVE1yZXBlYXRDb3VudDppLGFHVE1yZXBlYXRTb3VyY2U6ZS5zb3VyY2V9KSxkYmcoInJlcGxheWVkICIraSsiIGV2ZW50KHMpLCBlbnJpY2hlZD0iKyh0PyJ5ZXMiOiJubyhmYWxsYmFjaykiKSl9O2lmKGRiZygic3RhcnQiLGUpLCFhR1RNLmQuZGxyZXBlYXRQb2xsaW5nKWlmKGdhdGVSZWFkeShnZXRTcmMoKSkpZG9SZXBsYXkoITApO2Vsc2V7YUdUTS5kLmRscmVwZWF0UG9sbGluZz0hMDt2YXIgdD0ibnVtYmVyIj09dHlwZW9mIGUucG9sbE1zJiZlLnBvbGxNcz49NTA/ZS5wb2xsTXM6MzAwLGE9Im51bWJlciI9PXR5cGVvZiBlLnRpbWVvdXRNcyYmZS50aW1lb3V0TXM+MD9lLnRpbWVvdXRNczowLG49YT4wP2E6M2U0LG89MCxyPXNldEludGVydmFsKGZ1bmN0aW9uKCl7aWYoYUdUTS5kLmRscmVwZWF0RG9uZSljbGVhckludGVydmFsKHIpO2Vsc2V7aWYoZ2F0ZVJlYWR5KGdldFNyYygpKSlyZXR1cm4gY2xlYXJJbnRlcnZhbChyKSx2b2lkIGRvUmVwbGF5KCEwKTsobys9dCk+PW4mJihjbGVhckludGVydmFsKHIpLGE+MD9kb1JlcGxheSghMSk6KGFHVE0uZC5kbHJlcGVhdFBvbGxpbmc9ITEsZGJnKCJnYXRlIG5ldmVyIHNhdGlzZmllZCB3aXRoaW4gY2FwIGFuZCBubyBmYWxsYmFjayAtIG5vdGhpbmcgcmVwZWF0ZWQ7IHBvbGxpbmcgcmVsZWFzZWQgZm9yIGEgbGF0ZXIgY2FsbCIpKSl9fSx0KX19fSxhR1RNLmYuaW5pdD1mdW5jdGlvbigpeyFhR1RNLmMuZGVidWcmJmFHVE0uZi5vcHRvdXQoKXx8KGFHVE0uZi5jb25maWcoYUdUTS5jKSxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZT8oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMCxhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZT0hMCxhR1RNLmQuY29uc2VudC5mZWVkYmFjaz0iUGFnZSBpcyBpRnJhbWUiLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW58fChhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSEwLHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbikpLGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpOiJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNtcCYmYUdUTS5jLmNtcD8ibm9uZSI9PWFHVE0uYy5jbXA/KGFHVE0uZC5jb25zZW50PXtndG1Db25zZW50OiEwLGhhc1Jlc3BvbnNlOiEwLGZlZWRiYWNrOiJObyBDb25zZW50IENoZWNrIGNvbmZpZ3VyZWQifSxhR1RNLmYuaW5qZWN0KCkpOihhR1RNLmYubG9hZF9jYyhhR1RNLmMuY21wLGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKSxhR1RNLmYuaW5pdEdUTSghMCkpOihhR1RNLmYuY29uc2VudF9saXN0ZW5lcigpLGFHVE0uZi5pbml0R1RNKCEwKSksYUdUTS5mLmpzZXJyb3JzKCkpfSxhR1RNLmYuZW5jPWZ1bmN0aW9uKGUsdCl7dmFyIGE9dCU2MysxLG49YnRvYSh1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoZSkpKSxvPTA7Ij0iPT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJm8rKywiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0yKSYmbysrLG49bi5zbGljZSgwLG4ubGVuZ3RoLW8pO2Zvcih2YXIgcj0xPT09bz8ifiI6Mj09PW8/In5+IjoiIixzPSIiLGk9MDtpPG4ubGVuZ3RoO2krKyl7dmFyIGM9IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8iLmluZGV4T2Yobi5jaGFyQXQoaSkpO3MrPWM8MD9uLmNoYXJBdChpKToiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODktXyIuY2hhckF0KChjK2EpJTY0KX1yZXR1cm4gbz9zLnNsaWNlKDAsMykrcitzLnNsaWNlKDMpOnN9LGFHVE0uZi54c2VuZD1mdW5jdGlvbihlLHQsYSxuKXtpZihlJiYic3RyaW5nIj09dHlwZW9mIGUpdHJ5e3ZhciBvLHI9bmV3IFhNTEh0dHBSZXF1ZXN0O3JldHVybiByLm9wZW4oIlBPU1QiLGUsITApLHIuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwiYXBwbGljYXRpb24vanNvbiIpLG89YSYmIm51bWJlciI9PXR5cGVvZiBuJiZuPj0xPyd7InEiOiInK2FHVE0uZi5lbmMoYUdUTS5mLnNTdHJmKHQpLG4pKycifSc6J3siZSI6JythR1RNLmYuc1N0cmYodCkrIn0iLHIuc2VuZChvKSxyfWNhdGNoKHQpe3JldHVybiBhR1RNLmYubG9nKCJlX3hzZW5kIix7bXNnOnQubWVzc2FnZSx1cmw6ZX0pLG51bGx9fSxhR1RNLmYuc2VuZG5hdXM9ZnVuY3Rpb24oZSl7aWYoZSYmIm9iamVjdCI9PXR5cGVvZiBlKXt2YXIgdD13aW5kb3dbYUdUTS5jLmdkbF0ucHVzaDshYUdUTS5kLm9yaWdpbmFsRExwdXNoJiYvc2FuZGJveC9pLnRlc3QodC50b1N0cmluZygpKSYmKGFHVE0uZC5vcmlnaW5hbERMcHVzaD10KTt2YXIgYT0hMTtpZihhR1RNLmMuZGxPcmdQdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2gmJmFHVE0uZC5vcmlnaW5hbERMcHVzaCE9PXQpe3ZhciBuPXQudG9TdHJpbmcoKTsvc2FuZGJveC9pLnRlc3Qobik/YUdUTS5kLm9yaWdpbmFsRExwdXNoPXQ6KGE9ITAsYUdUTS5kLmRsSG9va0xvZ2dlZHx8KGFHVE0uZC5vcmlnaW5hbERMcHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJydHlwZToiREwgRXJyb3IiLGVycm1zZzoiRnVuY3Rpb24gZGF0YUxheWVyLnB1c2ggaG9va2VkIC0gbm8gbG9uZ2VyIGZyb20gR1RNIixmY3RfaG9vazpuLGZjdF9vcmlnOmFHVE0uZC5vcmlnaW5hbERMcHVzaC50b1N0cmluZygpLHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxldmVudE1vZGVsOm51bGx9KSxhR1RNLmQuZGxIb29rTG9nZ2VkPSEwKSwicmVzdG9yZSI9PT1hR1RNLmMuZGxPcmdQdXNoJiYod2luZG93W2FHVE0uYy5nZGxdLnB1c2g9YUdUTS5kLm9yaWdpbmFsRExwdXNoLGE9ITEpKX1hJiYidXNlIj09PWFHVE0uYy5kbE9yZ1B1c2g/YUdUTS5kLm9yaWdpbmFsRExwdXNoKGUpOndpbmRvd1thR1RNLmMuZ2RsXS5wdXNoKGUpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhlKSxhR1RNLmYubG9nKCJtOSIsZSl9fSxhR1RNLmYuZmlyZT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe3RyeXtpZighKGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpKSlyZXR1cm4gdm9pZCBhR1RNLmYubG9nKCJlMTUiLGEpfWNhdGNoKG4pe3ZhciB0PSJhR1RNIEZpcmUgRXJyb3IgKEpTT04ucGFyc2UpIjsic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJih0PXQrIiAoRXZlbnQ6ICIrZS5ldmVudCsiKSIpO3ZhciBhPXtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6bi5tZXNzYWdlLGVycnR5cGU6dCx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXJ8fDEsZXZlbnRNb2RlbDpudWxsfTthR1RNLmYubG9nKCJlMTUiLGEpfWlmKCEoIm51bWJlciI9PXR5cGVvZiBhLmFHVE10c3x8Im9iamVjdCI9PXR5cGVvZiBhLmV2ZW50TW9kZWwmJmEuZXZlbnRNb2RlbHx8InN0cmluZyIhPXR5cGVvZiBhLmV2ZW50JiYic3RyaW5nIj09dHlwZW9mIGEudHlwZSYmIm9iamVjdCI9PXR5cGVvZiBhLmZsYWdzJiYiYm9vbGVhbiI9PXR5cGVvZiBhLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZyYmYS5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcpKXtpZihhLmFHVE10cz1EYXRlLm5vdygpLGEuZXZlbnRNb2RlbD1udWxsLGFHVE0uYy5jb25zZW50X2V2ZW50cyYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoIiwiK2FHVE0uYy5jb25zZW50X2V2ZW50cysiLCIpLmluZGV4T2YoIiwiK2EuZXZlbnQrIiwiKT49MClpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pZm9yKHZhciBuIGluIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pdm9pZCAwIT09YVtuXSYmKGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl0mJmFbbl0hPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl18fGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpKTtlbHNlIGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpO2lmKGFHVE0uYy5kbFNldCYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXImJiJvYmplY3QiPT10eXBlb2YgZ29vZ2xlX3RhZ19tYW5hZ2VyW2FHVE0uYy5ndG1JRF0mJk9iamVjdC5rZXlzKGFHVE0uYy5kbFNldCkuZm9yRWFjaChmdW5jdGlvbihlKXt2YXIgdD1hR1RNLmMuZGxTZXRbZV0sbj1nb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXVthR1RNLmMuZ2RsXS5nZXQodCk7dm9pZCAwIT09biYmKGFbZV09bil9KSwoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8IWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCkmJigic3RyaW5nIiE9dHlwZW9mIGEuZXZlbnR8fDAhPT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKSkmJiFhLl9ub0NvbnNlbnR8fGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYhYUdUTS5kLmlmcmFtZS5vcmlnaW4pcmV0dXJuIGRlbGV0ZSBhLmFHVE10cyxkZWxldGUgYS5ldmVudE1vZGVsLHZvaWQgYUdUTS5kLmYucHVzaChKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSkpO2lmKGEuX3Bvc3QmJiFhLl9wb3N0X3NlbnQpe3ZhciBvPSJvYmplY3QiPT10eXBlb2YgYS5fcG9zdD9hLl9wb3N0Ont9LHI9InN0cmluZyI9PXR5cGVvZiBvLnVybCYmby51cmw/by51cmw6YUdUTS5jLnRyYW5zcG9ydF91cmw7aWYocil7dmFyIHM9ImJvb2xlYW4iPT10eXBlb2Ygby5lbmM/by5lbmM6ISFhR1RNLmMudHJhbnNwb3J0X2VuYyxpPSJudW1iZXIiPT10eXBlb2Ygby5zYWx0JiZvLnNhbHQ+PTE/by5zYWx0OiJudW1iZXIiPT10eXBlb2YgYUdUTS5jLnRyYW5zcG9ydF9zYWx0JiZhR1RNLmMudHJhbnNwb3J0X3NhbHQ+PTE/YUdUTS5jLnRyYW5zcG9ydF9zYWx0OmFHVE0uYy5zZXNzaW9uX3NhbHR8fDAsYz1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZGVsZXRlIGMuX3Bvc3QsZGVsZXRlIGMuX3Bvc3Rfc2VudCxkZWxldGUgYy5ldmVudE1vZGVsLG8uY29uc2VudCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmKGMuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpKSxhR1RNLmYueHNlbmQocixjLHMsaSksYS5fcG9zdF9zZW50PSEwfX0oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudHx8InN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYwPT09YS5ldmVudC5pbmRleE9mKCJhR1RNIil8fGEuX25vQ29uc2VudCkmJigic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJjA9PT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8KGRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGRlbGV0ZSBhLmFHVE1wYXJhbXMsYS5hR1RNcGFyYW1zPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKSksYUdUTS5kLmRsLnB1c2goYSksYS5fbm9ETFB1c2g/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayYmYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrKGEpOmFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQ/YUdUTS5mLmlGcmFtZUZpcmUoYSk6YUdUTS5mLnNlbmRuYXVzKGEpKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmZpcmVfY2FsbGJhY2smJmFHVE0uZi5maXJlX2NhbGxiYWNrKGEpLGFHVE0uZi5sb2coIm03IixhKX19ZWxzZSBhR1RNLmYubG9nKCJlOSIse286dHlwZW9mIGV9KX07');
  const origin = getRequestHeader('origin') || '';
  // Pre-aGTM Init Script: prepended verbatim before the library. User code
  // is wrapped in an IIFE inside try/catch so a runtime error does not
  // abort the rest of the /aGTM.js response. Note: a SYNTAX error in user
  // code still aborts parsing — try/catch only catches runtime throws.
  // Leading "\n" inside the IIFE protects against trailing line comments
  // in user code; trailing ";\n" closes any open expression cleanly.
  const preInit = (CFG.preInitEnabled && CFG.preInitCode) ? 'try{(function(){\n' + CFG.preInitCode + '\n;})();}catch(e){if(typeof console!=="undefined"&&console.error)console.error("[aGTM preInit]",e);}\n' : '';
  const jsCode = preInit + agtm + cmp + config + 'aGTM.f.init();';

  setResponseStatus(200);
  if (origin) {
    setResponseHeader('Access-Control-Allow-Origin', origin);
    setResponseHeader('Access-Control-Allow-Credentials', 'true');
  }
  setResponseHeader('Content-Type', 'application/javascript');
  setResponseBody(jsCode);
  returnResponse();
};
___SERVER_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "access_response",
        "versionId": "1"
      },
      "param": [
        {
          "key": "writeResponseAccess",
          "value": {
            "type": 1,
            "string": "any"
          }
        },
        {
          "key": "writeHeaderAccess",
          "value": {
            "type": 1,
            "string": "specific"
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
        "publicId": "read_request",
        "versionId": "1"
      },
      "param": [
        {
          "key": "queryParametersAllowed",
          "value": {
            "type": 8,
            "boolean": true
          }
        },
        {
          "key": "remoteAddressAllowed",
          "value": {
            "type": 8,
            "boolean": true
          }
        },
        {
          "key": "bodyAllowed",
          "value": {
            "type": 8,
            "boolean": true
          }
        },
        {
          "key": "headersAllowed",
          "value": {
            "type": 8,
            "boolean": true
          }
        },
        {
          "key": "pathAllowed",
          "value": {
            "type": 8,
            "boolean": true
          }
        },
        {
          "key": "queryParameterAccess",
          "value": {
            "type": 1,
            "string": "any"
          }
        },
        {
          "key": "requestAccess",
          "value": {
            "type": 1,
            "string": "specific"
          }
        },
        {
          "key": "headerAccess",
          "value": {
            "type": 1,
            "string": "any"
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
        "publicId": "return_response",
        "versionId": "1"
      },
      "param": []
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
  },
  {
    "instance": {
      "key": {
        "publicId": "send_http",
        "versionId": "1"
      },
      "param": [
        {
          "key": "allowedUrls",
          "value": {
            "type": 1,
            "string": "any"
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
        "publicId": "get_cookies",
        "versionId": "1"
      },
      "param": [
        {
          "key": "cookieAccess",
          "value": {
            "type": 1,
            "string": "any"
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
        "publicId": "set_cookies",
        "versionId": "1"
      },
      "param": [
        {
          "key": "allowedCookies",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "name"
                  },
                  {
                    "type": 1,
                    "string": "domain"
                  },
                  {
                    "type": 1,
                    "string": "path"
                  },
                  {
                    "type": 1,
                    "string": "secure"
                  },
                  {
                    "type": 1,
                    "string": "session"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "*"
                  },
                  {
                    "type": 1,
                    "string": "*"
                  },
                  {
                    "type": 1,
                    "string": "*"
                  },
                  {
                    "type": 1,
                    "string": "any"
                  },
                  {
                    "type": 1,
                    "string": "any"
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
- name: Check JS Code
  code: |
    // Set Mocks
    //mock('setResponseStatus', 200);
    //mock('setResponseHeader', '1.2.2');
    //mock('setResponseBody', 'console.log("aGTM");');
    //mock('returnResponse');

    // Run Code
    runCode(mockData);

    // Checks
    //assertApi('setResponseStatus').wasCalledWith(200);
    //assertApi('setResponseHeader').wasCalled();
    //assertApi('setResponseBody').wasCalled();
    //assertApi('returnResponse').wasCalled();
setup: |-
  // Import needed libraries
  const log = require('logToConsole');

  // Setup MockData
  const mockData = {
    gtm: {
      gtm_id: 'GTM-XYZ123',
      gtm_consent: true,
      gtm_env: ''
    },
    cmp: null,
    consent: {
      gtmPurposes: 'Functional',
      gtmServices: 'Google Tag Manager',
      gtmVendors: 'Google Inc'
    },
    ck_consent: {
      ckVendors: 'Set Cookie Cookie'
    },
    sendConsentEvent: true,
    useListener: false,
    consent_events: 'cmpEvent,cmpUpdate',
    vPageview: false,
    dlStateEvents: false,
    gdl: '',
    nonce: 'ABC123',
    debug: true
  };


___NOTES___

TG managed sGTM template !!! DO NOT DELETE THIS LINE !!!
# aGTM serverside GTM Client Template

This is the aGTM Client Template to use it with the serverside Google Tag Manager.

Read more about aGTM in the <a href="https://github.com/Andiministrator/aGTM?tab=readme-ov-file#agtm---a-galactic-tagging-modulator">aGTM Documentation</a>.

Common Website integration code template:
```html
<script>
(function(w,d,s,u){
  var t=d.getElementsByTagName(s)[0],e=d.createElement(s);
  e.async=true;e.src=u;
  t.parentNode.insertBefore(e,t);
})(window,document,'script','https://TM.YOUR-DOMAIN.COM/aGTM.js');
</script>
```

Website integration code template using an ID:
```html
<script>
(function(w,d,s,u){
  var t=d.getElementsByTagName(s)[0],e=d.createElement(s);
  e.async=true;e.src=u;
  t.parentNode.insertBefore(e,t);
})(window,document,'script','https://TM.YOUR-DOMAIN.COM/aGTM.js?id=website1');
</script>
```


