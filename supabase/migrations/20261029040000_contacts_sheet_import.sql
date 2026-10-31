-- CLI로 생성 후 기존 20261029030000 의존성 뒤에 정렬했다.
begin;
create or replace function app_open_vote.workspace_import_contact_sheet(p_owner uuid,p_contacts jsonb) returns integer
language plpgsql set search_path=app_open_vote,extensions as $$
declare item jsonb; contact_id uuid; group_id uuid; group_name text; group_ids uuid[]; saved uuid[]:='{}';
begin
 if p_owner is null or jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts) not between 1 and 500 then raise exception 'invalid_contacts'; end if;
 for item in select value from jsonb_array_elements(p_contacts) loop
  if jsonb_typeof(item->'p_groups') is distinct from 'array' or jsonb_typeof(item->'p_group_names') is distinct from 'array' or jsonb_array_length(item->'p_group_names')>20 then raise exception 'invalid_groups'; end if;
  group_ids:=array(select distinct value::uuid from jsonb_array_elements_text(item->'p_groups'));
  if (select count(*) from contact_groups where owner_id=p_owner and id=any(group_ids))<>cardinality(group_ids) then raise exception 'foreign_group'; end if;
  for group_name in select distinct trim(value) from jsonb_array_elements_text(item->'p_group_names') loop
   if group_name is null or char_length(group_name) not between 1 and 60 or group_name ~ '[[:cntrl:]]' then raise exception 'invalid_group_name'; end if;
   insert into contact_groups(owner_id,name) values(p_owner,group_name)
   on conflict(owner_id,name) do update set name=excluded.name returning id into group_id;
   group_ids:=array_append(group_ids,group_id);
  end loop;
  insert into contacts(owner_id,name,phone) values(p_owner,trim(item->>'p_name'),item->>'p_phone')
  on conflict(owner_id,phone) do update set name=excluded.name returning id into contact_id;
  -- 기존 그룹은 유지하고 이번에 지정한 그룹만 추가한다. 한 행이라도 실패하면 전체 롤백.
  insert into contact_memberships(owner_id,contact_id,group_id) select p_owner,contact_id,g from unnest(group_ids) g on conflict do nothing;
  saved:=array_append(saved,contact_id);
 end loop;
 return (select count(distinct x)::integer from unnest(saved) x);
end $$;
revoke execute on function app_open_vote.workspace_import_contact_sheet(uuid,jsonb) from public,anon,authenticated;
grant execute on function app_open_vote.workspace_import_contact_sheet(uuid,jsonb) to service_role;
select app_open_vote.assert_permission_baseline();
commit;
