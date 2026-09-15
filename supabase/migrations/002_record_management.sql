alter table public.incidents add column if not exists deleted_at timestamptz;
alter table public.incidents add column if not exists revision integer not null default 0;
create table if not exists public.incident_audit(id uuid primary key default gen_random_uuid(),incident_id uuid not null references public.incidents(id),actor uuid not null references public.teachers(id),action text not null,reason text not null,before_data jsonb not null,after_data jsonb not null,changed_at timestamptz not null default now());
alter table public.incident_audit enable row level security;
revoke all on public.incident_audit from public,anon,authenticated;
grant all on public.incident_audit to service_role;
create or replace function public.manage_school_incident(p_id uuid,p_actor uuid,p_action text,p_reason text,p_revision integer,p_student uuid default null,p_date timestamptz default null) returns void language plpgsql security definer set search_path=public as $$
declare old incidents; newer incidents; s students;
begin
if not exists(select 1 from teachers where id=p_actor and active and role='admin') then raise exception '仅管理员可操作';end if;
if length(trim(p_reason))<2 or length(p_reason)>300 then raise exception '请填写2至300字操作原因';end if;
select * into old from incidents where id=p_id for update;
if not found then raise exception '记录不存在';end if;
if old.revision<>p_revision then raise exception '记录已被修改，请刷新后重试';end if;
if p_action='edit' then
if old.deleted_at is not null then raise exception '请先恢复记录';end if;
select * into s from students where id=p_student;
if not found or p_date is null or p_date>now()+interval '5 minutes' or p_date<'2000-01-01' then raise exception '学生或日期无效';end if;
update incidents set student_id=s.id,grade=s.grade,class_name=s.class_name,name=s.name,number=s.number,created_at=p_date,revision=revision+1 where id=p_id;
elsif p_action='delete' then
if old.deleted_at is not null then raise exception '记录已删除';end if;
update incidents set deleted_at=now(),revision=revision+1 where id=p_id;
elsif p_action='restore' then
if old.deleted_at is null then raise exception '记录未删除';end if;
update incidents set deleted_at=null,revision=revision+1 where id=p_id;
else raise exception '操作无效';end if;
select * into newer from incidents where id=p_id;
insert into incident_audit(incident_id,actor,action,reason,before_data,after_data) values(p_id,p_actor,p_action,trim(p_reason),to_jsonb(old),to_jsonb(newer));
end;$$;
revoke execute on function public.manage_school_incident(uuid,uuid,text,text,integer,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.manage_school_incident(uuid,uuid,text,text,integer,uuid,timestamptz) to service_role;
create or replace function public.school_class_counts(p_start timestamptz,p_end timestamptz) returns table(grade text,class_name text,count bigint) language sql stable security definer set search_path=public as $$
with classes as(select grade,class_name from students union select grade,class_name from incidents where deleted_at is null),counts as(select grade,class_name,count(*) as n from incidents where deleted_at is null and created_at>=p_start and created_at<p_end group by grade,class_name)
select classes.grade,classes.class_name,coalesce(counts.n,0) from classes left join counts using(grade,class_name) order by classes.grade,coalesce(counts.n,0) desc,classes.class_name;
$$;
