function monthRangeUtc(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { startingAt: start.toISOString(), endingAt: now.toISOString() };
}

function numericAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function summarizeCostReport(pages = []) {
  let amountCents = 0;
  for (const page of pages) {
    for (const bucket of page?.data || []) {
      for (const result of bucket?.results || []) amountCents += numericAmount(result?.amount);
    }
  }
  return {
    amountCents,
    amountUsd: amountCents / 100
  };
}

export { monthRangeUtc };

async function fetchMonthlyCost(adminKey, workspaceId, now = new Date()) {
  const { startingAt, endingAt } = monthRangeUtc(now);
  const pages = [];
  let page = '';

  for (let requestCount = 0; requestCount < 10; requestCount += 1) {
    const query = new URLSearchParams({
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: '1d',
      limit: '31'
    });
    if (workspaceId) query.append('workspace_ids[]', workspaceId);
    if (page) query.set('page', page);

    const response = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${query}`, {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': adminKey,
        'User-Agent': 'NudgeOn/1.0 cost-dashboard'
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Anthropic Cost API ${response.status}`);
      error.status = response.status;
      throw error;
    }
    pages.push(body);
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }

  return {
    ...summarizeCostReport(pages),
    startingAt,
    endingAt,
    workspaceFiltered: Boolean(workspaceId)
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 받아요' });

  const dashboardKey = process.env.ADMIN_DASHBOARD_KEY;
  if (!dashboardKey) return res.status(503).json({ error: '운영 대시보드 키가 아직 설정되지 않았어요' });
  if (req.headers['x-admin-key'] !== dashboardKey) return res.status(401).json({ error: '관리자 키가 올바르지 않아요' });

  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return res.status(200).json({
      configured: false,
      status: 'not_configured',
      message: 'Anthropic Admin API 키를 등록하면 실제 사용액을 확인할 수 있어요.'
    });
  }

  try {
    const cost = await fetchMonthlyCost(adminKey, process.env.ANTHROPIC_NUDGEON_WORKSPACE_ID);
    return res.status(200).json({
      configured: true,
      status: 'connected',
      source: 'anthropic_cost_api',
      currency: 'USD',
      freshnessMinutes: 5,
      ...cost
    });
  } catch (error) {
    console.error('Anthropic 비용 확인 실패:', error);
    const permissionError = [401, 403].includes(error.status);
    return res.status(200).json({
      configured: true,
      status: permissionError ? 'permission_error' : 'error',
      message: permissionError
        ? 'Admin API 키 또는 조직 권한을 확인해 주세요.'
        : 'Anthropic 비용 데이터를 잠시 불러오지 못했어요.'
    });
  }
}
