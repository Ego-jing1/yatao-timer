-- 牙套时间管家 V4.0 数据库 + Storage SQL
-- Supabase → SQL Editor → New Query → 粘贴整段 → Run
-- 可重复执行，不会删除已有数据。

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nickname text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.aligner_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  wear_seconds integer default 0,
  off_seconds integer default 0,
  off_count integer default 0,
  current_tray integer default 1,
  total_trays integer default 42,
  tray_start_date date,
  chew_seconds integer default 0,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, record_date)
);

alter table public.user_profiles enable row level security;
alter table public.aligner_records enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.aligner_records to authenticated;

drop policy if exists "profile_owner" on public.user_profiles;
drop policy if exists "record_owner" on public.aligner_records;

create policy "profile_owner"
on public.user_profiles for all to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

create policy "record_owner"
on public.aligner_records for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ortho-photos','ortho-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=true,
    file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "ortho_photos_select" on storage.objects;
drop policy if exists "ortho_photos_insert_own" on storage.objects;
drop policy if exists "ortho_photos_update_own" on storage.objects;
drop policy if exists "ortho_photos_delete_own" on storage.objects;

create policy "ortho_photos_select"
on storage.objects for select to authenticated
using (bucket_id = 'ortho-photos');

create policy "ortho_photos_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ortho-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "ortho_photos_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'ortho-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'ortho-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "ortho_photos_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ortho-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
