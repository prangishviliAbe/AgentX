import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "../src/lib/markdown";

function toHtml(source: string): string {
  const nodes = renderMarkdown(source);
  return renderToStaticMarkup(createElement("div", null, ...nodes));
}

describe("renderMarkdown", () => {
  it("renders bold and headings instead of raw markers", () => {
    const html = toHtml(
      "ეს არის **განკლების მონადირე**\n\n### რა ნახე\n- **ქულები**\n- სხვა",
    );
    assert.match(html, /<strong>/);
    assert.doesNotMatch(html, /\*\*განკლების/);
    assert.match(html, /<h3 class="md-h md-h3">/);
    assert.doesNotMatch(html, /###\s*რა ნახე/);
    assert.match(html, /<ul class="md-ul">/);
    assert.match(html, /ქულები/);
  });

  it("renders fenced code blocks", () => {
    const html = toHtml("```html\n<div>x</div>\n```");
    assert.match(html, /md-pre/);
    assert.match(html, /md-pre-lang/);
    assert.match(html, /&lt;div&gt;x&lt;\/div&gt;/);
  });

  it("returns react nodes", () => {
    const nodes = renderMarkdown("hello **world**");
    assert.ok(nodes.length > 0);
    assert.ok(
      nodes.every(
        (n: ReactNode) => typeof n === "string" || isValidElement(n),
      ),
    );
  });
});
