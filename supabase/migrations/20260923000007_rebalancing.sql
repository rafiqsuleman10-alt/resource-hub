-- Resource Hub, phase 5: rebalancing stock between lockers.
--
-- The technician dashboard suggests moves such as "take 4 calculators from
-- Node S to Node C". When the technician has carried them over, "Mark as
-- moved" calls move_stock(), which moves free units (least-used first) into
-- free compartments at the other locker. Technicians only.

create function public.move_stock(p_item_type_id text, p_from text, p_to text, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit  record;
  v_comp  public.compartments;
  v_moved integer := 0;
begin
  if coalesce(public.app_role(), '') <> 'technician' then
    raise exception 'Only technicians can move stock.';
  end if;
  if p_from = p_to or p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Choose two different lockers and how many to move.';
  end if;
  perform public.release_expired_holds();

  for i in 1 .. p_count loop
    select * into v_unit from public.pick_free_unit(p_item_type_id, p_from);
    exit when v_unit.item_id is null;
    v_comp := public.pick_free_compartment(p_to, p_item_type_id);
    exit when v_comp.id is null;
    update public.compartments set item_id = null where id = v_unit.compartment_id;
    update public.compartments set item_id = v_unit.item_id where id = v_comp.id;
    update public.items set current_node_id = p_to where id = v_unit.item_id;
    v_moved := v_moved + 1;
  end loop;

  if v_moved = 0 then
    raise exception 'Nothing was moved: there are no free units at the first locker, or no free compartments at the second.';
  end if;
  return v_moved;
end;
$$;

revoke execute on function public.move_stock(text, text, text, integer) from public, anon;
grant execute on function public.move_stock(text, text, text, integer) to authenticated;
