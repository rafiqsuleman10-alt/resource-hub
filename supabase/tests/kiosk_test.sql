-- TEST ONLY: checks the phase 3 kiosk, return and extension rules
-- (run after reservations_test.sql). Stops at the first broken rule.
\set ON_ERROR_STOP on

select public.reset_demo_data() as result;

create function pg_temp.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, false);
end $$;
create function pg_temp.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
end $$;
create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.expect_error(p_sql text, p_like text, what text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAILED: % (no error)', what;
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  if sqlerrm not ilike '%' || p_like || '%' then raise exception 'FAILED: % (got "%")', what, sqlerrm; end if;
  raise notice 'ok: %', what;
end $$;
-- Shared scratch space for ids between steps.
create temp table t (k text primary key, v jsonb);
grant all on t to anon, authenticated;

-- ---- Collecting with the card ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
select public.reserve_item('goggles', 'S', 4);
reset role;

select pg_temp.anon();
set role anon;
select pg_temp.expect((select count(*) = 3 from public.kiosk_nodes()), 'kiosk lists the three lockers');
select pg_temp.expect((select jsonb_array_length(public.kiosk_node('S') -> 'compartments') > 50), 'kiosk sees node S compartments');
select pg_temp.expect((select count(*) from public.items) = 0, 'kiosk (anon) still cannot read tables');
select pg_temp.expect_error($$ select public.kiosk_start_collect('C', 'CARD-0001') $$,
  'Your reservation is at Node S', 'card at the wrong locker says where the reservation is');
select pg_temp.expect_error($$ select public.kiosk_start_collect('S', 'CARD-0002') $$,
  'nothing on hold', 'card with no reservation');
select pg_temp.expect_error($$ select public.kiosk_start_collect('S', 'CARD-7777') $$,
  'don''t recognise', 'unknown card');
insert into t select 'col', public.kiosk_start_collect('S', ' card-0001 ');
select pg_temp.expect((select v ->> 'student' = 'Ayanda' and v ->> 'item_name' = 'Safety goggles'
                              and (v ->> 'compartment')::int > 0 from t where k = 'col'), 'card finds the reservation');

-- Door didn't open: fault logged, moved to another unit and compartment.
insert into t select 'prob', public.kiosk_collect_problem((select (v ->> 'reservation_id')::uuid from t where k = 'col'),
                                                          'door_did_not_open');
select pg_temp.expect((select (v ->> 'moved')::boolean and v ->> 'work_order' ~ '^WO-\d{4}$'
                              and v ->> 'compartment' <> (select v ->> 'compartment' from t where k = 'col')
                       from t where k = 'prob'), 'door problem gives a WO and a new compartment');
select pg_temp.expect_error($$ select public.kiosk_collect_problem(gen_random_uuid(), 'wrong_item') $$,
  'has ended', 'problem with an unknown reservation');

insert into t select 'loan', public.kiosk_confirm_collect((select (v ->> 'reservation_id')::uuid from t where k = 'col'));
select pg_temp.expect_error($$ select public.kiosk_confirm_collect((select (v ->> 'reservation_id')::uuid from t where k = 'col')) $$,
  'has ended', 'collecting twice is refused');
reset role;

select pg_temp.expect((select count(*) = 1 from public.loans l join public.items i on i.id = l.item_id
                       where i.item_type_id = 'goggles' and l.returned_at is null and l.from_node_id = 'S'
                         and i.status = 'on_loan' and i.current_node_id is null
                         and not exists (select 1 from public.compartments c where c.item_id = i.id)),
  'collection creates a loan and empties the compartment');
select pg_temp.expect((select count(*) = 1 from public.items i
                       join public.fault_reports f on f.item_id = i.id and f.reason = 'door_did_not_open'
                       join public.maintenance_records m on m.item_id = i.id
                       where i.status = 'in_service'), 'stuck unit is out of use with a maintenance record');

-- ---- Backup PIN, and the lockout ----
select pg_temp.login('student2@demo.hub');
set role authenticated;
select public.reserve_item('umbrella', 'SR', 4);
reset role;
insert into t select 'wrongpin', to_jsonb(lpad(((pin::int + 1) % 10000)::text, 4, '0'))
  from public.reservations where status = 'active';
select pg_temp.anon();
set role anon;
select pg_temp.expect((select public.kiosk_start_collect('SR', null, v #>> '{}') ->> 'error' like '%doesn''t match%'
                       from t where k = 'wrongpin'), 'wrong PIN');
reset role;
select pg_temp.expect((select (public.kiosk_start_collect('SR', null, pin) ->> 'item_name') = 'Umbrella'
                       from public.reservations where status = 'active'), 'right PIN finds the reservation');
select pg_temp.expect((select count(*) = 1 from public.kiosk_pin_failures), 'wrong PIN is recorded');
select public.kiosk_start_collect('SR', null, '0000') from generate_series(1, 4);
select pg_temp.expect_error($$ select public.kiosk_start_collect('SR', null, '0000') $$,
  'Too many wrong PINs', 'PIN entry locks after 5 wrong tries');
select pg_temp.expect((select (public.kiosk_start_collect('SR', 'CARD-0002') ->> 'item_name') = 'Umbrella'),
  'card still works during a PIN lockout');

-- ---- Returning ----
set role anon;
select pg_temp.expect_error($$ select public.kiosk_start_return('C', 'XX-9999') $$, 'can''t read that tag', 'unknown tag');
select pg_temp.expect_error($$ select public.kiosk_start_return('C', 'PJ-0171') $$, 'isn''t out on loan', 'tag not on loan');
-- Return the Vernier caliper (from S) to Node SR.
insert into t select 'ret', public.kiosk_start_return('SR', 'vc-0412');
select pg_temp.expect((select v ->> 'item_name' = 'Vernier caliper' from t where k = 'ret'), 'tag finds the loan');
insert into t select 'rprob', public.kiosk_return_problem((select (v ->> 'loan_id')::uuid from t where k = 'ret'),
                                                          (select (v ->> 'compartment_id')::uuid from t where k = 'ret'));
select pg_temp.expect((select (v ->> 'moved')::boolean and v ->> 'compartment_id' <> (select v ->> 'compartment_id' from t where k = 'ret')
                       from t where k = 'rprob'), 'return door problem opens another compartment');
select pg_temp.expect((select (public.kiosk_confirm_return((select (v ->> 'loan_id')::uuid from t where k = 'ret'),
                                                           (select (v ->> 'compartment_id')::uuid from t where k = 'rprob'))
                               ->> 'overdue') is not null), 'return accepted');
select pg_temp.expect_error($$ select public.kiosk_confirm_return((select (v ->> 'loan_id')::uuid from t where k = 'ret'),
                                                                 (select (v ->> 'compartment_id')::uuid from t where k = 'rprob')) $$,
  'already been returned', 'returning twice is refused');
insert into t select 'cond', public.kiosk_return_condition((select (v ->> 'loan_id')::uuid from t where k = 'ret'), 'damaged');
select pg_temp.expect((select v ->> 'work_order' ~ '^WO-\d{4}$' from t where k = 'cond'), 'damaged return gives a WO');
select pg_temp.expect_error($$ select public.kiosk_return_condition((select (v ->> 'loan_id')::uuid from t where k = 'ret'), 'good') $$,
  'already finished', 'condition can only be given once');
reset role;
select pg_temp.expect((select i.status = 'in_service' and i.current_node_id = 'SR' and c.node_id = 'SR'
                              and l.return_node_id = 'SR' and l.condition_on_return = 'damaged'
                       from public.items i join public.compartments c on c.item_id = i.id
                       join public.loans l on l.item_id = i.id and l.returned_at is not null
                       where i.tag = 'VC-0412' order by l.returned_at desc limit 1),
  'returned to SR, now lives at SR, out of use after damage');
select pg_temp.expect((select count(*) = 1 from public.fault_reports f join public.items i on i.id = f.item_id
                       where i.tag = 'VC-0412' and f.reason = 'damaged'), 'damage fault logged');

-- ---- Extending ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
insert into t select 'laptop', to_jsonb(l.id) from public.loans l join public.items i on i.id = l.item_id
  where i.tag = 'LT-0087' and l.returned_at is null;
select pg_temp.expect((select (public.extension_check((select (v #>> '{}')::uuid from t where k = 'laptop')) ->> 'allowed')::boolean),
  'laptop can be extended');
reset role;
-- Student 2 reserves a laptop at Node C, where student 1's laptop came from.
select pg_temp.login('student2@demo.hub');
set role authenticated;
select public.cancel_reservation(id) from public.reservations where status = 'active';
select public.reserve_item('laptop', 'C', 48);
reset role;
select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect((select public.extension_check((select (v #>> '{}')::uuid from t where k = 'laptop')) ->> 'reason' = 'waiting'),
  'no extension while someone is waiting at that locker');
select pg_temp.expect_error($$ select public.extend_loan((select (v #>> '{}')::uuid from t where k = 'laptop')) $$,
  'Someone is waiting', 'extend refused with a reason');
reset role;
select pg_temp.login('student2@demo.hub');
set role authenticated;
select public.cancel_reservation(id) from public.reservations where status = 'active';
reset role;
select pg_temp.login('student1@demo.hub');
set role authenticated;
insert into t select 'newdue', to_jsonb(public.extend_loan((select (v #>> '{}')::uuid from t where k = 'laptop')));
select pg_temp.expect((select (v #>> '{}')::timestamptz from t where k = 'newdue')
                       = (select (public.extension_check((select (v #>> '{}')::uuid from t where k = 'laptop')) ->> 'due_at')::timestamptz),
  'extend returns the new due time');
select pg_temp.expect_error($$ select public.extend_loan((select (v #>> '{}')::uuid from t where k = 'laptop')) $$,
  'already extended', 'only one extension');
reset role;
select pg_temp.expect((select extended from public.loans where id = (select (v #>> '{}')::uuid from t where k = 'laptop')),
  'loan is marked extended');
select pg_temp.login('student2@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.extension_check((select (v #>> '{}')::uuid from t where k = 'laptop')) $$,
  'already been returned', 'student 2 cannot see or extend student 1''s loan');
reset role;
select pg_temp.anon();
set role anon;
select pg_temp.expect_error($$ select public.extend_loan(gen_random_uuid()) $$, 'permission denied', 'kiosk cannot extend loans');
select pg_temp.expect_error($$ select public.open_fault(null, null, 'S', null, 'other', 'x') $$, 'permission denied',
  'internal fault helper is private');
reset role;

select 'ALL KIOSK CHECKS PASSED' as result;
