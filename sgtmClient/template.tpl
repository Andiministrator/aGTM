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
        "help": "If checked, this Client fires a fire-and-forget POST to the Sources API after the Session step on every aGTM.js request, carrying user_id + page_location + referrer + timestamp. The Sources API stores the data for later attribution analysis. The Tenant ID configured above is used. Page URL and referrer come from the integration code's ?c= base64 payload."
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
        "help": "Base URL of the Sources API up to and including the path prefix WITHOUT the tenant. The tenant is appended at runtime. Example: <code>https://tg-api-sources.internal.wedapi.eu/tp/sources/</code> (POSTs go to .../tp/sources/{tenant})."
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
  // Sources API: optional fire-and-forget POST after the session step on every
  // aGTM.js request. Tenant is reused from tenantID. Disabled by default.
  // Race-free: the session is already committed in Redis when this fires, so
  // api4sources' user_id -> session_id lookup hits.
  sourcesEnabled: data.sources_enabled === true,
  sourcesApiUrl: data.sources_api_url || ''
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
  const cpData = (cp && cp.e) ? cp.e : (cp || {});

  // Resolve uid: explicit in payload first, then fall back to cookie.
  let cpUid = cpData.uid || '';
  if (!cpUid && CFG.cookieName) {
    const fbVals = getCookieValues(CFG.cookieName, true);
    cpUid = (fbVals && fbVals.length > 0) ? fbVals[0] : '';
  }

  // Phase 3 payload shape: { uid, sid, consent: {...} }.
  // Backwards-compat: flat { uid, services, purposes, vendors, feedback }.
  const cpConsent = (cpData.consent && typeof cpData.consent === 'object')
    ? cpData.consent
    : {
        hasResponse: true,
        services: cpData.services || '',
        purposes: cpData.purposes || '',
        vendors: cpData.vendors || '',
        feedback: cpData.feedback || ''
      };
  const cpServices = cpConsent.services || '';
  const cpPurposes = cpConsent.purposes || '';
  const cpVendors = cpConsent.vendors || '';
  if (CFG.debug) logToConsole('debug', '✓ Consent POST parsed', {uid: cpUid, services: cpServices, purposes: cpPurposes});

  // 1. Cookie management (unchanged behavior, only triggered in consent mode).
  if (CFG.cookieMode === 'consent' && CFG.cookieName) {
    const cookieOpts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
    const granted = hasRequiredConsent(cpServices, cpPurposes, cpVendors);
    if (granted && cpUid) {
      const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
      if (maxAge > 0) cookieOpts['max-age'] = maxAge;
      setCookie(CFG.cookieName, cpUid, cookieOpts, true);
      if (CFG.debug) logToConsole('debug', '✓ User ID cookie set (consent granted)', cpUid);
    } else if (!granted && data.cookie_delete) {
      cookieOpts['max-age'] = 0;
      setCookie(CFG.cookieName, '', cookieOpts, true);
      if (CFG.debug) logToConsole('debug', '✓ User ID cookie deleted (consent withdrawn)');
    }
  }

  // 2. Persist consent into the Session API record so the next library load
  //    sees it via cfg.session.consent.
  const finishConsentPost = function() {
    setResponseStatus(200);
    setResponseHeader('Content-Type', 'application/json');
    setResponseBody('{"ok":true}');
    returnResponse();
  };

  if (CFG.sessionApiUrl && CFG.tenantID && cpUid) {
    const writeUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + cpUid + '/consent';
    const writeBody = JSON.stringify(cpConsent);
    if (CFG.debug) logToConsole('debug', '→ Persisting consent to Session API', {url: writeUrl, body: writeBody});
    sendHttpRequest(writeUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, writeBody).then(function(res) {
      if (CFG.debug) logToConsole('debug', '✓ Consent persisted', {uid: cpUid, status: res.statusCode});
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

// ── Helper: fire Sources API POST (fire-and-forget) ──────────────────────────
// Called from afterSession() once the session is committed in Redis. The POST
// is not awaited — buildAndSend() runs in parallel so aGTM.js delivery is not
// delayed. The chained .then() keeps the request alive in the sandbox until
// it completes (or times out). page_location/referrer come from the ?c=
// payload sent by the integration code; tenant from CFG; user_id from the
// session's resolved uid. api4sources looks up the active session_id from
// Redis (key customer_sessions:{tenant}:{user_id}) — race-free because the
// Session API write completed before this runs.
const fireSources = function(uid) {
  if (!CFG.sourcesEnabled) return;
  if (!CFG.sourcesApiUrl || !CFG.tenantID || !uid || !pageUrl) {
    if (CFG.debug) logToConsole('debug', '✗ Sources skipped', {enabled: CFG.sourcesEnabled, url: !!CFG.sourcesApiUrl, tenant: !!CFG.tenantID, uid: !!uid, pageUrl: !!pageUrl});
    return;
  }
  const sep = CFG.sourcesApiUrl.charAt(CFG.sourcesApiUrl.length - 1) === '/' ? '' : '/';
  const url = CFG.sourcesApiUrl + sep + CFG.tenantID;
  const body = JSON.stringify({
    user_id: uid,
    page_location: pageUrl,
    referrer: pageRef,
    timestamp: getTimestampMillis()
  });
  if (CFG.debug) logToConsole('debug', '→ Sources POST', {url: url, body: body});
  sendHttpRequest(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 1500}, body).then(function(res) {
    if (CFG.debug) logToConsole('debug', '✓ Sources response', {status: res.statusCode, body: res.body});
  }, function(e) {
    logToConsole('error', '✗ Sources error', e);
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
    // granted consent this restores parity (otherwise the cookie max-age expires
    // until the user re-interacts with the CMP).
    if (cookieAllowed && sessionData.uid) {
      writeCookie(sessionData.uid);
    }

    if (CFG.debug) logToConsole('debug', '✓ Session', sessionData);
    // Fire-and-forget Sources API POST. Runs in parallel with buildAndSend so
    // aGTM.js delivery is not blocked. Session is already committed in Redis
    // at this point — no race against api4sources' session lookup.
    fireSources(sessionData.uid);
    buildAndSend(sessionData);
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
  // aGTM's preset gate requires sid OR a valid consent block — uid alone is
  // ignored, so we don't bother emitting in that case.
  if (sessionData && (sessionData.sid || sessionData.consent)) {
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
    logToConsole('debug', CFG.consentStoreEnabled
      ? '✓ consent_store_url will be built browser-side from document.currentScript.src'
      : '✗ consent_store_url disabled by template config');
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
  const storeUrlBuilder = CFG.consentStoreEnabled
    ? '(function(c){var s=document.currentScript;if(s&&s.src){var i=s.src.lastIndexOf("/aGTM.js");if(i>=0)c.consent_store_url=s.src.substring(0,i)+"' + CONSENT_STORE_PATH + '";}return c;})'
    : '(function(c){return c;})';
  const config = 'aGTM.f.config(' + storeUrlBuilder + '(' + JSON.stringify(c) + '));';
  logToConsole('info', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImlmcmFtZSIse2NvdW50ZXI6e2V2ZW50czowfSxvcmlnaW46IiIsaWZMaXN0ZW46ITEsdG9wTGlzdGVuOiExLGhhbmRzaGFrZTohMSx0aW1lcjpudWxsfV0sW2FHVE0uZCwibGFzdF91cmwiLGxvY2F0aW9uLmhyZWZdLFthR1RNLmYsInRsIix7fV0sW2FHVE0uZiwiZGwiLHt9XSxbYUdUTS5mLCJwbCIse31dLFthR1RNLCJsIixbXV0sW2FHVE0ubiwiY2siLCJjb29raWUiXSxbYUdUTS5uLCJ0bSIsImdvb2dsZXRhZ21hbmFnZXIiXSxbYUdUTS5uLCJ0YSIsInRhZ2Fzc2lzdGFudC5nb29nbGUiXV0uZm9yRWFjaChmdW5jdGlvbihlKXthR1RNLmYucHJvcHNldChlWzBdLGVbMV0sZVsyXSl9KX0sYUdUTS5mLm9iamluaXQoKSxhR1RNLmYubG9nPWZ1bmN0aW9uKGUsdCl7dmFyIGE9Im9iamVjdCI9PXR5cGVvZiB0JiZ0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnQ7YUdUTS5sLnB1c2goe2lkOmUsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLG9iajphfSl9LGFHVE0uZi5zdHJjbGVhbj1mdW5jdGlvbihlKXtyZXR1cm4gdm9pZCAwPT09ZXx8Im9iamVjdCI9PXR5cGVvZiBlJiYhZT8iIjooInN0cmluZyIhPXR5cGVvZiBlJiYoZT1lLnRvU3RyaW5nKCkpLGUucmVwbGFjZSgvW15hLXrDpMO2w7zDn0EtWsOEw5bDnDAtOV8tXS9nLCIiKSl9LGFHVE0uZi5zU3RyZj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXt2YXIgdD1KU09OLnN0cmluZ2lmeSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KTtyZXR1cm4gYUdUTS5mLmxvZygiZTE2IixKU09OLnBhcnNlKHQpKSxKU09OLnN0cmluZ2lmeShudWxsKX12YXIgYT1bXTtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSxmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgdCYmbnVsbCE9PXQpe2lmKC0xIT09YS5pbmRleE9mKHQpKXJldHVybiJbQ2lyY3VsYXJdIjthLnB1c2godCl9cmV0dXJuIHR9KX0sYUdUTS5mLmFuPWZ1bmN0aW9uKGUsdCxhLG4pe2VbdF09YS5oYXNPd25Qcm9wZXJ0eSh0KT9hW3RdOm59LGFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZT1mdW5jdGlvbihlKXtpZighZXx8Im9iamVjdCIhPXR5cGVvZiBlKXJldHVybiIiO3ZhciB0PXtndG1Db25zZW50OjEsYmxvY2tlZDoxfSxhPVtdO2Zvcih2YXIgbiBpbiBlKWUuaGFzT3duUHJvcGVydHkobikmJiF0W25dJiZhLnB1c2gobik7YS5zb3J0KCk7Zm9yKHZhciBvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXSxpPWVbc107IiIhPT1pJiZudWxsIT1pJiZvLnB1c2gocysiPSIrKCJvYmplY3QiPT10eXBlb2YgaT9KU09OLnN0cmluZ2lmeShpKTpTdHJpbmcoaSkpKX1yZXR1cm4gby5qb2luKCJ8Iil9LGFHVE0uZi5jb25maWc9ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmNvbmZpZykiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygiZTEiLGFHVE0uYyk7ZWxzZXtpZihhR1RNLmYuYW4oYUdUTS5jLCJkZWJ1ZyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywicGF0aCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZmlsZSIsZSwiYUdUTS5qcyIpLGFHVE0uZi5hbihhR1RNLmMsImNtcCIsZSwiIiksYUdUTS5jLm1pbj0iYm9vbGVhbiIhPXR5cGVvZiBlLm1pbnx8ZS5taW4sYUdUTS5mLmFuKGFHVE0uYywibm9uY2UiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImlmcmFtZVN1cHBvcnQiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3MiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NUaW1lciIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJ2UGFnZXZpZXdzRmFsbGJhY2siLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImd0bUlEIixlLCIiKSxlLmd0bSlmb3IodmFyIHQgaW4gZS5ndG0pZS5ndG0uaGFzT3duUHJvcGVydHkodCkmJihhR1RNLmMuZ3RtSUQ9YUdUTS5jLmd0bUlEfHx0LGFHVE0uYy5ndG09YUdUTS5jLmd0bXx8e30sYUdUTS5jLmd0bVt0XT1lLmd0bVt0XXx8e30sYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sIm5vQ29uc2VudCIsZS5ndG1bdF0sITEpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJlbnYiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiaWRQYXJhbSIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1VUkwiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiZ3RtSlMiLGUuZ3RtW3RdLCIiKSk7aWYoYUdUTS5mLmFuKGFHVE0uYywiZ2RsIixlLCJkYXRhTGF5ZXIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1QdXJwb3NlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtU2VydmljZXMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVZlbmRvcnMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bUF0dHIiLGUsbnVsbCksYUdUTS5mLmFuKGFHVE0uYywiZGxTZXQiLGUse30pLGFHVE0uZi5hbihhR1RNLmMsInVzZUxpc3RlbmVyIixlLCExKSxhR1RNLmYuYW4oYUdUTS5jLCJkbE9yZ1B1c2giLGUsIiIpLGFHVE0uYy5kbFN0YXRlRXZlbnRzPSJib29sZWFuIj09dHlwZW9mIGUuZGxTdGF0ZUV2ZW50cyYmZS5kbFN0YXRlRXZlbnRzLGFHVE0uYy5hUGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS5hUGFnZXZpZXcmJmUuYVBhZ2V2aWV3LGFHVE0uYy52UGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS52UGFnZXZpZXcmJmUudlBhZ2V2aWV3LGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50PSJib29sZWFuIj09dHlwZW9mIGUuc2VuZENvbnNlbnRFdmVudCYmZS5zZW5kQ29uc2VudEV2ZW50LGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfZXZlbnRzIixlLCIiKSxhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJ8fHt9LCJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiZhR1RNLmMuY29uc2VudF9ldmVudHMpe2Zvcih2YXIgYT1hR1RNLmMuY29uc2VudF9ldmVudHMuc3BsaXQoIiwiKSxuPVtdLG89MDtvPGEubGVuZ3RoO28rKyl7dmFyIHI9YVtvXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYocil7dmFyIHM9ci5pbmRleE9mKCJbIik7aWYocz49MCl7dmFyIGk9ci5zdWJzdHJpbmcoMCxzKSxjPXIuc3Vic3RyaW5nKHMrMSxyLmluZGV4T2YoIl0iKSksZj1jLmluZGV4T2YoIjoiKSxUPXt9O2Y+PTA/VFtjLnN1YnN0cmluZygwLGYpXT1jLnN1YnN0cmluZyhmKzEpOlRbY109IiIsYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltpXT1ULG4ucHVzaChpKX1lbHNlIG4ucHVzaChyKX19YUdUTS5jLmNvbnNlbnRfZXZlbnRzPW4uam9pbigiLCIpfWlmKGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF91cmwiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsInVzZXJfaWQiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInNlc3Npb25fc2FsdCIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9zdG9yZV9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfcG9sbF9tcyIsZSwyZTMpLGUuc2Vzc2lvbiYmIm9iamVjdCI9PXR5cGVvZiBlLnNlc3Npb24mJihlLnNlc3Npb24uc2lkfHxlLnNlc3Npb24uY29uc2VudCkpe2FHVE0uZC5zZXNzaW9uPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUuc2Vzc2lvbikpO3ZhciBNPWUuc2Vzc2lvbi5jb25zZW50O00mJiJvYmplY3QiPT10eXBlb2YgTSYmITA9PT1NLmhhc1Jlc3BvbnNlJiYic3RyaW5nIj09dHlwZW9mIE0uc2VydmljZXM/KGFHVE0uZC5jb25zZW50PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKE0pKSxhR1RNLmQuY29uc2VudF9oYXNoPWFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZShhR1RNLmQuY29uc2VudCksYUdUTS5kLmxhc3RfY29uc2VudF9oYXNoPWFHVE0uZC5jb25zZW50X2hhc2gsYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJwcmVzZXRfd2l0aF9jb25zZW50IixhR1RNLmYubG9nKCJtX3Nlc3Npb25fcHJlc2V0X2NvbnNlbnQiLE0pKTooYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJwcmVzZXQiLGFHVE0uZi5sb2coIm1fc2Vzc2lvbl9wcmVzZXQiLGUuc2Vzc2lvbikpfWUuY29uc2VudD1lLmNvbnNlbnR8fHt9LGFHVE0uYy5jb25zZW50PWFHVE0uYy5jb25zZW50fHxlLmNvbnNlbnQsYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJoYXNSZXNwb25zZSIsZS5jb25zZW50LCExKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImZlZWRiYWNrIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwicHVycG9zZXMiLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJzZXJ2aWNlcyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInZlbmRvcnMiLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJjb25zZW50X2lkIixlLmNvbnNlbnQsIiIpLHdpbmRvd1thR1RNLmMuZ2RsXT13aW5kb3dbYUdUTS5jLmdkbF18fFtdLGFHVE0uZC5jb25zZW50PWFHVE0uZC5jb25zZW50fHxKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmMuY29uc2VudCkpLCJib29sZWFuIiE9dHlwZW9mIGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQmJihhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExKSxhR1RNLmQuY29uZmlnPSEwLGFHVE0uZC5ndG1Mb2FkZWQ9W10sImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5sb2cmJmFHVE0uZi5sb2coIm0xIixhR1RNLmMpLCEwPT09YUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuY2FsbF9jYyYmYUdUTS5mLmNhbGxfY2MoKX19LGFHVE0uZi5sb2FkX2NjPWZ1bmN0aW9uKGUsdCl7dmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgic2NyaXB0Iiksbj1hR1RNLmMucGF0aHx8IiI7bi5sZW5ndGg+MCYmIi8iIT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJihuKz0iLyIpO3ZhciBvPSJjbXAvY2NfIithR1RNLmYuc3RyY2xlYW4oZSkrKGFHVE0uYy5taW4/Ii5taW4iOiIiKSsiLmpzIjthLnNyYz1uK28sYUdUTS5jLm5vbmNlJiYoYS5ub25jZT1hR1RNLmMubm9uY2UpLGEub25yZWFkeXN0YXRlY2hhbmdlPWEub25sb2FkPWZ1bmN0aW9uKCl7YS5yZWFkeVN0YXRlJiYhL2xvYWRlZHxjb21wbGV0ZS8udGVzdChhLnJlYWR5U3RhdGUpfHwiZnVuY3Rpb24iPT10eXBlb2YgdCYmdCgpfSxhLmFzeW5jPSEwLGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoYSl9LGFHVE0uZi5jaGVscD1mdW5jdGlvbihlLHQpe3ZhciBhPSEwO3JldHVybiBlJiZ0JiZlLnNwbGl0KCIsIikuZm9yRWFjaChmdW5jdGlvbihlKXt0LmluZGV4T2YoIiwiK2UudHJpbSgpKyIsIik8MCYmKGE9ITEpfSksYX0sYUdUTS5mLmV2YWxDb25zPWZ1bmN0aW9uKGUsdCl7dmFyIGlzQ29uc2VudEdpdmVuPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuIHQuaW5kZXhPZigiLCIrZSsiLCIpPj0wfSl9LGE9IWUucHVycG9zZXMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnB1cnBvc2VzLHQucHVycG9zZXMpLG49IWUuc2VydmljZXMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnNlcnZpY2VzLHQuc2VydmljZXMpLG89IWUudmVuZG9ycy5sZW5ndGh8fGlzQ29uc2VudEdpdmVuKGUudmVuZG9ycyx0LnZlbmRvcnMpO3JldHVybiBhJiZuJiZvfSxhR1RNLmYucnVuX2NjPWZ1bmN0aW9uKGUpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlNCIsbnVsbCksITE7aWYoInN0cmluZyIhPXR5cGVvZiBlfHwiaW5pdCIhPT1lJiYidXBkYXRlIiE9PWUpcmV0dXJuIGFHVE0uZi5sb2coImU1Iix7YWN0aW9uOmV9KSwhMTtpZigiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2hlY2spcmV0dXJuIGFHVE0uZi5sb2coImUxNCIse2FjdGlvbjplfSksITE7dmFyIHQ9bnVsbDtpZigidXBkYXRlIj09PWUmJmFHVE0uZC5jb25zZW50KXt0PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk7dmFyIGE9YUdUTS5kLmNvbnNlbnQ7YS5oYXNSZXNwb25zZT0hMSxhLnNlcnZpY2VzPSIiLGEucHVycG9zZXM9IiIsYS52ZW5kb3JzPSIiLGEuY29uc2VudF9pZD0iIixhLnNlcnZpY2VJRHM9IiIsYS5mZWVkYmFjaz0iIixkZWxldGUgYS5ibG9ja2VkfWlmKCFhR1RNLmYuY29uc2VudF9jaGVjayhlKSlyZXR1cm4gdCYmKGFHVE0uZC5jb25zZW50PXQpLGFHVE0uZi5sb2coIm04IixudWxsKSwhMTt3aW5kb3dbYUdUTS5jLmdkbF09d2luZG93W2FHVE0uYy5nZGxdfHxbXSxhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVB1cnBvc2VzLGFHVE0uZC5jb25zZW50LnB1cnBvc2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1TZXJ2aWNlcyxhR1RNLmQuY29uc2VudC5zZXJ2aWNlcykmJmFHVE0uZi5jaGVscChhR1RNLmMuZ3RtVmVuZG9ycyxhR1RNLmQuY29uc2VudC52ZW5kb3JzKT9hR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSEwOmFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuYmxvY2tlZCYmYUdUTS5kLmNvbnNlbnQuYmxvY2tlZDt2YXIgbj1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLG89biE9PWFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaDtpZihhR1RNLmQubGFzdF9jb25zZW50X2hhc2g9biwidXBkYXRlIj09ZSYmbyYmKGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCksYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiYUdUTV9jb25zZW50X3VwZGF0ZSIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGFHVE1jb25zZW50OmFHVE0uZC5jb25zZW50P0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk6e319KSksInVwZGF0ZSI9PT1lJiYhb3x8ImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NhbGxiYWNrfHxhR1RNLmYuY29uc2VudF9jYWxsYmFjayhlKSxhR1RNLmMuY29uc2VudF9zdG9yZV91cmwpaWYobiE9PWFHVE0uZC5jb25zZW50X2hhc2gpe3ZhciByPXt9O2FHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi51aWQmJihyLnVpZD1hR1RNLmQuc2Vzc2lvbi51aWQpLGFHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi5zaWQmJihyLnNpZD1hR1RNLmQuc2Vzc2lvbi5zaWQpO3ZhciBzPXt9LGk9e2d0bUNvbnNlbnQ6MSxibG9ja2VkOjF9O2Zvcih2YXIgYyBpbiBhR1RNLmQuY29uc2VudClpZihhR1RNLmQuY29uc2VudC5oYXNPd25Qcm9wZXJ0eShjKSYmIWlbY10pe3ZhciBmPWFHVE0uZC5jb25zZW50W2NdOyIiIT09ZiYmbnVsbCE9ZiYmKHNbY109Zil9ci5jb25zZW50PXM7dmFyIFQ9ITA9PT1hR1RNLmMuY29uc2VudF9zdG9yZV9lbmMsTT0ibnVtYmVyIj09dHlwZW9mIGFHVE0uYy5zZXNzaW9uX3NhbHQmJmFHVE0uYy5zZXNzaW9uX3NhbHQ+PTE/YUdUTS5jLnNlc3Npb25fc2FsdDowO2FHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9wb3N0Iix7dXJsOmFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxoYXNoOm59KTt2YXIgRz1hR1RNLmYueHNlbmQoYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsLHIsVCxNKTtHJiYoRy5vbnJlYWR5c3RhdGVjaGFuZ2U9ZnVuY3Rpb24oKXs0PT09Ry5yZWFkeVN0YXRlJiYoRy5zdGF0dXM+PTIwMCYmRy5zdGF0dXM8MzAwPyhhR1RNLmQuY29uc2VudF9oYXNoPW4sYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJzeW5jZWQiLGFHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9zeW5jZWQiLHtoYXNoOm59KSk6YUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlIix7c3RhdHVzOkcuc3RhdHVzfSkpfSl9ZWxzZSBhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9ImNvbmZpcm1lZCI7cmV0dXJuIGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITB9LGFHVE0uZi5jYWxsX2NjPWZ1bmN0aW9uKCl7cmV0dXJuISgiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLnJ1bl9jY3x8IWFHVE0uZi5ydW5fY2MoImluaXQiKSkmJih2b2lkIDAhPT1hR1RNLmQudGltZXIuY29uc2VudCYmKGNsZWFySW50ZXJ2YWwoYUdUTS5kLnRpbWVyLmNvbnNlbnQpLGRlbGV0ZSBhR1RNLmQudGltZXIuY29uc2VudCksISFhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKX0sImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2xpc3RlbmVyJiYoYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXI9ZnVuY3Rpb24oKXthR1RNLmMudXNlTGlzdGVuZXJ8fCgiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCk/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKTphR1RNLmQudGltZXIuY29uc2VudD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2FHVE0uZi5jYWxsX2NjKCkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsJiZhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsKCl9LDUwMCkpfSksYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbD1mdW5jdGlvbigpe2FHVE0uYy5jb25zZW50X3N0b3JlX3VybCYmKCJudW1iZXIiIT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfcG9sbF9tc3x8YUdUTS5jLmNvbnNlbnRfcG9sbF9tczw9MHx8YUdUTS5kLnRpbWVyJiZhR1RNLmQudGltZXIuY29uc2VudF9wb2xsfHwoYUdUTS5kLnRpbWVyPWFHVE0uZC50aW1lcnx8e30sYUdUTS5kLnRpbWVyLmNvbnNlbnRfcG9sbD1zZXRJbnRlcnZhbChmdW5jdGlvbigpeyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYucnVuX2NjJiZhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKX0sYUdUTS5jLmNvbnNlbnRfcG9sbF9tcykpKX0sYUdUTS5mLmdjPWZ1bmN0aW9uKGUpe3ZhciB0PW5ldyBSZWdFeHAoZSsiPShbXjtdKykiKSxhPW51bGw7dHJ5e3ZhciBuPWRvY3VtZW50LG89dC5leGVjKG5bYUdUTS5uLmNrXSk7byYmby5sZW5ndGg+MSYmKGE9ZGVjb2RlVVJJQ29tcG9uZW50KG9bMV0pKX1jYXRjaChlKXt9cmV0dXJuIGF9LGFHVE0uZi5zYz1mdW5jdGlvbihlLHQpe2lmKCJzdHJpbmciPT10eXBlb2YgZSYmZSYmdCl0cnl7ZG9jdW1lbnRbYUdUTS5uLmNrXT1lKyI9Iit0KyI7IFNlY3VyZTsgU2FtZVNpdGU9TGF4OyBwYXRoPS8ifWNhdGNoKGUpe319LGFHVE0uZi51cmxQYXJhbT1mdW5jdGlvbihlLHQpe3ZhciBhPW5ldyBSZWdFeHAoIls/Jl0iK2UrIig9KFteJiNdKil8JnwjfCQpIikuZXhlYyh0KTtyZXR1cm4gYSYmYVsyXT9kZWNvZGVVUklDb21wb25lbnQoYVsyXS5yZXBsYWNlKC9cKy9nLCIgIikpOm51bGx9LGFHVE0uZi5vcHRvdXQ9ZnVuY3Rpb24oKXt2YXIgZT0hMSx0PWFHVE0uZi51cmxQYXJhbSgiYUdUTW9wdG91dCIsd2luZG93LmxvY2F0aW9uLmhyZWYpO2lmKHQmJiIwIiE9PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMSIpLGU9ITA7ZWxzZSBpZigiMCI9PT10KWFHVE0uZi5zYygiYUdUTW9wdG91dCIsIjAiKTtlbHNle3ZhciBhPWFHVE0uZi5nYygiYUdUTW9wdG91dCIpO2EmJiIwIiE9PWEmJihlPSEwKX1pZihlKXtmb3IodmFyIG4gaW4gYUdUTSlhR1RNLmhhc093blByb3BlcnR5KG4pJiYiZiIhPT1uJiZkZWxldGUgYUdUTVtuXTtyZXR1cm4gYUdUTS5mLm9iamluaXQoKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLm9wdG91dF9jYWxsYmFjayYmYUdUTS5mLm9wdG91dF9jYWxsYmFjaygpLCEwfXJldHVybiExfSxhR1RNLmYuYUdUTV9ldmVudD1mdW5jdGlvbihlKXsib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYUdUTS5kLmNvbnNlbnQ9bnVsbCksZXx8KGU9ImFHVE1fZXZlbnQiKTt2YXIgdD17ZXZlbnQ6ZSxhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX07cmV0dXJuImFHVE1fcmVhZHkiPT1lJiYodC5hR1RNPXt2ZXJzaW9uOmFHVE0uZC52ZXJzaW9uLGlzX2lmcmFtZTphR1RNLmQuaXNfaWZyYW1lLGhhc3R5RXZlbnRzOmFHVE0uZC5mLGVycm9yczphR1RNLmQuZXJyb3JzfSksdH0sYUdUTS5mLnByb3h5U3VwcG9ydD1mdW5jdGlvbigpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBQcm94eSlyZXR1cm4hMTt0cnl7cmV0dXJuIG5ldyBQcm94eShmdW5jdGlvbigpe30se2FwcGx5OmZ1bmN0aW9uKCl7cmV0dXJuITB9fSkoKX1jYXRjaChlKXtyZXR1cm4hMX19LGFHVE0uZi51cmxMaXN0ZW5lcj1mdW5jdGlvbihlLHQsYSl7Im51bWJlciIhPXR5cGVvZiB0JiYodD01MDApLCJib29sZWFuIiE9dHlwZW9mIGEmJihhPSExKSxhR1RNLmQubGFzdF91cmw9YUdUTS5kLmxhc3RfdXJsfHxhR1RNLmYuZ2V0VmFsKCJsIiwiaHJlZiIpLCJzdHJpbmciPT10eXBlb2YgYUdUTS5kLmxhc3RfdXJsJiZhR1RNLmQubGFzdF91cmx8fChhR1RNLmQubGFzdF91cmw9IiIpO3ZhciBjaGVja1VybENoYW5nZT1mdW5jdGlvbigpe3ZhciB0PWFHVE0uZi5nZXRWYWwoImwiLCJocmVmIil8fCIiO2lmKHQhPWFHVE0uZC5sYXN0X3VybCl7InN0cmluZyIhPXR5cGVvZiBlJiYoZT0idlBhZ2V2aWV3Iik7dmFyIGE9e2V2ZW50OmV9O2Eub2xkVVJMPWFHVE0uZC5sYXN0X3VybCxhLm5ld1VSTD10LGEubmV3VGl0bGU9ZG9jdW1lbnQudGl0bGUsYUdUTS5mLmZpcmUoYSksYUdUTS5kLmxhc3RfdXJsPXR9fTthR1RNLmYuZXZMc3RuKCJ3aW5kb3ciLCJwb3BzdGF0ZSIsY2hlY2tVcmxDaGFuZ2UpLGFHVE0uZi5ldkxzdG4oIndpbmRvdyIsImhhc2hjaGFuZ2UiLGNoZWNrVXJsQ2hhbmdlKTt2YXIgbj0hMTtpZihhR1RNLmYucHJveHlTdXBwb3J0KCkpe3ZhciBvPXthcHBseTpmdW5jdGlvbihlLHQsYSl7dmFyIG49ZS5hcHBseSh0LGEpO3JldHVybiBjaGVja1VybENoYW5nZSgpLG59fTtoaXN0b3J5LnB1c2hTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5wdXNoU3RhdGUsbyksaGlzdG9yeS5yZXBsYWNlU3RhdGU9bmV3IFByb3h5KGhpc3RvcnkucmVwbGFjZVN0YXRlLG8pLG49ITB9KHQ+MCYmIW4mJmF8fHQ+MCYmIWEpJiZhR1RNLmYudGltZXIoInVybExpc3RlbmVyIixjaGVja1VybENoYW5nZSxudWxsLHQsMCl9LGFHVE0uZi5ndG1fbG9hZD1mdW5jdGlvbihlLHQsYSxuLG8scil7aWYoYUdUTS5kLmNvbmZpZyl7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuZ3RtTG9hZGVkJiYoYUdUTS5kLmd0bUxvYWRlZD1bXSksYUdUTS5kLmd0bUxvYWRlZC5sZW5ndGg8MSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9yZWFkeSIpKSxhJiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJndG0uanMiLCJndG0uc3RhcnQiOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLmFQYWdldmlldyYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiYVBhZ2V2aWV3IixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMudlBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJ2UGFnZXZpZXciLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy52UGFnZXZpZXdzJiZhR1RNLmYudXJsTGlzdGVuZXIoInZQYWdldmlldyIsYUdUTS5jLnZQYWdldmlld3NUaW1lcixhR1RNLmMudlBhZ2V2aWV3c0ZhbGxiYWNrKSksYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiZhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkLGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50JiYhYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UmJihhR1RNLmYuc2VuZG5hdXMoYUdUTS5mLmFHVE1fZXZlbnQoImFHVE1fY29uc2VudCIpKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSEwKSxhKXtufHwobj0iaWQiKTt2YXIgcz0hMSxpPWFHVE0uZi5nYygiYUdUTWRlYnVnIik7aWYoaSYmcGFyc2VJbnQoaSk+MCYmKHM9ITApLHN8fGFHVE0uZi51cmxQYXJhbSgiZ3RtX2RlYnVnIixkb2N1bWVudC5sb2NhdGlvbi5ocmVmKSYmKHM9ITApLCFzJiZkb2N1bWVudC5yZWZlcnJlcil7dmFyIGM9dC5jcmVhdGVFbGVtZW50KCJhIik7Yy5ocmVmPWRvY3VtZW50LnJlZmVycmVyLGMuaG9zdG5hbWU9PWFHVE0ubi50YSsiLmNvbSImJihzPSEwKX0haSYmcyYmYUdUTS5mLnNjKCJhR1RNZGVidWciLCIxIik7dmFyIGY9dC5jcmVhdGVFbGVtZW50KCJzY3JpcHQiKTtpZihmLmlkPSJhR1RNX3RtXyIrYSxmLmFzeW5jPSEwLCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmd0bUF0dHIpZm9yKHZhciBUIGluIGFHVE0uYy5ndG1BdHRyKWYuc2V0QXR0cmlidXRlKFQsYUdUTS5jLmd0bUF0dHJbVF0pO2lmKGFHVE0uYy5ub25jZSYmKGYubm9uY2U9YUdUTS5jLm5vbmNlKSxyLmd0bUpTJiYhcylmLmlubmVySFRNTD1hdG9iKHIuZ3RtSlMpO2Vsc2V7dmFyIE09ci5ndG1VUkx8fCJodHRwczovL3d3dy4iK2FHVE0ubi50bSsiLmNvbS9ndG0uanMiLEc9ci5lbnZ8fCIiLGQ9LTE9PT1NLmluZGV4T2YoIj8iKT8iPyI6IiYiO2Yuc3JjPU0rZCtuKyI9IithKyImbD0iK28rR312YXIgbD10LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJzY3JpcHQiKVswXTtsLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGYsbCksYUdUTS5kLmd0bUxvYWRlZC5wdXNoKGF8fCJub19ndG1faWQiKX19ZWxzZSBhR1RNLmYubG9nKCJlNyIsbnVsbCl9LGFHVE0uZi5kb21yZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgRE9NcmVhZHkgZXZlbnQgZmlyZWQuIn0sdD0hMCksZS5ldmVudHx8KGUuZXZlbnQ9ImFET01yZWFkeSIpLGFHVE0uZC5kb21fcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQuZG9tX3JlYWR5PSEwKSl9LGFHVE0uZi5wYWdlcmVhZHk9ZnVuY3Rpb24oZSl7dmFyIHQ9ITE7YUdUTS5mLnZPYihlKXx8KGU9e2FNU0c6IkVtcHR5IFBBR0VyZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYVBBR0VyZWFkeSIpLGFHVE0uZC5wYWdlX3JlYWR5JiZ0fHwoIWFHVE0uYy5kbFN0YXRlRXZlbnRzJiZ0fHxhR1RNLmYuZmlyZShlKSx0JiYoYUdUTS5kLnBhZ2VfcmVhZHk9ITApKX0sYUdUTS5mLmluaXRHVE09ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtJiZhR1RNLmMuZ3RtKXt2YXIgdD0wO2Zvcih2YXIgYSBpbiBhR1RNLmMuZ3RtKXQrKyxhR1RNLmMuZ3RtLmhhc093blByb3BlcnR5KGEpJiYoImJvb2xlYW4iIT10eXBlb2YgYUdUTS5jLmd0bVthXS5oYXNMb2FkZWQmJihhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZD0hMSksYUdUTS5jLmd0bVthXS5oYXNMb2FkZWR8fGUmJiFhR1RNLmMuZ3RtW2FdLm5vQ29uc2VudHx8KGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsYSxhR1RNLmMuZ3RtW2FdLmlkUGFyYW0/YUdUTS5jLmd0bVthXS5pZFBhcmFtOiIiLGFHVE0uYy5nZGwsYUdUTS5jLmd0bVthXSksYUdUTS5jLmd0bVthXS5oYXNMb2FkZWQ9ITApKTt0fHxhR1RNLmYuZ3RtX2xvYWQod2luZG93LGRvY3VtZW50LCIiLGFHVE0uYy5ndG1bYV0uaWRQYXJhbT9hR1RNLmMuZ3RtW2FdLmlkUGFyYW06IiIsYUdUTS5jLmdkbCxudWxsKX19LGFHVE0uZi5jaGtEUHJlYWR5PWZ1bmN0aW9uKCl7dmFyIGU9ZG9jdW1lbnQucmVhZHlTdGF0ZTsiaW50ZXJhY3RpdmUiPT09ZXx8ImNvbXBsZXRlIj09PWU/YUdUTS5mLmRvbXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4oZG9jdW1lbnQsIkRPTUNvbnRlbnRMb2FkZWQiLGFHVE0uZi5kb21yZWFkeSksImNvbXBsZXRlIj09PWU/YUdUTS5mLnBhZ2VyZWFkeShudWxsKTphR1RNLmYuZXZMc3RuKHdpbmRvdywibG9hZCIsYUdUTS5mLnBhZ2VyZWFkeSl9LGFHVE0uZi5pbmplY3Q9ZnVuY3Rpb24oKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTgiLG51bGwpLCExO2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnR8fCJib29sZWFuIiE9dHlwZW9mIGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UpcmV0dXJuIGFHVE0uZi5sb2coImUxMyIsbnVsbCksITE7YUdUTS5kLmluaXR8fCgod2luZG93W2FHVE0uYy5nZGxdfHxbXSkuZm9yRWFjaChmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSl7aWYoIWUuYUdUTWNoayl7ZS5hR1RNZGw9ITA7dmFyIGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3ZvaWQgMCE9PWFbImd0bS51bmlxdWVFdmVudElkIl0mJmRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGFHVE0uZC5mLnB1c2goYSl9fWVsc2UgYUdUTS5mLmxvZygiZTE3Iix7b2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmUsaW5kZXg6dH0pLGFHVE0uZC5mLnB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzoiRGF0YUxheWVyIEVudHJ5IGlzIG5vIG9iamVjdCIsZXJydHlwZToiREwgRXJyb3IiLG9ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplfSl9KSxhR1RNLmQuY29uc2VudC5ndG1Db25zZW50JiYoYUdUTS5mLmluaXRHVE0oITEpLGFHVE0uZC5pbml0PSEwKSxhR1RNLmQuaW5pdCYmYUdUTS5mLmNoa0RQcmVhZHkoKSk7cmV0dXJuImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5pbmplY3RfY2FsbGJhY2smJmFHVE0uZi5pbmplY3RfY2FsbGJhY2soKSxhR1RNLmYubG9nKCJtNiIsbnVsbCksITB9LGFHVE0uZi5pRnJhbWVGaXJlPWZ1bmN0aW9uKGUpeyJvYmplY3QiPT10eXBlb2YgZSYmZSYmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmL14oYUdUTXxndG1cLnxbYXZdRE9NcmVhZHl8W2F2XVBBR0VyZWFkeSkvLnRlc3QoZS5ldmVudCk/YUdUTS5mLnNlbmRuYXVzKGUpOihlLmFHVE1fc291cmNlPSJpRnJhbWUgIitkb2N1bWVudC5sb2NhdGlvbi5ob3N0bmFtZSxhR1RNLmQuaWZyYW1lLmNvdW50ZXIuZXZlbnRzKyssZS5pZkV2Q3RyPWFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMsInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiZlLmV2ZW50JiYoYUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdPWFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XXx8MCxhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0rKyxlWyJpZkV2Q3RyXyIrZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdKSxlLmFHVE10cyYmZGVsZXRlIGUuYUdUTXRzLGUuYUdUTXBhcmFtcyYmZGVsZXRlIGUuYUdUTXBhcmFtcyxhR1RNLmQuaWZyYW1lLm9yaWdpbj93aW5kb3cudG9wLnBvc3RNZXNzYWdlKGUsYUdUTS5kLmlmcmFtZS5vcmlnaW4pOmFHVE0uZC5mLnB1c2goZSkpKX0sYUdUTS5mLmlmSGFuZHNoYWtlPWZ1bmN0aW9uKCl7aWYoIWFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLmhhbmRzaGFrZSl7dmFyIGU9ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImlmcmFtZSIpO2lmKCFlLmxlbmd0aClyZXR1cm47Zm9yKHZhciB0PTA7dDxlLmxlbmd0aDt0Kyspe3ZhciBhPWVbdF07YSYmYS5jb250ZW50V2luZG93JiZhLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSgiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSIsIioiKX1hR1RNLmQuaWZyYW1lLmhhbmRzaGFrZT0hMH19LGFHVE0uZi5pZkhTbGlzdGVuPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5kYXRhJiYiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSI9PWUuZGF0YSlmb3IoYUdUTS5kLmlmcmFtZS5vcmlnaW49ZS5vcmlnaW4sYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbj0hMSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsYUdUTS5mLmlmSFNsaXN0ZW4sITEpO2FHVE0uZC5mLmxlbmd0aDspe3ZhciB0PWFHVE0uZC5mLnNoaWZ0KCk7YUdUTS5mLmlGcmFtZUZpcmUodCl9fSxhR1RNLmYudk9iPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpcmV0dXJuITE7dHJ5e0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZSkpfWNhdGNoKGUpe3JldHVybiExfXJldHVybiEwfSxhR1RNLmYudlN0PWZ1bmN0aW9uKGUpe3ZhciB0PUFycmF5LmlzQXJyYXkoZSk/ZToic3RyaW5nIj09dHlwZW9mIGU/W2VdOltdO3JldHVybiAwIT09dC5sZW5ndGgmJnQuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuInN0cmluZyI9PXR5cGVvZiBlJiYiIiE9PWV9KX0sYUdUTS5mLmV2THN0bj1mdW5jdGlvbihlLHQsYSl7aWYoIndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCksIm9iamVjdCI9PXR5cGVvZiBlJiZlJiYic3RyaW5nIj09dHlwZW9mIHQmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXRyeXsibWVzc2FnZSI9PXQ/YUdUTS5kLmlmcmFtZS50b3BMaXN0ZW58fGFHVE0uZC5pc19pZnJhbWV8fChhR1RNLmQuaWZyYW1lLnRvcExpc3Rlbj0hMCxlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXthKHZvaWQgMCE9PWUuZGF0YT9lLmRhdGE6bnVsbCwic3RyaW5nIj09dHlwZW9mIGUub3JpZ2luP2Uub3JpZ2luOiIiKX0pKTplLmFkZEV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChuKXthR1RNLmYubG9nKCJlMTIiLHtlcnJvcjpuLGVsOmUsZXY6dCxmY3Q6YX0pfWVsc2UgYUdUTS5mLmxvZygiZTExIix7ZWw6ZSxldjp0LGZjdDphfSl9LGFHVE0uZi5ybUxzdG49ZnVuY3Rpb24oZSx0LGEpeyJ3aW5kb3ciPT09ZSYmKGU9d2luZG93KSwiZG9jdW1lbnQiPT09ZSYmKGU9ZG9jdW1lbnQpO3RyeXtlLnJlbW92ZUV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChlKXt9fSxhR1RNLmYuZ2V0VmFsPWZ1bmN0aW9uKGUsdCl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJnQubWF0Y2goL1thLXpdKy9pKSYmKCJwIiE9ZXx8Im9iamVjdCI9PXR5cGVvZiBwZXJmb3JtYW5jZSYmcGVyZm9ybWFuY2UpKXN3aXRjaChlKXtjYXNlInciOnJldHVybiBhR1RNLmYudk9iKHdpbmRvd1t0XSk/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93W3RdKSk6d2luZG93W3RdO2Nhc2UibiI6cmV0dXJuIGFHVE0uZi52T2IobmF2aWdhdG9yW3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihuYXZpZ2F0b3JbdF0pKTpuYXZpZ2F0b3JbdF07Y2FzZSJkIjpyZXR1cm4gZG9jdW1lbnRbdF07Y2FzZSJsIjpyZXR1cm4gZG9jdW1lbnQubG9jYXRpb25bdF07Y2FzZSJoIjpyZXR1cm4gZG9jdW1lbnQuaGVhZFt0XTtjYXNlImIiOnJldHVybiBkb2N1bWVudC5ib2R5W3RdO2Nhc2UicyI6cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJodG1sIilbMF0uc2Nyb2xsVG9wfHwwO2Nhc2UibSI6cmV0dXJuIHdpbmRvdy5zY3JlZW5bdF07Y2FzZSJjIjpyZXR1cm4gd2luZG93Lmdvb2dsZV90YWdfZGF0YSYmd2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3M/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3MpKTpudWxsO2Nhc2UicCI6cmV0dXJuIm5vdyI9PXQ/cGVyZm9ybWFuY2Uubm93KCk6cGVyZm9ybWFuY2VbdF07ZGVmYXVsdDpyZXR1cm59fSxhR1RNLmYuZ2V0Tm9kZUF0dHI9ZnVuY3Rpb24oZSx0KXt2YXIgYT1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3JldHVybiBhP2EuZ2V0QXR0cmlidXRlKHQpOm51bGx9LGFHVE0uZi5uZXdOb2RlPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmIm9iamVjdCI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KGUpLG89ZG9jdW1lbnQucXVlcnlTZWxlY3Rvcih0KTtpZihvKXtmb3IodmFyIHIgaW4gYSlpZihhLmhhc093blByb3BlcnR5KHIpKXt2YXIgcz1yLnNwbGl0KCIuIik7MT09PXMubGVuZ3RoP24uc2V0QXR0cmlidXRlKHIsYVtyXSk6KG5bc1swXV18fChuW3NbMF1dPXt9KSxuW3NbMF1dW3NbMV1dPWFbcl0pfW8uYXBwZW5kQ2hpbGQobil9fX0sYUdUTS5mLmRlbE5vZGU9ZnVuY3Rpb24oZSl7aWYoYUdUTS5mLnZTdChlKSl7dmFyIHQ9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlKTt0JiZ0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodCl9fSxhR1RNLmYucGFnZWluZm89ZnVuY3Rpb24oZSl7dmFyIHQ9MCxhPTA7aWYoKGU9ZXx8e30pLmNvdW50V29yZHMmJmZ1bmN0aW9uIGdldFRleHQoZSl7aWYoMz09PWUubm9kZVR5cGUpdCs9ZS50ZXh0Q29udGVudC50cmltKCkuc3BsaXQoL1xzKy8pLmxlbmd0aDtlbHNlIGlmKDE9PT1lLm5vZGVUeXBlJiYhL14oc2NyaXB0fHN0eWxlfG5vc2NyaXB0KSQvaS50ZXN0KGUudGFnTmFtZSkpZm9yKHZhciBhPTA7YTxlLmNoaWxkTm9kZXMubGVuZ3RoO2ErKylnZXRUZXh0KGUuY2hpbGROb2Rlc1thXSl9KGRvY3VtZW50LmJvZHkpLGUuY291bnRJbWFnZXMpZm9yKHZhciBuPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJpbWciKSxvPTA7bzxuLmxlbmd0aDtvKyspbltvXS5uYXR1cmFsV2lkdGg+MjUwJiZuW29dLm5hdHVyYWxIZWlnaHQ+MjUwJiZhKys7cmV0dXJue3dvcmRzOnQsaW1hZ2VzOmF9fSxhR1RNLmYuY3BMc3Q9ZnVuY3Rpb24oZSx0LGEpe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXt2YXIgdDt3aW5kb3cuZ2V0U2VsZWN0aW9uJiYodD13aW5kb3cuZ2V0U2VsZWN0aW9uKCkudG9TdHJpbmcoKSkmJmEodCl9KX1jYXRjaCh0KXthR1RNLmYubG9nKCJlMTIiLHtlbGVtZW50OmUsZXJyb3I6dH0pfX0sYUdUTS5mLmVsTHN0PWZ1bmN0aW9uKGUsdCxhKXt0cnl7ZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7Zm9yKHZhciB0PXRoaXMudGFnTmFtZS50b0xvd2VyQ2FzZSgpLG49IiIsbz0iIixyPW51bGwscz1udWxsLGk9MCxjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50OyljPWMucGFyZW50RWxlbWVudCwhbiYmYy5pZCYmKG49KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmlkKSwhbyYmYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikmJihvPSgic3RyaW5nIj09dHlwZW9mIGMubm9kZU5hbWU/Yy5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKyI6IjoiIikrYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikpO2lmKCJpbnB1dCI9PT10fHwic2VsZWN0Ij09PXR8fCJ0ZXh0YXJlYSI9PT10KXtmb3IoYz10aGlzO2MmJmMucGFyZW50RWxlbWVudCYmImZvcm0iIT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCk7KWM9Yy5wYXJlbnRFbGVtZW50OyJmb3JtIj09PWMudGFnTmFtZS50b0xvd2VyQ2FzZSgpJiYocj17aWQ6Yy5pZCxjbGFzczpjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSxuYW1lOmMuZ2V0QXR0cmlidXRlKCJuYW1lIiksYWN0aW9uOmMuYWN0aW9uLGVsZW1lbnRzOmMuZWxlbWVudHMubGVuZ3RofSxzPUFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoYy5lbGVtZW50cyx0aGlzKSsxKX0ib2JqZWN0Ij09dHlwZW9mIHRoaXMuZWxlbWVudHMmJiJudW1iZXIiPT10eXBlb2YgdGhpcy5lbGVtZW50cy5sZW5ndGgmJihpPXRoaXMuZWxlbWVudHMubGVuZ3RoKTt2YXIgZj17dGFnTmFtZTp0LHRhcmdldDp0aGlzLnRhcmdldHx8IiIscGFyZW50SUQ6bixwYXJlbnRDbGFzczpvLGlkOnRoaXMuaWR8fCIiLG5hbWU6dGhpcy5nZXRBdHRyaWJ1dGUoIm5hbWUiKXx8IiIsY2xhc3M6dGhpcy5nZXRBdHRyaWJ1dGUoImNsYXNzIil8fCIiLGhyZWY6dGhpcy5ocmVmfHwiIixzcmM6dGhpcy5zcmN8fCIiLGFjdGlvbjp0aGlzLmFjdGlvbnx8IiIsdHlwZTp0aGlzLnR5cGV8fCIiLGVsZW1lbnRzOmkscG9zaXRpb246cyxmb3JtOnIsaHRtbDp0aGlzLm91dGVySFRNTD90aGlzLm91dGVySFRNTC50b1N0cmluZygpOiIiLHRleHQ6dGhpcy5vdXRlclRleHQ/dGhpcy5vdXRlclRleHQudG9TdHJpbmcoKToiIn07Zi5odG1sLmxlbmd0aD41MTImJihmLmh0bWw9Zi5odG1sLnNsaWNlKDAsNTA5KSsiLi4uIiksZi50ZXh0Lmxlbmd0aD41MTImJihmLnRleHQ9Zi50ZXh0LnNsaWNlKDAsNTA5KSsiLi4uIiksYShmKX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuYWRkRWxMc3Q9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7dmFyIG49ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChlKTsib2JqZWN0Ij09dHlwZW9mIG4mJiJudW1iZXIiPT10eXBlb2Ygbi5sZW5ndGgmJjAhPW4ubGVuZ3RoJiZuLmZvckVhY2goZnVuY3Rpb24oZSl7aWYoImNvcHkiPT09dClhR1RNLmYuY3BMc3QoZSx0LGEpO2Vsc2UgYUdUTS5mLmVsTHN0KGUsdCxhKX0pfX0sYUdUTS5mLm9ic2VydmVyPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmImZ1bmN0aW9uIj09dHlwZW9mIGEpe25ldyBNdXRhdGlvbk9ic2VydmVyKGZ1bmN0aW9uKG4pe24uZm9yRWFjaChmdW5jdGlvbihuKXsiY2hpbGRMaXN0Ij09PW4udHlwZSYmbi5hZGRlZE5vZGVzLmxlbmd0aCYmQXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChuLmFkZGVkTm9kZXMsZnVuY3Rpb24obil7aWYoMT09PW4ubm9kZVR5cGUmJiJzdHJpbmciPT10eXBlb2Ygbi50YWdOYW1lJiZuLnRhZ05hbWUudG9Mb3dlckNhc2UoKT09PWUudG9Mb3dlckNhc2UoKSYmYUdUTS5mLmVsTHN0KG4sdCxhKSwxPT09bi5ub2RlVHlwZSYmbi5xdWVyeVNlbGVjdG9yQWxsKXt2YXIgbz1uLnF1ZXJ5U2VsZWN0b3JBbGwoZS50b0xvd2VyQ2FzZSgpKTtBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG8sZnVuY3Rpb24oZSl7YUdUTS5mLmVsTHN0KGUsdCxhKX0pfX0pfSl9KS5vYnNlcnZlKGRvY3VtZW50LmJvZHkse2NoaWxkTGlzdDohMCxzdWJ0cmVlOiEwLGF0dHJpYnV0ZXM6ITF9KX19LGFHVE0uZi5yVGVzdD1mdW5jdGlvbihlLHQpe3JldHVybiBhR1RNLmYudlN0KFtlLHRdKSYmbmV3IFJlZ0V4cCh0LCJpIikudGVzdChlKX0sYUdUTS5mLnJNYXRjaD1mdW5jdGlvbihlLHQpe3JldHVybiBlLm1hdGNoKG5ldyBSZWdFeHAodCkpfSxhR1RNLmYuclJlcGxhY2U9ZnVuY3Rpb24oZSx0LGEpe3JldHVybiBhR1RNLmYudlN0KFtlLHQsYV0pP2UucmVwbGFjZShuZXcgUmVnRXhwKHQsImdpIiksYSk6ZX0sYUdUTS5mLmlzSUZyYW1lPWZ1bmN0aW9uKCl7cmV0dXJuIHdpbmRvdy5zZWxmIT09d2luZG93LnRvcH0sYUdUTS5mLmpzZXJyb3JzPWZ1bmN0aW9uKCl7YUdUTS5mLmV2THN0bih3aW5kb3csImVycm9yIixmdW5jdGlvbihlKXtpZihudWxsIT09ZSl7dmFyIHQ9InN0cmluZyI9PXR5cGVvZiBlLm1lc3NhZ2U/ZS5tZXNzYWdlOiIiLGE9InN0cmluZyI9PXR5cGVvZiBlLmZpbGVuYW1lP2UuZmlsZW5hbWU6IiI7aWYoInNjcmlwdCBlcnJvci4iPT10LnRvTG93ZXJDYXNlKCkpe2lmKCFhKXJldHVybjt0PXQucmVwbGFjZSgiLiIsIjoiKSsiIGVycm9yIGZyb20gb3RoZXIgZG9tYWluLiJ9YSYmKHQrPSIgfCBmaWxlOiAiK2EpO3ZhciBuPWFHVE0uZi5zdHJjbGVhbihlLmxpbmVubyk7IjAiPT1uJiYobj0iIiksbiYmKHQrPSIgfCBsaW5lOiAiK24pO3ZhciBvPWFHVE0uZi5zdHJjbGVhbihlLmNvbG5vKTsiMCI9PW8mJihvPSIiKSxvJiYodCs9IiB8IGNvbDogIitvKSxhR1RNLmQuZXJyb3JzLnB1c2godCk7dmFyIHI9IiI7dHJ5e3I9bmF2aWdhdG9yLmFwcENvZGVOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBWZXJzaW9uKyIgfCAiK25hdmlnYXRvci5wbGF0Zm9ybX1jYXRjaChlKXt9aWYoYUdUTS5kLmVycm9yX2NvdW50ZXIrKz49MTAwKXJldHVybjthR1RNLmQuZXJyb3JfY291bnRlcjw9NSYmYUdUTS5mLmZpcmUoe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzp0LGJyb3dzZXI6cixlcnJ0eXBlOiJKUyBFcnJvciIsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGVycmN0OmFHVE0uZC5lcnJvcl9jb3VudGVyLGV2ZW50TW9kZWw6bnVsbH0pfX0pfSxhR1RNLmYudGltZXJma3Q9ZnVuY3Rpb24oZSl7dmFyIHQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3QudGltZXJfbXM9MSp0LnRpbWVyX21zLHQudGltZXJfY3QrKyx0LnRpbWVyX3RtPXQudGltZXJfbXMqdC50aW1lcl9jdCx0LnRpbWVyX3NjPXBhcnNlRmxvYXQoKHQudGltZXJfdG0vMWUzKS50b0ZpeGVkKDMpKSx0LmV2ZW50PXQuZXZlbnR8fCJ0aW1lciIsLTEhPT10LmV2ZW50LmluZGV4T2YoIltzXSIpJiYodC5ldmVudD10LmV2ZW50LnJlcGxhY2UoIltzXSIsdC50aW1lcl9zYy50b1N0cmluZygpKSksdC5ldmVudE1vZGVsPW51bGwsYUdUTS5mLmZpcmUodCl9LGFHVE0uZi50aW1lcj1mdW5jdGlvbihlLHQsYSxuLG8pe2lmKCFlJiYib2JqZWN0Ij09dHlwZW9mIGEmJmEmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmKGU9YS5ldmVudCksZT1lfHwidGltZXIiLGUrPSJfIisobmV3IERhdGUpLmdldFRpbWUoKS50b1N0cmluZygpKyJfIitNYXRoLmZsb29yKDk5OTk5OSpNYXRoLnJhbmRvbSgpKzEpLnRvU3RyaW5nKCksYUdUTS5mLnN0b3B0aW1lcihlKSwib2JqZWN0Ij09dHlwZW9mIGEmJmEpdmFyIHI9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpO2Vsc2Ugcj17fTtyLnRpbWVyX25tPWUsci50aW1lcl9tcz1uLHIudGltZXJfcnA9byxyLnRpbWVyX2N0PTAsci5pZD0xPT09ci50aW1lcl9ycD9zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7dD90KHIpOmFHVE0uZi50aW1lcmZrdChyKX0sbik6c2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXt0P3Qocik6YUdUTS5mLnRpbWVyZmt0KHIpLHIudGltZXJfY3QrKyxyLnRpbWVyX3JwPjAmJnIudGltZXJfY3Q+PXIudGltZXJfcnAmJmFHVE0uZi5zdG9wdGltZXIoci50aW1lcl9ubSl9LG4pLGFHVE0uZC50aW1lcltlXT1yfSxhR1RNLmYuc3RvcHRpbWVyPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLnRpbWVyJiYoYUdUTS5kLnRpbWVyPXt9KSwib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC50aW1lcltlXSl7dmFyIHQ9YUdUTS5kLnRpbWVyW2VdOzE9PT10LnRpbWVyX3JwP2NsZWFyVGltZW91dCh0LmlkKTpjbGVhckludGVydmFsKHQuaWQpLGRlbGV0ZSBhR1RNLmQudGltZXJbZV19fSxhR1RNLmYuaW5pdD1mdW5jdGlvbigpeyFhR1RNLmMuZGVidWcmJmFHVE0uZi5vcHRvdXQoKXx8KGFHVE0uZi5jb25maWcoYUdUTS5jKSxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZT8oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMCxhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZT0hMCxhR1RNLmQuY29uc2VudC5mZWVkYmFjaz0iUGFnZSBpcyBpRnJhbWUiLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW58fChhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSEwLHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbikpLGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpOiJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNtcCYmYUdUTS5jLmNtcD8ibm9uZSI9PWFHVE0uYy5jbXA/KGFHVE0uZC5jb25zZW50PXtndG1Db25zZW50OiEwLGhhc1Jlc3BvbnNlOiEwLGZlZWRiYWNrOiJObyBDb25zZW50IENoZWNrIGNvbmZpZ3VyZWQifSxhR1RNLmYuaW5qZWN0KCkpOihhR1RNLmYubG9hZF9jYyhhR1RNLmMuY21wLGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKSxhR1RNLmYuaW5pdEdUTSghMCkpOihhR1RNLmYuY29uc2VudF9saXN0ZW5lcigpLGFHVE0uZi5pbml0R1RNKCEwKSksYUdUTS5mLmpzZXJyb3JzKCkpfSxhR1RNLmYuZW5jPWZ1bmN0aW9uKGUsdCl7dmFyIGE9dCU2MysxLG49YnRvYSh1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoZSkpKSxvPTA7Ij0iPT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJm8rKywiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0yKSYmbysrLG49bi5zbGljZSgwLG4ubGVuZ3RoLW8pO2Zvcih2YXIgcj0xPT09bz8ifiI6Mj09PW8/In5+IjoiIixzPSIiLGk9MDtpPG4ubGVuZ3RoO2krKyl7dmFyIGM9IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8iLmluZGV4T2Yobi5jaGFyQXQoaSkpO3MrPWM8MD9uLmNoYXJBdChpKToiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODktXyIuY2hhckF0KChjK2EpJTY0KX1yZXR1cm4gbz9zLnNsaWNlKDAsMykrcitzLnNsaWNlKDMpOnN9LGFHVE0uZi54c2VuZD1mdW5jdGlvbihlLHQsYSxuKXtpZihlJiYic3RyaW5nIj09dHlwZW9mIGUpdHJ5e3ZhciBvLHI9bmV3IFhNTEh0dHBSZXF1ZXN0O3JldHVybiByLm9wZW4oIlBPU1QiLGUsITApLHIuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwiYXBwbGljYXRpb24vanNvbiIpLG89YSYmIm51bWJlciI9PXR5cGVvZiBuJiZuPj0xPyd7InEiOiInK2FHVE0uZi5lbmMoYUdUTS5mLnNTdHJmKHQpLG4pKycifSc6J3siZSI6JythR1RNLmYuc1N0cmYodCkrIn0iLHIuc2VuZChvKSxyfWNhdGNoKHQpe3JldHVybiBhR1RNLmYubG9nKCJlX3hzZW5kIix7bXNnOnQubWVzc2FnZSx1cmw6ZX0pLG51bGx9fSxhR1RNLmYuc2VuZG5hdXM9ZnVuY3Rpb24oZSl7aWYoZSYmIm9iamVjdCI9PXR5cGVvZiBlKXt2YXIgdD13aW5kb3dbYUdUTS5jLmdkbF0ucHVzaDshYUdUTS5kLm9yaWdpbmFsRExwdXNoJiYvc2FuZGJveC9pLnRlc3QodC50b1N0cmluZygpKSYmKGFHVE0uZC5vcmlnaW5hbERMcHVzaD10KTt2YXIgYT0hMTtpZihhR1RNLmMuZGxPcmdQdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2gmJmFHVE0uZC5vcmlnaW5hbERMcHVzaCE9PXQpe3ZhciBuPXQudG9TdHJpbmcoKTsvc2FuZGJveC9pLnRlc3Qobik/YUdUTS5kLm9yaWdpbmFsRExwdXNoPXQ6KGE9ITAsYUdUTS5kLmRsSG9va0xvZ2dlZHx8KGFHVE0uZC5vcmlnaW5hbERMcHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJydHlwZToiREwgRXJyb3IiLGVycm1zZzoiRnVuY3Rpb24gZGF0YUxheWVyLnB1c2ggaG9va2VkIC0gbm8gbG9uZ2VyIGZyb20gR1RNIixmY3RfaG9vazpuLGZjdF9vcmlnOmFHVE0uZC5vcmlnaW5hbERMcHVzaC50b1N0cmluZygpLHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxldmVudE1vZGVsOm51bGx9KSxhR1RNLmQuZGxIb29rTG9nZ2VkPSEwKSwicmVzdG9yZSI9PT1hR1RNLmMuZGxPcmdQdXNoJiYod2luZG93W2FHVE0uYy5nZGxdLnB1c2g9YUdUTS5kLm9yaWdpbmFsRExwdXNoLGE9ITEpKX1hJiYidXNlIj09PWFHVE0uYy5kbE9yZ1B1c2g/YUdUTS5kLm9yaWdpbmFsRExwdXNoKGUpOndpbmRvd1thR1RNLmMuZ2RsXS5wdXNoKGUpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhlKSxhR1RNLmYubG9nKCJtOSIsZSl9fSxhR1RNLmYuZmlyZT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe3RyeXtpZighKGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpKSlyZXR1cm4gdm9pZCBhR1RNLmYubG9nKCJlMTUiLGEpfWNhdGNoKG4pe3ZhciB0PSJhR1RNIEZpcmUgRXJyb3IgKEpTT04ucGFyc2UpIjsic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJih0PXQrIiAoRXZlbnQ6ICIrZS5ldmVudCsiKSIpO3ZhciBhPXtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6bi5tZXNzYWdlLGVycnR5cGU6dCx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXJ8fDEsZXZlbnRNb2RlbDpudWxsfTthR1RNLmYubG9nKCJlMTUiLGEpfWlmKCEoIm51bWJlciI9PXR5cGVvZiBhLmFHVE10c3x8Im9iamVjdCI9PXR5cGVvZiBhLmV2ZW50TW9kZWwmJmEuZXZlbnRNb2RlbHx8InN0cmluZyIhPXR5cGVvZiBhLmV2ZW50JiYic3RyaW5nIj09dHlwZW9mIGEudHlwZSYmIm9iamVjdCI9PXR5cGVvZiBhLmZsYWdzJiYiYm9vbGVhbiI9PXR5cGVvZiBhLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZyYmYS5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcpKXtpZihhLmFHVE10cz1EYXRlLm5vdygpLGEuZXZlbnRNb2RlbD1udWxsLGFHVE0uYy5jb25zZW50X2V2ZW50cyYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoIiwiK2FHVE0uYy5jb25zZW50X2V2ZW50cysiLCIpLmluZGV4T2YoIiwiK2EuZXZlbnQrIiwiKT49MClpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pZm9yKHZhciBuIGluIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pdm9pZCAwIT09YVtuXSYmKGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl0mJmFbbl0hPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl18fGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpKTtlbHNlIGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpO2lmKGFHVE0uYy5kbFNldCYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXImJiJvYmplY3QiPT10eXBlb2YgZ29vZ2xlX3RhZ19tYW5hZ2VyW2FHVE0uYy5ndG1JRF0mJk9iamVjdC5rZXlzKGFHVE0uYy5kbFNldCkuZm9yRWFjaChmdW5jdGlvbihlKXt2YXIgdD1hR1RNLmMuZGxTZXRbZV0sbj1nb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXVthR1RNLmMuZ2RsXS5nZXQodCk7dm9pZCAwIT09biYmKGFbZV09bil9KSwoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8IWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCkmJigic3RyaW5nIiE9dHlwZW9mIGEuZXZlbnR8fDAhPT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKSkmJiFhLl9ub0NvbnNlbnR8fGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYhYUdUTS5kLmlmcmFtZS5vcmlnaW4pcmV0dXJuIGRlbGV0ZSBhLmFHVE10cyxkZWxldGUgYS5ldmVudE1vZGVsLHZvaWQgYUdUTS5kLmYucHVzaChKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSkpO2lmKGEuX3Bvc3QmJiFhLl9wb3N0X3NlbnQpe3ZhciBvPSJvYmplY3QiPT10eXBlb2YgYS5fcG9zdD9hLl9wb3N0Ont9LHI9InN0cmluZyI9PXR5cGVvZiBvLnVybCYmby51cmw/by51cmw6YUdUTS5jLnRyYW5zcG9ydF91cmw7aWYocil7dmFyIHM9ImJvb2xlYW4iPT10eXBlb2Ygby5lbmM/by5lbmM6ISFhR1RNLmMudHJhbnNwb3J0X2VuYyxpPSJudW1iZXIiPT10eXBlb2Ygby5zYWx0JiZvLnNhbHQ+PTE/by5zYWx0OiJudW1iZXIiPT10eXBlb2YgYUdUTS5jLnRyYW5zcG9ydF9zYWx0JiZhR1RNLmMudHJhbnNwb3J0X3NhbHQ+PTE/YUdUTS5jLnRyYW5zcG9ydF9zYWx0OmFHVE0uYy5zZXNzaW9uX3NhbHR8fDAsYz1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZGVsZXRlIGMuX3Bvc3QsZGVsZXRlIGMuX3Bvc3Rfc2VudCxkZWxldGUgYy5ldmVudE1vZGVsLG8uY29uc2VudCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmKGMuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpKSxhR1RNLmYueHNlbmQocixjLHMsaSksYS5fcG9zdF9zZW50PSEwfX0oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudHx8InN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYwPT09YS5ldmVudC5pbmRleE9mKCJhR1RNIil8fGEuX25vQ29uc2VudCkmJigic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJjA9PT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8KGRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGRlbGV0ZSBhLmFHVE1wYXJhbXMsYS5hR1RNcGFyYW1zPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKSksYUdUTS5kLmRsLnB1c2goYSksYS5fbm9ETFB1c2g/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayYmYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrKGEpOmFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQ/YUdUTS5mLmlGcmFtZUZpcmUoYSk6YUdUTS5mLnNlbmRuYXVzKGEpKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmZpcmVfY2FsbGJhY2smJmFHVE0uZi5maXJlX2NhbGxiYWNrKGEpLGFHVE0uZi5sb2coIm03IixhKX19ZWxzZSBhR1RNLmYubG9nKCJlOSIse286dHlwZW9mIGV9KX07');
  const origin = getRequestHeader('origin') || '';
  const jsCode = agtm + cmp + config + 'aGTM.f.init();';

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


