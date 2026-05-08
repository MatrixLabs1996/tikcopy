-- TikCopy — Initial Schema
-- Run this in the Supabase SQL editor

-- ── Profiles (extends auth.users) ─────────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text,
  plan text default 'free' check (plan in ('free', 'pro', 'agency')),
  minutes_used integer default 0,
  minutes_limit integer default 30,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Projects ──────────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  niche text,
  avatar text,
  tone text,
  platform text,
  created_at timestamptz default now()
);

-- ── Transcriptions ────────────────────────────────────────────────────────────
create table public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  type text check (type in ('organic', 'lesson', 'ad')) not null,
  source_url text,
  source_filename text,
  title text,
  niche text,
  transcript_full text,
  hook text,
  landing_phrase text,
  body text,
  cta text,
  metadata jsonb,
  structure_analysis jsonb,
  score jsonb,
  created_at timestamptz default now()
);

-- ── Project Memory (Zona de Copy) ─────────────────────────────────────────────
create table public.project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  type text check (type in ('hook', 'vocabulary', 'structure', 'objection')) not null,
  content text not null,
  active boolean default true,
  frequency integer default 1,
  created_at timestamptz default now()
);

-- ── Swipes ────────────────────────────────────────────────────────────────────
create table public.swipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  tag text,
  content text not null,
  source text,
  created_at timestamptz default now()
);

-- ── Copy Templates ────────────────────────────────────────────────────────────
create table public.copy_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  niche text,
  is_public boolean default false,
  fields jsonb not null default '[]',
  created_at timestamptz default now()
);

-- ── Copy Drafts ───────────────────────────────────────────────────────────────
create table public.copy_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  template_id uuid references public.copy_templates(id) on delete set null,
  briefing_id uuid,
  research_id uuid,
  title text,
  fields_data jsonb default '{}',
  visual_refs text[] default '{}',
  dont_do text,
  editor_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger copy_drafts_updated_at
  before update on public.copy_drafts
  for each row execute procedure public.set_updated_at();

-- ── Briefings ─────────────────────────────────────────────────────────────────
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  angle text,
  new_idea text,
  avatar text,
  format text,
  headline boolean default false,
  editing_style text,
  organic_ref_url text,
  organic_transcript text,
  raw_content text,
  created_at timestamptz default now()
);

-- ── Researches ────────────────────────────────────────────────────────────────
create table public.researches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  market text,
  chiclete_name text,
  problem_mechanism text,
  solution_mechanism text,
  vsl_avatar text,
  vsl_format text,
  vsl_bullets jsonb default '[]',
  vsl_story text,
  cta_destination text,
  validated_angles jsonb default '[]',
  validated_formats jsonb default '[]',
  validated_avatars jsonb default '[]',
  chiclete_names_market jsonb default '[]',
  rejected_solutions jsonb default '[]',
  main_pains jsonb default '[]',
  main_desires jsonb default '[]',
  slang jsonb default '[]',
  common_enemy jsonb default '[]',
  cultural_refs jsonb default '[]',
  organic_hooks jsonb default '[]',
  organic_structures jsonb default '[]',
  preservation_law jsonb default '[]',
  raw_content text,
  created_at timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.transcriptions enable row level security;
alter table public.project_memory enable row level security;
alter table public.swipes enable row level security;
alter table public.copy_templates enable row level security;
alter table public.copy_drafts enable row level security;
alter table public.briefings enable row level security;
alter table public.researches enable row level security;

-- Policies
create policy "users_own_profile" on public.profiles
  for all using (auth.uid() = id);

create policy "users_own_projects" on public.projects
  for all using (auth.uid() = user_id);

create policy "users_own_transcriptions" on public.transcriptions
  for all using (auth.uid() = user_id);

create policy "users_own_memory" on public.project_memory
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

create policy "users_own_swipes" on public.swipes
  for all using (auth.uid() = user_id);

create policy "users_own_templates" on public.copy_templates
  for all using (auth.uid() = user_id or is_public = true);

create policy "users_own_drafts" on public.copy_drafts
  for all using (auth.uid() = user_id);

create policy "users_own_briefings" on public.briefings
  for all using (auth.uid() = user_id);

create policy "users_own_researches" on public.researches
  for all using (auth.uid() = user_id);
