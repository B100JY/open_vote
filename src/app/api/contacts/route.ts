import { NextResponse } from "next/server";
import { requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api-response";
export const dynamic = "force-dynamic";
const uuid = /^[a-f0-9-]{36}$/i;
export async function GET(request: Request) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status);
  const db = getServiceDbSupabase(),
    owner = auth.user.user.id;
  const contacts: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("contacts")
      .select("id,name,phone")
      .eq("owner_id", owner)
      .order("name")
      .order("id")
      .range(offset, offset + 499);
    if (error) return jsonError("명부를 불러오지 못했습니다.", 503);
    contacts.push(...data);
    if (data.length < 500) break;
  }
  const groups: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("contact_groups")
      .select("id,name")
      .eq("owner_id", owner)
      .order("name")
      .order("id")
      .range(offset, offset + 499);
    if (error) return jsonError("그룹을 불러오지 못했습니다.", 503);
    groups.push(...data);
    if (data.length < 500) break;
  }
  const memberships: { contact_id: string; group_id: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("contact_memberships")
      .select("contact_id,group_id")
      .eq("owner_id", owner)
      .order("contact_id")
      .order("group_id")
      .range(offset, offset + 499);
    if (error) return jsonError("그룹을 불러오지 못했습니다.", 503);
    memberships.push(...data);
    if (data.length < 500) break;
  }
  const grouped = new Map<string, string[]>();
  for (const m of memberships) {
    const ids = grouped.get(m.contact_id) ?? [];
    ids.push(m.group_id);
    grouped.set(m.contact_id, ids);
  }
  return NextResponse.json(
    {
      contacts: contacts.map((c) => ({
        ...c,
        groupIds: grouped.get(String(c.id)) ?? [],
      })),
      groups,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status);
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("입력값을 확인해주세요.", 400);
  const db = getServiceDbSupabase(),
    owner = auth.user.user.id;
  if (body.kind === "group") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 60)
      return jsonError("그룹 이름은 1~60자입니다.", 400);
    const query = body.id
      ? db
          .from("contact_groups")
          .update({ name })
          .eq("owner_id", owner)
          .eq("id", body.id)
      : db.from("contact_groups").insert({ name, owner_id: owner });
    const { data, error } = await query.select("id,name").single();
    if (error)
      return jsonError(
        "그룹을 저장하지 못했습니다. 이름 중복을 확인해주세요.",
        409,
      );
    return NextResponse.json({ group: data });
  }
  const items = Array.isArray(body.contacts) ? body.contacts : [body];
  if (items.length > 500)
    return jsonError("한 번에 500명까지 가져올 수 있습니다.", 400);
  // 모든 행을 먼저 검증한다. 잘못된 줄은 조용히 버리지 않는다.
  const normalized = [];
  const sheetImport = body.kind === "sheet_import";
  for (const item of items) {
    if (!item || typeof item !== "object")
      return jsonError("연락처 형식을 확인해주세요.", 400);
    const name = typeof item.name === "string" ? item.name.trim() : "",
      phone =
        typeof item.phone === "string" ? item.phone.replace(/\D/g, "") : "";
    const groups = Array.isArray(item.groupIds)
      ? Array.from(new Set(item.groupIds))
      : [];
    const groupNames =
      sheetImport && Array.isArray(item.groupNames)
        ? [
            ...new Set(
              item.groupNames.map((g: unknown) =>
                typeof g === "string" ? g.trim() : "",
              ),
            ),
          ]
        : [];
    if (
      sheetImport &&
      (!Array.isArray(item.groupNames) ||
        groupNames.length > 20 ||
        groupNames.some(
          (g) =>
            typeof g !== "string" ||
            !g ||
            g.length > 60 ||
            /[\x00-\x1f]/.test(g),
        ))
    )
      return jsonError(
        "그룹 이름은 1~60자, 한 사람당 20개까지 지정해주세요.",
        400,
      );
    if (
      !name ||
      name.length > 60 ||
      !/^0[1-9][0-9]{7,9}$/.test(phone) ||
      groups.some((x) => typeof x !== "string" || !uuid.test(x)) ||
      (item.id && !uuid.test(item.id))
    )
      return jsonError("이름·전화번호·그룹을 확인해주세요.", 400);
    normalized.push({
      p_owner: owner,
      p_id: item.id ?? null,
      p_name: name,
      p_phone: phone,
      p_groups: groups,
      ...(sheetImport ? { p_group_names: groupNames } : {}),
    });
  }
  const { data: saved, error: saveError } = await db.rpc(
    sheetImport
      ? "workspace_import_contact_sheet"
      : "workspace_import_contacts",
    { p_owner: owner, p_contacts: normalized },
  );
  if (saveError)
    return jsonError(
      "저장하지 못했습니다. 중복 번호·그룹을 확인해주세요. 변경 사항은 반영되지 않았습니다.",
      409,
    );
  return NextResponse.json({ saved });
}
/**
 * Update one contact-to-group relationship without replacing the contact's
 * entire set of memberships (important for fast multi-select editing).
 */
export async function PATCH(request: Request) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status);
  const body = await request.json().catch(() => null);
  const contactId = body?.contactId;
  const groupId = body?.groupId;
  const assigned = body?.assigned;
  if (
    typeof contactId !== "string" || !uuid.test(contactId) ||
    typeof groupId !== "string" || !uuid.test(groupId) ||
    typeof assigned !== "boolean"
  ) return jsonError("연락처와 그룹을 확인해주세요.", 400);

  const db = getServiceDbSupabase();
  const owner = auth.user.user.id;
  const [contact, group] = await Promise.all([
    db.from("contacts").select("id").eq("owner_id", owner).eq("id", contactId).maybeSingle(),
    db.from("contact_groups").select("id").eq("owner_id", owner).eq("id", groupId).maybeSingle(),
  ]);
  if (contact.error || group.error)
    return jsonError("그룹 정보를 확인하지 못했습니다.", 503);
  // Never allow a membership update across accounts even though service_role
  // bypasses RLS. Both IDs must be owned by the authenticated creator.
  if (!contact.data || !group.data)
    return jsonError("연락처 또는 그룹을 찾을 수 없습니다.", 404);

  const mutation = assigned
    ? await db.from("contact_memberships")
        .upsert(
          { owner_id: owner, contact_id: contactId, group_id: groupId },
          { onConflict: "contact_id,group_id", ignoreDuplicates: true },
        )
    : await db.from("contact_memberships")
        .delete().eq("owner_id", owner).eq("contact_id", contactId).eq("group_id", groupId);
  if (mutation.error)
    return jsonError("그룹 소속을 변경하지 못했습니다. 다시 시도해주세요.", 409);
  return NextResponse.json(
    { success: true, contactId, groupId, assigned },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(request: Request) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status);
  const b = await request.json().catch(() => null);
  const ids = b && (Array.isArray(b.ids) ? b.ids : [b.id]);
  if (!b || !["group", "contact"].includes(b.kind) || !ids || !ids.length || ids.length > 200 ||
    ids.some((id: unknown) => typeof id !== "string" || !uuid.test(id)))
    return jsonError("삭제할 항목을 확인해주세요. 한 번에 200개까지 처리합니다.", 400);
  const table = b.kind === "group" ? "contact_groups" : "contacts";
  const { error } = await getServiceDbSupabase()
    .from(table)
    .delete()
    .in("id", [...new Set<string>(ids)])
    .eq("owner_id", auth.user.user.id);
  return error
    ? jsonError("삭제하지 못했습니다.", 409)
    : NextResponse.json({ success: true });
}
