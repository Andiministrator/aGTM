/**
 * aGTM Inspector — JSON syntax highlighter.
 *
 * Pure, dependency-free, side-effect-free. Turns any JSON-serialisable value into
 * an HTML string with per-token <span> classes (json-key/string/number/bool/null),
 * so the panel can render an event / log object "coolly" and safely.
 *
 * XSS-safe: every token's text is HTML-escaped before it is wrapped in a span, and
 * the structural remainder of JSON.stringify output ({ } [ ] , : whitespace,
 * numbers) contains no HTML-significant characters, so it needs no escaping.
 *
 * Exposed both as a browser global (window.aGTMInspectorJsonView) and as a
 * CommonJS module (module.exports) so it can be unit-tested under `bun test`
 * (test/devtools/jsonview.test.js) — same pattern as netclassify.js.
 */
(function (root) {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  /**
   * @param {*} value - any JSON-serialisable value
   * @param {number} [indent=2] - JSON.stringify indent
   * @returns {string} HTML string with highlighted tokens
   */
  function highlight(value, indent) {
    var json;
    try {
      json = JSON.stringify(value, null, typeof indent === "number" ? indent : 2);
    } catch (e) {
      return '<span class="json-null">' + esc(String(value)) + "</span>";
    }
    if (typeof json !== "string") {
      // value was undefined or a function → JSON.stringify returns undefined
      return '<span class="json-null">' + esc(String(value)) + "</span>";
    }
    return json.replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        var cls = "json-number";
        if (match.charAt(0) === '"') {
          cls = /:\s*$/.test(match) ? "json-key" : "json-string";
        } else if (match === "true" || match === "false") {
          cls = "json-bool";
        } else if (match === "null") {
          cls = "json-null";
        }
        return '<span class="' + cls + '">' + esc(match) + "</span>";
      }
    );
  }

  var api = { highlight: highlight };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.aGTMInspectorJsonView = api;
  }
})(typeof window !== "undefined" ? window : this);
