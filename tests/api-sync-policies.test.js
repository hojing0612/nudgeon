import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{normalizeApiKey} from '../api/sync-policies.js';

function responseRecorder(){return{statusCode:200,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}}
function clearSourceEnv(){for(const key of ['YOUTH_POLICY_API_KEY','WORK24_JOBS_API_KEY','DATA_GO_KR_FINANCE_CENTER_API_KEY','DATA_GO_KR_LH_NOTICE_API_KEY','DATA_GO_KR_WELFARE_SERVICE_API_KEY'])delete process.env[key]}

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
    if(target.includes('/resources?')){stored=JSON.parse(options.body);return{ok:true,text:async()=>JSON.stringify(stored)};}
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

test('고용24의 0건 응답을 성공으로 숨기지 않는다',async()=>{
  const originalFetch=global.fetch,originalEnv={...process.env};
  process.env.VITE_SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  process.env.CRON_SECRET='cron-key';clearSourceEnv();process.env.WORK24_JOBS_API_KEY='work-key';
  global.fetch=async(request,options={})=>{
    if(String(request).startsWith('https://www.work24.go.kr/'))return{ok:true,text:async()=>'<wantedRoot><total>0</total></wantedRoot>'};
    if(options.method==='POST')return{ok:true,text:async()=>JSON.stringify([{id:'run-1'}])};
    return{ok:true,text:async()=>JSON.stringify([])};
  };
  try{
    const res=responseRecorder();
    await handler({method:'POST',headers:{authorization:'Bearer cron-key'}},res);
    assert.equal(res.statusCode,500);
    assert.equal(res.body.sources.find(item=>item.source==='work24-jobs').status,'failed');
    assert.match(res.body.sources.find(item=>item.source==='work24-jobs').error,/total=0/);
    assert.match(res.body.sources.find(item=>item.source==='work24-jobs').error,/wantedRoot/);
  }finally{global.fetch=originalFetch;process.env=originalEnv;}
});
