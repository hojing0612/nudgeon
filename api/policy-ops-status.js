const DAY = 86_400_000;

function text(value) {
  return String(value || '').trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTitle(value) {
  return text(value).toLowerCase()
    .replace(/20\d{2}|\d+기|\d+차|\d+회차/g, ' ')
    .replace(/[^가-힣a-z0-9]/g, '');
}

function validActionUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function diagnosePolicies(rows, now = new Date()) {
  const titleCounts = new Map();
  for (const row of rows) {
    const key = normalizeTitle(row.title);
    if (key) titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  }

  const issues = [];
  const counts = { total: rows.length, active: 0, expiringSoon: 0, closed: 0, missing: 0, badLink: 0, duplicate: 0 };

  for (const row of rows) {
    const rowIssues = [];
    const end = parseDate(row.application_ends_at);
    const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / DAY) : null;
    const status = text(row.application_status).toLowerCase();
    const closed = status === 'closed' || (end && daysLeft < 0);
    const active = !closed && row.status === 'published';
    const soon = active && daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
    const missingFields = [
      !text(row.title) && '정책명',
      !text(row.organization_name) && '기관명',
      !(text(row.summary) || text(row.support_details) || text(row.details)) && '지원 내용',
      !(text(row.application_method) || text(row.contact) || validActionUrl(row.application_url) || validActionUrl(row.reference_url)) && '신청 방법'
    ].filter(Boolean);
    const suppliedUrls = [row.application_url, row.reference_url].filter(Boolean);
    const badLink = suppliedUrls.some(value => !validActionUrl(value));
    const duplicate = Boolean(normalizeTitle(row.title) && titleCounts.get(normalizeTitle(row.title)) > 1);

    if (active) counts.active += 1;
    if (closed) { counts.closed += 1; rowIssues.push('마감'); }
    if (soon) { counts.expiringSoon += 1; rowIssues.push(`마감 임박 ${daysLeft}일`); }
    if (missingFields.length) { counts.missing += 1; rowIssues.push(`정보 누락: ${missingFields.join(', ')}`); }
    if (badLink) { counts.badLink += 1; rowIssues.push('링크 형식 이상'); }
    if (duplicate) { counts.duplicate += 1; rowIssues.push('정책명 중복'); }

    if (rowIssues.length) {
      issues.push({
        id: row.id,
        title: text(row.title) || '이름 없는 정책',
        organization: text(row.organization_name) || '기관 미입력',
        source: text(row.source_key) || '출처 미입력',
        verifiedAt: row.verified_at || null,
        applicationEndsAt: row.application_ends_at || null,
        issues: rowIssues
      });
    }
  }

  issues.sort((a, b) => {
    const weight = value => value.issues.reduce((sum, issue) => sum + (issue.startsWith('정보 누락') || issue === '링크 형식 이상' ? 4 : issue === '마감' ? 3 : 1), 0);
    return weight(b) - weight(a) || a.title.localeCompare(b.title, 'ko');
  });

  const verifiedDates = rows.map(row => parseDate(row.verified_at)).filter(Boolean);
  return {
    checkedAt: now.toISOString(),
    lastVerifiedAt: verifiedDates.length ? new Date(Math.max(...verifiedDates.map(date => date.getTime()))).toISOString() : null,
    counts,
    issues
  };
}

function supabaseHeaders(key) {
  const headers = { apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function fetchRows(url, key) {
  const fields = 'id,title,summary,details,support_details,organization_name,application_url,reference_url,application_method,contact,application_status,application_ends_at,status,source_key,verified_at';
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/resources?select=${fields}&limit=10000&order=verified_at.desc.nullslast`, {
    headers: supabaseHeaders(key)
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 받아요' });
  const configuredKey = process.env.ADMIN_DASHBOARD_KEY;
  if (!configuredKey) return res.status(503).json({ error: '운영 대시보드 키가 아직 설정되지 않았어요' });
  if (req.headers['x-admin-key'] !== configuredKey) return res.status(401).json({ error: '관리자 키가 올바르지 않아요' });

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: '정책 데이터 연결이 설정되지 않았어요' });

  try {
    const rows = await fetchRows(url, key);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(diagnosePolicies(rows));
  } catch (error) {
    console.error('정책 운영 상태 확인 실패:', error);
    return res.status(500).json({ error: '정책 데이터 상태를 확인하지 못했어요' });
  }
}
