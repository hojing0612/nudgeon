import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: node script.mjs input.csv output.sql');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const regionMap = {
  서울특별시:['서울','11'], 부산광역시:['부산','26'], 대구광역시:['대구','27'], 인천광역시:['인천','28'],
  광주광역시:['광주','29'], 대전광역시:['대전','30'], 울산광역시:['울산','31'], 세종특별자치시:['세종','36'],
  경기도:['경기','41'], 강원특별자치도:['강원','51'], 강원도:['강원','51'], 충청북도:['충북','43'],
  충청남도:['충남','44'], 전북특별자치도:['전북','52'], 전라북도:['전북','52'], 전라남도:['전남','46'],
  경상북도:['경북','47'], 경북:['경북','47'], 경상남도:['경남','48'], 제주특별자치도:['제주','50']
};

const source = new TextDecoder('euc-kr').decode(fs.readFileSync(input)).replace(/^\uFEFF/, '');
const [headers, ...body] = parseCsv(source).filter(row => row.some(cell => cell.trim()));
const index = Object.fromEntries(headers.map((name, i) => [name.trim(), i]));
const clean = value => String(value || '').trim().replace(/\s+/g, ' ');

const records = body.map(row => {
  const name = clean(row[index['기관명']]);
  const address = clean(row[index['주소']]);
  const [regionName, regionCode] = Object.entries(regionMap).find(([prefix]) => address.startsWith(prefix))?.[1] || ['', ''];
  const jurisdiction = clean(row[index['관할지역']]);
  const grade = clean(row[index['전년도기관평가등급']]);
  const highWageRate = clean(row[index['월급여 229만원 이상 일자리 취업률']]);
  const employmentRate = clean(row[index['전년도 취업률']]);
  const phone = clean(row[index['전화번호']]);
  const externalId = crypto.createHash('sha256').update(`${name}|${address}`).digest('hex').slice(0, 24);
  const details = [jurisdiction && `관할지역: ${jurisdiction}`, grade && `전년도 기관평가: ${grade}`, highWageRate && `월급여 229만원 이상 일자리 취업률: ${highWageRate}`, employmentRate && `전년도 취업률: ${employmentRate}`].filter(Boolean).join('\n');
  return {
    external_id: externalId,
    title: name,
    summary: `${regionName || '지역'} 국민취업지원제도 운영기관으로 취업상담, 취업역량 진단, 직업훈련·일경험 연계를 지원합니다.`,
    details,
    organization_name: name,
    contact: phone,
    region_codes: regionCode ? [regionCode] : [],
    raw_data: {
      category:'career', address, postalCode:clean(row[index['우편번호']]), fax:clean(row[index['팩스번호']]),
      jurisdiction, evaluationGrade:grade, highWageEmploymentRate:highWageRate, employmentRate
    },
    ai_analysis: {
      id:externalId, category:'career', benefit_type:'employment',
      benefit_summary:'취업상담, 취업역량 진단, 직업훈련·일경험 연계를 받을 수 있는 국민취업지원제도 운영기관',
      practical_value:6, target_regions:regionName ? [regionName] : [], nationwide:false,
      age_min:null, age_max:null, education_statuses:[], employment_statuses:[], job_fields:[],
      application_status:'always', application_start:null, application_end:null,
      recommended:true, confidence:0.98, source_evidence:['한국고용정보원 국민취업지원제도 운영기관정보 2026-03-03']
    }
  };
}).filter(record => record.title && record.raw_data.address);

const unique = [...new Map(records.map(record => [record.external_id, record])).values()];
const json = JSON.stringify(unique).replaceAll("'", "''");
const sql = `-- Generated from 한국고용정보원_국민취업지원제도 운영기관정보_20260303.csv
-- ${unique.length} institutions; source update 2026-03-03
WITH payload AS (
  SELECT * FROM jsonb_to_recordset('${json}'::jsonb) AS x(
    external_id text, title text, summary text, details text, organization_name text,
    contact text, region_codes text[], raw_data jsonb, ai_analysis jsonb
  )
)
INSERT INTO public.resources (
  external_id, source_key, kind, status, title, summary, details, support_details,
  organization_name, application_url, reference_url, contact, application_method,
  application_status, always_open, online_available, cost_free, region_codes, keywords,
  raw_data, source_updated_at, verified_at, ai_analysis, ai_analyzed_at
)
SELECT external_id, 'work24-employment-center', 'institution', 'published', title, summary, details,
  '취업상담, 취업역량 진단, 직업훈련 연계, 일경험 및 취업지원 서비스', organization_name,
  'https://www.work24.go.kr/cm/main.do', 'https://www.data.go.kr/data/15118499/fileData.do', contact,
  '전화 또는 방문 문의', 'always', true, false, true, region_codes,
  ARRAY['국민취업지원제도','취업상담','직업훈련','일경험'], raw_data,
  '2026-03-03T00:00:00+09:00'::timestamptz, now(), ai_analysis, now()
FROM payload
ON CONFLICT (source_key, external_id) DO UPDATE SET
  title=EXCLUDED.title, summary=EXCLUDED.summary, details=EXCLUDED.details,
  organization_name=EXCLUDED.organization_name, contact=EXCLUDED.contact,
  region_codes=EXCLUDED.region_codes, raw_data=EXCLUDED.raw_data,
  ai_analysis=EXCLUDED.ai_analysis, ai_analyzed_at=EXCLUDED.ai_analyzed_at,
  source_updated_at=EXCLUDED.source_updated_at, verified_at=EXCLUDED.verified_at,
  status='published', application_status='always', always_open=true;

INSERT INTO public.resource_category_links (resource_id, category_id, is_primary, confidence)
SELECT r.id, c.id, true, 1.000
FROM public.resources r
JOIN public.resource_categories c ON c.slug='career'
WHERE r.source_key='work24-employment-center'
ON CONFLICT (resource_id, category_id) DO UPDATE SET is_primary=true, confidence=1.000;
`;

fs.mkdirSync(path.dirname(output), { recursive:true });
fs.writeFileSync(output, sql);
const stats = {
  inputRows:body.length, validRows:records.length, uniqueRows:unique.length,
  missingRegion:unique.filter(record => !record.region_codes.length).length,
  missingPhone:unique.filter(record => !record.contact).length,
  regions:Object.fromEntries(Object.entries(regionMap).map(([, [name, code]]) => [name, unique.filter(record => record.region_codes.includes(code)).length]).filter(([, count]) => count)),
  output
};
console.log(JSON.stringify(stats));
