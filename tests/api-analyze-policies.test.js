import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/analyze-policies.js';

function responseRecorder() {
  return { statusCode:200, body:null, status(code){this.statusCode=code;return this}, json(body){this.body=body;return this} };
}

test('추천 정책의 화면용 요약·조건·서류·비용표를 구조화해 저장한다', async () => {
  const originalFetch=global.fetch;
  const originalEnv={...process.env};
  process.env.VITE_SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.ANTHROPIC_API_KEY='anthropic-key';
  process.env.CRON_SECRET='cron-key';
  let getCount=0, patched=[], anthropicBodies=[];
  global.fetch=async (url,options={})=>{
    if(String(url).includes('api.anthropic.com')){
      const anthropicBody=JSON.parse(options.body);anthropicBodies.push(anthropicBody);
      const policies=JSON.parse(anthropicBody.messages[0].content).policies;
      const analyses=policies.map(policy=>({
        id:policy.id,category:'counseling',benefit_type:'counseling',benefit_summary:'전문 심리상담 8회',practical_value:9,
        target_regions:['전국'],nationwide:true,age_min:null,age_max:null,education_statuses:[],employment_statuses:[],job_fields:[],
        application_status:'open',application_start:null,application_end:null,recommended:true,confidence:.95,source_evidence:['총 8회'],
        presentation_version:1,display_summary:'전문 심리상담을 총 8회 받을 수 있는 바우처를 제공합니다.',
        benefit_items:['회당 최소 50분 상담','총 8회 제공'],eligibility_items:['정서적 어려움으로 심리상담이 필요한 사람'],
        document_items:['신청서'],cost_rows:[{group:'기준 중위소득 70% 이하',price:'회당 8만원','user_share':'무료',note:''}],important_notes:[]
      }));
      return {ok:true,json:async()=>({content:[{type:'tool_use',name:'save_policy_analysis',input:{analyses}}]})};
    }
    if(options.method==='PATCH'){
      const value=JSON.parse(options.body);patched.push(value);
      return {ok:true,text:async()=>JSON.stringify([value])};
    }
    getCount+=1;
    if(getCount===1)return {ok:true,text:async()=>JSON.stringify([])};
    return {ok:true,text:async()=>JSON.stringify(Array.from({length:5},(_,index)=>({id:`policy-${index+1}`,title:'심리상담 바우처',summary:'상담 지원',details:'지원 조건',support_details:'총 8회',required_documents:'신청서',raw_data:{}})))};
  };
  try{
    const res=responseRecorder();
    await handler({method:'POST',headers:{authorization:'Bearer cron-key'}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.analyzed,5);
    assert.equal(res.body.batches,2);
    assert.equal(anthropicBodies.length,2);
    assert.equal(anthropicBodies[0].messages[0].content.includes('presentation_version'),true);
    assert.equal(patched[0].ai_analysis.presentation_version,1);
    assert.equal(patched[0].ai_analysis.cost_rows[0].user_share,'무료');
  }finally{
    global.fetch=originalFetch;
    process.env=originalEnv;
  }
});
