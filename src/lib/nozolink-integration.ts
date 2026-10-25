/**
 * 노조링크 연동은 독립 서비스 전환 기간 동안 기본 비활성화합니다.
 * API 키가 유효하더라도 외부 선거 생성·수정·조회가 실행되지 않도록
 * 요청 인증이나 DB 접근보다 먼저 검사해야 합니다.
 *
 * 검증 후 운영자의 명시적 승인으로만 환경변수를 true로 전환합니다.
 */
export function isNozolinkIntegrationEnabled(): boolean {
  return process.env.OPENVOTE_ENABLE_NOZOLINK_INTEGRATION === "true";
}

export function rejectDisabledNozolinkIntegration(): Response | null {
  if (isNozolinkIntegrationEnabled()) {
    return null;
  }

  return Response.json(
    {
      error: "integration_disabled",
      message: "노조링크 연동을 잠정 중단했습니다. 모아이투표에서 직접 투표를 생성해 주세요.",
    },
    { status: 410 },
  );
}
