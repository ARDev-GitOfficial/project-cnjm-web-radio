import { memo, useEffect, useRef } from "react";
import { optimizedStaticImageUrl } from "../lib/imageOptimization";

export const TapeRig = memo(function TapeRig({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const rigRef = useRef<HTMLDivElement | null>(null);
  const vinylSrc = optimizedStaticImageUrl("/assets/glass-ref-vinyl.png", { width: 900, height: 900, quality: 84 });
  const reelSrc = optimizedStaticImageUrl("/assets/glass-ref-bobina.png", { width: 360, height: 360, quality: 84 });
  const cassetteSrc = optimizedStaticImageUrl("/assets/glass-ref-fita.png", { width: 980, quality: 84 });

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return undefined;

    let animationId = 0;
    let easedBeat = 0.14;
    let fallbackPhase = 0;
    let bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const render = () => {
      let targetBeat = 0.12;
      const motionScale = motionQuery.matches ? 0.42 : 1;

      if (isPlaying && analyser) {
        if (!bins || bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(bins);
        const bassEnd = Math.max(1, Math.floor(bins.length * 0.18));
        let bass = 0;
        for (let index = 0; index < bassEnd; index += 1) bass += bins[index] ?? 0;
        targetBeat = Math.min(1, Math.max(0.1, bass / bassEnd / 255)) * motionScale;
      } else if (isPlaying) {
        fallbackPhase += 0.055;
        targetBeat = (0.24 + (Math.sin(fallbackPhase) * 0.5 + 0.5) * 0.3) * motionScale;
      }

      easedBeat += (targetBeat - easedBeat) * 0.12;
      rig.style.setProperty("--rig-beat", easedBeat.toFixed(3));
      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [analyser, isPlaying]);

  return (
    <div ref={rigRef} className={isPlaying ? "tape-rig is-playing" : "tape-rig"} aria-hidden="true">
      <span className="rig-backlight" />
      <img className="rig-vinyl" src={vinylSrc} alt="" loading="eager" decoding="async" draggable={false} />
      <div className="rig-deck">
        <img className="rig-reel rig-reel-left" src={reelSrc} alt="" loading="eager" decoding="async" draggable={false} />
        <img className="rig-reel rig-reel-right" src={reelSrc} alt="" loading="eager" decoding="async" draggable={false} />
        <img className="rig-cassette" src={cassetteSrc} alt="" loading="eager" decoding="async" draggable={false} />
      </div>
    </div>
  );
});
