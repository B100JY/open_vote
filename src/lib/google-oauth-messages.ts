/** 구글 로그인 오류 코드 → 화면 문구(브라우저에서도 쓰므로 node 모듈을 import 하지 않는다). */
export function googleErrorMessage(code: string): string {
  switch (code) {
    case "cancelled":
      return "구글 로그인을 취소했습니다.";
    case "not_configured":
      return "구글 로그인이 아직 준비되지 않았습니다. 운영자에게 문의해 주세요.";
    case "email_unverified":
      return "메일 확인이 끝난 구글 계정만 사용할 수 있습니다.";
    case "suspended":
      return "이용이 정지된 계정입니다.";
    case "account_mismatch":
      return "이 메일은 다른 구글 계정과 연결되어 있습니다.";
    case "rate_limited":
      return "가입 시도가 너무 많습니다. 나중에 다시 시도해 주세요.";
    case "state":
      return "로그인 시간이 지났거나 잘못된 요청입니다. 다시 시도해 주세요.";
    default:
      return "구글 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
