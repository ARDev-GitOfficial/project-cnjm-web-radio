import { memo } from "react";
import { optimizedStaticImageUrl } from "../lib/imageOptimization";

export const TapeRig = memo(function TapeRig({ isPlaying }: { isPlaying: boolean }) {
  const vinylSrc = optimizedStaticImageUrl("/assets/glass-ref-vinyl.png", { width: 900, height: 900, quality: 84 });
  const reelSrc = optimizedStaticImageUrl("/assets/glass-ref-bobina.png", { width: 360, height: 360, quality: 84 });
  const cassetteSrc = optimizedStaticImageUrl("/assets/glass-ref-fita.png", { width: 980, quality: 84 });

  return (
    <div className={isPlaying ? "tape-rig is-playing" : "tape-rig"} aria-hidden="true">
      <img className="rig-vinyl" src={vinylSrc} alt="" loading="eager" decoding="async" draggable={false} />
      <div className="rig-deck">
        <img className="rig-reel rig-reel-left" src={reelSrc} alt="" loading="eager" decoding="async" draggable={false} />
        <img className="rig-reel rig-reel-right" src={reelSrc} alt="" loading="eager" decoding="async" draggable={false} />
        <img className="rig-cassette" src={cassetteSrc} alt="" loading="eager" decoding="async" draggable={false} />
      </div>
    </div>
  );
});
