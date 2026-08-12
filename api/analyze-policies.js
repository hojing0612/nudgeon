import { callClaudeTool, supabaseHeaders } from './_anthropic.js';

const CATEGORIES = ['counseling', 'welfare', 'career', 'housing', 'education', 'community', 'finance-legal'];
const BENEFITS = ['cash', 'housing_cost', 'loan', 'employment', 'training', 'counseling', 'service', 'event', 'information', 'other'];

const analysisSchema = {
  type: 'object', additionalProperties: false, required: ['analyses'],
  properties: { analyses: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id','category','benefit_type','benefit_summary','practical_value','target_regions','nationwide','age_min','age_max','education_statuses','employment_statuses','job_fields','application_status','application_start','application_end','recommended','confidence','source_evidence'],
    properties: {
      id:{type:'string'}, category:{type:'string',enum:CATEGORIES}, benefit_type:{type:'string',enum:BENEFITS},
      benefit_summary:{type:'string'}, practical_value:{type:'integer'},
      target_regions:{type:'array',items:{type:'string'}}, nationwide:{type:'boolean'},
      age_min:{type:['integer','null']}, age_max:{type:['integer','null']},
      education_statuses:{type:'array',items:{type:'string',enum:['student','leave','graduate','none']}},
      employment_statuses:{type:'array',items:{type:'string',enum:['unemployed','inactive','employed','parttime','student']}},
      job_fields:{type:'array',items:{type:'string'}}, application_status:{type:'string',enum:['open','upcoming','closed','always','unknown']},
      application_start:{type:['string','null']}, application_end:{type:['string','null']},
      recommended:{type:'boolean'}, confidence:{type:'number'}, source_evidence:{type:'array',items:{type:'string'}}
    }
  }}}
};

async function db(path, options = {}) {
  const base = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${base}/rest/v1/${path}`, { ...options, headers: supabaseHeaders(key, { Prefer:'return=representation', ...(options.headers || {}) }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0,800)}`);
  return text ? JSON.parse(text) : [];
}

function normalizeAnalysis(analysis) {
  return {
    ...analysis,
    practical_value: Math.min(10, Math.max(0, Math.round(Number(analysis.practical_value) || 0))),
    confidence: Math.min(1, Math.max(0, Number(analysis.confidence) || 0))
  };
}

function priorityScore(resource) {
  const raw = resource.raw_data || {};
  const text = `${resource.title || ''} ${resource.summary || ''} ${resource.support_details || ''}`;
  const regions = (resource.region_codes || []).map(String);
  let score = 0;
  if (!regions.length || regions.some(code => ['0', '00', '전국'].includes(code))) score += 50;
  if (regions.some(code => code.startsWith('11'))) score += 40;
  if (/지원금|수당|응시료|월세|임대|대출|장학|교육비|훈련|취업|상담|치료/.test(text)) score += 30;
  if (/행사|축제|위원회|서포터즈|홍보|공모전/.test(text)) score -= 25;
  if (['welfare', 'housing', 'career', 'counseling'].includes(raw.category)) score += 10;
  return score;
}

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error:'GET 또는 POST 요청만 받아요' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error:'분석 권한이 없어요' });
  try {
    const requested = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
    const pool = await db('resources?select=id,title,summary,details,support_details,organization_name,application_status,always_open,region_codes,raw_data&status=eq.published&ai_analyzed_at=is.null&limit=500&order=verified_at.desc.nullslast');
    const rows = pool.sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, requested);
    if (!rows.length) return res.status(200).json({ success:true, analyzed:0, remaining:false });
    let analyzed = 0;
    let recommended = 0;
    const failures = [];
    for (let offset = 0; offset < rows.length; offset += 20) {
      const batch = rows.slice(offset, offset + 20);
      try {
        const result = await callClaudeTool({
          name:'save_policy_analysis',
          description:'각 청년정책 원문을 분석해 실질 혜택, 정확한 대상 조건, 신청 상태, 추천 가치와 원문 근거를 구조화한다. 교육·취업 상태 배열에는 명시적으로 신청 가능한 상태만 넣고 제한이 없으면 빈 배열로 둔다. 단순 행사·위원회·홍보·공간 운영은 practical_value를 낮게 주고 recommended=false로 둔다. 현금성 지원, 주거비, 교육비, 취업·훈련, 실제 예약 가능한 상담처럼 사용자가 직접 받을 혜택은 높게 평가한다.',
          schema:analysisSchema,
          input:{ today:new Date().toISOString().slice(0,10), policies:batch },
          maxTokens:8000
        });
        const byId = new Map(result.analyses.map(item => [item.id,item]));
        for (const row of batch) {
          const rawAnalysis = byId.get(row.id);
          if (!rawAnalysis) continue;
          const analysis = normalizeAnalysis(rawAnalysis);
          await db(`resources?id=eq.${row.id}`, { method:'PATCH', body:JSON.stringify({ ai_analysis:analysis, ai_analyzed_at:new Date().toISOString() }) });
          analyzed += 1;
          if (analysis.recommended && analysis.confidence >= .55 && analysis.practical_value >= 4) recommended += 1;
        }
      } catch (error) {
        console.error(`정책 AI 분석 묶음 실패(${offset + 1}-${offset + batch.length}):`, error);
        failures.push({ from:offset + 1, to:offset + batch.length, error:String(error.message || error).slice(0,300) });
      }
    }
    return res.status(failures.length === Math.ceil(rows.length / 20) ? 500 : 200).json({ success:failures.length === 0, requested:rows.length, analyzed, recommended, failedBatches:failures, remaining:pool.length > rows.length });
  } catch (error) {
    console.error('정책 AI 분석 실패:', error);
    return res.status(500).json({ error:'정책 AI 분석에 실패했어요' });
  }
}
