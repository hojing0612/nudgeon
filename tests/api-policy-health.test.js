import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{summarizePolicyHealth} from '../api/policy-health.js';

function responseRecorder(){return{statusCode:200,body:null,headers:{},status(code){this.statusCode=code;return this},setHeader(key,value){this.headers[key]=value},json(body){this.body=body;return this}}}
function resource(id,overrides={}){return{id,title:`정책 ${id}`,summary:'청년 지원',status:'published',application_status:'open',always_open:false,application_url:`https://example.org/${id}`,organization_name:'기관',source_key:'source',verified_at:'2026-08-18T00:00:00.000Z',updated_at:'2026-08-18T00:00:00.000Z',ai_analysis:{recommended:true},...overrides}}

test('정책 누락·마감 임박·중복·오래된 검증을 집계한다',()=>{
  const rows=[
    resource('a',{title:'2026 청년 지원사업',application_ends_at:'2026-08-25T00:00:00.000Z'}),
    resource('b',{title:'청년 지원사업',verified_at:'2026-08-10T00:00:00.000Z',application_url:null,reference_url:null,contact:null,ai_analysis:null}),
    resource('c',{application_status:'closed',application_ends_at:'2026-08-01T00:00:00.000Z'})
  ];
  const result=summarizePolicyHealth(rows,[],new Date('2026-08-19T00:00:00.000Z'));
  assert.equal(result.summary.total,3);assert.equal(result.summary.open,2);assert.equal(result.summary.closed,1);
  assert.equal(result.summary.expiringSoon,1);assert.equal(result.summary.duplicateGroups,1);assert.equal(result.summary.stale,1);
  assert.ok(result.problems.find(item=>item.id==='b').issues.some(issue=>issue.code==='missing-action'));
});

test('출처별 최근 수집 실행만 남긴다',()=>{
  const runs=[
    {source_key:'youthcenter',status:'failed',started_at:'2026-08-18T00:00:00Z',error_count:1},
    {source_key:'youthcenter',status:'succeeded',started_at:'2026-08-19T00:00:00Z',finished_at:'2026-08-19T00:10:00Z',fetched_count:20}
  ];
  const result=summarizePolicyHealth([],runs,new Date('2026-08-19T01:00:00Z'));
  assert.equal(result.runs.length,1);assert.equal(result.runs[0].status,'succeeded');assert.equal(result.runs[0].fetched,20);
});

test('운영 키가 없거나 틀리면 정책 DB를 조회하지 않는다',async()=>{
  const original={...process.env},originalFetch=global.fetch;let fetched=false;global.fetch=async()=>{fetched=true;throw new Error('should not fetch')};
  try{
    delete process.env.OPS_DASHBOARD_KEY;let res=responseRecorder();await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,503);
    process.env.OPS_DASHBOARD_KEY='secret';res=responseRecorder();await handler({method:'GET',headers:{authorization:'Bearer wrong'}},res);assert.equal(res.statusCode,401);assert.equal(fetched,false);
  }finally{process.env=original;global.fetch=originalFetch}
});

test('인증된 운영 요청은 집계 결과만 반환한다',async()=>{
  const original={...process.env},originalFetch=global.fetch;process.env.OPS_DASHBOARD_KEY='secret';process.env.VITE_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-key';
  global.fetch=async url=>({ok:true,text:async()=>String(url).includes('ingestion_runs')?JSON.stringify([]):JSON.stringify([resource('safe')])});
  try{const res=responseRecorder();await handler({method:'GET',headers:{authorization:'Bearer secret'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.summary.total,1);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal('raw_data' in res.body,false)}finally{process.env=original;global.fetch=originalFetch}
});
