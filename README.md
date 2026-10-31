# 모아이투표 (open_vote)

화면 이름은 **모아이투표**, 주소는 https://vote.bluerdot.net 이다(2026-10-25 모아이에서 모아이투표로 이름 변경, 이전 openvote.bluerdot.net 은 새 주소로 넘긴다). 저장소·DB 스키마(`app_open_vote`)·내부 식별자는 `open_vote` 그대로 둔다.


단체 의사결정을 위한 범용 투표 서비스입니다. Next.js App Router 기반 웹 앱입니다.
(초기 구현은 Flutter Web 이었고 Next.js 로 포팅했습니다. 2026-07-30 에 남아 있던 Flutter 소스·빌드 스크립트를 제거했습니다.)

## 주요 흐름

- 구글 가입 즉시 투표 생성 가능(운영자 승인 불필요). 관리자는 회원·포인트·[구글챗 알림](/admin/notifications)을 관리한다. 구성·검증 기록: [가입·알림 개선](docs/auto-signup-notifications-2026-10-30.md).

- 투표 생성자(admin/creator 롤): 무료 선거 생성, 휴대폰 번호 명부 등록, 투표 기간 지정. 문자 발송 때 잔액을 확인하고 비용을 예약·정산한다.
- 투표 방식: 하나 선택 / 여러 개 선택(연기명, 최소~최대 개수) / 항목별 찬성·반대 / 순위 투표, 기권 허용 여부.
  선거구가 여러 개면 선거구마다 선거를 따로 만듭니다(명부도 선거구별).
- 선거 관리: 준비중, 진행중, 일시중단, 종료 상태 전환 + 투표 링크 문자(SMS) 발송
- 홈 공개 목록: 종료 후 기본 7일간 표시. 내 투표 관리에서 투표별 0~365일로 변경(0일은 숨김).
- 내용·결과는 기본적으로 투표 링크/코드 확인 후 열람한다. 홈에는 이름·상태·기간·참여 대상을 표시하며, 생성자가 생성 화면 또는 내 투표 관리의 공개 범위 옵션을 끄면 공개 열람으로 바꿀 수 있다.
- 단체명은 투표명과 별도로 입력한다. 설명은 기본 비공개이며 생성할 때 공개 화면 표시 여부를 선택한다. 검증·감시 자료 저장은 투표 안내 카드의 `···` 메뉴에 있다.
- 명부·휴대폰 단체문자: `/contacts`에서 계정별 다중 그룹 명부 관리. 30명씩 사용자 문자 앱으로 직접 보내며 notifier·포인트와 별개다.
- 휴지통: 60일 보관 후 이의제기 없으면 자동 삭제. 기존 코드로 삭제 대기 안내·이의제기 가능. 첫 투표 전 시작일 변경을 지원한다.
- 유권자: 문자로 받은 1인 1회용 링크(`/v/<토큰>`)로 로그인 없이 투표 (이메일 매직 링크도 지원)
- 대시보드: 진행 중인 선거의 참여율과 투표수 확인(15초마다 갱신)
- 결과: **투표가 종료된 뒤에만** 항목별 득표 공개. 마감 시각이 지나면 조회 때 자동으로 종료됩니다.
- 공개 검증: 종료 후 영수증 해시순 원장 + 원장 해시. 유권자는 투표 완료 화면의 영수증으로 자기 표를 확인합니다.
- 외부 앱 연동: API 키(`X-Api-Key`)로 `POST /api/v1/elections` 호출해 생성부터 문자 발송까지 한 번에

## 문자(SMS) 투표 링크 + 포인트 과금

- 발송 서버: 공용 [simply-notifier](https://notifier.bluerdot.net/llms.txt) — HMAC 서명으로 인증하고,
  서버에 등록된 템플릿에 수신자별 `{name}`, `{url}` 변수만 채워 대량 발송합니다.
  본문은 호출 앱이 바꿀 수 없으므로 API 키가 유출돼도 임의 스팸 발송이 불가합니다.
- 템플릿 예: `[{app_name}] {name}님, 투표에 참여해주세요: {url}` — notifier 관리 웹에서 등록 후
  `SIMPLY_NOTIFIER_TEMPLATE`에 이름을 지정합니다.
- 투표 링크 토큰: 원문은 문자에만 담기고 DB에는 SHA-256 해시만 저장합니다.
  재발송하면 토큰이 회전되어 이전 링크는 무효화됩니다. 발송에 실패한 수신자는 이전 링크로 되돌립니다.
- 대량 발송: notifier 1회 호출 한도(1000명) 때문에 `SIMPLY_NOTIFIER_MAX_BATCH`(기본 500)명씩 나눠 보냅니다.
  한도 초과 등으로 중간에 멈추면 "문자 발송"을 다시 누르면 남은 사람에게 이어서 보냅니다.
- 포인트: 1P=1원. 생성은 무료이며 예상 발송비만 안내한다. 발송 직전 전체 비용을 `sms_reserve`로 예약하고 성공분을 사용 처리한다. 확정 실패는 한 번만 환불하고, 응답 불명은 보류한다. 간편 SMS 기본 10P/건, 기존 긴 안내 30P/건이며 안내·일괄/개별 재발송에서 선택한다. 잔액 부족이면 문자를 보내지 않고 충전을 안내한다(402).
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
- Supabase PostgreSQL, RPC

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

# 문자 발송 단가. 투표 생성 시 차감하지 않는다.
VOTE_CREDIT_PER_VOTER=30
VOTE_COMPACT_SMS_PRICE=10
```

`SUPABASE_SERVICE_ROLE_KEY`와 `SIMPLY_NOTIFIER_API_SECRET`은 서버 API 라우트에서만 사용됩니다. `NEXT_PUBLIC_*` 값은 브라우저 로그인(이메일·조합원 세션)용 공개 값입니다.

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

## 경량 감사 기능 (2026-10-28 운영 반영)

서명 확인증·익명 약정 체인·공개 집계 재검증의 DB와 서명키를 운영에 반영했습니다. 기존 선거는 자동 변환되지 않습니다. 추가 문자 인증과 간편 SMS의 최신 상태는 [2026-10-29 발송 과금 기록](docs/sms-dispatch-2026-10-29.md)을 참고하세요. [감사 배포 기록](docs/deployment-2026-10-28-native-audit.md)과 [구현 기록](docs/native-audit-implementation-2026-10-28.md)도 있습니다. `npm test`, `npm run test:audit-db`, `npm run audit:build`로 합성 시험과 오프라인 검증기 생성을 수행합니다.
