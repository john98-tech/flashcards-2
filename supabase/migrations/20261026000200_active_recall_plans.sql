alter table public.active_recall_lessons
  add column if not exists question2_prompt text,
  add column if not exists question2_type text,
  add column if not exists question2_answer text,
  add column if not exists question2_options jsonb,
  add column if not exists question2_correct_index integer;

alter table public.active_recall_lessons
  add constraint active_recall_lessons_question2_type_chk
  check (question2_type is null or question2_type in ('open', 'mcq'));

alter table public.active_recall_lessons
  add constraint active_recall_lessons_question2_options_chk
  check (question2_options is null or jsonb_typeof(question2_options) = 'array');

create table public.active_recall_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null references public.active_recall_courses (id) on update cascade on delete cascade,
  start_date date not null,
  end_date date not null,
  exam_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  lesson_ids text[] not null check (cardinality(lesson_ids) > 0),
  intervals smallint[] not null default array[0, 1, 3, 6, 10, 15, 22, 29]::smallint[],
  daily_goal integer not null default 12 check (daily_goal between 1 and 100),
  rest_day smallint check (rest_day is null or rest_day between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_recall_plans_id_user_key unique (id, user_id),
  constraint active_recall_plans_date_range_chk check (end_date >= start_date),
  constraint active_recall_plans_exam_date_chk check (exam_date is null or exam_date >= start_date)
);

create unique index active_recall_plans_one_active_per_course
  on public.active_recall_plans (user_id, course_id)
  where status = 'active';
create index active_recall_plans_user_idx on public.active_recall_plans (user_id, status);

create table public.active_recall_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.active_recall_lessons (id) on update cascade on delete cascade,
  review_number integer not null check (review_number > 0),
  scheduled_date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rescheduled', 'skipped')),
  completed_at timestamptz,
  self_assessment text check (self_assessment is null or self_assessment in ('knew_it', 'review_again')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, lesson_id, review_number),
  constraint active_recall_sessions_plan_owner_fkey
    foreign key (plan_id, user_id) references public.active_recall_plans (id, user_id) on delete cascade
);

create index active_recall_sessions_user_date_idx
  on public.active_recall_sessions (user_id, scheduled_date, status);
create index active_recall_sessions_plan_date_idx
  on public.active_recall_sessions (plan_id, scheduled_date);

create table public.active_recall_settings (
  id boolean primary key default true check (id),
  intervals smallint[] not null default array[0, 1, 3, 6, 10, 15, 22, 29]::smallint[],
  daily_goal integer not null default 12 check (daily_goal between 1 and 100),
  rest_day smallint check (rest_day is null or rest_day between 0 and 6),
  updated_at timestamptz not null default now()
);

insert into public.active_recall_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.active_recall_settings enable row level security;

alter table public.active_recall_plans enable row level security;
alter table public.active_recall_sessions enable row level security;

create policy "Students can read their own recall plans"
  on public.active_recall_plans for select to authenticated using (auth.uid() = user_id);
create policy "Students can read their own recall sessions"
  on public.active_recall_sessions for select to authenticated using (auth.uid() = user_id);

create or replace function public.save_active_recall_plan(
  p_user_id uuid,
  p_course_id text,
  p_start_date date,
  p_end_date date,
  p_exam_date date,
  p_lesson_ids text[],
  p_intervals smallint[],
  p_daily_goal integer,
  p_rest_day smallint,
  p_sessions jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the trusted server may save recall plans.';
  end if;
  if p_user_id is null or cardinality(p_lesson_ids) = 0 or jsonb_typeof(p_sessions) <> 'array'
     or cardinality(p_lesson_ids) <> (select count(distinct lesson_id) from unnest(p_lesson_ids) as selected(lesson_id)) then
    raise exception 'Invalid recall plan.';
  end if;
  if exists (
    select 1 from unnest(p_lesson_ids) as selected(id)
    left join public.active_recall_lessons lesson on lesson.id = selected.id and lesson.course_id = p_course_id
    where lesson.id is null
  ) then
    raise exception 'A selected lesson does not belong to this course.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_sessions) as incoming(lesson_id text, review_number integer, scheduled_date date)
    where incoming.lesson_id <> all(p_lesson_ids)
       or incoming.review_number < 1
       or incoming.scheduled_date < p_start_date
       or incoming.scheduled_date > p_end_date
       or (p_exam_date is not null and incoming.scheduled_date > p_exam_date)
  ) then
    raise exception 'A scheduled session is outside the plan date range.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_course_id, 0));
  select id into v_plan_id
    from public.active_recall_plans
    where user_id = p_user_id and course_id = p_course_id and status = 'active'
    for update;

  if v_plan_id is null then
    insert into public.active_recall_plans
      (user_id, course_id, start_date, end_date, exam_date, lesson_ids, intervals, daily_goal, rest_day)
    values
      (p_user_id, p_course_id, p_start_date, p_end_date, p_exam_date, p_lesson_ids, p_intervals, p_daily_goal, p_rest_day)
    returning id into v_plan_id;
  else
    update public.active_recall_plans
      set start_date = p_start_date,
          end_date = p_end_date,
          exam_date = p_exam_date,
          lesson_ids = p_lesson_ids,
          intervals = p_intervals,
          daily_goal = p_daily_goal,
          rest_day = p_rest_day,
          updated_at = now()
      where id = v_plan_id;
  end if;

  update public.active_recall_sessions session
    set status = 'skipped', updated_at = now()
    where session.plan_id = v_plan_id and session.status in ('pending', 'rescheduled')
      and not exists (
        select 1 from jsonb_to_recordset(p_sessions) as incoming(lesson_id text, review_number integer)
        where incoming.lesson_id = session.lesson_id and incoming.review_number = session.review_number
      );

  insert into public.active_recall_sessions as existing_session
    (plan_id, user_id, lesson_id, review_number, scheduled_date, status)
  select v_plan_id, p_user_id, incoming.lesson_id, incoming.review_number, incoming.scheduled_date, 'pending'
    from jsonb_to_recordset(p_sessions) as incoming(lesson_id text, review_number integer, scheduled_date date)
  on conflict (plan_id, lesson_id, review_number) do update
    set scheduled_date = excluded.scheduled_date,
        status = case
          when existing_session.scheduled_date <> excluded.scheduled_date then 'rescheduled'
          else 'pending'
        end,
        updated_at = now()
    where existing_session.status <> 'completed';

  return v_plan_id;
end;
$$;

revoke all on function public.save_active_recall_plan(uuid, text, date, date, date, text[], smallint[], integer, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.save_active_recall_plan(uuid, text, date, date, date, text[], smallint[], integer, smallint, jsonb) to service_role;
