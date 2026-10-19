# OpenVote 독립 회원가입 로컬 구현 및 운영 적용 안내 (2026-10-14)

## 회원가입 초대코드 (필수, 서버 전용)

초기 독립 운영에서는 이메일 발송이 없으므로 다른 사람 이메일을 도용해 가입을 선점하는 문제를 줄이기 위해 **비공개 초대코드 방식**으로만 회원가입을 연다.
운영 환경변수 `OPENVOTE_SIGNUP_INVITE_CODE`를 16자 이상 충분히 무작위인 값으로 설정한다. **설정이 없으면 회원가입은 503으로 닫히고**, 잘못된 코드는 403이다.
코드를 저장소·안내 문서·채팅에 기록하지 않는다. 운영자에게 별도 보안 채널로 전달한다.
초대코드를 안다고 이메일 소유가 인증되는 것은 아니므로, 계정은 `pending`이고 본인확인 후에만 `creator`로 승인한다.
공개 대규모 회원가입 전환 시에는 사용자 지정 SMTP/자체 OAuth·복구 절차를 별도로 설계한다.

## 구현 결과

- 독립 이메일/비밀번호 가입: `POST /api/auth/register`
- 독립 로그인: `POST /api/auth/login` → Supabase 세션 → 브라우저 `setSession`
- 권한 조회: `GET /api/auth/me`, 서버 `requireAdmin`/`requireVoteCreator`
- 회원 관리: `/admin/members`, 서버 `GET /api/admin/members`, `PATCH /api/admin/members/[id]`
- 생성자 승인: 관리자 대면·별도 본인확인 기록 후 creator 승인
- 개인 포인트: 표시 메일을 `app_open_vote.members`에서 찾아 OpenVote 전용 `auth_user_id`에만 지급
- 노조링크 외부 API/핸드오프: 기본 410 중단, 표/기존 API 키 미삭제
- 마이그레이션(미적용): `supabase/migrations/20261014000000_standalone_members.sql`

## 인증 원리

공유 Supabase 프로젝트는 유지하지만, 기존의 `unionk25@gmail.com`을 포함한 다른 앱 GoTrue 계정으로 로그인시키지 않는다.
가입 시 `u<임의 UUID>@member.openvote.invalid` 형태의 **전용 합성 계정**을 `auth.users`에 새로 만든다. 유저가 입력한 원래 이메일은 `app_open_vote.members.email`에만 존재한다.
`members.auth_user_id`와 해당 합성 계정의 `app_metadata.app='open_vote'`를 두 조건으로 검증한다.
실제 권한은 `members.role`만 신뢰하며, 신규 가입은 무조건 `pending`. 메일 서비스가 없으므로 `email_verified=false`를 유지하고 신원을 확인한 관리자만 이를 기록한다. 관리자의 신규 승격은 API로 불가능하게 제한했다.

사용자가 별도 Google OAuth 클라이언트나 별도 Supabase 프로젝트를 요구하지 않는 동안 이메일·비밀번호만 지원한다. 자동 비밀번호 복구·자동 이메일 인증은 아직 없다. **비밀번호는 다른 앱과 재사용하지 않도록 안내한다.**

## 운영 적용 전 확인 순서 (승인 필요)

1. 별도의 DB 복제본/격리된 시험 환경에 `20261010000000_ballot_types_and_secrecy.sql`을 적용하고, 표/명부 연계 불가능 및 클라이언트 SELECT·Realtime 차단 확인. 운영 DB는 아직 구버전(익명성 취약)일 수 있다.
2. 격리된 DB에 `20261014000000_standalone_members.sql` 적용, RLS/서비스 롤 권한, `assert_permission_baseline`, 테스트 회원가입·로그인·가입 제한 검사.
3. 구 코드를 배포하지 않고 DB만 변경한 기간이 발생하지 않도록 전체 배포 전략 점검. 승인 후 운영 SQL/코드 적용, 해당 시점의 실제 DB 상태 다시 읽어 검증.
4. 공개 `/admin` 페이지에서 **OpenVote 전용 계정**을 `unionk25@gmail.com`로 등록. 기존 노조링크 로그인과 비밀번호를 연동하거나 이전하지 않는다.
5. 운영자에 의해 이메일 소유/신원 확인이 끝난 다음, 아래 절차로 최초 관리자 권한을 수동으로 부여한다. 첫 가입자를 자동 admin으로 만드는 기능은 없다.
6. 관리자 재로그인 → `/admin/members`에서 다른 회원 확인·생성자 승인 → 개인 포인트 지급 → 선거 초안 생성 → SMS 시험 → 실제 기표·종료·감사·공개 원장 확인.
7. 운영 배포 전 테스트 휴대폰만 사용하고 SMS 중복 전송 방지. 운영 DB에 만든 시험 회원·선거는 삭제 가능성/법정 보존기간 검토 후 정리.

## 최초 관리자 지정 예시 SQL (실행 전 대상 확인 및 별도 승인)

```sql
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_user_id uuid;
BEGIN
  SELECT m.id, m.auth_user_id INTO v_id, v_user_id
    FROM app_open_vote.members m
    JOIN auth.users u ON u.id = m.auth_user_id
   WHERE m.email = 'unionk25@gmail.com'
     AND u.raw_app_meta_data->>'app' = 'open_vote'
     AND m.role = 'pending'
   FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION '대상 독립 가입 계정을 확인하지 못함';
  END IF;
  -- 운영자는 위 이메일을 본인이 소유하고 있음을 별도 경로로 확인해야 한다.
  UPDATE app_open_vote.members
     SET role = 'admin', email_verified = true, updated_at = now()
   WHERE id = v_id;
  INSERT INTO app_open_vote.audit_logs(event_type, details)
    VALUES ('initial_admin_bootstrap',
      jsonb_build_object('target_auth_user_id', v_user_id, 'method', 'manual_verified'));
END;
$$;
COMMIT;
```

수동 실행 전에 해당 이메일 소유·본인확인을 반드시 마친다. SQL을 웹에서 사용자 입력 그대로 실행하거나 공개 관리 API에 구현하지 않는다.

## 자동화 테스트

- `npm.cmd test`
- `npx.cmd eslint src`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`

추가 확인 필요:
- 격리된 Postgres에서 신규 SQL DDL 실제 적용 테스트 (이 작업에서 DB 미변경)
- Supabase GoTrue 합성 이메일 계정 생성·실제 로그인 E2E
- 가입 이메일 중복 경합/서버 실패시 고아 합성 계정 복구 수단
- 운영 메일 인증(현재 없음)과 비밀번호 분실 복구 방법
- 서버리스 로그인 시도 제한 및 계정 생성 폭주 제한의 운영 경로
- `nozolink`측 연동 메뉴에 사용자 안내 (타 앱 소스는 이번에 수정하지 않음)
- SMS 실발송·유권자 기표·마감·비밀투표 E2E

## 출시 보류 조건

- 최초 관리자가 실제 DB/서비스에 등록되기 전
- 개인정보 처리/메일 소유 확인/비밀번호 복구 흐름을 정하기 전
- `ballots`의 클라이언트 SELECT·Realtime·sequence_number 제거를 검증하기 전
- 실제 문자 발송 및 익명성 통합 검증 전

운영 DB, 외부 서비스 및 Git 원격은 이 단계에서 변경하지 않았다.
