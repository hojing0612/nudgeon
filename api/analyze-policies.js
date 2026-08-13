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

function analysesFrom(result) {
  if (!Array.isArray(result?.analyses) || !result.analyses.length) {
    throw new Error('Anthropic 응답에 analyses 배열이 없어요');
  }
  return result.analyses;
}

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error:'GET 또는 POST 요청만 받아요' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error:'분석 권한이 없어요' });
  try {
    const rows = await db('resources?select=id,title,summary,details,support_details,organization_name,application_status,always_open,region_codes,raw_data&status=eq.published&ai_analyzed_at=is.null&limit=20&order=verified_at.desc.nullslast');
    if (!rows.length) return res.status(200).json({ success:true, analyzed:0, remaining:false });
    let analyses;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await callClaudeTool({
          name:'save_policy_analysis',
          description:'각 청년정책 원문을 분석해 실질 혜택, 정확한 대상 조건, 신청 상태, 추천 가치와 원문 근거를 구조화한다. 반드시 입력된 각 정책의 분석을 analyses 배열에 넣는다. 카테고리는 기관 명칭이 아니라 사용자가 직접 받는 핵심 혜택으로 정한다. 취업상담·일자리센터·면접지원은 career이지 counseling이 아니다. 전월세·보증금·임대·청약은 housing이다. counseling은 심리상담·정신건강·치료비·고립은둔 지원에 한정한다. 교육·취업 상태 배열에는 명시적으로 신청 가능한 상태만 넣고 제한이 없으면 빈 배열로 둔다. 단순 기관/센터 소개, 홈페이지·포털·SNS 안내, 정보 제공, 행사·위원회·홍보·공간 운영은 practical_value를 0~3으로 주고 recommended=false로 둔다. 구체적인 신청·예약·지원 경로가 있고 현금성 지원, 주거비, 교육비, 취업·훈련, 치료비, 실제 예약 가능한 상담처럼 사용자가 직접 받을 혜택만 recommended=true로 둔다. 지역명과 주관기관 소재지를 혼동하지 말고 실제 지원대상 지역만 target_regions에 기록한다.',
          schema:analysisSchema,
          input:{ today:new Date().toISOString().slice(0,10), policies:rows },
          maxTokens:8000
        });
        analyses = analysesFrom(result);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        console.warn('정책 AI 분석 응답 누락으로 한 번 재시도해요');
      }
    }
    const byId = new Map(analyses.map(item => [item.id,item]));
    for (const row of rows) {
      const rawAnalysis = byId.get(row.id);
      if (!rawAnalysis) continue;
      const analysis = normalizeAnalysis(rawAnalysis);
      await db(`resources?id=eq.${row.id}`, { method:'PATCH', body:JSON.stringify({ ai_analysis:analysis, ai_analyzed_at:new Date().toISOString(), status:analysis.confidence < .55 ? 'review' : 'published' }) });
    }
    return res.status(200).json({ success:true, analyzed:byId.size, remaining:true });
  } catch (error) {
    console.error('정책 AI 분석 실패:', error);
    return res.status(500).json({ error:'정책 AI 분석에 실패했어요' });
  }
}