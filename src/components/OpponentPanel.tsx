import { Mic, Volume2, VolumeX } from 'lucide-react';
import type { Scenario } from '@/data/opponents';

type Props = {
  scenario: Scenario;
  isSpeaking: boolean;
  isWaiting: boolean;
  isUserTurn: boolean;
  currentLine: string;
  muted: boolean;
  onToggleMute: () => void;
};

export function OpponentPanel({
  scenario,
  isSpeaking,
  isWaiting,
  isUserTurn,
  currentLine,
  muted,
  onToggleMute,
}: Props) {
  const isActive = isSpeaking;

  return (
    <div className={`opponent-card ${isActive ? 'speaking' : ''} ${isWaiting ? 'idle' : ''}`}>
      <div className="opponent-main">
        <div className="opponent-portrait-wrap">
          <img src={scenario.portrait} alt={scenario.opponentName} className={`opponent-portrait ${isSpeaking ? 'talking' : ''}`} />
          {isSpeaking && (<><div className="opponent-speaking-ring" /><div className="opponent-speaking-ring delay" /></>)}
        </div>
        <div className="opponent-content">
          <div className="opponent-info"><strong>{scenario.opponentName}</strong><span>{scenario.opponentRole}</span></div>
          <div className="opponent-status-bar">
            <span className={`opponent-status-pill ${isActive ? 'speaking' : ''}`}><span className="dot" />{isActive ? '말하는 중' : isUserTurn ? '대기 중' : '준비됨'}</span>
          </div>
          {isSpeaking && currentLine && (<div className="opponent-subtitle"><p>{currentLine}</p></div>)}
          {isUserTurn && (<div className="opponent-subtitle your-turn"><Mic size={14} /><p>당신 차례예요. 편한 방식으로 답해보세요.</p></div>)}
        </div>
      </div>
      <div className="opponent-controls">
        <span className="opponent-control-label">AI 상대 대사</span>
        <button className={`opp-btn ${muted ? 'muted' : 'active'}`} onClick={onToggleMute} aria-label={muted ? '상대 대사 음성 켜기' : '상대 대사 음성 끄기'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}<span>{muted ? '대사 음성 켜기' : '대사 음성 끄기'}</span></button>
      </div>
    </div>
  );
}
