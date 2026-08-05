import { Megaphone } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import {
  getVisibleAds,
  loadAdSettings,
  loadAds,
  updateAdStats,
  type SiteAd,
} from "../lib/ads";

function readPublicAds() {
  return getVisibleAds(loadAds(), loadAdSettings());
}

function publicAdSignature(ads: SiteAd[]) {
  return ads
    .map((ad) =>
      [
        ad.id,
        ad.title,
        ad.description,
        ad.imageUrl,
        ad.linkUrl,
        ad.buttonLabel,
        ad.section,
        ad.active ? "1" : "0",
      ].join("\u001f"),
    )
    .join("\u001e");
}

function usePublicAds() {
  const [ads, setAds] = useState<SiteAd[]>(readPublicAds);
  const signatureRef = useRef("");

  useEffect(() => {
    signatureRef.current = publicAdSignature(ads);

    const reload = () => {
      const nextAds = readPublicAds();
      const nextSignature = publicAdSignature(nextAds);
      if (nextSignature === signatureRef.current) return;

      signatureRef.current = nextSignature;
      setAds(nextAds);
    };

    const reloadWhenVisible = () => {
      if (!document.hidden) reload();
    };
    reload();
    window.addEventListener("storage", reload);
    window.addEventListener("cnjm-ads-updated", reload);
    document.addEventListener("visibilitychange", reloadWhenVisible);
    const timer = window.setInterval(reloadWhenVisible, 60_000);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("cnjm-ads-updated", reload);
      document.removeEventListener("visibilitychange", reloadWhenVisible);
      window.clearInterval(timer);
    };
  }, []);

  return ads;
}

export function AdSlot({ compact = false }: { compact?: boolean }) {
  const ads = usePublicAds();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pauseRef = useRef(false);
  const directionRef = useRef(1);
  const impressionsRef = useRef(new Set<string>());

  useEffect(() => {
    for (const ad of ads) {
      if (impressionsRef.current.has(ad.id)) continue;
      impressionsRef.current.add(ad.id);
      updateAdStats(ad.id, "impressions");
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
          <AdCard key={ad.id} ad={ad} />
        ))}
      </div>
    </aside>
  );
}

const AdCard = memo(function AdCard({ ad }: { ad: SiteAd }) {
  const content = (
    <>
      {ad.imageUrl ? (
        <img src={ad.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} />
      ) : (
        <span className="ad-mark"><Megaphone size={22} /></span>
      )}
      <div>
        <span>Publicidade</span>
        <strong>{ad.title}</strong>
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
        onClick={() => updateAdStats(ad.id, "clicks")}
      >
        {content}
      </a>
    );
  }

  return <article className="ad-carousel-card">{content}</article>;
});
