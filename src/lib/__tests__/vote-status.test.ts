import { test } from "node:test";
import assert from "node:assert/strict";
import { voteErrorStatus } from "../vote-status.ts";

test("이미 투표한 경우(중복 투표 방지) 409를 반환한다", () => {
  assert.equal(voteErrorStatus("already_voted"), 409);
});

test("중복 영수증 해시도 409를 반환한다", () => {
  assert.equal(voteErrorStatus("duplicate_receipt"), 409);
});

test("미등록 유권자는 401을 반환한다", () => {
  assert.equal(voteErrorStatus("not_registered"), 401);
});

test("유효하지 않은 투표 링크 토큰은 401을 반환한다", () => {
  assert.equal(voteErrorStatus("invalid_token"), 401);
});

test("선거가 진행 중이 아니면 403을 반환한다", () => {
  assert.equal(voteErrorStatus("election_not_active"), 403);
  assert.equal(voteErrorStatus("election_not_found"), 403);
});

test("알 수 없는/누락 에러는 400으로 폴백한다", () => {
  assert.equal(voteErrorStatus("invalid_candidate"), 400);
  assert.equal(voteErrorStatus(undefined), 400);
  assert.equal(voteErrorStatus(null), 400);
});

test("기간 밖 투표·방식 불일치는 403, 만료 링크는 401이다", () => {
  assert.equal(voteErrorStatus("election_not_started"), 403);
  assert.equal(voteErrorStatus("election_ended"), 403);
  assert.equal(voteErrorStatus("auth_mode_mismatch"), 403);
  assert.equal(voteErrorStatus("token_expired"), 401);
});

test("선택 규칙 위반은 400이다(무차별 대입 카운트 제외 기준)", () => {
  assert.equal(voteErrorStatus("choice_count"), 400);
  assert.equal(voteErrorStatus("blank_not_allowed"), 400);
  assert.equal(voteErrorStatus("incomplete_selection"), 400);
});
