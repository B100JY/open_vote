import { test } from "node:test";
import assert from "node:assert/strict";
import { makeElectionDuplicateTemplate } from "../election-duplicate.ts";
import type { Election } from "../types.ts";

const original: Election & {
  voters: Array<{phone: string; name: string}>;
  results: { total_ballots: number };
} = {
  id: "12345678-1234-1234-1234-123456789abc",
  name: "2026 대의원 선거",
  organization_name: "더케이텍 노동조합",
  description: "제2대 대의원 선출",
  description_public: true,
  sms_title: "대의원 투표 안내",
  ballot_type: "approve",
  min_choices: 1,
  max_choices: 1,
  allow_blank: true,
  candidates: [{ id: "option_1", name: "정윤권", description: "단독 후보" }],
  auth_mode: "sms_token",
  content_restricted: true,
  audit_version: 1,
  total_voter_codes: 84,
  status: "closed",
  starts_at: "2026-11-03T00:00:00Z",
  ends_at: "2026-11-04T09:00:00Z",
  created_at: "2026-10-29T00:00:00Z",
  updated_at: "2026-11-04T09:00:00Z",
  voters: [{phone:"01012345678",name:"유권자"}],
  results: { total_ballots: 77 },
};

test("복제 설정에 이름·단체·안건·방식·감사/공개 설정만 보존한다", () => {
  const template = makeElectionDuplicateTemplate(original, true);
  assert.deepEqual(template, {
    name: "2026 대의원 선거",
    organizationName: "더케이텍 노동조합",
    description: "제2대 대의원 선출",
    descriptionPublic: true,
    smsTitle: "대의원 투표 안내",
    voterMode: "sms",
    ballotType: "approve",
    minChoices: 1,
    maxChoices: 1,
    allowBlank: true,
    enableAudit: true,
    smsRequired: true,
    contentRestricted: true,
    candidates: [{ name: "정윤권", description: "단독 후보" }],
  });
  const raw = JSON.stringify(template);
  for (const forbidden of ["01012345678", "2026-11-03", "2026-11-04",
    "12345678-1234-1234-1234-123456789abc", "option_1", "total_ballots",
    "voters", "starts_at", "ends_at", "total_voter_codes", "status", "created_at"]) {
    assert.ok(!raw.includes(forbidden), `복제 정보에서 제외되어야 하는 필드: ${forbidden}`);
  }
});

test("감사 서명이 없는 원본은 문자 확인 옵션도 선택되지 않는다", () => {
  const template = makeElectionDuplicateTemplate({
    ...original,
    audit_version: 0,
    auth_mode: "email_link",
    ballot_type: "rank",
    candidates: [{ id: "candidate1", name: "A안" }, { id: "candidate2", name: "B안" }],
    min_choices: 1,
    max_choices: 2,
  }, true);
  assert.equal(template.enableAudit, false);
  assert.equal(template.smsRequired, false);
  assert.equal(template.voterMode, "email");
  assert.equal(template.ballotType, "rank");
  assert.equal(template.maxChoices, 2);
});
