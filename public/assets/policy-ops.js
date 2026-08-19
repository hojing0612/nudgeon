const loginPanel=document.querySelector('#login-panel');
const keyInput=document.querySelector('#admin-key');
const loadButton=document.querySelector('#load-button');
const refreshButton=document.querySelector('#refresh-button');
const loginMessage=document.querySelector('#login-message');
const dashboard=document.querySelector('#dashboard');
const summary=document.querySelector('#summary');
const aiCostNode=document.querySelector('#ai-cost');
const issuesNode=document.querySelector('#issues');
const issueCount=document.querySelector('#issue-count');
const filter=document.querySelector('#issue-filter');
let adminKey='';
let data=null;
let aiCost=null;

const labels=[
  ['total','전체 정책',''],
  ['active','활성',''],
  ['expiringSoon','14일 내 마감','warning'],
  ['closed','마감','danger'],
  ['missing','정보 누락','warning'],
  ['badLink','링크 이상','danger'],
  ['duplicate','중복','warning']
];

function dateTime(value){
  if(!value)return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function money(value){
  return new Intl.NumberFormat('ko-KR',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(value||0);
}
function renderAiCost(){
  if(aiCost?.status==='connected'){
    const scope=aiCost.workspaceFiltered?'NudgeOn 전용 Workspace':'Anthropic 조직 전체';
    const scopeTone=aiCost.workspaceFiltered?'verified':'attention';
    aiCostNode.innerHTML=`
      <div class="cost-main">
        <div>
          <span class="status-pill verified">공식 과금 데이터</span>
          <strong>${money(aiCost.amountUsd)}</strong>
          <p>${escapeHtml(aiCost.startingAt.slice(0,10))}부터 현재까지 · UTC 기준</p>
        </div>
        <div class="cost-meta">
          <span class="status-pill ${scopeTone}">${scope}</span>
          <p>최근 호출은 보통 ${aiCost.freshnessMinutes}분 안에 반영됩니다.</p>
          ${aiCost.workspaceFiltered?'':'<p class="warning-text">NudgeOn 전용 Workspace ID를 등록하면 다른 프로젝트 비용을 제외할 수 있어요.</p>'}
        </div>
      </div>`;
    return;
  }
  const permission=aiCost?.status==='permission_error';
  aiCostNode.innerHTML=`
    <div class="cost-empty">
      <span class="status-pill ${permission?'danger':'attention'}">${permission?'권한 확인 필요':'연결 필요'}</span>
      <h3>${permission?'Anthropic Admin API 연결 오류':'실제 사용액 연결 전'}</h3>
      <p>${escapeHtml(aiCost?.message||'Anthropic 비용 데이터를 불러오지 못했어요.')}</p>
      <p class="muted">일반 API 키가 아니라 <code>sk-ant-admin01-…</code> 형식의 Admin API 키가 필요합니다.</p>
    </div>`;
}
function render(){
  summary.innerHTML=labels.map(([key,label,tone])=>`<article class="summary-card ${tone}"><span>${label}</span><strong>${data.counts[key]}</strong></article>`).join('');
  document.querySelector('#checked-at').textContent=`확인 시각: ${dateTime(data.checkedAt)}`;
  document.querySelector('#verified-at').textContent=`가장 최근 데이터 검증: ${dateTime(data.lastVerifiedAt)}`;
  renderAiCost();
  renderIssues();
}
function renderIssues(){
  const selected=filter.value;
  const rows=data.issues.filter(item=>selected==='all'||item.issues.some(issue=>issue.startsWith(selected)));
  issueCount.textContent=`${rows.length}개 항목`;
  issuesNode.innerHTML=rows.length?rows.map(item=>`
    <article class="issue">
      <div class="issue-top">
        <div><h3>${escapeHtml(item.title)}</h3><p class="issue-meta">${escapeHtml(item.organization)} · ${escapeHtml(item.source)}</p></div>
        <p class="issue-meta">검증 ${dateTime(item.verifiedAt)}</p>
      </div>
      <div class="badges">${item.issues.map(issue=>`<span class="badge">${escapeHtml(issue)}</span>`).join('')}</div>
    </article>`).join(''):'<p class="empty">이 유형으로 확인할 정책이 없습니다.</p>';
}
async function fetchJson(path){
  const response=await fetch(path,{headers:{'x-admin-key':adminKey},cache:'no-store'});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'상태를 확인하지 못했어요');
  return body;
}
async function load(){
  adminKey=keyInput.value||adminKey;
  if(!adminKey){loginMessage.textContent='관리자 키를 입력해 주세요.';return}
  loadButton.disabled=true;refreshButton.disabled=true;loginMessage.textContent='운영 상태를 확인하고 있습니다…';
  try{
    const [policyResult,costResult]=await Promise.allSettled([
      fetchJson('/api/policy-ops-status'),
      fetchJson('/api/ai-cost-status')
    ]);
    if(policyResult.status==='rejected')throw policyResult.reason;
    data=policyResult.value;
    aiCost=costResult.status==='fulfilled'?costResult.value:{status:'error',message:'AI 비용 상태를 불러오지 못했어요.'};
    loginPanel.hidden=true;dashboard.hidden=false;render();
  }catch(error){loginPanel.hidden=false;dashboard.hidden=true;loginMessage.textContent=error.message}
  finally{loadButton.disabled=false;refreshButton.disabled=false}
}
loadButton.addEventListener('click',load);
keyInput.addEventListener('keydown',event=>{if(event.key==='Enter')load()});
refreshButton.addEventListener('click',load);
filter.addEventListener('change',renderIssues);
