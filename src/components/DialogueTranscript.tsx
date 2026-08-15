import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/data/opponents';

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  portrait: string;
  opponentName: string;
};

export function DialogueTranscript({ messages, busy, portrait, opponentName }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  return (
    <div className="chat-panel">
      <div className="chat-title-row"><h3>대화 기록</h3><span>✓ 자동 임시저장</span></div>
      <div className="chat" ref={scrollRef}>
        {messages.map((m, i) => {
          if (m.role === 'coach') {
            return (
              <div key={i} className="msg coach">{m.text}</div>
            );
          }
          if (m.role === 'them') {
            return (
              <div key={i} className="msg them">
                <img src={portrait} alt={opponentName} />
                {m.text}
              </div>
            );
          }
          return (
            <div key={i} className="msg me">{m.text}</div>
          );
        })}
        {busy && <div className="spin">…생각하는 중</div>}
      </div>
    </div>
  );
}
