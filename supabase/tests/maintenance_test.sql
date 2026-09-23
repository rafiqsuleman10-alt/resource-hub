-- TEST ONLY: checks the phase 4 fault, maintenance and usage-threshold rules
-- (run after kiosk_test.sql). Stops at the first broken rule.
\set ON_ERROR_STOP on

select public.reset_demo_data() as result;

create function pg_temp.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'role', 'authenticated')::text, false);
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
create temp table t (k text primary key, v jsonb);
grant all on t to anon, authenticated;
insert into t select 'laptop_loan', to_jsonb(l.id) from public.loans l join public.items i on i.id = l.item_id
  where i.tag = 'LT-0087' and l.returned_at is null;

-- ---- Students report faults ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.report_fault(null, 'x', (select (v #>> '{}')::uuid from t where k = 'laptop_loan')) $$,
  'Choose what happened', 'reason is required');
select pg_temp.expect_error($$ select public.report_fault('other', 'x') $$, 'which locker', 'locker fault needs a node');
select pg_temp.expect_error($$ select public.report_fault('damaged', 'x', null, 'S', 'someone-else/photo.jpg') $$,
  'doesn''t belong to you', 'photo must be in your own folder');
insert into t select 'wo_laptop', to_jsonb(public.report_fault('missing_part', '  Charger missing.  ',
  (select (v #>> '{}')::uuid from t where k = 'laptop_loan'), null, auth.uid()::text || '/abc.jpg'));
select pg_temp.expect((select v #>> '{}' ~ '^WO-\d{4}$' from t where k = 'wo_laptop'), 'loan fault gets a WO');
insert into t select 'wo_locker', to_jsonb(public.report_fault('other', null, null, 'C'));
select pg_temp.expect((select count(*) = 2 from public.fault_reports), 'student sees own two reports');
select pg_temp.expect((select note = 'Charger missing.' and node_id = 'C' and photo_path like '%/abc.jpg'
                       from public.fault_reports where work_order_ref = (select v #>> '{}' from t where k = 'wo_laptop')),
  'note trimmed, node from loan, photo saved');
reset role;
select pg_temp.expect((select status = 'on_loan' from public.items where tag = 'LT-0087'), 'item stays on loan after a report');

select pg_temp.login('tech@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.report_fault('other', null, null, 'S') $$, 'Only students', 'staff use other screens');
reset role;

-- ---- Returning an item with an open fault sends it to maintenance ----
set role anon;
insert into t select 'ret', public.kiosk_start_return('SR', 'LT-0087');
insert into t select 'retdone', public.kiosk_confirm_return((select (v ->> 'loan_id')::uuid from t where k = 'ret'),
                                                            (select (v ->> 'compartment_id')::uuid from t where k = 'ret'));
reset role;
select pg_temp.expect((select status = 'in_service' and current_node_id = 'SR' from public.items where tag = 'LT-0087'),
  'returned item with a fault goes to maintenance');

-- ---- Usage threshold ----
-- The caliper (60 loans before a service) reaches its count on this loan.
update public.items set loan_count = 60 where tag = 'VC-0412';
set role anon;
insert into t select 'ret2', public.kiosk_start_return('C', 'VC-0412');
insert into t select 'ret2done', public.kiosk_confirm_return((select (v ->> 'loan_id')::uuid from t where k = 'ret2'),
                                                             (select (v ->> 'compartment_id')::uuid from t where k = 'ret2'));
reset role;
select pg_temp.expect((select (v ->> 'service_due')::boolean from t where k = 'ret2done'), 'kiosk is told a service is due');
select pg_temp.expect((select i.status = 'in_service' and m.trigger = 'usage_threshold' and m.closed_at is null
                       from public.items i join public.maintenance_records m on m.item_id = i.id
                       where i.tag = 'VC-0412'), 'item at its service count goes to maintenance');
select pg_temp.expect((select not (v ->> 'service_due')::boolean from t where k = 'retdone'),
  'no service flag when the count is not reached');

-- ---- Maintenance works through them ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.start_work_order((select id from public.fault_reports limit 1)) $$,
  'Only maintenance', 'students cannot manage work orders');
reset role;

select pg_temp.login('maint@demo.hub');
set role authenticated;
select pg_temp.expect((select count(*) = 3 from public.fault_reports where status = 'open'), 'maintenance sees 3 open work orders');
select public.start_work_order(id) from public.fault_reports where work_order_ref = (select v #>> '{}' from t where k = 'wo_laptop');
select pg_temp.expect((select f.status = 'in_progress' and m.started_at is not null
                       from public.fault_reports f join public.maintenance_records m on m.fault_report_id = f.id
                       where f.work_order_ref = (select v #>> '{}' from t where k = 'wo_laptop')), 'work order in progress');
select pg_temp.expect_error($$ select public.start_work_order(id) from public.fault_reports where status = 'in_progress' $$,
  'already in progress', 'starting twice is refused');
insert into t select 'closed', public.close_work_order(id, 'Replaced charger.')
  from public.fault_reports where work_order_ref = (select v #>> '{}' from t where k = 'wo_laptop');
select pg_temp.expect((select (v ->> 'compartment') is not null from t where k = 'closed'), 'closing gives a compartment');
select pg_temp.expect((select i.status = 'available' and i.current_node_id = 'S' and c.node_id = 'S'
                              and c.number = (select (v ->> 'compartment')::int from t where k = 'closed')
                       from public.items i join public.compartments c on c.item_id = i.id where i.tag = 'LT-0087'),
  'closed item is back in stock at Node S');
select pg_temp.expect((select not exists (select 1 from public.compartments c join public.items i on i.id = c.item_id
                                          where i.tag = 'LT-0087' and c.node_id = 'SR')), 'old SR compartment emptied');
select pg_temp.expect((select m.notes like '%Closed: Replaced charger.%' and m.closed_at is not null
                       from public.maintenance_records m join public.items i on i.id = m.item_id
                       where i.tag = 'LT-0087' and m.trigger = 'fault_report'), 'closing note saved');

-- The seeded hard hat fault (WO-1001): old-style record matched by WO number.
select public.close_work_order(id) from public.fault_reports where work_order_ref = 'WO-1001';
select pg_temp.expect((select status = 'available' and current_node_id = 'S' from public.items where tag = 'HH-0905'),
  'seeded hard hat back in stock');
select pg_temp.expect((select count(*) = 0 from public.maintenance_records m join public.items i on i.id = m.item_id
                       where i.tag = 'HH-0905' and m.closed_at is null), 'its maintenance record is closed');

-- A locker fault with no item just closes.
select pg_temp.expect((select (public.close_work_order(id) ->> 'compartment') is null from public.fault_reports
                       where work_order_ref = (select v #>> '{}' from t where k = 'wo_locker')), 'locker fault closes');

-- Routine services.
select public.start_service(m.id) from public.maintenance_records m join public.items i on i.id = m.item_id
  where i.tag = 'SC-0203' and m.trigger = 'usage_threshold';
select pg_temp.expect((select (public.close_service(m.id, 'Cleaned, new battery.') ->> 'compartment') is not null
                       from public.maintenance_records m join public.items i on i.id = m.item_id
                       where i.tag = 'SC-0203' and m.trigger = 'usage_threshold'), 'service closes');
select pg_temp.expect((select status = 'available' and loan_count = 0 and current_node_id = 'S'
                       from public.items where tag = 'SC-0203'), 'serviced calculator back at S with count reset');
select pg_temp.expect_error($$ select public.close_service(m.id) from public.maintenance_records m join public.items i on i.id = m.item_id
                                where i.tag = 'SC-0203' $$, 'already closed', 'closing twice is refused');
-- The caliper still needs its service.
select pg_temp.expect((select status = 'in_service' from public.items where tag = 'VC-0412'), 'other items untouched');
reset role;

select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect((select count(*) = 2 from public.fault_reports where status = 'closed'), 'student sees their reports closed');
reset role;

select 'ALL MAINTENANCE CHECKS PASSED' as result;
