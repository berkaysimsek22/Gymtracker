-- "Egzersizler" kütüphanesine (Workouts > Egzersizler) kullanıcının kendi
-- eklediği hareketlerin KALICI hali. custom_foods tablosuyla aynı desen -
-- her kullanıcı sadece kendi eklediklerini görür/yönetir.
create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  muscle text not null default '',
  muscles jsonb not null default '[]'::jsonb,
  sets integer not null default 3,
  reps text not null default '10-12',
  rest_sec integer not null default 90,
  tip text,
  created_at timestamptz not null default now(),
  -- Ayni kullanici ayni ismi tekrar eklerse yeni satir degil, UPSERT ile
  -- guncelleme olsun (custom_foods ile ayni mantik).
  unique (user_id, name)
);

alter table public.custom_exercises enable row level security;

-- Herkes sadece KENDI eklediği hareketleri okuyup yazabilir.
--
-- NOT: is_admin() bu projede DAHA ONCE (profiles/programs/custom_foods
-- vb. tablolarda) tanimlanmis SECURITY DEFINER bir fonksiyon - o yoksa
-- asagidaki "or is_admin()" kisimlarini silip sadece "user_id = auth.uid()"
-- birak.
create policy "kendi_custom_exercises_okur"
on public.custom_exercises for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_custom_exercises_ekler"
on public.custom_exercises for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

create policy "kendi_custom_exercises_gunceller"
on public.custom_exercises for update
to authenticated
using (user_id = auth.uid() or is_admin())
with check (user_id = auth.uid() or is_admin());

create policy "kendi_custom_exercises_siler"
on public.custom_exercises for delete
to authenticated
using (user_id = auth.uid() or is_admin());
