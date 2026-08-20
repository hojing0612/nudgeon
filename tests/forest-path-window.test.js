import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicMarkup = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
const publicStyles = readFileSync(new URL('../public/assets/journey.css', import.meta.url), 'utf8');
const rehearsalMarkup = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const rehearsalStyles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('공개 여정 창문은 Forest Path 레이어를 사용한다', () => {
  for (const layer of ['forest-sun', 'forest-hill-distant', 'forest-hill-near', 'forest-grove-left', 'forest-grove-right', 'forest-tree-a', 'forest-path', 'forest-mullion-vertical', 'forest-mullion-horizontal']) {
    assert.match(publicMarkup, new RegExp(layer));
  }
  assert.doesNotMatch(publicMarkup, /forest-shutter/);
  assert.match(publicStyles, /linear-gradient\(180deg,#4F91AD 0%,#A9CCC7 45%,#F5D68C 74%/);
});

test('Forest Path는 1~5단계에 따라 숲이 물러나고 길과 빛이 넓어진다', () => {
  assert.match(publicStyles, /--forest-grove-shift:0px/);
  assert.match(publicStyles, /data-window-screen="micro"[\s\S]*--forest-grove-shift:12px/);
  assert.match(publicStyles, /data-window-screen="rehearsal"[\s\S]*--forest-grove-shift:24px/);
  assert.match(publicStyles, /data-window-screen="connect"[\s\S]*--forest-grove-shift:40px/);
  assert.match(publicStyles, /data-window-screen="connect"[\s\S]*forest-guidance-light\{display:block\}/);
  assert.match(publicStyles, /data-window-screen="record"[\s\S]*--forest-grove-shift:54px/);
  assert.match(publicStyles, /data-window-screen="record"[\s\S]*forest-birds\{display:block\}/);
});

test('사회적 리허설 화면은 3단계 Forest Path 상태를 사용한다', () => {
  assert.match(rehearsalMarkup, /rehearsal-window forest-stage-3/);
  assert.match(rehearsalMarkup, /forest-path/);
  assert.doesNotMatch(rehearsalMarkup, /window-bridge/);
});

test('모든 단계는 같은 세로 타원을 쓰고 3~5단계 진입 애니메이션을 제공한다', () => {
  assert.match(publicStyles, /\.window-glow\{[^}]*width:300px;height:360px;border-radius:50%/);
  assert.doesNotMatch(publicStyles, /\.window-glow\{display:none/);
  assert.doesNotMatch(rehearsalStyles, /\.window-glow\s*\{\s*display:\s*none/);
  assert.doesNotMatch(publicStyles, /data-window-screen="connect"\] \.window-glow/);
  assert.doesNotMatch(publicStyles, /data-window-screen="record"\] \.window-glow/);
  assert.match(publicStyles, /@keyframes forest-stage4-left/);
  assert.match(publicStyles, /@keyframes forest-stage5-left/);
  assert.match(rehearsalStyles, /@keyframes forest-stage3-left/);
});
