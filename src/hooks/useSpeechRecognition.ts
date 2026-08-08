import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type SRConstructor = new () => SpeechRecognitionInstance;

function getSRConstructor(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSRConstructor() !== null;
}

export function useSpeechRecognition(active: boolean) {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTextRef = useRef('');
  const shouldListenRef = useRef(false);
  const restartCountRef = useRef(0);
  const supportedRef = useRef<boolean>(isSpeechRecognitionSupported());

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const SR = getSRConstructor();
    if (!SR) {
      setError('이 브라우저에서는 음성 입력을 지원하지 않아요. 텍스트로 입력해 주세요.');
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
    }

    shouldListenRef.current = true;
    restartCountRef.current = 0;
    setError(null);

    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTextRef.current += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalTextRef.current + interim);
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        setError('마이크 권한이 거부되었어요. 텍스트로 입력해 주세요.');
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (shouldListenRef.current && restartCountRef.current < 5) {
        restartCountRef.current += 1;
        try {
          recognition.start();
          setIsListening(true);
        } catch {
          shouldListenRef.current = false;
        }
      } else if (shouldListenRef.current) {
        shouldListenRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError('음성 인식을 시작할 수 없어요. 텍스트로 입력해 주세요.');
      shouldListenRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      setTranscript('');
      finalTextRef.current = '';
    }
  }, [active, stop]);

  const reset = useCallback(() => {
    finalTextRef.current = '';
    setTranscript('');
  }, []);

  return {
    transcript,
    isListening,
    error,
    supported: supportedRef.current,
    start,
    stop,
    reset,
  };
}
