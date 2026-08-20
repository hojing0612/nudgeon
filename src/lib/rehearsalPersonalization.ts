export type RehearsalDifficulty = 'gentle' | 'standard' | 'realistic';

export type JourneySnapshot = {
  level: number;
  barrier: string;
  barrierLabel: string;
  vision: string;
  microstepText: string;
  helpRequest: string;
  goalTags: string[];
};

export function readJourneySnapshot(raw: string | null): JourneySnapshot {
  try {
    const saved = JSON.parse(raw || 'null');
    const profile = saved?.profile || {};
    const micro = Array.isArray(saved?.micro) ? saved.micro : [];
    const selected = Number.isInteger(saved?.selectedMicroIndex)
      ? micro[saved.selectedMicroIndex]
      : micro.find((step: { done?: boolean }) => step?.done);
    return {
      level: Math.max(1, Math.min(5, Number(profile.level) || 3)),
      barrier: String(profile.barrier || ''),
      barrierLabel: String(profile.barrierLabel || ''),
      vision: String(profile.vision || ''),
      microstepText: String(selected?.text || ''),
      helpRequest: String(profile.helpRequest || ''),
      goalTags: Array.isArray(profile.goalTags) ? profile.goalTags.map(String).slice(0, 5) : [],
    };
  } catch {
    return { level: 3, barrier: '', barrierLabel: '', vision: '', microstepText: '', helpRequest: '', goalTags: [] };
  }
}

export function personalizationSummary(snapshot: JourneySnapshot): string {
  const parts = [snapshot.barrierLabel, snapshot.microstepText, snapshot.helpRequest].filter(Boolean);
  return parts.slice(0, 2).join(' · ') || '현재 상태와 바라는 변화';
}

export function recommendScenarioId(snapshot: JourneySnapshot): string {
  const text = snapshot.microstepText;
  if (/카페|메뉴|음료|주문|키오스크/.test(text)) return 'cafe';
  if (/도서관|책 위치|청구기호/.test(text)) return 'library';
  if (/교수|메일|학교|수업|과제/.test(text)) return 'prof';
  if (/친구|답장|메시지|연락/.test(text)) return 'friend';
  if (/상담|마음|도움 요청/.test(text)) return 'center';
  if (/신청|기관|지원|프로그램|취업|구직|면접/.test(text)) return 'apply';
  if (snapshot.vision === 'study') return 'prof';
  if (snapshot.vision === 'social' || snapshot.barrier === 'contact') return 'friend';
  if (snapshot.vision === 'work' || snapshot.barrier === 'judged') return 'apply';
  return 'center';
}

export function recommendDifficulty(level: number, burden?: number | null): RehearsalDifficulty {
  if (burden !== null && burden !== undefined) {
    if (burden >= 4) return 'gentle';
    if (burden <= 2 && level >= 4) return 'realistic';
  }
  if (level <= 2) return 'gentle';
  if (level >= 5) return 'realistic';
  return 'standard';
}

export const DIFFICULTY_META: Record<RehearsalDifficulty, { label: string; description: string; targetTurns: number }> = {
  gentle: { label: '가볍게', description: '짧은 문장과 선택지를 중심으로 연습해요.', targetTurns: 2 },
  standard: { label: '보통', description: '실제와 비슷하게 한 번에 질문 하나씩 받아요.', targetTurns: 3 },
  realistic: { label: '실제처럼', description: '추가 질문과 확인까지 포함해 연습해요.', targetTurns: 4 },
};

export function completedGoalCount(turns: number, goalCount: number): number {
  return Math.min(Math.max(0, turns), goalCount);
}

export function behaviorFeedback(turns: number, helpCount: number, rewriteCount: number): string[] {
  const feedback: string[] = [];
  if (turns > 0) feedback.push('첫 문장을 시작했어요.');
  if (turns >= 2) feedback.push('상대의 질문을 받고 대화를 이어갔어요.');
  if (turns >= 3) feedback.push('필요한 내용을 구체적으로 전달했어요.');
  if (helpCount > 0) feedback.push('막힌 순간에 문장 도움을 활용했어요.');
  if (rewriteCount > 0) feedback.push('내 표현을 더 편한 문장으로 다듬었어요.');
  return feedback.length ? feedback : ['연습 화면까지 와서 상황을 살펴봤어요.'];
}

export function fallbackCoach(turn: number, goal: string, userText: string): string {
  const compact = userText.trim().length <= 18;
  if (turn <= 1) return compact
    ? `첫 문장으로 ${goal}을 시작했어요. 다음에는 원하는 도움을 한 가지만 덧붙여 보세요.`
    : `첫 문장에서 상황을 설명했어요. 다음에는 상대에게 원하는 행동을 한 문장으로 말해보세요.`;
  if (turn === 2) return `상대 질문에 답하며 대화를 이어갔어요. 이제 ${goal}에 필요한 조건을 하나 확인해보세요.`;
  return `필요한 내용을 ${turn}번 주고받았어요. 마지막으로 다음 행동이나 일정을 확인하면 실전 문장이 완성돼요.`;
}
