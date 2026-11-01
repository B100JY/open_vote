import { strFromU8, unzipSync } from "fflate";

/**
 * read-excel-file reads cells but intentionally ignores Excel's row visibility.
 * Read only the XLSX OOXML sheet metadata in the browser, keeping personal
 * contact data entirely local.
 */
export function readHiddenExcelRows(input: Uint8Array): Map<string, Set<number>> {
  const zip = unzipSync(input, {
    filter: file =>
      file.name === "xl/workbook.xml" ||
      file.name === "xl/_rels/workbook.xml.rels" ||
      /^xl\/worksheets\/[^/]+\.xml$/.test(file.name),
  });

  function xml(path: string): Document {
    const zipped = zip[path];
    if (!zipped) throw new Error("엑셀 시트 정보를 찾을 수 없습니다.");
    const parsed = new DOMParser().parseFromString(strFromU8(zipped), "application/xml");
    if (parsed.getElementsByTagName("parsererror").length) {
      throw new Error("엑셀 시트 정보가 올바르지 않습니다.");
    }
    return parsed;
  }

  const workbook = xml("xl/workbook.xml");
  const relationships = xml("xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  for (const relationship of Array.from(relationships.getElementsByTagName("Relationship"))) {
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    const type = relationship.getAttribute("Type");
    if (id && target && type?.endsWith("/worksheet")) targets.set(id, target);
  }

  const sheets = new Map<string, Set<number>>();
  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    const name = sheet.getAttribute("name");
    const relationId = sheet.getAttribute("r:id") ||
      sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    if (!name || !relationId) continue;

    const target = targets.get(relationId);
    if (!target) continue; // e.g. chart sheets are not imported as contact sheets.
    const pathParts = (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/");
    const resolved: string[] = [];
    for (const part of pathParts) {
      if (part === "..") resolved.pop();
      else if (part && part !== ".") resolved.push(part);
    }
    const path = resolved.join("/");
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) {
      throw new Error("지원하지 않는 엑셀 시트 경로입니다.");
    }

    const hidden = new Set<number>();
    const sheetXml = xml(path);
    for (const row of Array.from(sheetXml.getElementsByTagName("row"))) {
      if (!["1", "true"].includes(row.getAttribute("hidden") ?? "")) continue;
      const number = Number(row.getAttribute("r"));
      if (Number.isSafeInteger(number) && number >= 1) hidden.add(number);
    }
    sheets.set(name, hidden);
  }
  return sheets;
}

/** Keep blank placeholders, rather than splicing rows, to preserve Excel row numbers. */
export function skipHiddenContactRows<T>(
  data: T[][],
  hidden: ReadonlySet<number>,
): T[][] {
  if (!hidden.size) return data;
  return data.map((row, index) => hidden.has(index + 1) ? [] : row);
}
