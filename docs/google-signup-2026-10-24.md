# 구글 가입·로그인과 홈 화면 단순화 — 2026-10-24

## 무엇이 바뀌었나

- 새 회원은 **구글 계정으로만** 가입한다. 초대코드와 이메일·비밀번호 가입은 없앴다(`/api/auth/register` 는 410).
  기존 이메일·비밀번호 회원은 로그인 화면의 "이메일과 비밀번호로 로그인"으로 그대로 들어올 수 있다.
- 가입하면 `members.role = 'pending'` 이다. 투표를 만들려면 지금처럼 관리자가 `/admin/members` 에서 승인한다.
- 홈은 검색창(투표 번호·이름) + 진행 중인 공개 투표 목록 + "보안 기술 확인 / 투표 생성"만 둔다.
  투표·진행 상황·결과·검증은 투표 하나의 안내 화면 `/elections/[id]` 에서 들어간다.
  `/dashboard`·`/results`·`/verify` 는 `?election=<id>` 로 그 투표를 먼저 고른다.
- 투표 번호는 따로 저장하지 않고 선거 id 앞 8자리를 대문자로 보여 준다(`src/lib/election-search.ts`).

## 구글 로그인 구조

공유 Supabase 의 GoTrue 소셜 신원은 노조링크 전용이므로(루트 AGENTS.md §3) `signInWithOAuth` 를 쓰지 않는다.
cowork `cw-google-callback` 과 같은 방식이다.

1. `/api/auth/google/start` — state 를 httpOnly 쿠키에 두고 구글 동의 화면으로 보낸다.
2. `/api/auth/google/callback` — state 대조 → code 교환 → id_token 의 iss·aud·email_verified 확인.
3. 확인된 구글 메일로 `members.email` 을 찾는다.
   - 있으면 같은 사람으로 본다. 구글로 만든 계정이면 `app_metadata.google_sub` 까지 같아야 한다.
   - 없으면 가입 한도(`claim_signup_attempt`)를 거쳐 합성 계정(`u…@member.openvote.invalid`,
     `app_metadata = { app: 'open_vote', google_sub }`)과 회원행(pending, email_verified=true)을 만든다.
4. 합성 계정의 magiclink `hashed_token` 을 발급해 `/admin#gauth=…` 로 보낸다(fragment 라 서버 로그에 남지 않는다).
   브라우저가 `verifyOtp({ token_hash, type: 'magiclink' })` 로 세션을 열고 주소에서 지운다.

`updateUserById` 는 공유 auth 가드 테스트가 금지하므로 쓰지 않는다. 그래서 비밀번호로 가입했던 계정에는
`google_sub` 를 새로 적지 않고 메일로만 잇는다.

## 운영 설정(사용자 작업)

1. Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션) 생성.
   - 승인된 리디렉션 URI: `https://vote.bluerdot.net/api/auth/google/callback`
     (로컬 확인용 `http://localhost:3100/api/auth/google/callback`)
   - OAuth 동의 화면 앱 이름: 모아이, 범위: openid·email·profile(민감 범위 아님 → 검수 불필요)
2. Vercel `open-vote` 프로덕션 환경변수(Sensitive): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` → 재배포.
3. 더 쓰지 않는 `OPENVOTE_SIGNUP_INVITE_CODE` 는 지워도 된다.

설정 전에는 구글 버튼을 누르면 "구글 로그인이 아직 준비되지 않았습니다" 안내가 나온다.
