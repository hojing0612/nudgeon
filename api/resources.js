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

function textIncludesAny(value, words) {
  const text = String(value || '').toLowerCase();
  return words.some(word => text.includes(word));
}

function eligibility(resource, profile) {
  const reasons = [];
  const missing = [];
  const raw = resource.raw_data || {};
  const age = numberOrNull(profile.age);
  const min = numberOrNull(raw.minAge);
  const max = numberOrNull(raw.maxAge);
  if (min || max) {
    if (!age) missing.push('나이');
    else if ((min && age < min) || (max && age > max)) reasons.push(`연령 조건 ${min || ''}~${max || ''}세`);
  }
  const userRegion = String(profile.region || '');
  const regionPrefix = REGION_PREFIX[userRegion] || (/^\d{2,5}$/.test(userRegion) ? userRegion.slice(0, 2) : '');
  const regionCodes = (resource.region_codes || []).map(String).filter(Boolean);
  const nationwide = !regionCodes.length || regionCodes.some(code => ['00', '0', '전국'].includes(code));
  if (!nationwide && regionPrefix && !regionCodes.some(code => code.startsWith(regionPrefix))) reasons.push('거주 지역');
  else if (!nationwide && !regionPrefix) missing.push('거주 지역');

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
  return resource.raw_data?.category || 'welfare';
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
  const category = String(req.query.category || 'all');
  const query = String(req.query.q || '').trim().slice(0, 80);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const params = new URLSearchParams({ select: '*', status: 'eq.published', limit: String(limit), order: 'verified_at.desc.nullslast,title.asc' });
  if (query) params.set('or', `(title.ilike.*${query.replace(/[,*()]/g, '')}*,summary.ilike.*${query.replace(/[,*()]/g, '')}*)`);
  const response = await fetch(`${url}/rest/v1/resources?${params}`, { headers: supabaseHeaders(key) });
  if (!response.ok) {
    console.error('정책 DB 조회 실패:', response.status, (await response.text()).slice(0, 500));
    return res.status(502).json({ error: '정책 DB 조회에 실패했어요' });
  }
  const rows = await response.json();
  const profile = {
    age: req.query.age, region: req.query.region,
    education: req.query.education, employment: req.query.employment
  };
  const items = rows
    .filter(resource => category === 'all' || categoryOf(resource) === category)
    .map(resource => ({ resource, eligibility: eligibility(resource, profile) }))
    .filter(({ resource, eligibility: result }) => result.result !== 'unlikely' && resource.application_status !== 'closed')
    .map(({ resource, eligibility: result }) => ({
      id: resource.id, title: resource.title, summary: resource.summary,
      support: resource.support_details, organization: resource.organization_name,
      category: categoryOf(resource), applicationUrl: resource.application_url,
      referenceUrl: resource.reference_url, applicationMethod: resource.application_method,
      requiredDocuments: resource.required_documents, applicationStatus: resource.application_status,
      alwaysOpen: resource.always_open, endsAt: resource.application_ends_at,
      periodText: resource.raw_data?.applicationPeriod || '',
      qualification: resource.details || '', eligibility: result,
      source: resource.source_key
    }));
  return res.status(200).json({ total: items.length, resources: items });
}
