/* ═══════════════════════════════════════════════════════════
   4. 데이터 — 화면과 분리해서 위쪽에 모아둔다
   ═══════════════════════════════════════════════════════════ */

let ALL_QUESTIONS = [];
let QUESTIONS = [
  { key:'out', survey:'legacy',   q:'최근 한 달, 집 밖으로 나간 날은 며칠쯤 될까요?',
    opts:[['0일','a'],['1–3일','b'],['4–7일','c'],['8일 이상','d']] },
  { key:'talk', survey:'legacy',  q:'요즘 다른 사람과 나누는 대화는 어느 정도인가요?',
    opts:[['거의 없어요','a'],['메시지로만 조금','b'],['가끔 얼굴 보고 짧게','c'],['자주 이야기해요','d']] },
  { key:'rhythm', survey:'legacy',q:'식사와 잠은 규칙적인 편인가요?',
    opts:[['거의 불규칙해요','a'],['가끔 규칙적이에요','b'],['대체로 규칙적이에요','c']] },
  { key:'barrier', survey:'legacy',q:'다음 중 지금 가장 부담되는 건 무엇인가요?',
    opts:[
      ['집 밖으로 나가는 것','going'],
      ['누군가에게 먼저 연락하는 것','contact'],
      ['정보가 너무 많아서 뭘 봐야 할지 모르겠는 것','overload'],
      ['거절당하거나 평가받는 것','judged'],
      ['이미 늦었다는 생각','late'],
      ['기운이 나지 않는 것','energy'] ] },
  { key:'vision', survey:'legacy',q:'1년 뒤에 달라져 있었으면 하는 게 있다면요?',
    opts:[['다시 일을 시작하고 싶어요','work'],['사람들과 어울리고 싶어요','social'],
          ['공부나 학교로 돌아가고 싶어요','study'],['아직 잘 모르겠어요','unsure']] }
];

const LEVELS = [
  { n:1, name:'방 안 중심',      line:'지금은 방이 가장 안전한 자리예요.' },
  { n:2, name:'집 안 중심',      line:'집 안에서는 움직일 수 있는 상태예요.' },
  { n:3, name:'제한적 외출',      line:'짧은 외출은 가능한 상태예요.' },
  { n:4, name:'낮은 상호작용',    line:'밖에는 나가지만 사람과의 접촉은 아직 어려워요.' },
  { n:5, name:'사회적 연결 준비', line:'연결을 시작할 준비가 꽤 되어 있어요.' }
];

const BARRIERS = {
  going:   { label:'외출 부담',        path:'micro' },
  contact: { label:'첫 연락 부담',      path:'rehearsal' },
  overload:{ label:'정보 과부하',       path:'connect' },
  judged:  { label:'거절·평가 불안',    path:'rehearsal' },
  late:    { label:'늦었다는 죄책감',   path:'micro' },
  energy:  { label:'에너지 부족',       path:'micro' }
};

/* 오프라인/에러 상황에서도 시연이 끊기지 않도록 하는 대비 데이터 */
const FALLBACK_STEPS = {
  going:   ['커튼을 열고 창밖을 1분만 바라보기','현관문 열고 복도 공기 한 번 마시기','신발 신고 집 앞 5분 서 있기'],
  contact: ['보낼 사람 이름만 메모장에 적어두기','보내지 않을 문장 한 줄 써보기','저장해둔 문장 하루 뒤에 다시 읽기'],
  overload:['관심 있는 키워드 딱 하나만 적기','기관 한 곳 홈페이지만 열어보기','운영시간만 확인하고 닫기'],
  judged:  ['거절당해도 괜찮은 질문 하나 만들기','거울 보고 한 문장 소리 내 읽기','AI와 한 번만 연습해보기'],
  late:    ['오늘 한 일 하나만 적어보기','늦었다는 문장을 다르게 바꿔 써보기','내일 할 아주 작은 일 하나 정하기'],
  energy:  ['물 한 잔 마시기','침대에서 3분만 앉아 있기','좋아하는 노래 한 곡 틀어두기']
};


/* 발표 데모용으로 검증된 마이크로스텝 묶음.
   각 chain은 0이 가장 쉬운 단계이고, 마지막이 기본 추천 단계다. */
let MICROSTEP_CHAINS = {
  walk: {
    label:'산책', feature:'route',
    chain:[
      '추천 산책 코스 지도만 보기',
      '외출할 신발 준비하기',
      '현관 앞에 30초 서 있기',
      '건물 밖에서 1분 서 있기',
      '집 앞 100m 걷기',
      '사람 적은 10분 코스 걷기'
    ],
    why:['보기만 해도 준비가 시작돼요','밖에 나가지 않아도 되는 준비예요','문을 열 필요 없는 단계예요',
         '바로 돌아와도 되는 짧은 노출이에요','목적지 없이 짧게 다녀와요','조용한 길을 골라 부담을 줄여요']
  },
  cafe: {
    label:'카페', feature:'cafe',
    chain:[
      '동네 카페 목록만 보기',
      '카페 한 곳 저장하기',
      '인기 메뉴 하나 고르기',
      '주문 문장 읽어보기',
      '카페 앞까지 가기',
      '키오스크로 음료 주문하기',
      '직원에게 메뉴 이름 말하기'
    ],
    why:['방문하지 않고 정보만 봐요','선택만 해두면 다음이 쉬워져요','현장에서 고민할 일을 줄여요',
         '실제 대화 전에 문장만 익혀요','들어가지 않고 돌아와도 돼요','대화 없이 주문할 수 있어요','한 문장만 말하면 끝나요']
  },
  stretch: {
    label:'스트레칭', feature:'video',
    chain:[
      '스트레칭 영상 제목만 보기',
      '영상 재생 버튼 누르기',
      '첫 동작만 따라 하기',
      '3분 스트레칭 따라 하기'
    ],
    why:['실행하지 않고 확인만 해요','재생만 하고 멈춰도 돼요','한 동작이면 충분해요','짧게 몸을 깨우는 단계예요']
  }
};

let DEMO_STEP_PRESETS = {
  going:[['walk',5],['stretch',3],['cafe',2]],
  energy:[['stretch',3],['walk',2],['cafe',0]],
  contact:[['cafe',3],['walk',4],['stretch',2]],
  judged:[['cafe',3],['stretch',2],['walk',2]],
  overload:[['cafe',2],['walk',0],['stretch',1]],
  late:[['stretch',2],['walk',2],['cafe',1]]
};

let SUPPORT_DATA = {
  route:{
    title:'조용한 산책 코스', desc:'시연에서는 현재 위치 대신 예시 동네 데이터를 사용해요.',
    choices:[['가장 짧은 코스','약 8분 · 550m'],['사람 적은 코스','약 12분 · 골목 위주'],['벤치 있는 코스','약 15분 · 공원 경유']]
  },
  cafe:{
    title:'동네 카페 인기 메뉴', desc:'현장에서 오래 고민하지 않도록 메뉴를 미리 골라둬요.',
    choices:[['아이스 아메리카노','4,000원 · 가장 많이 주문'],['카페라테','4,500원 · 부드러운 맛'],['유자차','4,800원 · 카페인 없음']]
  },
  video:{
    title:'3분 방 안 스트레칭', desc:'첫 동작만 따라 하고 멈춰도 완료로 인정해요.', choices:[]
  }
};


/* ═══════════════════════════════════════════════════════════
   Google Sheets 콘텐츠 로더
   - CODE_questions / CODE_microsteps / CODE_presets / CODE_support를 읽는다.
   - config.js의 GOOGLE_SHEET_ID가 비어 있거나 로딩이 실패하면 위 기본 데이터를 쓴다.
   ═══════════════════════════════════════════════════════════ */
const FALLBACK_CONTENT = {
  questions: JSON.parse(JSON.stringify(QUESTIONS)),
  chains: JSON.parse(JSON.stringify(MICROSTEP_CHAINS)),
  presets: JSON.parse(JSON.stringify(DEMO_STEP_PRESETS)),
  support: JSON.parse(JSON.stringify(SUPPORT_DATA))
};

function isActive(value){
  if(value === true || value === 1) return true;
  return !['false','0','no','n','off',''].includes(String(value ?? '').trim().toLowerCase());
}

function sheetCsvUrl(sheetName){
  const id = window.NUDGEON_CONFIG?.GOOGLE_SHEET_ID?.trim();
  if(!id) throw new Error('GOOGLE_SHEET_ID가 설정되지 않았습니다.');
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
}

async function loadCsvSheet(sheetName){
  const response = await fetch(sheetCsvUrl(sheetName), {cache:'no-store'});
  if(!response.ok) throw new Error(`${sheetName} 시트 요청 실패: ${response.status}`);
  const csv = await response.text();
  const knownHeaders = [
    'survey','domain','question_id','question_order','question_text','option_order','option_text',
    'option_value','score','flag','required','active','show_if','note','step_id','chain_id',
    'chain_label','difficulty','title','why_text','feature_type','support_label','barrier_id',
    'barrier_label','recommendation_order','start_difficulty','feature_title',
    'feature_description','choice_order','choice_title','choice_detail'
  ];
  const normalizeHeader = header => {
    const value=String(header||'').trim();
    return knownHeaders.find(name=>value===name || value.endsWith(` ${name}`)) || value;
  };
  const parsed = Papa.parse(csv, {
    header:true,
    skipEmptyLines:true,
    dynamicTyping:true,
    transformHeader:normalizeHeader
  });
  if(parsed.errors?.length) console.warn(`${sheetName} CSV 경고`, parsed.errors);
  return parsed.data.filter(row=>Object.values(row).some(v=>String(v ?? '').trim() !== ''));
}

function buildQuestions(rows){
  const connectionOnly = new Set(['s1_age','h_demo','i_demo','p_demo']);
  const groups = new Map();
  rows.filter(r=>isActive(r.active)).forEach(r=>{
    const id = String(r.question_id ?? '').trim();
    if(!id) return;
    if(!groups.has(id)) groups.set(id, {
      key:id,
      survey:(String(r.survey ?? '').trim() || 'legacy'),
      domain:String(r.domain ?? '').trim(),
      flag:String(r.flag ?? '').trim().toUpperCase(),
      required:String(r.required ?? '').trim(),
      showIf:String(r.show_if ?? '').trim(),
      order:Number(r.question_order)||999,
      q:String(r.question_text ?? '').trim(),
      opts:[]
    });
    groups.get(id).opts.push({
      order:Number(r.option_order)||999,
      label:String(r.option_text ?? '').trim(),
      value:String(r.option_value ?? '').trim(),
      score:Number(r.score)||0
    });
  });
  return [...groups.values()]
    .sort((a,b)=>a.order-b.order)
    .map(q=>({key:q.key, survey:q.survey, domain:q.domain, flag:q.flag,
      required:q.required, showIf:q.showIf, q:q.q,
      opts:q.opts.sort((a,b)=>a.order-b.order).map(o=>[o.label,o.value,o.score])}))
    .filter(q=>q.q && q.opts.length && !connectionOnly.has(q.key));
}

/* ═══ 2단계 자가진단: 군 판정 → 세부 Lv 산출 ═══ */

/* Google Sheets의 활성 문항만 사용한다. legacy는 로딩 실패용 fallback에만 남긴다. */
const STAGE1   = ['warmup','s1'];
const STAGE2   = { hikikomori:'s2_hikikomori', isolation:'s2_isolation', boundary:'s2_profile' };
const REL_KEYS = ['s1_meet','s1_alone','s1_family','s1_friend'];
const BAND     = { hikikomori:[1,3], isolation:[2,4], boundary:[3,5] };
/* 본인이 밝힌 외출 범위보다 낮은 단계로는 내리지 않는다 */
const OUT_FLOOR = { room:1, home:1, limited:2, need:3, active:3 };

/* h_nohelp / h_back / p_goal 응답을 기존 6개 장벽 코드로 옮긴다 */
const BARRIER_MAP = {
  unknown:'overload', contact:'contact', doubt:'judged',  stigma:'judged',
  hard:'energy',      people:'contact',  result:'late',   tired:'energy', money:'overload',
  friend:'contact',   community:'contact', career:'overload', anxiety:'judged', change:'energy'
};
const BARRIER_FALLBACK = { hikikomori:'going', isolation:'contact', boundary:'overload' };

/* show_if 형식: "h_try!=none" 또는 "h_try=many,once"
   조건을 만족하지 않는 문항은 화면에 띄우지 않고 건너뛴다. */
function shouldShow(q, answers){
  const cond = q.showIf;
  if(!cond) return true;
  const neg = cond.includes('!=');
  const [key, raw] = cond.split(neg ? '!=' : '=');
  const list = String(raw||'').split(',').map(v=>v.trim()).filter(Boolean);
  const got = answers[String(key||'').trim()];
  if(got === undefined) return false;         /* 선행 답변 전에는 조건부 문항을 숨긴다 */
  return neg ? !list.includes(got) : list.includes(got);
}

/* 현재 위치에서 조건을 만족하는 다음 문항 index. 없으면 -1 */
function nextIndex(from){
  for(let i=from; i<QUESTIONS.length; i++){
    if(shouldShow(QUESTIONS[i], state.answers)) return i;
  }
  return -1;
}
function prevIndex(from){
  for(let i=from; i>=0; i--){
    if(shouldShow(QUESTIONS[i], state.answers)) return i;
  }
  return -1;
}

function questionsOf(surveys){
  const connectionOnly = new Set(['s1_age','h_demo','i_demo','p_demo']);
  return ALL_QUESTIONS.filter(q=>surveys.includes(q.survey) && !connectionOnly.has(q.key));
}

/* 선택한 값의 점수를 찾아온다. 못 찾으면 0. */
function scoreOf(key, value){
  const q = ALL_QUESTIONS.find(x=>x.key===key);
  if(!q) return 0;
  const hit = q.opts.find(o=>o[1]===value);
  return hit ? (hit[2]||0) : 0;
}

/* 1차 조사 → 은둔군 / 고립군 / 경계군 */
function decideGroup(a){
  const out = a.s1_out;
  if(out==='room' || out==='home') return 'hikikomori';
  if(out==='limited') return 'isolation';
  const rel = REL_KEYS.reduce((sum,k)=>sum+scoreOf(k,a[k]), 0);
  return rel>=10 ? 'isolation' : 'boundary';
}

/* 2차 조사 → 실행지수 → Lv1~5 (군별 밴드로 상·하한을 건다) */
function decideLevel(a, group){
  let raw;
  if(group==='boundary'){
    /* 프로파일링만 받는 군은 2차에 점수 문항이 없어 1차 신호로 배치한다 */
    raw = scoreOf('s1_out',a.s1_out) + REL_KEYS.reduce((s,k)=>s+scoreOf(k,a[k]),0)/2;
  }else{
    const pre = group==='hikikomori' ? 'h_' : 'i_';
    raw = ['meal','hyg','sleep','try'].reduce((s,k)=>s+scoreOf(pre+k, a[pre+k]), 0);
  }
  let lv = raw>=13 ? 1 : raw>=10 ? 2 : raw>=7 ? 3 : raw>=4 ? 4 : 5;
  if(a[(group==='hikikomori'?'h_':'i_')+'want']==='often') lv = Math.min(5, lv+1);
  lv = Math.max(lv, OUT_FLOOR[a.s1_out] || 1);
  const [lo,hi] = BAND[group];
  return Math.min(hi, Math.max(lo, lv));
}

function decideBarrier(a, group){
  const pre = group==='hikikomori' ? 'h_' : 'i_';
  const cands = [a[pre+'nohelp'], a[pre+'back'], a.p_goal];
  for(const c of cands){ if(c && BARRIER_MAP[c]) return BARRIER_MAP[c]; }
  return BARRIER_FALLBACK[group] || 'going';
}

function decideVision(a, group){
  const pre = group==='hikikomori' ? 'h_' : 'i_';
  return a.p_vision || a[pre+'need'] || a.vision || '아직 정하지 않았어요';
}

function answerLabel(key, value){
  const q=ALL_QUESTIONS.find(item=>item.key===key);
  return q?.opts.find(option=>option[1]===value)?.[0] || '';
}

function profileEvidence(a, group){
  const pre=group==='hikikomori' ? 'h_' : 'i_';
  const keys=group==='boundary'
    ? ['s1_out','s1_meet','s1_alone','p_goal']
    : ['s1_out',pre+'meal',pre+'sleep',pre+'nohelp'];
  return keys.map(key=>{
    const q=ALL_QUESTIONS.find(item=>item.key===key);
    const label=answerLabel(key,a[key]);
    return q && label ? `${q.domain || '응답'} · ${label}` : '';
  }).filter(Boolean).slice(0,4);
}

function assessmentSignals(a){
  return Object.entries(a).map(([key,value])=>{
    const q=ALL_QUESTIONS.find(item=>item.key===key);
    const label=answerLabel(key,value);
    return q&&label?`${q.domain||'현재 상태'}: ${label}`:'';
  }).filter(Boolean).slice(0,40);
}

function actionSizeFor(level){
  if(level<=2) return '준비만 해도 끝나는 1–3분 행동';
  if(level===3) return '집 안이나 집 앞에서 끝나는 짧은 행동';
  if(level===4) return '짧은 연락이나 낮은 부담의 외부 행동';
  return '실제 연결로 이어지는 한 단계 행동';
}

function buildMicrostepChains(rows){
  const groups = new Map();
  rows.filter(r=>isActive(r.active)).forEach(r=>{
    const id=String(r.chain_id ?? '').trim();
    if(!id) return;
    if(!groups.has(id)) groups.set(id, {
      label:String(r.chain_label ?? id).trim(),
      feature:String(r.feature_type ?? '').trim(),
      supportLabel:String(r.support_label ?? '').trim(),
      steps:[]
    });
    groups.get(id).steps.push({
      difficulty:Number(r.difficulty)||1,
      title:String(r.title ?? '').trim(),
      why:String(r.why_text ?? '').trim()
    });
  });
  const result={};
  groups.forEach((g,id)=>{
    g.steps.sort((a,b)=>a.difficulty-b.difficulty);
    result[id]={
      label:g.label,
      feature:g.feature,
      supportLabel:g.supportLabel,
      chain:g.steps.map(s=>s.title),
      why:g.steps.map(s=>s.why)
    };
  });
  return result;
}

function buildPresets(rows, chains){
  const result={};
  rows.filter(r=>isActive(r.active)).forEach(r=>{
    const barrier=String(r.barrier_id ?? '').trim();
    const chain=String(r.chain_id ?? '').trim();
    if(!barrier || !chains[chain]) return;
    const index=Math.max(0, Math.min(chains[chain].chain.length-1, (Number(r.start_difficulty)||1)-1));
    (result[barrier] ||= []).push({order:Number(r.recommendation_order)||999, chain, index});
  });
  Object.keys(result).forEach(key=>{
    result[key]=result[key].sort((a,b)=>a.order-b.order).map(x=>[x.chain,x.index]);
  });
  return result;
}

function buildSupport(rows){
  const groups=new Map();
  rows.filter(r=>isActive(r.active)).forEach(r=>{
    const type=String(r.feature_type ?? '').trim();
    if(!type) return;
    if(!groups.has(type)) groups.set(type, {
      title:String(r.feature_title ?? '').trim(),
      desc:String(r.feature_description ?? '').trim(),
      choices:[]
    });
    const choiceTitle=String(r.choice_title ?? '').trim();
    if(choiceTitle) groups.get(type).choices.push({
      order:Number(r.choice_order)||999,
      title:choiceTitle,
      detail:String(r.choice_detail ?? '').trim()
    });
  });
  const result={};
  groups.forEach((g,type)=>{
    result[type]={title:g.title, desc:g.desc,
      choices:g.choices.sort((a,b)=>a.order-b.order).map(c=>[c.title,c.detail])};
  });
  return result;
}

async function loadContentFromGoogleSheets(){
  const id = window.NUDGEON_CONFIG?.GOOGLE_SHEET_ID?.trim();
  if(!id){
    console.info('Google Sheet ID가 없어 내장 fallback 데이터를 사용합니다.');
    return false;
  }
  const [qRows,mRows,pRows,sRows] = await Promise.all([
    loadCsvSheet('CODE_questions'),
    loadCsvSheet('CODE_microsteps'),
    loadCsvSheet('CODE_presets'),
    loadCsvSheet('CODE_support')
  ]);
  const questions=buildQuestions(qRows);
  const chains=buildMicrostepChains(mRows);
  const presets=buildPresets(pRows,chains);
  const support=buildSupport(sRows);
  if(!questions.length || !Object.keys(chains).length) throw new Error('필수 CODE 시트 데이터가 비어 있습니다.');
  ALL_QUESTIONS=questions;
  QUESTIONS=questionsOf(STAGE1);
  if(!QUESTIONS.length) QUESTIONS=questions;
  MICROSTEP_CHAINS=chains;
  DEMO_STEP_PRESETS=Object.keys(presets).length ? presets : FALLBACK_CONTENT.presets;
  SUPPORT_DATA=Object.keys(support).length ? support : FALLBACK_CONTENT.support;
  console.info('NudgeOn 콘텐츠를 Google Sheets에서 불러왔습니다.');
  return true;
}

async function initializeApp(){
  try{
    await loadContentFromGoogleSheets();
  }catch(error){
    console.warn('Google Sheets 로딩 실패. fallback 데이터를 사용합니다.', error);
    ALL_QUESTIONS=FALLBACK_CONTENT.questions.filter(q=>!['s1_age','h_demo','i_demo','p_demo'].includes(q.key));
    QUESTIONS=ALL_QUESTIONS;
    MICROSTEP_CHAINS=FALLBACK_CONTENT.chains;
    DEMO_STEP_PRESETS=FALLBACK_CONTENT.presets;
    SUPPORT_DATA=FALLBACK_CONTENT.support;
  }
  const restored = restoreProgress();
  const requestedScreen = new URLSearchParams(window.location.search).get('screen');
  if(requestedScreen && canOpenScreen(requestedScreen)){
    state.screen = requestedScreen;
    state.visited.add(requestedScreen);
    window.history.replaceState({}, '', '/');
  }else if(restored){
    state.resumeScreen = state.screen;
    state.screen = 'resume';
  }
  render();
}

function createDemoSteps(barrier){
  const level=state.profile?.level || 3;
  const levelOffset=level<=2 ? -1 : 0;
  return (DEMO_STEP_PRESETS[barrier] || DEMO_STEP_PRESETS.going).map(([chainId,startDifficulty])=>{
    const group=MICROSTEP_CHAINS[chainId];
    if(!group?.chain?.length) return null;
    const difficulty=Math.max(0,Math.min(group.chain.length-1,startDifficulty+levelOffset));
    return {chainId, difficulty, text:group.chain[difficulty], why:group.why[difficulty],
            feature:group.feature, done:false, supportOpen:false, selectedSupport:0,
            adjustedDown:0, adjustedUp:0};
  }).filter(Boolean);
}

const SCENARIOS = [
  { id:'center', title:'상담센터에 처음 전화하기', who:'대학 학생상담센터 상담 접수 직원',
    open:'안녕하세요, 학생상담센터입니다. 무엇을 도와드릴까요?' },
  { id:'prof',   title:'교수님께 늦은 메일 보내기', who:'오래 연락이 없던 학생을 반갑게 맞는 지도교수',
    open:'그래, 오랜만이구나. 어떻게 지냈니?' },
  { id:'friend', title:'오래 연락 못 한 친구에게 답장하기', who:'서운함 없이 반가워하는 오랜 친구',
    open:'어 왔네ㅋㅋ 잘 지냈어? 요즘 뭐하고 지내?' },
  { id:'apply',  title:'프로그램 신청 문의하기', who:'청년지원사업 담당 주무관',
    open:'네, 청년도전지원사업 담당입니다. 문의 주신 내용이 어떤 건가요?' }
];

/* ═══════════════════════════════════════════════════════════
   5. 상태 — 앱이 기억하는 모든 것. 여기만 바꾸고 다시 그린다.
   ═══════════════════════════════════════════════════════════ */
const state = {
  screen:'intro',
  resumeScreen:null,
  qi:0, answers:{},
  profile:null, report:null, reportLoading:false, group:null,
  micro:[], scenario:null, messages:[], busy:false,
  draft:null, nextAction:null, visited:new Set()
};

const stage = document.getElementById('stage');
const SCREENS = ['check','micro','rehearsal','connect','record'];
const SCREEN_NAMES = ['자가진단','마이크로스텝','사회적 리허설','공공 복지 연결','기록·성장'];
const STORAGE_KEY = 'nudgeon.journey.v1';
const REHEARSAL_PROGRESS_KEY = 'nudgeon.rehearsal-progress.v1';

function resetState(screen='intro'){
  Object.assign(state,{screen,resumeScreen:null,qi:0,answers:{},profile:null,report:null,reportLoading:false,group:null,
    micro:[],scenario:null,messages:[],busy:false,draft:null,
    nextAction:null,visited:new Set()});
  if(ALL_QUESTIONS.length){
    const base=questionsOf(STAGE1);
    QUESTIONS=base.length ? base : ALL_QUESTIONS;
  }
}

function persistProgress(){
  if(state.screen==='intro' || state.screen==='resume') return;
  try{
    const screen=state.screen==='rehearsal' ? 'rehearsal' : state.screen;
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:1,savedAt:new Date().toISOString(),screen,qi:state.qi,answers:state.answers,
      profile:state.profile,report:state.report,group:state.group,micro:state.micro,
      draft:state.draft,nextAction:state.nextAction,visited:[...state.visited]
    }));
  }catch(error){ console.warn('기기 저장에 실패했습니다.',error); }
}

function restoreProgress(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const saved=JSON.parse(raw);
    if(saved?.version!==1 || !saved.screen) return false;
    Object.assign(state,{
      screen:saved.screen,qi:Number(saved.qi)||0,answers:saved.answers||{},profile:saved.profile||null,
      report:saved.report||null,reportLoading:false,group:saved.group||null,micro:Array.isArray(saved.micro)?saved.micro:[],
      draft:saved.draft||null,nextAction:saved.nextAction||null,
      visited:new Set(Array.isArray(saved.visited)?saved.visited:[])
    });
    if(ALL_QUESTIONS.length){
      const base=questionsOf(STAGE1);
      const branch=state.group ? questionsOf([STAGE2[state.group]]) : [];
      QUESTIONS=[...base,...branch];
      if(!QUESTIONS.length) QUESTIONS=ALL_QUESTIONS;
    }
    state.qi=Math.min(state.qi,Math.max(0,QUESTIONS.length-1));
    if(!canOpenScreen(state.screen)) state.screen=state.profile?'report':'check';
    return true;
  }catch(error){
    console.warn('저장된 진행 상태를 불러오지 못했습니다.',error);
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

function clearProgress(screen='intro'){
  // NudgeOn이 이 기기에 저장한 정보만 모두 삭제하고 다른 사이트 데이터는 건드리지 않는다.
  Object.keys(localStorage)
    .filter(key=>key.startsWith('nudgeon.'))
    .forEach(key=>localStorage.removeItem(key));
  resetState(screen);
  render();
}

function canOpenScreen(screen){
  if(screen==='intro' || screen==='check') return true;
  /* AI 연결은 리허설 단독 화면에서 넘어온 경우에도 기본 추천으로 열 수 있다. */
  if(screen==='connect' || screen==='record') return true;
  if(screen==='bridge') return Boolean(state.group);
  if(screen==='report' || screen==='micro' || screen==='rehearsal') return Boolean(state.profile);
  return false;
}

/* ═══════════════════════════════════════════════════════════
   6. AI 호출 — 실패해도 앱이 멈추지 않게 항상 대비책을 둔다
   ═══════════════════════════════════════════════════════════ */
async function ask(messages, system){
  /* Anthropic이 아니라 '우리 백엔드'(api/chat.js)를 부른다.
     API 키는 저쪽에서 붙는다. 이 파일에는 키가 한 글자도 없다.
     주의: 파일을 그냥 더블클릭해서 열면 /api/chat 이 없어서 실패한다.
           그래도 앱은 아래 fallback으로 계속 동작한다. 정상이다. */
  const res = await fetch('/api/chat',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ messages, system })
  });
  if(!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  return (data.text || '').trim();
}

/* ═══════════════════════════════════════════════════════════
   7. 프로파일링 — 규칙 기반. AI 없이도 항상 동작한다.
   ═══════════════════════════════════════════════════════════ */
function buildProfile(a){
  /* 신규 문항(s1_out)이 켜져 있으면 2단계 로직, 아니면 기존 5문항 로직 */
  if(a.s1_out){
    const group = state.group || decideGroup(a);
    const n  = decideLevel(a, group);
    const lv = LEVELS[n-1];
    const b  = decideBarrier(a, group);
    /* Lv1~2에서는 어떤 장벽이든 기관 연결보다 작은 행동이 먼저다 */
    const path = n<=2 ? 'micro' : BARRIERS[b].path;
    return { level:n, levelName:lv.name, levelLine:lv.line,
             group, barrier:b, barrierLabel:BARRIERS[b].label,
             path, vision:decideVision(a,group), actionSize:actionSizeFor(n),
             evidence:profileEvidence(a,group) };
  }
  let s2 = 0;
  s2 += ({a:0,b:1,c:2,d:3})[a.out]    ?? 0;
  s2 += ({a:0,b:1,c:2,d:3})[a.talk]   ?? 0;
  s2 += ({a:0,b:1,c:1})[a.rhythm]     ?? 0;
  const n = Math.min(5, Math.max(1, Math.ceil((s2+1)/1.5)));
  const lv = LEVELS[n-1];
  const b = BARRIERS[a.barrier] ? a.barrier : 'going';
  return { level:n, levelName:lv.name, levelLine:lv.line,
           group:'legacy', barrier:b, barrierLabel:BARRIERS[b].label,
           path:BARRIERS[b].path, vision:a.vision || '아직 정하지 않았어요',
           actionSize:actionSizeFor(n), evidence:[] };
}

function render(){
  try{ renderInner(); }
  catch(err){
    console.error('화면을 그리는 중 오류가 발생했습니다:', err);
    stage.innerHTML = `<div class="eyebrow">오류</div>
      <h2 class="mid">화면을 표시하지 못했어요</h2>
      <p class="note">개발자 도구 Console에 원인이 기록되었습니다.</p>
      <div class="row"><button class="btn quiet" data-restart="1">처음부터 다시</button></div>`;
    bind();
  }
}

function renderInner(){
  renderRail();
  document.getElementById('appShell')?.setAttribute('data-screen', state.screen);
  const fn = {intro:vIntro, resume:vResume, check:vCheck, bridge:vBridge, report:vReport, micro:vMicro,
              rehearsal:vRehearsal, connect:vConnect, record:vRecord}[state.screen];
  stage.innerHTML = `${backButton()}${fn()}`;
  bind();
  if(state.screen==='connect'){
    const needsByVision={work:['career'],study:['education'],social:['community'],unsure:[]};
    window.NudgeonJourneyProfile={
      needs:needsByVision[state.profile?.vision]||[],
      journeyLevel:state.profile?.level||null,
      journeyBarrier:state.profile?.barrier||null,
      journeyVision:state.profile?.vision||null,
      actionSize:state.profile?.actionSize||null,
      assessmentSignals:assessmentSignals(state.answers)
    };
    window.NudgeonConnect?.mount();
  }
  persistProgress();
  stage.querySelector('h1,h2')?.focus?.();
}

function backButton(){
  if(state.screen==='intro' || state.screen==='resume' || state.screen==='check') return '';
  return `<button class="back-step" data-prev-step="1" aria-label="이전 단계로 돌아가기">← 이전 단계</button>`;
}

function renderRail(){
  const cur = (state.screen==='report'||state.screen==='bridge') ? 'check' : state.screen;
  const ci = SCREENS.indexOf(cur);
  document.getElementById('journey').innerHTML = SCREENS.map((s,i)=>{
    const done = state.visited.has(s) && i !== ci;
    const st = i===ci ? 'now' : (done ? 'done' : 'todo');
    return `<button class="jstep" type="button" data-state="${st}" data-journey-screen="${s}"
      ${i===ci ? 'aria-current="step"' : ''}>
      <span class="num">0${i+1}</span><span>${SCREEN_NAMES[i]}</span></button>`;
  }).join('');

  const windowScreen = state.screen === 'resume' ? state.resumeScreen : cur;
  const windowIndex = SCREENS.indexOf(windowScreen);
  const p = windowIndex >= 0 ? (windowIndex + 1) / SCREENS.length : 0;
  document.getElementById('appShell')?.setAttribute('data-window-screen', windowScreen || 'intro');
  document.documentElement.style.setProperty('--open', p.toFixed(2));
  const screenNotes = {
    check:'조금 열렸어요',
    micro:'빛이 들어오고 있어요',
    rehearsal:'저 멀리 작은 다리가 보입니다',
    connect:'다리 너머 따뜻한 불빛이 켜져 있습니다',
    record:'길과 다리가 이어진 밝은 풍경이 펼쳐집니다'
  };
  document.getElementById('windowNote').textContent = screenNotes[windowScreen] || '커튼은 아직 닫혀 있어요';
}

/* ── 00 시작 ── */
function vIntro(){
  return `
  <section class="home-hero">
    <p class="home-kicker">조금씩, 나에게 맞는 속도로</p>
    <h1 class="big" tabindex="-1">오늘 할 수 있는<br>가장 작은 행동부터</h1>
    <p class="lede">몇 가지 질문에 답하면 지금 상태에 맞는 작은 행동을 제안해드려요. 필요하다면 대화를 연습하고, 이용할 수 있는 지원 정보도 함께 찾아볼 수 있어요.</p>
    <button class="btn hero-cta" data-go="check">나의 첫 단계 시작하기</button>
  </section>
  <section class="home-path" id="journeyIntro">
    <div class="home-section-head"><div><span>HOW NUDGEON WORKS</span><h2>작은 행동으로 이어지는<br>5단계 과정</h2></div><p>현재 상태를 확인하고, 오늘 할 수 있는 행동부터 시작합니다. 모든 단계는 이전으로 돌아가거나 잠시 멈출 수 있어요.</p></div>
    <ol>
      <li><b>01</b><div><strong>지금 상태 확인하기</strong><span>질문으로 생활 리듬과 현재 부담을 가볍게 확인합니다.</span></div></li>
      <li><b>02</b><div><strong>작은 행동 고르기</strong><span>지금 할 수 있는 마이크로스텝을 고르고 크기를 조정합니다.</span></div></li>
      <li><b>03</b><div><strong>대화 미리 연습하기</strong><span>실제 상황 전에 필요한 말을 적어보고 부담 없이 연습합니다.</span></div></li>
      <li><b>04</b><div><strong>지원 정보 찾아보기</strong><span>지역과 필요에 맞춰 이용 가능한 지원 정보를 확인합니다.</span></div></li>
      <li><b>05</b><div><strong>기록 확인하기</strong><span>완료한 행동과 변화를 기록하고 다음 단계를 선택합니다.</span></div></li>
    </ol>
  </section>
  <section class="home-explain"><div class="home-mini-window" aria-hidden="true"><span></span><i></i></div><div><span>ONE STEP AT A TIME</span><h2>창문이 열리듯,<br>가능한 만큼만 시작합니다</h2><p>NudgeOn은 현재 상태 확인부터 작은 행동, 대화 연습과 지원 정보 탐색까지 한 흐름으로 연결합니다. 빠른 변화를 요구하지 않고 사용자가 정한 속도를 존중합니다.</p><button class="btn ghost" data-go="check">5단계 살펴보기</button></div></section>`;
}

function vResume(){
  const label={check:'자가진단',bridge:'자가진단',report:'자가진단 결과',micro:'마이크로스텝',
    rehearsal:'사회적 리허설',connect:'AI 연결',record:'기록·성장'}[state.resumeScreen]||'이전 활동';
  return `
  <section class="resume-panel">
    <div class="eyebrow">기기 저장</div>
    <h1 class="big" tabindex="-1">하던 내용이 이 기기에 남아 있어요.</h1>
    <p class="lede">자가진단 답변과 행동 기록만 이 브라우저에 저장돼요. 사회적 리허설의 대화 원문은 자동 저장하지 않아요.</p>
    <div class="resume-card">
      <span class="resume-mark" aria-hidden="true">↗</span>
      <div><b>${label}부터 이어갈까요?</b><p>같은 브라우저에서만 이어지며 다른 기기나 계정과 자동 동기화되지는 않아요.</p></div>
    </div>
    <div class="row"><button class="btn" data-resume-saved="1">이어서 하기</button><button class="btn quiet" data-start-fresh="1">처음부터 시작</button></div>
  </section>`;
}

/* ── 01 자가진단 ── */
function vCheck(){
  const visible = QUESTIONS.filter(q=>shouldShow(q,state.answers));
  const total = visible.length;
  const pos = Math.max(1, visible.findIndex(q=>q.key===QUESTIONS[Math.min(state.qi,QUESTIONS.length-1)]?.key)+1);
  if(!total) return `
    <div class="eyebrow">01 — Self Check</div>
    <h2 class="mid" tabindex="-1">문항을 불러오지 못했어요</h2>
    <p class="note">잠시 후 새로고침해 주세요.</p>`;

  const Q = QUESTIONS[state.qi] || visible[0];
  const sv = String(Q.survey || 'legacy');
  const stageName = sv==='warmup' ? '워밍업'
                  : sv==='s1'     ? '1차 조사'
                  : sv.startsWith('s2') ? '2차 조사' : '';
  const head = stageName ? `${stageName} · ${pos} / ${total} 문항`
                         : `${pos} / ${total} 문항`;

  /* 주관식 문항 (flag = OPEN) */
  if(Q.flag==='OPEN'){
    const prev = state.answers[Q.key] && state.answers[Q.key]!=='(답하지 않음)'
               ? state.answers[Q.key] : '';
    return `
    <div class="eyebrow">01 — Self Check</div>
    <div class="qcount">${head}</div>
    <div class="bar"><i style="width:${(pos-1)/total*100}%"></i></div>
    <h2 class="mid" tabindex="-1">${Q.q}</h2>
    <textarea id="openAns" rows="4" placeholder="편한 만큼만 적어주세요. 비워두셔도 괜찮아요."
      style="width:100%; box-sizing:border-box; padding:12px; font:inherit; font-size:15px;
             border:1px solid currentColor; border-radius:8px; background:transparent;
             color:inherit; resize:vertical">${prev}</textarea>
    <div class="row">
      <button class="btn quiet" data-back="1">이전</button>
      <button class="btn" data-open="1">다음</button>
      <button class="btn quiet" data-skip="1">건너뛰기</button>
    </div>`;
  }

  return `
  <div class="eyebrow">01 — Self Check</div>
  <div class="qcount">${head}</div>
  <div class="bar"><i style="width:${(pos-1)/total*100}%"></i></div>
  <h2 class="mid" tabindex="-1">${Q.q}</h2>
  <div class="opts">
    ${Q.opts.map(([label,val])=>`
      <button class="opt" data-ans="${val}" aria-pressed="${state.answers[Q.key]===val}">${label}</button>`).join('')}
  </div>
  <div class="row">
    <button class="btn quiet" data-back="1">이전</button>
  </div>`;
}

/* ── 진단 리포트 ── */
function vReport(){
  const p = state.profile;
  const r = state.report;
  return `
  <div class="eyebrow">01 — Report</div>
  <h2 class="mid" tabindex="-1">${p.levelLine}</h2>
  <div class="card">
    <div class="qcount" style="letter-spacing:.1em">현재 활동 범위</div>
    <div style="font-size:23px; font-weight:500; margin:4px 0 16px">
      Lv.${p.level} · ${p.levelName}</div>
    <div class="qcount" style="letter-spacing:.1em">주요 실행 장벽</div>
    <div style="font-size:23px; font-weight:500; margin:4px 0 16px">${p.barrierLabel}</div>
    <div class="qcount" style="letter-spacing:.1em">지금 맞는 행동 크기</div>
    <div style="font-size:20px; font-weight:500; margin:4px 0 0">${p.actionSize}</div>
  </div>
  ${p.evidence?.length ? `<div class="card">
    <div class="qcount" style="letter-spacing:.1em">이렇게 판단한 근거</div>
    ${p.evidence.map(item=>`<p style="margin:8px 0 0; font-size:14px; color:var(--ink-soft)">· ${item}</p>`).join('')}
  </div>` : ''}
  <div class="card">
    ${state.reportLoading
        ? `<p class="report-loading" role="status" style="margin:0; font-size:15px">응답을 바탕으로 결과를 정리하고 있어요.</p>`
        : r ? r.split('\n').filter(Boolean).map(l=>`<p style="margin:0 0 10px; font-size:15px">${l}</p>`).join('')
        : `<p style="margin:0; font-size:15px">
             ${p.levelName} 단계에서 <b>${p.barrierLabel}</b> 때문에 다음 걸음이 멈춰 있어요.
             그래서 넛지온은 큰 목표 대신, 이 장벽을 넘지 않고 <b>돌아갈 수 있는 아주 작은 행동</b>부터 제안할게요.</p>`}
  </div>
  <div class="row">
    <button class="btn" data-go="micro" ${state.reportLoading?'disabled':''}>오늘 할 수 있는 것 보기</button>
    <button class="btn quiet" data-restart="1">다시 답하기</button>
  </div>
  <p class="note">넛지온은 사용자를 '고립 청년'으로 분류하지 않아요.
  분류가 아니라 <b>어디서 멈췄는지</b>만 봅니다. 그래서 낙인감이 생기지 않고, 시작점이 훨씬 낮아져요.</p>`;
}

/* ── 02 마이크로스텝 ── */
function vMicro(){
  const list = state.micro.length ? state.micro : FALLBACK_STEPS[state.profile.barrier].map((t,i)=>({text:t,why:'',done:false}));
  return `
  <div class="eyebrow">02 — Micro Steps</div>
  <h2 class="mid" tabindex="-1">오늘은 이 중 하나만 해도 충분해요</h2>
  <p class="lede">전부 할 필요 없어요. 첫 번째가 오늘의 한 걸음이고, 나머지는 그냥 참고예요.
  부담되면 더 작게, 너무 쉬우면 한 단계 높여서 나에게 맞는 크기를 찾을 수 있어요.</p>
  <div id="stepList">
    ${list.map((s,i)=>`
      <div class="step-item ${s.done?'done':''}">
        <button class="tick" data-tick="${i}" aria-pressed="${s.done}" aria-label="완료">${s.done?'✓':''}</button>
        <div><div class="step-text">${s.text}</div>
             ${s.why?`<div class="step-why">${s.why}</div>`:''}
             ${s.chainId?`<span class="level-chip">${MICROSTEP_CHAINS[s.chainId].label} · 난이도 ${s.difficulty+1}/${MICROSTEP_CHAINS[s.chainId].chain.length}</span>`:''}</div>
        <div class="step-actions">
          ${s.feature?`<button class="tiny feature" data-support="${i}">${s.supportOpen?'도움 닫기':'도움 보기'}</button>`:''}
          <button class="tiny" data-smaller="${i}" ${s.chainId && s.difficulty===0?'disabled':''}>더 작게</button>
          <button class="tiny" data-larger="${i}" ${!s.chainId || s.difficulty>=MICROSTEP_CHAINS[s.chainId].chain.length-1?'disabled':''}>한 단계 높이기</button>
        </div>
      </div>
      ${s.supportOpen?renderSupport(s,i):''}`).join('')}
  </div>
  <div class="row">
    <button class="btn" data-go="rehearsal">사람과 만나는 상황 연습해보기</button>
    <button class="btn quiet" data-regen="1">다른 걸로 바꿔주세요</button>
  </div>
  <p class="note">여기에 <b>연속 달성 스트릭을 일부러 넣지 않았어요.</b> 스트릭이 끊기는 순간
  "역시 나는 못 해"가 되기 쉬운데, 고립 상태에서는 그 실패 신호 하나가 앱을 완전히 떠나게 만들거든요.
  대신 난이도를 올리거나 내리며 실패가 아니라 <b>조정한 기록</b>으로 남겨요.</p>`;
}


function renderSupport(s,i){
  const data = SUPPORT_DATA[s.feature];
  if(!data) return '';
  if(s.feature==='video'){
    return `<div class="support-panel">
      <div class="support-head"><div><div class="support-title">${data.title}</div><p class="support-desc">${data.desc}</p></div>
      <button class="tiny" data-support="${i}">닫기</button></div>
      <div class="video-box"><div><button class="play" data-play="${i}" aria-label="스트레칭 재생">▶</button>
      <div class="play-note">어깨 돌리기 → 목 옆 늘리기 → 기지개</div></div></div>
    </div>`;
  }
  return `<div class="support-panel">
    <div class="support-head"><div><div class="support-title">${data.title}</div><p class="support-desc">${data.desc}</p></div>
    <button class="tiny" data-support="${i}">닫기</button></div>
    <div class="support-grid">${data.choices.map((c,j)=>`<button class="support-choice" data-choice="${i}:${j}" aria-pressed="${s.selectedSupport===j}">
      <b>${c[0]}</b><span>${c[1]}</span></button>`).join('')}</div>
    ${s.feature==='route'?`<div class="route-line"><i></i></div><div class="support-meta"><span>출발 · 집 앞</span><span>혼잡도 · 낮음</span><span>경사 · 거의 없음</span></div>`:''}
    ${s.feature==='cafe'?`<div class="draft">주문 연습 · “${data.choices[s.selectedSupport||0][0]} 한 잔 주세요.”</div>`:''}
  </div>`;
}

/* ── 03 사회적 리허설 ── */
function vRehearsal(){
  if(!state.scenario){
    return `
    <div class="eyebrow">03 — Social Rehearsal</div>
    <h2 class="mid" tabindex="-1">실전 말고, 먼저 여기서 한 번</h2>
    <p class="lede">틀려도 아무 일도 일어나지 않는 자리에서 먼저 해봐요.
    AI가 상대 역할을 맡고, 옆에서 짧게 코칭해줄게요. 그만두고 싶으면 그냥 나가면 돼요.</p>
    <div class="opts">
      ${SCENARIOS.map(s=>`<button class="opt" data-scenario="${s.id}">${s.title}</button>`).join('')}
    </div>
    <p class="note">제안서의 실시간 표정·시선 분석은 이 프로토타입에서 <b>일부러 빼두었어요.</b>
    카메라를 켜라는 요구 자체가 고립 상태에서는 가장 큰 이탈 지점이고, 텍스트만으로도 핵심 가치는 검증돼요.
    영상 분석은 검증 이후에 붙이는 게 맞습니다.</p>`;
  }
  const sc = SCENARIOS.find(s=>s.id===state.scenario);
  return `
  <div class="eyebrow">03 — ${sc.title}</div>
  <h2 class="mid" tabindex="-1">${sc.title}</h2>
  <div class="chat" id="chat">
    ${state.messages.map(m=>`<div class="msg ${m.role}">${m.text}</div>`).join('')}
    ${state.busy?'<div class="spin">…생각하는 중</div>':''}
  </div>
  <div class="composer">
    <textarea id="say" placeholder="편한 말로 써도 돼요. 완벽하지 않아도 괜찮아요."></textarea>
    <button class="btn" data-send="1" ${state.busy?'disabled':''}>보내기</button>
  </div>
  <div class="row">
    <button class="btn ghost" data-go="connect">연습 끝내고 실제 기회 보기</button>
    <button class="btn quiet" data-exitsc="1">다른 상황 고르기</button>
  </div>`;
}

/* ── 04 AI 연결 ── */
function vConnect(){
  return '<div id="connectApp"></div>';
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[character]);
}

/* ── 05 기록 ── */
const RECORD_NOTES_KEY='nudgeon.record-notes.v1';
const REHEARSAL_HISTORY_KEY='nudgeon.rehearsal-history.v1';
let recordDate=new Date().toISOString().slice(0,10);
let recordSaveStatus={date:'',ok:null,message:''};
function recordRead(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
function datePart(value){return typeof value==='string'?value.slice(0,10):''}
function monthCalendar(selected,activityDates){
  const date=new Date(`${selected}T12:00:00`),year=date.getFullYear(),month=date.getMonth();
  const first=new Date(year,month,1),last=new Date(year,month+1,0),today=new Date().toISOString().slice(0,10);
  const cells=Array(first.getDay()).fill('<span></span>');
  for(let day=1;day<=last.getDate();day++){
    const key=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    cells.push(`<button data-record-date="${key}" class="${key===selected?'selected ':''}${key===today?'today ':''}${activityDates.has(key)?'has-activity':''}">${day}</button>`);
  }
  return `<div class="calendar-head"><button data-record-month="-1">‹</button><b>${year}년 ${month+1}월</b><button data-record-month="1">›</button></div><div class="calendar-week"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-days">${cells.join('')}</div>`;
}

function vRecord(){
  const saved=Object.values(recordRead('nudgeon.saved-resources.v1',{}));
  const history=recordRead(REHEARSAL_HISTORY_KEY,[]);
  const legacyRehearsal=recordRead('nudgeon.rehearsal-summary.v1',null);
  const rehearsals=history.length?history:(legacyRehearsal?[legacyRehearsal]:[]);
  const notes=recordRead(RECORD_NOTES_KEY,{});
  const selectedIsToday=recordDate===new Date().toISOString().slice(0,10);
  const stages=[['preparing','준비 중'],['waiting','결과 기다리는 중'],['completed','완료']];
  const stageLabels={preparing:'준비 중',waiting:'결과 기다리는 중',completed:'완료'};
  const normalizedStage=item=>({interested:'preparing',checking:'preparing',documents:'preparing',applied:'waiting'}[item.stage]||item.stage||'preparing');
  const activities=[];
  state.micro.filter(step=>datePart(step.completedAt)===recordDate)
    .forEach(step=>activities.push(`마이크로스텝 완료 · ${step.text}`));
  rehearsals.filter(item=>datePart(item.savedAt)===recordDate)
    .forEach(item=>activities.push(`사회적 리허설 ${item.completedTurns||0}턴 · ${item.scenarioTitle||'상황 연습'}`));
  saved.filter(item=>datePart(item.savedAt)===recordDate)
    .forEach(item=>activities.push(`지원 저장 · ${item.resource?.title||'지원'}`));
  saved.forEach(item=>(item.stageHistory||[]).filter(event=>datePart(event.changedAt)===recordDate)
    .forEach(event=>activities.push(`지원 상태 변경 · ${item.resource?.title||'지원'} → ${stageLabels[event.stage]||event.stage}`)));
  const activityDates=new Set([
    ...state.micro.map(step=>datePart(step.completedAt)),
    ...rehearsals.map(item=>datePart(item.savedAt)),
    ...saved.map(item=>datePart(item.savedAt)),
    ...saved.flatMap(item=>(item.stageHistory||[]).map(event=>datePart(event.changedAt))),
    ...Object.keys(notes)
  ].filter(Boolean));
  return `
  <div class="eyebrow">05 — Record</div>
  <h2 class="mid" tabindex="-1">기록·성장</h2>
  <div class="record-layout"><section class="record-calendar card">${monthCalendar(recordDate,activityDates)}</section><section class="day-record card"><div class="record-date-title"><b>${recordDate}</b>${selectedIsToday?'<span>오늘</span>':''}</div><h3>한 일</h3><div class="day-activities">${activities.map(x=>`<p>✓ ${escapeHtml(x)}</p>`).join('')||'<p class="muted">아직 기록된 활동이 없어요.</p>'}</div><h3>짧은 기록</h3><textarea id="recordNote" placeholder="오늘의 생각을 짧게 남겨보세요.">${escapeHtml(notes[recordDate]||'')}</textarea><button class="btn quiet" data-save-note>${recordSaveStatus.date===recordDate&&recordSaveStatus.ok?'저장됨 ✓':'기록 저장'}</button><p class="record-save-status ${recordSaveStatus.ok===false?'error':''}" data-record-save-status aria-live="polite">${recordSaveStatus.date===recordDate?escapeHtml(recordSaveStatus.message):''}</p></section></div>
  <section class="support-board"><div class="record-section-head"><h3>지원 현황</h3><span>${saved.length}개</span></div><div class="support-columns">${stages.map(([key,label])=>`<div class="support-column"><h4>${label}</h4>${saved.filter(item=>normalizedStage(item)===key).map(item=>`<article><b>${escapeHtml(item.resource?.title||'저장한 지원')}</b><span>${escapeHtml(item.resource?.organization||'')}</span>${item.resource?.endsAt?`<small>${escapeHtml(String(item.resource.endsAt).slice(0,10))} 마감</small>`:''}</article>`).join('')||'<p>아직 없어요</p>'}</div>`).join('')}</div></section>`;
}

/* ═══════════════════════════════════════════════════════════
   9. 이벤트 연결
   ═══════════════════════════════════════════════════════════ */
function bind(){
  document.querySelectorAll('[data-journey-screen]').forEach(button=>button.onclick=()=>{
    const target=button.dataset.journeyScreen;
    if(target==='rehearsal'){
      persistProgress();
      window.location.href='/rehearsal';
      return;
    }
    if(canOpenScreen(target)) go(target);
  });
  stage.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  stage.querySelectorAll('[data-next-action]').forEach(button=>button.onclick=()=>{
    state.nextAction=button.dataset.nextAction;
    render();
  });
  stage.querySelectorAll('[data-record-date]').forEach(button=>button.onclick=()=>{recordDate=button.dataset.recordDate;recordSaveStatus={date:'',ok:null,message:''};render()});
  stage.querySelectorAll('[data-record-month]').forEach(button=>button.onclick=()=>{
    const date=new Date(`${recordDate}T12:00:00`);date.setMonth(date.getMonth()+Number(button.dataset.recordMonth));date.setDate(1);recordDate=date.toISOString().slice(0,10);recordSaveStatus={date:'',ok:null,message:''};render();
  });
  stage.querySelector('[data-save-note]')?.addEventListener('click',()=>{
    const value=document.getElementById('recordNote')?.value||'';
    const notes=recordRead(RECORD_NOTES_KEY,{});
    if(value.trim()) notes[recordDate]=value;
    else delete notes[recordDate];
    try{
      localStorage.setItem(RECORD_NOTES_KEY,JSON.stringify(notes));
      const verified=recordRead(RECORD_NOTES_KEY,{});
      if(value.trim() && verified[recordDate]!==value) throw new Error('저장 확인 실패');
      recordSaveStatus={date:recordDate,ok:true,message:value.trim()?`${recordDate} 기록을 이 기기에 저장했어요.`:'이 날짜의 짧은 기록을 삭제했어요.'};
    }catch(error){
      console.warn('짧은 기록 저장 실패:',error);
      recordSaveStatus={date:recordDate,ok:false,message:'기록을 저장하지 못했어요. 브라우저의 사이트 데이터 설정을 확인해 주세요.'};
    }
    render();
  });
  stage.querySelectorAll('[data-prev-step]').forEach(b=>b.onclick=navigateBack);
  stage.querySelectorAll('[data-resume-saved]').forEach(b=>b.onclick=()=>{
    state.screen=state.resumeScreen||'check'; state.resumeScreen=null;
    if(state.screen==='rehearsal'){ persistProgress(); window.location.href='/rehearsal'; return; }
    render();
  });
  stage.querySelectorAll('[data-start-fresh]').forEach(b=>b.onclick=()=>clearProgress('intro'));
  stage.querySelectorAll('[data-clear-progress]').forEach(b=>b.onclick=()=>{
    if(window.confirm('이 기기에 저장된 자가진단과 활동 기록을 모두 삭제할까요?')) clearProgress('intro');
  });
  stage.querySelectorAll('[data-restart]').forEach(b=>b.onclick=()=>{
    localStorage.removeItem(STORAGE_KEY);
    resetState('check');
    render();
  });
  stage.querySelectorAll('[data-ans]').forEach(b=>b.onclick=()=>answer(b.dataset.ans));
  stage.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{
    const pv = prevIndex(state.qi-1);
    if(pv>=0){ state.qi = pv; render(); }
    else { state.screen='intro'; render(); }
  });
  stage.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>{
    const nx = nextIndex(state.qi+1);
    if(nx>=0){ state.qi = nx; state.screen='check'; render(); } else finishCheck();
  });
  stage.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{
    const t=document.getElementById('openAns');
    answer((t?.value||'').trim() || '(답하지 않음)');
  });
  stage.querySelectorAll('[data-skip]').forEach(b=>b.onclick=()=>answer('(답하지 않음)'));
  stage.querySelectorAll('[data-tick]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.tick,step=state.micro[i];
    step.done=!step.done;
    step.completedAt=step.done?new Date().toISOString():null;
    render();
  });
  stage.querySelectorAll('[data-smaller]').forEach(b=>b.onclick=()=>makeSmaller(+b.dataset.smaller));
  stage.querySelectorAll('[data-larger]').forEach(b=>b.onclick=()=>makeLarger(+b.dataset.larger));
  stage.querySelectorAll('[data-support]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.support; state.micro[i].supportOpen=!state.micro[i].supportOpen; render();
  });
  stage.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{
    const [i,j]=b.dataset.choice.split(':').map(Number); state.micro[i].selectedSupport=j; render();
  });
  stage.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.play; b.textContent='✓';
    state.micro[i].why='첫 동작까지 확인했어요. 여기서 멈춰도 완료예요.';
    setTimeout(render,450);
  });
  stage.querySelectorAll('[data-regen]').forEach(b=>b.onclick=()=>loadSteps(true));
  stage.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>startScenario(b.dataset.scenario));
  stage.querySelectorAll('[data-exitsc]').forEach(b=>b.onclick=()=>{state.scenario=null; state.messages=[]; render()});
  stage.querySelectorAll('[data-send]').forEach(b=>b.onclick=send);
  stage.querySelectorAll('[data-draft]').forEach(b=>b.onclick=makeDraft);
  stage.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{
    navigator.clipboard?.writeText(state.draft); b.textContent='복사했어요';
  });
  const say = document.getElementById('say');
  if(say){ say.focus(); say.onkeydown = e => {
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } }; }
  const chat = document.getElementById('chat');
  if(chat) chat.scrollTop = chat.scrollHeight;
}

function go(s){
  if(s==='rehearsal'){
    state.visited.add('rehearsal');
    state.screen='rehearsal';
    persistProgress();
    window.location.href='/rehearsal';
    return;
  }
  state.visited.add(s==='report'?'check':s);
  state.screen = s;
  render();
  if(s==='micro' && !state.micro.length) loadSteps();
}

function navigateBack(){
  if(state.screen==='bridge'){
    state.screen='check';
  }else if(state.screen==='report'){
    state.screen='check';
    const last=prevIndex(QUESTIONS.length-1);
    if(last>=0) state.qi=last;
  }else if(state.screen==='micro'){
    state.screen='report';
  }else if(state.screen==='connect'){
    persistProgress();
    window.location.href='/rehearsal';
    return;
  }else if(state.screen==='record'){
    state.screen='connect';
  }else{
    state.screen='intro';
  }
  render();
}

function answer(val){
  const Q = QUESTIONS[state.qi];
  state.answers[Q.key] = val;

  /* 1차 조사의 마지막 문항이면 군을 판정하고 2차 문항을 이어붙인다 */
  const isLastS1 = Q.survey==='s1' &&
                   !QUESTIONS.slice(state.qi+1).some(q=>String(q.survey||'')==='s1');
  let justBranched = false;
  if(isLastS1 && !state.group){
    state.group = decideGroup(state.answers);
    const next = questionsOf([STAGE2[state.group]]);
    if(next.length){
      QUESTIONS = QUESTIONS.concat(next);
      justBranched = true;
      console.info('자가진단 분기:', state.group, '· 2차 문항', next.length+'개');
    }
  }

  const nxt = nextIndex(state.qi+1);
  if(justBranched){ state.screen='bridge'; render(); return; }
  if(nxt >= 0){ state.qi = nxt; render(); }
  else finishCheck();
}

/* 1차 → 2차로 넘어가기 전 숨 고르는 화면 */
const BRIDGE = {
  hikikomori:{ line:'지금은 집 안이 가장 편한 시기인 것 같아요.',
    body:'무리해서 밖으로 나가는 이야기는 하지 않을게요. 대신 지금 생활을 조금 더 알아야 오늘 할 수 있는 크기의 행동을 고를 수 있어요.' },
  isolation:{ line:'밖으로는 나가지만, 사람과의 연결은 줄어 있는 상태로 보여요.',
    body:'어디서 멈추는지가 사람마다 달라서, 몇 가지만 더 여쭤볼게요. 그래야 연습부터 할지 연결부터 할지 정할 수 있어요.' },
  boundary:{ line:'일상은 대체로 유지되고 있네요.',
    body:'그렇다면 상태를 더 묻기보다, 어떤 걸 좋아하고 뭘 바라는지 아는 게 더 도움이 돼요. 편하게 답해주세요.' }
};

function vBridge(){
  const g = BRIDGE[state.group] || BRIDGE.isolation;
  const left = QUESTIONS.slice(state.qi+1).filter(q=>shouldShow(q,state.answers)).length;
  return `
  <div class="eyebrow">01 — Self Check</div>
  <h2 class="mid" tabindex="-1">${g.line}</h2>
  <div class="card">
    <p style="margin:0; font-size:15px">${g.body}</p>
    <p style="margin:10px 0 0; font-size:14px; color:var(--ink-soft)">
      남은 문항은 <b>${left}개</b>예요. 답하기 어려운 건 건너뛰어도 괜찮아요.</p>
  </div>
  <div class="row"><button class="btn" data-resume="1">계속하기</button></div>
  <p class="note">넛지온은 사용자를 어떤 유형으로 분류하지 않아요.
  지금 <b>어디서 멈췄는지</b>만 보고, 그에 맞는 크기의 행동을 찾습니다.</p>`;
}

async function finishCheck(){
  state.profile = buildProfile(state.answers);
  const reportProfile = state.profile;
  state.report = null;
  state.reportLoading = true;
  state.visited.add('check');
  state.screen = 'report';
  render();
  try{
    const generatedReport = await ask(
      [{role:'user',content:
        `현재 연결 단계: Lv.${state.profile.level} ${state.profile.levelName}\n`+
        `주요 장벽: ${state.profile.barrierLabel}\n`+
        `1년 뒤 바람: ${state.profile.vision}\n`+
        `이 사람에게 2~3문장으로 리포트를 써줘.`}],
      `너는 고립·은둔 청년을 돕는 서비스의 진단 리포트 작성자다.
규칙: 진단명·병명을 쓰지 않는다. 격려나 응원 문구를 쓰지 않는다.
"괜찮아요","할 수 있어요" 같은 말은 금지. 지금 상태를 담담하게 서술하고,
왜 이 장벽 때문에 멈추는지를 설명하고, 그래서 어떤 크기의 행동부터 시작할지를 말한다.
반말 금지, 존댓말. 2~3문장. 다른 말 없이 리포트만 출력.`);
    if(state.profile !== reportProfile) return;
    state.report = generatedReport;
  }catch(e){
    console.warn('리포트 생성 실패, 기본 문구 사용:', e);
  }finally{
    if(state.profile === reportProfile){
      state.reportLoading = false;
      if(state.screen==='report') render();
      else persistProgress();
    }
  }
}

async function loadSteps(regen=false){
  const p = state.profile;
  /* 발표 중 네트워크 상태와 무관하게 항상 같은 완성도 높은 데모를 보여준다. */
  if(regen && state.micro.length>1){
    state.micro = [...state.micro.slice(1), state.micro[0]];
  }else{
    state.micro = createDemoSteps(p.barrier);
  }
  render();
}

async function makeSmaller(i){
  adjustMicrostep(i,-1);
}

async function makeLarger(i){
  adjustMicrostep(i,1);
}

function adjustMicrostep(i,direction){
  const cur=state.micro[i];
  if(!cur?.chainId) return;
  const group=MICROSTEP_CHAINS[cur.chainId];
  const next=Math.max(0,Math.min(group.chain.length-1,cur.difficulty+direction));
  if(next===cur.difficulty) return;
  cur.difficulty=next;
  cur.text=group.chain[next];
  cur.why=group.why[next];
  cur.supportOpen=false;
  cur.done=false;
  cur.completedAt=null;
  if(direction<0) cur.adjustedDown=(cur.adjustedDown||0)+1;
  else cur.adjustedUp=(cur.adjustedUp||0)+1;
  render();
}

function startScenario(id){
  const sc = SCENARIOS.find(s=>s.id===id);
  state.scenario = id;
  state.messages = [{role:'them', text:sc.open}];
  render();
}

async function send(){
  const el = document.getElementById('say');
  const text = el.value.trim();
  if(!text || state.busy) return;
  state.messages.push({role:'me', text});
  state.busy = true; render();

  const sc = SCENARIOS.find(s=>s.id===state.scenario);
  try{
    const history = state.messages.filter(m=>m.role!=='coach').map(m=>({
      role: m.role==='me' ? 'user' : 'assistant', content:m.text }));
    const txt = await ask(history,
      `너는 사회적 리허설 상대다. 역할: ${sc.who}. 상황: ${sc.title}.
상대는 오래 사람을 만나지 않은 청년이다. 절대 냉담하거나 무례하지 않다.
말투는 현실적이되 따뜻하고, 2~3문장으로 짧게. 실제로 그 사람이 할 법한 대화만 한다.
그리고 마지막에 한 줄, 사용자에게 주는 짧은 코칭을 붙인다.
형식: 대화 내용 → 줄바꿈 → "COACH: 코칭 한 문장"`);
    const [reply, coach] = txt.split(/COACH\s*:/);
    state.messages.push({role:'them', text:reply.trim()});
    if(coach) state.messages.push({role:'coach', text:'코칭 · ' + coach.trim()});
  }catch(e){
    state.messages.push({role:'them', text:'네, 편하게 말씀해 주세요. 천천히 하셔도 괜찮습니다.'});
    state.messages.push({role:'coach', text:'코칭 · 지금처럼 한 문장만 써도 충분히 전달돼요.'});
  }
  state.busy = false; render();
}

async function makeDraft(){
  const p = state.profile || {
    level:3, levelName:'제한적 외출', barrierLabel:'정보 과부하', vision:'아직 정하지 않았어요'
  };
  state.draft = '문장을 만드는 중…'; render();
  try{
    state.draft = await ask(
      [{role:'user',content:
        `Lv.${p.level} ${p.levelName}, 장벽 ${p.barrierLabel}, 바람 ${p.vision}인 청년이
상담센터에 처음 보낼 문의 메시지를 써줘.`}],
      `한국 대학·청년기관에 처음 문의하는 메시지를 대신 쓴다.
규칙: 3~4문장. 과하게 사정을 설명하지 않는다. 사과로 시작하지 않는다.
"늦어서 죄송하지만" 같은 표현 금지. 담담하고 짧게. 메시지 본문만 출력.`);
  }catch(e){
    state.draft = '안녕하세요. 상담을 신청하고 싶어 연락드립니다.\n요즘 밖에 나가거나 사람을 만나는 게 어려워서, 어디서부터 도움을 받으면 좋을지 알고 싶습니다.\n첫 상담은 어떻게 진행되는지 알려주실 수 있을까요?';
  }
  render();
}

initializeApp();
