-- TEST ONLY: loads the demo data and checks the security rules.
-- Each check raises an error (and stops the run) if a rule is broken.
\set ON_ERROR_STOP on

select public.reset_demo_data() as result;
-- Running it twice must also work.
select public.reset_demo_data() as result;

select node_id, count(*) as compartments, count(item_id) as filled
from public.compartments group by node_id order by node_id;
select home_node_id as node, count(*) as units from public.items group by 1 order by 1;
select status, count(*) from public.items group by 1 order by 1;
select count(*) filter (where returned_at is null) as open_loans,
       count(*) filter (where returned_at is not null) as past_loans from public.loans;

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

-- ---- Not logged in (anon) ----
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.expect((select count(*) from public.items) = 0, 'anon sees no items');
select pg_temp.expect((select count(*) from public.loans) = 0, 'anon sees no loans');
select pg_temp.expect((select count(*) from public.profiles) = 0, 'anon sees no profiles');
reset role;

-- ---- Student 1 ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect((select count(*) from public.items) > 100, 'student sees the catalogue');
select pg_temp.expect((select count(*) from public.loans
                       where student_id <> auth.uid()) = 0, 'student sees only own loans');
select pg_temp.expect((select count(*) from public.loans where returned_at is null) = 2,
                      'student 1 has two open loans');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'student sees only own profile');
select pg_temp.expect((select count(*) from public.fault_reports) = 0, 'student 1 cannot see student 2''s fault');
select pg_temp.expect((select count(*) from public.maintenance_records) = 0, 'student sees no maintenance records');
select pg_temp.expect((select count(*) from public.reservation_attempts) = 0, 'student sees no attempts');
select pg_temp.expect(public.app_role() = 'student', 'app_role() says student');

-- Allowed: change own "You're near" zone.
update public.profiles set near_zone_id = 'C' where id = auth.uid();
select pg_temp.expect((select near_zone_id from public.profiles where id = auth.uid()) = 'C',
                      'student can change own near zone');

-- Not allowed: make yourself a technician.
do $$ begin
  update public.profiles set role = 'technician' where id = auth.uid();
  raise exception 'FAILED: student changed own role';
exception when insufficient_privilege then raise notice 'ok: student cannot change own role';
end $$;

-- Not allowed: edit stock directly (silently affects 0 rows under RLS).
with u as (update public.items set status = 'retired' returning 1)
select pg_temp.expect((select count(*) from u) = 0, 'student cannot edit items');

-- Allowed: report a fault as yourself. Not allowed: as someone else.
insert into public.fault_reports (reporter_id, node_id, reason) values (auth.uid(), 'S', 'other');
select pg_temp.expect((select work_order_ref from public.fault_reports) ~ '^WO-\d{4}$', 'fault gets a WO-#### reference');
do $$ begin
  insert into public.fault_reports (reporter_id, node_id, reason)
  values ((select id from auth.users where email = 'student2@demo.hub'), 'S', 'other');
  raise exception 'FAILED: student reported a fault as someone else';
exception when insufficient_privilege then raise notice 'ok: student cannot report as someone else';
end $$;

-- Not allowed: reset the demo data.
do $$ begin
  perform public.reset_demo_data();
  raise exception 'FAILED: student reset the demo data';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: student cannot reset demo data';
end $$;
reset role;

-- ---- Maintenance officer ----
select pg_temp.login('maint@demo.hub');
set role authenticated;
select pg_temp.expect((select count(*) from public.fault_reports) = 2, 'maintenance sees all faults');
select pg_temp.expect((select count(*) from public.maintenance_records) = 2, 'maintenance sees maintenance records');
select pg_temp.expect((select count(*) from public.loans) = 0, 'maintenance cannot see loans');
select pg_temp.expect((select count(*) from public.reservations) = 0, 'maintenance cannot see reservations');
reset role;

-- ---- Technician ----
select pg_temp.login('tech@demo.hub');
set role authenticated;
select pg_temp.expect((select count(*) from public.loans) > 50, 'technician sees all loans');
select pg_temp.expect((select count(*) from public.profiles) = 4, 'technician sees all profiles');
select pg_temp.expect((select count(*) from public.reservation_attempts) > 50, 'technician sees attempts');
update public.locker_nodes set battery_backup_ok = false where id = 'SR';
select pg_temp.expect((select not battery_backup_ok from public.locker_nodes where id = 'SR'),
                      'technician can change a node');
select public.reset_demo_data() as technician_reset;
select pg_temp.expect((select battery_backup_ok from public.locker_nodes where id = 'SR'),
                      'technician can reset demo data');
reset role;

select 'ALL CHECKS PASSED' as result;
