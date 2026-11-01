-- One vote per person: normalize contact identity, never reopen a cast record.
-- No columns are added to ballots; voter identities remain segregated.
begin;

do $$
begin
  if exists (
    select 1 from app_open_vote.voter_registry
    where phone is not null
    group by election_id, regexp_replace(phone, '[^0-9]', '', 'g')
    having count(*) > 1
  ) then
    raise exception 'Duplicate normalized voter phone within an election; reconcile first';
  end if;
end $$;

create unique index if not exists voter_registry_election_normalized_phone
  on app_open_vote.voter_registry(election_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null;

create or replace function app_open_vote.guard_completed_voter()
returns trigger language plpgsql
set search_path = app_open_vote, extensions
as $$
begin
  if old.has_voted = true then
    if new.has_voted is distinct from true then
      raise exception 'Completed vote status cannot be reset';
    end if;
    if new.token_hash is distinct from old.token_hash
       or new.code_hash is distinct from old.code_hash
       or new.election_id is distinct from old.election_id then
      raise exception 'Credentials cannot be reissued after a completed vote';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists voter_registry_completed_guard on app_open_vote.voter_registry;
create trigger voter_registry_completed_guard
before update on app_open_vote.voter_registry
for each row execute function app_open_vote.guard_completed_voter();

-- A failed SMS must never roll credentials backward after the voter casts.
create or replace function app_open_vote.restore_voter_tokens(p_election_id uuid,p_tokens jsonb)
returns integer language plpgsql
set search_path=app_open_vote,extensions
as $$
declare v_count integer;
begin
  if p_election_id is null or p_tokens is null or jsonb_typeof(p_tokens) <> 'array' then return 0; end if;
  update voter_registry vr
     set token_hash = t.previous_hash, code_hash = t.previous_code_hash
    from (select (item ->> 'id')::uuid as id, item ->> 'hash' as hash,
                 item ->> 'previous_hash' as previous_hash, item ->> 'previous_code_hash' as previous_code_hash
            from jsonb_array_elements(p_tokens) item) t
   where vr.id=t.id and vr.election_id=p_election_id
     and vr.has_voted=false and vr.token_hash=t.hash;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function app_open_vote.restore_voter_tokens(uuid,jsonb) from public,anon,authenticated;
grant execute on function app_open_vote.restore_voter_tokens(uuid,jsonb) to service_role;

revoke execute on function app_open_vote.guard_completed_voter()
from public, anon, authenticated;
grant execute on function app_open_vote.guard_completed_voter() to service_role;
select app_open_vote.assert_permission_baseline();
commit;
