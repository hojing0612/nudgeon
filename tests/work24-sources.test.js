import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvedWork24Sources,
  collectJobSeekerPrograms,
  collectTraining,
  collectYouthExperiences,
  normalizeWork24Key,
  work24Catalog
} from '../api/_work24.js';

function mockFetch(xml) {
  const previous = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => xml });
  return () => { global.fetch = previous; };
}

test('normalizes only accidental wrapping quotes without changing an API key', () => {
  assert.equal(normalizeWork24Key('"abc-def"'), 'abc-def');
});

test('collects an actionable training course with its direct link and identifiers', async () => {
  const restore = mockFetch(`
    <HRDNet><scn_cnt>1</scn_cnt><srchList><scn_list>
      <title>K-디지털 웹 개발</title><subTitle>호정훈련원</subTitle>
      <titleLink>/training/detail?id=1</titleLink><address>경기도 수원시</address>
      <traStartDate>20261201</traStartDate><traEndDate>20270201</traEndDate>
      <trprId>A1</trprId><trprDegr>3</trprDegr><trainstCstId>I9</trainstCstId>
      <trainTarget>구직자</trainTarget><realMan>0원</realMan><trngAreaCd>41</trngAreaCd>
    </scn_list></srchList></HRDNet>`);
  try {
    const items = await collectTraining({ sourceKey: 'work24-training-card', path: 'hr/example.do' }, 'key');
    assert.equal(items.length, 1);
    assert.equal(items[0].external_id, 'A1:3:I9');
    assert.equal(items[0].raw_data.category, 'education');
    assert.match(items[0].application_url, /^https:\/\/www\.work24\.go\.kr\/training\/detail/);
  } finally { restore(); }
});

test('collects a job-seeker program and preserves its venue and target', async () => {
  const restore = mockFetch(`
    <empPgmSchdInviteList><total>1</total><empPgmSchdInvite>
      <orgNm>수원고용센터</orgNm><pgmNm>취업희망</pgmNm><pgmSubNm>면접 자신감</pgmSubNm>
      <pgmTarget>청년 구직자</pgmTarget><pgmStdt>20261201</pgmStdt><pgmEndt>20261202</pgmEndt>
      <openPlcCont>수원고용센터 3층</openPlcCont><openTime>10:00</openTime>
    </empPgmSchdInvite></empPgmSchdInviteList>`);
  try {
    const items = await collectJobSeekerPrograms('key');
    assert.equal(items.length, 1);
    assert.equal(items[0].raw_data.target, '청년 구직자');
    assert.match(items[0].details, /수원고용센터 3층/);
  } finally { restore(); }
});

test('searches future dates and treats Work24 no-data messages as empty dates', async () => {
  const previous = global.fetch;
  const requestedDates = [];
  global.fetch = async request => {
    const url = new URL(String(request));
    requestedDates.push(url.searchParams.get('pgmStdt'));
    return { ok: true, status: 200, text: async () => '<GO24><message>정보가 존재하지 않습니다.</message></GO24>' };
  };
  try {
    const items = await collectJobSeekerPrograms('key', { days: 3, concurrency: 2 });
    assert.deepEqual(items, []);
    assert.equal(requestedDates.length, 3);
    assert.ok(requestedDates.every(date => /^\d{8}$/.test(date)));
  } finally { global.fetch = previous; }
});

test('collects youth company experience but not a bare company directory entry', async () => {
  const restore = mockFetch(`
    <traOrgList><total>1</total><traOrg>
      <wantedAuthNo>E123</wantedAuthNo><traOrgNm>경기운영기관</traOrgNm><traCustNm>좋은기업</traCustNm>
      <collectJobsNm>제품디자인</collectJobsNm><regionNm>경기</regionNm>
      <collectPsncnt>5</collectPsncnt><traStdt>20261201</traStdt><traEndt>20261231</traEndt>
    </traOrg></traOrgList>`);
  try {
    const items = await collectYouthExperiences('key');
    assert.equal(items.length, 1);
    assert.equal(items[0].source_key, 'work24-youth-company-experience');
    assert.match(items[0].application_url, /E123/);
  } finally { restore(); }
});

test('reports the Work24 total and response preview when youth experiences are empty', async () => {
  const restore = mockFetch('<traOrgList><total>0</total></traOrgList>');
  try {
    await assert.rejects(
      () => collectYouthExperiences('key'),
      error => /total=0/.test(error.message) && /traOrgList/.test(error.message)
    );
  } finally { restore(); }
});

test('catalog keeps auxiliary APIs separate from recommendation sources', () => {
  const sourceKeys = approvedWork24Sources().map(([source]) => source);
  assert.ok(sourceKeys.includes('work24-training-card'));
  assert.ok(!sourceKeys.includes('work24-jobs'));
  assert.deepEqual(work24Catalog.reference.commonTrainingCodes, [
    'WORK24_COMMON_CODE_API_KEY', 'hr/callOpenApiSvcInfo319L01.do'
  ]);
});
