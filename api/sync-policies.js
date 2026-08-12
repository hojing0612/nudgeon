const API = {
  youth: 'https://www.youthcenter.go.kr/go/ythip/getPlcy',
  jobs: 'https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do',
  finance: 'https://apis.data.go.kr/B553701/TotalSupportCenterMisoBranchInfoService/getCenterMisoBranchInfo',
  lh: 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1',
  welfare: 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001'
};
const now=()=>new Date().toISOString(), arr=v=>Array.isArray(v)?v:v?[v]:[], str=v=>v==null?'':String(v).trim();
const date=v=>{const d=str(v).replace(/\D/g,'');if(d.length<8)return null;const x=new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T23:59:59+09:00`);return Number.isNaN(x.getTime())?null:x.toISOString()};
const decode=v=>str(v).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const xv=(b,t)=>decode(b.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`,'i'))?.[1]||'');
const xb=(x,t)=>[...x.matchAll(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`,'gi'))].map(m=>m[1]);
async function body(url,params){const r=await fetch(`${url}?${new URLSearchParams(params)}`),b=await r.text();if(!r.ok)throw Error(`${r.status} ${b.slice(0,240)}`);return b}
async function json(url,params){const b=await body(url,params);try{return JSON.parse(b)}catch{throw Error(`JSON 응답이 아니에요: ${b.slice(0,240)}`)}}
function category(v){v=str(v).toLowerCase();if(/상담|마음|심리|정신건강|고립|은둔/.test(v))return'counseling';if(/주거|주택|월세|전세|임대|청약|lh|sh/.test(v))return'housing';if(/취업|구직|일자리|창업|직장|채용|도전지원/.test(v))return'career';if(/교육|훈련|강의|세미나|자격|역량/.test(v))return'education';if(/금융|법률|채무|대출|노동/.test(v))return'finance-legal';if(/문화|모임|활동|참여|봉사|커뮤니티/.test(v))return'community';return'welfare'}
function youthItem(p){
  const period=str(p.aplyYmd),matches=[...period.matchAll(/(20\d{2})[.\-/년]?\s*(\d{1,2})[.\-/월]?\s*(\d{1,2})/g)],always=p.aplyPrdSeCd==='0057002'||/상시|수시/.test(period);
  const end=matches.length?new Date(+matches.at(-1)[1],+matches.at(-1)[2]-1,+matches.at(-1)[3],23,59,59).toISOString():null;
  const closed=p.aplyPrdSeCd==='0057003'||(end&&new Date(end)<new Date());
  return {external_id:str(p.plcyNo),source_key:'youthcenter',kind:'policy',status:'published',title:str(p.plcyNm)||'이름 없는 정책',summary:str(p.plcyExplnCn)||null,details:str(p.addAplyQlfcCndCn)||null,support_details:str(p.plcySprtCn)||null,organization_name:str(p.operInstCdNm||p.sprvsnInstCdNm)||null,application_url:str(p.aplyUrlAddr)||null,reference_url:str(p.refUrlAddr1||p.refUrlAddr2)||null,application_method:str(p.plcyAplyMthdCn)||null,required_documents:str(p.sbmsnDcmntCn)||null,application_status:closed?'closed':always?'always':end?'open':'unknown',application_ends_at:end,always_open:always,region_codes:str(p.zipCd).split(',').map(x=>x.trim()).filter(Boolean),keywords:str(p.plcyKywdNm).split(',').map(x=>x.trim()).filter(Boolean),source_updated_at:p.lastMdfcnDt||null,verified_at:now(),raw_data:{minAge:+p.sprtTrgtMinAge||null,maxAge:+p.sprtTrgtMaxAge||null,applicationPeriod:period||null,educationCodes:p.schoolCd||null,employmentCodes:p.jobCd||null,category:category(`${p.lclsfNm} ${p.mclsfNm} ${p.plcyNm} ${p.plcyKywdNm}`)}};
}
async function youth(key){
  const get=p=>json(API.youth,{apiKeyNm:key,pageNum:String(p),pageSize:'100',pageType:'1',rtnType:'json'}),first=await get(1),total=+first.result?.pagging?.totCount||0,items=[...arr(first.result?.youthPolicyList)];
  for(let p=2;p<=Math.ceil(total/100);p++)items.push(...arr((await get(p)).result?.youthPolicyList));
  return items.map(youthItem).filter(x=>x.external_id);
}
async function jobs(key){
  const x=await body(API.jobs,{authKey:key,callTp:'L',returnType:'XML',startPage:'1',display:'100',regDate:'M-1',sortOrderBy:'DESC'});
  return xb(x,'wanted').map(i=>{const end=date(xv(i,'closeDt'));return{external_id:xv(i,'wantedAuthNo'),source_key:'work24-jobs',kind:'program',status:'published',title:xv(i,'title'),summary:[xv(i,'company'),xv(i,'region'),xv(i,'salTpNm'),xv(i,'sal')].filter(Boolean).join(' · '),details:[xv(i,'career'),xv(i,'minEdubg'),xv(i,'holidayTpNm')].filter(Boolean).join(' · ')||null,organization_name:xv(i,'company')||'고용24',application_url:xv(i,'wantedInfoUrl')||null,application_status:end&&new Date(end)<new Date()?'closed':'open',application_ends_at:end,always_open:false,region_codes:[xv(i,'region')].filter(Boolean),keywords:['채용',xv(i,'indTpNm')].filter(Boolean),verified_at:now(),raw_data:{category:'career',jobsCode:xv(i,'jobsCd'),employmentType:xv(i,'empTpCd')}}}).filter(x=>x.external_id&&x.title&&x.application_status==='open');
}
async function finance(key){
  const raw=await body(API.finance,{serviceKey:key,pageNo:'1',numOfRows:'100',type:'json'});let items=[];
  try{const j=JSON.parse(raw);items=arr(j.response?.body?.items?.item||j.body?.items?.item||j.items?.item)}catch{items=xb(raw,'item').map(i=>({center:xv(i,'cnterNm')||xv(i,'centerNm')||xv(i,'brnchNm'),address:xv(i,'adrs'),area:xv(i,'area'),phone:xv(i,'telno')||xv(i,'tel')}))}
  return items.map((i,n)=>{const title=str(i.cnterNm||i.centerNm||i.brnchNm||i.center||i.brcNm),address=str(i.adrs||i.address||i.roadNmAddr),area=str(i.area||i.ctpvNm||address.split(' ')[0]),phone=str(i.telno||i.tel||i.phone);return{external_id:str(i.cnterId||i.centerId||i.brcId)||`${area}-${title}-${n}`,source_key:'finance-center',kind:'institution',status:'published',title:title||'서민금융통합지원센터',summary:address||'서민금융 상담 및 지원 기관',organization_name:'서민금융진흥원',contact:phone||null,application_status:'always',always_open:true,region_codes:[area].filter(Boolean),keywords:['서민금융','금융상담','채무상담'],verified_at:now(),raw_data:{category:'finance-legal',...i}}});
}
async function lh(key){
  const j=await json(API.lh,{serviceKey:key,PG_SZ:'100',PAGE:'1'}),items=arr(j).flatMap(p=>arr(p.dsList));
  return items.map(i=>{const s=str(i.PAN_SS);return{external_id:str(i.PAN_ID),source_key:'lh-notice',kind:'policy',status:'published',title:str(i.PAN_NM),summary:[i.UPP_AIS_TP_NM,i.AIS_TP_CD_NM,i.CNP_CD_NM].map(str).filter(Boolean).join(' · '),organization_name:'한국토지주택공사',application_url:str(i.DTL_URL||i.DTL_URL_MOB)||null,application_status:/접수중|공고중/.test(s)?'open':/마감/.test(s)?'closed':'unknown',application_starts_at:date(i.PAN_NT_ST_DT),application_ends_at:date(i.CLSG_DT),always_open:false,region_codes:[str(i.CNP_CD_NM)].filter(Boolean),keywords:['LH','청년주거',str(i.AIS_TP_CD_NM)].filter(Boolean),verified_at:now(),raw_data:{category:'housing',noticeStatus:s,supplyTypeCode:i.SPL_INF_TP_CD,housingTypeCode:i.AIS_TP_CD}}}).filter(x=>x.external_id&&x.title&&x.application_status==='open');
}
async function welfare(key){
  const x=await body(API.welfare,{serviceKey:key,callTp:'L',pageNo:'1',numOfRows:'500',onapPsbltYn:'Y',orderBy:'popular'});
  return xb(x,'servList').map(i=>{const title=xv(i,'servNm'),summary=xv(i,'servDgst');return{external_id:xv(i,'servId'),source_key:'welfare-central',kind:'policy',status:'published',title,summary:summary||null,organization_name:xv(i,'jurMnofNm')||'중앙부처',application_url:xv(i,'servDtlLink')||null,contact:xv(i,'rprsCtadr')||null,application_status:'always',always_open:true,region_codes:['전국'],keywords:['복지',title].filter(Boolean),verified_at:now(),raw_data:{category:category(`${title} ${summary}`),onlineApplication:xv(i,'onapPsbltYn')}}}).filter(x=>x.external_id&&x.title);
}
async function db(path,key,opt={}){
  const h={apikey:key};if(!key.startsWith('sb_'))h.Authorization=`Bearer ${key}`;
  const r=await fetch(`${process.env.VITE_SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}`,{...opt,headers:{...h,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation',...(opt.headers||{})}}),b=await r.text();
  if(!r.ok)throw Error(`Supabase ${r.status}: ${b.slice(0,500)}`);return b?JSON.parse(b):[];
}
async function store(items,key){for(let i=0;i<items.length;i+=100)await db('resources?on_conflict=source_key,external_id',key,{method:'POST',body:JSON.stringify(items.slice(i,i+100))})}
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET 또는 POST 요청만 받아요'});
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'동기화 권한이 없어요'});
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key||!process.env.VITE_SUPABASE_URL)return res.status(500).json({error:'Supabase 환경변수가 설정되지 않았어요'});
  const sources=[['youthcenter','YOUTH_POLICY_API_KEY',youth],['work24-jobs','WORK24_JOBS_API_KEY',jobs],['finance-center','DATA_GO_KR_FINANCE_CENTER_API_KEY',finance],['lh-notice','DATA_GO_KR_LH_NOTICE_API_KEY',lh],['welfare-central','DATA_GO_KR_WELFARE_SERVICE_API_KEY',welfare]],results=[];
  for(const[source,env,collect]of sources){const apiKey=process.env[env];if(!apiKey){results.push({source,status:'skipped',reason:`${env} missing`});continue}const run=await db('ingestion_runs',key,{method:'POST',body:JSON.stringify({source_key:source,status:'running'})}).catch(()=>[]),id=run[0]?.id;try{const items=await collect(apiKey);await store(items,key);if(id)await db(`ingestion_runs?id=eq.${id}`,key,{method:'PATCH',body:JSON.stringify({status:'succeeded',fetched_count:items.length,updated_count:items.length,finished_at:now()})});results.push({source,status:'succeeded',stored:items.length})}catch(e){console.error(`${source} 동기화 실패:`,e);if(id)await db(`ingestion_runs?id=eq.${id}`,key,{method:'PATCH',body:JSON.stringify({status:'failed',error_count:1,error_summary:String(e.message).slice(0,1000),finished_at:now()})}).catch(()=>{});results.push({source,status:'failed',error:String(e.message).slice(0,240)})}}
  const ok=results.filter(x=>x.status==='succeeded').length;return res.status(ok?200:500).json({success:ok>0,sources:results});
}
