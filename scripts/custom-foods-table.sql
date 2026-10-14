-- "DB'ye kaydet" ile elle eklenen veya AI/OpenFoodFacts'ten otomatik
-- ogrenilen besinlerin KALICI hali. Eskiden sadece tarayicinin
-- localStorage'ina yaziliyordu - cihaz degisince, tarayici verisi
-- temizlenince ya da baska birinin telefonunda hic goruluyordu.
create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kcal numeric not null default 0,
  protein numeric not null default 0,
  carb numeric not null default 0,
  fat numeric not null default 0,
  per numeric not null default 100,
  unit text not null default 'gram',
  created_at timestamptz not null default now(),
  -- Ayni kullanici ayni ismi tekrar kaydederse (ör. degerleri
  -- guncellemek icin) yeni satir degil, UPSERT ile guncelleme olsun.
  unique (user_id, name)
);

alter table public.custom_foods enable row level security;

-- Herkes sadece KENDI kaydettigi besinleri okuyup yazabilir.
--
-- NOT: is_admin() bu projede DAHA ONCE (profiles/programs/workout_sets
-- vb. tablolarda) tanimlanmis SECURITY DEFINER bir fonksiyon - admin
-- baska bir uyenin profilini goruntulerken o uye adina besin
-- kaydedebilsin/okuyabilsin diye ayni admin-bypass deseni burada da
-- kullanildi. Eger bu fonksiyon projende farkli bir isimdeyse ya da
-- hic yoksa, asagidaki "or is_admin()" kisimlarini silip sadece
-- "user_id = auth.uid()" birak (admin, baska uyeler adina besin
-- kaydedemez/goremez hale gelir - uygulamanin geri kalani yine calisir).
create policy "kendi_custom_foods_okur"
on public.custom_foods for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_custom_foods_ekler"
on public.custom_foods for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

create policy "kendi_custom_foods_gunceller"
on public.custom_foods for update
to authenticated
using (user_id = auth.uid() or is_admin())
with check (user_id = auth.uid() or is_admin());

create policy "kendi_custom_foods_siler"
on public.custom_foods for delete
to authenticated
using (user_id = auth.uid() or is_admin());
