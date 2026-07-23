/**
 * aGTM Inspector — DevTools registration.
 * Creates the "aGTM" panel. No permissions are declared in the manifest:
 * the panel reads the inspected page purely via chrome.devtools.inspectedWindow.eval
 * and observes traffic via chrome.devtools.network — both are inherent to a
 * devtools_page and need no host/permissions grants.
 */
chrome.devtools.panels.create(
  "aGTM",
  "icons/icon48.png",
  "panel.html",
  function (/* panel */) {
    // Panel created. All logic lives in panel.js (loaded by panel.html).
  }
);
