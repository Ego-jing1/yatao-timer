-- =====================================================
-- 牙套时间管家 V5.2 完整数据库 SQL
-- 可重复执行；不会删除已有数据。
-- =====================================================

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
  updated_at timestamptz default now()
);

create unique index if not exists aligner_records_user_day_idx
on public.aligner_records(user_id, record_date);

create index if not exists aligner_records_user_idx
on public.aligner_records(user_id);

create index if not exists aligner_records_update_idx
on public.aligner_records(updated_at);

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_aligner_records_updated_at on public.aligner_records;

create trigger trg_aligner_records_updated_at
before update on public.aligner_records
for each row execute function public.update_updated_at();

alter table public.user_profiles enable row level security;
alter table public.aligner_records enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.aligner_records to authenticated;

drop policy if exists "profile_owner" on public.user_profiles;
create policy "profile_owner"
on public.user_profiles for all to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "record_owner" on public.aligner_records;
create policy "record_owner"
on public.aligner_records for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =====================================================
-- Realtime：幂等开启，不会因为已经开启而报错
-- =====================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aligner_records'
  ) then
    alter publication supabase_realtime add table public.aligner_records;
  end if;
end
$$;

-- =====================================================
-- Storage Bucket：与代码一致，使用 ortho-photos
-- =====================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ortho-photos',
  'ortho-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic'];

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

select '牙套时间管家 V5.2 数据库初始化完成 ✅' as result;
