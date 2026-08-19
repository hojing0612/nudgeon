import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePolicies } from '../api/policy-ops-status.js';

const now=new Date('2026-08-19T00:00:00.000Z');
const base={
  id:'1',title:'청년 마음 지원',summary:'상담 5회 지원',organization_name:'청년센터',
  application_url:'https://example.org/apply',application_method:'온라인 신청',
  application_status:'open',application_ends_at:'2026-09-20T23:59:59.000Z',
  status:'published',source_key:'test',verified_at:'2026-08-18T00:00:00.000Z'
};

test('활성 정책과 14일 내 마감을 구분한다',()=>{
  const result=diagnosePolicies([
    base,
    {...base,id:'2',title:'청년 주거 지원',application_ends_at:'2026-09-02T00:00:00.000Z'}
  ],now);
  assert.equal(result.counts.total,2);
  assert.equal(result.counts.active,2);
  assert.equal(result.counts.expiringSoon,1);
});

test('마감 정책은 활성 정책에서 제외한다',()=>{
  const result=diagnosePolicies([{...base,application_ends_at:'2026-08-18T00:00:00.000Z'}],now);
  assert.equal(result.counts.active,0);
  assert.equal(result.counts.closed,1);
});

test('필수 정보 누락과 잘못된 링크를 찾는다',()=>{
  const result=diagnosePolicies([{
    ...base,summary:'',application_method:'',contact:'',application_url:'not-a-url',reference_url:''
  }],now);
  assert.equal(result.counts.missing,1);
  assert.equal(result.counts.badLink,1);
});

test('연도와 회차만 다른 동일 정책명을 중복으로 찾는다',()=>{
  const result=diagnosePolicies([
    {...base,id:'1',title:'2026 청년도전 지원 1차'},
    {...base,id:'2',title:'2025 청년도전 지원 2차'}
  ],now);
  assert.equal(result.counts.duplicate,2);
});
