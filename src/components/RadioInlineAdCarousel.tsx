import { ChevronLeft, ChevronRight } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicAds } from "../hooks/usePublicAds";
import {
  AD_BANNER_HEIGHT,
  AD_BANNER_WIDTH,
  MAX_ADS,
  optimizedAdImageUrl,
  sendAdStat,
  type SiteAd,
} from "../lib/ads";

const AUTO_ROTATE_MS = 6500;
const USER_PAUSE_MS = 9000;

const selectRadioAds = (ad: SiteAd) => Boolean(ad.imageUrl);

export function RadioInlineAdCarousel({ className = "", label = "Publicidade" }: { className?: string; label?: string }) {
  const { ads } = usePublicAds(selectRadioAds);
  const radioAds = useMemo(() => ads.slice(0, MAX_ADS), [ads]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pauseUntilRef = useRef(0);
  const scrollTimerRef = useRef<number | null>(null);

  const pauseAutoRotation = useCallback(() => {
    pauseUntilRef.current = Date.now() + USER_PAUSE_MS;
  }, []);

  const goToAd = useCallback((index: number) => {
    if (!radioAds.length) return;
    pauseAutoRotation();
    setActiveIndex((index + radioAds.length) % radioAds.length);
  }, [pauseAutoRotation, radioAds.length]);

  const updateActiveFromScroll = useCallback(() => {
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
    const scroller = scrollerRef.current;
    if (!scroller || radioAds.length <= 1) return;

    const center = scroller.scrollLeft + scroller.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(scroller.children).forEach((child, index) => {
      const element = child as HTMLElement;
      const childCenter = element.offsetLeft + element.offsetWidth / 2;
      const distance = Math.abs(childCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

      setActiveIndex(closestIndex);
    }, 80);
  }, [radioAds.length]);

  useEffect(() => {
    if (!radioAds.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= radioAds.length) setActiveIndex(0);
  }, [activeIndex, radioAds.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const slide = scroller?.children[activeIndex] as HTMLElement | undefined;
    if (!slide) return;

    slide.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (radioAds.length <= 1) return undefined;

    const interval = window.setInterval(() => {
      if (document.hidden || Date.now() < pauseUntilRef.current) return;
      setActiveIndex((current) => (current + 1) % radioAds.length);
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(interval);
  }, [radioAds.length]);

  if (!radioAds.length) return null;

  const hasControls = radioAds.length > 1;
  const showDots = radioAds.length <= 12;

  return (
    <aside className={["radio-inline-ad-card", className].filter(Boolean).join(" ")} aria-label={label}>
      <div
        ref={scrollerRef}
        className="radio-inline-ad-viewport"
        onScroll={updateActiveFromScroll}
        onPointerDown={pauseAutoRotation}
      >
        {radioAds.map((ad, index) => (
          <RadioInlineAd key={ad.id} ad={ad} isActive={index === activeIndex} />
        ))}
      </div>

      <span className="radio-inline-ad-label">{label}</span>

      {hasControls ? (
        <>
          <button
            className="radio-inline-ad-arrow is-prev"
            type="button"
            aria-label="Anúncio anterior"
            onClick={() => goToAd(activeIndex - 1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            className="radio-inline-ad-arrow is-next"
            type="button"
            aria-label="Próximo anúncio"
            onClick={() => goToAd(activeIndex + 1)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          {showDots ? (
            <div className="radio-inline-ad-dots" aria-label={`${activeIndex + 1} de ${radioAds.length}`}>
              {radioAds.map((ad, index) => (
                <button
                  key={ad.id}
                  type="button"
                  className={index === activeIndex ? "is-active" : ""}
                  aria-label={`Ver anúncio ${index + 1}`}
                  onClick={() => goToAd(index)}
                />
              ))}
            </div>
          ) : (
            <span className="radio-inline-ad-count">{activeIndex + 1}/{radioAds.length}</span>
          )}
        </>
      ) : null}
    </aside>
  );
}

const RadioInlineAd = memo(function RadioInlineAd({ ad, isActive }: { ad: SiteAd; isActive: boolean }) {
  const image = (
    <img
      src={optimizedAdImageUrl(ad.imageUrl, AD_BANNER_WIDTH, AD_BANNER_HEIGHT)}
      alt={ad.title || "Anúncio publicitário"}
      loading={isActive ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );

  if (!ad.linkUrl) {
    return <article className="radio-inline-ad-slide">{image}</article>;
  }

  return (
    <a
      className="radio-inline-ad-slide has-link"
      href={ad.linkUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        void sendAdStat(ad.id, "clicks");
      }}
    >
      {image}
    </a>
  );
});
