import { memo } from "react";

export const TapeRig = memo(function TapeRig({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className={isPlaying ? "tape-rig is-playing" : "tape-rig"} aria-hidden="true">
      <span className="rig-light rig-light-green" />
      <span className="rig-light rig-light-gold" />
      <img className="rig-vinyl" src="/assets/glass-ref-vinyl.png" alt="" loading="eager" decoding="async" draggable={false} />
      <div className="rig-deck">
        <img className="rig-reel rig-reel-left" src="/assets/glass-ref-bobina.png" alt="" loading="eager" decoding="async" draggable={false} />
        <img className="rig-reel rig-reel-right" src="/assets/glass-ref-bobina.png" alt="" loading="eager" decoding="async" draggable={false} />
        <img className="rig-cassette" src="/assets/glass-ref-fita.png" alt="" loading="eager" decoding="async" draggable={false} />
      </div>
    </div>
  );
});
