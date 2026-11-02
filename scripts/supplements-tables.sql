-- Profil ekranindaki "Takviyelerim" listesi ve Beslenme ekranindaki gunluk
-- takviye takip checkbox'lari icin. supplements = kullanicinin kendi
-- tanimladigi takviye listesi (bir kere eklenir), supplement_logs = o
-- takviyenin HANGI GUN alindigi (her gun ayri satir, toggle ile guncellenir).
create table if not exists public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose text,
  timing text, -- 'morning' | 'pre' | 'post' | 'night'
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists supplements_user_idx on public.supplements (user_id, order_index);

alter table public.supplements enable row level security;

-- NOT: is_admin() bu projede daha once tanimlanmis SECURITY DEFINER fonksiyon -
-- diger tablolarla ayni admin-bypass deseni burada da kullanildi. Fonksiyon
-- projende yoksa "or is_admin()" kisimlarini silip sadece "user_id = auth.uid()" birak.
create policy "kendi_supplements_okur"
on public.supplements for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_supplements_ekler"
on public.supplements for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

create policy "kendi_supplements_siler"
on public.supplements for delete
to authenticated
using (user_id = auth.uid() or is_admin());

create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  taken boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists supplement_logs_user_date_idx on public.supplement_logs (user_id, date);

alter table public.supplement_logs enable row level security;

create policy "kendi_supplement_logs_okur"
on public.supplement_logs for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_supplement_logs_ekler"
on public.supplement_logs for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

-- Checkbox'a her basildiginda ayni gunun satiri UZERINDE guncelleniyor
-- (yeni satir eklemek yerine) - bu yuzden diger tablolardan farkli olarak
-- UPDATE policy'si de gerekiyor.
create policy "kendi_supplement_logs_gunceller"
on public.supplement_logs for update
to authenticated
using (user_id = auth.uid() or is_admin())
with check (user_id = auth.uid() or is_admin());

create policy "kendi_supplement_logs_siler"
on public.supplement_logs for delete
to authenticated
using (user_id = auth.uid() or is_admin());
