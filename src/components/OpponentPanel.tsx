import { Camera, CameraOff, Mic, MicOff, Volume2 } from 'lucide-react';
import type { Scenario } from '@/data/opponents';

type Props = {
  scenario: Scenario;
  isSpeaking: boolean;
  isWaiting: boolean;
  isUserTurn: boolean;
  currentLine: string;
  muted: boolean;
  cameraOn: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
};

export function OpponentPanel({
  scenario,
  isSpeaking,
  isWaiting,
  isUserTurn,
  currentLine,
  muted,
  cameraOn,
  onToggleMute,
  onToggleCamera,
}: Props) {
  const isActive = isSpeaking;

  return (
    <div className={`opponent-card ${isActive ? 'speaking' : ''} ${isWaiting ? 'idle' : ''}`}>
      <div className="opponent-portrait-wrap">
        <img src={scenario.portrait} alt={scenario.opponentName} className={`opponent-portrait ${isSpeaking ? 'talking' : ''}`} />
        {isSpeaking && (<><div className="opponent-speaking-ring" /><div className="opponent-speaking-ring delay" /></>)}
        <div className="opponent-info"><strong>{scenario.opponentName}</strong><span>{scenario.opponentRole}</span></div>
        <div className="opponent-status-bar">
          <span className={`opponent-status-pill ${isActive ? 'speaking' : ''}`}><span className="dot" />{isActive ? '말하는 중' : isUserTurn ? '대기 중' : '준비됨'}</span>
        </div>
        {isSpeaking && currentLine && (<div className="opponent-subtitle"><p>{currentLine}</p></div>)}
        {isUserTurn && (<div className="opponent-subtitle your-turn"><Mic size={14} color="#F4E7CA" /><p>당신 차례입니다 — 자연스럽게 대답해 보세요.</p></div>)}
      </div>
      <div className="opponent-controls">
        <button className={`opp-btn ${muted ? 'muted' : 'active'}`} onClick={onToggleMute} aria-label={muted ? '음소거 해제' : '음소거'}>{muted ? <MicOff size={15} /> : <Volume2 size={15} />}<span>{muted ? '음소거' : '소리 켜짐'}</span></button>
        <button className={`opp-btn ${cameraOn ? 'active' : ''}`} onClick={onToggleCamera} aria-label={cameraOn ? '카메라 끄기' : '카메라 켜기'}>{cameraOn ? <Camera size={15} /> : <CameraOff size={15} />}<span>{cameraOn ? '카메라 켜짐' : '카메라 꺼짐'}</span></button>
      </div>
    </div>
  );
}
