-- Macrocoach database. Paste this whole file into Supabase > SQL Editor > Run.
-- Safe to run once on a new project. Every table is private to its owner (row level security).

create table if not exists public.nutrition_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  sex text check (sex in ('male','female')),
  birth_date date,
  height_cm numeric,
  weight_kg numeric,
  target_weight_kg numeric,
  body_fat_pct numeric,
  neat_level text not null default 'moderate' check (neat_level in ('low','moderate','high')),
  training_days int not null default 3 check (training_days between 0 and 7),
  formula text not null default 'mifflin' check (formula in ('mifflin','katch')),
  goal text not null default 'cut' check (goal in ('cut','maintain','bulk')),
  weekly_rate_pct numeric not null default 0.5,
  target_kcal int,
  target_protein_g int,
  target_carbs_g int,
  target_fat_g int,
  units text not null default 'lb' check (units in ('lb','kg')),
  updated_at timestamptz not null default now()
);

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null check (source in ('usda','off','custom','recipe')),
  source_id text,
  name text not null,
  brand text,
  barcode text,
  kcal_100g numeric not null,
  protein_100g numeric not null,
  carbs_100g numeric not null,
  fat_100g numeric not null,
  serving_g numeric,
  serving_label text,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists foods_user_name on public.foods (user_id, name);
create index if not exists foods_user_barcode on public.foods (user_id, barcode);

create table if not exists public.food_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner','snacks','pre_workout','post_workout')),
  food_id uuid references public.foods(id) on delete set null,
  name text not null,
  grams numeric,
  kcal numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists entries_user_date on public.food_entries (user_id, entry_date);

create table if not exists public.weigh_ins (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weigh_date date not null,
  weight_kg numeric not null check (weight_kg > 0),
  primary key (user_id, weigh_date)
);

create table if not exists public.progress_photos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  taken_on date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  name text not null,
  servings numeric not null default 1 check (servings > 0),
  cooked_weight_g numeric
);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete restrict,
  grams numeric not null check (grams > 0)
);

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checkin_date date not null,
  old_kcal int not null,
  new_kcal int not null,
  trend_kg_per_week numeric,
  avg_kcal numeric,
  reason text,
  created_at timestamptz not null default now()
);

-- Recent and frequent foods for the add-food screen (runs as the signed-in user, so it respects row level security)
create or replace view public.food_usage with (security_invoker = true) as
  select food_id, max(entry_date) as last_used, count(*) as times_used
  from public.food_entries
  where food_id is not null
  group by food_id;

-- Row level security: each person sees only their own rows
alter table public.nutrition_profiles enable row level security;
create policy "own profile" on public.nutrition_profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['foods','food_entries','weigh_ins','progress_photos','recipes','recipe_items','weekly_checkins']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Private photo storage: each person can only touch files inside a folder named with their own user id
insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false)
  on conflict (id) do nothing;

create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
