-- Gun bazli duzenleme ("⋯" > "📝 Bu Günü Düzenle") icin. Normal "✏️ Düzenle"
-- modu programin kendisini (her hafta tekrarlanan slotu) degistirir - bu
-- tablo ise SADECE belirli bir TAKVIM GUNUNU override eder, program
-- yapisina hic dokunmadan. day_data, normal bir program gunuyle AYNI
-- sekli tasir ({type, name, day, warmup, exercises, hiit?, amrap?}).
create table if not exists public.day_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  day_data jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

create index if not exists day_overrides_user_date_idx on public.day_overrides (user_id, date);

alter table public.day_overrides enable row level security;

-- NOT: is_admin() bu projede daha once tanimlanmis SECURITY DEFINER fonksiyon -
-- diger tablolarla ayni admin-bypass deseni burada da kullanildi. Fonksiyon
-- projende yoksa "or is_admin()" kisimlarini silip sadece "user_id = auth.uid()" birak.
create policy "kendi_day_overrides_okur"
on public.day_overrides for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_day_overrides_ekler"
on public.day_overrides for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

-- "Bu Günü Düzenle" ayni tarihe TEKRAR kaydedince (upsert) ayni satiri
-- GUNCELLER (yeni satir eklemez) - bu yuzden UPDATE policy'si de gerekiyor.
create policy "kendi_day_overrides_gunceller"
on public.day_overrides for update
to authenticated
using (user_id = auth.uid() or is_admin())
with check (user_id = auth.uid() or is_admin());

create policy "kendi_day_overrides_siler"
on public.day_overrides for delete
to authenticated
using (user_id = auth.uid() or is_admin());
