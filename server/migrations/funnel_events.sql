-- מדידת המשפך הוויראלי: אירועים אנונימיים (ללא משתמש/IP) מנקודות המפתח של הלולאה.
-- service_role בלבד כותב/קורא (RLS ללא policies), כמו progress_snapshots.
create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  quest_id uuid,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists funnel_events_event_time on public.funnel_events(event, created_at);
alter table public.funnel_events enable row level security;
