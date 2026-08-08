import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import type { DialogueEntry } from '@/data/opponents';

type Props = {
  dialogue: DialogueEntry[];
  liveTranscript: string;
  visible: boolean;
};

export function DialogueTranscript({ dialogue, liveTranscript, visible }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dialogue, liveTranscript]);

  if (!visible) return null;

  return (
    <div className="dialogue-transcript">
      <div className="transcript-header">
        <MessageCircle size={15} />
        <span>대화 기록</span>
      </div>
      <div className="transcript-body" ref={scrollRef}>
        {dialogue.length === 0 && !liveTranscript && (
          <div className="transcript-empty">리허설을 시작하면 대화가 여기에 기록돼요.</div>
        )}
        {dialogue.map((entry, i) => (
          <div key={i} className={`transcript-line ${entry.speaker}`}>
            <span className="speaker-label">{entry.speaker === 'opponent' ? '상대방' : '나'}</span>
            <p>{entry.text}</p>
          </div>
        ))}
        {liveTranscript && (
          <div className="transcript-line user live">
            <span className="speaker-label">나</span>
            <p>{liveTranscript}<span className="cursor">▎</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
