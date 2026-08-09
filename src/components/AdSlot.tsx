import { RadioInlineAdCarousel } from "./RadioInlineAdCarousel";

export function AdSlot({ compact = false }: { compact?: boolean }) {
  return <RadioInlineAdCarousel className={compact ? "route-inline-ad is-compact" : "route-inline-ad"} />;
}
