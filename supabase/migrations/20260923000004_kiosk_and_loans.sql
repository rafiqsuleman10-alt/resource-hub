-- Resource Hub, phase 3: the locker kiosk, returns and extensions.
--
-- Plain-language summary
--   * The kiosk page (/kiosk/S, /kiosk/C, /kiosk/SR) stands in for the
--     touchscreen on a real locker. It has no login, so it can only call the
--     kiosk_* functions below. Each one checks the student card, backup PIN
--     or item tag itself and does one small job.
--   * Collecting turns a reservation into a loan. The due time is worked out
--     at that moment, moved off public holidays (see loan_due()).
--   * Items can be returned to any locker; that locker becomes their home
--     until the next loan.
--   * "Door didn't open" or "wrong item" at collection logs a fault (with a
--     WO-#### work order) and moves the reservation to another compartment at
--     the same locker. Returning something "minor" or "damaged" logs a fault
--     and takes the item out of use until maintenance has looked at it.
--   * A student can extend a loan once, by one day, if nobody else has
--     reserved that kind of item at the locker it came from.
--   * Too many wrong PINs at one locker locks PIN entry for 5 minutes.

-- Which locker a loan was collected from (older demo loans use the item's home node).
alter table public.loans add column from_node_id text references public.locker_nodes (id);

-- Wrong PINs typed at a kiosk, for the 5-minute lockout. Only the kiosk
-- functions write here; technicians can read it.
create table public.kiosk_pin_failures (
  id          bigint generated always as identity primary key,
  node_id     text not null references public.locker_nodes (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index kiosk_pin_failures_node_idx on public.kiosk_pin_failures (node_id, created_at);
alter table public.kiosk_pin_failures enable row level security;
create policy "technician reads" on public.kiosk_pin_failures for select to authenticated
  using (public.app_role() = 'technician');

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the website)
-- ---------------------------------------------------------------------------

-- Logs a fault with a work order number and returns it (e.g. 'WO-1002').
-- If an item is involved it is taken out of use and a maintenance record is
-- opened for it.
create function public.open_fault(p_reporter uuid, p_item uuid, p_node text, p_compartment uuid,
                                  p_reason text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo text;
begin
  insert into public.fault_reports (reporter_id, item_id, node_id, compartment_id, reason, note)
  values (p_reporter, p_item, p_node, p_compartment, p_reason, p_note)
  returning work_order_ref into v_wo;
  if p_item is not null then
    update public.items set status = 'in_service' where id = p_item;
    insert into public.maintenance_records (item_id, trigger, notes)
    values (p_item, 'fault_report', v_wo || ': ' || p_note);
  end if;
  return v_wo;
end;
$$;

-- A free compartment at a node for an item type. Prefers the size the other
-- units of that type sit in, otherwise the biggest free one. Skips
-- compartments whose door is reported as not opening.
create function public.pick_free_compartment(p_node text, p_type text)
returns public.compartments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size text;
  v_comp public.compartments;
begin
  select c.size into v_size
  from public.compartments c join public.items i on i.id = c.item_id
  where i.item_type_id = p_type
  group by c.size order by count(*) desc limit 1;

  select c.* into v_comp
  from public.compartments c
  where c.node_id = p_node and c.item_id is null
    and not exists (select 1 from public.fault_reports f
                    where f.compartment_id = c.id and f.reason = 'door_did_not_open' and f.status <> 'closed')
  order by (c.size = v_size) desc nulls last,
           case c.size when 'L' then 1 when 'M' then 2 else 3 end,
           c.number
  limit 1
  for update skip locked;
  return v_comp;
end;
$$;

revoke execute on function public.open_fault(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.pick_free_compartment(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kiosk: what the screen shows
-- ---------------------------------------------------------------------------

-- The three lockers, for the kiosk's "choose a locker" page.
create function public.kiosk_nodes()
returns table (id text, name text, place text, battery_backup_ok boolean, online boolean)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.name, n.place, n.battery_backup_ok, n.online from public.locker_nodes n order by n.position
$$;

-- One locker and its compartments (numbers and sizes only), or null.
create function public.kiosk_node(p_node text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', n.id, 'name', n.name, 'place', n.place,
    'battery_backup_ok', n.battery_backup_ok, 'online', n.online,
    'compartments', (select coalesce(jsonb_agg(jsonb_build_object('number', c.number, 'size', c.size) order by c.number), '[]')
                     from public.compartments c where c.node_id = n.id))
  from public.locker_nodes n where n.id = p_node
$$;

-- Demo only: the fake student cards, so testers can "tap" one.
create function public.kiosk_demo_cards()
returns table (card_uid text, label text)
language sql
stable
security definer
set search_path = public
as $$
  select p.card_uid, p.display_name from public.profiles p
  where p.role = 'student' and p.card_uid is not null order by p.card_uid
$$;

-- Demo only: tags of items out on loan (no names of borrowers), so testers
-- can "hold a tag to the reader".
create function public.kiosk_tags_on_loan()
returns table (tag text, item_name text)
language sql
stable
security definer
set search_path = public
as $$
  select i.tag, t.name from public.loans l
  join public.items i on i.id = l.item_id join public.item_types t on t.id = i.item_type_id
  where l.returned_at is null order by i.tag
$$;

-- ---------------------------------------------------------------------------
-- Kiosk: collecting
-- ---------------------------------------------------------------------------
-- Messages raised here are shown on the kiosk as they are.

-- Identify the student by card (p_card) or backup PIN (p_pin) and find their
-- reservation at this locker. A wrong PIN comes back as {"error": ...}.
create function public.kiosk_start_collect(p_node text, p_card text default null, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node  public.locker_nodes;
  v_res   public.reservations;
  v_other public.locker_nodes;
  v_name  text;
begin
  select * into v_node from public.locker_nodes where id = p_node;
  if not found then raise exception 'This locker doesn''t exist.'; end if;
  if not v_node.online then raise exception 'This locker is offline. Please use another locker.'; end if;
  perform public.release_expired_holds();

  if nullif(trim(p_card), '') is not null then
    select r.* into v_res from public.reservations r
    join public.profiles p on p.id = r.student_id
    where p.card_uid = upper(trim(p_card)) and r.status = 'active';
    if not found then
      if not exists (select 1 from public.profiles where card_uid = upper(trim(p_card))) then
        raise exception 'We don''t recognise this card. Try again, or use your backup PIN.';
      end if;
      raise exception 'You have nothing on hold. Reserve an item on your phone first.';
    end if;
    if v_res.node_id <> p_node then
      select * into v_other from public.locker_nodes where id = v_res.node_id;
      raise exception 'Your reservation is at % (%). You can change locker on your phone.', v_other.name, v_other.place;
    end if;
  else
    if (select count(*) from public.kiosk_pin_failures
        where node_id = p_node and created_at > now() - interval '5 minutes') >= 5 then
      raise exception 'Too many wrong PINs. Wait 5 minutes, or tap your student card.';
    end if;
    select * into v_res from public.reservations
    where node_id = p_node and status = 'active' and pin = trim(coalesce(p_pin, ''))
    order by hold_until limit 1;
    if not found then
      -- Returned, not raised, so the failure is saved for the lockout.
      insert into public.kiosk_pin_failures (node_id) values (p_node);
      return jsonb_build_object('error',
        'That PIN doesn''t match a reservation at this locker. Check the PIN on your phone.');
    end if;
  end if;

  select split_part(p.display_name, ' (', 1) into v_name from public.profiles p where p.id = v_res.student_id;
  return (
    select jsonb_build_object('reservation_id', v_res.id, 'student', v_name, 'compartment', c.number,
                              'item_name', t.name, 'tag', i.tag)
    from public.items i join public.item_types t on t.id = i.item_type_id
    left join public.compartments c on c.id = v_res.compartment_id
    where i.id = v_res.item_id);
end;
$$;

-- "I've closed the door": the reservation becomes a loan.
create function public.kiosk_confirm_collect(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.reservations;
  v_due record;
begin
  perform public.release_expired_holds();
  select * into v_res from public.reservations where id = p_reservation_id and status = 'active' for update;
  if not found then
    raise exception 'This reservation has ended. Reserve the item again on your phone.';
  end if;

  select * into v_due from public.loan_due(now(), v_res.loan_hours);
  update public.items set status = 'on_loan', current_node_id = null, loan_count = loan_count + 1
  where id = v_res.item_id;
  update public.compartments set item_id = null where item_id = v_res.item_id;
  update public.reservations set status = 'collected' where id = v_res.id;
  insert into public.loans (student_id, item_id, issued_at, due_at, from_node_id)
  values (v_res.student_id, v_res.item_id, now(), v_due.due_at, v_res.node_id);

  return jsonb_build_object('due_at', v_due.due_at, 'holiday', v_due.holiday);
end;
$$;

-- "The door didn't open" / "The wrong item is inside": log a fault and move
-- the reservation to another unit, in another compartment, at this locker.
-- Returns {"work_order", "moved", "compartment"}.
create function public.kiosk_collect_problem(p_reservation_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res  public.reservations;
  v_type text;
  v_wo   text;
  v_unit record;
begin
  if p_reason not in ('door_did_not_open', 'wrong_item') then
    raise exception 'Unknown problem.';
  end if;
  select * into v_res from public.reservations where id = p_reservation_id and status = 'active' for update;
  if not found then
    raise exception 'This reservation has ended. Reserve the item again on your phone.';
  end if;

  select item_type_id into v_type from public.items where id = v_res.item_id;
  v_wo := public.open_fault(v_res.student_id, v_res.item_id, v_res.node_id, v_res.compartment_id, p_reason,
            case p_reason when 'door_did_not_open' then 'Compartment door did not open at collection.'
                          else 'Wrong item in the compartment at collection.' end);

  select * into v_unit from public.pick_free_unit(v_type, v_res.node_id);
  if v_unit.item_id is null then
    update public.reservations set status = 'cancelled' where id = v_res.id;
    return jsonb_build_object('work_order', v_wo, 'moved', false);
  end if;

  update public.items set status = 'reserved' where id = v_unit.item_id;
  update public.reservations
  set item_id = v_unit.item_id, compartment_id = v_unit.compartment_id,
      hold_until = greatest(hold_until, now() + interval '5 minutes')
  where id = v_res.id;
  return jsonb_build_object('work_order', v_wo, 'moved', true,
    'compartment', (select number from public.compartments where id = v_unit.compartment_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Kiosk: returning
-- ---------------------------------------------------------------------------

-- The reader has read an item's tag: find its loan and a compartment for it.
create function public.kiosk_start_return(p_node text, p_tag text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node public.locker_nodes;
  v_item record;
  v_comp public.compartments;
begin
  select * into v_node from public.locker_nodes where id = p_node;
  if not found then raise exception 'This locker doesn''t exist.'; end if;
  if not v_node.online then raise exception 'This locker is offline. Please use another locker.'; end if;

  select i.id, i.tag, i.item_type_id, t.name, l.id as loan_id into v_item
  from public.items i join public.item_types t on t.id = i.item_type_id
  left join public.loans l on l.item_id = i.id and l.returned_at is null
  where upper(i.tag) = upper(trim(p_tag));
  if not found then
    raise exception 'We can''t read that tag. Check the label on the item and try again.';
  end if;
  if v_item.loan_id is null then
    raise exception 'Tag % isn''t out on loan, so it can''t be returned here. Please hand it to the technician desk.', v_item.tag;
  end if;

  v_comp := public.pick_free_compartment(p_node, v_item.item_type_id);
  if v_comp.id is null then
    raise exception 'This locker has no free compartment right now. Please use another locker.';
  end if;
  return jsonb_build_object('loan_id', v_item.loan_id, 'item_name', v_item.name, 'tag', v_item.tag,
                            'compartment_id', v_comp.id, 'compartment', v_comp.number);
end;
$$;

-- "The door didn't open" during a return: log it and open another compartment.
create function public.kiosk_return_problem(p_loan_id uuid, p_compartment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_comp public.compartments;
  v_wo   text;
begin
  select l.id, l.student_id, i.item_type_id into v_loan
  from public.loans l join public.items i on i.id = l.item_id
  where l.id = p_loan_id and l.returned_at is null;
  if not found then raise exception 'This item has already been returned.'; end if;
  select * into v_comp from public.compartments where id = p_compartment_id;
  if not found then raise exception 'Start the return again.'; end if;

  v_wo := public.open_fault(v_loan.student_id, null, v_comp.node_id, v_comp.id, 'door_did_not_open',
                            'Compartment door did not open for a return.');
  v_comp := public.pick_free_compartment(v_comp.node_id, v_loan.item_type_id);
  if v_comp.id is null then
    return jsonb_build_object('work_order', v_wo, 'moved', false);
  end if;
  return jsonb_build_object('work_order', v_wo, 'moved', true,
                            'compartment_id', v_comp.id, 'compartment', v_comp.number);
end;
$$;

-- "I've closed the door": the item is back in stock at this locker.
create function public.kiosk_confirm_return(p_loan_id uuid, p_compartment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans;
  v_comp public.compartments;
begin
  select * into v_loan from public.loans where id = p_loan_id and returned_at is null for update;
  if not found then raise exception 'This item has already been returned.'; end if;
  select * into v_comp from public.compartments where id = p_compartment_id for update;
  if not found or v_comp.item_id is not null then
    raise exception 'That compartment is in use now. Start the return again.';
  end if;

  update public.loans set returned_at = now(), return_node_id = v_comp.node_id where id = v_loan.id;
  update public.items set status = 'available', current_node_id = v_comp.node_id where id = v_loan.item_id;
  update public.compartments set item_id = v_loan.item_id where id = v_comp.id;
  return jsonb_build_object('overdue', v_loan.due_at < now());
end;
$$;

-- "How was it?" straight after a return. Minor or damaged logs a fault.
create function public.kiosk_return_condition(p_loan_id uuid, p_condition text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans;
  v_comp uuid;
  v_wo   text;
begin
  if p_condition not in ('good', 'minor', 'damaged') then raise exception 'Unknown condition.'; end if;
  select * into v_loan from public.loans
  where id = p_loan_id and returned_at > now() - interval '15 minutes' and condition_on_return is null
  for update;
  if not found then raise exception 'This return is already finished.'; end if;

  update public.loans set condition_on_return = p_condition where id = v_loan.id;
  if p_condition <> 'good' then
    select id into v_comp from public.compartments where item_id = v_loan.item_id;
    v_wo := public.open_fault(v_loan.student_id, v_loan.item_id, v_loan.return_node_id, v_comp,
              case p_condition when 'damaged' then 'damaged' else 'other' end,
              case p_condition when 'damaged' then 'Returned damaged (reported at the locker).'
                               else 'Returned with a minor problem (reported at the locker).' end);
  end if;
  return jsonb_build_object('work_order', v_wo);
end;
$$;

-- The kiosk has no login, so these are open to anon. Each checks the card,
-- PIN, tag or reservation id it is given.
do $$
declare f text;
begin
  foreach f in array array[
    'kiosk_nodes()', 'kiosk_node(text)', 'kiosk_demo_cards()', 'kiosk_tags_on_loan()',
    'kiosk_start_collect(text, text, text)', 'kiosk_confirm_collect(uuid)', 'kiosk_collect_problem(uuid, text)',
    'kiosk_start_return(text, text)', 'kiosk_return_problem(uuid, uuid)', 'kiosk_confirm_return(uuid, uuid)',
    'kiosk_return_condition(uuid, text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Student: extending a loan
-- ---------------------------------------------------------------------------

-- Can this loan be extended? {"allowed", "reason" (already_extended / overdue /
-- waiting), "due_at", "new_due_at", "holiday"}.
create function public.extension_check(p_loan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_new  record;
begin
  select l.id, l.due_at, l.extended, i.item_type_id, coalesce(l.from_node_id, i.home_node_id) as node_id
  into v_loan
  from public.loans l join public.items i on i.id = l.item_id
  where l.id = p_loan_id and l.student_id = auth.uid() and l.returned_at is null;
  if not found then raise exception 'This loan has already been returned.'; end if;

  select * into v_new from public.loan_due(v_loan.due_at, 24);
  return jsonb_build_object(
    'allowed', false, 'due_at', v_loan.due_at, 'new_due_at', v_new.due_at, 'holiday', v_new.holiday,
    'node_id', v_loan.node_id)
    || case
         when v_loan.extended then jsonb_build_object('reason', 'already_extended')
         when v_loan.due_at < now() then jsonb_build_object('reason', 'overdue')
         when exists (select 1 from public.reservations r join public.items i2 on i2.id = r.item_id
                      where r.status = 'active' and r.hold_until > now() and r.node_id = v_loan.node_id
                        and i2.item_type_id = v_loan.item_type_id and r.student_id <> auth.uid())
           then jsonb_build_object('reason', 'waiting')
         else jsonb_build_object('allowed', true)
       end;
end;
$$;

-- Extend your own loan by one day (once). Returns the new due time.
create function public.extend_loan(p_loan_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb := public.extension_check(p_loan_id);
begin
  if not (v_check ->> 'allowed')::boolean then
    raise exception '%', case v_check ->> 'reason'
      when 'already_extended' then 'You''ve already extended this loan once.'
      when 'overdue' then 'This loan is overdue, so it can''t be extended. Please return it as soon as you can.'
      else 'Someone is waiting for this item, so it can''t be extended. Please return it by the due time.' end;
  end if;
  update public.loans set due_at = (v_check ->> 'new_due_at')::timestamptz, extended = true
  where id = p_loan_id and student_id = auth.uid() and returned_at is null and not extended;
  return (v_check ->> 'new_due_at')::timestamptz;
end;
$$;

revoke execute on function public.extension_check(uuid) from public, anon;
revoke execute on function public.extend_loan(uuid) from public, anon;
grant execute on function public.extension_check(uuid) to authenticated;
grant execute on function public.extend_loan(uuid) to authenticated;
