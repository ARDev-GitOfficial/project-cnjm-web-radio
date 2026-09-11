import { memo, type ReactNode } from "react";

type MarqueeTag = "span" | "strong" | "h1" | "p";

type MarqueeTextProps = {
  as?: MarqueeTag;
  className?: string;
  text: string;
};

export const MarqueeText = memo(function MarqueeText({ as = "span", className = "", text }: MarqueeTextProps) {
  return renderTextTag(
    as,
    ["marquee-text", className].filter(Boolean).join(" "),
    text,
    <span className="marquee-text-track">{text}</span>,
  );
});

function renderTextTag(
  tag: MarqueeTag,
  className: string,
  title: string,
  content: ReactNode,
) {
  if (tag === "h1") {
    return <h1 className={className} title={title}>{content}</h1>;
  }

  if (tag === "p") {
    return <p className={className} title={title}>{content}</p>;
  }

  if (tag === "strong") {
    return <strong className={className} title={title}>{content}</strong>;
  }

  return <span className={className} title={title}>{content}</span>;
}
