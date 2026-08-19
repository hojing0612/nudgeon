import { supabaseHeaders } from './_anthropic.js';

const DAY=24*60*60*1000;
const str=value=>value==null?'':String(value).trim();
const iso=value=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.toISOString():null};

function safeDate(value){
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date:null;
}

function duplicateKey(resource){
  const title=str(resource.title).toLowerCase()
    .replace(/20\d{2}년?/g,' ')
    .replace(/\d+기|\d+차|\d+회차/g,' ')
    .replace(/[^가-힣a-z0-9]/g,'');
  const organization=str(resource.organization_name).toLowerCase().replace(/[^가-힣a-z0-9]/g,'');
  return title&&organization?`${title}|${organization}`:'';
}

function policyIssues(resource,now){
  const issues=[];
  const published=resource.status==='published';
  const end=safeDate(resource.application_ends_at);
  const staleAt=safeDate(resource.verified_at||resource.updated_at);
  if(!str(resource.title))issues.push({code:'missing-title',label:'정책명 누락',severity:'high'});
  if(!str(resource.organization_name))issues.push({code:'missing-organization',label:'운영기관 누락',severity:'medium'});
  if(!str(resource.application_url)&&!str(resource.reference_url)&&!str(resource.contact))
    issues.push({code:'missing-action',label:'신청·문의 경로 누락',severity:'high'});
  if(published&&!str(resource.summary)&&!str(resource.support_details))
    issues.push({code:'missing-summary',label:'지원 내용 누락',severity:'high'});
  if(published&&!resource.always_open&&resource.application_status==='unknown'&&!end)
    issues.push({code:'unknown-period',label:'모집기간 확인 필요',severity:'medium'});
  if(published&&!resource.ai_analysis)
    issues.push({code:'analysis-pending',label:'AI 구조화 대기',severity:'low'});
  if(!staleAt)issues.push({code:'missing-verification',label:'검증일 누락',severity:'medium'});
  else if(now-staleAt>3*DAY)issues.push({code:'stale',label:'72시간 이상 미검증',severity:'low'});
  return issues;
}

export function summarizePolicyHealth(resources=[],runs=[],nowValue=new Date()){
  const now=safeDate(nowValue)||new Date();
  const soon=new Date(now.getTime()+14*DAY);
  const duplicateGroups=new Map();
  for(const resource of resources){
    const key=duplicateKey(resource);
    if(key)(duplicateGroups.get(key)||duplicateGroups.set(key,[]).get(key)).push(resource);
  }
  const duplicates=[...duplicateGroups.values()].filter(group=>group.length>1);
  const duplicateIds=new Set(duplicates.flatMap(group=>group.map(item=>item.id)));
  const problems=[];
  const sourceMap=new Map();
  let published=0,open=0,closed=0,expiringSoon=0,stale=0,analysisPending=0;
  for(const resource of resources){
    const end=safeDate(resource.application_ends_at);
    const isClosed=resource.application_status==='closed'||Boolean(end&&end<now);
    const isOpen=resource.status==='published'&&!isClosed&&(
      resource.always_open||['open','always','unknown','upcoming'].includes(resource.application_status)
    );
    if(resource.status==='published')published+=1;
    if(isOpen)open+=1;
    if(isClosed)closed+=1;
    if(resource.status==='published'&&!isClosed&&end&&end>=now&&end<=soon)expiringSoon+=1;
    const issues=policyIssues(resource,now);
    if(duplicateIds.has(resource.id))issues.push({code:'duplicate',label:'중복 후보',severity:'medium'});
    if(issues.some(issue=>issue.code==='stale'))stale+=1;
    if(issues.some(issue=>issue.code==='analysis-pending'))analysisPending+=1;
    if(issues.length)problems.push({
      id:resource.id,title:str(resource.title)||'이름 없는 정책',source:str(resource.source_key)||'unknown',
      organization:str(resource.organization_name),status:resource.status,
      applicationStatus:resource.application_status,verifiedAt:iso(resource.verified_at||resource.updated_at),issues
    });
    const source=str(resource.source_key)||'unknown';
    const stats=sourceMap.get(source)||{source,total:0,published:0,open:0,problems:0,lastVerifiedAt:null};
    stats.total+=1;stats.published+=resource.status==='published'?1:0;stats.open+=isOpen?1:0;stats.problems+=issues.length?1:0;
    const verified=iso(resource.verified_at||resource.updated_at);
    if(verified&&(!stats.lastVerifiedAt||verified>stats.lastVerifiedAt))stats.lastVerifiedAt=verified;
    sourceMap.set(source,stats);
  }
  const latestRuns=new Map();
  for(const run of [...runs].sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at)))){
    if(!latestRuns.has(run.source_key))latestRuns.set(run.source_key,{
      source:run.source_key,status:run.status,startedAt:iso(run.started_at),finishedAt:iso(run.finished_at),
      fetched:Number(run.fetched_count)||0,inserted:Number(run.inserted_count)||0,updated:Number(run.updated_count)||0,
      errors:Number(run.error_count)||0,error:str(run.error_summary).slice(0,240)
    });
  }
  const lastVerifiedAt=resources.map(item=>iso(item.verified_at||item.updated_at)).filter(Boolean).sort().at(-1)||null;
  const severityRank={high:0,medium:1,low:2};
  problems.sort((a,b)=>Math.min(...a.issues.map(x=>severityRank[x.severity]))-Math.min(...b.issues.map(x=>severityRank[x.severity]))||a.title.localeCompare(b.title,'ko'));
  return {
    checkedAt:now.toISOString(),lastVerifiedAt,
    summary:{total:resources.length,published,open,closed,expiringSoon,problems:problems.length,
      duplicateGroups:duplicates.length,duplicateRows:duplicateIds.size,stale,analysisPending},
    sources:[...sourceMap.values()].sort((a,b)=>b.total-a.total||a.source.localeCompare(b.source)),
    runs:[...latestRuns.values()].sort((a,b)=>a.source.localeCompare(b.source)),
    duplicates:duplicates.slice(0,30).map(group=>({
      title:str(group[0].title),organization:str(group[0].organization_name),
      items:group.map(item=>({id:item.id,source:item.source_key,status:item.application_status}))
    })),
    problems:problems.slice(0,150)
  };
}

async function db(base,path,key){
  const response=await fetch(`${base}/rest/v1/${path}`,{headers:supabaseHeaders(key)});
  const text=await response.text();
  if(!response.ok)throw new Error(`Supabase ${response.status}: ${text.slice(0,400)}`);
  return text?JSON.parse(text):[];
}

async function allResources(base,key){
  const rows=[],limit=1000;
  for(let offset=0;offset<20000;offset+=limit){
    const select='id,status,title,summary,support_details,organization_name,application_url,reference_url,contact,application_status,application_ends_at,always_open,source_key,verified_at,updated_at,ai_analysis';
    const page=await db(base,`resources?select=${select}&limit=${limit}&offset=${offset}&order=updated_at.desc`,key);
    rows.push(...page);
    if(page.length<limit)break;
  }
  return rows;
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'GET 요청만 받아요'});
  const dashboardKey=process.env.OPS_DASHBOARD_KEY;
  if(!dashboardKey)return res.status(503).json({error:'운영 대시보드 키가 설정되지 않았어요'});
  if(req.headers.authorization!==`Bearer ${dashboardKey}`)return res.status(401).json({error:'운영 대시보드 접근 권한이 없어요'});
  const base=str(process.env.VITE_SUPABASE_URL).replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)return res.status(500).json({error:'정책 DB 연결이 설정되지 않았어요'});
  try{
    const [resources,runs]=await Promise.all([
      allResources(base,key),
      db(base,'ingestion_runs?select=source_key,status,fetched_count,inserted_count,updated_count,error_count,error_summary,started_at,finished_at&limit=100&order=started_at.desc',key)
    ]);
    res.setHeader?.('Cache-Control','no-store');
    return res.status(200).json(summarizePolicyHealth(resources,runs,new Date()));
  }catch(error){
    console.error('정책 운영 상태 조회 실패:',error);
    return res.status(502).json({error:'정책 운영 상태를 불러오지 못했어요'});
  }
}
