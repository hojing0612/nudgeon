const loginPanel=document.querySelector('#login-panel');
const keyInput=document.querySelector('#admin-key');
const loadButton=document.querySelector('#load-button');
const refreshButton=document.querySelector('#refresh-button');
const loginMessage=document.querySelector('#login-message');
const dashboard=document.querySelector('#dashboard');
const summary=document.querySelector('#summary');
const issuesNode=document.querySelector('#issues');
const issueCount=document.querySelector('#issue-count');
const filter=document.querySelector('#issue-filter');
let adminKey='';
let data=null;

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
function render(){
  summary.innerHTML=labels.map(([key,label,tone])=>`<article class="summary-card ${tone}"><span>${label}</span><strong>${data.counts[key]}</strong></article>`).join('');
  document.querySelector('#checked-at').textContent=`확인 시각: ${dateTime(data.checkedAt)}`;
  document.querySelector('#verified-at').textContent=`가장 최근 데이터 검증: ${dateTime(data.lastVerifiedAt)}`;
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
async function load(){
  adminKey=keyInput.value||adminKey;
  if(!adminKey){loginMessage.textContent='관리자 키를 입력해 주세요.';return}
  loadButton.disabled=true;refreshButton.disabled=true;loginMessage.textContent='정책 상태를 확인하고 있습니다…';
  try{
    const response=await fetch('/api/policy-ops-status',{headers:{'x-admin-key':adminKey},cache:'no-store'});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'상태를 확인하지 못했어요');
    data=body;loginPanel.hidden=true;dashboard.hidden=false;render();
  }catch(error){loginPanel.hidden=false;dashboard.hidden=true;loginMessage.textContent=error.message}
  finally{loadButton.disabled=false;refreshButton.disabled=false}
}
loadButton.addEventListener('click',load);
keyInput.addEventListener('keydown',event=>{if(event.key==='Enter')load()});
refreshButton.addEventListener('click',load);
filter.addEventListener('change',renderIssues);
