-- TEST ONLY: checks the phase 2 reservation rules (run after rls_test.sql).
-- Each check raises an error (and stops the run) if a rule is broken.
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

-- Expect a call to fail with a message containing p_like.
create function pg_temp.expect_error(p_sql text, p_like text, what text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAILED: % (no error)', what;
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  if sqlerrm not ilike '%' || p_like || '%' then raise exception 'FAILED: % (got "%")', what, sqlerrm; end if;
  raise notice 'ok: %', what;
end $$;

-- ---- Holiday rule ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
-- 23 Sep 2026 14:00 + 24 h lands on Heritage Day (Thu 24 Sep) -> Fri 25 Sep 10:00.
select pg_temp.expect(
  (select due_at = '2026-09-25 10:00+02' and holiday = 'Heritage Day'
   from public.loan_due('2026-09-23 14:00+02', 24)), 'due date on Heritage Day moves to next working day 10:00');
-- 24 h from Wed 15 Dec lands on Day of Reconciliation (Wed 16 Dec) -> Thu 17 Dec 10:00.
select pg_temp.expect(
  (select due_at = '2026-12-17 10:00+02' from public.loan_due('2026-12-15 12:00+02', 24)),
  'due date on 16 Dec moves to 17 Dec');
-- Christmas + Day of Goodwill (Fri 25, Sat 26 Dec) -> skips the weekend to Mon 28 Dec.
select pg_temp.expect(
  (select due_at = '2026-12-28 10:00+02' from public.loan_due('2026-12-24 12:00+02', 24)),
  'due date on Christmas skips holiday and weekend');
select pg_temp.expect(
  (select due_at = '2026-09-22 18:00+02' and holiday is null from public.loan_due('2026-09-22 14:00+02', 4)),
  'ordinary due date is unchanged');

-- ---- Reserving ----
select pg_temp.expect_error($$ select public.reserve_item('goggles', 'S', 48) $$,
  'loan periods', 'loan period must be one of the item''s options');
select pg_temp.expect_error($$ select public.reserve_item('nope', 'S', 4) $$,
  'no longer exists', 'unknown item type is refused');

create temp table r1 as select public.reserve_item('goggles', 'S', 4) as res;
grant select on r1 to authenticated;
select pg_temp.expect((select (res ->> 'ok')::boolean from r1), 'student 1 reserves goggles at S');
select pg_temp.expect(
  (select r.status = 'active' and r.node_id = 'S' and r.pin ~ '^\d{4}$' and r.loan_hours = 4
          and r.hold_until between now() + interval '29 minutes' and now() + interval '31 minutes'
          and i.status = 'reserved' and c.item_id = i.id
   from public.reservations r join public.items i on i.id = r.item_id
   join public.compartments c on c.id = r.compartment_id), 'hold is 30 minutes, item reserved, compartment set');
select pg_temp.expect_error($$ select public.reserve_item('umbrella', 'S', 4) $$,
  'already have an item on hold', 'only one hold at a time');

-- Change locker: same PIN and end time, new node, old unit back in stock.
create temp table before_move as
  select id, item_id, pin, hold_until from public.reservations where status = 'active';
grant select on before_move to authenticated;
select public.change_reservation_node((select id from before_move), 'C');
select pg_temp.expect(
  (select r.node_id = 'C' and r.pin = b.pin and r.hold_until = b.hold_until and r.item_id <> b.item_id
   from public.reservations r join before_move b on b.id = r.id), 'change locker keeps PIN and end time');
select pg_temp.expect((select status = 'available' from public.items where id = (select item_id from before_move)),
  'old unit goes back into stock');
-- Calculators: Node C has none.
reset role;
select pg_temp.login('student2@demo.hub');
set role authenticated;
create temp table r2 as select public.reserve_item('calc', 'C', 24) as res;
select pg_temp.expect((select not (res ->> 'ok')::boolean and res ->> 'message' like '%no scientific calculator left%' from r2),
  'no stock gives a friendly message');
select pg_temp.expect_error($$ select public.cancel_reservation((select id from before_move)) $$,
  'already ended', 'student 2 cannot cancel student 1''s hold');
reset role;
select pg_temp.expect((select count(*) = 1 from public.reservation_attempts
                       where item_type_id = 'calc' and node_id = 'C' and not succeeded),
  'failed attempt is logged');

-- Staff can't reserve.
select pg_temp.login('tech@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.reserve_item('goggles', 'S', 4) $$,
  'only students', 'technician cannot reserve');
reset role;

-- Students can't call the internal helper or edit reservations directly.
select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select * from public.pick_free_unit('goggles', 'S') $$,
  'permission denied', 'internal helper is private');
with u as (update public.reservations set hold_until = now() + interval '1 day' returning 1)
select pg_temp.expect((select count(*) from u) = 0, 'student cannot extend a hold directly');

-- Cancel.
select public.cancel_reservation((select id from before_move));
select pg_temp.expect((select status = 'cancelled' from public.reservations where id = (select id from before_move)),
  'student cancels own hold');
select pg_temp.expect((select count(*) = 0 from public.items where status = 'reserved'), 'item back in stock after cancel');
select pg_temp.expect_error($$ select public.cancel_reservation((select id from before_move)) $$,
  'already ended', 'cancelling twice says it already ended');
reset role;

-- ---- Expiry ----
select pg_temp.login('student1@demo.hub');
set role authenticated;
select public.reserve_item('umbrella', 'SR', 4);
reset role;
update public.reservations set hold_until = now() - interval '1 second' where status = 'active';
set role authenticated;
select pg_temp.expect(public.release_expired_holds() = 1, 'expired hold is released');
select pg_temp.expect((select count(*) = 0 from public.items where status = 'reserved'), 'expired item back in stock');
select pg_temp.expect((select (public.reserve_item('umbrella', 'SR', 4) ->> 'ok')::boolean),
  'student can reserve again after a hold expires');
reset role;

select 'ALL RESERVATION CHECKS PASSED' as result;
