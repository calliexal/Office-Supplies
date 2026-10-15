-- =====================================================================================
-- General Affair review screen
--   * supply_request_list gains requester_name / requester_department so the admin queue
--     shows who asked without an N+1 lookup per row. Still security_invoker: an employee
--     only ever sees their own rows (and their own profile).
--   * admin_request_summary(): organisation-wide counters for the review queue (admin only).
--   * Indexes for the queue: filter by status, order by created_at, across all employees.
-- Status changes keep going through update_supply_request_status() (admin only, locked,
-- transition-checked) - employees can request items but never approve or reject them.
-- Safe to run once on a project that already has 20261012000000_atk_schema.sql.
-- =====================================================================================

create or replace view public.supply_request_list
with (security_invoker = true)
as
select
  r.id,
  r.code,
  r.requester_id,
  r.created_at,
  r.status,
  r.pickup_location,
  count(i.supply_id)::integer                           as item_count,
  coalesce(sum(i.quantity), 0)::integer                 as total_quantity,
  coalesce(string_agg(i.name, ' ' order by i.name), '') as item_names,
  coalesce(p.name, '')                                  as requester_name,
  coalesce(p.department, '')                            as requester_department
from public.supply_requests r
left join public.supply_request_items i on i.request_id = r.id
left join public.profiles p on p.id = r.requester_id
group by r.id, p.id;

grant select on public.supply_request_list to authenticated;
revoke all on public.supply_request_list from anon;

-- Queue = "status = X order by created_at"; the old single-column status index is superseded.
drop index if exists public.supply_requests_status_idx;
create index if not exists supply_requests_status_created_idx on public.supply_requests (status, created_at);
create index if not exists supply_requests_created_idx on public.supply_requests (created_at);

-- ---------- RPC: counters for the review queue ---------------------------------------

create or replace function public.admin_request_summary()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Please log in again.';
  end if;
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'Only General Affair admins can review requests.';
  end if;

  -- SECURITY INVOKER: RLS still applies, and for an admin it allows every row.
  select jsonb_build_object(
           'total',            count(*),
           'pending',          count(*) filter (where r.status = 'pending'),
           'approved',         count(*) filter (where r.status = 'approved'),
           'ready_for_pickup', count(*) filter (where r.status = 'ready_for_pickup'),
           'rejected',         count(*) filter (where r.status = 'rejected'),
           'finished',         count(*) filter (where r.status = 'finished')
         )
    into v_result
  from public.supply_requests r;
  return v_result;
end;
$$;

revoke execute on function public.admin_request_summary() from public, anon;
grant execute on function public.admin_request_summary() to authenticated;

-- ---------- RPC: status change, now with a bounded rejection reason ------------------
-- Same body as in the initial migration plus a 500-character cap on the reason (the
-- employee reads it in their history, so it must stay a short message, not a document).

create or replace function public.update_supply_request_status(
  p_request_id uuid,
  p_status     public.request_status,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.request_status;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Please log in again.';
  end if;
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'Only General Affair admins can change a request status.';
  end if;

  select r.status into v_current from public.supply_requests r where r.id = p_request_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'This request no longer exists.';
  end if;

  if not (
       (v_current = 'pending'          and p_status in ('approved', 'rejected'))
    or (v_current = 'approved'         and p_status = 'ready_for_pickup')
    or (v_current = 'ready_for_pickup' and p_status = 'finished')
  ) then
    raise exception using errcode = 'PT409',
      message = format('This request is already %s. Refresh to see the latest status.', replace(v_current::text, '_', ' '));
  end if;

  if p_status = 'rejected' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception using errcode = 'PT422', message = 'Give a reason for the rejection.',
        detail = '{"reason":"Give a reason for the rejection."}';
    end if;
    if length(trim(p_reason)) > 500 then
      raise exception using errcode = 'PT422', message = 'Keep the reason under 500 characters.',
        detail = '{"reason":"Keep the reason under 500 characters."}';
    end if;
    -- Same lock order as create_supply_request, so a reject and a new request never deadlock.
    perform 1 from public.supplies s
     where s.id in (select i.supply_id from public.supply_request_items i where i.request_id = p_request_id)
     order by s.id
       for update;
    update public.supplies s
       set stock = s.stock + i.quantity
      from public.supply_request_items i
     where i.request_id = p_request_id and s.id = i.supply_id;
  end if;

  update public.supply_requests r
     set status           = p_status,
         rejection_reason = case when p_status = 'rejected' then trim(p_reason) else r.rejection_reason end,
         decided_by       = auth.uid(),
         decided_at       = now()
   where r.id = p_request_id;
end;
$$;

revoke execute on function public.update_supply_request_status(uuid, public.request_status, text) from public, anon;
grant execute on function public.update_supply_request_status(uuid, public.request_status, text) to authenticated;
