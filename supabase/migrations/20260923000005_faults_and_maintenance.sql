-- Resource Hub, phase 4: fault reports, work orders and maintenance.
--
-- Plain-language summary
--   * Students report a fault on something they have on loan, or on a
--     locker. Each report gets a work order number (WO-####) and can have a
--     photo (stored privately in Supabase Storage, bucket "fault-photos").
--   * An item with an unresolved fault, or one that has reached its service
--     count (e.g. 100 loans for a calculator), goes to maintenance when it is
--     returned instead of back on the shelf.
--   * Maintenance officers (and technicians) mark work orders and services
--     "in progress" and "closed". Closing puts the item back in stock at
--     Node S, the locker nearest the Maintenance and Facilities hub. Closing a
--     routine service also restarts the item's loan count.

-- Link maintenance records to the fault that caused them, and track when
-- work started.
alter table public.maintenance_records
  add column fault_report_id uuid references public.fault_reports (id) on delete set null,
  add column started_at timestamptz;
create index maintenance_records_fault_idx on public.maintenance_records (fault_report_id);
create index fault_reports_item_idx on public.fault_reports (item_id);

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Same as before, but the maintenance record now points at its fault.
create or replace function public.open_fault(p_reporter uuid, p_item uuid, p_node text, p_compartment uuid,
                                             p_reason text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_wo text;
begin
  insert into public.fault_reports (reporter_id, item_id, node_id, compartment_id, reason, note)
  values (p_reporter, p_item, p_node, p_compartment, p_reason, p_note)
  returning id, work_order_ref into v_id, v_wo;
  if p_item is not null then
    update public.items set status = 'in_service' where id = p_item;
    insert into public.maintenance_records (item_id, trigger, notes, fault_report_id)
    values (p_item, 'fault_report', v_wo || ': ' || p_note, v_id);
  end if;
  return v_wo;
end;
$$;

-- Does this item still have an unresolved fault or open maintenance record?
create function public.item_needs_maintenance(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.fault_reports where item_id = p_item and status <> 'closed')
      or exists (select 1 from public.maintenance_records where item_id = p_item and closed_at is null)
$$;

-- After maintenance: if nothing else is open on the item, put it back in
-- stock in a free compartment at Node S. Returns the compartment number, or
-- null if the item stays where it is (still on loan, or more work open).
create function public.return_item_to_stock(p_item uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_comp public.compartments;
begin
  select * into v_item from public.items where id = p_item for update;
  if v_item.status <> 'in_service' or public.item_needs_maintenance(p_item) then
    return null;
  end if;
  update public.compartments set item_id = null where item_id = p_item;
  v_comp := public.pick_free_compartment('S', v_item.item_type_id);
  if v_comp.id is null then
    raise exception 'Node S has no free compartment for this item. Free one up, then close this again.';
  end if;
  update public.compartments set item_id = p_item where id = v_comp.id;
  update public.items set status = 'available', current_node_id = 'S' where id = p_item;
  return v_comp.number;
end;
$$;

revoke execute on function public.item_needs_maintenance(uuid) from public, anon, authenticated;
revoke execute on function public.return_item_to_stock(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Returns now check faults and the usage threshold
-- ---------------------------------------------------------------------------

create or replace function public.kiosk_confirm_return(p_loan_id uuid, p_compartment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan    public.loans;
  v_comp    public.compartments;
  v_item    record;
  v_status  text := 'available';
  v_service boolean := false;
begin
  select * into v_loan from public.loans where id = p_loan_id and returned_at is null for update;
  if not found then raise exception 'This item has already been returned.'; end if;
  select * into v_comp from public.compartments where id = p_compartment_id for update;
  if not found or v_comp.item_id is not null then
    raise exception 'That compartment is in use now. Start the return again.';
  end if;

  select i.loan_count, t.service_after_loans into v_item
  from public.items i join public.item_types t on t.id = i.item_type_id where i.id = v_loan.item_id;

  if public.item_needs_maintenance(v_loan.item_id) then
    v_status := 'in_service';  -- a fault was reported while it was out
  elsif v_item.loan_count >= v_item.service_after_loans then
    insert into public.maintenance_records (item_id, trigger, notes)
    values (v_loan.item_id, 'usage_threshold',
            format('Reached %s loans: routine service due.', v_item.loan_count));
    v_status := 'in_service';
    v_service := true;
  end if;

  update public.loans set returned_at = now(), return_node_id = v_comp.node_id where id = v_loan.id;
  update public.items set status = v_status, current_node_id = v_comp.node_id where id = v_loan.item_id;
  update public.compartments set item_id = v_loan.item_id where id = v_comp.id;
  return jsonb_build_object('overdue', v_loan.due_at < now(), 'service_due', v_service);
end;
$$;

-- ---------------------------------------------------------------------------
-- Students: report a fault
-- ---------------------------------------------------------------------------

-- Report a fault on one of your open loans (p_loan_id), or on a locker
-- (p_node_id). The photo, if any, must be in your own folder of the
-- fault-photos bucket. Returns the work order reference.
create function public.report_fault(p_reason text, p_note text default null, p_loan_id uuid default null,
                                    p_node_id text default null, p_photo_path text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_item uuid;
  v_node text := p_node_id;
  v_id   uuid;
  v_wo   text;
  v_note text := nullif(trim(p_note), '');
begin
  if coalesce(public.app_role(), '') <> 'student' then
    raise exception 'Only students can report faults here.';
  end if;
  if p_reason is null or p_reason not in ('door_did_not_open', 'wrong_item', 'damaged', 'missing_part', 'other') then
    raise exception 'Choose what happened first.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1000 characters.';
  end if;
  if p_photo_path is not null and p_photo_path not like v_me::text || '/%' then
    raise exception 'That photo doesn''t belong to you.';
  end if;

  if p_loan_id is not null then
    select l.item_id, coalesce(l.from_node_id, i.home_node_id) into v_item, v_node
    from public.loans l join public.items i on i.id = l.item_id
    where l.id = p_loan_id and l.student_id = v_me and l.returned_at is null;
    if not found then raise exception 'This loan has already been returned.'; end if;
  elsif not exists (select 1 from public.locker_nodes where id = p_node_id) then
    raise exception 'Choose which locker the problem is at.';
  end if;

  insert into public.fault_reports (reporter_id, item_id, node_id, reason, note, photo_path)
  values (v_me, v_item, v_node, p_reason, v_note, p_photo_path)
  returning id, work_order_ref into v_id, v_wo;
  -- The item stays with the student; it goes to maintenance when returned.
  if v_item is not null then
    insert into public.maintenance_records (item_id, trigger, notes, fault_report_id)
    values (v_item, 'fault_report', v_wo || ': ' || coalesce(v_note, 'Reported by the student.'), v_id);
  end if;
  return v_wo;
end;
$$;

revoke execute on function public.report_fault(text, text, uuid, text, text) from public, anon;
grant execute on function public.report_fault(text, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Maintenance officers and technicians: work orders and services
-- ---------------------------------------------------------------------------

create function public.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.app_role(), '') not in ('maintenance', 'technician') then
    raise exception 'Only maintenance staff and technicians can do this.';
  end if;
end;
$$;
revoke execute on function public.require_staff() from public, anon, authenticated;

-- Mark a work order (fault report) as being worked on.
create function public.start_work_order(p_fault_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  update public.fault_reports set status = 'in_progress' where id = p_fault_id and status = 'open';
  if not found then raise exception 'This work order is already in progress or closed.'; end if;
  update public.maintenance_records set started_at = coalesce(started_at, now())
  where fault_report_id = p_fault_id and closed_at is null;
end;
$$;

-- Close a work order. Returns {"compartment": n} if the item went back into
-- stock at Node S, or {"compartment": null} if it stays where it is.
create function public.close_work_order(p_fault_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fault public.fault_reports;
  v_note  text := nullif(trim(p_note), '');
begin
  perform public.require_staff();
  select * into v_fault from public.fault_reports where id = p_fault_id and status <> 'closed' for update;
  if not found then raise exception 'This work order is already closed.'; end if;

  update public.fault_reports set status = 'closed' where id = p_fault_id;
  -- Its maintenance record (older demo records are matched by item and WO number).
  update public.maintenance_records
  set closed_at = now(), started_at = coalesce(started_at, now()),
      notes = case when v_note is null then notes else coalesce(notes || E'\n', '') || 'Closed: ' || v_note end
  where closed_at is null
    and (fault_report_id = p_fault_id
         or (fault_report_id is null and item_id = v_fault.item_id and notes like v_fault.work_order_ref || ':%'));

  if v_fault.item_id is null then
    return jsonb_build_object('compartment', null);
  end if;
  return jsonb_build_object('compartment', public.return_item_to_stock(v_fault.item_id));
end;
$$;

-- Mark a routine (usage) service as being worked on.
create function public.start_service(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  update public.maintenance_records set started_at = now()
  where id = p_record_id and trigger = 'usage_threshold' and closed_at is null and started_at is null;
  if not found then raise exception 'This service is already in progress or closed.'; end if;
end;
$$;

-- Close a routine service: the loan count starts again from zero.
create function public.close_service(p_record_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.maintenance_records;
  v_note text := nullif(trim(p_note), '');
begin
  perform public.require_staff();
  select * into v_rec from public.maintenance_records
  where id = p_record_id and trigger = 'usage_threshold' and closed_at is null for update;
  if not found then raise exception 'This service is already closed.'; end if;

  update public.maintenance_records
  set closed_at = now(), started_at = coalesce(started_at, now()),
      notes = case when v_note is null then notes else coalesce(notes || E'\n', '') || 'Closed: ' || v_note end
  where id = p_record_id;
  update public.items set loan_count = 0 where id = v_rec.item_id;
  return jsonb_build_object('compartment', public.return_item_to_stock(v_rec.item_id));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['start_work_order(uuid)', 'close_work_order(uuid, text)',
                           'start_service(uuid)', 'close_service(uuid, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Photo storage (only on Supabase; skipped by the local test database)
-- ---------------------------------------------------------------------------
-- Private bucket, 5 MB per photo. Students upload into a folder named after
-- their own user id and can see their own photos; staff can see all of them.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'No Supabase Storage here; skipping the fault-photos bucket.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fault-photos', 'fault-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy "students upload own fault photos" on storage.objects for insert to authenticated
    with check (bucket_id = 'fault-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy "own or staff read fault photos" on storage.objects for select to authenticated
    using (bucket_id = 'fault-photos'
           and ((storage.foldername(name))[1] = auth.uid()::text
                or public.app_role() in ('technician', 'maintenance')))
  $p$;
end $$;
