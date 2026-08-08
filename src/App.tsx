import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  Eye,
  Lightbulb,
  Mic,
  RotateCcw,
  Save,
  Send,
  Volume2,
} from 'lucide-react';
import { useVoiceAnalysis } from '@/hooks/useVoiceAnalysis';
import { useFaceAnalysis } from '@/hooks/useFaceAnalysis';
import { useKoreanTTS } from '@/hooks/useKoreanTTS';
import { supabase } from '@/lib/supabase';
import { SCENARIOS } from '@/data/opponents';
import type { Scenario, ChatMessage } from '@/data/opponents';
import { OpponentPanel } from '@/components/OpponentPanel';
import { DialogueTranscript } from '@/components/DialogueTranscript';

type Phase = 'idle' | 'speaking' | 'user-turn' | 'finished';

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

  if (dialogueCount >= 2) tips.push(`${dialogueCount}번의 대화를 주고받았어요. 자연스럽게 이어가는 연습이 잘 되고 있어요.`);

  return { wpm, tremor, gazeFocus, volume, overallScore, tips };
}

async function askAI(messages: ChatMessage[], scenario: Scenario): Promise<{ reply: string; coach: string }> {
  const history = messages
    .filter((m) => m.role !== 'coach')
    .map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: history,
      system: `너는 사회적 리허설 상대다. 역할: ${scenario.who}. 상황: ${scenario.title}.
상대는 오래 사람을 만나지 않은 청년이다. 절대 냉담하거나 무례하지 않다.
말투는 현실적이되 따뜻하고, 2~3문장으로 짧게. 실제로 그 사람이 할 법한 대화만 한다.
그리고 마지막에 한 줄, 사용자에게 주는 짧은 코칭을 붙인다.
형식: 대화 내용 → 줄바꿈 → "COACH: 코칭 한 문장"`,
    }),
  });

  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const text = (data.text || '').trim();
  const [replyPart, coachPart] = text.split(/COACH\s*:/);
  return {
    reply: replyPart.trim(),
    coach: coachPart ? coachPart.trim() : '',
  };
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [currentLine, setCurrentLine] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');

  const { metrics: voiceMetrics, error: voiceError } = useVoiceAnalysis(phase === 'user-turn' || phase === 'speaking', true);
  const { metrics: faceMetrics, error: faceError } = useFaceAnalysis((phase === 'user-turn' || phase === 'speaking') && cameraOn, cameraOn, videoRef);
  const { speak: speakTTS, stop: stopTTS, isSpeaking: ttsSpeaking } = useKoreanTTS();

  const wpmAvgRef = useRef<number[]>([]);
  const tremorAvgRef = useRef<number[]>([]);
  const gazeAvgRef = useRef<number[]>([]);
  const volumeAvgRef = useRef<number[]>([]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'finished') return;
    const timer = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

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
    if (phase === 'idle' || phase === 'finished') return;
    wpmAvgRef.current.push(voiceMetrics.wpm);
    if (wpmAvgRef.current.length > 120) wpmAvgRef.current.shift();
    tremorAvgRef.current.push(voiceMetrics.tremor);
    if (tremorAvgRef.current.length > 120) tremorAvgRef.current.shift();
    gazeAvgRef.current.push(faceMetrics.gazeFocus);
    if (gazeAvgRef.current.length > 120) gazeAvgRef.current.shift();
    volumeAvgRef.current.push(voiceMetrics.volume);
    if (volumeAvgRef.current.length > 120) volumeAvgRef.current.shift();
  }, [voiceMetrics, faceMetrics, phase]);

  const avg = (arr: number[]) => (arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length));

  const liveAverages = {
    wpm: avg(wpmAvgRef.current),
    tremor: avg(tremorAvgRef.current),
    gaze: avg(gazeAvgRef.current),
    volume: avg(volumeAvgRef.current),
  };

  const feedback = isFinished
    ? buildFeedback(
        liveAverages.wpm,
        liveAverages.tremor,
        liveAverages.gaze,
        liveAverages.volume,
        elapsed,
        messages.filter((m) => m.role === 'me').length,
      )
    : null;

  const startScenario = useCallback((sc: Scenario) => {
    setScenario(sc);
    setMessages([{ role: 'them', text: sc.open }]);
    setCurrentLine(sc.open);
    setPhase('speaking');
    setIsFinished(false);
    setElapsed(0);
    setSavedId(null);
    setSaveError(null);
    wpmAvgRef.current = [];
    tremorAvgRef.current = [];
    gazeAvgRef.current = [];
    volumeAvgRef.current = [];

    if (!muted) {
      speakTTS(sc.open, () => {
        setPhase('user-turn');
      });
    } else {
      window.setTimeout(() => setPhase('user-turn'), 2000);
    }
  }, [muted, speakTTS]);

  const send = useCallback(async () => {
    if (!scenario || busy || phase !== 'user-turn') return;
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    const newMessages = [...messages, { role: 'me' as const, text }];
    setMessages(newMessages);
    setBusy(true);
    setPhase('speaking');

    try {
      const { reply, coach } = await askAI(newMessages, scenario);
      const updated = [...newMessages, { role: 'them' as const, text: reply }];
      if (coach) updated.push({ role: 'coach' as const, text: '코칭 · ' + coach });
      setMessages(updated);
      setCurrentLine(reply);

      if (!muted) {
        speakTTS(reply, () => {
          setPhase('user-turn');
        });
      } else {
        window.setTimeout(() => setPhase('user-turn'), 2000);
      }
    } catch {
      const fallback = '네, 편하게 말씀해 주세요. 천천히 하셔도 괜찮습니다.';
      const fallbackCoach = '코칭 · 지금처럼 한 문장만 써도 충분히 전달돼요.';
      setMessages([...newMessages, { role: 'them', text: fallback }, { role: 'coach', text: fallbackCoach }]);
      setCurrentLine(fallback);
      if (!muted) {
        speakTTS(fallback, () => setPhase('user-turn'));
      } else {
        window.setTimeout(() => setPhase('user-turn'), 2000);
      }
    } finally {
      setBusy(false);
    }
  }, [scenario, busy, phase, inputText, messages, muted, speakTTS]);

  const finishRehearsal = useCallback(() => {
    setPhase('finished');
    setIsFinished(true);
    stopTTS();
    setSavedId(null);
    setSaveError(null);
  }, [stopTTS]);

  const reset = useCallback(() => {
    setScenario(null);
    setMessages([]);
    setPhase('idle');
    setIsFinished(false);
    setElapsed(0);
    setCurrentLine('');
    setInputText('');
    setSavedId(null);
    setSaveError(null);
    stopTTS();
    wpmAvgRef.current = [];
    tremorAvgRef.current = [];
    gazeAvgRef.current = [];
    volumeAvgRef.current = [];
  }, [stopTTS]);

  const saveSession = async () => {
    if (!feedback || !scenario) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from('social_rehearsal_sessions')
        .insert({
          scenario: scenario.title,
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

  const isWaiting = phase === 'idle';
  const isSpeaking = phase === 'speaking';
  const isUserTurn = phase === 'user-turn';
  const showResults = isFinished && feedback !== null;
  const userTurns = messages.filter((m) => m.role === 'me').length;

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
          {!scenario && (
            <>
              <div className="eyebrow">03 — Social Rehearsal</div>
              <h2 className="mid" tabIndex={-1}>실전 말고, 먼저 여기서 한 번</h2>
              <p className="lede">틀려도 아무 일도 일어나지 않는 자리에서 먼저 해봐요.
              AI가 상대 역할을 맡고, 옆에서 짧게 코칭해줄게요. 그만두고 싶으면 그냥 나가면 돼요.</p>
              <div className="scenario-grid">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    className="scenario-card-btn"
                    onClick={() => startScenario(s)}
                  >
                    <span className="sc-icon"><Mic size={18} /></span>
                    <span>
                      <span className="sc-title">{s.title}</span>
                      <span className="sc-desc">{s.who}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="note">카메라를 켜면 상대방의 표정과 당신의 시선·말 속도를 함께 분석해요.
              카메라가 부담된다면 끄고 텍스트로만 대화해도 괜찮아요 — 핵심은 연습하는 것.</p>
            </>
          )}

          {scenario && (
            <>
              <div className="eyebrow">03 — {scenario.title}</div>
              <h2 className="mid" tabIndex={-1}>{scenario.title}</h2>

              <div className="rehearsal-layout">
                <div>
                  <OpponentPanel
                    scenario={scenario}
                    isSpeaking={ttsSpeaking || isSpeaking}
                    isWaiting={isWaiting}
                    isUserTurn={isUserTurn}
                    currentLine={currentLine}
                    turnNumber={userTurns}
                    totalTurns={Math.max(4, userTurns + 2)}
                    muted={muted}
                    cameraOn={cameraOn}
                    onToggleMute={() => setMuted((v) => !v)}
                    onToggleCamera={() => setCameraOn((v) => !v)}
                  />

                  <div className="camera-card" style={{ marginTop: 16 }}>
                    <div className="camera-header">
                      <h3>나의 리허설</h3>
                      <span className={`live-pill ${isSpeaking || isUserTurn ? 'rec' : ''}`}>
                        {isSpeaking || isUserTurn ? '● LIVE' : 'READY'}
                      </span>
                    </div>
                    <div className="camera-stage">
                      {cameraOn ? (
                        <video ref={videoRef} autoPlay muted playsInline />
                      ) : (
                        <div className="camera-placeholder">
                          <CameraOff size={28} />
                          <span>카메라가 꺼져 있어요</span>
                        </div>
                      )}
                      {cameraOn && (isSpeaking || isUserTurn) && (
                        <div className="camera-overlay">
                          <span className={faceMetrics.faceDetected ? 'active' : ''}>
                            <Eye size={11} /> {faceMetrics.faceDetected ? '시선 분석 중' : '얼굴 찾는 중'}
                          </span>
                          <span className={voiceMetrics.isActive ? 'active' : ''}>
                            <Volume2 size={11} /> {voiceMetrics.isActive ? '음성 분석 중' : '대기'}
                          </span>
                        </div>
                      )}
                      {(isSpeaking || isUserTurn) && cameraOn && (
                        <div className="live-meters">
                          <div className="meter-row">
                            <span>말속도</span>
                            <div className="meter-bar"><i style={{ width: `${Math.min(100, (liveAverages.wpm / 200) * 100)}%` }} /></div>
                            <b>{liveAverages.wpm}</b>
                          </div>
                          <div className="meter-row">
                            <span>떨림</span>
                            <div className="meter-bar"><i style={{ width: `${liveAverages.tremor}%`, background: liveAverages.tremor > 50 ? '#C9922F' : '#6F8F80' }} /></div>
                            <b>{liveAverages.tremor}</b>
                          </div>
                          <div className="meter-row">
                            <span>시선</span>
                            <div className="meter-bar"><i style={{ width: `${liveAverages.gaze}%`, background: '#6F8F80' }} /></div>
                            <b>{liveAverages.gaze}%</b>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="camera-controls">
                      <button className={`cam-btn ${cameraOn ? '' : 'off'}`} onClick={() => setCameraOn((v) => !v)}>
                        {cameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
                        <span>{cameraOn ? '카메라 켜짐' : '카메라 꺼짐'}</span>
                      </button>
                      <button className="cam-btn" onClick={reset}>
                        <RotateCcw size={14} />
                        <span>다시 시작</span>
                      </button>
                      {isUserTurn && (
                        <button className="cam-btn" onClick={finishRehearsal} style={{ borderColor: 'var(--sage)', color: 'var(--sage-deep)' }}>
                          <Check size={14} />
                          <span>연습 끝내기</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <DialogueTranscript
                    messages={messages}
                    busy={busy}
                    portrait={scenario.portrait}
                    opponentName={scenario.opponentName}
                  />
                  <div className="composer">
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="편한 말로 써도 돼요. 완벽하지 않아도 괜찮아요."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    <button className="btn" onClick={send} disabled={busy || phase !== 'user-turn'}>
                      <Send size={15} />
                    </button>
                  </div>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn ghost" onClick={finishRehearsal}>연습 끝내고 결과 보기</button>
                  </div>
                </div>
              </div>

              {showResults && feedback && (
                <>
                  <div className="score-row">
                    <div className="score-card-mini">
                      <div className="label">이번 리허설 점수</div>
                      <div className="value">{feedback.overallScore}<span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>/100</span></div>
                      <div className="note-small">{feedback.overallScore >= 80 ? '좋아요' : feedback.overallScore >= 60 ? '괜찮아요' : '응원해요'}</div>
                    </div>
                    <div className="score-card-mini">
                      <div className="label">대화 주고받음</div>
                      <div className="value">{userTurns}번</div>
                      <div className="note-small">자연스럽게 이어가는 연습</div>
                    </div>
                    <div className="score-card-mini">
                      <div className="label">진행 시간</div>
                      <div className="value">{elapsed}초</div>
                      <div className="note-small">충분히 시도했어요</div>
                    </div>
                  </div>

                  <div className="tips-section">
                    <div className="tips-title"><Lightbulb size={16} /> AI 코치의 한마디</div>
                    {feedback.tips.map((tip, i) => (
                      <div className={`tip-item ${i === 0 ? 'featured' : ''}`} key={i}>
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <p>{tip}</p>
                      </div>
                    ))}
                  </div>

                  <div className="save-section">
                    {savedId ? (
                      <div className="save-success">
                        <Check size={16} />
                        <span>이번 리허설이 기록에 저장되었어요.</span>
                      </div>
                    ) : (
                      <button className="save-btn" onClick={saveSession} disabled={isSaving}>
                        {isSaving ? <RotateCcw size={16} className="spin-icon" /> : <Save size={16} />}
                        <span>{isSaving ? '저장하는 중...' : '이번 리허설 저장하기'}</span>
                      </button>
                    )}
                    {saveError && <div className="save-error">{saveError}</div>}
                  </div>

                  <div className="row">
                    <button className="btn" onClick={reset}>다른 상황 연습하기</button>
                  </div>
                </>
              )}

              {!showResults && (
                <p className="note">카메라를 켜면 상대방을 보며 연습할 수 있고, 당신의 말 속도·떨림·시선을 분석해요.
                카메라가 부담된다면 끄고 텍스트로만 대화해도 괜찮아요.</p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
