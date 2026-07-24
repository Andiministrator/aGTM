// Unit tests for the aGTM Inspector JSON highlighter
// (devtools-extension/jsonview.js). Pure logic — no DOM/chrome APIs.
//
// Guards the two things that matter: correct per-token classification, and that
// every piece of page-derived text is HTML-escaped (no XSS via a logged event
// whose values contain markup).

import { test, expect, describe } from "bun:test";
import { highlight } from "../../devtools-extension/jsonview.js";

describe("highlight — token classes", () => {
  // Quotes are HTML-escaped to &quot; (safe; renders as " inside <pre>).
  test("keys get json-key", () => {
    expect(highlight({ event: "page_view" })).toContain('<span class="json-key">&quot;event&quot;:</span>');
  });
  test("string values get json-string", () => {
    expect(highlight({ event: "page_view" })).toContain('<span class="json-string">&quot;page_view&quot;</span>');
  });
  test("numbers get json-number", () => {
    expect(highlight({ n: 42 })).toContain('<span class="json-number">42</span>');
  });
  test("negative / exponent numbers", () => {
    expect(highlight({ n: -1.5e3 })).toContain('<span class="json-number">-1500</span>');
  });
  test("booleans get json-bool", () => {
    const h = highlight({ a: true, b: false });
    expect(h).toContain('<span class="json-bool">true</span>');
    expect(h).toContain('<span class="json-bool">false</span>');
  });
  test("null gets json-null", () => {
    expect(highlight({ x: null })).toContain('<span class="json-null">null</span>');
  });
});

describe("highlight — XSS safety", () => {
  test("markup in a string value is escaped, not emitted raw", () => {
    const h = highlight({ v: "<img src=x onerror=alert(1)>" });
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });
  test("markup in a KEY is escaped", () => {
    const h = highlight({ "<b>": 1 });
    expect(h).not.toContain("<b>");
    expect(h).toContain("&lt;b&gt;");
  });
  test("a value that looks like a closing span cannot break out", () => {
    const h = highlight({ v: '</span><script>x</script>' });
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;/span&gt;");
  });
  test("quotes inside a string are escaped", () => {
    expect(highlight({ v: 'a"b' })).toContain("&quot;");
  });
});

describe("highlight — edge cases", () => {
  test("undefined value degrades gracefully", () => {
    expect(highlight(undefined)).toBe('<span class="json-null">undefined</span>');
  });
  test("a primitive string is highlighted as a string", () => {
    expect(highlight("hi")).toContain('<span class="json-string">&quot;hi&quot;</span>');
  });
  test("the unserializable sentinel renders as an object", () => {
    expect(highlight({ __unserializable: true })).toContain('<span class="json-key">&quot;__unserializable&quot;:</span>');
  });
  test("nested objects/arrays keep structural braces unescaped and intact", () => {
    const h = highlight({ a: [1, { b: "x" }] });
    expect(h).toContain("[");
    expect(h).toContain("{");
    expect(h).toContain('<span class="json-string">&quot;x&quot;</span>');
  });
});
