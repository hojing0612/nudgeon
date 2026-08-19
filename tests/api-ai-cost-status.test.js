import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRangeUtc, summarizeCostReport } from '../api/ai-cost-status.js';

test('이번 달 UTC 시작 시각과 조회 종료 시각을 만든다', () => {
  const now = new Date('2026-08-19T16:30:00.000Z');
  assert.deepEqual(monthRangeUtc(now), {
    startingAt: '2026-08-01T00:00:00.000Z',
    endingAt: '2026-08-19T16:30:00.000Z'
  });
});

test('페이지와 일자별 비용을 센트 기준으로 정확히 합산한다', () => {
  const result = summarizeCostReport([
    { data: [{ results: [{ amount: '120.5' }, { amount: '4.25' }] }] },
    { data: [{ results: [{ amount: '75.25' }] }] }
  ]);
  assert.equal(result.amountCents, 200);
  assert.equal(result.amountUsd, 2);
});

test('비어 있거나 잘못된 비용 항목은 0으로 처리한다', () => {
  assert.deepEqual(summarizeCostReport([{ data: [{ results: [{ amount: 'invalid' }] }] }]), {
    amountCents: 0,
    amountUsd: 0
  });
});
