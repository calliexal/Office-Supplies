-- =====================================================================================
-- ONE-SHOT SETUP for a fresh Supabase project: schema + RLS + RPC + storage + seed.
-- Generated from migrations/*.sql and seed.sql by scripts/build-setup-sql.mjs - do not edit.
-- Paste into Dashboard -> SQL Editor -> Run (once). Existing projects: run only the new migration files.
-- =====================================================================================

-- >>> migrations/20261012000000_atk_schema.sql
-- =====================================================================================
-- Office Supplies Request (Pengajuan ATK) — initial schema
--
-- Design rules
--   * The browser only holds the *publishable* key, so every table is protected by RLS.
--   * Employees can READ their own data directly; every WRITE that touches stock goes
--     through a SECURITY DEFINER function that validates input and locks rows, so the
--     client can never set stock, status or request codes itself.
--   * Business errors use custom SQLSTATEs "PTxxx": PostgREST turns them into HTTP xxx,
--     and the frontend maps them to its ApiError codes (see src/api/supabase/errors.ts).
-- =====================================================================================

-- ---------- Types --------------------------------------------------------------------

create type public.request_status as enum ('pending', 'approved', 'ready_for_pickup', 'rejected', 'finished');
create type public.app_role as enum ('employee', 'admin');

-- ---------- Tables -------------------------------------------------------------------

-- Optional allowlist checked when a user is created. Empty (the default) = any domain;
-- add rows (e.g. 'yourcompany.com') to restrict accounts to your organisation.
create table public.app_allowed_email_domains (
  domain text primary key check (domain = lower(domain) and domain !~ '@')
);

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null unique,
  name                 text not null check (length(trim(name)) between 1 and 120),
  position             text not null default '' check (length(position) <= 120),
  department           text not null default '' check (length(department) <= 120),
  role                 public.app_role not null default 'employee',
  unread_notifications integer not null default 0 check (unread_notifications >= 0),
  unread_messages      integer not null default 0 check (unread_messages >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.supplies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) between 1 and 120),
  stock      integer not null default 0 check (stock >= 0),
  unit       text not null default 'pcs' check (length(trim(unit)) between 1 and 20),
  -- Absolute URL, site-relative path ("/supplies/x.png") or a key in the "supply-images" bucket.
  image_url  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supply_requests (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  requester_id     uuid not null references public.profiles (id) on delete restrict,
  status           public.request_status not null default 'pending',
  pickup_location  text not null default 'General Affair Office',
  rejection_reason text,
  idempotency_key  text not null,
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (requester_id, idempotency_key),
  check (status <> 'rejected' or rejection_reason is not null)
);

create table public.supply_request_items (
  request_id uuid not null references public.supply_requests (id) on delete cascade,
  supply_id  uuid not null references public.supplies (id) on delete restrict,
  name       text not null, -- snapshot: history must not change if a supply is renamed
  quantity   integer not null check (quantity > 0),
  primary key (request_id, supply_id)
);

-- Daily sequence behind REQ-YYYYMMDD-NNN. Upserted atomically, never read by clients.
create table public.request_code_counters (
  day        date primary key,
  last_value integer not null check (last_value > 0)
);

create index supply_requests_requester_created_idx on public.supply_requests (requester_id, created_at desc);
create index supply_requests_status_idx on public.supply_requests (status);
create index supply_request_items_supply_idx on public.supply_request_items (supply_id);
create index supplies_active_name_idx on public.supplies (name) where is_active;

-- ---------- updated_at ---------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger supplies_touch before update on public.supplies
  for each row execute function public.touch_updated_at();
create trigger supply_requests_touch before update on public.supply_requests
  for each row execute function public.touch_updated_at();

-- ---------- Helpers ------------------------------------------------------------------

-- SECURITY DEFINER so policies on profiles can call it without recursing into themselves.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ---------- New auth user -> profile -------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(coalesce(new.email, '')));
  v_domain text := split_part(v_email, '@', 2);
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if v_domain = '' or (
    exists (select 1 from public.app_allowed_email_domains)
    and not exists (select 1 from public.app_allowed_email_domains d where d.domain = v_domain)
  ) then
    raise exception 'E-mail domain "%" is not allowed for this app', v_domain
      using errcode = 'PT403';
  end if;

  insert into public.profiles (id, email, name, position, department)
  values (
    new.id,
    v_email,
    coalesce(
      nullif(trim(v_meta ->> 'name'), ''),
      initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '_', ' '))
    ),
    coalesce(trim(v_meta ->> 'position'), ''),
    coalesce(trim(v_meta ->> 'department'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Read model for request lists ---------------------------------------------

-- security_invoker: the caller's RLS on the base tables applies, so this view can never
-- leak another employee's requests.
create view public.supply_request_list
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
  coalesce(string_agg(i.name, ' ' order by i.name), '') as item_names
from public.supply_requests r
left join public.supply_request_items i on i.request_id = r.id
group by r.id;

-- ---------- RPC: create a request ----------------------------------------------------

create function public.create_supply_request(p_items jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_day        date := (now() at time zone 'Asia/Jakarta')::date;
  v_existing   uuid;
  v_request_id uuid;
  v_ids        uuid[];
  v_qtys       integer[];
  v_available  integer;
  v_fields     jsonb;
  v_message    text;
  v_seq        integer;
begin
  if v_uid is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Please log in again.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception using errcode = 'PT403', message = 'Your account is not set up yet. Contact General Affair.';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then
    raise exception using errcode = 'PT422', message = 'Missing or invalid idempotency key.';
  end if;

  -- Serialise retries of the same submission, then replay the original result if it exists.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_idempotency_key, 0));
  select r.id into v_existing
  from public.supply_requests r
  where r.requester_id = v_uid and r.idempotency_key = p_idempotency_key;
  if found then
    -- A replay must carry the same items; otherwise the client would be told the *old*
    -- request succeeded for a cart it no longer holds.
    begin
      if exists (
           select i.supply_id, i.quantity from public.supply_request_items i where i.request_id = v_existing
           except
           select (e ->> 'supply_id')::uuid, (e ->> 'quantity')::integer from jsonb_array_elements(p_items) e
         )
         or exists (
           select (e ->> 'supply_id')::uuid, (e ->> 'quantity')::integer from jsonb_array_elements(p_items) e
           except
           select i.supply_id, i.quantity from public.supply_request_items i where i.request_id = v_existing
         )
      then
        raise exception using errcode = 'PT422',
          message = 'This submission was already used for different items. Please submit again.';
      end if;
    exception
      when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
        raise exception using errcode = 'PT422',
          message = 'This submission was already used for different items. Please submit again.';
    end;
    return v_existing;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'PT422', message = 'Add at least one item.',
      detail = '{"items":"Add at least one item."}';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception using errcode = 'PT422', message = 'A request can contain at most 50 different items.';
  end if;

  begin
    select array_agg((e ->> 'supply_id')::uuid order by ord),
           array_agg((e ->> 'quantity')::integer order by ord)
      into v_ids, v_qtys
    from jsonb_array_elements(p_items) with ordinality as t (e, ord);
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'PT422', message = 'One of the items is invalid.';
  end;

  if exists (select 1 from unnest(v_ids, v_qtys) as x (id, qty) where x.id is null or x.qty is null or x.qty < 1) then
    raise exception using errcode = 'PT422', message = 'Each item needs a quantity of at least 1.';
  end if;
  if (select count(distinct x) from unnest(v_ids) as x) <> cardinality(v_ids) then
    raise exception using errcode = 'PT422', message = 'Each item can only appear once in a request.';
  end if;

  -- Lock in a stable order so concurrent requests for the same items cannot deadlock.
  perform 1 from public.supplies s where s.id = any (v_ids) order by s.id for update;

  select count(*) into v_available from public.supplies s where s.id = any (v_ids) and s.is_active;
  if v_available <> cardinality(v_ids) then
    raise exception using errcode = 'PT422', message = 'One of the items is no longer available.';
  end if;

  select jsonb_object_agg(s.id::text, format('Only %s %s of %s left.', s.stock, s.unit, s.name)),
         min(format('Only %s %s of %s left.', s.stock, s.unit, s.name))
    into v_fields, v_message
  from public.supplies s
  join unnest(v_ids, v_qtys) as x (id, qty) on x.id = s.id
  where x.qty > s.stock;
  if v_fields is not null then
    raise exception using errcode = 'PT409', message = v_message, detail = v_fields::text;
  end if;

  update public.supplies s
     set stock = s.stock - x.qty
    from unnest(v_ids, v_qtys) as x (id, qty)
   where s.id = x.id;

  insert into public.request_code_counters as c (day, last_value)
  values (v_day, 1)
  on conflict (day) do update set last_value = c.last_value + 1
  returning c.last_value into v_seq;

  insert into public.supply_requests (code, requester_id, idempotency_key)
  values (
    'REQ-' || to_char(v_day, 'YYYYMMDD') || '-' || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0'),
    v_uid,
    p_idempotency_key
  )
  returning id into v_request_id;

  insert into public.supply_request_items (request_id, supply_id, name, quantity)
  select v_request_id, s.id, s.name, x.qty
  from unnest(v_ids, v_qtys) as x (id, qty)
  join public.supplies s on s.id = x.id;

  return v_request_id;
end;
$$;

-- ---------- RPC: dashboard counters --------------------------------------------------

create function public.my_request_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total',    count(*),
    'pending',  count(*) filter (where r.status = 'pending'),
    'approved', count(*) filter (where r.status in ('approved', 'ready_for_pickup', 'finished')),
    'rejected', count(*) filter (where r.status = 'rejected')
  )
  from public.supply_requests r
  where r.requester_id = auth.uid();
$$;

-- ---------- RPC: General Affair moves a request through its lifecycle ---------------
--   pending -> approved -> ready_for_pickup -> finished
--   pending -> rejected (reason required, stock is returned)

create function public.update_supply_request_status(
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
      message = format('A %s request cannot be moved to %s.', v_current, p_status);
  end if;

  if p_status = 'rejected' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception using errcode = 'PT422', message = 'Give a reason for the rejection.';
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

-- ---------- Row Level Security -------------------------------------------------------

alter table public.app_allowed_email_domains enable row level security;
alter table public.profiles                  enable row level security;
alter table public.supplies                  enable row level security;
alter table public.supply_requests           enable row level security;
alter table public.supply_request_items      enable row level security;
alter table public.request_code_counters     enable row level security;

create policy "profiles: read own, admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: admins update"
  on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "supplies: read active, admins read all"
  on public.supplies for select to authenticated
  using (is_active or (select public.is_admin()));
create policy "supplies: admins insert"
  on public.supplies for insert to authenticated with check ((select public.is_admin()));
create policy "supplies: admins update"
  on public.supplies for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "supplies: admins delete"
  on public.supplies for delete to authenticated using ((select public.is_admin()));

create policy "requests: read own, admins read all"
  on public.supply_requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select public.is_admin()));

create policy "request items: read with their request"
  on public.supply_request_items for select to authenticated
  using (exists (
    select 1 from public.supply_requests r
    where r.id = request_id and (r.requester_id = (select auth.uid()) or (select public.is_admin()))
  ));
-- app_allowed_email_domains and request_code_counters: no policies = no client access.

-- ---------- Privileges (defence in depth on top of RLS) -----------------------------

revoke all on public.app_allowed_email_domains, public.profiles, public.supplies, public.supply_requests,
              public.supply_request_items, public.request_code_counters, public.supply_request_list
  from anon;
revoke all on public.app_allowed_email_domains, public.request_code_counters from authenticated;
revoke insert, update, delete, truncate on public.supply_requests, public.supply_request_items from authenticated;
revoke insert, delete, truncate on public.profiles from authenticated;
grant select on public.supply_request_list to authenticated;
-- Not covered by RLS, never needed by the app.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

revoke execute on function public.touch_updated_at()   from public, anon, authenticated;
revoke execute on function public.handle_new_user()    from public, anon, authenticated;
revoke execute on function public.is_admin()           from public, anon;
revoke execute on function public.create_supply_request(jsonb, text) from public, anon;
revoke execute on function public.my_request_summary() from public, anon;
revoke execute on function public.update_supply_request_status(uuid, public.request_status, text) from public, anon;
grant execute on function public.is_admin()                                                       to authenticated;
grant execute on function public.create_supply_request(jsonb, text)                               to authenticated;
grant execute on function public.my_request_summary()                                             to authenticated;
grant execute on function public.update_supply_request_status(uuid, public.request_status, text) to authenticated;

-- ---------- Storage: product photos --------------------------------------------------

insert into storage.buckets (id, name, public)
values ('supply-images', 'supply-images', true)
on conflict (id) do nothing;

create policy "supply-images: admins manage"
  on storage.objects for all to authenticated
  using (bucket_id = 'supply-images' and (select public.is_admin()))
  with check (bucket_id = 'supply-images' and (select public.is_admin()));

-- >>> migrations/20261015000000_admin_review.sql
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

-- >>> migrations/20261015010000_notifications.sql
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

-- >>> seed.sql
-- Reference data. Safe to run more than once.

-- Optional: restrict accounts to your organisation's e-mail domain(s).
-- insert into public.app_allowed_email_domains (domain) values ('yourcompany.com') on conflict do nothing;

-- Catalogue from the Figma design. Images are served by the web app (public/supplies);
-- upload real photos to the "supply-images" bucket later and store the object key instead.
insert into public.supplies (name, stock, unit, image_url) values
  ('Gel Pen',           300, 'pcs', '/supplies/gel-pen.png'),
  ('Black Marker',        0, 'pcs', '/supplies/black-marker.png'),
  ('Standard Pen',      200, 'pcs', '/supplies/standard-pen.png'),
  ('A4 75gsm',           14, 'pcs', '/supplies/a4-paper.png'),
  ('Blue Gel Pen',      120, 'pcs', '/supplies/gel-pen.png'),
  ('Red Gel Pen',        80, 'pcs', '/supplies/gel-pen.png'),
  ('Ballpoint Pen',      45, 'pcs', '/supplies/standard-pen.png'),
  ('F4 70gsm',           22, 'pcs', '/supplies/a4-paper.png'),
  ('Whiteboard Marker',   9, 'pcs', '/supplies/black-marker.png'),
  ('Fine Liner',         60, 'pcs', '/supplies/standard-pen.png'),
  ('A3 80gsm',            5, 'pcs', '/supplies/a4-paper.png'),
  ('Permanent Marker',   18, 'pcs', '/supplies/black-marker.png'),
  ('Sticky Notes',       70, 'pcs', null)
on conflict (name) do nothing;
