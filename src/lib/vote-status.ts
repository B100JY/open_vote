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

/**
 * A public ballot endpoint must not reveal that an identity exists or has
 * already voted merely by returning the database-specific reason.
 */
export function publicVoteFailure(error: string | undefined | null, message?: string) {
  if (["already_voted", "not_registered", "invalid_token", "token_expired"].includes(error ?? "")) {
    return {
      status: 403,
      error: "vote_unavailable",
      message: "투표를 접수할 수 없습니다. 투표 안내와 진행 상태를 확인하거나 선거 관리자에게 문의해 주세요.",
    };
  }
  return { status: voteErrorStatus(error), error: error ?? undefined, message: message ?? "투표를 완료하지 못했습니다." };
}
