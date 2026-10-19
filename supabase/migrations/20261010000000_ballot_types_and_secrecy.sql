-- =====================================================================
-- OpenVote: 투표 방식 확장 + 비밀투표 보강 + 문자 링크 토큰 버그 수정
-- 2026-10-10
--
-- 적용: MCP apply_migration 또는 대시보드 SQL Editor (supabase db push 금지 — 루트 AGENTS.md §3)
-- 적용 시점의 app_open_vote 13개 표는 전부 0행이었다(2026-10-10 실측). 그래서 칼럼 삭제·
-- 함수 시그니처 교체를 이전 호환 없이 한 번에 한다. 코드 배포와 같은 날 적용할 것 —
-- 이 마이그레이션 뒤에는 옛 코드(cast_link_vote 등 호출)가 동작하지 않는다.
--
-- 1) 투표 방식(elections.ballot_type)
--      single  : 하나만 선택 (기존 방식)
--      multi   : 정원 N명 연기명 — min_choices ~ max_choices 개 선택
--      rank    : 순위 투표 — min_choices ~ max_choices 개를 순서대로 (집계: 1순위 득표 + 보다 점수)
--      approve : 후보별 찬성/반대 (단독 후보 신임, 여러 후보 각각 찬반)
--    allow_blank: 기권(백지) 투표 허용 여부
--
-- 2) 비밀투표 — 명부와 투표지를 시간·순서로 잇는 경로를 모두 끊는다
--      - voter_registry.voted_at 삭제, 기표 때 updated_at 도 건드리지 않는다
--        (명부의 투표 시각순 = 원장 순번이라 누가 누구를 찍었는지 드러났다)
--      - ballots 의 sequence_number / previous_chain_hash / chain_hash 삭제
--        (해시 체인 순서 자체가 투표 순서였다). 무결성은 마감 뒤 영수증 해시순으로
--        정렬한 원장 전체의 해시(ledger_hash)로 확인한다.
--      - anon·authenticated 의 ballots SELECT 회수, realtime 발행에서 제외
--        (누구나 기표를 실시간으로 받아볼 수 있었다)
--      - 결과·원장은 status = 'closed' 일 때만 반환
--
-- 3) 상태 전이 고정: closed 는 되돌릴 수 없고 active/paused → draft 도 막는다.
--    마감 시각이 지난 선거는 close_expired_elections() 로 닫는다(API 가 조회 때 부른다).
--
-- 4) 문자 링크 토큰 버그: rotate_voter_tokens 가 access_token_hash 에 쓰고 기표·조회는
--    token_hash 를 읽어서, 관리 화면에서 보낸 문자 링크가 전부 "유효하지 않은 링크"였다.
--    token_hash 로 통일하고, 발송 실패 시 이전 토큰으로 되돌리는 restore_voter_tokens 를 둔다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 옛 함수 제거 (모두 삭제할 칼럼을 참조한다)
-- ---------------------------------------------------------------------
drop function if exists app_open_vote.cast_link_vote(text, text, text);
drop function if exists app_open_vote.cast_link_vote(uuid, text, text, text);
drop function if exists app_open_vote.cast_registered_vote(uuid, uuid, text, text);
drop function if exists app_open_vote.cast_registered_vote(uuid, uuid, text, text, text);
drop function if exists app_open_vote.cast_member_vote(uuid, uuid, text, text);
drop function if exists app_open_vote.get_vote_results(uuid);
drop function if exists app_open_vote.get_public_ballot_ledger(uuid);
drop function if exists app_open_vote.rotate_voter_tokens(uuid, jsonb);
drop function if exists app_open_vote.create_billed_election(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz);

-- ---------------------------------------------------------------------
-- 1. elections: 투표 방식
-- ---------------------------------------------------------------------
alter table app_open_vote.elections
    add column if not exists ballot_type text not null default 'single',
    add column if not exists min_choices integer not null default 1,
    add column if not exists max_choices integer not null default 1,
    add column if not exists allow_blank boolean not null default false;

alter table app_open_vote.elections drop constraint if exists elections_ballot_type_check;
alter table app_open_vote.elections add constraint elections_ballot_type_check
    check (ballot_type in ('single', 'multi', 'rank', 'approve'));

alter table app_open_vote.elections drop constraint if exists elections_choice_range_check;
alter table app_open_vote.elections add constraint elections_choice_range_check
    check (min_choices >= 1 and max_choices >= min_choices
           and (ballot_type <> 'single' or (min_choices = 1 and max_choices = 1)));

comment on column app_open_vote.elections.ballot_type is
    'single=하나 선택, multi=min~max개 선택(연기명), rank=min~max개 순위, approve=후보별 찬성/반대';
comment on column app_open_vote.elections.allow_blank is '기권(백지) 투표 허용';

-- ---------------------------------------------------------------------
-- 2. ballots: 순서 정보 제거 + 선택 내용(jsonb)
-- ---------------------------------------------------------------------
drop index if exists app_open_vote.idx_ballots_election_sequence;
drop index if exists app_open_vote.idx_ballots_chain_hash;
alter table app_open_vote.ballots
    drop column if exists sequence_number,
    drop column if exists previous_chain_hash,
    drop column if exists chain_hash,
    add column if not exists selections jsonb;

comment on column app_open_vote.ballots.selected_candidate is
    '선택 내용의 정규 문자열. single/multi "a,b"(후보 순서), rank "a>b", approve "a:yes,b:no", 기권 "BLANK". 영수증 해시 입력과 같다';
comment on column app_open_vote.ballots.selections is '선택 내용 원본 {choices:[...]} | {approvals:{id:yes|no}} | {blank:true}';

drop policy if exists ballots_public_ledger_read on app_open_vote.ballots;
revoke all on app_open_vote.ballots from anon, authenticated;

do $$
begin
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'app_open_vote' and tablename = 'ballots') then
        alter publication supabase_realtime drop table app_open_vote.ballots;
    end if;
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'app_open_vote' and tablename = 'voter_registry') then
        alter publication supabase_realtime drop table app_open_vote.voter_registry;
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. voter_registry: 투표 시각 삭제, 토큰 칼럼 통일
-- ---------------------------------------------------------------------
alter table app_open_vote.voter_registry drop column if exists voted_at;

-- 휴대폰 번호만 있는 유권자를 막던 제약 수정. 이전 식(email | auth_user_id | token_hash)은
-- 토큰을 발송 때 회전하는 관리 화면 흐름에서 생성 시점에 셋 다 비어 있어, 휴대폰 명부로
-- 선거를 만들면 항상 check_violation 이 났다("이메일 또는 전화번호가 없는 유권자가 있습니다").
alter table app_open_vote.voter_registry drop constraint if exists voter_registry_identity_present;
alter table app_open_vote.voter_registry add constraint voter_registry_identity_present check (
    (email is not null and length(trim(email)) > 0)
    or (phone is not null and length(trim(phone)) > 0)
    or auth_user_id is not null
    or token_hash is not null
);

drop index if exists app_open_vote.idx_voter_registry_token;
alter table app_open_vote.voter_registry drop column if exists access_token_hash;
create unique index if not exists idx_voter_registry_token_hash
    on app_open_vote.voter_registry (token_hash) where token_hash is not null;

-- ---------------------------------------------------------------------
-- 4. 상태 전이 고정
-- ---------------------------------------------------------------------
create or replace function app_open_vote.guard_election_status()
returns trigger
language plpgsql
set search_path = app_open_vote, extensions
as $$
begin
    if new.status is distinct from old.status then
        if old.status = 'closed' then
            raise exception using errcode = 'check_violation', hint = 'closed_election_is_final',
                message = '종료된 선거는 다시 열 수 없습니다.';
        end if;
        if new.status = 'draft' then
            raise exception using errcode = 'check_violation', hint = 'cannot_return_to_draft',
                message = '시작한 선거를 준비중으로 되돌릴 수 없습니다.';
        end if;
    end if;
    if old.status = 'closed' and (
        new.ballot_type is distinct from old.ballot_type
        or new.min_choices is distinct from old.min_choices
        or new.max_choices is distinct from old.max_choices
        or new.allow_blank is distinct from old.allow_blank
        or new.candidates is distinct from old.candidates
        or new.ends_at is distinct from old.ends_at) then
        raise exception using errcode = 'check_violation', hint = 'closed_election_is_final',
            message = '종료된 선거의 내용은 바꿀 수 없습니다.';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_election_status on app_open_vote.elections;
create trigger guard_election_status
    before update on app_open_vote.elections
    for each row execute function app_open_vote.guard_election_status();

create or replace function app_open_vote.close_expired_elections()
returns integer
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_count integer;
begin
    update elections
       set status = 'closed', updated_at = now()
     where status in ('active', 'paused')
       and ends_at is not null
       and ends_at <= now();
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 선택 내용 검증·정규화 (TS 쪽 src/lib/ballot.ts 와 같은 규칙)
-- ---------------------------------------------------------------------
create or replace function app_open_vote.normalize_ballot_selection(
    p_candidates jsonb,
    p_ballot_type text,
    p_min integer,
    p_max integer,
    p_allow_blank boolean,
    p_selection jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = app_open_vote, extensions
as $$
declare
    v_ids text[];
    v_choices text[];
    v_parts text[] := '{}';
    v_id text;
    v_val text;
    v_n integer;
begin
    select coalesce(array_agg(c ->> 'id' order by o), '{}')
      into v_ids
      from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) with ordinality as t(c, o);

    if p_selection is null or jsonb_typeof(p_selection) <> 'object' then
        return jsonb_build_object('ok', false, 'error', 'invalid_selection', 'message', '선택 내용이 올바르지 않습니다.');
    end if;

    if p_selection -> 'blank' = 'true'::jsonb then
        if not coalesce(p_allow_blank, false) then
            return jsonb_build_object('ok', false, 'error', 'blank_not_allowed', 'message', '이 투표는 기권을 허용하지 않습니다.');
        end if;
        return jsonb_build_object('ok', true, 'canonical', 'BLANK', 'selections', jsonb_build_object('blank', true));
    end if;

    if p_ballot_type = 'approve' then
        if jsonb_typeof(p_selection -> 'approvals') is distinct from 'object' then
            return jsonb_build_object('ok', false, 'error', 'invalid_selection', 'message', '찬성/반대 표시가 올바르지 않습니다.');
        end if;
        if exists (select 1 from jsonb_object_keys(p_selection -> 'approvals') k where not (k = any (v_ids))) then
            return jsonb_build_object('ok', false, 'error', 'invalid_candidate', 'message', '선택할 수 없는 항목입니다.');
        end if;
        foreach v_id in array v_ids loop
            v_val := p_selection -> 'approvals' ->> v_id;
            if v_val is null or v_val not in ('yes', 'no') then
                return jsonb_build_object('ok', false, 'error', 'incomplete_selection',
                                          'message', '모든 항목에 찬성 또는 반대를 표시해주세요.');
            end if;
            v_parts := v_parts || (v_id || ':' || v_val);
        end loop;
        return jsonb_build_object('ok', true,
                                  'canonical', array_to_string(v_parts, ','),
                                  'selections', jsonb_build_object('approvals', p_selection -> 'approvals'));
    end if;

    if jsonb_typeof(p_selection -> 'choices') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_selection -> 'choices') e where jsonb_typeof(e) <> 'string') then
        return jsonb_build_object('ok', false, 'error', 'invalid_selection', 'message', '선택 내용이 올바르지 않습니다.');
    end if;

    select coalesce(array_agg(e order by o), '{}')
      into v_choices
      from jsonb_array_elements_text(p_selection -> 'choices') with ordinality as t(e, o);
    v_n := cardinality(v_choices);

    if v_n = 0 then
        return jsonb_build_object('ok', false, 'error', 'empty_selection', 'message', '항목을 선택해주세요.');
    end if;
    if (select count(distinct x) from unnest(v_choices) x) <> v_n then
        return jsonb_build_object('ok', false, 'error', 'duplicate_choice', 'message', '같은 항목을 두 번 선택할 수 없습니다.');
    end if;
    if exists (select 1 from unnest(v_choices) x where not (x = any (v_ids))) then
        return jsonb_build_object('ok', false, 'error', 'invalid_candidate', 'message', '선택할 수 없는 항목입니다.');
    end if;

    if p_ballot_type = 'single' then
        if v_n <> 1 then
            return jsonb_build_object('ok', false, 'error', 'choice_count', 'message', '한 항목만 선택할 수 있습니다.');
        end if;
    elsif p_ballot_type in ('multi', 'rank') then
        if v_n < p_min or v_n > p_max then
            return jsonb_build_object('ok', false, 'error', 'choice_count',
                'message', case when p_min = p_max then format('%s개를 선택해주세요.', p_max)
                                else format('%s~%s개를 선택해주세요.', p_min, p_max) end);
        end if;
    else
        return jsonb_build_object('ok', false, 'error', 'invalid_ballot_type', 'message', '알 수 없는 투표 방식입니다.');
    end if;

    if p_ballot_type = 'rank' then
        return jsonb_build_object('ok', true,
                                  'canonical', array_to_string(v_choices, '>'),
                                  'selections', jsonb_build_object('choices', to_jsonb(v_choices)));
    end if;

    -- single/multi: 후보 등록 순서로 정렬해 정규화
    select array_agg(id order by o) into v_choices
      from unnest(v_ids) with ordinality as u(id, o)
     where id = any (v_choices);

    return jsonb_build_object('ok', true,
                              'canonical', array_to_string(v_choices, ','),
                              'selections', jsonb_build_object('choices', to_jsonb(v_choices)));
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 기표 공통부 — 명부 행 잠금 → 검증 → 투표지 저장 → 참여 표시
--    명부에는 has_voted 만 남기고 시각을 쓰지 않는다. 투표지에는 명부를 가리키는
--    값이 없다. 잠금은 명부 행(FOR UPDATE)으로 충분하다(순번을 매기지 않으므로).
-- ---------------------------------------------------------------------
create or replace function app_open_vote.cast_ballot_internal(
    p_election_id uuid,
    p_registry_id uuid,
    p_user_id uuid,
    p_selection jsonb,
    p_receipt_hash text
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_election elections%rowtype;
    v_registry voter_registry%rowtype;
    v_norm jsonb;
begin
    if p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$' then
        return json_build_object('success', false, 'error', 'invalid_request', 'message', '영수증 해시가 올바르지 않습니다.');
    end if;

    select * into v_registry from voter_registry
     where id = p_registry_id and election_id = p_election_id
     for update;
    if not found then
        return json_build_object('success', false, 'error', 'not_registered', 'message', '이 선거에 등록된 유권자가 아닙니다.');
    end if;

    select * into v_election from elections where id = p_election_id;
    if not found then
        return json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    end if;

    if v_registry.has_voted then
        return json_build_object('success', false, 'error', 'already_voted', 'message', '이미 투표를 완료했습니다.');
    end if;

    if v_election.status <> 'active' then
        return json_build_object('success', false, 'error', 'election_not_active', 'message', '이 선거는 현재 진행 중이 아닙니다.');
    end if;
    if v_election.starts_at is not null and v_election.starts_at > now() then
        return json_build_object('success', false, 'error', 'election_not_started', 'message', '아직 투표 시작 전입니다.');
    end if;
    if v_election.ends_at is not null and v_election.ends_at <= now() then
        return json_build_object('success', false, 'error', 'election_ended', 'message', '투표 기간이 마감되었습니다.');
    end if;

    v_norm := normalize_ballot_selection(v_election.candidates, v_election.ballot_type,
                                         v_election.min_choices, v_election.max_choices,
                                         v_election.allow_blank, p_selection);
    if not (v_norm ->> 'ok')::boolean then
        return json_build_object('success', false, 'error', v_norm ->> 'error', 'message', v_norm ->> 'message');
    end if;

    begin
        insert into ballots (election_id, selected_candidate, selections, receipt_hash)
        values (p_election_id, v_norm ->> 'canonical', v_norm -> 'selections', p_receipt_hash);
    exception when unique_violation then
        return json_build_object('success', false, 'error', 'duplicate_receipt', 'message', '이미 사용된 영수증 해시입니다.');
    end;

    update voter_registry
       set has_voted = true,
           user_id = coalesce(user_id, p_user_id)
     where id = v_registry.id;

    return json_build_object('success', true, 'message', '투표가 완료되었습니다.',
                             'receipt_hash', p_receipt_hash,
                             'selection', v_norm ->> 'canonical');
end;
$$;

-- sms_token: 문자 1회용 링크
create or replace function app_open_vote.cast_link_ballot(
    p_token text,
    p_selection jsonb,
    p_receipt_hash text
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_registry voter_registry%rowtype;
begin
    if p_token is null or trim(p_token) = '' then
        return json_build_object('success', false, 'error', 'invalid_token', 'message', '유효하지 않은 투표 링크입니다.');
    end if;

    select * into v_registry from voter_registry
     where token_hash = encode(digest(trim(p_token), 'sha256'), 'hex');
    if not found then
        return json_build_object('success', false, 'error', 'invalid_token', 'message', '유효하지 않은 투표 링크입니다.');
    end if;

    if v_registry.token_expires_at is not null and v_registry.token_expires_at < now() then
        return json_build_object('success', false, 'error', 'token_expired', 'message', '투표 링크가 만료되었습니다.');
    end if;

    return cast_ballot_internal(v_registry.election_id, v_registry.id, null, p_selection, p_receipt_hash);
end;
$$;

-- email_link: 이메일 매직 링크 로그인
create or replace function app_open_vote.cast_registered_ballot(
    p_election_id uuid,
    p_user_id uuid,
    p_user_email text,
    p_selection jsonb,
    p_receipt_hash text
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_registry_id uuid;
begin
    if p_user_id is null then
        return json_build_object('success', false, 'error', 'invalid_request', 'message', '로그인 정보가 올바르지 않습니다.');
    end if;

    select id into v_registry_id from voter_registry
     where election_id = p_election_id
       and (user_id = p_user_id or lower(email) = lower(coalesce(p_user_email, '')))
     order by case when user_id = p_user_id then 0 else 1 end
     limit 1;
    if v_registry_id is null then
        return json_build_object('success', false, 'error', 'not_registered', 'message', '이 선거에 등록된 유권자가 아닙니다.');
    end if;

    return cast_ballot_internal(p_election_id, v_registry_id, p_user_id, p_selection, p_receipt_hash);
end;
$$;

-- member_session: 노조링크 조합원 세션 (연동 경로)
create or replace function app_open_vote.cast_member_ballot(
    p_election_id uuid,
    p_user_id uuid,
    p_selection jsonb,
    p_receipt_hash text
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_auth_mode text;
    v_registry_id uuid;
begin
    if p_user_id is null then
        return json_build_object('success', false, 'error', 'invalid_request', 'message', '로그인 정보가 올바르지 않습니다.');
    end if;

    select auth_mode into v_auth_mode from elections where id = p_election_id;
    if v_auth_mode is null then
        return json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    end if;
    if v_auth_mode <> 'member_session' then
        return json_build_object('success', false, 'error', 'auth_mode_mismatch', 'message', '이 선거는 세션 투표 방식이 아닙니다.');
    end if;

    select id into v_registry_id from voter_registry
     where election_id = p_election_id and auth_user_id = p_user_id
     limit 1;
    if v_registry_id is null then
        return json_build_object('success', false, 'error', 'not_registered', 'message', '이 선거에 등록된 조합원이 아닙니다.');
    end if;

    return cast_ballot_internal(p_election_id, v_registry_id, p_user_id, p_selection, p_receipt_hash);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 결과·원장 — 종료된 선거만
-- ---------------------------------------------------------------------
create or replace function app_open_vote.get_election_results(p_election_id uuid)
returns json
language plpgsql
stable
set search_path = app_open_vote, extensions
as $$
declare
    v_election elections%rowtype;
    v_total integer;
    v_blank integer;
    v_valid integer;
    v_rows json;
begin
    select * into v_election from elections where id = p_election_id;
    if not found then
        return json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    end if;
    if v_election.status <> 'closed' then
        return json_build_object('success', false, 'error', 'results_not_available',
                                 'message', '결과는 투표가 종료된 뒤 공개됩니다.');
    end if;

    select count(*), count(*) filter (where selections -> 'blank' = 'true'::jsonb)
      into v_total, v_blank
      from ballots where election_id = p_election_id;
    v_valid := v_total - v_blank;

    if v_election.ballot_type = 'approve' then
        select json_agg(json_build_object(
                   'candidate_id', c.id,
                   'yes', coalesce(s.yes, 0),
                   'no', coalesce(s.no, 0),
                   'yes_percentage', case when coalesce(s.yes, 0) + coalesce(s.no, 0) > 0
                       then round(s.yes::numeric * 100 / (s.yes + s.no), 2) else 0 end
               ) order by c.o)
          into v_rows
          from (select e ->> 'id' as id, o from jsonb_array_elements(v_election.candidates) with ordinality t(e, o)) c
          left join (
              select a.key as id,
                     count(*) filter (where a.value = 'yes') as yes,
                     count(*) filter (where a.value = 'no') as no
                from ballots b, jsonb_each_text(b.selections -> 'approvals') a
               where b.election_id = p_election_id
               group by a.key
          ) s on s.id = c.id;
    elsif v_election.ballot_type = 'rank' then
        -- 순위 점수(보다): 순위 r 에 (max_choices - r + 1) 점. 1순위가 max_choices 점
        select json_agg(json_build_object(
                   'candidate_id', c.id,
                   'votes', coalesce(s.ranked, 0),
                   'first_choice', coalesce(s.first_choice, 0),
                   'points', coalesce(s.points, 0),
                   'rank_counts', coalesce(s.rank_counts, '[]'::json),
                   'percentage', case when v_valid > 0
                       then round(coalesce(s.first_choice, 0)::numeric * 100 / v_valid, 2) else 0 end
               ) order by c.o)
          into v_rows
          from (select e ->> 'id' as id, o from jsonb_array_elements(v_election.candidates) with ordinality t(e, o)) c
          left join (
              select x.id,
                     count(*) as ranked,
                     count(*) filter (where x.r = 1) as first_choice,
                     sum(v_election.max_choices - x.r + 1) as points,
                     (select json_agg(coalesce(cnt, 0) order by pos)
                        from generate_series(1, v_election.max_choices) pos
                        left join lateral (
                            select count(*) as cnt
                              from ballots b2, jsonb_array_elements_text(b2.selections -> 'choices') with ordinality y(id, r)
                             where b2.election_id = p_election_id and y.id = x.id and y.r = pos
                        ) z on true) as rank_counts
                from ballots b, jsonb_array_elements_text(b.selections -> 'choices') with ordinality x(id, r)
               where b.election_id = p_election_id
               group by x.id
          ) s on s.id = c.id;
    else
        select json_agg(json_build_object(
                   'candidate_id', c.id,
                   'votes', coalesce(s.votes, 0),
                   'percentage', case when v_valid > 0
                       then round(coalesce(s.votes, 0)::numeric * 100 / v_valid, 2) else 0 end
               ) order by c.o)
          into v_rows
          from (select e ->> 'id' as id, o from jsonb_array_elements(v_election.candidates) with ordinality t(e, o)) c
          left join (
              select x.id, count(*) as votes
                from ballots b, jsonb_array_elements_text(b.selections -> 'choices') x(id)
               where b.election_id = p_election_id
               group by x.id
          ) s on s.id = c.id;
    end if;

    return json_build_object(
        'success', true,
        'election_id', p_election_id,
        'ballot_type', v_election.ballot_type,
        'min_choices', v_election.min_choices,
        'max_choices', v_election.max_choices,
        'total_ballots', v_total,
        'blank_ballots', v_blank,
        'valid_ballots', v_valid,
        'candidates', coalesce(v_rows, '[]'::json)
    );
end;
$$;

-- 공개 원장: 영수증 해시순(무작위 순서)으로만 내보낸다. 투표 순서는 어디에도 없다.
-- ledger_hash = sha256( "receipt:selection" 줄들을 receipt 순으로 \n 연결 )
create or replace function app_open_vote.get_public_ballot_ledger(p_election_id uuid)
returns json
language plpgsql
stable
set search_path = app_open_vote, extensions
as $$
declare
    v_status text;
    v_ballots json;
    v_count integer;
    v_hash text;
begin
    select status into v_status from elections where id = p_election_id;
    if v_status is null then
        return json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    end if;
    if v_status <> 'closed' then
        return json_build_object('success', false, 'error', 'ledger_not_available',
                                 'message', '공개 원장은 투표가 종료된 뒤 공개됩니다.');
    end if;

    select count(*),
           json_agg(json_build_object('receipt_hash', receipt_hash, 'selection', selected_candidate)
                    order by receipt_hash collate "C"),
           encode(digest(coalesce(string_agg(receipt_hash || ':' || selected_candidate, E'\n'
                                             order by receipt_hash collate "C"), ''), 'sha256'), 'hex')
      into v_count, v_ballots, v_hash
      from ballots
     where election_id = p_election_id and receipt_hash is not null;

    return json_build_object('success', true,
                             'election_id', p_election_id,
                             'ballot_count', v_count,
                             'ledger_hash', v_hash,
                             'ballots', coalesce(v_ballots, '[]'::json));
end;
$$;

-- ---------------------------------------------------------------------
-- 8. 선거 생성(관리 화면, 소유자 포인트 과금) — 투표 방식·기간 추가
-- ---------------------------------------------------------------------
create or replace function app_open_vote.create_billed_election(
    p_creator uuid,
    p_name text,
    p_description text,
    p_candidates jsonb,
    p_voters jsonb,
    p_unit_price integer,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_ballot_type text default 'single',
    p_min_choices integer default 1,
    p_max_choices integer default 1,
    p_allow_blank boolean default false
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_count integer;
    v_cost bigint;
    v_balance bigint;
    v_election_id uuid;
    v_voter jsonb;
    v_email text;
    v_phone text;
    v_n_candidates integer;
    v_min integer := coalesce(p_min_choices, 1);
    v_max integer := coalesce(p_max_choices, 1);
begin
    if p_creator is null or p_name is null or trim(p_name) = '' then
        return json_build_object('success', false, 'error', 'invalid_request', 'message', '생성자 또는 투표명이 올바르지 않습니다.');
    end if;

    if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) = 0 then
        return json_build_object('success', false, 'error', 'invalid_candidates', 'message', '투표 항목이 필요합니다.');
    end if;
    v_n_candidates := jsonb_array_length(p_candidates);

    if exists (select 1 from jsonb_array_elements(p_candidates) c
                where coalesce(c ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,64}$' or c ->> 'id' = 'BLANK'
                   or coalesce(trim(c ->> 'name'), '') = '')
       or (select count(distinct c ->> 'id') from jsonb_array_elements(p_candidates) c) <> v_n_candidates then
        return json_build_object('success', false, 'error', 'invalid_candidates', 'message', '투표 항목의 이름이나 식별자가 올바르지 않습니다.');
    end if;

    if p_ballot_type is null or p_ballot_type not in ('single', 'multi', 'rank', 'approve') then
        return json_build_object('success', false, 'error', 'invalid_ballot_type', 'message', '알 수 없는 투표 방식입니다.');
    end if;
    if p_ballot_type in ('single', 'approve') then
        v_min := 1; v_max := 1;
    elsif v_min < 1 or v_max < v_min or v_max > v_n_candidates then
        return json_build_object('success', false, 'error', 'invalid_choice_range',
                                 'message', format('선택 개수는 1개 이상, 항목 수(%s개) 이하로 정해주세요.', v_n_candidates));
    end if;

    if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
        return json_build_object('success', false, 'error', 'invalid_period', 'message', '투표 마감은 시작보다 뒤여야 합니다.');
    end if;
    if p_ends_at <= now() then
        return json_build_object('success', false, 'error', 'invalid_period', 'message', '투표 마감 시각이 이미 지났습니다.');
    end if;

    if p_voters is null or jsonb_typeof(p_voters) <> 'array' or jsonb_array_length(p_voters) = 0 then
        return json_build_object('success', false, 'error', 'invalid_voters', 'message', '유권자 명부가 필요합니다.');
    end if;

    if p_unit_price is null or p_unit_price < 0 then
        return json_build_object('success', false, 'error', 'invalid_unit_price', 'message', '유권자 단가가 올바르지 않습니다.');
    end if;

    v_count := jsonb_array_length(p_voters);
    v_cost := v_count::bigint * p_unit_price;

    insert into credit_accounts (user_id) values (p_creator)
    on conflict (user_id) do nothing;

    select balance into v_balance from credit_accounts where user_id = p_creator for update;

    if v_balance < v_cost then
        return json_build_object('success', false, 'error', 'insufficient_credits', 'message', '포인트 잔액이 부족합니다.',
                                 'balance', v_balance, 'required', v_cost);
    end if;

    insert into elections (name, description, candidates, total_voter_codes, created_by, starts_at, ends_at,
                           auth_mode, ballot_type, min_choices, max_choices, allow_blank)
    values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_candidates, v_count, p_creator,
            p_starts_at, p_ends_at,
            -- 전원 휴대폰이면 문자 링크 전용, 아니면 이메일 로그인 투표도 허용
            case when not exists (select 1 from jsonb_array_elements(p_voters) v
                                   where coalesce(regexp_replace(coalesce(v ->> 'phone', ''), '[^0-9]', '', 'g'), '') = '')
                 then 'sms_token' else 'email_link' end,
            p_ballot_type, v_min, v_max, coalesce(p_allow_blank, false))
    returning id into v_election_id;

    for v_voter in select * from jsonb_array_elements(p_voters) loop
        v_email := nullif(lower(trim(coalesce(v_voter ->> 'email', ''))), '');
        v_phone := nullif(regexp_replace(coalesce(v_voter ->> 'phone', ''), '[^0-9]', '', 'g'), '');

        if v_email is null and v_phone is null then
            raise exception 'voter_contact_missing' using errcode = 'check_violation';
        end if;

        insert into voter_registry (election_id, email, phone, voter_name)
        values (v_election_id, v_email, v_phone, nullif(trim(coalesce(v_voter ->> 'name', '')), ''));
    end loop;

    v_balance := v_balance - v_cost;

    update credit_accounts set balance = v_balance, updated_at = now() where user_id = p_creator;

    insert into credit_transactions (user_id, amount, balance_after, tx_type, election_id, memo, created_by)
    values (p_creator, -v_cost, v_balance, 'vote_creation', v_election_id,
            format('투표 생성: %s (유권자 %s명 × %s)', trim(p_name), v_count, p_unit_price), p_creator);

    return json_build_object('success', true, 'election_id', v_election_id,
                             'voter_count', v_count, 'cost', v_cost, 'balance', v_balance);
exception
    when unique_violation then
        return json_build_object('success', false, 'error', 'duplicate_voter',
                                 'message', '유권자 명부에 중복된 이메일 또는 전화번호가 있습니다.');
    when check_violation then
        return json_build_object('success', false, 'error', 'invalid_voter',
                                 'message', '이메일 또는 전화번호가 없는 유권자가 있습니다.');
end;
$$;

-- ---------------------------------------------------------------------
-- 9. 문자 링크 토큰 회전 / 되돌리기
--    회전: items [{id, hash}] → token_hash 교체, 이전 값 [{id, previous_hash}] 반환
--    되돌리기: items [{id, hash, previous_hash}] → 아직 hash 그대로인 행만 previous_hash 로
--    (발송이 실패한 수신자의 이전 링크를 살려 둔다)
-- ---------------------------------------------------------------------
create or replace function app_open_vote.rotate_voter_tokens(p_election_id uuid, p_tokens jsonb)
returns jsonb
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_previous jsonb;
begin
    if p_election_id is null or p_tokens is null or jsonb_typeof(p_tokens) <> 'array' then
        return '[]'::jsonb;
    end if;

    with t as (
        select (item ->> 'id')::uuid as id, item ->> 'hash' as hash
          from jsonb_array_elements(p_tokens) item
         where item ->> 'hash' ~ '^[a-f0-9]{64}$'
    ), locked as (
        select vr.id, vr.token_hash
          from voter_registry vr join t on t.id = vr.id
         where vr.election_id = p_election_id and vr.has_voted = false
         for update of vr
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'previous_hash', token_hash)), '[]'::jsonb)
      into v_previous
      from locked;

    update voter_registry vr
       set token_hash = t.hash
      from (select (item ->> 'id')::uuid as id, item ->> 'hash' as hash
              from jsonb_array_elements(p_tokens) item
             where item ->> 'hash' ~ '^[a-f0-9]{64}$') t
     where vr.id = t.id and vr.election_id = p_election_id and vr.has_voted = false;

    return v_previous;
end;
$$;

create or replace function app_open_vote.restore_voter_tokens(p_election_id uuid, p_tokens jsonb)
returns integer
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_count integer;
begin
    if p_election_id is null or p_tokens is null or jsonb_typeof(p_tokens) <> 'array' then
        return 0;
    end if;

    update voter_registry vr
       set token_hash = t.previous_hash
      from (select (item ->> 'id')::uuid as id, item ->> 'hash' as hash, item ->> 'previous_hash' as previous_hash
              from jsonb_array_elements(p_tokens) item) t
     where vr.id = t.id
       and vr.election_id = p_election_id
       and vr.token_hash = t.hash;
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. 권한 — 새 함수 전부 service_role 전용
-- ---------------------------------------------------------------------
revoke execute on function app_open_vote.guard_election_status() from public, anon, authenticated;
revoke execute on function app_open_vote.close_expired_elections() from public, anon, authenticated;
revoke execute on function app_open_vote.normalize_ballot_selection(jsonb, text, integer, integer, boolean, jsonb) from public, anon, authenticated;
revoke execute on function app_open_vote.cast_ballot_internal(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function app_open_vote.cast_link_ballot(text, jsonb, text) from public, anon, authenticated;
revoke execute on function app_open_vote.cast_registered_ballot(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function app_open_vote.cast_member_ballot(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function app_open_vote.get_election_results(uuid) from public, anon, authenticated;
revoke execute on function app_open_vote.get_public_ballot_ledger(uuid) from public, anon, authenticated;
revoke execute on function app_open_vote.create_billed_election(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz, text, integer, integer, boolean) from public, anon, authenticated;
revoke execute on function app_open_vote.rotate_voter_tokens(uuid, jsonb) from public, anon, authenticated;
revoke execute on function app_open_vote.restore_voter_tokens(uuid, jsonb) from public, anon, authenticated;

grant execute on function app_open_vote.close_expired_elections() to service_role;
grant execute on function app_open_vote.normalize_ballot_selection(jsonb, text, integer, integer, boolean, jsonb) to service_role;
grant execute on function app_open_vote.cast_ballot_internal(uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function app_open_vote.cast_link_ballot(text, jsonb, text) to service_role;
grant execute on function app_open_vote.cast_registered_ballot(uuid, uuid, text, jsonb, text) to service_role;
grant execute on function app_open_vote.cast_member_ballot(uuid, uuid, jsonb, text) to service_role;
grant execute on function app_open_vote.get_election_results(uuid) to service_role;
grant execute on function app_open_vote.get_public_ballot_ledger(uuid) to service_role;
grant execute on function app_open_vote.create_billed_election(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz, text, integer, integer, boolean) to service_role;
grant execute on function app_open_vote.rotate_voter_tokens(uuid, jsonb) to service_role;
grant execute on function app_open_vote.restore_voter_tokens(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 11. 권한 기준선 갱신: 클라이언트 롤 허용목록 0건
--     (이전 기준선은 ballots SELECT 2건을 허용하고 그것이 없으면 "과회수"로 봤다)
-- ---------------------------------------------------------------------
create or replace function app_open_vote.permission_baseline_violations()
returns table(check_name text, object_name text, detail text)
language sql
stable
set search_path = ''
as $$
with
client_roles(role_name) as (
    values ('anon'), ('authenticated')
),
client_grantees(grantee_oid, label) as (
    select 0::oid, 'PUBLIC'
    union all
    select r.oid, r.rolname from pg_roles r where r.rolname in ('anon', 'authenticated')
),
client_rel_grants as (
    select c.relname, c.relkind, g.label as grantee_label, acl.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    join client_grantees g on g.grantee_oid = acl.grantee
    where n.nspname = 'app_open_vote'
      and c.relkind in ('r', 'S')
)
select '표 그랜트',
       'app_open_vote.' || cg.relname,
       format('%s 가 %s 보유', cg.grantee_label, cg.privilege_type)
from client_rel_grants cg
where cg.relkind = 'r'
union all
select '시퀀스 그랜트',
       'app_open_vote.' || cg.relname,
       format('%s 가 %s 보유', cg.grantee_label, cg.privilege_type)
from client_rel_grants cg
where cg.relkind = 'S'
union all
select 'RLS 미적용',
       'app_open_vote.' || c.relname,
       'relrowsecurity = false'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app_open_vote'
  and c.relkind = 'r'
  and not c.relrowsecurity
union all
select '함수 ACL',
       p.oid::regprocedure::text,
       format('%s 가 EXECUTE 보유%s', r.role_name,
              case when p.prosecdef then ' (SECURITY DEFINER!)' else '' end)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join client_roles r
where n.nspname = 'app_open_vote'
  and has_function_privilege(r.role_name, p.oid, 'EXECUTE')
union all
select '함수 ACL(PUBLIC)',
       p.oid::regprocedure::text,
       'PUBLIC EXECUTE — 마이그레이션에 REVOKE ... FROM public 누락'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_open_vote'
  and (
      p.proacl is null
      or exists (
          select 1 from aclexplode(p.proacl) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
  )
union all
select '기본권한',
       format('app_open_vote / %s', d.defaclobjtype),
       format('%s 에 %s 자동부여', a.grantee::regrole::text, a.privilege_type)
from pg_default_acl d, aclexplode(d.defaclacl) a
where d.defaclnamespace = 'app_open_vote'::regnamespace
  and a.grantee::regrole::text in ('anon', 'authenticated')
union all
select '전역 기본권한',
       format('(전역) / %s', d.defaclobjtype),
       format('%s 에 %s — 3앱 합의 필요', a.grantee::regrole::text, a.privilege_type)
from pg_default_acl d, aclexplode(d.defaclacl) a
where d.defaclnamespace = 0
union all
select '실시간 발행',
       'app_open_vote.' || pt.tablename,
       'ballots/voter_registry 가 supabase_realtime 발행에 들어 있음'
from pg_publication_tables pt
where pt.pubname = 'supabase_realtime'
  and pt.schemaname = 'app_open_vote'
  and pt.tablename in ('ballots', 'voter_registry')
$$;

revoke execute on function app_open_vote.permission_baseline_violations() from public, anon, authenticated;
grant execute on function app_open_vote.permission_baseline_violations() to service_role;

select app_open_vote.assert_permission_baseline();
