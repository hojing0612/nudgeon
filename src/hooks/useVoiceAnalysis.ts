import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceMetrics = {
  wpm: number;
  stabilityEstimate: number;
  volume: number;
  isActive: boolean;
};

const SILENCE_THRESHOLD = 0.012;

export function useVoiceAnalysis(active: boolean, micOn: boolean) {
  const [metrics, setMetrics] = useState<VoiceMetrics>({ wpm: 0, stabilityEstimate: 0, volume: 0, isActive: false });
  const [error, setError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const syllableCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const volumeHistoryRef = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);
  const lastVoiceTimeRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') { audioCtxRef.current.close().catch(() => {}); }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    if (!active || !micOn) { stop(); if (!active) setMetrics({ wpm: 0, stabilityEstimate: 0, volume: 0, isActive: false }); return; }
    let mounted = true;
    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        analyserRef.current = analyser;
        startTimeRef.current = performance.now();
        syllableCountRef.current = 0;
        volumeHistoryRef.current = [];
        pitchHistoryRef.current = [];
        const timeData = new Float32Array(analyser.fftSize);
        let lastSyllableTime = 0;
        const tick = () => {
          if (!analyserRef.current || !audioCtxRef.current) return;
          analyserRef.current.getFloatTimeDomainData(timeData);
          let sum = 0, zeroCrossings = 0;
          for (let i = 0; i < timeData.length; i++) { sum += timeData[i] * timeData[i]; if (i > 0 && timeData[i - 1] * timeData[i] < 0) zeroCrossings++; }
          const rms = Math.sqrt(sum / timeData.length);
          const volume = Math.min(1, rms * 3);
          const pitch = (zeroCrossings / 2) * (audioCtxRef.current.sampleRate / timeData.length);
          if (rms > SILENCE_THRESHOLD) { lastVoiceTimeRef.current = performance.now(); const now = performance.now(); if (now - lastSyllableTime > 220) { syllableCountRef.current += 1; lastSyllableTime = now; } }
          volumeHistoryRef.current.push(volume); if (volumeHistoryRef.current.length > 60) volumeHistoryRef.current.shift();
          if (rms > SILENCE_THRESHOLD && pitch > 60) { pitchHistoryRef.current.push(pitch); if (pitchHistoryRef.current.length > 40) pitchHistoryRef.current.shift(); }
          const elapsedSec = Math.max(1, (performance.now() - startTimeRef.current) / 1000);
          const wpm = Math.round((syllableCountRef.current / elapsedSec) * 60 * 1.6);
          let stabilityEstimate = 50;
          if (pitchHistoryRef.current.length > 5) { const mean = pitchHistoryRef.current.reduce((a, b) => a + b, 0) / pitchHistoryRef.current.length; const variance = pitchHistoryRef.current.reduce((a, b) => a + (b - mean) ** 2, 0) / pitchHistoryRef.current.length; const cv = Math.sqrt(variance) / mean; stabilityEstimate = Math.max(10, Math.min(100, Math.round(100 - cv * 100))); }
          const avgVolume = volumeHistoryRef.current.reduce((a, b) => a + b, 0) / volumeHistoryRef.current.length;
          const isSpeaking = performance.now() - lastVoiceTimeRef.current < 1500;
          setMetrics({ wpm: Math.min(220, wpm), stabilityEstimate, volume: Math.round(avgVolume * 100), isActive: isSpeaking });
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        setError(null);
      } catch { setError('마이크에 접근할 수 없어요. 텍스트로 대화를 계속할 수 있어요.'); }
    };
    setup();
    return () => { mounted = false; stop(); };
  }, [active, micOn, stop]);

  return { metrics, error };
}
