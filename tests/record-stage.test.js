import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/assets/journey.js',import.meta.url),'utf8');

test('오늘의 연결은 단계 순서대로 기록이 있는 그룹만 표시한다',()=>{
  const groupInfo=source.match(/const groupInfo=\[(.*?)\];/s)?.[1]||'';
  assert.ok(groupInfo.indexOf("'micro'")<groupInfo.indexOf("'rehearsal'"));
  assert.ok(groupInfo.indexOf("'rehearsal'")<groupInfo.indexOf("'connect'"));
  assert.match(source,/\.filter\(\(\[key\]\)=>activityGroups\[key\]\.length\)/);
});

test('습관 체크 후 현재 화면 위치와 체크박스 포커스를 복원한다',()=>{
  assert.match(source,/const scrollPosition=\{x:window\.scrollX,y:window\.scrollY\}/);
  assert.match(source,/window\.scrollTo\(scrollPosition\.x,scrollPosition\.y\)/);
  assert.match(source,/focus\(\{preventScroll:true\}\)/);
});
