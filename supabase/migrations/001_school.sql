create table public.teachers(id uuid primary key references auth.users(id),username text unique not null,display_name text not null,role text not null check(role in ('admin','teacher')),active boolean not null default true);
create table public.students(id uuid primary key default gen_random_uuid(),grade text not null,class_name text not null,number text unique not null,name text not null);
create index students_class on public.students(grade,class_name);
create table public.incidents(id uuid primary key,student_id uuid not null references public.students(id),grade text not null,class_name text not null,name text not null,number text not null,created_at timestamptz not null default now(),photo_key text not null,created_by uuid not null references public.teachers(id));
create index incidents_date on public.incidents(created_at);
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.incidents enable row level security;
revoke all on public.teachers,public.students,public.incidents from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('incident-photos','incident-photos',false,8388608,array['image/jpeg']);
create or replace function public.import_school_roster(items jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare r jsonb; old public.students; added integer:=0;
begin
for r in select * from jsonb_array_elements(items) loop
 select * into old from public.students where number=r->>'number';
 if found then
  if old.name<>r->>'name' or old.grade<>r->>'grade' or old.class_name<>r->>'class_name' then raise exception '学号已关联其他学生或班级：%',r->>'number';end if;
 else
  insert into public.students(grade,class_name,number,name) values(r->>'grade',r->>'class_name',r->>'number',r->>'name');added:=added+1;
 end if;
end loop;return added;end;$$;
revoke execute on function public.import_school_roster(jsonb) from public,anon,authenticated;
grant execute on function public.import_school_roster(jsonb) to service_role;
create or replace function public.school_class_counts(p_start timestamptz,p_end timestamptz) returns table(grade text,class_name text,count bigint) language sql stable security definer set search_path=public as $$
with classes as(select grade,class_name from students union select grade,class_name from incidents),counts as(select grade,class_name,count(*) as n from incidents where created_at>=p_start and created_at<p_end group by grade,class_name)
select classes.grade,classes.class_name,coalesce(counts.n,0) from classes left join counts using(grade,class_name) order by classes.grade,coalesce(counts.n,0) desc,classes.class_name;
$$;
revoke execute on function public.school_class_counts(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.school_class_counts(timestamptz,timestamptz) to service_role;
