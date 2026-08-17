import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{normalizeApiKey} from '../api/sync-policies.js';

function responseRecorder(){return{statusCode:200,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}}
function clearSourceEnv(){for(const key of [
  'YOUTH_POLICY_API_KEY','WORK24_JOBS_API_KEY','WORK24_TRAINING_CARD_API_KEY',
  'WORK24_EMPLOYER_TRAINING_API_KEY','WORK24_CONSORTIUM_TRAINING_API_KEY',
  'WORK24_WORK_LEARNING_API_KEY','WORK24_JOB_SEEKER_PROGRAM_API_KEY',
  'WORK24_STRONG_COMPANY_API_KEY','DATA_GO_KR_FINANCE_CENTER_API_KEY',
  'DATA_GO_KR_LH_NOTICE_API_KEY','DATA_GO_KR_WELFARE_SERVICE_API_KEY'
])delete process.env[key]}

test('공공데이터 인증키를 한 번만 인코딩하고 정확한 ServiceKey 이름으로 보낸다',async()=>{
  assert.equal(normalizeApiKey('abc%2B123%2F'),'abc+123/');
  const originalFetch=global.fetch,originalEnv={...process.env};
  process.env.VITE_SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.CRON_SECRET='cron-key';clearSourceEnv();
  process.env.DATA_GO_KR_FINANCE_CENTER_API_KEY='abc%2B123%2F';
  let upstreamUrl='',stored=null;
  global.fetch=async(request,options={})=>{
    const target=String(request);
    if(target.startsWith('https://apis.data.go.kr/')){
      upstreamUrl=target;
      return{ok:true,text:async()=>JSON.stringify({response:{body:{items:{item:[{cnterId:'1',cnterNm:'수원센터',adrs:'경기도 수원시',telno:'123'}]}}}})};
    }
    if(target.includes('/resources?')&&options.method==='POST'){stored=JSON.parse(options.body);return{ok:true,text:async()=>JSON.stringify(stored)};}
    if(target.includes('/resources?'))return{ok:true,text:async()=>JSON.stringify([])};
    if(options.method==='POST')return{ok:true,text:async()=>JSON.stringify([{id:'run-1'}])};
    return{ok:true,text:async()=>JSON.stringify([])};
  };
  try{
    const res=responseRecorder();
    await handler({method:'POST',headers:{authorization:'Bearer cron-key'}},res);
    assert.equal(res.statusCode,200);
    const parsed=new URL(upstreamUrl);
    assert.equal(parsed.searchParams.get('ServiceKey'),'abc+123/');
    assert.equal(parsed.searchParams.has('serviceKey'),false);
    assert.equal(stored[0].title,'수원센터');
  }finally{global.fetch=originalFetch;process.env=originalEnv;}
});

test('개인회원에게 금지된 고용24 채용목록 API는 동기화하지 않는다',async()=>{
  const originalFetch=global.fetch,originalEnv={...process.env};
  process.env.VITE_SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.CRON_SECRET='cron-key';clearSourceEnv();process.env.WORK24_JOBS_API_KEY='work-key';
  let calledForbiddenApi=false;
  global.fetch=async(request,options={})=>{
    if(String(request).includes('callOpenApiSvcInfo210L01.do'))calledForbiddenApi=true;
    if(options.method==='POST')return{ok:true,text:async()=>JSON.stringify([{id:'run-1'}])};
    return{ok:true,text:async()=>JSON.stringify([])};
  };
  try{
    const res=responseRecorder();
    await handler({method:'POST',headers:{authorization:'Bearer cron-key'}},res);
    assert.equal(res.statusCode,500);
    assert.equal(calledForbiddenApi,false);
    assert.equal(res.body.sources.some(item=>item.source==='work24-jobs'),false);
  }finally{global.fetch=originalFetch;process.env=originalEnv;}
});
