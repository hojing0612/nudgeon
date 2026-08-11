# NudgeOn

고립·은둔 청년이 자가진단에서 작은 행동, 사회적 리허설, 기관 연결까지 이어갈 수 있도록 만든 실행 지원 프로토타입입니다.

## 화면 구조

- `/` — 전체 5단계 여정 (`public/home.html`)
- `/rehearsal` — React 기반 사회적 리허설 (`src/`)
- `/api/chat` — AI 대화 API (`api/chat.js`)

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

자가진단 답변, 현재 단계, 마이크로스텝 난이도·완료 상태, 문의 문장을 브라우저 `localStorage`에 저장합니다. 사회적 리허설 대화 원문은 자동 저장하지 않고, 완료 턴 수와 부담도 같은 요약만 저장합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

- 전체 여정: `http://localhost:5173/home.html`
- 사회적 리허설: `http://localhost:5173/rehearsal`

## 검증

```bash
npm run typecheck
npm run lint
npm run build
```
