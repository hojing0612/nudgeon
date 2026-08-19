import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/assets/journey.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/journey.css',import.meta.url),'utf8');

function extractedFunction(name){
  const match=source.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match,`${name} should exist`);
  return Function(`return (${match[0]})`)();
}

test('microstep sheet help columns are parsed into per-step help',()=>{
  for(const column of ['help_type','help_title','help_description','help_steps','primary_action','resource_url','search_keyword','rehearsal_scenario','fallback_action','completion_message']){
    assert.match(source,new RegExp(`['"]${column}['"]`));
  }
  assert.match(source,/help:microstepHelpFromRow\(r\)/);
  assert.match(source,/hydrateMicrostepHelp\(state\.micro\)/);
});

test('pipe-separated help steps are normalized',()=>{
  const splitHelpSteps=extractedFunction('splitHelpSteps');
  assert.deepEqual(splitHelpSteps(' 첫 단계 | 두 번째 단계 || '),['첫 단계','두 번째 단계']);
});

test('timer duration supports Korean minute and second labels',()=>{
  const helpDurationSeconds=extractedFunction('helpDurationSeconds');
  assert.equal(helpDurationSeconds({title:'5분 머물기',primaryAction:'',steps:[]}),300);
  assert.equal(helpDurationSeconds({title:'',primaryAction:'30초 시작',steps:[]}),30);
  assert.equal(helpDurationSeconds({title:'시간 없음',primaryAction:'',steps:[]}),180);
});

test('all interactive help executors and responsive styles are wired',()=>{
  for(const hook of ['data-help-timer','data-help-map','data-help-link','data-help-copy','data-help-photo','data-help-rehearsal','data-help-start']){
    assert.match(source,new RegExp(hook));
  }
  assert.match(source,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(css,/\.help-steps/);
  assert.match(css,/\.help-action-row/);
});
