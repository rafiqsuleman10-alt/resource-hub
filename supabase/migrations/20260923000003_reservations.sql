-- Resource Hub, phase 2: reserving equipment.
--
-- Plain-language summary
--   * A student reserves one item at a time. The item is held in its
--     compartment for 30 minutes, then goes back into stock by itself.
--   * Students can't edit stock or reservations directly (see the security
--     rules in the first migration). Instead they call the functions below,
--     which check who is asking and apply the rules in one place.
--   * Every reservation attempt is logged, successful or not, for the
--     technician's fill-rate figure.
--   * loan_due() works out when a loan is due back, moving it off public
--     holidays to 10:00 on the next working day.

-- How long the student chose to borrow for (one of the item type's options).
alter table public.reservations add column loan_hours integer not null default 24 check (loan_hours > 0);
alter table public.reservations alter column loan_hours drop default;

-- One active hold per student, and never two holds on the same item.
create unique index reservations_one_active_per_student on public.reservations (student_id) where status = 'active';
create unique index reservations_one_active_per_item on public.reservations (item_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Due dates and public holidays
-- ---------------------------------------------------------------------------

-- When a loan that starts at p_start for p_hours is due back. If that falls on
-- a public holiday (South African time), it moves to 10:00 on the next day
-- that is neither a weekend nor a holiday; "holiday" names the holiday.
create function public.loan_due(p_start timestamptz, p_hours integer)
returns table (due_at timestamptz, holiday text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_due  timestamptz := p_start + make_interval(hours => p_hours);
  v_day  date := (v_due at time zone 'Africa/Johannesburg')::date;
  v_name text;
begin
  select h.name into v_name from public.public_holidays h where h.day = v_day;
  if v_name is null then
    return query select v_due, null::text;
    return;
  end if;
  loop
    v_day := v_day + 1;
    exit when extract(isodow from v_day) < 6
          and not exists (select 1 from public.public_holidays h where h.day = v_day);
  end loop;
  return query select (v_day + time '10:00') at time zone 'Africa/Johannesburg', v_name;
end;
$$;

revoke execute on function public.loan_due(timestamptz, integer) from public, anon;
grant execute on function public.loan_due(timestamptz, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Holds that run out
-- ---------------------------------------------------------------------------

-- Ends every hold whose 30 minutes are up and puts the item back in stock.
-- Pages call it before showing stock, so an expired hold never blocks anyone.
-- Returns how many holds it ended.
create function public.release_expired_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with ended as (
    update public.reservations set status = 'expired'
    where status = 'active' and hold_until <= now()
    returning item_id
  )
  update public.items i set status = 'available'
  from ended where i.id = ended.item_id and i.status = 'reserved';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.release_expired_holds() from public, anon;
grant execute on function public.release_expired_holds() to authenticated, service_role;

-- Internal: a free unit of an item type sitting in a compartment at a node,
-- least-used first so wear is spread out. Locks the row so two students
-- can't grab the same unit.
create function public.pick_free_unit(p_item_type_id text, p_node_id text,
                                      out item_id uuid, out compartment_id uuid)
language sql
security definer
set search_path = public
as $$
  select i.id, c.id
  from public.items i
  join public.compartments c on c.item_id = i.id and c.node_id = p_node_id
  where i.item_type_id = p_item_type_id and i.current_node_id = p_node_id and i.status = 'available'
  order by i.loan_count, i.tag
  limit 1
  for update of i skip locked
$$;

revoke execute on function public.pick_free_unit(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Student actions
-- ---------------------------------------------------------------------------
-- Messages raised here are written for students; the website shows them as is.

-- Reserve one unit of an item type at a node for p_loan_hours.
-- Returns {"ok": true, "reservation_id": ...}, or {"ok": false, "message": ...}
-- when the node has none left (so the failed attempt is still logged).
create function public.reserve_item(p_item_type_id text, p_node_id text, p_loan_hours integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student  uuid := auth.uid();
  v_type     public.item_types;
  v_node     public.locker_nodes;
  v_unit     record;
  v_id       uuid;
begin
  if coalesce(public.app_role(), '') <> 'student' then
    raise exception 'Only students can reserve equipment.';
  end if;
  perform public.release_expired_holds();

  select * into v_type from public.item_types where id = p_item_type_id;
  if not found then
    raise exception 'That item no longer exists.';
  end if;
  if not (p_loan_hours = any (v_type.loan_hours_options)) then
    raise exception 'Choose one of the loan periods shown.';
  end if;
  select * into v_node from public.locker_nodes where id = p_node_id;
  if not found then
    raise exception 'That locker no longer exists.';
  end if;
  if not v_node.online then
    raise exception '% is offline right now. Choose another locker.', v_node.name;
  end if;
  if exists (select 1 from public.reservations where student_id = v_student and status = 'active') then
    raise exception 'You already have an item on hold. Collect it or cancel it before reserving something else.';
  end if;

  select * into v_unit from public.pick_free_unit(p_item_type_id, p_node_id);
  if v_unit.item_id is null then
    insert into public.reservation_attempts (student_id, item_type_id, node_id, succeeded)
    values (v_student, p_item_type_id, p_node_id, false);
    return jsonb_build_object('ok', false, 'message',
      format('%s has no %s left. Choose another locker.', v_node.place, lower(v_type.name)));
  end if;

  update public.items set status = 'reserved' where id = v_unit.item_id;
  insert into public.reservations (student_id, item_id, node_id, compartment_id, pin, hold_until, loan_hours)
  values (v_student, v_unit.item_id, p_node_id, v_unit.compartment_id,
          lpad(floor(random() * 10000)::int::text, 4, '0'), now() + interval '30 minutes', p_loan_hours)
  returning id into v_id;
  insert into public.reservation_attempts (student_id, item_type_id, node_id, succeeded)
  values (v_student, p_item_type_id, p_node_id, true);

  return jsonb_build_object('ok', true, 'reservation_id', v_id);
end;
$$;

revoke execute on function public.reserve_item(text, text, integer) from public, anon;
grant execute on function public.reserve_item(text, text, integer) to authenticated;

-- Cancel your own active hold; the item goes straight back into stock.
create function public.cancel_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid;
begin
  perform public.release_expired_holds();
  update public.reservations set status = 'cancelled'
  where id = p_reservation_id and student_id = auth.uid() and status = 'active'
  returning item_id into v_item;
  if v_item is null then
    raise exception 'This reservation has already ended.';
  end if;
  update public.items set status = 'available' where id = v_item and status = 'reserved';
end;
$$;

revoke execute on function public.cancel_reservation(uuid) from public, anon;
grant execute on function public.cancel_reservation(uuid) to authenticated;

-- Move your own active hold to another node. The hold keeps its PIN, loan
-- period and end time; a unit of the same item type is held at the new node
-- before the old one is released, so the student never loses their place.
create function public.change_reservation_node(p_reservation_id uuid, p_node_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res   public.reservations;
  v_type  text;
  v_node  public.locker_nodes;
  v_unit  record;
begin
  perform public.release_expired_holds();
  select * into v_res from public.reservations
  where id = p_reservation_id and student_id = auth.uid() and status = 'active'
  for update;
  if not found then
    raise exception 'This reservation has already ended.';
  end if;
  if v_res.node_id = p_node_id then
    return;  -- already held there
  end if;

  select * into v_node from public.locker_nodes where id = p_node_id;
  if not found then
    raise exception 'That locker no longer exists.';
  end if;
  if not v_node.online then
    raise exception '% is offline right now. Your hold hasn''t changed.', v_node.name;
  end if;

  select item_type_id into v_type from public.items where id = v_res.item_id;
  select * into v_unit from public.pick_free_unit(v_type, p_node_id);
  if v_unit.item_id is null then
    raise exception '% has none left. Your hold hasn''t changed.', v_node.place;
  end if;

  update public.items set status = 'reserved' where id = v_unit.item_id;
  update public.items set status = 'available' where id = v_res.item_id and status = 'reserved';
  update public.reservations
  set item_id = v_unit.item_id, node_id = p_node_id, compartment_id = v_unit.compartment_id
  where id = v_res.id;
end;
$$;

revoke execute on function public.change_reservation_node(uuid, text) from public, anon;
grant execute on function public.change_reservation_node(uuid, text) to authenticated;
