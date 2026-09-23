-- Resource Hub: demo data.
--
-- reset_demo_data() wipes all activity and stock and loads the sample data
-- from the design report again. The seed script (npm run seed) calls it after
-- creating the demo logins, and the technician's "Reset demo data" button will
-- call it too. It is safe to run as many times as you like.
--
-- Only a technician, the seed script (service role key) or someone running it
-- directly in the Supabase SQL editor can call it.

create or replace function public.reset_demo_data()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role     text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_student1   uuid;
  v_student2   uuid;
  v_tech       uuid;
  v_maint      uuid;
  sa_today     date := (now() at time zone 'Africa/Johannesburg')::date;
  t            record;
  n            record;
  i            integer;
  d            integer;
  per_day      integer;
  v_item       record;
  v_issued     timestamptz;
  v_hours      integer;
  v_item_id    uuid;
  total_items  integer;
begin
  -- Who may run this?
  if jwt_role not in ('service_role', '')            -- '' = SQL editor / psql (no API token)
     and coalesce(public.app_role(), '') <> 'technician' then
    raise exception 'Only a technician can reset the demo data.';
  end if;

  select id into v_student1 from auth.users where email = 'student1@demo.hub';
  select id into v_student2 from auth.users where email = 'student2@demo.hub';
  select id into v_tech     from auth.users where email = 'tech@demo.hub';
  select id into v_maint    from auth.users where email = 'maint@demo.hub';
  if v_student1 is null or v_student2 is null or v_tech is null or v_maint is null then
    raise exception 'Demo logins are missing. Run "npm run seed" first to create them.';
  end if;

  -- Same "random" numbers every time, so the demo always looks the same.
  perform setseed(0.2026);

  -- 1. Wipe everything (profiles included; they are recreated below).
  truncate public.maintenance_records, public.fault_reports, public.loans,
           public.reservation_attempts, public.reservations, public.compartments,
           public.items, public.walk_times, public.item_types, public.public_holidays,
           public.locker_nodes, public.zones, public.profiles
    restart identity cascade;
  perform setval('public.work_order_seq', 1001, false);

  -- 2. Campus zones (position = 0 north ... 1 south).
  insert into public.zones (id, name, position) values
    ('S',  'S-Blocks',          0.10),
    ('A',  'North residences',  0.06),
    ('C',  'Library',           0.30),
    ('E',  'Berea Residence',   0.38),
    ('D',  'Admin & clinic',    0.47),
    ('H',  'Sports centre',     0.58),
    ('SR', 'South residences',  0.90);

  -- 3. Locker nodes. Maintenance & Facilities is the servicing hub, not a locker.
  insert into public.locker_nodes (id, name, place, position, battery_backup_ok, online) values
    ('S',  'Node S',  'S-Blocks, ground floor',   0.12, true, true),
    ('C',  'Node C',  'Library entrance',         0.31, true, true),
    ('SR', 'Node SR', 'South residences, Gate 6', 0.88, true, true);

  -- 4. Walking minutes from each zone to S, C and SR.
  insert into public.walk_times (zone_id, node_id, minutes)
  select z.zone_id, v.node_id, v.minutes
  from (values ('S',1,3,9), ('A',4,5,10), ('C',3,1,7), ('E',4,3,6),
               ('D',5,3,5), ('H',6,4,4), ('SR',9,7,1)) as z(zone_id, s, c, sr)
  cross join lateral (values ('S', z.s), ('C', z.c), ('SR', z.sr)) as v(node_id, minutes);

  -- 5. Item types. ABC = share of stock value; FSN = fast / slow / non-moving demand.
  --    loan_hours_options: 4 = four hours, 24 = overnight / 1 day, 48 = 2 days, 72 = 3 days.
  insert into public.item_types
    (id, name, category, unit_cost_zar, criticality, abc_class, fsn_class, loan_hours_options, service_after_loans)
  values
    ('calc',     'Scientific calculator', 'Measuring',       450,   'medium', 'B', 'F', '{24,48}', 100),
    ('laptop',   'Laptop',                'Tech',            9500,  'medium', 'A', 'F', '{48,72}', 40),
    ('tablet',   'Tablet',                'Tech',            5200,  'medium', 'A', 'S', '{48,72}', 40),
    ('charger',  'Charger / power bank',  'Tech',            350,   'low',    'B', 'F', '{4,24}',  60),
    ('cable',    'HDMI / Ethernet cable', 'Tech',            150,   'low',    'C', 'F', '{4,24}',  100),
    ('coat',     'Laboratory coat',       'Lab & safety',    320,   'safety', 'C', 'F', '{24,48}', 60),
    ('goggles',  'Safety goggles',        'Lab & safety',    120,   'safety', 'C', 'F', '{4,24}',  100),
    ('hardhat',  'Hard hat',              'Lab & safety',    180,   'safety', 'C', 'S', '{4,24}',  60),
    ('caliper',  'Vernier caliper',       'Measuring',       650,   'medium', 'C', 'S', '{4,24}',  60),
    ('micro',    'Micrometer',            'Measuring',       900,   'medium', 'C', 'S', '{4,24}',  60),
    ('dslr',     'DSLR camera',           'Camera & AV',     12000, 'medium', 'A', 'S', '{48,72}', 40),
    ('tripod',   'Tripod',                'Camera & AV',     800,   'low',    'C', 'S', '{48,72}', 60),
    ('proj',     'Projector',             'Camera & AV',     7500,  'medium', 'B', 'N', '{4,24}',  60),
    ('umbrella', 'Umbrella',              'Everyday',        150,   'low',    'C', 'F', '{4,24}',  100),
    ('sport',    'Sports equipment kit',  'Everyday',        1200,  'low',    'B', 'S', '{4}',     60),
    ('wheel',    'Wheelchair',            'Health & access', 4500,  'safety', 'B', 'N', '{24,48}', 25),
    ('firstaid', 'First aid kit',         'Health & access', 600,   'safety', 'C', 'N', '{4}',     60);

  -- 6. One item row per physical unit, with a tag such as VC-0412.
  --    stock = units at S / C / SR; size = compartment size it needs.
  drop table if exists seed_stock;
  create temporary table seed_stock (
    type_id text, prefix text, first_no integer, s integer, c integer, sr integer, size text
  ) on commit drop;
  insert into seed_stock values
    ('calc',     'SC', 201, 9, 0, 4, 'S'),
    ('laptop',   'LT',  81, 4, 6, 2, 'M'),
    ('tablet',   'TB', 301, 3, 4, 3, 'M'),
    ('charger',  'PB', 501, 5, 6, 5, 'S'),
    ('cable',    'CB', 601, 3, 4, 2, 'S'),
    ('coat',     'LC', 701, 7, 2, 3, 'M'),
    ('goggles',  'SG', 801, 8, 3, 4, 'S'),
    ('hardhat',  'HH', 901, 3, 1, 2, 'M'),
    ('caliper',  'VC', 410, 3, 1, 1, 'S'),
    ('micro',    'MC', 451, 2, 1, 1, 'S'),
    ('dslr',     'DC', 121, 1, 3, 1, 'M'),
    ('tripod',   'TP', 151, 1, 3, 1, 'L'),
    ('proj',     'PJ', 171, 1, 1, 0, 'L'),
    ('umbrella', 'UM', 351, 3, 3, 4, 'M'),
    ('sport',    'SK', 381, 0, 1, 4, 'L'),
    ('wheel',    'WC',  11, 1, 1, 1, 'L'),
    ('firstaid', 'FA',  21, 1, 1, 1, 'M');

  for t in select * from seed_stock loop
    i := t.first_no;
    for n in select * from (values ('S', t.s), ('C', t.c), ('SR', t.sr)) as x(node_id, units) loop
      for k in 1 .. n.units loop
        insert into public.items (item_type_id, tag, home_node_id, current_node_id, status, loan_count)
        select t.type_id, t.prefix || '-' || lpad(i::text, 4, '0'), n.node_id, n.node_id, 'available',
               floor(random() * (it.service_after_loans * 0.8))::int
        from public.item_types it where it.id = t.type_id;
        i := i + 1;
      end loop;
    end loop;
  end loop;

  -- 7. Compartments: one per unit plus a few spares of each size at every node,
  --    numbered small first. Then place each item in a free compartment of its size.
  insert into public.compartments (node_id, number, size)
  select node_id, row_number() over (partition by node_id order by size_rank, k), size
  from (
    select x.node_id, x.size, case x.size when 'S' then 1 when 'M' then 2 else 3 end as size_rank, g.k
    from (
      select it.home_node_id as node_id, ss.size, count(*)
             + case it.home_node_id when 'S' then 2 else 1 end as needed
      from public.items it join seed_stock ss on ss.type_id = it.item_type_id
      group by it.home_node_id, ss.size
    ) x
    cross join lateral generate_series(1, x.needed) as g(k)
  ) c;

  update public.compartments cp
  set item_id = placed.item_id
  from (
    select c.id as compartment_id, i2.item_id
    from (
      select cp2.id, cp2.node_id, cp2.size,
             row_number() over (partition by cp2.node_id, cp2.size order by cp2.number) as rn
      from public.compartments cp2
    ) c
    join (
      select it.id as item_id, it.home_node_id as node_id, ss.size,
             row_number() over (partition by it.home_node_id, ss.size order by it.tag) as rn
      from public.items it join seed_stock ss on ss.type_id = it.item_type_id
    ) i2 on i2.node_id = c.node_id and i2.size = c.size and i2.rn = c.rn
  ) placed
  where cp.id = placed.compartment_id;

  -- 8. Demo people. Made-up names, fake card numbers, no personal information.
  insert into public.profiles (id, display_name, role, card_uid, faculty, year_of_study, near_zone_id) values
    (v_student1, 'Ayanda (demo student 1)', 'student',     'CARD-0001', 'Engineering and the Built Environment', 3, 'S'),
    (v_student2, 'Lerato (demo student 2)', 'student',     'CARD-0002', 'Applied Sciences',                      2, 'SR'),
    (v_tech,     'Demo technician',         'technician',  'CARD-9001', null, null, null),
    (v_maint,    'Demo maintenance officer','maintenance', 'CARD-9002', null, null, null);

  -- 9. South African public holidays (Sunday holidays move to the Monday).
  insert into public.public_holidays (day, name) values
    ('2026-01-01', 'New Year''s Day'),   ('2026-03-21', 'Human Rights Day'),
    ('2026-04-03', 'Good Friday'),       ('2026-04-06', 'Family Day'),
    ('2026-04-27', 'Freedom Day'),       ('2026-05-01', 'Workers'' Day'),
    ('2026-06-16', 'Youth Day'),         ('2026-08-09', 'National Women''s Day'),
    ('2026-08-10', 'Public holiday (Women''s Day observed)'),
    ('2026-09-24', 'Heritage Day'),      ('2026-12-16', 'Day of Reconciliation'),
    ('2026-12-25', 'Christmas Day'),     ('2026-12-26', 'Day of Goodwill'),
    ('2027-01-01', 'New Year''s Day'),   ('2027-03-21', 'Human Rights Day'),
    ('2027-03-22', 'Public holiday (Human Rights Day observed)'),
    ('2027-03-26', 'Good Friday'),       ('2027-03-29', 'Family Day'),
    ('2027-04-27', 'Freedom Day'),       ('2027-05-01', 'Workers'' Day'),
    ('2027-06-16', 'Youth Day'),         ('2027-08-09', 'National Women''s Day'),
    ('2027-09-24', 'Heritage Day'),      ('2027-12-16', 'Day of Reconciliation'),
    ('2027-12-25', 'Christmas Day'),     ('2027-12-26', 'Day of Goodwill'),
    ('2027-12-27', 'Public holiday (Day of Goodwill observed)');

  -- 10. Loan history for the last 14 days so the dashboard chart isn't empty.
  --     All of it is returned, in good condition, to a random node.
  select count(*) into total_items from public.items;
  for d in 1 .. 14 loop
    -- Fewer loans at weekends.
    per_day := case when extract(isodow from sa_today - d) in (6, 7)
                    then 2 + floor(random() * 4)::int
                    else 8 + floor(random() * 10)::int end;
    for i in 1 .. per_day loop
      select it.id, t2.loan_hours_options into v_item
      from public.items it join public.item_types t2 on t2.id = it.item_type_id
      offset floor(random() * total_items)::int limit 1;
      v_hours  := v_item.loan_hours_options[1 + floor(random() * array_length(v_item.loan_hours_options, 1))::int];
      v_issued := ((sa_today - d) + time '08:00' + (random() * interval '8 hours')) at time zone 'Africa/Johannesburg';
      insert into public.loans (student_id, item_id, issued_at, due_at, returned_at, return_node_id, condition_on_return)
      values (case when random() < 0.5 then v_student1 else v_student2 end,
              v_item.id, v_issued, v_issued + make_interval(hours => v_hours),
              least(v_issued + make_interval(hours => v_hours) - random() * interval '2 hours', now() - interval '1 hour'),
              (array['S','C','SR'])[1 + floor(random() * 3)::int],
              'good');
    end loop;
  end loop;

  -- Reservation attempts: roughly one in twelve could not be met.
  insert into public.reservation_attempts (student_id, item_type_id, node_id, succeeded, created_at)
  select l.student_id, it.item_type_id, it.home_node_id, true, l.issued_at - interval '20 minutes'
  from public.loans l join public.items it on it.id = l.item_id;
  insert into public.reservation_attempts (student_id, item_type_id, node_id, succeeded, created_at)
  select case when random() < 0.5 then v_student1 else v_student2 end, 'proj', null, false,
         ((sa_today - g) + time '10:00') at time zone 'Africa/Johannesburg'
  from generate_series(0, 13) g;

  -- 11. Student 1's current loans (as in the prototype):
  --     a Vernier caliper due today at 16:00 and a laptop due tomorrow.
  select id into v_item_id from public.items where tag = 'VC-0412';
  update public.compartments set item_id = null where item_id = v_item_id;
  update public.items set status = 'on_loan', current_node_id = null, loan_count = loan_count + 1 where id = v_item_id;
  insert into public.loans (student_id, item_id, issued_at, due_at)
  values (v_student1, v_item_id,
          ((sa_today - 1) + time '09:10') at time zone 'Africa/Johannesburg',
          (sa_today + time '16:00') at time zone 'Africa/Johannesburg');

  select id into v_item_id from public.items where tag = 'LT-0087';
  update public.compartments set item_id = null where item_id = v_item_id;
  update public.items set status = 'on_loan', current_node_id = null, loan_count = loan_count + 1 where id = v_item_id;
  insert into public.loans (student_id, item_id, issued_at, due_at)
  values (v_student1, v_item_id,
          ((sa_today - 1) + time '11:30') at time zone 'Africa/Johannesburg',
          ((sa_today + 1) + time '11:30') at time zone 'Africa/Johannesburg');

  -- 12. So maintenance has something to look at: one open fault and one
  --     item that has just reached its service threshold.
  select id into v_item_id from public.items where tag = 'HH-0905';
  update public.compartments set item_id = null where item_id = v_item_id;
  update public.items set status = 'in_service', current_node_id = null where id = v_item_id;
  insert into public.fault_reports (reporter_id, item_id, node_id, reason, note, status, created_at)
  values (v_student2, v_item_id, 'SR', 'damaged', 'Chin strap buckle is cracked.', 'open', now() - interval '3 hours');
  insert into public.maintenance_records (item_id, trigger, opened_at, notes)
  values (v_item_id, 'fault_report', now() - interval '3 hours', 'WO-1001: chin strap buckle cracked.');

  select id into v_item_id from public.items where tag = 'SC-0203';
  update public.compartments set item_id = null where item_id = v_item_id;
  update public.items set status = 'in_service', current_node_id = null, loan_count = 100 where id = v_item_id;
  insert into public.maintenance_records (item_id, trigger, opened_at, notes)
  values (v_item_id, 'usage_threshold', now() - interval '1 day', 'Reached 100 loans: routine service due.');

  return format('Demo data loaded: %s items, %s compartments, %s loans.',
                (select count(*) from public.items),
                (select count(*) from public.compartments),
                (select count(*) from public.loans));
end;
$$;

revoke execute on function public.reset_demo_data() from public, anon;
grant execute on function public.reset_demo_data() to authenticated, service_role;
