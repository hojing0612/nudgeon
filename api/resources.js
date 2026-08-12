function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  // 온통청년은 법정동 숫자 코드를 제공한다. 현재 프로필은 시·도 이름을 받으므로
  // 정확한 코드 매핑 전에는 불일치로 탈락시키지 않고 추가 확인으로 남긴다.
  if (resource.region_codes?.length && !/^\d{2,5}$/.test(userRegion)) missing.push('세부 거주 지역');
  else if (resource.region_codes?.length && userRegion && !resource.region_codes.some(code => code.startsWith(userRegion.slice(0, 2)))) reasons.push('거주 지역');
  const hasComplex = Boolean(raw.incomeType || raw.incomeDetails || raw.educationCodes || raw.employmentCodes || resource.details);
  if (reasons.length) return { result: 'unlikely', label: '현재 조건과 맞지 않을 수 있어요', reasons, missing };
  if (missing.length || hasComplex) return { result: 'needs_review', label: '추가 확인이 필요해요', reasons, missing };
  return { result: 'likely', label: '자격 가능성이 높아요', reasons, missing };
}

function categoryOf(resource) {
  return resource.raw_data?.category || 'welfare';
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
  const response = await fetch(`${url}/rest/v1/resources?${params}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) return res.status(502).json({ error: '정책 DB 조회에 실패했어요' });
  const rows = await response.json();
  const profile = { age: req.query.age, region: req.query.region };
  const items = rows
    .filter(resource => category === 'all' || categoryOf(resource) === category)
    .map(resource => ({
      id: resource.id, title: resource.title, summary: resource.summary,
      support: resource.support_details, organization: resource.organization_name,
      category: categoryOf(resource), applicationUrl: resource.application_url,
      referenceUrl: resource.reference_url, applicationMethod: resource.application_method,
      requiredDocuments: resource.required_documents, applicationStatus: resource.application_status,
      alwaysOpen: resource.always_open, endsAt: resource.application_ends_at,
      periodText: resource.raw_data?.applicationPeriod || '',
      qualification: resource.details || '', eligibility: eligibility(resource, profile),
      source: resource.source_key
    }));
  return res.status(200).json({ total: items.length, resources: items });
}
