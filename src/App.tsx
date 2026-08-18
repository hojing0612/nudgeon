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
  Phone,
  Play,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
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

type Phase = 'idle' | 'prep' | 'speaking' | 'user-turn' | 'safety' | 'post-burden' | 'finished';
type Readiness = 'hard' | 'small' | 'now' | null;
const REHEARSAL_SUMMARY_KEY = 'nudgeon.rehearsal-summary.v1';
const REHEARSAL_PROGRESS_KEY = 'nudgeon.rehearsal-progress.v1';
const REHEARSAL_HISTORY_KEY = 'nudgeon.rehearsal-history.v1';
const RESOURCE_CONTEXT_KEY = 'nudgeon.rehearsal-context.v1';
const CONNECT_FOCUS_KEY = 'nudgeon.connect-focus-resource.v1';

type ResourceRehearsalContext = {
  resourceId: string;
  resourceTitle: string;
  organization: string;
  applicationUrl: string;
  returnTo: string;
  scenario: Scenario;
};

function createLocalId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadResourceRehearsalContext(): ResourceRehearsalContext | null {
  try {
    const resourceId = new URLSearchParams(window.location.search).get('resource');
    const saved = JSON.parse(localStorage.getItem(RESOURCE_CONTEXT_KEY) || 'null');
    if (!resourceId || !saved || saved.resourceId !== resourceId || !saved.resource?.title) return null;
    const resourceTitle = String(saved.resource.title);
    const organization = String(saved.resource.organization || '운영기관');
    return {
      resourceId,
      resourceTitle,
      organization,
      applicationUrl: String(saved.resource.applicationUrl || ''),
      returnTo: '/home.html?screen=connect',
      scenario: {
        id: `resource:${resourceId}`,
        title: `${resourceTitle} 문의 연습`,
        who: `${organization}의 ${resourceTitle} 담당자`,
        open: `안녕하세요, ${organization} ${resourceTitle} 담당자입니다. 어떤 점이 궁금하신가요?`,
        portrait: SCENARIOS.find((item) => item.id === 'apply')?.portrait || '',
        opponentName: '지원 담당자',
        opponentRole: organization,
      },
    };
  } catch {
    return null;
  }
}

function fallbackExamplesFor(scenarioId: string) {
  return FALLBACK_EXAMPLES[scenarioId] || (scenarioId.startsWith('resource:') ? FALLBACK_EXAMPLES.apply : FALLBACK_EXAMPLES.center);
}

const CRISIS_PATTERNS = [
  /자살/, /자해/, /죽고\s*싶/, /죽어\s*버리/, /살기\s*싫/,
  /목숨을?\s*(?:끊|버리)/, /내\s*삶을?\s*끝내/, /나를?\s*해치/,
  /사라지고\s*싶/, /없어지고\s*싶/, /유서/
];

function containsCrisisLanguage(text: string) {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

const SAFETY_REPLY = '지금은 역할극을 계속하기보다 즉시 사람의 도움을 받는 것이 먼저예요. 당장 자신이나 다른 사람을 해칠 가능성이 있다면 112 또는 119에 전화하고, 자살예방 상담전화 109에서도 24시간 상담받을 수 있어요.';

type RehearsalProgress = {
  scenarioId: string | null;
  phase: Phase;
  burdenBefore: number | null;
  burdenAfter: number | null;
  readiness: Readiness;
  selectedNextStep: string | null;
  promptHelpCount: number;
  rewriteCount: number;
  elapsed: number;
};

function loadRehearsalProgress(): RehearsalProgress | null {
  try {
    const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROGRESS_KEY) || 'null');
    if (!saved || !['idle', 'prep', 'speaking', 'user-turn', 'safety', 'post-burden', 'finished'].includes(saved.phase)) return null;
    return {
      scenarioId: typeof saved.scenarioId === 'string' ? saved.scenarioId : null,
      // 대화 원문을 저장하지 않으므로 진행 중이던 역할극은 준비 화면에서 다시 시작해요.
      phase: saved.phase === 'speaking' || saved.phase === 'user-turn' ? 'prep' : saved.phase,
      burdenBefore: Number.isFinite(saved.burdenBefore) ? saved.burdenBefore : null,
      burdenAfter: Number.isFinite(saved.burdenAfter) ? saved.burdenAfter : null,
      readiness: ['hard', 'small', 'now'].includes(saved.readiness) ? saved.readiness : null,
      selectedNextStep: typeof saved.selectedNextStep === 'string' ? saved.selectedNextStep : null,
      promptHelpCount: Number(saved.promptHelpCount) || 0,
      rewriteCount: Number(saved.rewriteCount) || 0,
      elapsed: Number(saved.elapsed) || 0,
    };
  } catch {
    return null;
  }
}

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

async function askAI(messages: ChatMessage[], scenario: Scenario): Promise<AISafetyCheck> {
  const history = messages
    .filter((m) => m.role !== 'coach')
    .map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: history,
      task: 'rehearsal',
      context: { scenario: scenario.title, role: scenario.who },
    }),
  });

  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const parsed = parseAIResponse(data.text || '');
  return { ...parsed, isSafety: data.safety === true || parsed.isSafety };
}

async function askAIForExamples(scenario: Scenario, messages: ChatMessage[]): Promise<{ minimal: string; normal: string; honest: string }> {
  const context = messages.slice(-4).map((m) => `${m.role === 'me' ? '사용자' : '상대'}: ${m.text}`).join('\n');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `상황: ${scenario.title}\n역할: ${scenario.who}\n지금까지 대화:\n${context}\n\n사용자가 무슨 말부터 할지 모르겠다고 했어. 사용자가 선택할 수 있는 답변 예시 3개를 만들어줘.` }],
      task: 'examples',
      context: { scenario: scenario.title, role: scenario.who },
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

  return fallbackExamplesFor(scenario.id);
}

async function askAIForRewrite(scenario: Scenario, userText: string): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: `사용자가 작성한 문장: "${userText}"\n상황: ${scenario.title}\n이 문장을 다듬어줘.` }],
      task: 'rewrite',
      context: { scenario: scenario.title, role: scenario.who },
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
  const restoredProgressRef = useRef<RehearsalProgress | null>(loadRehearsalProgress());
  const restoredProgress = restoredProgressRef.current;
  const resourceContextRef = useRef<ResourceRehearsalContext | null>(loadResourceRehearsalContext());
  const resourceContext = resourceContextRef.current;
  const applicableProgress = resourceContext && restoredProgress?.scenarioId !== resourceContext.scenario.id
    ? null
    : restoredProgress;
  const rehearsalIdRef = useRef(createLocalId());
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(() =>
    resourceContext?.scenario || SCENARIOS.find((item) => item.id === applicableProgress?.scenarioId) || null);
  const [phase, setPhase] = useState<Phase>(resourceContext && !applicableProgress ? 'prep' : applicableProgress?.phase || 'idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [currentLine, setCurrentLine] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(applicableProgress?.elapsed || 0);
  const [inputText, setInputText] = useState('');

  const [burdenBefore, setBurdenBefore] = useState<number | null>(applicableProgress?.burdenBefore ?? null);
  const [burdenAfter, setBurdenAfter] = useState<number | null>(applicableProgress?.burdenAfter ?? null);
  const [readiness, setReadiness] = useState<Readiness>(applicableProgress?.readiness ?? null);
  const [selectedNextStep, setSelectedNextStep] = useState<string | null>(applicableProgress?.selectedNextStep ?? null);

  const [promptHelpCount, setPromptHelpCount] = useState(applicableProgress?.promptHelpCount || 0);
  const [rewriteCount, setRewriteCount] = useState(applicableProgress?.rewriteCount || 0);
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
    try {
      localStorage.setItem(REHEARSAL_PROGRESS_KEY, JSON.stringify({
        scenarioId: scenario?.id || null, phase,
        burdenBefore, burdenAfter, readiness, selectedNextStep,
        promptHelpCount, rewriteCount, elapsed,
      } satisfies RehearsalProgress));
    } catch {
      // Private browsing or device policy may disable local storage.
    }
  }, [scenario, phase, burdenBefore, burdenAfter,
    readiness, selectedNextStep, promptHelpCount, rewriteCount, elapsed]);

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
    rehearsalIdRef.current = createLocalId();
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

    if (containsCrisisLanguage(text)) {
      stopTTS();
      setCameraOn(false);
      setMessages([...newMessages, { role: 'them', text: SAFETY_REPLY }]);
      setCurrentLine(SAFETY_REPLY);
      setPhase('safety');
      return;
    }

    setBusy(true);
    setPhase('speaking');

    try {
      const result = await askAI(newMessages, scenario);
      const updated = [...newMessages, { role: 'them' as const, text: result.reply }];
      if (result.coach) updated.push({ role: 'coach' as const, text: '코칭 · ' + result.coach });
      setMessages(updated);
      setCurrentLine(result.reply);

      if (result.isSafety) {
        stopTTS();
        stopSpeech();
        setCameraOn(false);
        setPhase('safety');
        return;
      }

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
  }, [scenario, busy, phase, inputText, messages, muted, speakTTS, stopTTS, stopSpeech, resetSpeech, recordLatencyIfFirst]);

  const finishRehearsal = useCallback(() => {
    stopTTS();
    stopSpeech();
    setPhase('post-burden');
  }, [stopTTS, stopSpeech]);

  const completePostBurden = useCallback(() => {
    if (scenario) {
      try {
        const matchesResource = scenario.id === resourceContext?.scenario.id;
        const summary = {
          id: rehearsalIdRef.current,
          savedAt: new Date().toISOString(),
          scenarioId: scenario.id,
          scenarioTitle: scenario.title,
          resourceId: matchesResource ? resourceContext?.resourceId || null : null,
          resourceTitle: matchesResource ? resourceContext?.resourceTitle || null : null,
          burdenBefore,
          burdenAfter,
          readiness,
          completedTurns: messages.filter((message) => message.role === 'me').length,
          promptHelpCount,
          rewriteCount,
        };
        localStorage.setItem(REHEARSAL_SUMMARY_KEY, JSON.stringify(summary));
        const history = JSON.parse(localStorage.getItem(REHEARSAL_HISTORY_KEY) || '[]');
        const previous = Array.isArray(history) ? history.filter((item) => item?.id !== summary.id) : [];
        localStorage.setItem(REHEARSAL_HISTORY_KEY, JSON.stringify([...previous, summary].slice(-200)));
      } catch {
        // Private browsing or device policy may disable local storage.
      }
    }
    setPhase('finished');
    setSavedId(null);
    setSaveError(null);
    setConsentTranscript(false);
  }, [scenario, resourceContext, burdenBefore, burdenAfter, readiness, messages, promptHelpCount, rewriteCount]);

  const reset = useCallback(() => {
    rehearsalIdRef.current = createLocalId();
    localStorage.removeItem(REHEARSAL_PROGRESS_KEY);
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

  const moveToJourneyStep = useCallback((screen: 'check' | 'micro' | 'connect' | 'record') => {
    stopTTS();
    stopSpeech();
    window.location.href = `/home.html?screen=${screen}`;
  }, [stopTTS, stopSpeech]);

  const returnToResource = useCallback(() => {
    if (!resourceContext) return;
    stopTTS();
    stopSpeech();
    localStorage.removeItem(REHEARSAL_PROGRESS_KEY);
    localStorage.setItem(CONNECT_FOCUS_KEY, JSON.stringify(resourceContext.resourceId));
    window.location.href = resourceContext.returnTo;
  }, [resourceContext, stopTTS, stopSpeech]);

  const isResourceScenario = Boolean(resourceContext && scenario?.id === resourceContext.scenario.id);

  const goToPreviousStep = useCallback(() => {
    if (!scenario || phase === 'idle') {
      window.location.href = '/home.html?screen=micro';
      return;
    }
    if (phase === 'prep') {
      if (isResourceScenario) {
        returnToResource();
        return;
      }
      reset();
      return;
    }
    if (phase === 'speaking' || phase === 'user-turn') {
      if (!window.confirm('현재 대화는 자동 저장되지 않아요. 상황 선택으로 돌아갈까요?')) return;
      reset();
      return;
    }
    if (phase === 'safety') {
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
  }, [scenario, phase, reset, isResourceScenario, returnToResource]);

  const handleGetExamples = useCallback(async () => {
    if (!scenario) return;
    setShowExamples(true);
    setExamplesLoading(true);
    setPromptHelpCount((c) => c + 1);
    try {
      const result = await askAIForExamples(scenario, messages);
      setExamples(result);
    } catch {
      setExamples(fallbackExamplesFor(scenario.id));
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
      const { error } = await supabase
        .from('social_rehearsal_sessions')
        .insert(insertData);
      if (error) throw error;
      // 익명 사용자는 저장 결과를 다시 조회하지 않습니다.
      setSavedId(sessionToken);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했어요');
    } finally {
      setIsSaving(false);
    }
  };

  const isPrep = phase === 'prep';
  const isSpeaking = phase === 'speaking';
  const isUserTurn = phase === 'user-turn';
  const isSafety = phase === 'safety';
  const isPostBurden = phase === 'post-burden';
  const isFinished = phase === 'finished';
  const showResults = isFinished;
  const burdenLabels = ['전혀 부담되지 않아요', '조금 부담돼요', '보통이에요', '많이 부담돼요', '매우 부담돼요'];
  const nextSteps = scenario ? NEXT_STEPS[scenario.id] || (scenario.id.startsWith('resource:') ? NEXT_STEPS.apply : []) : [];

  return (
    <div className="app" data-mobile-view={!scenario ? 'scenario' : (isSpeaking || isUserTurn ? 'live' : phase)}>
      <header className="site-header">
        <a className="brand" href="/home.html">nudge.on</a>
        <nav className="journey" aria-label="NudgeOn 여정 단계">
          <button className="jstep" data-state="done" onClick={() => moveToJourneyStep('check')}><span className="num">01</span><span>자가진단</span></button>
          <button className="jstep" data-state="done" onClick={() => moveToJourneyStep('micro')}><span className="num">02</span><span>마이크로스텝</span></button>
          <button className="jstep" data-state="now" aria-current="step"><span className="num">03</span><span>사회적 리허설</span></button>
          <button className="jstep" data-state="todo" onClick={() => moveToJourneyStep('connect')}><span className="num">04</span><span>공공 복지 연결</span></button>
          <button className="jstep" data-state="todo" onClick={() => moveToJourneyStep('record')}><span className="num">05</span><span>기록·성장</span></button>
        </nav>
        <a className="home-link" href="/home.html">{isSpeaking || isUserTurn ? '안전하게 나가기' : '처음으로'}</a>
      </header>

      <div className="mobile-journey-progress" aria-live="polite">
        <b>3 / 5 · 사회적 리허설{isSpeaking || isUserTurn ? ' 진행 중' : ''}</b>
        <div>{[0, 1, 2, 3, 4].map((step) => <i key={step} className={step <= 2 ? 'active' : ''} />)}</div>
      </div>

      <div className="workspace">
        <aside className="rail" aria-label="현재 단계 창문">
          <div className="window-wrap">
          <div className={`window-illustration rehearsal-window ${scenario ? 'has-scenario' : ''}`} aria-hidden="true">
            <div className="window-glow" />
            <div className="window-frame">
              <div className="window-pane daylight">
                <div className="window-ground" />
                <div className="window-path" />
                <div className="window-bridge" />
                <div className="window-support support-left" />
                <div className="window-support support-right" />
                <div className="curtain l" />
                <div className="curtain r" />
                <div className="window-bar vertical" />
                <div className="window-bar horizontal" />
              </div>
            </div>
          </div>
            <div className="window-note">{scenario ? '저 멀리 작은 다리가 보여요' : '빛이 조금씩 들어오고 있어요'}</div>
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
              <h2 className="mid" tabIndex={-1}>어떤 상황을 먼저 연습해볼까요?</h2>
              <p className="lede">AI가 상대 역할을 맡고, 필요할 때 짧은 문장 도움을 제안해요. 원하는 상황 하나를 선택해 주세요.</p>
              <div className="scenario-grid">
                {SCENARIOS.map((s, index) => (
                  <button key={s.id} className="scenario-card-btn" onClick={() => selectScenario(s)} aria-label={s.title}>
                    <span className="sc-icon"><span className="mobile-scenario-number">{String(index + 1).padStart(2, '0')}</span><Mic className="desktop-scenario-icon" size={18} /></span>
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

              {isResourceScenario && resourceContext && (
                <div className="card" style={{ borderColor: 'var(--sage)', background: 'var(--mist)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--ink-soft)' }}>정책 상세에서 이어온 맞춤 연습</p>
                  <p style={{ margin: '0', fontSize: '15px', fontWeight: 600 }}>{resourceContext.resourceTitle}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--ink-soft)' }}>{resourceContext.organization} 담당자에게 신청 자격과 절차를 문의하는 상황이에요.</p>
                </div>
              )}

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
                  {cameraOn ? <CameraOff size={14} /> : <Camera size={14} />}
                  <span>{cameraOn ? '카메라 끄기' : '카메라 켜기'}</span>
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

          {scenario && isSafety && (
            <section className="crisis-panel" role="alert" aria-live="assertive">
              <div className="crisis-heading">
                <span className="crisis-icon" aria-hidden="true"><ShieldAlert size={24} /></span>
                <div>
                  <div className="eyebrow">지금은 안전이 먼저예요</div>
                  <h2 className="mid" tabIndex={-1}>역할극을 잠시 멈췄어요</h2>
                </div>
              </div>
              <p>{SAFETY_REPLY}</p>
              <div className="crisis-actions">
                <a className="crisis-call primary" href="tel:109"><Phone size={17} /><span><b>109</b> 자살예방 상담전화 · 24시간</span></a>
                <a className="crisis-call" href="tel:112"><Phone size={17} /><span><b>112</b> 즉각적인 범죄·신변 위험</span></a>
                <a className="crisis-call" href="tel:119"><Phone size={17} /><span><b>119</b> 응급 구조·구급</span></a>
              </div>
              <p className="crisis-note">전화하기 어렵다면 가까운 사람에게 “지금 혼자 있으면 위험할 것 같아요”라고 그대로 보여주세요. NudgeOn은 응급기관이나 전문 상담을 대신하지 않습니다.</p>
              <div className="row">
                <button className="btn quiet" onClick={reset}>상황 선택으로 돌아가기</button>
                <a className="btn" href="/home.html">NudgeOn 나가기</a>
              </div>
            </section>
          )}

          {scenario && (isSpeaking || isUserTurn) && (
            <>
              <div className="eyebrow">STEP 03 · 진행 중</div>
              <h2 className="mid" tabIndex={-1}>{scenario.title}</h2>
              <p className="mobile-live-lede">AI 상대와 음성 또는 텍스트로 연습해보세요. 필요하면 언제든 문장 도움을 사용할 수 있어요.</p>

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
                        {cameraOn ? <CameraOff size={14} /> : <Camera size={14} />}
                        <span>{cameraOn ? '카메라 끄기' : '카메라 켜기'}</span>
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
                    <button key={step.id} className={`next-step-btn ${selectedNextStep === step.id ? 'selected' : ''}`} onClick={() => { setSelectedNextStep(step.id); if (step.id.startsWith('copy-')) { const userMessages = messages.filter((m) => m.role === 'me').map((m) => m.text).join(' '); copyToClipboard(userMessages || '연습한 문장이 여기에 들어가요.'); } if (step.id === 'view-program' && isResourceScenario) returnToResource(); }} aria-pressed={selectedNextStep === step.id}>
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
                {isResourceScenario ? (
                  <button className="btn" onClick={returnToResource}>정책 상세로 돌아가기</button>
                ) : (
                  <button className="btn" onClick={() => moveToJourneyStep('connect')}>AI 연결로 계속하기</button>
                )}
                <button className="btn quiet" onClick={reset}>다른 상황 연습하기</button>
              </div>
            </>
          )}
        </div>
        </main>
      </div>
    </div>
  );
}

export default App;
