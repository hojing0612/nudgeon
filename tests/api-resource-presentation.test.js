import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/resource-presentation.js';

function responseRecorder() {
  return {statusCode:200,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
}

test('상세 정리가 없는 정책은 Claude로 구조화한 뒤 DB에 캐시한다', async () => {
  const originalFetch=global.fetch;
  const originalEnv={...process.env};
  process.env.VITE_SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.ANTHROPIC_API_KEY='anthropic-key';
  let patched=null,anthropicCalls=0;
  global.fetch=async (request,options={})=>{
    const target=String(request);
    if(target.includes('api.anthropic.com')){
      anthropicCalls+=1;
      return {ok:true,json:async()=>({content:[{type:'tool_use',name:'present_policy_for_user',input:{
      version:1,summary:'전문 심리상담을 총 8회 받을 수 있어요.',benefits:['회당 최소 50분 상담','총 8회 제공'],
      eligibility:['정서적 어려움으로 상담이 필요한 사람'],documents:['신청서'],
      costs:[{group:'기준 중위소득 70% 이하',price:'회당 8만원',user_share:'무료',note:''}],notes:[]
      }}]})};
    }
    if(options.method==='PATCH'){
      patched=JSON.parse(options.body);
      return {ok:true,text:async()=>''};
    }
    if(target.includes('22222222-2222-2222-2222-222222222222'))return {ok:true,text:async()=>JSON.stringify([{
      ai_analysis:{presentation_version:1,display_summary:'저장된 요약',benefit_items:['혜택'],eligibility_items:[],document_items:[],cost_rows:[],important_notes:[]}
    }])};
    return {ok:true,text:async()=>JSON.stringify([{
      id:'11111111-1111-1111-1111-111111111111',title:'심리상담 바우처',summary:'상담 지원',details:'지원 조건',
      support_details:'총 8회',required_documents:'신청서',organization_name:'보건복지부',application_method:'주민센터',
      raw_data:{},ai_analysis:{recommended:true,confidence:.9}
    }])};
  };
  try{
    const res=responseRecorder();
    await handler({method:'POST',body:{id:'11111111-1111-1111-1111-111111111111'}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.cached,false);
    assert.equal(res.body.presentation.summary,'전문 심리상담을 총 8회 받을 수 있어요.');
    assert.equal(patched.ai_analysis.recommended,true);
    assert.equal(patched.ai_analysis.presentation_version,1);
    assert.equal(patched.ai_analysis.cost_rows[0].user_share,'무료');
    const cached=responseRecorder();
    await handler({method:'POST',body:{id:'22222222-2222-2222-2222-222222222222'}},cached);
    assert.equal(cached.statusCode,200);
    assert.equal(cached.body.cached,true);
    assert.equal(cached.body.presentation.summary,'저장된 요약');
    assert.equal(anthropicCalls,1);
  }finally{
    global.fetch=originalFetch;
    process.env=originalEnv;
  }
});

test('Claude 상세 정리가 두 번 실패해도 원문 정리본을 표시한다', async () => {
  const originalFetch=global.fetch;
  const originalEnv={...process.env};
  process.env.VITE_SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.ANTHROPIC_API_KEY='anthropic-key';
  let anthropicCalls=0,patchCalls=0;
  global.fetch=async (request,options={})=>{
    const target=String(request);
    if(target.includes('api.anthropic.com')){
      anthropicCalls+=1;
      return {ok:false,status:529,text:async()=>'overloaded'};
    }
    if(options.method==='PATCH'){
      patchCalls+=1;
      return {ok:true,text:async()=>''};
    }
    return {ok:true,text:async()=>JSON.stringify([{
      id:'33333333-3333-3333-3333-333333333333',title:'심리상담 바우처',
      summary:'전문 심리상담을 총 8회 받을 수 있어요.',
      support_details:'○ 총 8회 제공\n- 1회당 최소 50분',
      details:'1. 정서적 어려움으로 상담이 필요한 사람\n2) 소득 기준 확인',
      required_documents:'- 신청서\n- 의뢰서',organization_name:'보건복지부',
      application_method:'※ 주민센터에서 신청',raw_data:{},ai_analysis:{}
    }])};
  };
  try{
    const res=responseRecorder();
    await handler({method:'POST',body:{id:'33333333-3333-3333-3333-333333333333'}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.fallback,true);
    assert.equal(res.body.presentation.version,1);
    assert.deepEqual(res.body.presentation.benefits,['총 8회 제공','1회당 최소 50분']);
    assert.deepEqual(res.body.presentation.documents,['신청서','의뢰서']);
    assert.equal(anthropicCalls,2);
    assert.equal(patchCalls,0);
  }finally{
    global.fetch=originalFetch;
    process.env=originalEnv;
  }
});
