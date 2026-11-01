import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { readHiddenExcelRows, skipHiddenContactRows } from "../contact-excel-hidden.ts";

/** Minimal test-only XML DOM adapter; the browser uses its built-in DOMParser. */
class TestXmlParser {
  parseFromString(source: string): Document {
    return {
      getElementsByTagName(tag: string) {
        const matches = [...source.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))];
        return matches.map((entry) => {
          const attrs = new Map([...entry[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
          return {
            getAttribute(key: string) { return attrs.get(key) ?? null; },
            getAttributeNS(_ns: string, key: string) { return attrs.get(`r:${key}`) ?? null; },
          };
        });
      },
    } as unknown as Document;
  }
}

test("숨김 행을 제외해도 원본 엑셀 행 번호를 유지한다", () => {
  const rows = [
    ["전화번호", "이름"], ["01011111111", "a"], ["01022222222", "b"],
    ["01033333333", "c"], ["01044444444", "d"],
  ];
  const masked = skipHiddenContactRows(rows, new Set([3, 5]));
  assert.deepEqual(masked, [
    ["전화번호", "이름"], ["01011111111", "a"], [],
    ["01033333333", "c"], [],
  ]);
  assert.deepEqual(rows[2], ["01022222222", "b"]);
  assert.equal(skipHiddenContactRows(rows, new Set()), rows);
});

test("XLSX 시트 이름·관계 파일을 따라 숨김/필터 숨김 행 번호를 읽는다", () => {
  const original = globalThis.DOMParser;
  globalThis.DOMParser = TestXmlParser as unknown as typeof DOMParser;
  try {
    const archive = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="명부" sheetId="3" r:id="rId8"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet7.xml"/></Relationships>'),
      "xl/worksheets/sheet7.xml": strToU8('<worksheet><sheetData><row r="1"/><row r="3" hidden="1"/><row r="6" hidden="true"/><row r="10" hidden="false"/></sheetData></worksheet>'),
    });
    const result = readHiddenExcelRows(archive);
    assert.deepEqual([...result.get("명부") ?? []], [3, 6]);
  } finally {
    globalThis.DOMParser = original;
  }
});
