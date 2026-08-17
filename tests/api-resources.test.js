import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/resources.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function resource(id, overrides = {}) {
  return {
    id,
    title: `정책 ${id}`,
    summary: '청년 지원',
    status: 'published',
    application_status: 'always',
    always_open: true,
    application_url: `https://example.org/apply/${id}`,
    region_codes: ['41'],
    source_key: 'test-source',
    raw_data: { category: 'welfare', minAge: 19, maxAge: 34 },
    ...overrides
  };
}

test('경기 사용자에게 타 지역 자료를 전국 정책처럼 노출하지 않는다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      resource('gyeonggi'),
      resource('ulsan', { title: '울산 동구 청년 행사', summary: '울산 청년 대상', region_codes: [] }),
      resource('national', { title: '전국 청년 지원금', region_codes: ['전국'] })
    ]
  });

  try {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { category: 'all', age: '21', region: '경기' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.resources.map(item => item.id).sort(), ['gyeonggi', 'national']);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  }
});

test('Supabase 1000행 제한 뒤의 데이터도 페이지를 넘겨 읽는다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => calls === 1
      ? Array.from({ length: 1000 }, (_, index) => resource(`page-1-${index}`))
      : [resource('page-2')]
    };
  };

  try {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { category: 'all', age: '21', region: '경기', limit: '1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.equal(res.body.meta.databaseRows, 1001);
    assert.equal(res.body.meta.sources['test-source'], 1001);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  }
});

test('AI가 비추천한 자료와 일반 센터 홈페이지를 정책 추천에서 제외한다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => [
    resource('useful', { ai_analysis: { confidence: .9, recommended: true, practical_value: 8, category: 'welfare', application_status: 'always', nationwide: true } }),
    resource('rejected', { ai_analysis: { confidence: .9, recommended: false, practical_value: 2, category: 'welfare', application_status: 'always', nationwide: true } }),
    resource('center', { kind: 'institution', application_url: 'https://www.work24.go.kr/cm/main.do' })
  ] });
  try {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { category: 'all', age: '21', region: '경기' } }, res);
    assert.deepEqual(res.body.resources.map(item => item.id), ['useful']);
    assert.equal(res.body.meta.nonActionable, 1);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  }
});

test('AI 확신이 낮은 후보는 삭제하지 않고 낮은 우선순위로 남긴다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  delete process.env.ANTHROPIC_API_KEY;
  global.fetch = async () => ({ ok: true, json: async () => [
    resource('strong', { ai_analysis: { confidence:.95, recommended:true, practical_value:9, category:'welfare', application_status:'always', nationwide:true } }),
    resource('uncertain', { ai_analysis: { confidence:.6, recommended:false, practical_value:3, category:'welfare', application_status:'always', nationwide:true } })
  ] });
  try {
    const res = responseRecorder();
    await handler({ method:'GET', query:{ category:'welfare', age:'21', region:'경기' } }, res);
    assert.deepEqual(res.body.resources.map(item => item.id), ['strong','uncertain']);
    assert.equal(res.body.resources[0].priority, 'top');
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
    if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  }
});

test('한 출처와 한 기관의 유사 과정이 추천 목록을 독점하지 않는다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const repeated = Array.from({ length: 20 }, (_, index) => resource(`repeat-${index}`, {
    title:`웹개발 훈련 ${index + 1}차`, organization_name:'같은 훈련원', source_key:'work24-training-card',
    raw_data:{ category:'education', trainingStart:'2026-09-01' }
  }));
  const diverse = Array.from({ length: 5 }, (_, index) => resource(`diverse-${index}`, {
    title:`서로 다른 역량 ${index}`, organization_name:`기관 ${index}`, source_key:`source-${index}`,
    raw_data:{ category:'education' }
  }));
  global.fetch = async () => ({ ok:true, json:async () => [...repeated, ...diverse] });
  try {
    const res = responseRecorder();
    await handler({ method:'GET', query:{ category:'education', age:'21', region:'경기' } }, res);
    assert.equal(res.body.resources.filter(item => item.organization === '같은 훈련원').length, 1);
    assert.equal(res.body.resources.filter(item => item.id.startsWith('diverse-')).length, 5);
    assert.ok(res.body.meta.rejected.duplicateOrDominant >= 19);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  }
});

test('상담 카테고리에서 타 지역·취업상담·포털 자료를 제외한다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  delete process.env.ANTHROPIC_API_KEY;
  global.fetch = async () => ({ ok: true, json: async () => [
    resource('therapy', { title: '경기도 청년 심리상담 바우처', summary: '전문 심리상담 8회 지원', raw_data: { category: 'counseling', minAge: 19, maxAge: 34 } }),
    resource('daejeon', { title: '대전 청년 심리상담', summary: '대전광역시 거주자 지원', region_codes: ['41'], raw_data: { category: 'counseling' } }),
    resource('job-center', { title: '청년 일자리센터 취업상담', raw_data: { category: 'counseling' } }),
    resource('portal', { title: '청년정책 포털 운영', raw_data: { category: 'counseling' } })
  ] });
  try {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { category: 'counseling', age: '20', region: '경기' } }, res);
    assert.deepEqual(res.body.resources.map(item => item.id), ['therapy']);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
    if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  }
});

test('메인 홈페이지뿐이거나 행동 경로가 없는 정책은 노출하지 않는다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => [
    resource('main-only', { application_url: 'https://www.work24.go.kr/cm/main.do' }),
    resource('no-action', { application_url: null, reference_url: null }),
    resource('direct', { application_url: 'https://www.work24.go.kr/specific/application/123' }),
    resource('phone', { application_url: null, contact: '031-123-4567' })
  ] });
  try {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { category: 'all', age: '20', region: '경기' } }, res);
    assert.deepEqual(res.body.resources.map(item => item.id).sort(), ['direct','phone']);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  }
});

test('명시된 모집기간을 상태값보다 우선하고 한국어 날짜로 정규화한다', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => [
    resource('expired', { application_status:'always', always_open:true, application_starts_at:'2025-01-01', application_ends_at:'2025-12-31' }),
    resource('current', { application_status:'closed', always_open:false, application_starts_at:'2026-01-01', application_ends_at:'2026-12-31' })
  ] });
  try {
    const res = responseRecorder();
    await handler({ method:'GET', query:{ category:'all', age:'20', region:'경기' } }, res);
    assert.deepEqual(res.body.resources.map(item=>item.id), ['current']);
    assert.equal(res.body.resources[0].periodText, '2026년 1월 1일 ~ 2026년 12월 31일');
    assert.equal(res.body.resources[0].applicationStatus, 'open');
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  }
});
