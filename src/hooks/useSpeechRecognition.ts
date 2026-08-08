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
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function useSpeechRecognition(active: boolean) {
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTextRef = useRef('');

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      if (!active) {
        setTranscript('');
        finalTextRef.current = '';
      }
      return;
    }

    const SR =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SR) return;

    const recognition = new SR() as unknown as SpeechRecognitionInstance;
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

    recognition.onend = () => {
      // Auto-restart if still active (recognition stops after silence)
    };

    recognition.start();
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [active, stop]);

  const reset = useCallback(() => {
    finalTextRef.current = '';
    setTranscript('');
  }, []);

  return { transcript, reset, stop };
}
