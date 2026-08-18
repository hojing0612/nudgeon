const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitStore = globalThis.__nudgeonChatRateLimit || new Map();
globalThis.__nudgeonChatRateLimit = rateLimitStore;

const CRISIS_PATTERNS = [
  /자살/, /자해/, /죽고\s*싶/, /죽어\s*버리/, /살기\s*싫/,
  /목숨을?\s*(?:끊|버리)/, /내\s*삶을?\s*끝내/, /나를?\s*해치/,
  /사라지고\s*싶/, /없어지고\s*싶/, /유서/
];

const SAFETY_REPLY = '지금은 역할극을 계속하기보다 즉시 사람의 도움을 받는 것이 먼저예요. 당장 자신이나 다른 사람을 해칠 가능성이 있다면 112 또는 119에 전화하고, 자살예방 상담전화 109에서도 24시간 상담받을 수 있어요. 가능하면 혼자 있지 말고 가까운 사람에게 지금 상황을 알려주세요.';

function clean(value, max = 180) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

export function containsCrisisLanguage(messages = []) {
  const userText = messages
    .filter(message => message?.role === 'user')
    .map(message => String(message.content || ''))
    .join(' ');
  return CRISIS_PATTERNS.some(pattern => pattern.test(userText));
}

export function buildServerSystem(task, context = {}) {
  const scenario = clean(context.scenario, 100);
  const role = clean(context.role, 120);
  const level = clean(context.level, 40);
  const barrier = clean(context.barrier, 80);
  const vision = clean(context.vision, 120);
  const prompts = {
    rehearsal: `너는 사회적 리허설 상대다. 역할: ${role || '기관 담당자'}. 상황: ${scenario || '처음 문의하기'}.
규칙: 사용자의 실제 답변에 반응하고, 현실적이고 따뜻한 1~3문장으로 답한다. 한 번에 질문은 하나만 한다. 사용자를 압박하거나 죄책감을 주지 않는다. 코칭은 칭찬 대신 구체적인 관찰이나 제안으로 쓴다.
반드시 JSON으로 출력한다: {"reply":"상대방의 대화","coach":"짧은 코칭","safety":false}`,
    examples: `너는 사회적 리허설 도우미다. 상황은 ${scenario || '처음 문의하기'}, 상대 역할은 ${role || '기관 담당자'}다. 사용자가 말문이 막혔을 때 선택할 수 있는 서로 다른 부담 수준의 답변 예시 3개를 만든다. 반드시 JSON으로 출력한다: {"minimal":"한 문장 최소 표현","normal":"상황을 조금 설명한 표현","honest":"현재 어려움을 포함한 표현"}`,
    rewrite: `너는 문장 다듬기 도우미다. 상황은 ${scenario || '처음 문의하기'}다. 사용자의 원래 의미를 바꾸지 않고 짧고 명확하게 다듬는다. 지나친 자기비난을 제거하고 상대에게 원하는 행동을 분명히 한다. 반드시 JSON으로 출력한다: {"rewritten":"다듬어진 문장"}`,
    'assessment-report': `너는 고립·은둔 청년을 돕는 서비스의 자가진단 리포트 작성자다. 현재 단계는 ${level || '미확인'}, 주요 장벽은 ${barrier || '미확인'}, 바라는 변화는 ${vision || '미확인'}다. 진단명이나 병명을 쓰지 않고, 과한 격려 없이 현재 상태와 멈추는 이유, 시작할 행동의 크기를 존댓말 2~3문장으로만 쓴다.`,
    'contact-draft': `너는 한국의 대학·청년기관에 처음 문의하는 메시지를 작성한다. 사용자의 현재 단계는 ${level || '미확인'}, 주요 장벽은 ${barrier || '미확인'}, 바라는 변화는 ${vision || '미확인'}다. 사과로 시작하거나 과하게 사정을 설명하지 않고, 담담한 존댓말 3~4문장으로 메시지 본문만 쓴다.`
  };
  return prompts[task] || null;
}

function clientIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

export function takeRateLimit(key, now = Date.now()) {
  const recent = (rateLimitStore.get(key) || []).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(key, recent);
    return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  rateLimitStore.set(key, recent);
  return { allowed: true, remaining: RATE_LIMIT_MAX - recent.length, retryAfter: 0 };
}

export function clearRateLimitsForTest() {
  rateLimitStore.clear();
}

function validMessages(messages) {
  return Array.isArray(messages) && messages.length > 0 && messages.length <= 30 &&
    messages.every(message => ['user', 'assistant'].includes(message?.role) &&
      typeof message.content === 'string' && message.content.trim() && message.content.length <= 3000);
}

export default async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받아요' });

  const { messages, task, context } = req.body || {};
  if (!validMessages(messages)) return res.status(400).json({ error: '대화 형식이 올바르지 않아요' });
  if (JSON.stringify(messages).length > 12000) return res.status(400).json({ error: '내용이 너무 길어요' });
  const system = buildServerSystem(task, context);
  if (!system) return res.status(400).json({ error: '허용되지 않은 AI 작업이에요' });

  if (containsCrisisLanguage(messages)) {
    return res.status(200).json({ safety: true, text: JSON.stringify({ reply: SAFETY_REPLY, coach: '', safety: true }) });
  }

  const limit = takeRateLimit(clientIp(req));
  res.setHeader?.('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.setHeader?.('X-RateLimit-Remaining', String(limit.remaining));
  if (!limit.allowed) {
    res.setHeader?.('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 없어요');
    return res.status(500).json({ error: '서버에 API 키가 설정되지 않았어요' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system, messages })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic 오류:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI 호출에 실패했어요' });
    }
    const text = (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
    return res.status(200).json({ text, safety: false });
  } catch (error) {
    console.error('서버 오류:', error);
    return res.status(500).json({ error: '서버에서 문제가 생겼어요' });
  }
}
