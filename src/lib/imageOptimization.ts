type ImageOptions = {
  width: number;
  height?: number;
  quality?: number;
};

function canUseNetlifyImageCdn() {
  if (typeof window === "undefined") return false;

  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

export function optimizedStaticImageUrl(src: string, options: ImageOptions) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:") || !canUseNetlifyImageCdn()) return src;

  const sourceUrl = src.startsWith("http://") || src.startsWith("https://") ? src : new URL(src, window.location.origin).href;
  const params = new URLSearchParams({
    url: sourceUrl,
    w: String(options.width),
    fm: "webp",
    q: String(options.quality ?? 82),
  });

  if (options.height) {
    params.set("h", String(options.height));
    params.set("fit", "cover");
  }

  return `/.netlify/images?${params.toString()}`;
}

export function installOptimizedBackgroundImages() {
  if (typeof document === "undefined" || !canUseNetlifyImageCdn()) return;

  const root = document.documentElement;
  root.style.setProperty(
    "--desktop-background-image",
    `url("${optimizedStaticImageUrl("/assets/bg-cnjm.webp", { width: 1600, quality: 76 })}")`,
  );
  root.style.setProperty(
    "--mobile-background-image",
    `url("${optimizedStaticImageUrl("/assets/glass_ref_background.webp", { width: 920, quality: 74 })}")`,
  );
}
