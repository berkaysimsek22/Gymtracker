-- Ana sayfadaki "PR Bildirimi" bloğu icin: her set "tamamlandı" olarak
-- işaretlendiğinde (checkmark'a basılınca) o anki ağırlık burada APPEND-ONLY
-- olarak loglanır. workout_sets tablosu her hafta ayni slotun (day_index +
-- exercise_index + set_index) üzerine YAZDIĞI için (A/B hafta rotasyonunda
-- bile) önceki haftanin agirligi kalici olarak kaybolur - "bu hafta vs gecen
-- hafta max agirlik" karsilastirmasi bu yuzden workout_sets'ten YAPILAMAZ.
-- Bu tablo, egzersiz ismini de (day_index/exercise_index degil) dogrudan
-- kaydederek, program duzenlense bile dogru egzersizle eslesmeyi saglar.
create table if not exists public.set_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  weight numeric not null,
  reps text,
  logged_at timestamptz not null default now()
);

create index if not exists set_history_user_ex_idx on public.set_history (user_id, exercise_name, logged_at);

alter table public.set_history enable row level security;

-- NOT: is_admin() bu projede daha once tanimlanmis SECURITY DEFINER fonksiyon -
-- diger tablolarla ayni admin-bypass deseni burada da kullanildi. Fonksiyon
-- projende yoksa "or is_admin()" kisimlarini silip sadece "user_id = auth.uid()" birak.
create policy "kendi_set_history_okur"
on public.set_history for select
to authenticated
using (user_id = auth.uid() or is_admin());

create policy "kendi_set_history_ekler"
on public.set_history for insert
to authenticated
with check (user_id = auth.uid() or is_admin());

create policy "kendi_set_history_siler"
on public.set_history for delete
to authenticated
using (user_id = auth.uid() or is_admin());
