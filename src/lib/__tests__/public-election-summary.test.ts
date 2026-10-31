import test from "node:test";
import assert from "node:assert/strict";
import { deadlineLabel, publicElectionSummary, publicPeriodDate } from "../public-election-summary.ts";

const now = Date.parse("2026-10-26T12:00:00+09:00");
test("마감까지 남은 기간은 일·시간·분 단위로 표시하고 지난 시각은 마감이다", () => {
  assert.equal(deadlineLabel("2026-10-28T12:00:00+09:00", now), "마감까지 2일");
  assert.equal(deadlineLabel("2026-10-27T13:00:00+09:00", now), "마감까지 1일");
  assert.equal(deadlineLabel("2026-10-26T15:00:00+09:00", now), "마감까지 3시간");
  assert.equal(deadlineLabel("2026-10-26T12:10:00+09:00", now), "마감까지 10분");
  assert.equal(deadlineLabel("2026-10-26T12:00:00+09:00", now), "마감");
  assert.equal(deadlineLabel(null, now), "마감일 미정");
  assert.equal(deadlineLabel("invalid", now), "마감일 미정");
});

test("공개 요약에는 설명·후보·유권자 데이터가 섞이지 않는다", () => {
  const election = { id: "example", name: "공개 제목", ends_at: null, content_restricted:false, description: "개인정보", candidates: ["비공개 후보"], phone: "개인 연락처" };
  const summary = publicElectionSummary(election, { progress: "25.5", voter_registry: { members: ["이름"] } }, now);
  assert.deepEqual(summary, { id: "example", name: "공개 제목", status: "active", starts_at:null, ends_at:null, audience_label:"명부에 등록된 유권자", deadline_label: "마감일 미정", participation_rate: 25.5 });
});

test("수동 조기 종료도 진행 중으로 표시하지 않고 결과 안내를 제공한다", () => {
  const summary = publicElectionSummary({id:"closed",name:"종료 투표",ends_at:"2026-12-01T00:00:00Z",status:"closed",content_restricted:false}, {progress:100}, now);
  assert.equal(summary.status,"closed");
  assert.equal(summary.deadline_label,"투표 종료");
});

test("진짜 0%와 통계 확인 실패를 구분하고 잘못된 비율을 표시하지 않는다", () => {
  const election = { id: "example", name: "제목", ends_at: null,content_restricted:false };
  assert.equal(publicElectionSummary(election, { progress: 0 }, now).participation_rate, 0);
  for (const stats of [null, {}, { progress: "" }, { progress: false }, { progress: -1 }, { progress: 101 }, { progress: "오류" }]) {
    assert.equal(publicElectionSummary(election, stats, now).participation_rate, null);
  }
});

test("기본 제한에서도 상태·기간·참여 대상은 보이고 참여율·선택·명부는 숨긴다", () => {
  for (const content_restricted of [undefined,true]) assert.deepEqual(publicElectionSummary({id:"e",name:"이름",starts_at:"2026-10-01",ends_at:"2026-12-01",status:"closed",content_restricted},{progress:50,phone:"비공개",choices:["선택"]},now),{id:"e",name:"이름",content_restricted:true,status:"closed",starts_at:"2026-10-01",ends_at:"2026-12-01",audience_label:"명부에 등록된 유권자",deadline_label:"투표 종료"});
});

test("미래 시작 투표는 시작 예정이며 회원 명부 대상을 구분한다", () => {
  const summary=publicElectionSummary({id:"e",name:"예정",starts_at:"2026-11-01T00:00:00Z",ends_at:"2026-12-01",status:"active",auth_mode:"member_session"},null,now);
  assert.equal(summary.status,"scheduled");
  assert.equal(summary.audience_label,"명부에 등록된 회원");
  assert.equal(summary.deadline_label,"시작 예정");
  assert.equal(publicPeriodDate(null),"미정");
  assert.equal(publicPeriodDate("invalid"),"미정");
  assert.match(publicPeriodDate("2026-10-25T06:00:00Z"),/15:00/);
});
