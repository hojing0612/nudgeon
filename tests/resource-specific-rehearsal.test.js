import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const connectSource = readFileSync(new URL('../public/assets/connect-stage.js', import.meta.url), 'utf8');
const rehearsalSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const resourcesSource = readFileSync(new URL('../api/resources.js', import.meta.url), 'utf8');

test('policy ranking reason is exposed without changing eligibility filters', () => {
  assert.match(resourcesSource, /recommendationReason:String\(resource\._reason/);
  assert.match(resourcesSource, /const profileMatches = specialMatches\.filter/);
  assert.match(resourcesSource, /const ranked = await personalizedOrder\(candidates/);
});

test('policy cards and details launch the selected resource rehearsal', () => {
  assert.match(connectSource, /data-card-rehearse/);
  assert.match(connectSource, /function startRehearsal\(resource\)/);
  assert.match(connectSource, /resource:rehearsalResource\(resource\)/);
  assert.match(connectSource, /이 지원에 닿는 첫 행동/);
});

test('resource context carries practical application facts into rehearsal', () => {
  assert.match(rehearsalSource, /applicationMethod: string/);
  assert.match(rehearsalSource, /requiredDocuments: string/);
  assert.match(rehearsalSource, /periodText: string/);
  assert.match(rehearsalSource, /이 기관에 맞춘 문의 연습/);
  assert.match(rehearsalSource, /신청 방법은 \$\{applicationMethod\}/);
});

test('returning from rehearsal restores the selected policy detail without refetching the list first', () => {
  assert.match(connectSource, /detailResource:detailSnapshot\(resource\)/);
  assert.match(connectSource, /if\(cachedDetail\)\{st\.detail=cachedDetail;st\.view='detail'/);
  assert.match(connectSource, /if\(st\.view==='list'\)load\(\)/);
  assert.match(connectSource, /st\.items\.length\?render\(\):load\(\)/);
});
