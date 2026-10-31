"use client";
import { useMemo, useState } from "react";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import type { Contact, ContactGroup } from "@/lib/mobile-sms";
import { Alert, Button } from "./ui";
export function ContactPicker({ onAdd }: { onAdd: (lines: string) => void }) {
  const [data, setData] = useState<{
      contacts: Contact[];
      groups: ContactGroup[];
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const counts = useMemo(() => {
    const result = new Map<string,number>();
    for (const contact of data?.contacts ?? []) for (const id of new Set(contact.groupIds)) result.set(id,(result.get(id) ?? 0)+1);
    return result;
  },[data]);
  const selectedContacts = data?.contacts.filter(contact => contact.groupIds.some(id => selected.includes(id))) ?? [];
  return (
    <details
      onToggle={async (e) => {
        if (!e.currentTarget.open || data || busy) return;
        setBusy(true);
        try {
          setData(
            await fetchJson("/api/contacts", { headers: await authHeaders() }),
          );
        } catch {
          setError("명부를 불러오지 못했습니다.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <summary className="cursor-pointer py-3 font-medium text-blue-700">
        저장한 명부 그룹에서 가져오기
      </summary>
      {busy && <p>불러오는 중…</p>}
      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="grid gap-3 rounded-xl border p-4">
          {data.groups.map((g) => (
            <label key={g.id}>
              <input
                type="checkbox"
                checked={selected.includes(g.id)}
                onChange={() =>
                  setSelected((s) =>
                    s.includes(g.id)
                      ? s.filter((x) => x !== g.id)
                      : [...s, g.id],
                  )
                }
              />{" "}
              {g.name} <span className="ml-1 text-sm text-slate-500">({counts.get(g.id) ?? 0}명)</span>
            </label>
          ))}
          <p className="text-sm text-slate-600">
            선택한 그룹의 중복 연락처는 한 번만 추가합니다. 이후 명부를 수정해도
            생성된 투표의 유권자는 바뀌지 않습니다.
          </p>
          <Button
            disabled={!selectedContacts.length}
            onClick={() =>
              onAdd(
                selectedContacts
                  .map((c) => `${c.phone},${c.name.replace(/[,\r\n]/g, " ")}`)
                  .join("\n"),
              )
            }
          >
            선택 그룹 {selectedContacts.length}명 추가
          </Button>
          <a
            href="/contacts"
            target="_blank"
            rel="noopener"
            className="text-blue-700 underline"
          >
            명부 관리 열기
          </a>
        </div>
      )}
    </details>
  );
}
