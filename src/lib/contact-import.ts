export type ImportColumns = {
  phone: number;
  name: number;
  group: number | null;
  header: boolean;
};
export type ImportContact = {
  name: string;
  phone: string;
  groupNames: string[];
  row: number;
  restored: boolean;
};
export const CONTACT_IMPORT_LIMIT = 500;

export function cellText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}
export function contactPhone(
  value: unknown,
): { phone: string; restored: boolean } | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    return null;
  const raw = String(value).trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  let phone = raw.replace(/\D/g, "");
  let restored = false;
  if (/^82(?:10\d{8}|1[16789]\d{7,8})$/.test(phone)) {
    phone = "0" + phone.slice(2);
    restored = true;
  } else if (/^1[016789]\d{7,8}$/.test(phone)) {
    phone = "0" + phone;
    restored = true;
  }
  return /^0[1-9]\d{7,9}$/.test(phone) ? { phone, restored } : null;
}
export function splitGroupNames(value: unknown): string[] {
  return [
    ...new Set(
      cellText(value)
        .split(/[,;|\r\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
export function columnName(i: number) {
  let n = i + 1,
    result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
export function suggestContactColumns(row: unknown[]): ImportColumns {
  const keys = row.map((v) =>
    cellText(v)
      .toLowerCase()
      .replace(/[\s_()·-]/g, ""),
  );
  const phone = keys.findIndex((k) =>
    [
      "전화번호",
      "휴대폰번호",
      "휴대전화번호",
      "연락처",
      "휴대폰",
      "전화",
      "핸드폰번호",
      "phone",
      "mobile",
      "phonenumber",
    ].includes(k),
  );
  const name = keys.findIndex((k) =>
    ["이름", "성명", "회원명", "name", "fullname"].includes(k),
  );
  const group = keys.findIndex((k) =>
    [
      "그룹",
      "그룹선택사항",
      "그룹명",
      "소속",
      "소속그룹",
      "group",
      "groups",
    ].includes(k),
  );
  return {
    phone: phone >= 0 ? phone : 0,
    name: name >= 0 ? name : phone === 1 ? 0 : 1,
    group: group >= 0 ? group : null,
    header: phone >= 0 || name >= 0,
  };
}
export function prepareContactImport(
  rows: unknown[][],
  columns: ImportColumns,
) {
  const errors: { row: number; message: string }[] = [],
    contacts: ImportContact[] = [],
    byPhone = new Map<string, ImportContact>();
  let duplicates = 0,
    restored = 0,
    sourceRows = 0;
  const indexes = [
    columns.phone,
    columns.name,
    ...(columns.group === null ? [] : [columns.group]),
  ];
  if (
    indexes.some((i) => !Number.isInteger(i) || i < 0) ||
    new Set(indexes).size !== indexes.length
  )
    return {
      contacts,
      errors: [
        {
          row: 0,
          message: "전화번호·이름·그룹에 서로 다른 열을 지정해주세요.",
        },
      ],
      duplicates,
      restored,
      sourceRows,
    };
  for (let i = columns.header ? 1 : 0; i < rows.length; i++) {
    const values = rows[i] ?? [],
      row = i + 1;
    if (indexes.every((c) => !cellText(values[c]))) continue;
    sourceRows++;
    if (sourceRows > CONTACT_IMPORT_LIMIT) {
      errors.push({
        row,
        message: "한 번에 500행까지 가져올 수 있습니다. 파일을 나눠주세요.",
      });
      break;
    }
    const name = cellText(values[columns.name]),
      phone = contactPhone(values[columns.phone]),
      groupNames =
        columns.group === null ? [] : splitGroupNames(values[columns.group]);
    if (!name || name.length > 60) {
      errors.push({ row, message: "이름은 1~60자로 입력해주세요." });
      continue;
    }
    if (!phone) {
      errors.push({ row, message: "전화번호를 확인해주세요." });
      continue;
    }
    if (groupNames.length > 20 || groupNames.some((g) => g.length > 60)) {
      errors.push({
        row,
        message: "그룹은 20개까지, 이름은 60자까지 가능합니다.",
      });
      continue;
    }
    if (phone.restored) restored++;
    const existing = byPhone.get(phone.phone);
    if (existing) {
      if (existing.name !== name) {
        errors.push({
          row,
          message: `${existing.row}행과 전화번호가 같지만 이름이 다릅니다.`,
        });
        continue;
      }
      const merged = [...new Set([...existing.groupNames, ...groupNames])];
      if (merged.length > 20) {
        errors.push({
          row,
          message: "같은 번호에 지정한 그룹이 20개를 넘습니다.",
        });
        continue;
      }
      existing.groupNames = merged;
      duplicates++;
      continue;
    }
    const contact = {
      name,
      phone: phone.phone,
      groupNames,
      row,
      restored: phone.restored,
    };
    byPhone.set(phone.phone, contact);
    contacts.push(contact);
  }
  return { contacts, errors, duplicates, restored, sourceRows };
}
