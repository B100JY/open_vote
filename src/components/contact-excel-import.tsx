"use client";
import { useRef, useState } from "react";
import { Alert, Button } from "./ui";
import {
  cellText,
  columnName,
  prepareContactImport,
  suggestContactColumns,
  type ImportColumns,
} from "@/lib/contact-import";
import type { ContactGroup } from "@/lib/mobile-sms";
import { readHiddenExcelRows, skipHiddenContactRows } from "@/lib/contact-excel-hidden";
type Sheet = { sheet: string; data: unknown[][]; hiddenRows: number };
export function ContactExcelImport({
  groups,
  groupIds,
  busy,
  onSave,
}: {
  groups: ContactGroup[];
  groupIds: string[];
  busy: boolean;
  onSave: (payload: unknown) => Promise<boolean>;
}) {
  const [sheets, setSheets] = useState<Sheet[]>([]),
    [sheetIndex, setSheetIndex] = useState(0),
    [columns, setColumns] = useState<ImportColumns>({
      phone: 0,
      name: 1,
      group: null,
      header: true,
    });
  const [reading, setReading] = useState(false),
    [error, setError] = useState(""),
    [filename, setFilename] = useState("");
  const revision = useRef(0);
  const rows = sheets[sheetIndex]?.data ?? [],
    width = Math.min(
      100,
      Math.max(0, ...rows.slice(0, 501).map((r) => r.length)),
    );
  const preview = prepareContactImport(rows, columns),
    selectedGroups = groups.filter((g) => groupIds.includes(g.id));
  async function read(file: File | undefined) {
    const current = ++revision.current;
    setSheets([]);
    setError("");
    setFilename("");
    if (!file) {
      setReading(false);
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      setError(
        ".xlsx 파일을 선택해주세요. 예전 .xls 파일은 엑셀에서 .xlsx로 다시 저장해주세요.",
      );
      setReading(false);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(
        "파일은 5MB까지 가능합니다. 필요한 명부만 새 파일에 저장해주세요.",
      );
      setReading(false);
      return;
    }
    setReading(true);
    try {
      const { default: readExcelFile } =
        await import("read-excel-file/browser");
      const [result, hiddenRowsBySheet] = await Promise.all([
        readExcelFile(file),
        file.arrayBuffer().then(buffer => readHiddenExcelRows(new Uint8Array(buffer))),
      ]);
      if (current !== revision.current) return;
      const visibleSheets: Sheet[] = result.map(sheet => {
        const hidden = hiddenRowsBySheet.get(sheet.sheet);
        if (!hidden) throw new Error("시트의 숨김 행 정보를 확인할 수 없습니다.");
        return {
          sheet: sheet.sheet,
          // Hidden rows remain as blanks so preview row numbers still match Excel.
          data: skipHiddenContactRows(sheet.data, hidden),
          hiddenRows: [...hidden].filter(number =>
            number <= sheet.data.length && (sheet.data[number - 1] ?? []).some(cell =>
              cell !== null && cell !== undefined && String(cell).trim() !== ""
            )
          ).length,
        };
      });
      if (!visibleSheets.length || visibleSheets.every((s) => !s.data.length))
        throw new Error("빈 파일입니다.");
      if (
        visibleSheets.length > 30 ||
        visibleSheets.some(
          (s) => s.data.length > 10000 || s.data.some((r) => r.length > 100),
        )
      )
        throw new Error(
          "명부에 필요한 열만 남기고, 파일을 500명 이하로 나눠주세요.",
        );
      const first = Math.max(
        0,
        result.findIndex((s) => s.data.length),
      );
      setSheets(visibleSheets);
      setSheetIndex(first);
      setColumns(suggestContactColumns(visibleSheets[first].data[0] ?? []));
      setFilename(file.name);
    } catch (e) {
      if (current === revision.current)
        setError(
          e instanceof Error && e.message.includes("500명")
            ? e.message
            : "파일을 읽지 못했습니다. 암호가 없는 .xlsx 파일인지 확인해주세요.",
        );
    } finally {
      if (current === revision.current) setReading(false);
    }
  }
  function chooseSheet(index: number) {
    setSheetIndex(index);
    setColumns(suggestContactColumns(sheets[index].data[0] ?? []));
  }
  function selector(
    label: string,
    key: "phone" | "name" | "group",
    optional = false,
  ) {
    return (
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        {label}
        <select
          className="min-h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-3"
          value={columns[key] ?? ""}
          onChange={(e) =>
            setColumns((c) => ({
              ...c,
              [key]: e.target.value === "" ? null : Number(e.target.value),
            }))
          }
        >
          {optional && <option value="">사용하지 않음</option>}
          {Array.from({ length: width }, (_, i) => (
            <option key={i} value={i}>
              {columnName(i)}열
              {columns.header
                ? ` · ${cellText(rows[0]?.[i]).slice(0, 40) || "제목 없음"}`
                : ""}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <div>
        <h3 className="font-semibold">엑셀 파일에서 가져오기</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          파일 선택 → 열 지정 → 미리보기 → 저장
        </p>
      </div>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        엑셀 파일 (.xlsx · 최대 5MB)
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void read(file);
          }}
          className="min-w-0 w-full rounded-lg border border-slate-200 bg-white p-2 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-blue-800"
        />
      </label>
      <p className="text-xs leading-5 text-slate-500">
        파일은 이 기기에서 읽습니다. 저장을 누르면 지정한 연락처와 그룹만 서버로
        보냅니다.
      </p>
      {reading && <p role="status">엑셀을 읽는 중입니다…</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      {!!sheets.length && (
        <>
          <p className="break-all text-sm text-slate-600">{filename}</p>
          {sheets.length > 1 && (
            <label className="grid min-w-0 gap-2 text-sm">
              가져올 시트
              <select
                className="min-h-12 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3"
                value={sheetIndex}
                onChange={(e) => chooseSheet(Number(e.target.value))}
              >
                {sheets.map((s, i) => (
                  <option key={i} value={i}>
                    {s.sheet}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <input
              type="checkbox"
              checked={columns.header}
              onChange={(e) =>
                setColumns((c) => ({ ...c, header: e.target.checked }))
              }
            />{" "}
            첫 행은 열 이름입니다 (가져오지 않음)
          </label>
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            {selector("전화번호 열", "phone")}
            {selector("이름 열", "name")}
            {selector("그룹 열 (선택)", "group", true)}
          </div>
          <p className="text-sm leading-6 text-slate-600">
            그룹 이름을 파일에 적으면 없는 그룹은 함께 만듭니다. 여러 그룹은
            쉼표·세미콜론·|로 구분하세요.
            {selectedGroups.length
              ? ` 위에서 선택한 ${selectedGroups.map((g) => g.name).join(" · ")} 그룹도 함께 적용됩니다.`
              : " 그룹 열을 지정하지 않으면 위에서 선택한 소속 그룹만 적용됩니다."}
          </p>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
            <h4 className="font-semibold">
              미리보기 · {preview.contacts.length}명
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              같은 번호는 이름이 갱신되고 기존 그룹은 유지됩니다. 중복{" "}
              {preview.duplicates}행은 한 명으로 합칩니다.
            </p>
            {sheets[sheetIndex]?.hiddenRows ? (
              <p className="mt-1 text-xs font-medium leading-5 text-blue-700">
                엑셀에서 숨김 처리된 행 {sheets[sheetIndex].hiddenRows}개를 제외했습니다. 인원수는 유효한 번호와 중복 제거 결과를 기준으로 합니다.
              </p>
            ) : null}
            {!!preview.restored && (
              <p className="mt-2 text-sm text-blue-800">
                앞자리 0·국가번호를 보정한 번호 {preview.restored}행이 있습니다.
                아래 번호를 확인해주세요.
              </p>
            )}
            <div className="mt-3 min-w-0 max-w-full overflow-x-auto">
              <table className="w-full min-w-80 text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">행</th>
                    <th className="p-2">전화번호</th>
                    <th className="p-2">이름</th>
                    <th className="p-2">그룹</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.contacts.slice(0, 10).map((c) => (
                    <tr key={c.phone} className="border-b border-slate-100">
                      <td className="p-2">{c.row}</td>
                      <td className="whitespace-nowrap p-2">{c.phone}</td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">
                        {[
                          ...new Set([
                            ...selectedGroups.map((g) => g.name),
                            ...c.groupNames,
                          ]),
                        ].join(" · ") || "없음"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.contacts.length > 10 && (
              <p className="mt-2 text-xs text-slate-500">
                처음 10명만 표시합니다. 저장 대상은 {preview.contacts.length}
                명입니다.
              </p>
            )}
          </div>
          {!!preview.errors.length && (
            <Alert tone="danger">
              <p className="font-semibold">
                오류 {preview.errors.length}건 · 아직 저장되지 않았습니다.
              </p>
              <ul className="mt-2 list-inside list-disc">
                {preview.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    {e.row ? `${e.row}행: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                열 지정을 확인하거나 파일을 수정한 뒤 다시 선택해주세요.
              </p>
            </Alert>
          )}
          <Button
            disabled={
              busy ||
              reading ||
              !preview.contacts.length ||
              !!preview.errors.length
            }
            onClick={async () => {
              if (
                await onSave({
                  kind: "sheet_import",
                  contacts: preview.contacts.map((c) => ({
                    name: c.name,
                    phone: c.phone,
                    groupNames: c.groupNames,
                    groupIds,
                  })),
                })
              ) {
                setSheets([]);
                setFilename("");
              } else {
                setError(
                  "저장 결과를 확인하지 못했습니다. 화면 상단 안내를 확인하고 새로고침해주세요.",
                );
              }
            }}
          >
            {busy ? "저장 중…" : `확인한 ${preview.contacts.length}명 가져오기`}
          </Button>
        </>
      )}
    </div>
  );
}
