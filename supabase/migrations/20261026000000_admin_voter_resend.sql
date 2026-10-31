-- =====================================================================
-- 투표 생성자(관리자)가 특정 유권자에게 문자 재발송 — 유권자당 최대 5회 (2026-10-26)
--
-- 내 투표 관리 화면에서 한 사람에게 새 링크·코드를 다시 보낸다. 비용은 본인 재발송과 같이
-- 선거 생성자 포인트에서 1인 단가만큼 차감하고, 문자가 나가지 않으면 환불한다.
-- 횟수는 명부에만 둔다(ballots 는 건드리지 않는다).
-- =====================================================================

alter table app_open_vote.voter_registry add column if not exists admin_resend_count integer not null default 0;
alter table app_open_vote.voter_registry drop constraint if exists voter_registry_admin_resend_count_check;
alter table app_open_vote.voter_registry add constraint voter_registry_admin_resend_count_check
    check (admin_resend_count between 0 and 5);
comment on column app_open_vote.voter_registry.admin_resend_count is '관리 화면에서 개별 재발송한 횟수(최대 5)';

-- 반환 error: invalid_request | not_found | no_phone | already_voted | limit_reached |
--             election_not_active | insufficient_credits
create or replace function app_open_vote.charge_admin_resend(
    p_election_id uuid,
    p_voter_id uuid,
    p_unit_price integer,
    p_actor uuid
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_registry voter_registry%rowtype;
    v_election elections%rowtype;
    v_balance bigint;
begin
    if p_election_id is null or p_voter_id is null or p_unit_price is null or p_unit_price < 0 then
        return json_build_object('success', false, 'error', 'invalid_request', 'message', '요청이 올바르지 않습니다.');
    end if;

    select * into v_election from elections where id = p_election_id;
    if not found or v_election.status <> 'active'
       or (v_election.ends_at is not null and v_election.ends_at <= now())
       or v_election.created_by is null then
        return json_build_object('success', false, 'error', 'election_not_active', 'message', '진행 중인 투표에서만 다시 보낼 수 있습니다.');
    end if;

    select * into v_registry from voter_registry
     where id = p_voter_id and election_id = p_election_id
     for update;
    if not found then
        return json_build_object('success', false, 'error', 'not_found', 'message', '유권자를 찾을 수 없습니다.');
    end if;
    if v_registry.phone is null then
        return json_build_object('success', false, 'error', 'no_phone', 'message', '휴대폰 번호가 없는 유권자입니다.');
    end if;
    if v_registry.has_voted then
        return json_build_object('success', false, 'error', 'already_voted', 'message', '이미 투표한 유권자입니다.');
    end if;
    if v_registry.admin_resend_count >= 5 then
        return json_build_object('success', false, 'error', 'limit_reached', 'message', '이 유권자에게는 5번까지 다시 보낼 수 있습니다.');
    end if;

    insert into credit_accounts (user_id) values (v_election.created_by)
    on conflict (user_id) do nothing;
    select balance into v_balance from credit_accounts where user_id = v_election.created_by for update;
    if v_balance < p_unit_price then
        return json_build_object('success', false, 'error', 'insufficient_credits', 'message', '포인트가 부족합니다.',
                                 'balance', v_balance, 'required', p_unit_price);
    end if;

    v_balance := v_balance - p_unit_price;
    update credit_accounts set balance = v_balance, updated_at = now() where user_id = v_election.created_by;
    insert into credit_transactions (user_id, amount, balance_after, tx_type, election_id, memo, created_by)
    values (v_election.created_by, -p_unit_price, v_balance, 'sms_resend', p_election_id,
            format('개별 재발송: %s', v_election.name), p_actor);

    update voter_registry set admin_resend_count = admin_resend_count + 1 where id = v_registry.id;

    return json_build_object('success', true, 'resend_count', v_registry.admin_resend_count + 1, 'balance', v_balance);
end;
$$;

create or replace function app_open_vote.refund_admin_resend(
    p_election_id uuid,
    p_voter_id uuid,
    p_unit_price integer,
    p_actor uuid
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_creator uuid;
    v_name text;
    v_balance bigint;
begin
    update voter_registry set admin_resend_count = admin_resend_count - 1
     where id = p_voter_id and election_id = p_election_id and admin_resend_count > 0;
    if not found then
        return json_build_object('success', false, 'error', 'not_found');
    end if;

    select created_by, name into v_creator, v_name from elections where id = p_election_id;
    if v_creator is null or p_unit_price is null or p_unit_price <= 0 then
        return json_build_object('success', true, 'refunded', 0);
    end if;

    select balance into v_balance from credit_accounts where user_id = v_creator for update;
    v_balance := coalesce(v_balance, 0) + p_unit_price;
    update credit_accounts set balance = v_balance, updated_at = now() where user_id = v_creator;
    insert into credit_transactions (user_id, amount, balance_after, tx_type, election_id, memo, created_by)
    values (v_creator, p_unit_price, v_balance, 'refund', p_election_id,
            format('개별 재발송 실패 환불: %s', v_name), p_actor);

    return json_build_object('success', true, 'refunded', p_unit_price);
end;
$$;

revoke execute on function app_open_vote.charge_admin_resend(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function app_open_vote.refund_admin_resend(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function app_open_vote.charge_admin_resend(uuid, uuid, integer, uuid) to service_role;
grant execute on function app_open_vote.refund_admin_resend(uuid, uuid, integer, uuid) to service_role;

select app_open_vote.assert_permission_baseline();
