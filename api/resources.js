import { callClaudeTool } from './_anthropic.js';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const REGION_PREFIX = {
  '서울': '11', '부산': '26', '대구': '27', '인천': '28', '광주': '29',
  '대전': '30', '울산': '31', '세종': '36', '경기': '41', '강원': '51',
  '충북': '43', '충남': '44', '전북': '52', '전남': '46', '경북': '47',
  '경남': '48', '제주': '50'
};
const REGION_NAMES = Object.keys(REGION_PREFIX);

function searchableText(resource) {
  return [resource.title, resource.summary, resource.details, resource.support_details, resource.organization_name]
    .filter(Boolean).join(' ');
}

function isGenericPortal(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const generic = [
      ['work24.go.kr', ['/','/cm/main.do']],
      ['bokjiro.go.kr', ['/']],
      ['myhome.go.kr', ['/']],
      ['apply.lh.or.kr', ['/']]
    ];
    return generic.some(([host, paths]) => url.hostname.endsWith(host) && paths.includes(path));
  } catch { return true; }
}

function directActionUrl(resource) {
  for (const value of [resource.application_url, resource.reference_url]) {
    if (value && !isGenericPortal(value)) return value;
  }
  return null;
}

function hasConcreteAction(resource) {
  const method = String(resource.application_method || '').trim();
  return Boolean(directActionUrl(resource) || resource.contact || (method.length >= 8 && !/홈페이지|온라인 신청|사이트 확인/.test(method)));
}

function regionsInText(resource) {
  const text = searchableText(resource);
  return REGION_NAMES.filter(region => text.includes(region));
}

function inferredCategory(resource) {
  const text = searchableText(resource).toLowerCase();
  if (/주거|주택|월세|전세|임대|청약|보증금|lh|sh/.test(text)) return 'housing';
  if (/정신건강|심리|마음건강|우울|불안|고립|은둔|외래치료비/.test(text)) return 'counseling';
  if (/취업|구직|일자리|채용|면접|창업|직업훈련|국민취업지원/.test(text)) return 'career';
  return null;
}

function textIncludesAny(value, words) {
  const text = String(value || '').toLowerCase();
  return words.some(word => text.includes(word));
}

function eligibility(resource, profile) {
  const reasons = [];
  const missing = [];
  const raw = resource.raw_data || {};
  const age = numberOrNull(profile.age);
  const userMin = numberOrNull(profile.ageMin);
  const userMax = numberOrNull(profile.ageMax);
  const min = numberOrNull(raw.minAge);
  const max = numberOrNull(raw.maxAge);
  if (min || max) {
    if (!age && !userMin && !userMax) missing.push('나이');
    else if (!age && ((max && userMin && userMin > max) || (min && userMax && userMax < min))) reasons.push(`연령 조건 ${min || ''}~${max || ''}세`);
    else if (age && ((min && age < min) || (max && age > max))) reasons.push(`연령 조건 ${min || ''}~${max || ''}세`);
  }
  const userRegion = String(profile.region || '');
  const regionPrefix = REGION_PREFIX[userRegion] || (/^\d{2,5}$/.test(userRegion) ? userRegion.slice(0, 2) : '');
  const regionCodes = (resource.region_codes || []).map(String).filter(Boolean);
  const textRegions = regionsInText(resource);
  const nationwide = regionCodes.some(code => ['00', '0', '전국'].includes(code));
  const codeMatch = regionPrefix && regionCodes.some(code => code.startsWith(regionPrefix));
  const textMatch = userRegion && textRegions.includes(userRegion);
  // Explicit place names in the content override a conflicting/mis-normalized
  // source code. This prevents a Daejeon/Gwangyang item tagged as Gyeonggi.
  if (!nationwide && userRegion && textRegions.length && !textMatch) reasons.push('거주 지역');
  else if (!nationwide && regionPrefix && regionCodes.length && !codeMatch) reasons.push('거주 지역');
  else if (!nationwide && userRegion && !regionCodes.length && textRegions.length && !textMatch) reasons.push('거주 지역');
  else if (!nationwide && !regionCodes.length && !textRegions.length) missing.push('거주 지역');

  const education = String(profile.education || '');
  const employment = String(profile.employment || '');
  const educationText = `${raw.educationCodes || ''} ${resource.details || ''}`;
  const employmentText = `${raw.employmentCodes || ''} ${resource.details || ''}`;
  if (education && textIncludesAny(educationText, ['졸업자만', '졸업생만']) && education !== 'graduate') reasons.push('학업 상태');
  if (education === 'student' && textIncludesAny(educationText, ['재학생 제외', '재학 중인 자 제외'])) reasons.push('학업 상태');
  if (employment && textIncludesAny(employmentText, ['미취업자', '구직자']) && ['employed'].includes(employment)) reasons.push('취업 상태');
  if (employment && textIncludesAny(employmentText, ['재직자']) && ['unemployed', 'inactive'].includes(employment)) reasons.push('취업 상태');

  const hasComplex = Boolean(raw.incomeType || raw.incomeDetails || raw.educationCodes || raw.employmentCodes || resource.details);
  if (reasons.length) return { result: 'unlikely', label: '현재 조건과 맞지 않을 수 있어요', reasons, missing };
  if (missing.length || hasComplex) return { result: 'needs_review', label: '추가 확인이 필요해요', reasons, missing };
  return { result: 'likely', label: '자격 가능성이 높아요', reasons, missing };
}

function categoryOf(resource) {
  return inferredCategory(resource) || resource.ai_analysis?.category || resource.raw_data?.category || 'welfare';
}

function statusFromPeriod(resource) {
  const text = String(resource.raw_data?.applicationPeriod || '');
  const dates = periodDates(resource);
  if (dates.start || dates.end) {
    const now = new Date();
    if (dates.start && now < dates.start) return 'upcoming';
    if (dates.end && now > dates.end) return 'closed';
    return 'open';
  }
  if (/상시|수시|연중/.test(text) || resource.always_open || resource.application_status === 'always') return 'always';
  if (['open', 'upcoming', 'closed'].includes(resource.application_status)) return resource.application_status;
  return 'unknown';
}

function dateFrom(value, endOfDay = false) {
  if (!value) return null;
  const match = String(value).match(/(20\d{2})\D*?(\d{1,2})\D*?(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function periodDates(resource) {
  const text = String(resource.raw_data?.applicationPeriod || '');
  const parsed = [...text.matchAll(/(20\d{2})\D*?(\d{1,2})\D*?(\d{1,2})/g)]
    .map(([, y, m, d]) => `${y}-${m}-${d}`);
  return {
    start: dateFrom(resource.application_starts_at || parsed[0]),
    end: dateFrom(resource.application_ends_at || parsed[1] || (parsed.length === 1 ? parsed[0] : null), true)
  };
}

function isoDate(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function koreanDate(date) {
  return date ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일` : '';
}

function periodInfo(resource) {
  const dates = periodDates(resource);
  const status = statusFromPeriod(resource);
  const label = status === 'always' ? '상시 모집'
    : dates.start && dates.end ? `${koreanDate(dates.start)} ~ ${koreanDate(dates.end)}`
    : dates.end ? `${koreanDate(dates.end)} 마감`
    : dates.start ? `${koreanDate(dates.start)}부터` : '';
  return { status, startsAt: isoDate(dates.start), endsAt: isoDate(dates.end), label };
}

function analyzedEligibility(resource, profile) {
  const ai = resource.ai_analysis;
  if (eligibility(resource, profile).result === 'unlikely') return false;
  if (!ai || ai.confidence < .55) return basicEligibility(resource, profile);
  if (ai.recommended === false) return false;
  if (Number(ai.practical_value) < 4) return false;
  const sourceStatus = statusFromPeriod(resource);
  const applicationStatus = sourceStatus === 'unknown' ? ai.application_status : sourceStatus;
  if (!['open', 'always'].includes(applicationStatus)) return false;
  const region = String(profile.region || '');
  if (!ai.nationwide && region && (!ai.target_regions?.length || !ai.target_regions.some(value => String(value).includes(region) || region.includes(String(value))))) return false;
  const userMin = numberOrNull(profile.ageMin) || numberOrNull(profile.age);
  const userMax = numberOrNull(profile.ageMax) || numberOrNull(profile.age);
  if (ai.age_max && userMin && userMin > ai.age_max) return false;
  if (ai.age_min && userMax && userMax < ai.age_min) return false;
  if (profile.education && ai.education_statuses?.length && !ai.education_statuses.includes(profile.education)) return false;
  if (profile.employment && ai.employment_statuses?.length && !ai.employment_statuses.includes(profile.employment)) return false;
  return true;
}

function isActionable(resource) {
  const ai = resource.ai_analysis || {};
  const text = searchableText(resource);
  // Institutions need a dedicated nearby-help UI with address/phone. A generic
  // organization homepage is not an actionable policy application.
  if (resource.kind === 'institution') return false;
  if (!hasConcreteAction(resource)) return false;
  if (ai.benefit_type === 'event') return false;
  if (/기념행사|축제|정책 제안 행사|서포터즈|위원회 모집|포털.*운영|sns.*운영|채널 운영|정보.*통합 제공|공간 운영사업/.test(text.toLowerCase())) return false;
  return true;
}

function matchesRequestedCategory(resource, categories, showAll) {
  if (showAll) return true;
  const category = categoryOf(resource);
  if (!categories.includes(category)) return false;
  const text = searchableText(resource);
  if (category === 'counseling' && /취업|구직|일자리|채용|면접|창업/.test(text) && !/정신건강|심리|마음건강|우울|불안|고립|은둔/.test(text)) return false;
  return true;
}

function basicEligibility(resource, profile) {
  if (eligibility(resource, profile).result === 'unlikely') return false;
  return isActionable(resource) && ['open', 'always'].includes(statusFromPeriod(resource));
}

const rankingSchema = {
  type: 'object', additionalProperties: false, required: ['selections'],
  properties: { selections: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['id','priority','reason'],
    properties: {
      id:{type:'string'}, priority:{type:'string',enum:['top','high','standard']}, reason:{type:'string'}
    }
  } } }
};

async function personalizedOrder(candidates, profile) {
  const fallback = [...candidates]
    .sort((a, b) => (b.ai_analysis?.practical_value || 0) - (a.ai_analysis?.practical_value || 0))
    .map((item,index)=>({...item,_priority:index===0?'top':index<3?'high':'standard',_reason:''}));
  if (!candidates.length || !process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const result = await callClaudeTool({
      name: 'rank_recommendations',
      description: '후보 중 사용자가 지금 실제로 신청·예약·지원받을 수 있고 요청 카테고리와 정확히 맞는 자료만 선별한다. 자가진단 신호에서 드러난 현재 어려움, 원하는 변화, 감당 가능한 행동 크기를 활용해 필요도와 실행 가능성을 함께 평가한다. 단순 기관·센터 소개, 홈페이지·포털·SNS 안내, 홍보·행사, 타 지역, 카테고리 오분류, 구체적 혜택이나 이용 방법이 없는 자료는 반환하지 않는다. 비슷한 지원만 반복하지 말고 현금·치료비·바우처·직접 상담·훈련 등 서로 다른 실질 혜택을 우선한다. 가장 적합한 하나만 top, 다음 최대 두 개만 high로 정하고 나머지는 standard로 정한다. 모든 후보를 반환할 필요가 없다. reason은 내부 검증용 한 문장으로 작성한다.',
      schema: rankingSchema,
      input: {
        profile,
        candidates: candidates.map(resource => ({
          id: resource.id, title: resource.title, summary: resource.summary,
          organization: resource.organization_name, action_url:directActionUrl(resource),
          application_method:resource.application_method, analysis: resource.ai_analysis
        }))
      },
      maxTokens: 1800
    });
    const byId = new Map(candidates.map(item => [item.id, item]));
    return (result.selections || []).map(selection => {
      const item=byId.get(selection.id);
      return item?{...item,_priority:selection.priority,_reason:selection.reason}:null;
    }).filter(Boolean);
  } catch (error) {
    console.error('맞춤 추천 정렬 실패:', error);
    return fallback;
  }
}

async function fetchAllResources(url, key, query, maxRows = 10000) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const params = new URLSearchParams({
      select: '*', status: 'eq.published', limit: String(pageSize), offset: String(offset),
      order: 'verified_at.desc.nullslast,title.asc'
    });
    if (query) params.set('or', `(title.ilike.*${query.replace(/[,*()]/g, '')}*,summary.ilike.*${query.replace(/[,*()]/g, '')}*)`);
    const response = await fetch(`${url}/rest/v1/resources?${params}`, { headers: supabaseHeaders(key) });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function countBy(rows, valueFor) {
  return rows.reduce((counts, row) => {
    const value = valueFor(row) || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function supabaseHeaders(key) {
  const headers = { apikey: key };
  // Legacy anon keys are JWTs and can also be used as a Bearer token.
  // New sb_publishable_* keys authenticate through the apikey header only.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 받아요' });
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Supabase 공개 연결이 설정되지 않았어요' });
  const categories = String(req.query.category || 'all').split(',').map(value => value.trim()).filter(Boolean);
  const showAll = !categories.length || categories.includes('all');
  const query = String(req.query.q || '').trim().slice(0, 80);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  let rows;
  try {
    rows = await fetchAllResources(url.replace(/\/$/, ''), key, query);
  } catch (error) {
    console.error('정책 DB 조회 실패:', error);
    return res.status(502).json({ error: '정책 DB 조회에 실패했어요' });
  }
  const profile = {
    age: req.query.age, ageMin: req.query.ageMin, ageMax: req.query.ageMax, region: req.query.region,
    education: req.query.education, employment: req.query.employment, income: req.query.income,
    housing:req.query.housing,
    needs: String(req.query.needs || '').split(',').filter(Boolean), jobs: String(req.query.jobs || '').split(',').filter(Boolean),
    journeyLevel:req.query.journeyLevel, journeyBarrier:req.query.journeyBarrier,
    journeyVision:req.query.journeyVision, actionSize:req.query.actionSize,
    assessmentSignals:String(req.query.signals||'').split('|').filter(Boolean).slice(0,40)
  };
  const categoryMatches = rows.filter(resource => matchesRequestedCategory(resource, categories, showAll));
  const actionableMatches = categoryMatches.filter(isActionable);
  const profileMatches = actionableMatches.filter(resource => eligibility(resource, profile).result !== 'unlikely');
  const openMatches = profileMatches.filter(resource => ['open','always'].includes(statusFromPeriod(resource)));
  const analyzedMatches = openMatches.filter(resource => resource.ai_analysis ? analyzedEligibility(resource, profile) : basicEligibility(resource, profile));
  const candidates = analyzedMatches
    .slice(0, Math.min(limit, 100));
  const ranked = await personalizedOrder(candidates, profile);
  const items = ranked.map(resource => {
    const result = eligibility(resource, profile);
    const period = periodInfo(resource);
    return {
      id: resource.id, title: resource.title, summary: resource.summary,
      support: resource.support_details, benefitSummary: resource.ai_analysis?.benefit_summary,
      presentation: resource.ai_analysis ? {
        version:resource.ai_analysis.presentation_version||null,
        summary:resource.ai_analysis.display_summary||'',
        benefits:resource.ai_analysis.benefit_items||[],
        eligibility:resource.ai_analysis.eligibility_items||[],
        documents:resource.ai_analysis.document_items||[],
        costs:resource.ai_analysis.cost_rows||[],
        notes:resource.ai_analysis.important_notes||[]
      } : null,
      organization: resource.organization_name,
      category: categoryOf(resource), applicationUrl: directActionUrl(resource), contact:resource.contact,
      referenceUrl: resource.reference_url, applicationMethod: resource.application_method,
      requiredDocuments: resource.required_documents, applicationStatus: period.status,
      alwaysOpen: period.status === 'always', startsAt: period.startsAt, endsAt: period.endsAt,
      periodText: period.label || resource.raw_data?.applicationPeriod || '',
      qualification: resource.details || '', eligibility: result,
      source: resource.source_key, priority:resource._priority||'standard'
    };
  });
  return res.status(200).json({
    total: items.length,
    resources: items,
    meta: {
      databaseRows: rows.length,
      categoryMatches: categoryMatches.length,
      nonActionable: categoryMatches.length - actionableMatches.length,
      actionableMatches: actionableMatches.length,
      profileMatches: profileMatches.length,
      openMatches: openMatches.length,
      analyzedMatches: analyzedMatches.length,
      aiSelected: items.length,
      rejected: {
        category: rows.length - categoryMatches.length,
        notActionable: categoryMatches.length - actionableMatches.length,
        profile: actionableMatches.length - profileMatches.length,
        recruitmentPeriod: profileMatches.length - openMatches.length,
        analysis: openMatches.length - analyzedMatches.length,
        ranking: candidates.length - items.length
      },
      eligible: candidates.length,
      sources: countBy(rows, resource => resource.source_key),
      categories: countBy(rows, categoryOf)
    }
  });
}
