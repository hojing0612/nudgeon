export type Scenario = {
  id: string;
  title: string;
  who: string;
  open: string;
  portrait: string;
  opponentName: string;
  opponentRole: string;
  goals: string[];
  openings: {
    gentle: string;
    standard: string;
    realistic: string;
  };
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'center',
    title: '상담센터에 처음 전화하기',
    who: '대학 학생상담센터 상담 접수 직원',
    open: '안녕하세요, 학생상담센터입니다. 무엇을 도와드릴까요?',
    portrait: 'https://images.pexels.com/photos/4269206/pexels-photo-4269206.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    opponentName: '최유나',
    opponentRole: '상담 접수 직원',
    goals: ['인사를 건네기', '상담을 원하는 이유 말하기', '신청 방법이나 가능한 일정 묻기'],
    openings: {
      gentle: '안녕하세요, 학생상담센터입니다. 상담 신청을 원하시면 “상담받고 싶어요”라고만 말씀해도 괜찮아요.',
      standard: '안녕하세요, 학생상담센터입니다. 무엇을 도와드릴까요?',
      realistic: '학생상담센터입니다. 상담 신청 문의이신가요? 현재 어떤 도움을 원하시는지 간단히 말씀해 주시겠어요?',
    },
  },
  {
    id: 'prof',
    title: '교수님께 늦은 메일 보내기',
    who: '오래 연락이 없던 학생을 반갑게 맞는 지도교수',
    open: '그래, 오랜만이구나. 어떻게 지냈니?',
    portrait: 'https://images.pexels.com/photos/8617730/pexels-photo-8617730.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    opponentName: '김도현',
    opponentRole: '지도교수',
    goals: ['늦었지만 연락을 시작하기', '현재 상황을 필요한 만큼 설명하기', '원하는 다음 대화나 도움 요청하기'],
    openings: {
      gentle: '오랜만이구나. 길게 설명하지 않아도 괜찮으니, 오늘 연락한 이유만 편하게 말해보렴.',
      standard: '그래, 오랜만이구나. 어떻게 지냈니?',
      realistic: '오랜만이구나. 한동안 연락이 없어서 궁금했어. 지금 이야기하고 싶은 일이 있니?',
    },
  },
  {
    id: 'friend',
    title: '오래 연락 못 한 친구에게 답장하기',
    who: '서운함 없이 반가워하는 오랜 친구',
    open: '어 왔네ㅋㅋ 잘 지냈어? 요즘 뭐하고 지내?',
    portrait: 'https://images.pexels.com/photos/17503453/pexels-photo-17503453.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    opponentName: '이정훈',
    opponentRole: '오랜 친구',
    goals: ['답장을 시작하기', '연락이 늦은 이유를 원하는 만큼 전하기', '다음 연락의 크기 정하기'],
    openings: {
      gentle: '왔네! 반가워. 지금은 “오랜만이야”라고만 해도 돼.',
      standard: '어 왔네ㅋㅋ 잘 지냈어? 요즘 뭐하고 지내?',
      realistic: '진짜 오랜만이다. 한동안 연락이 없어서 조금 걱정했어. 요즘은 어떻게 지내?',
    },
  },
  {
    id: 'apply',
    title: '프로그램 신청 문의하기',
    who: '청년지원사업 담당 주무관',
    open: '네, 청년도전지원사업 담당입니다. 문의 주신 내용이 어떤 건가요?',
    portrait: 'https://images.pexels.com/photos/8466222/pexels-photo-8466222.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    opponentName: '박서연',
    opponentRole: '담당 주무관',
    goals: ['문의 목적 말하기', '신청 자격이나 절차 확인하기', '다음에 준비할 것 확인하기'],
    openings: {
      gentle: '안녕하세요, 청년도전지원사업 담당입니다. 문의하고 싶다고 한 말씀만 해주셔도 제가 차근차근 여쭤볼게요.',
      standard: '네, 청년도전지원사업 담당입니다. 문의 주신 내용이 어떤 건가요?',
      realistic: '청년도전지원사업 담당입니다. 신청 자격, 일정, 제출 서류 중 어떤 내용을 먼저 확인하고 싶으신가요?',
    },
  },
];

export type ChatMessage = {
  role: 'them' | 'me' | 'coach';
  text: string;
};

export type FallbackExamples = {
  minimal: string;
  normal: string;
  honest: string;
};

export const FALLBACK_EXAMPLES: Record<string, FallbackExamples> = {
  center: {
    minimal: '안녕하세요, 상담을 신청하고 싶어서 연락했어요.',
    normal: '안녕하세요, 요즘 밖에 나가거나 사람을 만나는 게 어려워서 상담을 받아보고 싶어요.',
    honest: '안녕하세요, 혼자 지낀 지 오래돼서 어떻게 시작해야 할지 모르겠는데, 상담을 신청할 수 있을까요?',
  },
  prof: {
    minimal: '교수님, 오랜만에 연락드립니다. 잘 지내셨어요?',
    normal: '교수님, 오랫동안 연락을 못 드려서 죄송합니다. 요즘 어떻게 지내는지 한번 말씀드리고 싶었어요.',
    honest: '교수님, 연락을 못 드린 건 제가 많이 지쳐서였어요. 이제 조금 나아진 것 같아서 용기를 내서 연락드립니다.',
  },
  friend: {
    minimal: '오랜만이야! 잘 지냈어? 나도 요즘 좀 바빴어.',
    normal: '연락이 늦어서 미안해. 요즘 정신이 하나도 없었어. 그래도 네 연락 받아서 반가워.',
    honest: '오랫동안 연락 못 해서 미안해. 내가 요즘 사람을 만나는 게 좀 어려워서 그랬어. 네가 먼저 연락해줘서 고마워.',
  },
  apply: {
    minimal: '안녕하세요, 청년도전지원사업에 문의하고 싶어요.',
    normal: '안녕하세요, 청년도전지원사업 신청 자격과 절차에 대해 문의드리고 싶어요.',
    honest: '안녕하세요, 오랫동안 구직 활동을 못 하고 있었는데 이 프로그램이 저에게 맞을지 문의하고 싶어요.',
  },
};

export type NextStepOption = {
  id: string;
  label: string;
  description: string;
};

export const NEXT_STEPS: Record<string, NextStepOption[]> = {
  center: [
    { id: 'copy-inquiry', label: '문의 문장 복사하기', description: '연습에서 쓴 문장을 클립보드에 복사해요.' },
    { id: 'check-phone', label: '전화번호 확인하기', description: '상담센터 연락처를 확인하고 저장해요.' },
    { id: 'save-only', label: '오늘은 문장만 저장하기', description: '오늘은 여기까지. 내일 한 걸음 더.' },
  ],
  prof: [
    { id: 'copy-email', label: '이메일 초안 복사하기', description: '연습한 내용으로 이메일 초안을 만들어요.' },
    { id: 'enter-recipient', label: '받는 사람만 입력하기', description: '메일 앱을 열고 받는 사람 주소만 넣어요.' },
    { id: 'save-subject', label: '오늘은 제목만 정하기', description: '이메일 제목만 적어두고 내일 본문을 써요.' },
  ],
  friend: [
    { id: 'copy-reply', label: '답장 문장 복사하기', description: '연습한 답장을 클립보드에 복사해요.' },
    { id: 'open-chat', label: '친구 채팅방 열기', description: '메신저에서 친구 채팅방만 열어요.' },
    { id: 'save-only', label: '오늘은 문장만 저장하기', description: '오늘은 여기까지. 내일 한 걸음 더.' },
  ],
  apply: [
    { id: 'copy-inquiry', label: '문의 문장 복사하기', description: '연습한 문의 문장을 클립보드에 복사해요.' },
    { id: 'check-contact', label: '기관 연락처 확인하기', description: '담당 기관의 연락처를 확인해요.' },
    { id: 'view-program', label: '프로그램 정보 다시 보기', description: '프로그램 안내 페이지를 다시 읽어요.' },
  ],
};
