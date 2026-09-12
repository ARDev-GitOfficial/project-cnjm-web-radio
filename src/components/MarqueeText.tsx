import { memo, useEffect, useRef, useState, type ReactNode } from "react";

type MarqueeTag = "span" | "strong" | "h1" | "p" | "small";

type MarqueeTextProps = {
  as?: MarqueeTag;
  className?: string;
  text: string;
};

export const MarqueeText = memo(function MarqueeText({ as = "span", className = "", text }: MarqueeTextProps) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const textElement = textRef.current;

    if (!viewport || !textElement) {
      return undefined;
    }

    const updateOverflow = () => {
      const nextValue = viewport.clientWidth > 0 && textElement.scrollWidth > viewport.clientWidth + 1;
      setIsScrolling((currentValue) => currentValue === nextValue ? currentValue : nextValue);
    };

    updateOverflow();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(viewport);
    observer.observe(textElement);

    return () => observer.disconnect();
  }, [text]);

  return renderTextTag(
    as,
    ["marquee-text", isScrolling ? "is-scrolling" : "", className].filter(Boolean).join(" "),
    text,
    <span className="marquee-text-viewport" ref={viewportRef}>
      <span className="marquee-text-track">
        <span className="marquee-text-copy" ref={textRef}>{text}</span>
        {isScrolling ? <span className="marquee-text-copy" aria-hidden="true">{text}</span> : null}
      </span>
    </span>,
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

  if (tag === "small") {
    return <small className={className} title={title}>{content}</small>;
  }

  return <span className={className} title={title}>{content}</span>;
}
