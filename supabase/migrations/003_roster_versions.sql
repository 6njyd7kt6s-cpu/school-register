-- Preserve previous roster entries and incident snapshots when a new roster is activated.
alter table public.students add column if not exists active boolean not null default true;
create or replace function public.school_class_counts(p_start timestamptz,p_end timestamptz) returns table(grade text,class_name text,count bigint) language sql stable security definer set search_path=public as $$
with classes as(select grade,class_name from students where active union select grade,class_name from incidents where deleted_at is null and created_at>=p_start and created_at<p_end),counts as(select grade,class_name,count(*) as n from incidents where deleted_at is null and created_at>=p_start and created_at<p_end group by grade,class_name)
select classes.grade,classes.class_name,coalesce(counts.n,0) from classes left join counts using(grade,class_name) order by classes.grade,coalesce(counts.n,0) desc,classes.class_name;
$$;
