import { Mic, MicOff, Volume2 } from 'lucide-react';
import type { Opponent, ConversationPhase } from '@/data/opponents';

type Props = {
  opponent: Opponent;
  phase: ConversationPhase;
  currentLine: string;
  isSpeaking: boolean;
  turnNumber: number;
  totalTurns: number;
  muted: boolean;
  onToggleMute: () => void;
};

export function OpponentPanel({
  opponent,
  phase,
  currentLine,
  isSpeaking,
  turnNumber,
  totalTurns,
  muted,
  onToggleMute,
}: Props) {
  const isActive = phase === 'opponent-speaking';

  return (
    <div className={`opponent-panel ${isActive ? 'speaking' : ''} ${phase === 'waiting' ? 'idle' : ''}`}>
      <div className="panel-heading">
        <div>
          <h3>
            <span className={`live-pill ${isActive ? 'speaking-pill' : ''}`}>
              {isActive ? '● 말하는 중' : phase === 'user-responding' ? '대기 중' : '준비됨'}
            </span>
            상대방
          </h3>
          <span>{opponent.role} · {opponent.description}</span>
        </div>
        <button className={`control small ${muted ? 'off' : ''}`} onClick={onToggleMute}>
          {muted ? <MicOff size={16} /> : <Volume2 size={16} />}
          <span>{muted ? '음소거' : '소리 켜짐'}</span>
        </button>
      </div>

      <div className="opponent-stage">
        <img
          src={opponent.portrait}
          alt={opponent.name}
          className={`opponent-portrait ${isSpeaking ? 'talking' : ''}`}
        />
        {isSpeaking && (
          <>
            <div className="opponent-speaking-ring" />
            <div className="opponent-speaking-ring delay" />
          </>
        )}
        <div className="opponent-info">
          <strong>{opponent.name}</strong>
          <span>{opponent.role}</span>
        </div>
        {phase === 'opponent-speaking' && (
          <div className="opponent-subtitle">
            <p>{currentLine}</p>
          </div>
        )}
        {phase === 'user-responding' && (
          <div className="opponent-subtitle your-turn">
            <Mic size={14} />
            <p>당신 차례입니다 — 자연스럽게 대답해 보세요.</p>
          </div>
        )}
      </div>

      <div className="turn-indicator">
        {Array.from({ length: totalTurns }).map((_, i) => (
          <span key={i} className={`turn-dot ${i < turnNumber ? 'done' : ''} ${i === turnNumber ? 'current' : ''}`} />
        ))}
        <span className="turn-count">대화 {Math.min(turnNumber + 1, totalTurns)} / {totalTurns}</span>
      </div>
    </div>
  );
}
