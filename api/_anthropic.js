export async function callClaudeTool({ name, description, schema, input, maxTokens = 3000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is missing');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_POLICY_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: '공식 정책 원문에 있는 정보만 사용한다. 근거가 없으면 추측하지 말고 unknown 또는 빈 배열을 반환한다. 사용자에게 보여줄 추천 서비스의 내부 데이터이므로 보수적으로 판단한다.',
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      tools: [{ name, description, input_schema: schema, strict: true }],
      tool_choice: { type: 'tool', name }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
  const tool = data.content?.find(block => block.type === 'tool_use' && block.name === name);
  if (!tool?.input) throw new Error('Claude did not return the requested structured result');
  return tool.input;
}

export function supabaseHeaders(key, extra = {}) {
  if (!key) throw new Error('Supabase server key is missing');
  const headers = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}
