import { createElement, type ReactNode } from "react";

/** Lightweight markdown → React (no heavy deps). Enough for assistant replies. */
export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      nodes.push(
        createElement(
          "pre",
          { key: key++, className: "md-pre" },
          lang
            ? createElement("div", { className: "md-pre-lang" }, lang)
            : null,
          createElement("code", null, body.join("\n")),
        ),
      );
      continue;
    }

    // horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push(createElement("hr", { key: key++, className: "md-hr" }));
      i += 1;
      continue;
    }

    // blank
    if (!line.trim()) {
      nodes.push(
        createElement("div", { key: key++, className: "md-spacer" }),
      );
      i += 1;
      continue;
    }

    // headings
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const tag = `h${level}` as "h1" | "h2" | "h3";
      nodes.push(
        createElement(
          tag,
          { key: key++, className: `md-h md-h${level}` },
          ...inline(h[2]),
        ),
      );
      i += 1;
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const quotes: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quotes.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      nodes.push(
        createElement(
          "blockquote",
          { key: key++, className: "md-quote" },
          ...inline(quotes.join(" ")),
        ),
      );
      continue;
    }

    // unordered list block
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i += 1;
      }
      nodes.push(
        createElement(
          "ul",
          { key: key++, className: "md-ul" },
          ...items.map((item, idx) =>
            createElement("li", { key: idx }, ...inline(item)),
          ),
        ),
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      nodes.push(
        createElement(
          "ol",
          { key: key++, className: "md-ol" },
          ...items.map((item, idx) =>
            createElement("li", { key: idx }, ...inline(item)),
          ),
        ),
      );
      continue;
    }

    // paragraph (merge consecutive plain lines)
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```")
    ) {
      para.push(lines[i]);
      i += 1;
    }
    nodes.push(
      createElement(
        "p",
        { key: key++, className: "md-p" },
        ...inline(para.join(" ")),
      ),
    );
  }

  return nodes;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // bold **x**, italic *x* (single, not bold), code `x`
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(createElement("strong", { key: `b${k++}` }, token.slice(2, -2)));
    } else if (token.startsWith("`")) {
      parts.push(
        createElement(
          "code",
          { key: `c${k++}`, className: "md-code" },
          token.slice(1, -1),
        ),
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(createElement("em", { key: `i${k++}` }, token.slice(1, -1)));
    } else {
      parts.push(token);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
