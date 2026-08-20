import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicMarkup = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
const publicStyles = readFileSync(new URL('../public/assets/journey.css', import.meta.url), 'utf8');
const publicScript = readFileSync(new URL('../public/assets/journey.js', import.meta.url), 'utf8');
const rehearsalMarkup = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const rehearsalStyles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('공개 여정 창문은 기존 커튼과 창살 레이어를 사용한다', () => {
  for (const layer of ['window-ground', 'window-path', 'window-bridge', 'curtain l', 'curtain r', 'window-bar vertical', 'window-bar horizontal']) {
    assert.match(publicMarkup, new RegExp(layer));
  }
  assert.doesNotMatch(publicMarkup, /forest-/);
  assert.match(publicStyles, /\.window-frame\{[^}]*border-radius:6px;background:#806B54/);
});

test('창문은 1~5단계에 따라 커튼이 더 열리고 빛이 강해진다', () => {
  assert.match(publicScript, /document\.documentElement\.style\.setProperty\('--open'/);
  assert.match(publicStyles, /\.window-illustration \.curtain\.l\{[^}]*calc\(var\(--open,0\) \* -112px\)/);
  assert.match(publicStyles, /\.app\[data-window-screen="connect"\] \.curtain\.l\{animation:classic-stage4-left/);
  assert.match(publicStyles, /\.app\[data-window-screen="record"\] \.curtain\.l\{animation:classic-stage5-left/);
});

test('사회적 리허설 화면은 3단계 커튼 진입 애니메이션을 사용한다', () => {
  assert.match(rehearsalMarkup, /rehearsal-window classic-stage-3/);
  assert.match(rehearsalMarkup, /window-bridge/);
  assert.doesNotMatch(rehearsalMarkup, /forest-/);
});

test('모든 단계는 같은 세로 타원을 쓰고 3~5단계 커튼 진입 애니메이션을 제공한다', () => {
  assert.match(publicStyles, /\.window-glow\{[^}]*width:300px;height:360px;border-radius:50%/);
  assert.doesNotMatch(publicStyles, /data-window-screen="connect"\] \.window-glow/);
  assert.doesNotMatch(publicStyles, /data-window-screen="record"\] \.window-glow/);
  assert.match(publicStyles, /@keyframes classic-stage4-left/);
  assert.match(publicStyles, /@keyframes classic-stage5-left/);
  assert.match(rehearsalStyles, /@keyframes classic-stage3-left/);
});
