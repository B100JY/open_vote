# Open Vote

노동조합용 오픈소스 투표 시스템입니다. 기존 Flutter Web 앱을 Next.js App Router 기반 웹 앱으로 포팅했습니다.

## 주요 흐름

- 투표 생성자(admin/creator 롤): 선거 생성 시 유권자 1인당 포인트(기본 10P) 차감, 휴대폰 번호 명부 등록
- 선거 관리: 준비중, 진행중, 일시중단, 종료 상태 전환 + 투표 링크 문자(SMS) 발송
- 유권자: 문자로 받은 1인 1회용 링크(`/v/<토큰>`)로 로그인 없이 투표 (이메일 매직 링크도 지원)
- 대시보드: 진행 중인 선거의 참여율과 투표수 확인
- 결과: 항목별 득표수와 득표율 확인
- 외부 앱 연동: API 키(`X-Api-Key`)로 `POST /api/v1/elections` 호출해 생성부터 문자 발송까지 한 번에

## 문자(SMS) 투표 링크 + 포인트 과금

- 발송 서버: 공용 [simply-notifier](https://notifier.bluerdot.net/llms.txt) — HMAC 서명으로 인증하고,
  서버에 등록된 템플릿에 수신자별 `{name}`, `{url}` 변수만 채워 대량 발송합니다.
  본문은 호출 앱이 바꿀 수 없으므로 API 키가 유출돼도 임의 스팸 발송이 불가합니다.
- 템플릿 예: `[{app_name}] {name}님, 투표에 참여해주세요: {url}` — notifier 관리 웹에서 등록 후
  `SIMPLY_NOTIFIER_TEMPLATE`에 이름을 지정합니다.
- 투표 링크 토큰: 원문은 문자에만 담기고 DB에는 SHA-256 해시만 저장합니다.
  재발송하면 토큰이 회전되어 이전 링크는 무효화됩니다.
- 포인트: 1P=1원 기준 선불. 투표 생성 시 `유권자 수 × VOTE_CREDIT_PER_VOTER`(기본 10)를
  단일 DB 트랜잭션(`create_billed_election`)으로 차감하며, 잔액 부족 시 아무것도 생성되지 않습니다(402).
  충전은 입금 확인 후 관리자가 `/admin/credits`에서 지급합니다.
- 권한: `app_metadata.role`이 `admin`(모든 선거 + 지급/키 발급) 또는 `creator`(자기 선거만)인
  계정이 투표를 생성할 수 있습니다.

### 외부 앱 연동 (v1 API)

```bash
# 관리자에게 발급받은 ovk_... 키 사용. 키 소유자 포인트 계정에서 차감됩니다.
curl -X POST https://<배포주소>/api/v1/elections \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ovk_..." \
  -d '{
    "name": "2026년 임원 선거",
    "candidates": ["찬성", "반대"],
    "voters": [{"phone": "010-1234-5678", "name": "홍길동"}],
    "activate": true,
    "sendSms": true
  }'

# 진행률 폴링
curl https://<배포주소>/api/v1/elections/<id> -H "X-Api-Key: ovk_..."
```

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

# 문자(SMS) 발송 — simply-notifier 관리 웹에서 발급
SIMPLY_NOTIFIER_BASE_URL=https://notifier.bluerdot.net
SIMPLY_NOTIFIER_APP_ID=app_xxxxxxxxxxxx
SIMPLY_NOTIFIER_API_SECRET=smsk_xxxxxxxxxxxx
SIMPLY_NOTIFIER_TEMPLATE=투표안내

# 문자에 담길 투표 링크 기준 URL(미설정 시 요청 origin)
VOTE_LINK_BASE_URL=https://vote.example.com

# 투표 생성 시 유권자 1인당 차감 포인트 (기본 10)
VOTE_CREDIT_PER_VOTER=10
```

`SUPABASE_SERVICE_ROLE_KEY`와 `SIMPLY_NOTIFIER_API_SECRET`은 서버 API 라우트에서만 사용됩니다. `NEXT_PUBLIC_*` 값은 브라우저 Realtime 구독용 공개 값입니다.

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
