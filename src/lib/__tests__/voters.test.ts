import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanVoters,
  formatPhone,
  normalizePhone,
  votersFromEmails,
} from "../voters.ts";

test("전화번호 정규화: 구분자를 제거하고 휴대폰 형식만 허용한다", () => {
  assert.equal(normalizePhone("010-1234-5678"), "01012345678");
  assert.equal(normalizePhone("010 1234 5678"), "01012345678");
  assert.equal(normalizePhone("0111234567"), "0111234567");
  assert.equal(normalizePhone("021234567"), null); // 유선번호
  assert.equal(normalizePhone("010-1234"), null); // 자릿수 부족
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(undefined), null);
});

test("전화번호 표시 형식", () => {
  assert.equal(formatPhone("01012345678"), "010-1234-5678");
  assert.equal(formatPhone("0111234567"), "011-123-4567");
  assert.equal(formatPhone(null), "-");
});

test("cleanVoters: 전화/이메일 정규화 + 선거 내 중복 제거", () => {
  const { voters, invalid } = cleanVoters([
    { phone: "010-1111-2222", name: " 홍길동 " },
    { phone: "01011112222" }, // 중복 전화
    { email: "A@Example.com " },
    { email: "a@example.com" }, // 중복 이메일
    { phone: "010-3333-4444", email: "b@example.com", name: "김철수" },
  ]);

  assert.equal(invalid.length, 0);
  assert.deepEqual(voters, [
    { phone: "01011112222", name: "홍길동" },
    { email: "a@example.com" },
    { phone: "01033334444", email: "b@example.com", name: "김철수" },
  ]);
});

test("cleanVoters: 잘못된 전화번호/이메일은 invalid로 수집한다", () => {
  const { voters, invalid } = cleanVoters([
    { phone: "1234" },
    { email: "not-an-email" },
    { name: "연락처 없음" },
    { phone: "010-5555-6666" },
  ]);

  assert.deepEqual(invalid, ["1234", "not-an-email"]);
  assert.deepEqual(voters, [{ phone: "01055556666" }]);
});

test("votersFromEmails: 레거시 입력(문자열/배열)을 voters로 변환한다", () => {
  assert.deepEqual(votersFromEmails("a@x.com\nB@x.com, a@x.com"), [
    { email: "a@x.com" },
    { email: "b@x.com" },
  ]);
  assert.deepEqual(votersFromEmails(["c@x.com", "bad"]), [{ email: "c@x.com" }]);
  assert.deepEqual(votersFromEmails(undefined), []);
});
