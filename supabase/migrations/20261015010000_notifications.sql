-- =====================================================================================
-- In-app notifications
--   * Employee submits a request      -> every admin (General Affair) is notified.
--   * Admin approves / rejects / marks ready for pickup -> the requester is notified.
-- Rows are written only by database triggers (SECURITY DEFINER), never by clients.
-- Users read their own rows (RLS) and mark them read through mark_notifications_read().
-- The table is added to the supabase_realtime publication so the app updates instantly.
-- Safe to run once on a project that already has the earlier migrations.
-- =====================================================================================

create type public.notification_kind as enum (
  'request_submitted',
  'request_approved',
  'request_rejected',
  'request_ready'
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  request_id   uuid references public.supply_requests (id) on delete cascade,
  kind         public.notification_kind not null,
  title        text not null check (length(title) <= 200),
  body         text not null check (length(body) <= 800),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_request_idx on public.notifications (request_id);

-- ---------- Triggers -----------------------------------------------------------------

create function public.notify_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text;
  v_items integer;
  v_qty   integer;
begin
  select p.name into v_name from public.profiles p where p.id = new.requester_id;
  select count(*)::integer, coalesce(sum(i.quantity), 0)::integer
    into v_items, v_qty
  from public.supply_request_items i
  where i.request_id = new.id;

  insert into public.notifications (recipient_id, request_id, kind, title, body)
  select a.id,
         new.id,
         'request_submitted',
         'New request ' || new.code,
         format('%s requested %s %s (%s qty). Waiting for your review.',
                coalesce(v_name, 'An employee'),
                v_items,
                case when v_items = 1 then 'item' else 'items' end,
                v_qty)
  from public.profiles a
  where a.role = 'admin' and a.id <> new.requester_id;
  return null;
end;
$$;

-- Deferred to commit: the request's items are inserted after the request row in the same
-- transaction, and the message counts them.
create constraint trigger supply_requests_notify_submitted
  after insert on public.supply_requests
  deferrable initially deferred
  for each row execute function public.notify_request_submitted();

create function public.notify_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  public.notification_kind;
  v_title text;
  v_body  text;
begin
  if new.status = old.status or new.decided_by is not distinct from new.requester_id then
    return null;
  end if;

  case new.status
    when 'approved' then
      v_kind  := 'request_approved';
      v_title := new.code || ' approved';
      v_body  := 'General Affair approved your request. You will be notified when it is ready for pickup.';
    when 'rejected' then
      v_kind  := 'request_rejected';
      v_title := new.code || ' rejected';
      v_body  := 'Reason: ' || coalesce(new.rejection_reason, '-');
    when 'ready_for_pickup' then
      v_kind  := 'request_ready';
      v_title := new.code || ' ready for pickup';
      v_body  := format('Your items are ready. Collect them at %s.', new.pickup_location);
    else
      return null;
  end case;

  insert into public.notifications (recipient_id, request_id, kind, title, body)
  values (new.requester_id, new.id, v_kind, v_title, left(v_body, 800));
  return null;
end;
$$;

create trigger supply_requests_notify_status
  after update of status on public.supply_requests
  for each row execute function public.notify_request_status();

-- ---------- RPC: mark as read --------------------------------------------------------

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Please log in again.';
  end if;
  update public.notifications n
     set read_at = now()
   where n.recipient_id = auth.uid()
     and n.read_at is null
     and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------- Security -----------------------------------------------------------------

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

revoke all on public.notifications from anon;
revoke insert, update, delete, truncate, references, trigger on public.notifications from authenticated;
grant select on public.notifications to authenticated;

revoke execute on function public.notify_request_submitted() from public, anon, authenticated;
revoke execute on function public.notify_request_status()    from public, anon, authenticated;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------- Realtime -----------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     )
  then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;
