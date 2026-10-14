-- Ana Sayfa'daki "+ Aktivite Ekle" ile elle loglanan ekstra aktiviteler
-- (koşu, bisiklet, yüzme vb.) - BMR/TDEE'nin üstüne eklenen, o gün
-- yakılan ekstra kaloriyi hesaplamak icin kullanilir.
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  activity_type text not null,
  duration_min numeric not null,
  kcal_burned numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_user_date_idx on public.activity_logs (user_id, date);

alter table public.activity_logs enable row level security;

-- Herkes sadece KENDI aktivite kayitlarini okuyup yazabilir.
-- NOT: is_admin() bu projede daha once (profiles/custom_foods vb.
-- tablolarda) tanimlanmis SECURITY DEFINER fonksiyon - admin baska bir
-- uyenin profilini goruntulerken o uye adina aktivite kaydedebilsin/
-- okuyabilsin diye ayni admin-bypass deseni burada da kullanildi.
-- Fonksiyon projende yoksa "or is_admin()" kisimlarini silip sadece
-- "user_id = auth.uid()" birak.
create policy "kendi_activity_logs_okur"
on public.activity_logs for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_activity_logs_ekler"
on public.activity_logs for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

create policy "kendi_activity_logs_siler"
on public.activity_logs for delete
to authenticated
using (user_id = auth.uid() or is_admin());
