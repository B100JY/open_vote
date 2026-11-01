import { test } from "node:test";
import assert from "node:assert/strict";
import { electionPeriodError } from "../election-period.ts";

test("마감시간은 시작시간보다 반드시 늦어야 한다", () => {
  const start = new Date("2026-11-03T08:30:00+09:00");
  assert.equal(electionPeriodError(start, new Date("2026-11-03T08:29:00+09:00")), "투표 마감 일시는 시작 일시보다 늦어야 합니다.");
  assert.equal(electionPeriodError(start, new Date("2026-11-03T08:30:00+09:00")), "투표 마감 일시는 시작 일시보다 늦어야 합니다.");
  assert.equal(electionPeriodError(start, new Date("2026-11-03T08:31:00+09:00")), null);
  assert.equal(electionPeriodError(start, new Date("2026-11-04T08:30:00+09:00")), null);
});

test("잘못된 일시 입력을 거부하며 시간대 기준으로 비교한다", () => {
  assert.equal(electionPeriodError(new Date("invalid"), new Date()), "투표 시작 및 마감 일시를 확인해주세요.");
  assert.equal(electionPeriodError(new Date(), new Date("invalid")), "투표 시작 및 마감 일시를 확인해주세요.");
  assert.equal(
    electionPeriodError(new Date("2026-11-03T10:00:00+09:00"), new Date("2026-11-03T02:00:00Z")),
    null,
  );
  assert.equal(
    electionPeriodError(new Date("2026-11-03T10:00:00+09:00"), new Date("2026-11-03T00:59:00Z")),
    "투표 마감 일시는 시작 일시보다 늦어야 합니다.",
  );
});
