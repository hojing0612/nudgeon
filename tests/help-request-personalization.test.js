import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/assets/personalization.js';

const P=globalThis.NudgeonPersonalization;

test('주관식 목표와 장벽 표현을 활용형까지 읽는다',()=>{
  assert.deepEqual(P.helpSignalsFromText('취업 준비를 하고 싶은데 사람에게 연락하는 게 무서워요.'),{
    goalTags:['job','career','friend','peer','community'],
    barrierTags:['contact','judged']
  });
  assert.deepEqual(P.helpSignalsFromText('뭘 해야 할지 막막하고 기운이 없어요.').barrierTags,['overload','energy']);
});

test('주관식 도움 요청이 맞는 마이크로스텝 순위를 올린다',()=>{
  const pool=[
    {stepId:'walk-1',chainId:'walk',level:3,barrierTags:['going'],goalTags:['daily']},
    {stepId:'message-1',chainId:'message',level:3,barrierTags:['contact','judged'],goalTags:['job','career']},
    {stepId:'info-1',chainId:'info',level:3,barrierTags:['overload'],goalTags:['change']}
  ];
  const profile={level:3,barrier:'going',goalTags:[]};
  const withoutHelp=P.recommendMicrosteps({pool,profile,answers:{},limit:1});
  const withHelp=P.recommendMicrosteps({pool,profile,answers:{nudgeon_help_open:'취업 문의 연락이 무서워요'},limit:1});
  assert.equal(withoutHelp[0].chainId,'walk');
  assert.equal(withHelp[0].chainId,'message');
});

test('빈 주관식 답변은 기존 추천 점수를 바꾸지 않는다',()=>{
  const step={stepId:'a',chainId:'a',level:3,barrierTags:['going'],goalTags:['daily']};
  const profile={level:3,barrier:'going',goalTags:['daily']};
  assert.equal(P.scoreStep(step,profile,['daily']).score,P.scoreStep(step,profile,['daily'],[],[]).score);
});
