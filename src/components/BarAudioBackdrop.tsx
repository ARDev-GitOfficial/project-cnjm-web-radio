import { useEffect, useRef } from "react";

type BarAudioBackdropProps = {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
};

function average(values: Uint8Array, start: number, end: number) {
  let total = 0;
  const safeEnd = Math.min(values.length, end);
  for (let index = start; index < safeEnd; index += 1) total += values[index] ?? 0;
  return total / Math.max(1, safeEnd - start) / 255;
}

const DESKTOP_CANVAS_PIXEL_BUDGET = 1_120_000;
const TOUCH_CANVAS_PIXEL_BUDGET = 680_000;

export function BarAudioBackdrop({ analyser, isPlaying }: BarAudioBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(analyser);
  const playingRef = useRef(isPlaying);

  useEffect(() => {
    analyserRef.current = analyser;
    playingRef.current = isPlaying;
  }, [analyser, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true, desynchronized: true });
    if (!canvas || !context) return undefined;

    let animationId: number | null = null;
    let resizeFrameId: number | null = null;
    let lastFrameTime = 0;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    let isHidden = document.hidden;
    let isCanvasVisible = true;
    let isReducedMotion = motionQuery.matches;
    let isCoarsePointer = coarseQuery.matches;
    let targetFps = isReducedMotion ? 30 : 60;
    let overloadFrames = 0;
    let recoveryFrames = 0;
    let viewportWidth = 1;
    let viewportHeight = 1;
    let barGradient: CanvasGradient | null = null;
    let reflectionGradient: CanvasGradient | null = null;
    let gradientKey = "";

    let bins = new Uint8Array(64);
    const syntheticBins = new Uint8Array(48);
    let easedBars = new Float32Array(112);
    let bassEnvelope = 0;
    let guitarEnvelope = 0;
    const startTime = performance.now();
    const loopMs = 36000;

    const targetFrameInterval = () => 1000 / targetFps;

    const resetAdaptiveRate = () => {
      targetFps = isReducedMotion ? 30 : 60;
      overloadFrames = 0;
      recoveryFrames = 0;
    };

    const updateAdaptiveRate = (renderCost: number, deltaTime: number) => {
      if (isReducedMotion) {
        resetAdaptiveRate();
        return;
      }

      if (targetFps === 60) {
        const isOverloaded = renderCost > 13 || deltaTime > 25;
        overloadFrames = isOverloaded ? overloadFrames + 1 : Math.max(0, overloadFrames - 1);
        if (overloadFrames >= 10) {
          targetFps = 30;
          overloadFrames = 0;
          recoveryFrames = 0;
        }
        return;
      }

      recoveryFrames = renderCost < 10 ? recoveryFrames + 1 : 0;
      if (recoveryFrames >= 120) {
        targetFps = 60;
        overloadFrames = 0;
        recoveryFrames = 0;
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      viewportWidth = Math.max(1, rect.width);
      viewportHeight = Math.max(1, rect.height);
      const maxPixelRatio = isReducedMotion ? 1 : isCoarsePointer ? 1 : 1.1;
      const pixelBudget = isCoarsePointer ? TOUCH_CANVAS_PIXEL_BUDGET : DESKTOP_CANVAS_PIXEL_BUDGET;
      const areaRatio = Math.sqrt(pixelBudget / Math.max(1, viewportWidth * viewportHeight));
      const minPixelRatio = viewportWidth > 2600 ? 0.48 : viewportWidth > 1800 ? 0.65 : 0.78;
      const pixelRatio = Math.max(minPixelRatio, Math.min(window.devicePixelRatio || 1, maxPixelRatio, areaRatio));
      canvas.width = Math.max(1, Math.floor(viewportWidth * pixelRatio));
      canvas.height = Math.max(1, Math.floor(viewportHeight * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      gradientKey = "";
      reflectionGradient = null;
    };

    const requestResize = () => {
      if (resizeFrameId !== null) return;
      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = null;
        resize();
      });
    };

    const updateMotionPreferences = () => {
      isReducedMotion = motionQuery.matches;
      isCoarsePointer = coarseQuery.matches;
      resetAdaptiveRate();
      resize();
    };

    const updateVisibility = () => {
      isHidden = document.hidden;
      lastFrameTime = performance.now();
      if (!isHidden && isCanvasVisible) requestFrame();
    };

    const requestFrame = () => {
      if (animationId !== null || isHidden || !isCanvasVisible) return;
      animationId = window.requestAnimationFrame(render);
    };

    const render = (time: number) => {
      animationId = null;

      if (isHidden || !isCanvasVisible) {
        return;
      }

      const deltaTime = time - lastFrameTime;
      const frameInterval = targetFrameInterval();
      if (deltaTime < frameInterval) {
        requestFrame();
        return;
      }
      lastFrameTime = time - (deltaTime % frameInterval);
      const renderStart = performance.now();

      const width = viewportWidth;
      const height = viewportHeight;
      if (width <= 0 || height <= 0) {
        requestFrame();
        return;
      }

      const analyserNode = analyserRef.current;
      const loop = ((time - startTime) % loopMs) / loopMs;
      const loopAngle = loop * Math.PI * 2;

      if (analyserNode) {
        if (bins.length !== analyserNode.frequencyBinCount) bins = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(bins);
      } else {
        for (let index = 0; index < syntheticBins.length; index += 1) {
          const wave = Math.sin(loopAngle * 3 + index * 0.32) * 0.5 + 0.5;
          const pulse = Math.sin(loopAngle + index * 0.09) * 0.5 + 0.5;
          syntheticBins[index] = Math.round((wave * 0.45 + pulse * 0.22 + 0.18) * 255);
        }
        bins = syntheticBins;
      }

      const bass = average(bins, 0, Math.floor(bins.length * 0.22));
      const mid = average(bins, Math.floor(bins.length * 0.22), Math.floor(bins.length * 0.62));
      const high = average(bins, Math.floor(bins.length * 0.62), bins.length);
      const lowMid = average(bins, Math.floor(bins.length * 0.24), Math.floor(bins.length * 0.46));
      const guitarRange = average(bins, Math.floor(bins.length * 0.34), Math.floor(bins.length * 0.76));
      const bassRise = Math.max(0, bass - bassEnvelope);
      const guitarRise = Math.max(0, guitarRange - guitarEnvelope);
      bassEnvelope += (bass - bassEnvelope) * 0.16;
      guitarEnvelope += (guitarRange - guitarEnvelope) * 0.18;
      const kick = playingRef.current ? Math.min(1, bass * 0.82 + bassRise * 3.4) : 0.2;
      const guitar = playingRef.current ? Math.min(1, guitarRange * 0.76 + lowMid * 0.34 + guitarRise * 2.6) : 0.24;
      const beat = playingRef.current ? Math.min(1, kick * 0.62 + mid * 0.28 + high * 0.12) : 0.16;
      const preferredPitch = isReducedMotion ? (width < 560 ? 24 : 26) : width < 560 ? 16 : width < 920 ? 18 : 20;
      const minBarWidth = width < 560 ? 4 : width < 920 ? 5 : 6;
      const maxBars = isReducedMotion ? 32 : isCoarsePointer ? 38 : 48;
      const barCount = Math.max(20, Math.min(maxBars, Math.floor(width / preferredPitch)));
      if (easedBars.length !== barCount) easedBars = new Float32Array(barCount);
      const pitch = width / barCount;
      const gap = Math.max(2, Math.min(4, pitch * 0.15));
      const barWidth = Math.max(minBarWidth, pitch - gap);
      const totalBarWidth = barCount * barWidth + (barCount - 1) * gap;
      const startX = Math.max(0, (width - totalBarWidth) / 2);
      const baselineY = height * 0.68;

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";

      const nextGradientKey = `${Math.round(width)}:${Math.round(height)}:${Math.round(baselineY)}`;
      if (!barGradient || gradientKey !== nextGradientKey) {
        gradientKey = nextGradientKey;
        barGradient = context.createLinearGradient(0, baselineY - height * 0.54, 0, baselineY + height * 0.1);
        barGradient.addColorStop(0, "rgba(47, 232, 138, 0.68)");
        barGradient.addColorStop(0.52, "rgba(243, 203, 79, 0.56)");
        barGradient.addColorStop(1, "rgba(255, 247, 201, 0.14)");

        reflectionGradient = context.createLinearGradient(0, baselineY, 0, height);
        reflectionGradient.addColorStop(0, "rgba(255, 247, 201, 0.18)");
        reflectionGradient.addColorStop(0.24, "rgba(243, 203, 79, 0.12)");
        reflectionGradient.addColorStop(0.58, "rgba(47, 232, 138, 0.06)");
        reflectionGradient.addColorStop(1, "rgba(47, 232, 138, 0)");
      }

      const reflectionGap = Math.max(3, Math.min(9, height * 0.008));
      const reflectionLimit = Math.max(0, height - baselineY - reflectionGap);

      for (let index = 0; index < barCount; index += 1) {
        const bin = bins[Math.floor(index / barCount * bins.length)] ?? 0;
        const normalized = bin / 255;
        const position = barCount <= 1 ? 0.5 : index / (barCount - 1);
        const fromCenter = Math.abs(position - 0.5) * 2;
        const sideWeight = Math.pow(fromCenter, 1.55);
        const centerWeight = Math.pow(1 - fromCenter, 1.4);
        const phase = Math.sin(loopAngle * 2 + index * 0.22) * 0.5 + 0.5;
        const slowWave = Math.sin(loopAngle + index * 0.055) * 0.5 + 0.5;
        const sidePulse = sideWeight * (kick * 0.52 + bass * 0.28);
        const guitarPulse = centerWeight * (guitar * 0.54 + mid * 0.22 + high * 0.1);
        const localAudio = normalized * (0.38 + centerWeight * 0.16 + sideWeight * 0.1);
        const target = Math.max(
          0.1,
          Math.min(1.12, localAudio + sidePulse + guitarPulse + phase * 0.07 + slowWave * 0.06 + beat * 0.05),
        );
        const isRising = target > easedBars[index];
        const regionalEnergy = sideWeight * kick + centerWeight * guitar;
        const ease = isReducedMotion
          ? 0.032
          : playingRef.current
            ? (isRising ? 0.084 + regionalEnergy * 0.055 : 0.096 + sideWeight * 0.02)
            : 0.034;
        easedBars[index] += (target - easedBars[index]) * ease;
        const power = Math.max(0.08, easedBars[index]);
        const barHeight = Math.max(28, power * height * 0.48);
        const x = startX + index * (barWidth + gap);
        const y = baselineY - barHeight;

        context.globalAlpha = Math.min(1, 0.48 + power * 0.46);
        context.fillStyle = barGradient;
        roundRect(context, x, y, barWidth, barHeight, Math.min(8, barWidth));
        context.fill();

        const reflectionHeight = Math.min(reflectionLimit, Math.max(12, barHeight * 0.58));
        if (reflectionGradient && reflectionHeight > 2) {
          context.globalAlpha = Math.min(0.34, 0.07 + power * 0.2);
          context.fillStyle = reflectionGradient;
          roundRect(context, x, baselineY + reflectionGap, barWidth, reflectionHeight, Math.min(8, barWidth));
          context.fill();
        }
        context.globalAlpha = 1;
      }

      context.shadowBlur = 0;

      updateAdaptiveRate(performance.now() - renderStart, deltaTime);
      requestFrame();
    };

    resize();
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => {
          isCanvasVisible = Boolean(entry?.isIntersecting);
          if (isCanvasVisible) requestFrame();
        }, { threshold: 0.04 })
      : null;

    observer?.observe(canvas);
    window.addEventListener("resize", requestResize, { passive: true });
    document.addEventListener("visibilitychange", updateVisibility);
    motionQuery.addEventListener("change", updateMotionPreferences);
    coarseQuery.addEventListener("change", updateMotionPreferences);
    lastFrameTime = performance.now();
    requestFrame();

    return () => {
      if (animationId !== null) window.cancelAnimationFrame(animationId);
      if (resizeFrameId !== null) window.cancelAnimationFrame(resizeFrameId);
      observer?.disconnect();
      window.removeEventListener("resize", requestResize);
      document.removeEventListener("visibilitychange", updateVisibility);
      motionQuery.removeEventListener("change", updateMotionPreferences);
      coarseQuery.removeEventListener("change", updateMotionPreferences);
    };
  }, []);

  return <canvas ref={canvasRef} className="bar-backdrop" aria-hidden="true" />;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}
