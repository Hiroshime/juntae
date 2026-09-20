import { Fragment, type ReactNode } from "react";
import { parseRichText, type RichTextInline } from "@/lib/rich-text";

function InlineContent({ tokens }: { tokens: RichTextInline[] }) {
  return tokens.map((token, index): ReactNode => {
    const key = `${token.type}-${index}`;
    if (token.type === "break") return <br key={key} />;
    if (token.type === "strong") return <strong key={key}>{token.value}</strong>;
    if (token.type === "emphasis") return <em key={key}>{token.value}</em>;
    if (token.type === "link")
      return (
        <a href={token.href} key={key} rel="noopener noreferrer" target="_blank">
          {token.value}
        </a>
      );
    return <Fragment key={key}>{token.value}</Fragment>;
  });
}

export function RichText({ value }: { value: string }) {
  return (
    <div className="rich-text">
      {parseRichText(value).map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          if (block.level === 1)
            return (
              <h2 key={key}>
                <InlineContent tokens={block.content} />
              </h2>
            );
          if (block.level === 2)
            return (
              <h3 key={key}>
                <InlineContent tokens={block.content} />
              </h3>
            );
          return (
            <h4 key={key}>
              <InlineContent tokens={block.content} />
            </h4>
          );
        }
        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>
              <InlineContent tokens={item} />
            </li>
          ));
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        return (
          <p key={key}>
            <InlineContent tokens={block.content} />
          </p>
        );
      })}
    </div>
  );
}
