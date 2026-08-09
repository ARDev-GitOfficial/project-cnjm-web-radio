import { Megaphone } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import { usePublicAds } from "../hooks/usePublicAds";
import {
  AD_BANNER_HEIGHT,
  AD_BANNER_WIDTH,
  optimizedAdImageUrl,
  sendAdStat,
  type SiteAd,
} from "../lib/ads";

export function AdSlot({ compact = false }: { compact?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pauseRef = useRef(false);
  const directionRef = useRef(1);
  const impressionsRef = useRef(new Set<string>());
  const selectDisplayAds = useCallback((ad: SiteAd) => ad.placement !== "sponsor", []);
  const { ads } = usePublicAds(selectDisplayAds);

  useEffect(() => {
    for (const ad of ads) {
      if (impressionsRef.current.has(ad.id)) continue;
      impressionsRef.current.add(ad.id);
      void sendAdStat(ad.id, "impressions");
    }
  }, [ads]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || ads.length <= 1) return undefined;

    let animation: number | null = null;
    let last = performance.now();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    let isReducedMotion = motionQuery.matches;
    let isCoarsePointer = coarseQuery.matches;
    const updateMotionPreferences = () => {
      isReducedMotion = motionQuery.matches;
      isCoarsePointer = coarseQuery.matches;
    };

    const requestFrame = () => {
      if (animation !== null) return;
      animation = window.requestAnimationFrame(animate);
    };

    const handleVisibility = () => {
      last = performance.now();
      if (!document.hidden) requestFrame();
    };

    const animate = (now: number) => {
      animation = null;
      if (document.hidden) return;

      const delta = Math.min(48, now - last);
      last = now;
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;

      if (!isReducedMotion && !pauseRef.current && maxScroll > 2) {
        const speed = isCoarsePointer ? 0.012 : 0.022;
        const next = scroller.scrollLeft + directionRef.current * delta * speed;
        if (next >= maxScroll) directionRef.current = -1;
        if (next <= 0) directionRef.current = 1;
        scroller.scrollLeft = Math.max(0, Math.min(maxScroll, next));
      }

      requestFrame();
    };

    motionQuery.addEventListener("change", updateMotionPreferences);
    coarseQuery.addEventListener("change", updateMotionPreferences);
    document.addEventListener("visibilitychange", handleVisibility);
    requestFrame();
    return () => {
      if (animation !== null) window.cancelAnimationFrame(animation);
      motionQuery.removeEventListener("change", updateMotionPreferences);
      coarseQuery.removeEventListener("change", updateMotionPreferences);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ads.length]);

  if (!ads.length) return null;

  return (
    <aside className={["ad-slot", compact ? "is-compact" : ""].filter(Boolean).join(" ")}>
      <div
        ref={scrollerRef}
        className="ad-carousel"
        aria-label="Anúncios publicitários"
        onPointerDown={() => {
          pauseRef.current = true;
        }}
        onPointerUp={() => {
          pauseRef.current = false;
        }}
        onPointerCancel={() => {
          pauseRef.current = false;
        }}
        onMouseEnter={() => {
          pauseRef.current = true;
        }}
        onMouseLeave={() => {
          pauseRef.current = false;
        }}
      >
        {ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} compact={compact} />
        ))}
      </div>
    </aside>
  );
}

const AdCard = memo(function AdCard({ ad, compact }: { ad: SiteAd; compact: boolean }) {
  const imageWidth = compact ? 760 : AD_BANNER_WIDTH;
  const imageHeight = compact ? 202 : AD_BANNER_HEIGHT;
  const content = (
    <>
      {ad.imageUrl ? (
        <img
          className="ad-banner-image"
          src={optimizedAdImageUrl(ad.imageUrl, imageWidth, imageHeight)}
          alt={ad.title || "Anúncio publicitário"}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <span className="ad-mark">
          <Megaphone size={22} />
        </span>
      )}
      <div className="ad-copy">
        <span>Publicidade</span>
        <strong>{ad.title || "Anuncie aqui"}</strong>
        <p>{ad.description || "Apoio cultural da Web Rádio Conexão Jamaica."}</p>
        {ad.linkUrl ? <small>{ad.buttonLabel || "Abrir anúncio"}</small> : null}
      </div>
    </>
  );

  if (ad.linkUrl) {
    return (
      <a
        className="ad-carousel-card has-link"
        href={ad.linkUrl}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          void sendAdStat(ad.id, "clicks");
        }}
      >
        {content}
      </a>
    );
  }

  return <article className="ad-carousel-card">{content}</article>;
});
