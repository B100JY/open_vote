/**
 * `cast_*_ballot` RPC가 돌려준 error 코드를 HTTP 상태 코드로 변환합니다. 라우트
 * 핸들러와 테스트가 동일한 매핑을 공유하도록 순수 함수로 분리했습니다.
 * 400 은 선택 규칙 위반(사용자 입력 실수)만 뜻합니다.
 */
export function voteErrorStatus(error: string | undefined | null): number {
  switch (error) {
    case "election_not_active":
    case "election_not_found":
    case "election_not_started":
    case "election_ended":
    case "auth_mode_mismatch":
      return 403;
    case "not_registered":
    case "invalid_token":
    case "token_expired":
      return 401;
    case "already_voted":
    case "duplicate_receipt":
      return 409;
    default:
      return 400;
  }
}
