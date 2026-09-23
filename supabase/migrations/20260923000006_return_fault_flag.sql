-- Resource Hub, phase 4 fix: when an item with an open fault report is
-- returned, tell the locker screen ("fault_open": true), so it can say the
-- item is going to maintenance rather than "back in stock".

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
  v_fault   boolean := false;
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
    v_fault := true;
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
  return jsonb_build_object('overdue', v_loan.due_at < now(), 'service_due', v_service, 'fault_open', v_fault);
end;
$$;
