import { memo, useEffect, useRef, useState, type ReactNode } from "react";

type MarqueeTag = "span" | "strong" | "h1" | "p";

type MarqueeTextProps = {
  as?: MarqueeTag;
  className?: string;
  text: string;
};

export const MarqueeText = memo(function MarqueeText({ as = "span", className = "", text }: MarqueeTextProps) {
  const textRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const classNames = ["marquee-text", isOverflowing ? "is-scrolling" : "", className].filter(Boolean).join(" ");
  const content = (
    <span className="marquee-text-track">
      <span ref={labelRef}>{text}</span>
      {isOverflowing ? <span aria-hidden="true">{text}</span> : null}
    </span>
  );

  useEffect(() => {
    const element = textRef.current;
    const label = labelRef.current;
    if (!element || !label) return undefined;

    const measure = () => {
      const nextIsOverflowing = label.scrollWidth > element.clientWidth + 2;
      setIsOverflowing((current) => (current === nextIsOverflowing ? current : nextIsOverflowing));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  const sharedProps = {
    className: classNames,
    ref: textRef,
    title: text,
  };

  return renderMarqueeTag(as, sharedProps, content);
});

function renderMarqueeTag(
  tag: MarqueeTag,
  props: {
    className: string;
    ref: React.RefObject<HTMLElement | null>;
    title: string;
  },
  content: ReactNode,
) {
  if (tag === "h1") {
    return (
      <h1 className={props.className} ref={props.ref as React.RefObject<HTMLHeadingElement | null>} title={props.title}>
        {content}
      </h1>
    );
  }

  if (tag === "p") {
    return (
      <p className={props.className} ref={props.ref as React.RefObject<HTMLParagraphElement | null>} title={props.title}>
        {content}
      </p>
    );
  }

  if (tag === "strong") {
    return (
      <strong className={props.className} ref={props.ref as React.RefObject<HTMLElement | null>} title={props.title}>
        {content}
      </strong>
    );
  }

  return (
    <span className={props.className} ref={props.ref as React.RefObject<HTMLSpanElement | null>} title={props.title}>
      {content}
    </span>
  );
}
