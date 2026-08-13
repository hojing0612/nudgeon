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

function regionsInText(resource) {
  const text = searchableText(resource);
  return REGION_NAMES.filter(region => text.includes(region));
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
  if (!nationwide && regionPrefix && regionCodes.length && !codeMatch) reasons.push('거주 지역');
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
  return resource.ai_analysis?.category || resource.raw_data?.category || 'welfare';
}

function statusFromPeriod(resource) {
  if (resource.always_open || resource.application_status === 'always') return 'always';
  if (['open', 'upcoming', 'closed'].includes(resource.application_status)) return resource.application_status;
  const text = String(resource.raw_data?.applicationPeriod || '');
  if (/상시|수시/.test(text)) return 'always';
  const dates = [...text.matchAll(/(20\d{2})[.\-/년]?\s*(\d{1,2})[.\-/월]?\s*(\d{1,2})/g)]
    .map(([, y, m, d]) => new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59))
    .filter(date => !Number.isNaN(date.getTime()));
  if (dates.length < 2) return 'unknown';
  const now = new Date();
  if (now < dates[0]) return 'upcoming';
  return now <= dates[dates.length - 1] ? 'open' : 'closed';
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
  if (ai.benefit_type === 'event') return false;
  if (/기념행사|축제|정책 제안 행사|서포터즈|위원회 모집/.test(text)) return false;
  return true;
}

function basicEligibility(resource, profile) {
  if (eligibility(resource, profile).result === 'unlikely') return false;
  return isActionable(resource) && ['open', 'always'].includes(statusFromPeriod(resource));
}

const rankingSchema = {
  type: 'object', additionalProperties: false, required: ['recommended_ids'],
  properties: { recommended_ids: { type: 'array', items: { type: 'string' } } }
};

async function personalizedOrder(candidates, profile) {
  const fallback = [...candidates].sort((a, b) => (b.ai_analysis?.practical_value || 0) - (a.ai_analysis?.practical_value || 0));
  if (!candidates.length || !process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const result = await callClaudeTool({
      name: 'rank_recommendations',
      description: '이미 필수 자격 조건을 통과한 정책만 사용자의 필요와 희망 직무에 맞춰 유용한 순서로 정렬한다. 모든 후보 ID를 중복 없이 반환한다.',
      schema: rankingSchema,
      input: {
        profile,
        candidates: candidates.map(resource => ({
          id: resource.id, title: resource.title, summary: resource.summary,
          organization: resource.organization_name, analysis: resource.ai_analysis
        }))
      },
      maxTokens: 1800
    });
    const byId = new Map(candidates.map(item => [item.id, item]));
    const ordered = result.recommended_ids.map(id => byId.get(id)).filter(Boolean);
    const seen = new Set(ordered.map(item => item.id));
    return [...ordered, ...fallback.filter(item => !seen.has(item.id))];
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
    needs: String(req.query.needs || '').split(',').filter(Boolean), jobs: String(req.query.jobs || '').split(',').filter(Boolean)
  };
  const categoryMatches = rows.filter(resource => showAll || categories.includes(categoryOf(resource)));
  const nonActionable = categoryMatches.filter(resource => !isActionable(resource));
  const regionAndStatusMatches = categoryMatches
    .filter(resource => isActionable(resource))
    .filter(resource => resource.ai_analysis ? analyzedEligibility(resource, profile) : basicEligibility(resource, profile));
  const candidates = regionAndStatusMatches
    .slice(0, Math.min(limit, 100));
  const ranked = await personalizedOrder(candidates, profile);
  const items = ranked.map(resource => {
    const result = eligibility(resource, profile);
    return {
      id: resource.id, title: resource.title, summary: resource.summary,
      support: resource.support_details, benefitSummary: resource.ai_analysis?.benefit_summary,
      organization: resource.organization_name,
      category: categoryOf(resource), applicationUrl: resource.application_url,
      referenceUrl: resource.reference_url, applicationMethod: resource.application_method,
      requiredDocuments: resource.required_documents, applicationStatus: resource.application_status,
      alwaysOpen: resource.always_open, endsAt: resource.application_ends_at,
      periodText: resource.raw_data?.applicationPeriod || '',
      qualification: resource.details || '', eligibility: result,
      source: resource.source_key
    };
  });
  return res.status(200).json({
    total: items.length,
    resources: items,
    meta: {
      databaseRows: rows.length,
      categoryMatches: categoryMatches.length,
      nonActionable: nonActionable.length,
      eligible: candidates.length,
      sources: countBy(rows, resource => resource.source_key),
      categories: countBy(rows, categoryOf)
    }
  });
}