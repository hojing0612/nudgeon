import test from 'node:test';
import assert from 'node:assert/strict';
import {
  behaviorFeedback,
  completedGoalCount,
  recommendDifficulty,
  recommendScenarioId,
  readJourneySnapshot,
} from '../src/lib/rehearsalPersonalization.ts';

test('완료한 마이크로스텝을 우선해 연습 상황을 추천한다', () => {
  const snapshot = readJourneySnapshot(JSON.stringify({
    profile: { level: 4, barrier: 'judged', vision: 'work' },
    micro: [{ text: '친구에게 보낼 답장 한 줄 써보기', done: true }],
    selectedMicroIndex: 0,
  }));
  assert.equal(recommendScenarioId(snapshot), 'friend');
});

test('높은 부담도에는 가벼운 난이도를 추천한다', () => {
  assert.equal(recommendDifficulty(5, 5), 'gentle');
  assert.equal(recommendDifficulty(5, 1), 'realistic');
  assert.equal(recommendDifficulty(3, 3), 'standard');
});

test('진행한 턴을 목표 완료 수와 행동 피드백으로 바꾼다', () => {
  assert.equal(completedGoalCount(5, 3), 3);
  assert.deepEqual(behaviorFeedback(2, 1, 0), [
    '첫 문장을 시작했어요.',
    '상대의 질문을 받고 대화를 이어갔어요.',
    '막힌 순간에 문장 도움을 활용했어요.',
  ]);
});
