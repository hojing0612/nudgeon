export type Scenario = {
  id: string;
  title: string;
  who: string;
  open: string;
  portrait: string;
  opponentName: string;
  opponentRole: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'center',
    title: '상담센터에 처음 전화하기',
    who: '대학 학생상담센터 상담 접수 직원',
    open: '안녕하세요, 학생상담센터입니다. 무엇을 도와드릴까요?',
    portrait: '/opponent-stranger.webp',
    opponentName: '최유나',
    opponentRole: '상담 접수 직원',
  },
  {
    id: 'prof',
    title: '교수님께 늦은 메일 보내기',
    who: '오래 연락이 없던 학생을 반갑게 맞는 지도교수',
    open: '그래, 오랜만이구나. 어떻게 지냈니?',
    portrait: '/opponent-coworker.webp',
    opponentName: '김도현',
    opponentRole: '지도교수',
  },
  {
    id: 'friend',
    title: '오래 연락 못 한 친구에게 답장하기',
    who: '서운함 없이 반가워하는 오랜 친구',
    open: '어 왔네ㅋㅋ 잘 지냈어? 요즘 뭐하고 지내?',
    portrait: '/opponent-colleague.webp',
    opponentName: '이정훈',
    opponentRole: '오랜 친구',
  },
  {
    id: 'apply',
    title: '프로그램 신청 문의하기',
    who: '청년지원사업 담당 주무관',
    open: '네, 청년도전지원사업 담당입니다. 문의 주신 내용이 어떤 건가요?',
    portrait: '/opponent-interviewer.webp',
    opponentName: '박서연',
    opponentRole: '담당 주무관',
  },
];

export type ChatMessage = {
  role: 'them' | 'me' | 'coach';
  text: string;
};
