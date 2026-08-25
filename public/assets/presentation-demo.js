(function () {
  const params = new URLSearchParams(window.location.search);
  const active = params.get('demo') === 'presentation';
  if (!active) return;

  window.NUDGEON_PRESENTATION_DEMO = {
    active: true,
    firstSetTitles: [
      '사람 적은 산책 코스 걷기',
      '카페 메뉴 미리 고르기',
      '직원에게 메뉴 이름만 말하기'
    ],
    secondSetTitles: [
      '공원 벤치 3분 앉기',
      '외출 가방에 한 가지 넣기',
      '편의점에서 봉투 요청하기'
    ]
  };
})();
