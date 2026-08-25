(function(){
  const first=[
    {title:'사람 적은 산책 코스 걷기',why:'거리와 예상 시간을 먼저 보고 부담이 가장 적은 길을 고릅니다.',small:'집 앞 100m 걷기'},
    {title:'카페 메뉴 미리 고르기',why:'현장에서 오래 고민하지 않도록 카페와 메뉴를 미리 정해둡니다.',small:'동네 카페 목록만 보기'},
    {title:'직원에게 메뉴 이름만 말하기',why:'메뉴 이름 한 문장만 말하면 연습이 끝납니다.',small:'주문 문장 읽어보기'}
  ];
  const second=[
    {title:'공원 벤치 3분 앉기',why:'앉을 곳과 돌아올 시간을 먼저 정하면 외출의 끝이 분명해집니다.',small:'가까운 공원 이름만 확인하기'},
    {title:'외출 가방에 한 가지 넣기',why:'물·지갑·이어폰 중 가장 쉬운 것 하나만 챙깁니다.',small:'가방을 눈에 보이는 곳에 두기'},
    {title:'편의점에서 봉투 요청하기',why:'필요한 요청을 한 문장으로 미리 준비합니다.',small:'요청 문장을 휴대폰에 저장하기'}
  ];
  let showingSecond=false;
  let current=first.map(x=>({...x}));
  const root=document.getElementById('demoCards');
  const toast=document.getElementById('demoToast');
  const swap=document.getElementById('swapSteps');
  function render(){
    root.innerHTML='';
    current.forEach((item,i)=>{
      const card=document.createElement('article'); card.className='card';
      card.innerHTML=`<div class="num">0${i+1}</div><h3>${item.title}</h3><div class="why">${item.why}</div><div class="actions"><button class="btn primary" data-help="${i}">도움 보기</button><button class="btn secondary" data-small="${i}">더 작게</button></div>`;
      root.appendChild(card);
    });
    root.querySelectorAll('[data-small]').forEach(btn=>btn.addEventListener('click',()=>{
      const i=Number(btn.dataset.small); const before=current[i].title; current[i].title=current[i].small; current[i].why='같은 목표를 유지하면서 실행 부담을 한 단계 낮췄습니다.'; render(); toast.textContent=`“${before}”를 더 작은 단계로 조정했습니다.`;
    }));
    root.querySelectorAll('[data-help]').forEach(btn=>btn.addEventListener('click',()=>{
      const i=Number(btn.dataset.help); toast.textContent=`${current[i].title}에 맞는 실행 도움을 보여주는 자리입니다.`;
    }));
  }
  swap.addEventListener('click',()=>{
    showingSecond=!showingSecond; current=(showingSecond?second:first).map(x=>({...x})); render();
    swap.textContent=showingSecond?'처음 추천으로 돌아가기':'다른 걸로 바꿔주세요';
    toast.textContent=showingSecond?'같은 사용자 상태에서 다른 행동 3개를 다시 추천했습니다.':'처음 추천 3개로 돌아왔습니다.';
  });
  render();
})();