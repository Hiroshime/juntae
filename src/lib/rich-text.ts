export type RichTextInline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "emphasis"; value: string }
  | { type: "link"; value: string; href: string }
  | { type: "break" };

export type RichTextBlock =
  | { type: "heading"; level: 1 | 2 | 3; content: RichTextInline[] }
  | { type: "paragraph"; content: RichTextInline[] }
  | { type: "list"; ordered: boolean; items: RichTextInline[][] };

const inlinePattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\n)/gi;

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseRichTextInline(value: string): RichTextInline[] {
  const tokens: RichTextInline[] = [];
  let cursor = 0;
  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index;
    if (index > cursor) tokens.push({ type: "text", value: value.slice(cursor, index) });
    const token = match[0];
    if (token === "\n") tokens.push({ type: "break" });
    else if (token.startsWith("**")) tokens.push({ type: "strong", value: token.slice(2, -2) });
    else if (token.startsWith("*")) tokens.push({ type: "emphasis", value: token.slice(1, -1) });
    else {
      const link = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
      const href = link ? safeHttpUrl(link[2]) : null;
      if (link && href) tokens.push({ type: "link", value: link[1], href });
      else tokens.push({ type: "text", value: token });
    }
    cursor = index + token.length;
  }
  if (cursor < value.length) tokens.push({ type: "text", value: value.slice(cursor) });
  return tokens;
}

export function parseRichText(value: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", content: parseRichTextInline(paragraph.join("\n")) });
    paragraph.length = 0;
  };
  const flushList = () => {
    if (list)
      blocks.push({
        type: "list",
        ordered: list.ordered,
        items: list.items.map(parseRichTextInline),
      });
    list = null;
  };

  for (const line of value.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        content: parseRichTextInline(heading[2]),
      });
      continue;
    }
    const unorderedItem = /^[-*]\s+(.+)$/.exec(line);
    const orderedItem = /^\d+\.\s+(.+)$/.exec(line);
    const item = unorderedItem ?? orderedItem;
    if (item) {
      flushParagraph();
      const ordered = Boolean(orderedItem);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function inlineToHtml(tokens: RichTextInline[]) {
  return tokens
    .map((token) => {
      if (token.type === "break") return "<br>";
      const value = escapeHtml(token.value);
      if (token.type === "strong") return `<strong>${value}</strong>`;
      if (token.type === "emphasis") return `<em>${value}</em>`;
      if (token.type === "link")
        return `<a href="${escapeHtml(token.href)}" rel="noopener noreferrer">${value}</a>`;
      return value;
    })
    .join("");
}

export function richTextToHtml(value: string) {
  return parseRichText(value)
    .map((block) => {
      if (block.type === "heading")
        return `<h${block.level}>${inlineToHtml(block.content)}</h${block.level}>`;
      if (block.type === "list") {
        const tag = block.ordered ? "ol" : "ul";
        return `<${tag}>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("")}</${tag}>`;
      }
      return `<p>${inlineToHtml(block.content)}</p>`;
    })
    .join("");
}

function inlineToText(tokens: RichTextInline[]) {
  return tokens.map((token) => (token.type === "break" ? "\n" : token.value)).join("");
}

export function richTextToPlainText(value: string) {
  return parseRichText(value)
    .map((block) => {
      if (block.type === "list")
        return block.items
          .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${inlineToText(item)}`)
          .join("\n");
      return inlineToText(block.content);
    })
    .join("\n\n");
}

export function contentToEmailHtml(value: string, rich: boolean) {
  return rich ? richTextToHtml(value) : `<p>${escapeHtml(value).replace(/\r\n?|\n/g, "<br>")}</p>`;
}
