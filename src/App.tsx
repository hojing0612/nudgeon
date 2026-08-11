import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  Copy,
  Eye,
  HelpCircle,
  Loader2,
  Mic,
  MicOff,
  PenLine,
  Play,
  RotateCcw,
  Save,
  Send,
  Volume2,
} from 'lucide-react';
import { useVoiceAnalysis } from '@/hooks/useVoiceAnalysis';
import { useFaceAnalysis } from '@/hooks/useFaceAnalysis';
import { useKoreanTTS } from '@/hooks/useKoreanTTS';
import { useSpeechRecognition, isSpeechRecognitionSupported } from '@/hooks/useSpeechRecognition';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { SCENARIOS, FALLBACK_EXAMPLES, NEXT_STEPS } from '@/data/opponents';
import type { Scenario, ChatMessage } from '@/data/opponents';
import { OpponentPanel } from '@/components/OpponentPanel';
import { DialogueTranscript } from '@/components/DialogueTranscript';

type Phase = 'idle' | 'prep' | 'speaking' | 'user-turn' | 'post-burden' | 'finished';
type Readiness = 'hard' | 'small' | 'now' | null;
const REHEARSAL_SUMMARY_KEY = 'nudgeon.rehearsal-summary.v1';

type AISafetyCheck = {
  reply: string;
  coach: string;
  isSafety: boolean;
};

function parseAIResponse(text: string): AISafetyCheck {
  const trimmed = text.trim();

  try {
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
      if (parsed.reply && typeof parsed.reply === 'string') {
        return {
          reply: String(parsed.reply).trim(),
          coach: parsed.coach ? String(parsed.coach).trim() : '',
          isSafety: parsed.safety === true,
        };
      }
    }
  } catch { /* fall through to text parsing */ }

  const [replyPart, coachPart] = trimmed.split(/COACH\s*:/);
  return {
    reply: replyPart.trim(),
    coach: coachPart ? coachPart.trim() : '',
    isSafety: false,
  };
}

function buildSystemPrompt(scenario: Scenario): string {
  return `너는 사회적 리허설 상대다. 역할: ${scenario.who}. 상황: ${scenario.title}.

규칙:
- 사용자의 실제 답변에 반응할 것. 매번 불필요한 칭찬을 하지 말 것.
- 현실적이고 따뜻한 1~3문장으로 답할 것.
- 한 번에 질문을 하나만 할 것.
- 사용자를 압박하거나 죄책감을 주지 말 것.
- 위기상황이나 자해·타해 표현이 감지되면 역할극을 계속하지 말고 즉각적인 안전 도움을 권할 것.

출력 형식 (반드시 JSON):
{"reply": "상대방이 할 대화 내용", "coach": "사용자를 위한 짧은 코칭 한 문장", "safety": false}

safety 필드는 자해·타해 표현이 감지되면 true로 설정하고 reply에 안전 도움 안내를 넣을 것.
코칭은 칭찬이 아니라 구체적인 관찰이나 제안이어야 한다.`;
}

async function askAI(messages: ChatMessage[], scenario: Scenario): Promise<AISafetyCheck> {
  const history = messages
    .filter((m) => m.role !== 'coach')
    .map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: history,
      system: buildSystemPrompt(scenario),
    }),
  });

  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  return parseAIResponse(data.text || '');
}

async function askAIForExamples(scenario: Scenario, messages: ChatMessage[]): Promise<{ minimal: string; normal: string; honest: string }> {
  const context = messages.slice(-4).map((m) => `${m.role === 'me' ? '사용자' : '상대'}: ${m.text}`).join('\n');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `상황: ${scenario.title}\n역할: ${scenario.who}\n지금까지 대화:\n${context}\n\n사용자가 무슨 말부터 할지 모르겠다고 했어. 사용자가 선택할 수 있는 답변 예시 3개를 만들어줘.` }],
      system: `너는 사회적 리허설 도우미다. 사용자가 말문이 막혔을 때 선택할 수 있는 답변 예시 3개를 만든다.
3개는 서로 다른 부담 수준이어야 한다:
1. 최소 표현: 한 문장으로 간단하게
2. 보통 표현: 상황을 조금 설명
3. 솔직한 표현: 현재 어려움을 포함

반드시 JSON 형식으로 출력:
{"minimal": "최소 표현 문장", "normal": "보통 표현 문장", "honest": "솔직한 표현 문장"}`,
    }),
  });

  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const text = (data.text || '').trim();

  try {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (parsed.minimal && parsed.normal && parsed.honest) {
        return {
          minimal: String(parsed.minimal).trim(),
          normal: String(parsed.normal).trim(),
          honest: String(parsed.honest).trim(),
        };
      }
    }
  } catch { /* fall through */ }

  return FALLBACK_EXAMPLES[scenario.id] || FALLBACK_EXAMPLES.center;
}

async function askAIForRewrite(scenario: Scenario, userText: string): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `사용자가 작성한 문장: "${userText}"\n상황: ${scenario.title}\n이 문장을 다듬어줘.` }],
      system: `너는 문장 다듬기 도우미다. 사용자의 문장을 다음 기준으로 수정한다:
- 짧고 명확한 표현
- 지나친 자기비난 제거
- 상대방에게 요구하는 행동이 분명한 문장
- 과하게 긍정적이거나 인위적인 표현 금지
- 원래 의미를 바꾸지 않기

JSON 형식으로 출력: {"rewritten": "다듬어진 문장"}`,
    }),
  });

  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const text = (data.text || '').trim();

  try {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (parsed.rewritten) return String(parsed.rewritten).trim();
    }
  } catch { /* fall through */ }

  return userText;
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [currentLine, setCurrentLine] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [inputText, setInputText] = useState('');

  const [burdenBefore, setBurdenBefore] = useState<number | null>(null);
  const [burdenAfter, setBurdenAfter] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<Readiness>(null);
  const [selectedNextStep, setSelectedNextStep] = useState<string | null>(null);

  const [promptHelpCount, setPromptHelpCount] = useState(0);
  const [rewriteCount, setRewriteCount] = useState(0);
  const responseLatenciesRef = useRef<number[]>([]);
  const opponentFinishTimeRef = useRef<number>(0);
  const userStartedRef = useRef(false);

  const [showExamples, setShowExamples] = useState(false);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examples, setExamples] = useState<{ minimal: string; normal: string; honest: string } | null>(null);
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewrittenText, setRewrittenText] = useState('');
  const [originalForRewrite, setOriginalForRewrite] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [consentTranscript, setConsentTranscript] = useState(false);

  const voiceActive = phase === 'user-turn' || phase === 'speaking';
  const { metrics: voiceMetrics, error: voiceError } = useVoiceAnalysis(voiceActive, true);
  const { metrics: faceMetrics, error: faceError } = useFaceAnalysis(voiceActive && cameraOn, cameraOn, videoRef);
  const { speak: speakTTS, stop: stopTTS, isSpeaking: ttsSpeaking } = useKoreanTTS();
  const speechSupported = isSpeechRecognitionSupported();
  const {
    transcript: speechTranscript,
    isListening,
    error: speechError,
    start: startSpeech,
    stop: stopSpeech,
    reset: resetSpeech,
  } = useSpeechRecognition(speechSupported && phase === 'user-turn');

  const wpmAvgRef = useRef<number[]>([]);
  const stabilityAvgRef = useRef<number[]>([]);
  const engagementAvgRef = useRef<number[]>([]);
  const volumeAvgRef = useRef<number[]>([]);

  useEffect(() => {
    if (phase !== 'speaking' && phase !== 'user-turn') return;
    const timer = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const isActive = phase === 'speaking' || phase === 'user-turn';
    if (!isActive) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [phase]);

  useEffect(() => {
    if (!cameraOn || !navigator.mediaDevices?.getUserMedia) return;
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraOn(false));
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOn]);

  useEffect(() => {
    if (phase !== 'speaking' && phase !== 'user-turn') return;
    wpmAvgRef.current.push(voiceMetrics.wpm);
    if (wpmAvgRef.current.length > 120) wpmAvgRef.current.shift();
    stabilityAvgRef.current.push(voiceMetrics.stabilityEstimate);
    if (stabilityAvgRef.current.length > 120) stabilityAvgRef.current.shift();
    if (cameraOn) {
      engagementAvgRef.current.push(faceMetrics.engagementEstimate);
      if (engagementAvgRef.current.length > 120) engagementAvgRef.current.shift();
    }
    volumeAvgRef.current.push(voiceMetrics.volume);
    if (volumeAvgRef.current.length > 120) volumeAvgRef.current.shift();
  }, [voiceMetrics, faceMetrics, phase, cameraOn]);

  useEffect(() => {
    if (speechTranscript) setInputText(speechTranscript);
  }, [speechTranscript]);

  useEffect(() => {
    if (phase === 'user-turn' && opponentFinishTimeRef.current > 0 && !userStartedRef.current) {
      userStartedRef.current = false;
    }
  }, [phase]);

  const avg = (arr: number[]) => (arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length));

  const liveAverages = {
    wpm: avg(wpmAvgRef.current),
    stability: avg(stabilityAvgRef.current),
    engagement: cameraOn ? avg(engagementAvgRef.current) : null,
    volume: avg(volumeAvgRef.current),
  };

  const completedTurns = messages.filter((m) => m.role === 'me').length;
  const avgLatency = responseLatenciesRef.current.length > 0
    ? Math.round(responseLatenciesRef.current.reduce((a, b) => a + b, 0) / responseLatenciesRef.current.length)
    : 0;

  const selectScenario = useCallback((sc: Scenario) => {
    setScenario(sc);
    setPhase('prep');
    setBurdenBefore(null);
    setMessages([]);
    setCurrentLine('');
    setInputText('');
    setBurdenAfter(null);
    setReadiness(null);
    setSelectedNextStep(null);
    setPromptHelpCount(0);
    setRewriteCount(0);
    responseLatenciesRef.current = [];
    wpmAvgRef.current = [];
    stabilityAvgRef.current = [];
    engagementAvgRef.current = [];
    volumeAvgRef.current = [];
    setElapsed(0);
    setSavedId(null);
    setSaveError(null);
    setConsentTranscript(false);
  }, []);

  const startPractice = useCallback(() => {
    if (!scenario || burdenBefore === null) return;
    setMessages([{ role: 'them', text: scenario.open }]);
    setCurrentLine(scenario.open);
    setPhase('speaking');
    setElapsed(0);

    if (!muted) {
      speakTTS(scenario.open, () => {
        setPhase('user-turn');
        opponentFinishTimeRef.current = performance.now();
        userStartedRef.current = false;
      });
    } else {
      window.setTimeout(() => {
        setPhase('user-turn');
        opponentFinishTimeRef.current = performance.now();
        userStartedRef.current = false;
      }, 2000);
    }
  }, [scenario, burdenBefore, muted, speakTTS]);

  const recordLatencyIfFirst = useCallback(() => {
    if (!userStartedRef.current && opponentFinishTimeRef.current > 0) {
      const latency = (performance.now() - opponentFinishTimeRef.current) / 1000;
      responseLatenciesRef.current.push(Math.round(latency));
      userStartedRef.current = true;
    }
  }, []);

  const send = useCallback(async () => {
    if (!scenario || busy || phase !== 'user-turn') return;
    const text = inputText.trim();
    if (!text) return;

    recordLatencyIfFirst();
    stopSpeech();
    setInputText('');
    resetSpeech();

    const newMessages = [...messages, { role: 'me' as const, text }];
    setMessages(newMessages);
    setBusy(true);
    setPhase('speaking');

    try {
      const result = await askAI(newMessages, scenario);
      const updated = [...newMessages, { role: 'them' as const, text: result.reply }];
      if (result.coach) updated.push({ role: 'coach' as const, text: '코칭 · ' + result.coach });
      setMessages(updated);
      setCurrentLine(result.reply);

      if (!muted) {
        speakTTS(result.reply, () => {
          setPhase('user-turn');
          opponentFinishTimeRef.current = performance.now();
          userStartedRef.current = false;
        });
      } else {
        window.setTimeout(() => {
          setPhase('user-turn');
          opponentFinishTimeRef.current = performance.now();
          userStartedRef.current = false;
        }, 2000);
      }
    } catch {
      const fallback = '네, 편하게 말씀해 주세요. 천천히 하셔도 괜찮습니다.';
      const fallbackCoach = '지금처럼 한 문장만 써도 충분히 전달돼요.';
      setMessages([...newMessages, { role: 'them', text: fallback }, { role: 'coach', text: '코칭 · ' + fallbackCoach }]);
      setCurrentLine(fallback);
      if (!muted) {
        speakTTS(fallback, () => {
          setPhase('user-turn');
          opponentFinishTimeRef.current = performance.now();
          userStartedRef.current = false;
        });
      } else {
        window.setTimeout(() => {
          setPhase('user-turn');
          opponentFinishTimeRef.current = performance.now();
          userStartedRef.current = false;
        }, 2000);
      }
    } finally {
      setBusy(false);
    }
  }, [scenario, busy, phase, inputText, messages, muted, speakTTS, stopSpeech, resetSpeech, recordLatencyIfFirst]);

  const finishRehearsal = useCallback(() => {
    stopTTS();
    stopSpeech();
    setPhase('post-burden');
  }, [stopTTS, stopSpeech]);

  const completePostBurden = useCallback(() => {
    if (scenario) {
      try {
        localStorage.setItem(REHEARSAL_SUMMARY_KEY, JSON.stringify({
          savedAt: new Date().toISOString(),
          scenarioId: scenario.id,
          scenarioTitle: scenario.title,
          burdenBefore,
          burdenAfter,
          readiness,
          completedTurns: messages.filter((message) => message.role === 'me').length,
          promptHelpCount,
          rewriteCount,
        }));
      } catch {
        // Private browsing or device policy may disable local storage.
      }
    }
    setPhase('finished');
    setSavedId(null);
    setSaveError(null);
    setConsentTranscript(false);
  }, [scenario, burdenBefore, burdenAfter, readiness, messages, promptHelpCount, rewriteCount]);

  const reset = useCallback(() => {
    setScenario(null);
    setMessages([]);
    setPhase('idle');
    setBurdenBefore(null);
    setBurdenAfter(null);
    setReadiness(null);
    setSelectedNextStep(null);
    setCurrentLine('');
    setInputText('');
    setElapsed(0);
    setPromptHelpCount(0);
    setRewriteCount(0);
    responseLatenciesRef.current = [];
    setSavedId(null);
    setSaveError(null);
    setConsentTranscript(false);
    setShowExamples(false);
    setShowRewrite(false);
    setExamples(null);
    setRewrittenText('');
    stopTTS();
    stopSpeech();
    wpmAvgRef.current = [];
    stabilityAvgRef.current = [];
    engagementAvgRef.current = [];
    volumeAvgRef.current = [];
  }, [stopTTS, stopSpeech]);

  const goToPreviousStep = useCallback(() => {
    if (!scenario || phase === 'idle') {
      window.location.href = '/?screen=micro';
      return;
    }
    if (phase === 'prep') {
      reset();
      return;
    }
    if (phase === 'speaking' || phase === 'user-turn') {
      if (!window.confirm('현재 대화는 자동 저장되지 않아요. 상황 선택으로 돌아갈까요?')) return;
      reset();
      return;
    }
    if (phase === 'post-burden') {
      setPhase('user-turn');
      return;
    }
    if (phase === 'finished') {
      setPhase('post-burden');
    }
  }, [scenario, phase, reset]);

  const handleGetExamples = useCallback(async () => {
    if (!scenario) return;
    setShowExamples(true);
    setExamplesLoading(true);
    setPromptHelpCount((c) => c + 1);
    try {
      const result = await askAIForExamples(scenario, messages);
      setExamples(result);
    } catch {
      setExamples(FALLBACK_EXAMPLES[scenario.id] || FALLBACK_EXAMPLES.center);
    } finally {
      setExamplesLoading(false);
    }
  }, [scenario, messages]);

  const handleRewrite = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !scenario) return;
    setShowRewrite(true);
    setRewriteLoading(true);
    setRewriteCount((c) => c + 1);
    setOriginalForRewrite(text);
    try {
      const result = await askAIForRewrite(scenario, text);
      setRewrittenText(result);
    } catch {
      setRewrittenText(text);
    } finally {
      setRewriteLoading(false);
    }
  }, [inputText, scenario]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  }, []);

  const saveSession = async () => {
    if (!scenario) return;
    setIsSaving(true);
    setSaveError(null);

    const sessionToken = crypto.randomUUID();
    const transcriptData = consentTranscript
      ? messages.map((m) => ({ role: m.role, text: m.text }))
      : [];

    const insertData: Record<string, unknown> = {
      scenario: scenario.title,
      scenario_id: scenario.id,
      duration_seconds: elapsed,
      burden_before: burdenBefore,
      burden_after: burdenAfter,
      readiness_after: readiness,
      completed_turns: completedTurns,
      average_response_latency_seconds: avgLatency,
      prompt_help_count: promptHelpCount,
      rewrite_count: rewriteCount,
      selected_next_step: selectedNextStep,
      transcript: transcriptData,
      session_token: sessionToken,
    };

    if (wpmAvgRef.current.length > 0) insertData.wpm = liveAverages.wpm;
    if (stabilityAvgRef.current.length > 0) insertData.tremor = liveAverages.stability;
    if (volumeAvgRef.current.length > 0) insertData.volume = liveAverages.volume;
    if (cameraOn && engagementAvgRef.current.length > 0) {
      insertData.gaze_focus = liveAverages.engagement ?? 0;
    }

    try {
      if (!isSupabaseConfigured || !supabase) {
        setSaveError('저장 기능이 설정되지 않았어요. 환경변수를 확인해 주세요.');
        return;
      }
      const { data, error } = await supabase
        .from('social_rehearsal_sessions')
        .insert(insertData)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      setSavedId(data?.id ?? null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했어요');
    } finally {
      setIsSaving(false);
    }
  };

  const isPrep = phase === 'prep';
  const isSpeaking = phase === 'speaking';
  const isUserTurn = phase === 'user-turn';
  const isPostBurden = phase === 'post-burden';
  const isFinished = phase === 'finished';
  const showResults = isFinished;
  const burdenLabels = ['전혀 부담되지 않아요', '조금 부담돼요', '보통이에요', '많이 부담돼요', '매우 부담돼요'];
  const nextSteps = scenario ? NEXT_STEPS[scenario.id] || [] : [];

  return (
    <div className="app">
      <aside className="rail">
        <div>
          <div className="brand">nudge<span className="dot"> on</span></div>
          <div className="brand-sub">bridge, not companion</div>
        </div>

        <div>
          <svg className="window" viewBox="0 0 120 104" aria-hidden="true">
            <rect x="4" y="4" width="112" height="96" rx="8" fill="#2C3833" />
            <g className="daylight" style={{ opacity: 0.55 }}>
              <rect x="12" y="12" width="96" height="80" rx="4" fill="#F6E8C4" />
              <circle cx="82" cy="34" r="11" fill="#F3D488" />
              <path d="M12 74 L40 54 L60 70 L82 50 L108 72 L108 88 Q108 92 104 92 L16 92 Q12 92 12 88 Z" fill="#B9CBB4" />
            </g>
            <rect x="12" y="12" width="96" height="80" rx="4" fill="none" stroke="#2C3833" strokeWidth="1" />
            <rect x="58.5" y="12" width="3" height="80" fill="#2C3833" />
            <rect x="12" y="49" width="96" height="3" fill="#2C3833" />
            <g className="curtain l"><rect x="12" y="12" width="46" height="80" fill="#8C9A93" opacity=".95" /></g>
            <g className="curtain r"><rect x="62" y="12" width="46" height="80" fill="#8C9A93" opacity=".95" /></g>
            <rect x="4" y="4" width="112" height="96" rx="8" fill="none" stroke="#2C3833" strokeWidth="7" />
          </svg>
          <div className="window-note">{scenario ? '빛이 들어오고 있어요' : '커튼은 아직 닫혀 있어요'}</div>
        </div>

        <ul className="journey">
          <li className="jstep" data-state="done"><span className="num">01</span><span>자가진단</span></li>
          <li className="jstep" data-state="done"><span className="num">02</span><span>마이크로스텝</span></li>
          <li className="jstep" data-state="now"><span className="num">03</span><span>사회적 리허설</span></li>
          <li className="jstep" data-state="todo"><span className="num">04</span><span>AI 연결</span></li>
          <li className="jstep" data-state="todo"><span className="num">05</span><span>기록·성장</span></li>
        </ul>

        <div className="rail-foot">
          이 화면은 공모전 시연용 프로토타입입니다.<br />
          기관 정보는 예시 데이터이며, 실제 서비스에서는 검증된 DB를 연결합니다.
        </div>
      </aside>

      <main className="stage">
        <div className="col">
          <button className="back-home" type="button" onClick={goToPreviousStep} aria-label="이전 단계로 돌아가기">
            <ArrowLeft size={14} /> 이전 단계
          </button>
          {!scenario && (
            <>
              <div className="eyebrow">03 — Social Rehearsal</div>
              <h2 className="mid" tabIndex={-1}>실전 말고, 먼저 여기서 한 번</h2>
              <p className="lede">틀려도 아무 일도 일어나지 않는 자리에서 먼저 해봐요.
              AI가 상대 역할을 맡고, 옆에서 짧게 코칭해줄게요. 그만두고 싶으면 그냥 나가면 돼요.</p>
              <div className="scenario-grid">
                {SCENARIOS.map((s) => (
                  <button key={s.id} className="scenario-card-btn" onClick={() => selectScenario(s)} aria-label={s.title}>
                    <span className="sc-icon"><Mic size={18} /></span>
                    <span>
                      <span className="sc-title">{s.title}</span>
                      <span className="sc-desc">{s.who}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="note">카메라와 마이크 분석은 선택 기능이에요. 켜면 상대방을 보며 연습할 수 있고,
              말 속도·음성 안정도·화면 중앙 유지를 추정해요. 끄고 텍스트로만 대화해도 괜찮아요.</p>
            </>
          )}

          {scenario && isPrep && (
            <>
              <div className="eyebrow">03 — {scenario.title}</div>
              <h2 className="mid" tabIndex={-1}>{scenario.title}</h2>

              <div className="card">
                <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600 }}>
                  지금 이 행동을 실제로 해야 한다고 생각하면 얼마나 부담스럽나요?
                </p>
                <p style={{ margin: '0 0 18px', fontSize: '13.5px', color: 'var(--ink-soft)' }}>
                  정답이 없어요. 지금 느끼는 대로 선택해 주세요.
                </p>
                <div className="burden-buttons">
                  {burdenLabels.map((label, i) => (
                    <button key={i} className={`burden-btn ${burdenBefore === i + 1 ? 'selected' : ''}`} onClick={() => setBurdenBefore(i + 1)} aria-pressed={burdenBefore === i + 1} aria-label={`${i + 1}점 — ${label}`}>
                      <span className="burden-num">{i + 1}</span>
                      <span className="burden-label">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>카메라·마이크 분석 (선택)</p>
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--ink-soft)' }}>
                  카메라를 켜면 상대방을 보며 연습하고, 화면 중앙 유지와 말 속도를 추정해요.
                  이 데이터는 의학적·심리학적 진단이 아닌 연습 보조용 추정치예요.
                </p>
                <button className={`cam-btn ${cameraOn ? '' : 'off'}`} onClick={() => setCameraOn((v) => !v)}>
                  {cameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
                  <span>{cameraOn ? '카메라 켜기' : '카메라 끄기 (기본)'}</span>
                </button>
              </div>

              <div className="row">
                <button className="btn" onClick={startPractice} disabled={burdenBefore === null}>
                  <Play size={16} />
                  <span>연습 시작하기</span>
                </button>
                <button className="btn quiet" onClick={reset}>다른 상황 고르기</button>
              </div>
            </>
          )}

          {scenario && (isSpeaking || isUserTurn) && (
            <>
              <div className="eyebrow">03 — {scenario.title}</div>
              <h2 className="mid" tabIndex={-1}>{scenario.title}</h2>

              <div className="rehearsal-layout">
                <div>
                  <OpponentPanel
                    scenario={scenario}
                    isSpeaking={ttsSpeaking || isSpeaking}
                    isWaiting={false}
                    isUserTurn={isUserTurn}
                    currentLine={currentLine}
                    muted={muted}
                    cameraOn={cameraOn}
                    onToggleMute={() => setMuted((v) => !v)}
                    onToggleCamera={() => setCameraOn((v) => !v)}
                  />

                  <div className="camera-card" style={{ marginTop: 16 }}>
                    <div className="camera-header">
                      <h3>나의 리허설</h3>
                      <span className={`live-pill ${isSpeaking || isUserTurn ? 'rec' : ''}`}>{isSpeaking || isUserTurn ? '● LIVE' : 'READY'}</span>
                    </div>
                    <div className="camera-stage">
                      {cameraOn ? (
                        <video ref={videoRef} autoPlay muted playsInline />
                      ) : (
                        <div className="camera-placeholder"><CameraOff size={28} /><span>카메라가 꺼져 있어요 — 텍스트로 대화해요</span></div>
                      )}
                      {cameraOn && (
                        <div className="camera-overlay">
                          <span className={faceMetrics.centerPresent ? 'active' : ''}><Eye size={11} /> {faceMetrics.centerPresent ? '화면 중앙 유지 추정' : '화면에서 멀어졌어요'}</span>
                          <span className={voiceMetrics.isActive ? 'active' : ''}><Volume2 size={11} /> {voiceMetrics.isActive ? '음성 입력 감지' : '대기'}</span>
                        </div>
                      )}
                      {(isSpeaking || isUserTurn) && cameraOn && (
                        <div className="live-meters">
                          <div className="meter-row"><span>말속도</span><div className="meter-bar"><i style={{ width: `${Math.min(100, (liveAverages.wpm / 200) * 100)}%` }} /></div><b>{liveAverages.wpm}</b></div>
                          <div className="meter-row"><span>안정도</span><div className="meter-bar"><i style={{ width: `${liveAverages.stability}%`, background: '#6F8F80' }} /></div><b>{liveAverages.stability}</b></div>
                          <div className="meter-row"><span>참여</span><div className="meter-bar"><i style={{ width: `${liveAverages.engagement ?? 0}%`, background: '#6F8F80' }} /></div><b>{liveAverages.engagement ?? '—'}</b></div>
                        </div>
                      )}
                    </div>
                    <div className="camera-controls">
                      <button className={`cam-btn ${cameraOn ? '' : 'off'}`} onClick={() => setCameraOn((v) => !v)} aria-label={cameraOn ? '카메라 끄기' : '카메라 켜기'}>
                        {cameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
                        <span>{cameraOn ? '카메라 켜짐' : '카메라 꺼짐'}</span>
                      </button>
                      <button className="cam-btn" onClick={reset} aria-label="다시 시작"><RotateCcw size={14} /><span>다시 시작</span></button>
                    </div>
                    {(voiceError || faceError) && <p className="error-hint">{voiceError || faceError}</p>}
                    <p className="camera-disclaimer">카메라·음성 지표는 조명·기기 환경에 따라 부정확할 수 있어요. 진단이나 평가에 사용되지 않아요.</p>
                  </div>
                </div>

                <div>
                  <DialogueTranscript messages={messages} busy={busy} portrait={scenario.portrait} opponentName={scenario.opponentName} />

                  <div className="help-row">
                    <button className="help-btn" onClick={handleGetExamples} disabled={busy} aria-label="무슨 말부터 할지 모르겠어요"><HelpCircle size={14} /><span>무슨 말부터 할지 모르겠어요</span></button>
                    <button className="help-btn" onClick={handleRewrite} disabled={busy || !inputText.trim()} aria-label="내 문장을 다듬어줘"><PenLine size={14} /><span>내 문장을 다듬어줘</span></button>
                  </div>

                  {showExamples && (
                    <div className="help-panel">
                      <div className="help-panel-head">
                        <span>답변 예시 — 마음에 드는 것을 누르면 입력창에 들어가요</span>
                        <button className="help-close" onClick={() => setShowExamples(false)} aria-label="닫기">✕</button>
                      </div>
                      {examplesLoading ? (
                        <div className="help-loading"><Loader2 size={16} className="spin-icon" /> 예시 만드는 중...</div>
                      ) : examples ? (
                        <div className="example-list">
                          <button className="example-item" onClick={() => { setInputText(examples.minimal); setShowExamples(false); }} aria-label="최소 표현 사용"><span className="ex-tag">최소 표현</span><span className="ex-text">{examples.minimal}</span></button>
                          <button className="example-item" onClick={() => { setInputText(examples.normal); setShowExamples(false); }} aria-label="보통 표현 사용"><span className="ex-tag">보통 표현</span><span className="ex-text">{examples.normal}</span></button>
                          <button className="example-item" onClick={() => { setInputText(examples.honest); setShowExamples(false); }} aria-label="솔직한 표현 사용"><span className="ex-tag">솔직한 표현</span><span className="ex-text">{examples.honest}</span></button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {showRewrite && (
                    <div className="help-panel">
                      <div className="help-panel-head">
                        <span>문장 다듬기 결과</span>
                        <button className="help-close" onClick={() => setShowRewrite(false)} aria-label="닫기">✕</button>
                      </div>
                      {rewriteLoading ? (
                        <div className="help-loading"><Loader2 size={16} className="spin-icon" /> 다듬는 중...</div>
                      ) : (
                        <div className="rewrite-compare">
                          <div className="rewrite-col"><span className="rewrite-label">원래 문장</span><p>{originalForRewrite}</p></div>
                          <div className="rewrite-col"><span className="rewrite-label">다듬은 문장</span><p>{rewrittenText}</p></div>
                          {rewrittenText !== originalForRewrite && (
                            <button className="btn" onClick={() => { setInputText(rewrittenText); setShowRewrite(false); }} aria-label="다듬은 문장 사용하기"><Check size={15} /><span>이 문장 사용하기</span></button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {speechError && <p className="error-hint">{speechError}</p>}
                  {speechSupported && !speechError && (
                    <div className="speech-row">
                      <button className={`speech-btn ${isListening ? 'listening' : ''}`} onClick={() => { if (isListening) { stopSpeech(); } else { resetSpeech(); setInputText(''); startSpeech(); } }} disabled={busy || phase !== 'user-turn'} aria-label={isListening ? '말하기 중지' : '말하기 시작'}>
                        {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                        <span>{isListening ? '말하는 중 (누르면 중지)' : '말하기'}</span>
                      </button>
                      {isListening && <span className="speech-hint">말하면 글자가 나타나요</span>}
                    </div>
                  )}

                  <div className="composer">
                    <textarea value={inputText} onChange={(e) => { setInputText(e.target.value); recordLatencyIfFirst(); }} placeholder="편한 말로 써도 돼요. 완벽하지 않아도 괜찮아요." aria-label="대화 입력" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                    <button className="btn" onClick={send} disabled={busy || phase !== 'user-turn'} aria-label="전송"><Send size={15} /></button>
                  </div>

                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn ghost" onClick={finishRehearsal}>연습 끝내기</button>
                  </div>
                </div>
              </div>

              <p className="note">음성·카메라 지표는 추정치예요. 진단이나 평가에 사용되지 않아요.</p>
            </>
          )}

          {scenario && isPostBurden && (
            <>
              <div className="eyebrow">03 — 연습 후</div>
              <h2 className="mid" tabIndex={-1}>연습을 마쳤어요. 어떻게 느끼나요?</h2>

              <div className="card">
                <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600 }}>연습해본 지금, 이 행동은 얼마나 부담스럽나요?</p>
                <div className="burden-buttons">
                  {burdenLabels.map((label, i) => (
                    <button key={i} className={`burden-btn ${burdenAfter === i + 1 ? 'selected' : ''}`} onClick={() => setBurdenAfter(i + 1)} aria-pressed={burdenAfter === i + 1} aria-label={`${i + 1}점 — ${label}`}>
                      <span className="burden-num">{i + 1}</span>
                      <span className="burden-label">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <p style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600 }}>이제 실제로 한 번 시도해볼 수 있을 것 같나요?</p>
                <div className="opts">
                  <button className="opt" aria-pressed={readiness === 'hard'} onClick={() => setReadiness('hard')}>아직 어려워요</button>
                  <button className="opt" aria-pressed={readiness === 'small'} onClick={() => setReadiness('small')}>아주 작은 단계라면 가능해요</button>
                  <button className="opt" aria-pressed={readiness === 'now'} onClick={() => setReadiness('now')}>지금 시도해볼 수 있어요</button>
                </div>
              </div>

              <div className="row">
                <button className="btn" onClick={completePostBurden} disabled={burdenAfter === null || readiness === null}>다음으로</button>
              </div>
            </>
          )}

          {scenario && showResults && (
            <>
              <div className="eyebrow">03 — 결과</div>
              <h2 className="mid" tabIndex={-1}>이번 리허설을 정리해드려요</h2>

              <div className="result-grid">
                <div className="card result-burden">
                  <span className="result-label">부담도 변화</span>
                  <div className="burden-change">
                    <span className="burden-before">{burdenBefore ?? '—'}</span>
                    <span className="burden-arrow">→</span>
                    <span className="burden-after">{burdenAfter ?? '—'}</span>
                  </div>
                  {(burdenBefore ?? 0) > (burdenAfter ?? 0) ? (
                    <p className="result-note">부담이 조금 줄었어요.</p>
                  ) : burdenBefore === burdenAfter ? (
                    <p className="result-note">부담도가 그대로여도 괜찮아요. 어떤 말로 시작할지는 한 번 확인했어요.</p>
                  ) : (
                    <p className="result-note">부담이 더 커진 것도 자연스러운 반응이에요. 연습 자체가 용기 낸 일이에요.</p>
                  )}
                </div>

                <div className="card result-mini"><span className="result-label">완료한 대화 턴</span><span className="result-value">{completedTurns}번</span></div>
                <div className="card result-mini"><span className="result-label">평균 응답 시간</span><span className="result-value">{avgLatency}초</span></div>
                <div className="card result-mini"><span className="result-label">사용한 도움</span><span className="result-value">예시 {promptHelpCount} · 다듬기 {rewriteCount}</span></div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600 }}>다음으로 해볼 수 있는 행동이에요</p>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--ink-soft)' }}>하나만 선택해도 충분해요. 실제 전화나 외부 연락을 자동으로 하지는 않아요.</p>
                <div className="next-step-list">
                  {nextSteps.map((step) => (
                    <button key={step.id} className={`next-step-btn ${selectedNextStep === step.id ? 'selected' : ''}`} onClick={() => { setSelectedNextStep(step.id); if (step.id.startsWith('copy-')) { const userMessages = messages.filter((m) => m.role === 'me').map((m) => m.text).join(' '); copyToClipboard(userMessages || '연습한 문장이 여기에 들어가요.'); } }} aria-pressed={selectedNextStep === step.id}>
                      <span className="ns-label">{step.label}</span>
                      <span className="ns-desc">{step.description}</span>
                      {selectedNextStep === step.id && <Check size={16} className="ns-check" />}
                    </button>
                  ))}
                </div>
              </div>

              {completedTurns > 0 && (
                <div className="card" style={{ marginTop: 12 }}>
                  <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 600 }}>내가 연습에서 쓴 문장</p>
                  <div className="draft-box">
                    {messages.filter((m) => m.role === 'me').map((m, i) => (<p key={i} style={{ margin: '0 0 6px' }}>{m.text}</p>))}
                  </div>
                  <button className="btn quiet" style={{ marginTop: 10 }} onClick={() => { const userText = messages.filter((m) => m.role === 'me').map((m) => m.text).join('\n'); copyToClipboard(userText); }}><Copy size={14} /><span>복사하기</span></button>
                </div>
              )}

              <div className="card" style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 600 }}>이번 리허설 기록 저장</p>
                <label className="consent-check"><input type="checkbox" checked={consentTranscript} onChange={(e) => setConsentTranscript(e.target.checked)} /><span>대화 내용이 포함됩니다 (선택)</span></label>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--ink-soft)' }}>동의하지 않으면 대화 내용은 저장되지 않고, 부담도·턴 수·도움 사용 횟수 등 비식별 결과만 저장돼요.</p>
                {savedId ? (
                  <div className="save-success"><Check size={16} /><span>저장되었어요.</span></div>
                ) : (
                  <button className="save-btn" onClick={saveSession} disabled={isSaving} style={{ marginTop: 12 }}>{isSaving ? <Loader2 size={16} className="spin-icon" /> : <Save size={16} />}<span>{isSaving ? '저장하는 중...' : '저장하기'}</span></button>
                )}
                {saveError && <p className="save-error">{saveError}</p>}
              </div>

              <div className="row">
                <button className="btn" onClick={() => { window.location.href = '/?screen=connect'; }}>AI 연결로 계속하기</button>
                <button className="btn quiet" onClick={reset}>다른 상황 연습하기</button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
