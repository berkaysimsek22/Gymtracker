-- ExerciseDB GIF onbellegi icin yeni tablo. Kullaniciya ozel veri degil
-- (referans/katalog verisi), herkes okuyabilir; sadece import Edge Function'i
-- (service_role anahtariyla, RLS'i atlayarak) yazar.
create table if not exists public.exercises (
  id text primary key,
  name text not null,
  gif_url text,
  body_part text,
  target text,
  equipment text,
  secondary_muscles jsonb,
  instructions jsonb,
  updated_at timestamptz default now()
);

alter table public.exercises enable row level security;

create policy "herkes_okuyabilir_exercises"
on public.exercises
for select
to public
using (true);

-- Not: INSERT/UPDATE icin kasten bir policy eklenmedi - sadece import
-- Edge Function'inin kullandigi service_role anahtari RLS'i zaten atlar,
-- normal kullanicilarin (anon/authenticated) bu tabloya yazmasina gerek yok.

-- Import Edge Function'i her cagrildiginda nereden devam edecegini bilsin
-- diye (Edge Function'lar cagrilar arasi hafiza tutmuyor - istekler arasi
-- "offset" burada saklanmali). Tek satirlik basit bir ilerleme kaydi.
create table if not exists public.exercise_import_progress (
  id int primary key default 1,
  offset_val int not null default 0,
  done boolean not null default false,
  updated_at timestamptz default now(),
  constraint exercise_import_progress_single_row check (id = 1)
);

insert into public.exercise_import_progress (id, offset_val, done)
values (1, 0, false)
on conflict (id) do nothing;

alter table public.exercise_import_progress enable row level security;
-- Bu tabloya sadece service_role (Edge Function) erisir, baska policy gerekmiyor.
