export type OpponentLine = {
  text: string;
  followUp?: string;
};

export type Opponent = {
  id: string;
  name: string;
  role: string;
  portrait: string;
  description: string;
  lines: OpponentLine[];
};

export type Scenario = {
  id: string;
  label: string;
  prompt: string;
  opponent: Opponent;
};

const interviewOpponent: Opponent = {
  id: 'interviewer',
  name: '박서연',
  role: '면접관',
  portrait: '/opponent-interviewer.webp',
  description: '친근하지만 놓치는 게 없는 HR 팀장',
  lines: [
    { text: '안녕하세요, 오늘 면접에 오신 것을 환영합니다. 편하게 앉으세요.' },
    { text: '먼저, 간단하게 자기소개를 부탁드릴게요. 1분 정도로 말씀해 주세요.' },
    { text: '감사합니다. 지금까지의 경험 중에서 가장 자랑스러운 것이 있다면요?' },
    { text: '좋습니다. 마지막으로, 우리 회사에서 어떤 일을 해보고 싶으신가요?' },
    { text: '오늘 소중한 시간 내어주셔서 감사합니다. 좋은 결과 기대할게요.' },
  ],
};

const presentationOpponent: Opponent = {
  id: 'colleague',
  name: '이정훈',
  role: '발표 진행자',
  portrait: '/opponent-colleague.webp',
  description: '친근하게 분위기를 이끌어주는 진행자',
  lines: [
    { text: '자, 그러면 다음 발표자를 소개하겠습니다. 준비되셨죠?' },
    { text: '네, 무대에 오르셔도 됩니다. 편하게 시작해 주세요.' },
    { text: '발표 잘 들었습니다. 혹시 청중에게 한마디 덧붙이실 게 있으신가요?' },
    { text: '감사합니다. 훌륭한 발표였습니다. 큰 박수 부탁드립니다.' },
  ],
};

const greetingOpponent: Opponent = {
  id: 'stranger',
  name: '최유나',
  role: '처음 만난 사람',
  portrait: '/opponent-stranger.webp',
  description: '처음 만났지만 금방 친해질 수 있는 사람',
  lines: [
    { text: '안녕하세요! 혹시 저 여기 처음 와서요, 혹시 이 자리 괜찮을까요?' },
    { text: '감사합니다! 아, 혹시 어떤 일 하시는 거예요? 편하게 말씀해 주세요.' },
    { text: '와, 정말 흥미롭네요. 저도 비슷한 관심이 있어서 신기하다.' },
    { text: '오늘 만나서 정말 반가웠어요. 다음에 또 뵐 수 있으면 좋겠네요!' },
  ],
};

const conflictOpponent: Opponent = {
  id: 'coworker',
  name: '김도현',
  role: '동료',
  portrait: '/opponent-coworker.webp',
  description: '도움이 필요하지만 당신도 바쁜 상황인 동료',
  lines: [
    { text: '저기, 혹시 지금 잠깐 시간 있으세요? 제가 하나 급한 게 있어서요.' },
    { text: '이번 주까지 끝내야 하는데, 혼자 하기엔 좀 벅찰 것 같아서요. 도움 주실 수 있을까요?' },
    { text: '아, 그러시군요. 그럼 혹시 일정이 좀 여유로워지실 때까지만이라도 도움 주시면 안 될까요?' },
    { text: '네, 이해했습니다. 그래도 말씀해 주셔서 감사해요. 또 다른 방법을 찾아볼게요.' },
  ],
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'interview',
    label: '면접 자기소개',
    prompt: '"안녕하세요, 저는 김민지입니다..." 1분 자기소개를 해보세요.',
    opponent: interviewOpponent,
  },
  {
    id: 'presentation',
    label: '발표 첫 인사',
    prompt: '"오늘 발표를 맡은 김민지입니다..." 시작 인사를 해보세요.',
    opponent: presentationOpponent,
  },
  {
    id: 'greeting',
    label: '첫 만남 인사',
    prompt: '처음 만난 사람에게 가볍게 인사하며 자신을 소개해보세요.',
    opponent: greetingOpponent,
  },
  {
    id: 'conflict',
    label: '어려운 대화',
    prompt: '동료에게 부탁을 정중하게 거절하는 상황을 연습해보세요.',
    opponent: conflictOpponent,
  },
];

export type DialogueEntry = {
  speaker: 'opponent' | 'user';
  text: string;
  timestamp: number;
};

export type ConversationPhase = 'waiting' | 'opponent-speaking' | 'user-responding' | 'finished';
