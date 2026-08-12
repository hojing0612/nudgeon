const YOUTH_POLICY_API_URL = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePolicy(policy) {
  return {
    id: asText(policy.plcyNo),
    title: asText(policy.plcyNm),
    summary: asText(policy.plcyExplnCn),
    category: asText(policy.lclsfNm),
    subcategory: asText(policy.mclsfNm),
    support: asText(policy.plcySprtCn),
    regionCodes: asText(policy.zipCd).split(',').map(code => code.trim()).filter(Boolean),
    minAge: asNumber(policy.sprtTrgtMinAge),
    maxAge: asNumber(policy.sprtTrgtMaxAge),
    applicationPeriod: asText(policy.aplyYmd),
    applicationMethod: asText(policy.plcyAplyMthdCn),
    applicationUrl: asText(policy.aplyUrlAddr),
    qualification: asText(policy.addAplyQlfcCndCn),
    restrictions: asText(policy.ptcpPrpTrgtCn),
    organization: asText(policy.operInstCdNm) || asText(policy.sprvsnInstCdNm)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 받아요' });
  }

  const apiKey = process.env.YOUTH_POLICY_API_KEY;
  if (!apiKey) {
    console.error('YOUTH_POLICY_API_KEY 환경변수가 없어요');
    return res.status(500).json({ error: '서버에 온통청년 API 키가 설정되지 않았어요' });
  }

  const keyword = asText(req.query.keyword).slice(0, 100);
  const region = asText(req.query.region).slice(0, 100);
  const category = asText(req.query.category).slice(0, 100);
  const requestedSize = Number.parseInt(req.query.pageSize, 10);
  const pageSize = Number.isFinite(requestedSize)
    ? Math.min(Math.max(requestedSize, 1), 30)
    : 20;

  const params = new URLSearchParams({
    apiKeyNm: apiKey,
    pageNum: '1',
    pageSize: String(pageSize),
    pageType: '1',
    rtnType: 'json'
  });

  if (keyword) params.set('plcyKywdNm', keyword);
  if (region) params.set('zipCd', region);
  if (category) params.set('lclsfNm', category);

  try {
    const response = await fetch(`${YOUTH_POLICY_API_URL}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();

    if (!response.ok || !data.result) {
      console.error('온통청년 API 오류:', response.status, data.resultMessage);
      return res.status(502).json({ error: '온통청년 정책 조회에 실패했어요' });
    }

    const rawPolicies = Array.isArray(data.result.youthPolicyList)
      ? data.result.youthPolicyList
      : [];

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      total: Number(data.result.pagging?.totCount) || rawPolicies.length,
      policies: rawPolicies.map(normalizePolicy).filter(policy => policy.id && policy.title)
    });
  } catch (error) {
    console.error('온통청년 정책 조회 오류:', error);
    return res.status(502).json({ error: '정책 데이터를 가져오는 중 문제가 생겼어요' });
  }
}
