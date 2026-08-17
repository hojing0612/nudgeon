import { callClaudeTool, supabaseHeaders } from './_anthropic.js';

const presentationSchema = {
  type:'object', additionalProperties:false,
  required:['version','summary','benefits','eligibility','documents','costs','notes'],
  properties:{
    version:{type:'integer'}, summary:{type:'string'},
    benefits:{type:'array',items:{type:'string'}},
    eligibility:{type:'array',items:{type:'string'}},
    documents:{type:'array',items:{type:'string'}},
    costs:{type:'array',items:{type:'object',additionalProperties:false,required:['group','price','user_share','note'],properties:{group:{type:'string'},price:{type:'string'},user_share:{type:'string'},note:{type:'string'}}}},
    notes:{type:'array',items:{type:'string'}}
  }
};

function dbHeaders(key, prefer) {
  return supabaseHeaders(key, prefer ? { Prefer:prefer } : {});
}

function presentationFrom(analysis={}) {
  if (!(Number(analysis.presentation_version) >= 1)) return null;
  return {
    version:analysis.presentation_version,
    summary:analysis.display_summary||'', benefits:analysis.benefit_items||[],
    eligibility:analysis.eligibility_items||[], documents:analysis.document_items||[],
    costs:analysis.cost_rows||[], notes:analysis.important_notes||[]
  };
}

function cleanItem(value='') {
  return String(value)
    .replace(/<[^>]*>/g,' ')
    .replace(/(?:^|\s)[○●▪■□▶▷※]+\s*/g,' ')
    .replace(/(?:^|\s)(?:[-–—]|\d+[.)])\s*/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function conciseItems(value,limit) {
  const text=String(value||'').replace(/<br\s*\/?>/gi,'\n');
  const parts=text.split(/\r?\n|[•·]|\s+[○●▪■□▶▷※]\s*|\s+-\s+|(?=\s+\d+[.)]\s+)/);
  const unique=[];
  for(const part of parts){
    const item=cleanItem(part);
    if(item.length<2||unique.includes(item))continue;
    unique.push(item.length>240?`${item.slice(0,237).trim()}…`:item);
    if(unique.length>=limit)break;
  }
  return unique;
}

function fallbackPresentation(resource) {
  const summary=cleanItem(resource.summary||resource.support_details||resource.details||'');
  return {
    version:1,
    summary:summary.length>500?`${summary.slice(0,497).trim()}…`:summary,
    benefits:conciseItems(resource.support_details,4),
    eligibility:conciseItems(resource.details,6),
    documents:conciseItems(resource.required_documents,6),
    costs:[],
    notes:conciseItems(resource.application_method,3)
  };
}

async function createPresentation(resource) {
  let lastError;
  for(let attempt=0;attempt<2;attempt+=1){
    try{
      return await callClaudeTool({
        name:'present_policy_for_user',
        description:'정책 원문에서 사용자가 신청을 결정하고 준비하는 데 필요한 정보만 간결하게 구조화한다. summary는 무엇을 얼마나 받는지 1~2문장으로 쓴다. benefits는 횟수·금액·기간 등 핵심 혜택만 최대 4개, eligibility는 실제 신청자 조건만 최대 6개, documents는 제출할 문서명만 쓴다. 기관·상담사·제공인력의 자격, 사업 배경, 법령 설명은 제외한다. 번호·불릿·하이픈을 문자열에 넣지 않는다. 자격조건과 제출서류를 중복하지 않는다. 소득구간별 가격이나 본인부담 차이가 원문에 있을 때만 costs로 만들고 근거가 없으면 빈 배열로 둔다. 중요한 예외만 notes에 최대 3개로 둔다. 원문에 없는 내용은 추측하지 않는다. version은 1이다.',
        schema:presentationSchema,
        input:{today:new Date().toISOString().slice(0,10),policy:resource},
        maxTokens:2500
      });
    }catch(error){
      lastError=error;
      console.warn(`정책 상세 AI 정리 ${attempt+1}차 실패:`,error);
    }
  }
  throw lastError;
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).json({error:'POST 요청만 받아요'});
  const id=String(req.body?.id||'');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({error:'정책 ID가 올바르지 않아요'});
  const base=process.env.VITE_SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base||!key) return res.status(500).json({error:'정책 DB 연결이 설정되지 않았어요'});
  try {
    const response=await fetch(`${base}/rest/v1/resources?id=eq.${encodeURIComponent(id)}&status=eq.published&select=id,title,summary,details,support_details,required_documents,organization_name,application_method,raw_data,ai_analysis&limit=1`,{headers:dbHeaders(key)});
    const text=await response.text();
    if(!response.ok)throw new Error(`Supabase ${response.status}: ${text.slice(0,500)}`);
    const resource=JSON.parse(text)[0];
    if(!resource)return res.status(404).json({error:'정책을 찾지 못했어요'});
    const cached=presentationFrom(resource.ai_analysis);
    if(cached)return res.status(200).json({presentation:cached,cached:true});
    let presentation;
    try{
      presentation=await createPresentation(resource);
    }catch(error){
      console.error('정책 상세 AI 정리 최종 실패, 원문 정리본을 사용해요:',error);
      return res.status(200).json({presentation:fallbackPresentation(resource),cached:false,fallback:true});
    }
    const merged={...(resource.ai_analysis||{}),presentation_version:1,display_summary:presentation.summary,benefit_items:presentation.benefits,eligibility_items:presentation.eligibility,document_items:presentation.documents,cost_rows:presentation.costs,important_notes:presentation.notes};
    const patch=await fetch(`${base}/rest/v1/resources?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:dbHeaders(key,'return=minimal'),body:JSON.stringify({ai_analysis:merged,ai_analyzed_at:new Date().toISOString()})});
    if(!patch.ok){
      console.warn(`정책 상세 캐시 저장 실패: Supabase ${patch.status}: ${(await patch.text()).slice(0,500)}`);
      return res.status(200).json({presentation:{...presentation,version:1},cached:false,cacheFailed:true});
    }
    return res.status(200).json({presentation:{...presentation,version:1},cached:false});
  } catch(error) {
    console.error('정책 상세 AI 정리 실패:',error);
    return res.status(500).json({error:'정책 상세 내용을 정리하지 못했어요'});
  }
}
