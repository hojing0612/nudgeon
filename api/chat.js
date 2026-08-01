/* ═══════════════════════════════════════════════════════════
   백엔드 — 주방
   ───────────────────────────────────────────────────────────
   이 파일은 방문자 컴퓨터로 절대 전송되지 않아요.
   Vercel 서버에서만 실행돼요. 그래서 API 키를 여기서 다룰 수 있어요.

   주소: 이 파일이 api/chat.js 이므로  →  /api/chat  으로 호출돼요.
   (Vercel은 api/ 폴더 안의 파일을 자동으로 주소로 만들어줘요)
   ═══════════════════════════════════════════════════════════ */

export default async function handler(req, res) {

  // 1) POST 요청만 받아요. 주소창으로 그냥 열어보는 건 막아요.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 받아요' });
  }

  // 2) 키가 설정돼 있는지 먼저 확인. 없으면 원인을 명확히 알려줘요.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 없어요');
    return res.status(500).json({ error: '서버에 API 키가 설정되지 않았어요' });
  }

  try {
    const { messages, system } = req.body || {};

    // 3) 간단한 방어 — 이 주소는 인터넷에 공개돼 있어요.
    //    아무나 호출할 수 있으니 최소한의 크기 제한은 걸어둬요.
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages가 필요해요' });
    }
    if (messages.length > 30) {
      return res.status(400).json({ error: '대화가 너무 길어요' });
    }
    const total = JSON.stringify(messages).length;
    if (total > 12000) {
      return res.status(400).json({ error: '내용이 너무 길어요' });
    }

    // 4) 여기서 키를 붙여요. 이 줄이 이 파일이 존재하는 이유예요.
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system,
        messages
      })
    });

    const data = await r.json();

    if (!r.ok) {
      // 자세한 오류는 서버 로그에만 남겨요.
      // 방문자에게 그대로 보여주면 내부 정보가 새어나갈 수 있어요.
      console.error('Anthropic 오류:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI 호출에 실패했어요' });
    }

    // 5) 답변에서 텍스트만 뽑아서 프론트엔드로 돌려줘요.
    const text = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return res.status(200).json({ text });

  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버에서 문제가 생겼어요' });
  }
}
