alter table public.incidents
add column if not exists details text not null default ''
check (length(details) <= 500);
