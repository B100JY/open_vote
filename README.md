# Open Vote

노동조합용 오픈소스 투표 시스템입니다. 기존 Flutter Web 앱을 Next.js App Router 기반 웹 앱으로 포팅했습니다.

## 주요 흐름

- 관리자: 선거 생성, 항목 등록, 인증코드 일괄 발급, CSV 다운로드
- 선거 관리: 준비중, 진행중, 일시중단, 종료 상태 전환
- 유권자: 인증코드 6자리와 전화번호 뒷자리 4자리로 인증 후 투표
- 대시보드: 진행 중인 선거의 참여율과 투표수 확인
- 결과: 항목별 득표수와 득표율 확인

## 기술 스택

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL, RPC, Realtime

## 환경 변수

`.env.local`에 아래 값을 설정합니다.

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 API 라우트에서만 사용됩니다. `NEXT_PUBLIC_*` 값은 브라우저 Realtime 구독용 공개 값입니다.

## 실행

```bash
npm install
npm run dev
```

기본 개발 서버는 [http://localhost:3100](http://localhost:3100) 입니다.

## 빌드 검증

```bash
npm run lint
npm run build
```

## Supabase

데이터베이스 스키마와 RPC 함수는 `supabase/setup.sql` 또는 `supabase/migrations/003_complete_schema.sql`을 기준으로 합니다.

Next.js API 라우트는 service role 클라이언트를 서버에서만 생성해 다음 작업을 처리합니다.

- `generate_voter_codes_batch`: 인증코드 생성
- `cast_anonymous_vote`: 익명 투표 처리
- `get_election_stats`: 진행률 집계
- `get_vote_results`: 결과 집계

무기명성 보장을 위해 `voter_codes`와 `ballots` 사이에는 직접 연결되는 외래키를 만들지 않습니다.
