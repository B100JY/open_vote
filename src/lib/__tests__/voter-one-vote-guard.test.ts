import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261101014430_voter_one_vote_identity_guard.sql",
  "utf8",
);
const selfResend = readFileSync("src/app/api/vote/resend/route.ts", "utf8");
const dispatch = readFileSync("src/lib/sms-dispatch.ts", "utf8");

test("투표 완료 상태와 코드/토큰은 재발급으로 변경할 수 없다", () => {
  assert.match(migration, /old\.has_voted = true/);
  assert.match(migration, /new\.has_voted is distinct from true/);
  assert.match(migration, /new\.token_hash is distinct from old\.token_hash/);
  assert.match(migration, /new\.code_hash is distinct from old\.code_hash/);
  assert.match(migration, /and vr\.has_voted=false and vr\.token_hash=t\.hash/);
});

test("같은 휴대폰 번호의 다른 표기로 명부를 중복 등록할 수 없다", () => {
  assert.match(migration, /create unique index if not exists voter_registry_election_normalized_phone/i);
  assert.match(migration, /regexp_replace\(phone, '\[\^0-9\]', '', 'g'\)/);
});

test("문자 재발송은 투표 여부를 공개 응답에 노출하지 않고 발송 전 재검사한다", () => {
  assert.match(selfResend, /\.eq\("has_voted",false\)/);
  assert.match(selfResend, /message: UNIFORM_MESSAGE/g);
  assert.doesNotMatch(selfResend, /["']이미 투표했습니다["']/);
  assert.match(dispatch, /\.eq\("has_voted", false\)/);
  assert.match(dispatch, /stillEligible\.has\(t\.voter\.id\)/);
});
