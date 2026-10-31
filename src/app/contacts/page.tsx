"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Button, Field, Panel, Textarea } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import { ContactExcelImport } from "@/components/contact-excel-import";
import {
  mobileSmsUri,
  phoneBatches,
  type Contact,
  type ContactGroup,
} from "@/lib/mobile-sms";

export default function ContactsPage() {
  return (
    <AdminGate>
      <Contacts />
    </AdminGate>
  );
}
function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]),
    [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [editing, setEditing] = useState("");
  const [memberGroups, setMemberGroups] = useState<string[]>([]),
    [groupName, setGroupName] = useState("");
  const [body, setBody] = useState(""),
    [bulk, setBulk] = useState(""),
    [opened, setOpened] = useState<number[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [device, setDevice] = useState({ mobile: false, ios: false });
  const [addOpen, setAddOpen] = useState(false);
  const [checkedContacts, setCheckedContacts] = useState<string[]>([]);
  const [editingGroup, setEditingGroup] = useState<{id: string; name: string} | null>(null);
  async function load() {
    const data = await fetchJson<{
      contacts: Contact[];
      groups: ContactGroup[];
    }>("/api/contacts", { headers: await authHeaders() });
    setContacts(data.contacts);
    setGroups(data.groups);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    setDevice({
      mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
      ios: /iPhone|iPad|iPod/i.test(navigator.userAgent),
    });
  }, []);
  async function save(payload: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fetchJson("/api/contacts", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(payload),
      });
      await load();
      setNotice("저장했습니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function remove(ids: string[], kind: "group" | "contact") {
    if (!ids.length) return;
    if (
      !confirm(
        kind === "group"
          ? `선택한 그룹 ${ids.length}개를 삭제할까요? 연락처는 유지되며 그룹 소속만 해제됩니다. 되돌릴 수 없습니다.`
          : `연락처 ${ids.length}명을 모든 그룹과 명부에서 삭제할까요? 기존 투표의 명부는 유지됩니다. 되돌릴 수 없습니다.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    let completed = 0;
    try {
      for (let offset = 0; offset < ids.length; offset += 200) {
        const batch = ids.slice(offset, offset + 200);
      await fetchJson("/api/contacts", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify({ ids: batch, kind }),
      });
        completed += batch.length;
      }
      setNotice(`${kind === "group" ? "그룹" : "연락처"} ${completed}${kind === "group" ? "개" : "명"}를 삭제했습니다.`);
    } catch (e) {
      setError(`${completed ? `${completed}개 처리 후 중단되었습니다. ` : ""}${e instanceof Error ? e.message : "삭제하지 못했습니다."}`);
    } finally {
      const removed = new Set(ids.slice(0, completed));
      if (kind === "group") {
        setSelected((s) => s.filter((id) => !removed.has(id)));
        setMemberGroups((s) => s.filter((id) => !removed.has(id)));
      } else {
        setCheckedContacts((s) => s.filter((id) => !removed.has(id)));
        if (removed.has(editing)) { setEditing(""); setName(""); setPhone(""); setMemberGroups([]); }
      }
      setOpened([]);
      if (completed) await load().catch(() => setError("삭제 후 목록을 불러오지 못했습니다. 새로고침해주세요."));
      setBusy(false);
    }
  }
  function toggle(id: string, values: string[], setter: (v: string[]) => void) {
    setter(
      values.includes(id) ? values.filter((x) => x !== id) : [...values, id],
    );
    setOpened([]);
  }
  const chosen = contacts.filter((c) =>
    selected.some((g) => c.groupIds.includes(g)),
  );
  const visible = contacts.filter((c) => (!selected.length || chosen.includes(c)) && `${c.name} ${c.phone}`.includes(search));
  const visibleChecked = visible.filter((c) => checkedContacts.includes(c.id));
  const allVisibleChecked = visible.length > 0 && visibleChecked.length === visible.length;
  const batches = phoneBatches(chosen),
    mobileCount = batches.flat().length;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("복사했습니다.");
    } catch {
      setError("복사 권한을 확인하거나 내용을 직접 선택해 복사해주세요.");
    }
  }
  return (
    <div className="mx-auto grid min-w-0 w-full max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">명부 · 휴대폰 단체문자</h1>
        <p className="mt-2 text-slate-600">
          내 계정의 연락처를 그룹별로 관리합니다. 한 사람을 여러 그룹에 넣을 수
          있습니다.
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Panel className="min-w-0 p-5 sm:p-6">
        <h2 className="text-lg font-bold">그룹</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" disabled={busy || !groups.length} checked={groups.length > 0 && selected.length === groups.length}
              onChange={(e) => { setSelected(e.target.checked ? groups.map((g) => g.id) : []); setCheckedContacts([]); setOpened([]); }} />
            그룹 전체 선택
          </label>
          <Button variant="secondary" disabled={busy || !selected.length} onClick={() => void remove(selected, "group")}>
            <Trash2 size={16} aria-hidden="true" /> 선택 그룹 삭제 ({selected.length})
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1"
            >
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(g.id)}
                  disabled={busy}
                  onChange={() => { toggle(g.id, selected, setSelected); setCheckedContacts([]); }}
                />{" "}
                {g.name}
              </label>
              <button
                aria-label={`${g.name} 그룹 이름 변경`}
                title="그룹 이름 변경"
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg hover:bg-slate-100"
                disabled={busy}
                onClick={() => {
                  setEditingGroup({id:g.id,name:g.name});
                  setError(""); setNotice("");
                }}
              >
                <Pencil size={18} aria-hidden="true" />
              </button>
              <button
                aria-label={`${g.name} 그룹 삭제`}
                title="그룹 삭제 (연락처 유지)"
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                disabled={busy}
                onClick={() => void remove([g.id], "group")}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {editingGroup ? <form className="mt-4 grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4" onSubmit={async event => {event.preventDefault(); if (await save({kind:"group",id:editingGroup.id,name:editingGroup.name})) setEditingGroup(null);}}>
          <Field label="변경할 그룹 이름" value={editingGroup.name} maxLength={60} autoFocus disabled={busy} onChange={event => setEditingGroup({...editingGroup,name:event.target.value})} />
          <div className="flex gap-2"><Button type="submit" disabled={busy || !editingGroup.name.trim()}>{busy ? "저장 중" : "그룹 이름 저장"}</Button><Button variant="secondary" disabled={busy} onClick={() => setEditingGroup(null)}>취소</Button></div>
        </form> : null}
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save({ kind: "group", name: groupName }))
              setGroupName("");
          }}
        >
          <Field
            label="새 그룹 이름"
            value={groupName}
            maxLength={60}
            required
            onChange={(e) => setGroupName(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            그룹 추가
          </Button>
        </form>
      </Panel>
      <Panel className="min-w-0 p-5 sm:p-6">
        <details open={addOpen} onToggle={(e) => setAddOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-lg font-bold">
          {editing ? "연락처 수정" : "연락처 추가"}
          <span className="ml-2 text-sm font-normal text-slate-500">펼쳐서 입력 · 엑셀 가져오기</span>
        </summary>
        <form
          className="mt-4 grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save({
                id: editing || undefined,
                name,
                phone,
                groupIds: memberGroups,
              })
            ) {
              setName("");
              setPhone("");
              setEditing("");
              setMemberGroups([]);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="이름"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="전화번호"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <fieldset>
            <legend>소속 그룹 (여러 개 선택 가능)</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {groups.map((g) => (
                <label key={g.id}>
                  <input
                    type="checkbox"
                    checked={memberGroups.includes(g.id)}
                    onChange={() => toggle(g.id, memberGroups, setMemberGroups)}
                  />{" "}
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              저장
            </Button>
            {editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing("");
                  setName("");
                  setPhone("");
                  setMemberGroups([]);
                }}
              >
                취소
              </Button>
            )}
          </div>
        </form>
        <details className="mt-5 min-w-0">
          <summary className="cursor-pointer font-medium">
            여러 명 한 번에 가져오기
          </summary>
          <div className="mt-3 grid min-w-0 gap-3">
            <ContactExcelImport
              groups={groups}
              groupIds={memberGroups}
              busy={busy}
              onSave={save}
            />
            <h3 className="mt-2 font-semibold">직접 붙여넣기</h3>
            <Textarea
              label="한 줄에 이름,전화번호 (최대 500명)"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={"홍길동,01012345678\n김모아이,01098765432"}
            />
            <p>
              위에서 선택한 소속 그룹으로 등록합니다. 같은 번호는 갱신됩니다.
            </p>
            <Button
              disabled={busy || !bulk.trim()}
              onClick={async () => {
                const rows = bulk
                  .trim()
                  .split(/\r?\n/)
                  .map((line) => {
                    const [n, p, ...extra] = line.split(",");
                    return {
                      name: extra.length ? "" : n?.trim(),
                      phone: p?.trim(),
                      groupIds: memberGroups,
                    };
                  });
                if (await save({ contacts: rows })) setBulk("");
              }}
            >
              가져오기
            </Button>
          </div>
        </details>
        </details>
      </Panel>
      <Panel className="min-w-0 p-5 sm:p-6">
        <Field
          label="이름·번호 검색"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCheckedContacts([]); }}
        />
        <p className="my-3 text-slate-600">
          {selected.length ? "선택 그룹의 연락처" : "전체 연락처"} ·{" "}
          {visible.length}
          명
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" disabled={busy || !visible.length} checked={allVisibleChecked}
              onChange={(e) => setCheckedContacts(e.target.checked ? visible.map((c) => c.id) : [])} />
            목록 전체 선택 ({visible.length}명)
          </label>
          <Button variant="secondary" disabled={busy || !visibleChecked.length}
            onClick={() => void remove(visibleChecked.map((c) => c.id), "contact")}>
            <Trash2 size={16} aria-hidden="true" /> 선택 연락처 삭제 ({visibleChecked.length})
          </Button>
        </div>
        <p className="mb-2 text-sm text-slate-500">전체 선택은 현재 그룹·검색 결과에만 적용됩니다. 연락처 삭제 시 다른 그룹에서도 함께 삭제됩니다.</p>
        <ul className="max-h-96 overflow-y-auto divide-y">
          {visible
            .map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" aria-label={`${c.name} 연락처 선택`} checked={checkedContacts.includes(c.id)} disabled={busy}
                    onChange={() => toggle(c.id, checkedContacts, setCheckedContacts)} />
                  <div className="min-w-0 break-words">
                  <strong>{c.name}</strong> <span>{c.phone}</span>
                  <p className="text-sm text-slate-500">
                    {groups
                      .filter((g) => c.groupIds.includes(g.id))
                      .map((g) => g.name)
                      .join(" · ") || "그룹 없음"}
                  </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setAddOpen(true);
                      setEditing(c.id);
                      setName(c.name);
                      setPhone(c.phone);
                      setMemberGroups(c.groupIds);
                      setNotice(
                        "위 연락처 수정 영역에서 수정 후 저장해주세요.",
                      );
                    }}
                  >
                    수정
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void remove([c.id], "contact")}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
        </ul>
      </Panel>
      <Panel className="min-w-0 p-5 sm:p-6">
        <h2 className="text-lg font-bold">내 휴대폰으로 단체문자</h2>
        <p className="mt-2 text-slate-600">
          위에서 받을 그룹을 선택하세요. 모아이 포인트는 사용하지 않습니다.
          휴대폰 요금제에 따라 SMS·MMS 요금이 부과될 수 있습니다.
        </p>
        <div className="mt-4 grid gap-3">
          <Textarea
            label="문자 내용"
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!body}
            onClick={() => void copy(body)}
          >
            본문 복사
          </Button>
          <p>
            {mobileCount}명 · {batches.length}묶음 (묶음당 최대 30명, 중복 번호
            제외)
            {chosen.length > mobileCount ? " · 일반전화·중복 번호 제외" : ""}
          </p>
          {!device.mobile && (
            <Alert>
              문자 앱 열기는 모바일에서 이용해주세요. PC에서는 명부와 본문을
              준비할 수 있습니다.
            </Alert>
          )}
          <p className="text-sm text-slate-600">
            한 묶음씩 열어 수신자와 내용을 확인하고 직접 전송한 뒤 돌아오세요.
            아이폰 등 본문이 비어 있는 기기에서는 복사한 내용을 붙여넣으세요.
            기기·통신사에 따라 그룹 대화로 전달될 수 있으니 수신자 공개 설정도
            확인해주세요.
          </p>
          {batches.map((phones, i) => (
            <div
              key={phones.join(",")}
              className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
            >
              {device.mobile ? (
                <a
                  className="font-semibold text-blue-600 underline"
                  href={mobileSmsUri(phones, body, device.ios)}
                  onClick={() =>
                    setOpened((s) => (s.includes(i) ? s : [...s, i]))
                  }
                >
                  {i + 1}번 묶음 문자 앱 열기 ({phones.length}명)
                </a>
              ) : (
                <span>
                  {i + 1}번 묶음 · {phones.length}명
                </span>
              )}
              <button onClick={() => void copy(phones.join(","))}>
                번호 복사
              </button>
              {opened.includes(i) && (
                <span className="text-sm text-slate-500">
                  앱 열기 요청됨 · 발송 여부는 직접 확인
                </span>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
