-- ExerciseDB GIF onbellegi icin yeni tablo. Kullaniciya ozel veri degil
-- (referans/katalog verisi), herkes okuyabilir; sadece import script'i
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
-- script'inin kullandigi service_role anahtari RLS'i zaten atlar, normal
-- kullanicilarin (anon/authenticated) bu tabloya yazmasina gerek yok.
