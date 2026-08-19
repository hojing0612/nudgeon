# NudgeOn

고립·은둔 청년이 자가진단에서 작은 행동, 사회적 리허설, 기관 연결까지 이어갈 수 있도록 만든 실행 지원 프로토타입입니다.

## 화면 구조

- `/` — 전체 5단계 여정 (`public/home.html`)
- `/rehearsal` — React 기반 사회적 리허설 (`src/`)
- `/api/chat` — AI 대화 API (`api/chat.js`)
- `/api/resources` — 검증된 지원정책 추천 API (`api/resources.js`)

Vercel의 경로 연결은 `vercel.json`에서 관리합니다. 기존처럼 React 안에 홈을 iframe으로 넣지 않습니다.

## 파일 구조

```text
api/                         서버리스 API
public/
  home.html                  홈 여정의 HTML 뼈대
  config.js                  공개 Google Sheet 설정
  assets/journey.css         홈 여정 스타일
  assets/journey.js          자가진단·마이크로스텝·기기 저장 로직
src/                         사회적 리허설 React 앱
supabase/migrations/         리허설 결과 저장 스키마
vercel.json                  배포 경로 규칙
```

## 콘텐츠 데이터

자가진단 문항과 마이크로스텝은 `public/config.js`에 지정된 Google Sheet의 다음 탭을 읽습니다.

- `CODE_questions`
- `CODE_microsteps`
- `CODE_presets`
- `CODE_support`

시트를 불러오지 못하면 `journey.js`의 fallback 데이터로 동작합니다. Sheet ID는 공개 문서를 찾기 위한 식별자이며 API 비밀키가 아닙니다.

## 기기 저장

자가진단 답변, 현재 단계, 마이크로스텝 난이도·완료 상태, 문의 문장을 브라우저 `localStorage`에 저장합니다. 마이크로스텝 사진은 선택 사항이며, 최대 900px로 축소하고 JPEG로 다시 인코딩해 원본 위치정보 같은 메타데이터를 제거한 뒤 같은 브라우저에만 저장합니다. 사진을 남기지 않아도 완료 기록은 동일하게 저장되며, 5단계 `작은 변화 기록`에서 사진만 따로 삭제할 수 있습니다. 사회적 리허설 대화 원문은 자동 저장하지 않고, 완료 턴 수와 부담도 같은 요약만 저장합니다.

## 안전과 AI 호출 보호

사회적 리허설에서 명확한 자해·자살 위기 표현이 입력되면 AI 역할극을 호출하지 않고 즉시 중단합니다. 화면에서는 109 전문 상담을 주요 행동으로 안내하고, 112·119는 즉각적인 위험이 있을 때만 선택하도록 보조 안내로 표시합니다. 이 기능은 전문적인 위기 평가나 응급기관을 대신하지 않습니다.

`/api/chat`은 브라우저가 임의의 시스템 프롬프트를 지정하지 못하도록 서버에 등록된 작업 유형만 허용하며, 한 IP에서 10분 동안 30회를 초과한 요청은 일시적으로 제한합니다. 이 제한은 서버리스 인스턴스 단위의 기본 보호이므로 실제 공개 운영에서는 Vercel Firewall 같은 인프라 수준의 제한도 함께 설정해야 합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

Vercel 또는 로컬 서버 환경에 다음 비밀키를 등록합니다. 실제 값은 Git에 커밋하지 않습니다.

```env
YOUTH_POLICY_API_KEY=온통청년에서_발급받은_키
ANTHROPIC_API_KEY=AI_API_키
```

- 전체 여정: `http://localhost:5173/home.html`
- 사회적 리허설: `http://localhost:5173/rehearsal`

## 검증

```bash
npm run typecheck
npm run lint
npm run build
```

## Supabase 정책 DB

`supabase/migrations/`에는 사회적 리허설과 정책 연결 DB 스키마가 있습니다. 새 Supabase 프로젝트의 SQL Editor에서 마이그레이션 파일을 시간순으로 실행하거나 Supabase CLI로 적용합니다.

브라우저는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만 사용합니다. 정책 수집 서버에서 사용하는 `SUPABASE_SERVICE_ROLE_KEY`는 Vercel의 서버 환경변수로만 보관하고 코드나 `VITE_` 변수에 넣지 않습니다.

온통청년 정책과 사용 승인을 받은 고용24 훈련·구직 프로그램은 Vercel Cron이 매일 `/api/sync-policies`를 호출해 `resources`에 갱신합니다. Claude는 15분마다 `/api/analyze-policies`에서 새 정책의 실질 혜택·대상 지역·연령·모집 상태를 구조화합니다. 4단계에서는 필수 자격을 코드로 먼저 거른 뒤 Claude가 사용자의 필요와 관심 직종에 맞춰 순서를 정합니다.

고용24 연동에 사용하는 서버 전용 환경변수는 다음과 같습니다.

- `WORK24_TRAINING_CARD_API_KEY`: 국민내일배움카드 훈련과정
- `WORK24_EMPLOYER_TRAINING_API_KEY`: 사업주훈련 과정
- `WORK24_CONSORTIUM_TRAINING_API_KEY`: 국가인적자원개발 컨소시엄 과정
- `WORK24_WORK_LEARNING_API_KEY`: 일학습병행 과정
- `WORK24_JOB_SEEKER_PROGRAM_API_KEY`: 구직자취업역량 강화프로그램
- `WORK24_STRONG_COMPANY_API_KEY`: 청년강소기업 직업체험

개인회원에게 허용되지 않는 채용정보 목록·상세 API는 호출하지 않습니다. 공통코드·학과·직업·직무·기업 정보 API는 사용자에게 기관이나 기업 목록 자체를 추천하지 않고, 이후 지역·NCS·관심 직종 매칭을 보강하는 참조 데이터로만 사용하도록 `api/_work24.js`의 카탈로그에 분리되어 있습니다.

AI 추천을 사용하려면 `20260812113000_add_ai_policy_analysis.sql`까지 적용하고 Vercel Production 환경에 `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`를 등록해야 합니다. `CRON_SECRET`에는 충분히 긴 임의 문자열을 사용하며, Vercel은 Cron 요청의 `Authorization` 헤더에 이 값을 자동으로 넣습니다.


## 정책 데이터 운영 대시보드

`/policy-ops.html`은 일반 사용자 동선에 노출되지 않는 운영자용 읽기 전용 화면입니다. 전체·활성·마감 임박·마감·정보 누락·링크 이상·중복 정책 수와 확인이 필요한 항목을 보여줍니다.

Vercel Production과 Preview 환경에 충분히 긴 임의 문자열을 등록합니다.

```env
ADMIN_DASHBOARD_KEY=운영자만_아는_긴_임의_문자열
```

화면에서 입력한 키는 서버의 환경변수와 비교되며 브라우저 저장소에 남기지 않습니다. 대시보드는 정책을 직접 수정하지 않습니다.


### AI 사용 비용

운영자 도구는 Anthropic의 공식 Cost API를 사용해 이번 달 실제 과금 금액을 표시합니다. 일반 Claude 호출용 키와 별도로 Claude Console의 `Settings > Admin keys`에서 만든 Admin API 키를 Vercel 서버 환경변수에 등록합니다.

```env
ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...
ANTHROPIC_NUDGEON_WORKSPACE_ID=wrkspc_...
```

`ANTHROPIC_NUDGEON_WORKSPACE_ID`를 생략하면 조직 전체 사용액이 표시됩니다. NudgeOn만의 비용을 분리하려면 전용 Anthropic Workspace와 API 키를 만들고 해당 Workspace ID를 등록하세요. 비용 데이터는 UTC 월 기준이며 최근 호출이 반영되기까지 보통 약 5분 걸릴 수 있습니다. Admin 키는 서버에서만 사용하고 브라우저 코드나 `VITE_` 환경변수에 넣지 않습니다.
