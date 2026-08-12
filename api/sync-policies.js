const YOUTH_API = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';

function categoryFor(policy) {
  const text = `${policy.lclsfNm || ''} ${policy.mclsfNm || ''} ${policy.plcyNm || ''} ${policy.plcyKywdNm || ''}`.toLowerCase();
  if (/상담|마음|심리|정신건강|고립|은둔/.test(text)) return 'counseling';
  if (/주거|주택|월세|전세|임대|청약|lh|sh/.test(text)) return 'housing';
  if (/취업|구직|일자리|창업|직장|채용|도전지원/.test(text)) return 'career';
  if (/교육|훈련|강의|세미나|자격|역량/.test(text)) return 'education';
  if (/금융|법률|채무|대출|노동/.test(text)) return 'finance-legal';
  if (/문화|모임|활동|참여|봉사|커뮤니티/.test(text)) return 'community';
  return 'welfare';
}

function periodStatus(policy) {
  const code = String(policy.aplyPrdSeCd || '');
  const text = String(policy.aplyYmd || '');
  if (code === '0057002') return { status: 'always', always: true };
  if (code === '0057003') return { status: 'closed', always: false };
  if (/상시|수시/.test(text)) return { status: 'always', always: true };
  const dates = [...text.matchAll(/(20\d{2})[.\-/년]?\s*(\d{1,2})[.\-/월]?\s*(\d{1,2})/g)]
    .map(([, y, m, d]) => new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59))
    .filter(date => !Number.isNaN(date.getTime()));
  if (dates.length >= 2) {
    const now = new Date();
    if (now < dates[0]) return { status: 'upcoming', always: false };
    if (now <= dates[dates.length - 1]) return { status: 'open', always: false };
    return { status: 'closed', always: false };
  }
  return { status: 'unknown', always: false };
}

function resourceFrom(policy) {
  const period = periodStatus(policy);
  return {
    external_id: String(policy.plcyNo || ''),
    source_key: 'youthcenter',
    kind: 'policy',
    status: 'published',
    title: policy.plcyNm || '이름 없는 정책',
    summary: policy.plcyExplnCn || null,
    details: policy.addAplyQlfcCndCn || null,
    support_details: policy.plcySprtCn || null,
    organization_name: policy.operInstCdNm || policy.sprvsnInstCdNm || null,
    application_url: policy.aplyUrlAddr || null,
    reference_url: policy.refUrlAddr1 || policy.refUrlAddr2 || null,
    application_method: policy.plcyAplyMthdCn || null,
    required_documents: policy.sbmsnDcmntCn || null,
    application_status: period.status,
    always_open: period.always,
    region_codes: String(policy.zipCd || '').split(',').map(v => v.trim()).filter(Boolean),
    keywords: String(policy.plcyKywdNm || '').split(',').map(v => v.trim()).filter(Boolean),
    source_updated_at: policy.lastMdfcnDt || null,
    verified_at: new Date().toISOString(),
    raw_data: {
      minAge: Number(policy.sprtTrgtMinAge) || null,
      maxAge: Number(policy.sprtTrgtMaxAge) || null,
      applicationPeriod: policy.aplyYmd || null,
      incomeType: policy.earnCndSeCd || null,
      incomeMin: policy.earnMinAmt || null,
      incomeMax: policy.earnMaxAmt || null,
      incomeDetails: policy.earnEtcCn || null,
      educationCodes: policy.schoolCd || null,
      employmentCodes: policy.jobCd || null,
      category: categoryFor(policy)
    }
  };
}

async function supabase(path, key, options = {}) {
  const url = process.env.VITE_SUPABASE_URL;
  const authHeaders = { apikey: key };
  // New sb_secret_* keys use the apikey header. Only legacy JWT service keys
  // are valid Bearer tokens.
  if (!key.startsWith('sb_')) authHeaders.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : [];
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET 또는 POST 요청만 받아요' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: '동기화 권한이 없어요' });
  }
  const youthKey = process.env.YOUTH_POLICY_API_KEY;
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!youthKey || !dbKey || !process.env.VITE_SUPABASE_URL) {
    return res.status(500).json({ error: '동기화 환경변수가 설정되지 않았어요' });
  }

  const run = await supabase('ingestion_runs', dbKey, {
    method: 'POST', body: JSON.stringify({ source_key: 'youthcenter', status: 'running' })
  });
  const runId = run[0]?.id;
  let fetched = 0;
  try {
    const firstParams = new URLSearchParams({ apiKeyNm: youthKey, pageNum: '1', pageSize: '100', pageType: '1', rtnType: 'json' });
    const first = await fetch(`${YOUTH_API}?${firstParams}`).then(r => r.json());
    const total = Number(first.result?.pagging?.totCount) || 0;
    const all = [...(first.result?.youthPolicyList || [])];
    for (let page = 2; page <= Math.ceil(total / 100); page += 1) {
      const params = new URLSearchParams({ apiKeyNm: youthKey, pageNum: String(page), pageSize: '100', pageType: '1', rtnType: 'json' });
      const data = await fetch(`${YOUTH_API}?${params}`).then(r => r.json());
      all.push(...(data.result?.youthPolicyList || []));
    }
    fetched = all.length;
    const resources = all.map(resourceFrom).filter(r => r.external_id);
    for (let i = 0; i < resources.length; i += 100) {
      await supabase('resources?on_conflict=source_key,external_id', dbKey, {
        method: 'POST', body: JSON.stringify(resources.slice(i, i + 100))
      });
    }
    if (runId) await supabase(`ingestion_runs?id=eq.${runId}`, dbKey, {
      method: 'PATCH', body: JSON.stringify({ status: 'succeeded', fetched_count: fetched, updated_count: resources.length, finished_at: new Date().toISOString() })
    });
    return res.status(200).json({ success: true, fetched, stored: resources.length });
  } catch (error) {
    console.error('정책 동기화 실패:', error);
    if (runId) await supabase(`ingestion_runs?id=eq.${runId}`, dbKey, {
      method: 'PATCH', body: JSON.stringify({ status: 'failed', fetched_count: fetched, error_count: 1, error_summary: String(error.message).slice(0, 1000), finished_at: new Date().toISOString() })
    }).catch(() => {});
    return res.status(500).json({ error: '정책 동기화에 실패했어요' });
  }
}
