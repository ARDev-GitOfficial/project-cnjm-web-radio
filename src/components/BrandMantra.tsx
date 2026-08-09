export const BRAND_MANTRA = "Reggae em todas as vertentes!";

type BrandMantraProps = {
  className?: string;
};

export function BrandMantra({ className = "" }: BrandMantraProps) {
  return (
    <span className={["brand-mantra", className].filter(Boolean).join(" ")}>
      {BRAND_MANTRA}
    </span>
  );
}
