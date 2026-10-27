-- Minimal stand-ins for the Supabase-managed pieces our migrations reference (auth schema, roles,
-- storage helpers), so the SQL migrations and integration tests run on a plain PostgreSQL 15+ server.
-- Test and CI use only. Never apply this to a real Supabase project.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
create schema auth; create schema storage; create extension if not exists pgcrypto;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema public, auth to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create function storage.filename(name text) returns text language sql as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
