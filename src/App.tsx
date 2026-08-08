import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import { useVoiceAnalysis } from '@/hooks/useVoiceAnalysis';
import { useFaceAnalysis } from '@/hooks/useFaceAnalysis';
import { useKoreanTTS } from '@/hooks/useKoreanTTS';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { supabase } from '@/lib/supabase';
import { SCENARIOS } from '@/data/opponents';
import type { Scenario, DialogueEntry, ConversationPhase } from '@/data/opponents';
import { OpponentPanel } from '@/components/OpponentPanel';
import { DialogueTranscript } from '@/components/DialogueTranscript';

type FeedbackResult = {
  wpm: number;
  tremor: number;
  gazeFocus: number;
  volume: number;
  overallScore: number;
  tips: string[];
};

function buildFeedback(wpm: number, tremor: number, gazeFocus: number, volume: number, elapsedSec: number, dialogueCount: number): FeedbackResult {
  const wpmScore = wpm === 0 ? 50 : Math.max(0, 100 - Math.abs(wpm - 135) * 1.5);
  const tremorScore = Math.max(0, 100 - tremor * 1.2);
  const gazeScore = gazeFocus;
  const volumeScore = Math.max(20, 100 - Math.abs(volume - 55) * 1.3);
  const dialogueBonus = Math.min(10, dialogueCount * 2);
  const overallScore = elapsedSec < 3
    ? 0
    : Math.round(wpmScore * 0.35 + tremorScore * 0.25 + gazeScore * 0.25 + volumeScore * 0.15 + dialogueBonus);

  const tips: string[] = [];
  if (wpm > 165) tips.push('지금보다 말을 10% 늦추면 듣는 사람이 더 편하게 따라올 수 있어요.');
  else if (wpm < 100 && wpm > 0) tips.push('말 속도가 조금 느려요. 핵심 단어 사이에 자연스러운 호흡을 더해보세요.');
  else tips.push('말 속도가 안정적이에요. 이 페이스를 유지해보세요.');

  if (tremor > 50) tips.push('목소리 떨림이 관찰돼요. 시작 전 심호흡을 한 번 하면 편안해져요.');
  else tips.push('목소리가 안정적인 편이에요. 지금의 여유를 기억해두면 좋아요.');

  if (gazeFocus < 60) tips.push('시선이 자주 아래로 머물어요. 상대방의 눈(카메라)을 향해 시선을 두면 더 또렷해져요.');
  else tips.push('시선 집중이 좋아요. 상대방을 바라보는 감각을 계속 가져가 보세요.');

  if (volume < 30) tips.push('목소리가 조금 작아요. 평소보다 한 톤만 더 키워보세요.');
  else if (volume > 80) tips.push('목소리가 또렷해요. 다만 너무 크면 숨이 빨리 차니 편한 톤을 찾아보세요.');

  if (dialogueCount >= 3) tips.push(`${dialogueCount}번의 대화를 주고받았어요. 자연스럽게 이어가는 연습이 잘 되고 있어요.`);

  return { wpm, tremor, gazeFocus, volume, overallScore, tips };
}

function formatTime(seconds: number) {
  return `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function tremorLabel(tremor: number) {
  if (tremor < 30) return { text: '낮음', note: '안정적인 편이에요', tone: 'green' as const };
  if (tremor < 60) return { text: '보통', note: '조금 떨림이 있어요', tone: 'amber' as const };
  return { text: '높음', note: '심호흡이 도움돼요', tone: 'amber' as const };
}

function wpmLabel(wpm: number) {
  if (wpm === 0) return { text: '—', note: '권장 120–150 WPM', tone: 'blue' as const };
  return { text: String(wpm), note: '권장 120–150 WPM', tone: 'blue' as const };
}

function gazeLabel(gaze: number) {
  if (gaze === 0) return { text: '—', note: '카메라 기준', tone: 'amber' as const };
  return { text: `${gaze}%`, note: '카메라 기준', tone: 'amber' as const };
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [opponentMuted, setOpponentMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [phase, setPhase] = useState<ConversationPhase>('waiting');
  const [turnNumber, setTurnNumber] = useState(0);
  const [dialogue, setDialogue] = useState<DialogueEntry[]>([]);
  const [currentOpponentLine, setCurrentOpponentLine] = useState('');
  const conversationEndedRef = useRef(false);

  const { metrics: voiceMetrics, error: voiceError } = useVoiceAnalysis(isRecording && micOn, micOn);
  const { metrics: faceMetrics, error: faceError } = useFaceAnalysis(isRecording && cameraOn, cameraOn, videoRef);
  const { speak: speakTTS, stop: stopTTS, isSpeaking } = useKoreanTTS();
  const { transcript: liveTranscript, reset: resetTranscript } = useSpeechRecognition(phase === 'user-responding');

  const wpmAvgRef = useRef<number[]>([]);
  const tremorAvgRef = useRef<number[]>([]);
  const gazeAvgRef = useRef<number[]>([]);
  const volumeAvgRef = useRef<number[]>([]);
  const userResponseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setElapsed((time) => time + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!cameraOn || !navigator.mediaDevices?.getUserMedia) return;
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((stream) => {
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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
    if (!isRecording) return;
    wpmAvgRef.current.push(voiceMetrics.wpm);
    if (wpmAvgRef.current.length > 120) wpmAvgRef.current.shift();
    tremorAvgRef.current.push(voiceMetrics.tremor);
    if (tremorAvgRef.current.length > 120) tremorAvgRef.current.shift();
    gazeAvgRef.current.push(faceMetrics.gazeFocus);
    if (gazeAvgRef.current.length > 120) gazeAvgRef.current.shift();
    volumeAvgRef.current.push(voiceMetrics.volume);
    if (volumeAvgRef.current.length > 120) volumeAvgRef.current.shift();
  }, [voiceMetrics, faceMetrics, isRecording]);

  const totalTurns = scenario.opponent.lines.length;

  const speakOpponentLine = useCallback((lineText: string, onDone: () => void) => {
    setCurrentOpponentLine(lineText);
    setDialogue((prev) => [...prev, { speaker: 'opponent', text: lineText, timestamp: Date.now() }]);

    if (opponentMuted) {
      window.setTimeout(onDone, 1500);
      return;
    }

    speakTTS(lineText, onDone);
  }, [opponentMuted, speakTTS]);

  const startOpponentTurn = useCallback((turn: number) => {
    if (turn >= totalTurns) {
      setPhase('finished');
      setIsRecording(false);
      setIsFinished(true);
      conversationEndedRef.current = true;
      return;
    }

    const line = scenario.opponent.lines[turn];
    setPhase('opponent-speaking');

    speakOpponentLine(line.text, () => {
      setPhase('user-responding');
      resetTranscript();
    });
  }, [scenario, totalTurns, speakOpponentLine, resetTranscript]);

  const advanceTurn = useCallback(() => {
    if (conversationEndedRef.current) return;
    if (phase !== 'user-responding') return;

    const userText = liveTranscript.trim();
    if (userText) {
      setDialogue((prev) => [...prev, { speaker: 'user', text: userText, timestamp: Date.now() }]);
    }
    resetTranscript();

    const nextTurn = turnNumber + 1;
    setTurnNumber(nextTurn);
    startOpponentTurn(nextTurn);
  }, [phase, liveTranscript, turnNumber, resetTranscript, startOpponentTurn]);

  const skipTurn = useCallback(() => {
    if (phase !== 'user-responding') return;
    advanceTurn();
  }, [phase, advanceTurn]);

  // Auto-advance if user is silent for too long
  useEffect(() => {
    if (phase !== 'user-responding') {
      if (userResponseTimeoutRef.current) {
        window.clearTimeout(userResponseTimeoutRef.current);
        userResponseTimeoutRef.current = null;
      }
      return;
    }

    userResponseTimeoutRef.current = window.setTimeout(() => {
      advanceTurn();
    }, 20000);

    return () => {
      if (userResponseTimeoutRef.current) {
        window.clearTimeout(userResponseTimeoutRef.current);
        userResponseTimeoutRef.current = null;
      }
    };
  }, [phase, turnNumber, advanceTurn]);

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsFinished(true);
      setPhase('finished');
      stopTTS();
      conversationEndedRef.current = true;
      setSavedId(null);
      setSaveError(null);
    } else {
      setElapsed(0);
      wpmAvgRef.current = [];
      tremorAvgRef.current = [];
      gazeAvgRef.current = [];
      volumeAvgRef.current = [];
      setIsFinished(false);
      setSavedId(null);
      setSaveError(null);
      setDialogue([]);
      setTurnNumber(0);
      setPhase('waiting');
      conversationEndedRef.current = false;
      resetTranscript();
      setIsRecording(true);

      // Start conversation after a brief delay
      window.setTimeout(() => {
        startOpponentTurn(0);
      }, 800);
    }
  };

  const reset = () => {
    setElapsed(0);
    setIsRecording(false);
    setIsFinished(false);
    setSavedId(null);
    setSaveError(null);
    setDialogue([]);
    setTurnNumber(0);
    setPhase('waiting');
    conversationEndedRef.current = false;
    wpmAvgRef.current = [];
    tremorAvgRef.current = [];
    gazeAvgRef.current = [];
    volumeAvgRef.current = [];
    stopTTS();
    resetTranscript();
  };

  const saveSession = async () => {
    if (!feedback) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from('social_rehearsal_sessions')
        .insert({
          scenario: scenario.label,
          duration_seconds: elapsed,
          wpm: feedback.wpm,
          tremor: feedback.tremor,
          volume: feedback.volume,
          gaze_focus: feedback.gazeFocus,
          overall_score: feedback.overallScore,
          tips: feedback.tips,
        })
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

  const liveAverages = useMemo(() => {
    const avg = (arr: number[]) => (arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length));
    return {
      wpm: avg(wpmAvgRef.current),
      tremor: avg(tremorAvgRef.current),
      gaze: avg(gazeAvgRef.current),
      volume: avg(volumeAvgRef.current),
    };
  }, [voiceMetrics, faceMetrics, isRecording]);

  const feedback = useMemo<FeedbackResult | null>(() => {
    if (!isFinished) return null;
    const userTurns = dialogue.filter((d) => d.speaker === 'user').length;
    return buildFeedback(liveAverages.wpm, liveAverages.tremor, liveAverages.gaze, liveAverages.volume, elapsed, userTurns);
  }, [isFinished, liveAverages, elapsed, dialogue]);

  const displayWpm = isFinished ? (feedback?.wpm ?? 0) : isRecording ? liveAverages.wpm : 0;
  const displayTremor = isFinished ? (feedback?.tremor ?? 0) : isRecording ? liveAverages.tremor : 0;
  const displayGaze = isFinished ? (feedback?.gazeFocus ?? 0) : isRecording ? liveAverages.gaze : 0;

  const wpmInfo = wpmLabel(displayWpm);
  const tremorInfo = tremorLabel(displayTremor);
  const gazeInfo = gazeLabel(displayGaze);

  const showLive = isRecording;
  const showResults = isFinished && feedback !== null;
  const showWaiting = !isRecording && !isFinished;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span><span>nudge <b>on</b></span></div>
        <div className="workspace-switcher"><div><span className="eyebrow">MY WORKSPACE</span><strong>김민지님의 공간</strong></div><ChevronDown size={16} /></div>
        <nav className="nav-list">
          <span className="nav-label">나의 여정</span>
          <a><Activity size={17} /> 오늘의 대시보드</a>
          <a><FileText size={17} /> 자가진단</a>
          <a><BarChart3 size={17} /> 마이크로스텝</a>
          <a className="active"><Waves size={17} /> 사회적 리허설 <span className="new-dot" /></a>
          <a><ArrowRight size={17} /> AI 연결</a>
          <a><Clock3 size={17} /> 기록·성장</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="progress-label"><span>이번 주 연결 점수</span><b>72%</b></div>
          <div className="progress"><i /></div>
          <button className="help-link"><CircleHelp size={16} /> 도움이 필요하신가요?</button>
          <div className="profile"><div className="avatar">김</div><div><strong>김민지</strong><span>대학생 · 취업 준비</span></div><Settings2 size={17} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">나의 여정 <b>/</b> 사회적 리허설</span>
            <h1>사회적 리허설 <span>Social Rehearsal</span></h1>
          </div>
          <div className="top-actions">
            <span className="secure"><ShieldCheck size={15} /> 내 기록은 안전하게 보호돼요</span>
            <button className="icon-button" onClick={() => setShowSettings((value) => !value)}><Settings2 size={19} /></button>
          </div>
        </header>
        {showSettings && (
          <div className="settings-popover">
            <strong>분석 설정</strong>
            <span><Check size={15} /> 음성 분석 (말 속도·떨림)</span>
            <span><Check size={15} /> 표정·시선 분석</span>
            <span><Check size={15} /> 대화 상대방 음성</span>
            <span><Check size={15} /> 기록 저장</span>
            <button onClick={() => setShowSettings(false)}>닫기 <X size={14} /></button>
          </div>
        )}

        <section className="intro-row">
          <div>
            <p className="section-kicker">STEP 03 · 실제 상황을 미리 연습해요</p>
            <h2>안전한 공간에서,<br /><em>상대방과 대화하며</em> 연습해요</h2>
            <p className="intro-copy">AI 상대방이 면접관, 동료, 처음 만난 사람 역할을 맡아 대화를 이어가요.<br />당신의 <b>말 속도, 목소리 떨림, 시선과 표정</b>을 살펴보고 다음에 시도해볼 팁을 알려드려요.</p>
          </div>
          <div className="scenario-card">
            <span className="scenario-icon"><Mic size={18} /></span>
            <div>
              <span className="eyebrow">연습 중인 상황</span>
              <strong>{scenario.label}</strong>
              <span>{scenario.prompt}</span>
            </div>
            <button onClick={() => setShowScenarios((value) => !value)}>변경 <ChevronDown size={14} /></button>
          </div>
        </section>
        {showScenarios && (
          <div className="scenario-menu">
            {SCENARIOS.map((s) => (
              <button key={s.id} className={s.id === scenario.id ? 'selected' : ''} onClick={() => { setScenario(s); setShowScenarios(false); reset(); }}>
                <span>{s.label}</span>
                <small>{s.prompt}</small>
                {s.id === scenario.id && <Check size={15} />}
              </button>
            ))}
          </div>
        )}

        <section className="practice-grid">
          <div className="video-panel">
            <div className="panel-heading">
              <div>
                <h3>
                  <span className={`live-pill ${isRecording ? 'rec' : ''}`}>{isRecording ? '● LIVE' : 'READY'}</span>
                  나의 리허설
                </h3>
                <span>카메라와 마이크를 켜고 상대방과 대화해보세요.</span>
              </div>
              <span className="timer">{formatTime(elapsed)}</span>
            </div>
            <div className={`video-stage ${!cameraOn ? 'camera-off' : ''}`}>
              {cameraOn ? (
                <video ref={videoRef} autoPlay muted playsInline />
              ) : (
                <div className="camera-placeholder"><CameraOff size={32} /><span>카메라가 꺼져 있어요</span></div>
              )}
              {cameraOn && (
                <div className="video-overlay">
                  <span className={faceMetrics.faceDetected ? 'active' : ''}><Eye size={14} /> {isRecording ? (faceMetrics.faceDetected ? '시선 분석 중' : '얼굴을 찾는 중') : '시선 분석 대기'}</span>
                  <span className={voiceMetrics.isActive ? 'active' : ''}><Volume2 size={14} /> {isRecording ? (voiceMetrics.isActive ? '음성 분석 중' : '침묵 구간') : '음성 분석 대기'}</span>
                </div>
              )}
              {isRecording && <div className="recording-badge"><i /> REC</div>}
              {isRecording && cameraOn && (
                <div className="live-meters">
                  <div className="meter-row"><span>말 속도</span><div className="meter-bar"><i style={{ width: `${Math.min(100, (liveAverages.wpm / 200) * 100)}%` }} /></div><b>{liveAverages.wpm}</b></div>
                  <div className="meter-row"><span>떨림</span><div className="meter-bar"><i style={{ width: `${liveAverages.tremor}%`, background: liveAverages.tremor > 50 ? '#df655c' : '#55a7ed' }} /></div><b>{liveAverages.tremor}</b></div>
                  <div className="meter-row"><span>시선</span><div className="meter-bar"><i style={{ width: `${liveAverages.gaze}%`, background: '#47b87b' }} /></div><b>{liveAverages.gaze}%</b></div>
                </div>
              )}
              {phase === 'user-responding' && (
                <div className="turn-prompt">
                  <Mic size={16} />
                  <span>당신 차례 — 말해보세요</span>
                  {liveTranscript && <em>{liveTranscript}</em>}
                </div>
              )}
            </div>
            {(voiceError || faceError) && (
              <div className="error-banner">
                <X size={14} />
                <span>{voiceError || faceError}</span>
              </div>
            )}
            <div className="controls">
              <button className={`control ${micOn ? '' : 'off'}`} onClick={() => setMicOn((value) => !value)}>
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                <span>{micOn ? '마이크 켜짐' : '마이크 꺼짐'}</span>
              </button>
              <button className={`control ${cameraOn ? '' : 'off'}`} onClick={() => setCameraOn((value) => !value)}>
                {cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
                <span>{cameraOn ? '카메라 켜짐' : '카메라 꺼짐'}</span>
              </button>
              <button className="control" onClick={reset}><RotateCcw size={17} /><span>다시 시작</span></button>
              {phase === 'user-responding' && (
                <button className="control next-turn" onClick={skipTurn}>
                  <ArrowRight size={16} />
                  <span>다음 대화</span>
                </button>
              )}
              <button className={`start-button ${isRecording ? 'stop' : ''}`} onClick={toggleRecording}>
                {isRecording ? <Pause size={18} /> : <Play size={18} />}
                <span>{isRecording ? '리허설 종료' : '리허설 시작'}</span>
              </button>
            </div>
          </div>

          <div className="feedback-panel">
            <div className="panel-heading">
              <div>
                <h3>실시간 피드백</h3>
                <span>당신의 강점과 다음 시도를 발견해요.</span>
              </div>
              <span className={`analysis-status ${isRecording ? 'rec' : ''}`}>
                <i /> {showLive ? '분석 중' : showResults ? '분석 완료' : '대기 중'}
              </span>
            </div>

            <div className="score-card">
              <div>
                <span className="eyebrow">{showResults ? '이번 리허설 점수' : '현재 리허설 점수'}</span>
                <strong>{showResults ? feedback!.overallScore : showLive ? '—' : '—'}<small>/100</small></strong>
              </div>
              <div className={`score-ring ${showResults ? 'filled' : ''}`}>
                <span>{showResults ? (feedback!.overallScore >= 80 ? '좋아요' : feedback!.overallScore >= 60 ? '괜찮아요' : '응원해요') : showLive ? '분석 중' : '시작 전'}</span>
              </div>
            </div>

            <div className="metrics">
              <div className="metric">
                <span>말 속도</span>
                <strong className={wpmInfo.tone}>{showWaiting ? '—' : wpmInfo.text}</strong>
                <small>{showWaiting ? '리허설을 시작하면 보여드려요' : wpmInfo.note}</small>
              </div>
              <div className="metric">
                <span>목소리 떨림</span>
                <strong className={tremorInfo.tone}>{showWaiting ? '—' : tremorInfo.text}</strong>
                <small>{showWaiting ? '리허설을 시작하면 보여드려요' : tremorInfo.note}</small>
              </div>
              <div className="metric">
                <span>시선 집중도</span>
                <strong className={gazeInfo.tone}>{showWaiting ? '—' : gazeInfo.text}</strong>
                <small>{showWaiting ? '리허설을 시작하면 보여드려요' : gazeInfo.note}</small>
              </div>
            </div>

            <div className="tips">
              <div className="tips-title"><Lightbulb size={16} /> AI 코치의 한마디</div>
              {showResults && feedback ? (
                feedback.tips.map((tip, index) => (
                  <div className={`tip ${index === 0 ? 'featured' : ''}`} key={index}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <p>{tip}</p>
                  </div>
                ))
              ) : showLive ? (
                <div className="tip featured"><span>··</span><p>지금 분석 중이에요. 리허설을 마치면 맞춤 피드백이 도착해요.</p></div>
              ) : (
                <div className="tip featured"><span>01</span><p>리허설을 시작하면 상대방과 대화하며 실시간으로 분석해요.</p></div>
              )}
            </div>

            {showResults && feedback && (
              <div className="save-section">
                {savedId ? (
                  <div className="save-success"><Check size={16} /><span>이번 리허설이 기록에 저장되었어요.</span></div>
                ) : (
                  <button className="save-button" onClick={saveSession} disabled={isSaving}>
                    {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    <span>{isSaving ? '저장하는 중...' : '이번 리허설 저장하기'}</span>
                  </button>
                )}
                {saveError && <div className="save-error"><X size={14} /><span>{saveError}</span></div>}
              </div>
            )}
          </div>
        </section>

        <section className="opponent-and-dialogue">
          <OpponentPanel
            opponent={scenario.opponent}
            phase={phase}
            currentLine={currentOpponentLine}
            isSpeaking={isSpeaking}
            turnNumber={turnNumber}
            totalTurns={totalTurns}
            muted={opponentMuted}
            onToggleMute={() => setOpponentMuted((v) => !v)}
          />
          <DialogueTranscript
            dialogue={dialogue}
            liveTranscript={liveTranscript}
            visible={isRecording || isFinished}
          />
        </section>

        <section className="insight-strip">
          <div className="insight-icon"><Sparkles size={20} /></div>
          <div>
            <span className="eyebrow">사회적 리허설이 도와주는 것</span>
            <strong>"잘해야 한다"보다 "한 번 해봤다"는 감각을 만들어요.</strong>
          </div>
          <button>리허설 가이드 보기 <ArrowRight size={16} /></button>
        </section>
        <footer>
          <span>nudge on · 작은 신호가 다시 세상과 연결되는 순간</span>
          <span>분석은 참고용이며, 당신을 평가하지 않아요.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
