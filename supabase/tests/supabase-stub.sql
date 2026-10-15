-- Minimal stand-in for the parts of a Supabase database the migration depends on, so the
-- schema can be exercised on a plain Postgres (PGlite) in CI without a Supabase project.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create schema storage;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb
);

-- Same contract as Supabase: the JWT "sub" claim exposed through a GUC.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase grants API roles everything on new public objects; RLS + explicit revokes do the rest.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
