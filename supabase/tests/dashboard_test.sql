-- TEST ONLY: checks the phase 5 stock-moving rule (run after maintenance_test.sql).
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

select pg_temp.login('student1@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.move_stock('calc', 'S', 'C', 2) $$, 'Only technicians', 'students cannot move stock');
reset role;
select pg_temp.login('maint@demo.hub');
set role authenticated;
select pg_temp.expect_error($$ select public.move_stock('calc', 'S', 'C', 2) $$, 'Only technicians', 'maintenance cannot move stock');
reset role;

select pg_temp.login('tech@demo.hub');
set role authenticated;
select pg_temp.expect(public.move_stock('calc', 'S', 'C', 4) = 4, 'technician moves 4 calculators from S to C');
select pg_temp.expect((select count(*) = 4 from public.items i join public.compartments c on c.item_id = i.id
                       where i.item_type_id = 'calc' and i.current_node_id = 'C' and c.node_id = 'C'),
  'the 4 are in compartments at C');
select pg_temp.expect((select count(*) = 4 from public.items where item_type_id = 'calc' and current_node_id = 'S' and status = 'available'),
  '4 free calculators left at S (9 minus 1 in service minus 4)');
select pg_temp.expect(public.move_stock('proj', 'C', 'SR', 5) = 1, 'moves only what is free');
select pg_temp.expect_error($$ select public.move_stock('proj', 'C', 'SR', 1) $$, 'Nothing was moved', 'nothing left to move');
select pg_temp.expect_error($$ select public.move_stock('calc', 'S', 'S', 1) $$, 'two different lockers', 'same locker refused');
reset role;

select 'ALL DASHBOARD CHECKS PASSED' as result;
