import { useCallback, useEffect, useRef, useState } from 'react';

export type FaceMetrics = {
  engagementEstimate: number;
  centerPresent: boolean;
};

export function useFaceAnalysis(active: boolean, cameraOn: boolean, videoRef: React.RefObject<HTMLVideoElement>) {
  const [metrics, setMetrics] = useState<FaceMetrics>({ engagementEstimate: 0, centerPresent: false });
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const brightnessHistoryRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (!active || !cameraOn) {
      stop();
      if (!active) setMetrics({ engagementEstimate: 0, centerPresent: false });
      return;
    }

    let mounted = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { setError('캔버스 분석을 시작할 수 없어요'); return; }
    const sampleSize = 64;
    canvas.width = sampleSize;
    canvas.height = sampleSize;

    let focusAccum = 0;
    let frameCount = 0;
    let lastCenterBright = 0;

    const tick = () => {
      const video = videoRef.current;
      if (!mounted || !video || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
      try {
        ctx.drawImage(video, 0, 0, sampleSize, sampleSize);
        const frame = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const data = frame.data;
        let totalLum = 0, centerLum = 0, edgeLum = 0, brightPixels = 0;
        const cx = sampleSize / 2, cy = sampleSize / 2;
        for (let y = 0; y < sampleSize; y++) {
          for (let x = 0; x < sampleSize; x++) {
            const idx = (y * sampleSize + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            totalLum += lum;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < sampleSize * 0.25) centerLum += lum; else edgeLum += lum;
            if (lum > 70) brightPixels++;
          }
        }
        const avgLum = totalLum / (sampleSize * sampleSize);
        const centerAvg = centerLum / (Math.PI * (sampleSize * 0.25) ** 2);
        const edgeAvg = edgeLum / (sampleSize * sampleSize - Math.PI * (sampleSize * 0.25) ** 2);
        brightnessHistoryRef.current.push(avgLum);
        if (brightnessHistoryRef.current.length > 30) brightnessHistoryRef.current.shift();
        const centerShift = Math.abs(centerAvg - lastCenterBright);
        lastCenterBright = centerAvg;
        const centerPresent = avgLum > 35 && brightPixels / (sampleSize * sampleSize) > 0.25;
        const centerDominance = centerAvg > edgeAvg * 1.05;
        const stableBrightness = centerShift < 25;
        if (centerPresent) { frameCount++; if (centerDominance && stableBrightness) focusAccum = Math.min(frameCount, focusAccum + 1); } else { frameCount = Math.max(0, frameCount - 1); }
        const focusRatio = frameCount > 0 ? Math.round((focusAccum / frameCount) * 100) : 0;
        setMetrics({ engagementEstimate: centerPresent ? Math.max(35, Math.min(98, focusRatio)) : 0, centerPresent });
      } catch { /* video not ready */ }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    setError(null);
    return () => { mounted = false; stop(); };
  }, [active, cameraOn, videoRef, stop]);

  return { metrics, error };
}
