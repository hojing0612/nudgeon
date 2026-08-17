const BASE = 'https://www.work24.go.kr/cm/openApi/call';

const text = value => value == null ? '' : String(value).trim();
const decode = value => text(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const value = (body, tag) => decode(body.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
const blocks = (body, tag) => [...body.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map(match => match[1]);
const compact = date => date.toISOString().slice(0, 10).replace(/-/g, '');
const isoDate = input => {
  const digits = text(input).replace(/\D/g, '');
  if (digits.length < 8) return null;
  const result = new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T23:59:59+09:00`);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
};
const absoluteUrl = input => {
  const url = text(input);
  if (!url) return null;
  try { return new URL(url, 'https://www.work24.go.kr').toString(); } catch { return null; }
};

export function normalizeWork24Key(input) {
  return text(input).replace(/^['"]|['"]$/g, '');
}

async function request(path, params) {
  const response = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`);
  const payload = await response.text();
  if (!response.ok) throw new Error(`Work24 ${response.status}: ${payload.slice(0, 300)}`);
  const error = value(payload, 'error') || value(payload, 'message');
  if (error) throw new Error(`Work24 응답 오류: ${error}`);
  return payload;
}

function trainingResource(sourceKey, body) {
  const id = value(body, 'trprId');
  const round = value(body, 'trprDegr');
  const institutionId = value(body, 'trainstCstId');
  const start = isoDate(value(body, 'traStartDate'));
  const end = isoDate(value(body, 'traEndDate'));
  const address = value(body, 'address');
  const titleLink = absoluteUrl(value(body, 'titleLink') || value(body, 'subTitleLink'));
  const title = value(body, 'title') || value(body, 'subTitle');
  const institution = value(body, 'subTitle');
  const target = value(body, 'trainTarget');
  const cost = value(body, 'realMan') || value(body, 'courseMan');
  const employmentRate = value(body, 'eiEmplRate6') || value(body, 'eiEmplRate3');
  const satisfaction = value(body, 'stdgScor');
  const details = [
    target && `훈련 대상: ${target}`,
    cost && `훈련비: ${cost}`,
    employmentRate && `취업률: ${employmentRate}`,
    satisfaction && `만족도: ${satisfaction}`
  ].filter(Boolean).join('\n');
  return {
    external_id: [id, round, institutionId].filter(Boolean).join(':') || null,
    source_key: sourceKey,
    kind: 'program', status: 'published', title,
    summary: [institution, address].filter(Boolean).join(' · ') || null,
    details: details || null,
    organization_name: institution || '고용24',
    application_url: titleLink,
    application_method: titleLink ? '고용24 과정 상세에서 수강 신청 절차 확인' : null,
    application_status: start && new Date(start) < new Date() && end && new Date(end) < new Date() ? 'closed' : 'open',
    application_ends_at: start,
    always_open: false,
    region_codes: [value(body, 'trngAreaCd') || address].filter(Boolean),
    keywords: ['직업훈련', value(body, 'ncsCd'), target].filter(Boolean),
    verified_at: new Date().toISOString(),
    raw_data: {
      category: 'education', trainingCourseId: id, trainingRound: round,
      trainingInstitutionId: institutionId, trainingStart: start,
      trainingEnd: end, trainingTarget: target, ncsCode: value(body, 'ncsCd'),
      actualCost: cost, employmentRate, satisfaction,
      applicationPeriod: start ? `현재 ~ ${start.slice(0, 10)}` : null
    }
  };
}

const TRAINING_SOURCES = [
  { sourceKey: 'work24-training-card', env: 'WORK24_TRAINING_CARD_API_KEY', path: 'hr/callOpenApiSvcInfo310L01.do' },
  { sourceKey: 'work24-employer-training', env: 'WORK24_EMPLOYER_TRAINING_API_KEY', path: 'hr/callOpenApiSvcInfo311L01.do' },
  { sourceKey: 'work24-consortium-training', env: 'WORK24_CONSORTIUM_TRAINING_API_KEY', path: 'hr/callOpenApiSvcInfo312L01.do' },
  { sourceKey: 'work24-work-learning', env: 'WORK24_WORK_LEARNING_API_KEY', path: 'hr/callOpenApiSvcInfo313L01.do' }
];

export async function collectTraining(source, apiKey, { maxPages = 10 } = {}) {
  const from = new Date();
  const to = new Date();
  to.setFullYear(to.getFullYear() + 1);
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await request(source.path, {
      authKey: normalizeWork24Key(apiKey), returnType: 'XML', outType: '1',
      pageNum: String(page), pageSize: '100', srchTraStDt: compact(from),
      srchTraEndDt: compact(to), sort: 'ASC', sortCol: '2'
    });
    const pageItems = blocks(payload, 'scn_list');
    items.push(...pageItems.map(item => trainingResource(source.sourceKey, item)));
    const total = Number(value(payload, 'scn_cnt')) || items.length;
    if (!pageItems.length || items.length >= total) break;
  }
  return items.filter(item => item.external_id && item.title && item.application_url && item.application_status !== 'closed');
}

export async function collectJobSeekerPrograms(apiKey, { maxPages = 10 } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await request('wk/callOpenApiSvcInfo217L01.do', {
      authKey: normalizeWork24Key(apiKey), returnType: 'XML', startPage: String(page), display: '100'
    });
    const pageItems = blocks(payload, 'empPgmSchdInvite');
    items.push(...pageItems.map(item => {
      const organization = value(item, 'orgNm');
      const program = value(item, 'pgmNm');
      const course = value(item, 'pgmSubNm');
      const startRaw = value(item, 'pgmStdt');
      const start = isoDate(startRaw);
      const end = isoDate(value(item, 'pgmEndt'));
      return {
        external_id: [organization, program, course, startRaw].join(':'),
        source_key: 'work24-jobseeker-program', kind: 'program', status: 'published',
        title: course || program, summary: [program, value(item, 'pgmTarget')].filter(Boolean).join(' · '),
        details: [value(item, 'openPlcCont'), value(item, 'openTime'), value(item, 'operationTime')].filter(Boolean).join(' · '),
        organization_name: organization || '고용센터', contact: null,
        application_url: null, reference_url: 'https://www.work24.go.kr',
        application_method: organization ? `${organization}에 참가 방법 문의` : '관할 고용센터에 참가 방법 문의',
        application_status: end && new Date(end) < new Date() ? 'closed' : 'open',
        application_starts_at: start, application_ends_at: start, always_open: false,
        region_codes: [value(item, 'openPlcCont'), organization].filter(Boolean),
        keywords: ['구직역량', '취업지원', program].filter(Boolean), verified_at: new Date().toISOString(),
        raw_data: { category: 'career', programStart: start, programEnd: end, target: value(item, 'pgmTarget'), applicationPeriod: start ? `현재 ~ ${start.slice(0, 10)}` : null }
      };
    }));
    const total = Number(value(payload, 'total')) || items.length;
    if (!pageItems.length || items.length >= total) break;
  }
  return items.filter(item => item.external_id && item.title && item.application_status !== 'closed');
}

export async function collectYouthExperiences(apiKey, { maxPages = 10 } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await request('wk/callOpenApiSvcInfo216L21.do', {
      authKey: normalizeWork24Key(apiKey), callTp: 'L', returnType: 'XML',
      startPage: String(page), display: '100', sregDtmValCd: '6'
    });
    const pageItems = blocks(payload, 'traOrg');
    items.push(...pageItems.map(item => {
      const id = value(item, 'wantedAuthNo');
      const start = isoDate(value(item, 'traStdt'));
      const end = isoDate(value(item, 'traEndt'));
      const company = value(item, 'traCustNm');
      return {
        external_id: id, source_key: 'work24-youth-company-experience', kind: 'program', status: 'published',
        title: `${company || value(item, 'traOrgNm')} 청년 직업체험`,
        summary: [value(item, 'collectJobsNm'), value(item, 'regionNm'), value(item, 'collectPsncnt') && `${value(item, 'collectPsncnt')}명 모집`].filter(Boolean).join(' · '),
        organization_name: value(item, 'traOrgNm') || company || '고용24',
        application_url: id ? `https://www.work24.go.kr/wk/a/b/1200/retriveDtlEmpSrchList.do?wantedAuthNo=${encodeURIComponent(id)}` : null,
        application_status: end && new Date(end) < new Date() ? 'closed' : 'open',
        application_starts_at: start, application_ends_at: end, always_open: false,
        region_codes: [value(item, 'regionNm')].filter(Boolean),
        keywords: ['직업체험', '일경험', value(item, 'collectJobsNm')].filter(Boolean),
        verified_at: new Date().toISOString(),
        raw_data: { category: 'career', trainingStart: start, trainingEnd: end, selectedCount: value(item, 'selPsncnt'), recruitmentCount: value(item, 'collectPsncnt') }
      };
    }));
    const total = Number(value(payload, 'total')) || items.length;
    if (!pageItems.length || items.length >= total) break;
  }
  return items.filter(item => item.external_id && item.title && item.application_url && item.application_status !== 'closed');
}

export function approvedWork24Sources() {
  return [
    ...TRAINING_SOURCES.map(source => [source.sourceKey, source.env, key => collectTraining(source, key)]),
    ['work24-jobseeker-program', 'WORK24_JOB_SEEKER_PROGRAM_API_KEY', collectJobSeekerPrograms],
    ['work24-youth-company-experience', 'WORK24_STRONG_COMPANY_API_KEY', collectYouthExperiences]
  ];
}

export const work24Catalog = {
  training: TRAINING_SOURCES,
  details: {
    'work24-training-card': ['hr/callOpenApiSvcInfo310L02.do', 'hr/callOpenApiSvcInfo310L03.do'],
    'work24-employer-training': ['hr/callOpenApiSvcInfo311D01.do', 'hr/callOpenApiSvcInfo311D02.do'],
    'work24-consortium-training': ['hr/callOpenApiSvcInfo312D01.do', 'hr/callOpenApiSvcInfo312D02.do'],
    'work24-work-learning': ['hr/callOpenApiSvcInfo313D01.do', 'hr/callOpenApiSvcInfo313D02.do']
  },
  reference: {
    commonRecruitmentCodes: ['WORK24_COMMON_CODE_API_KEY', 'wk/callOpenApiSvcInfo21L01.do'],
    commonTrainingCodes: ['WORK24_COMMON_CODE_API_KEY', 'hr/callOpenApiSvcInfo319L01.do'],
    occupations: ['WORK24_OCCUPATION_API_KEY', 'wk/callOpenApiSvcInfo212L01.do'],
    majors: ['WORK24_OCCUPATION_API_KEY', 'wk/callOpenApiSvcInfo213L01.do'],
    jobDuties: ['WORK24_JOB_DUTY_API_KEY', 'wk/callOpenApiSvcInfo215L01.do'],
    jobDutyDictionary: ['WORK24_JOB_DUTY_API_KEY', 'wk/callOpenApiSvcInfo215L11.do'],
    strongCompanies: ['WORK24_STRONG_COMPANY_API_KEY', 'wk/callOpenApiSvcInfo216L01.do'],
    youthFriendlyCompanies: ['WORK24_STRONG_COMPANY_API_KEY', 'wk/callOpenApiSvcInfo216L31.do']
  }
};
