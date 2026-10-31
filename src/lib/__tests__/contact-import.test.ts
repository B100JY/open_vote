import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactPhone,
  prepareContactImport,
  suggestContactColumns,
  columnName,
} from "../contact-import.ts";

test("헤더의 순서와 무관하게 이름·그룹·전화번호를 지정한다", () => {
  const rows = [
    ["메모", "그룹(선택사항)", "이름", "전화번호"],
    ["가져오지 않음", "A;B", "홍길동", "010-1234-5678"],
  ];
  const mapping = suggestContactColumns(rows[0]);
  assert.deepEqual(mapping, { phone: 3, name: 2, group: 1, header: true });
  const p = prepareContactImport(rows, mapping);
  assert.deepEqual(p.errors, []);
  assert.equal(p.contacts[0].row, 2);
  assert.deepEqual(p.contacts[0].groupNames, ["A", "B"]);
  assert.equal(p.contacts[0].phone, "01012345678");
  assert.equal(columnName(26), "AA");
});
test("엑셀 숫자 전화번호의 0 복원과 국가번호 정규화", () => {
  assert.deepEqual(contactPhone(1012345678), {
    phone: "01012345678",
    restored: true,
  });
  assert.deepEqual(contactPhone("+82 10-1234-5678"), {
    phone: "01012345678",
    restored: true,
  });
  for (const bad of [
    "abc01012345678",
    101234.5,
    true,
    new Date(),
    "010123",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(contactPhone(bad), null);
});
test("중복 번호는 그룹 합집합, 이름 충돌은 행 오류", () => {
  const columns = { phone: 0, name: 1, group: 2, header: false };
  const p = prepareContactImport(
    [
      [1012345678, "홍길동", "A"],
      ["01012345678", "홍길동", "B|A"],
    ],
    columns,
  );
  assert.equal(p.duplicates, 1);
  assert.equal(p.contacts.length, 1);
  assert.deepEqual(p.contacts[0].groupNames, ["A", "B"]);
  const conflict = prepareContactImport(
    [
      ["01012345678", "홍길동"],
      ["01012345678", "다른 이름"],
    ],
    columns,
  );
  assert.equal(conflict.errors[0].row, 2);
});
test("그룹 열 없이 헤더 없는 파일, 빈 행과 오류 행 위치", () => {
  const p = prepareContactImport([["가", "01012345678"], [], ["나", "오류"]], {
    name: 0,
    phone: 1,
    group: null,
    header: false,
  });
  assert.equal(p.contacts.length, 1);
  assert.deepEqual(p.contacts[0].groupNames, []);
  assert.equal(p.errors[0].row, 3);
  assert.equal(p.sourceRows, 2);
});
test("잘못된 열 지정·500행 초과·그룹 길이 제한", () => {
  assert.ok(
    prepareContactImport([["가", "01012345678"]], {
      name: 0,
      phone: 0,
      group: null,
      header: false,
    }).errors.length,
  );
  const p = prepareContactImport(
    Array.from({ length: 501 }, (_, i) => [
      "합성",
      `010${String(i).padStart(8, "0")}`,
    ]),
    { name: 0, phone: 1, group: null, header: false },
  );
  assert.equal(p.errors[0].row, 501);
  assert.ok(
    prepareContactImport([["가", "01012345678", "A".repeat(61)]], {
      name: 0,
      phone: 1,
      group: 2,
      header: false,
    }).errors.length,
  );
});
