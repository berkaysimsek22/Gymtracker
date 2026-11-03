-- TEK PARCA, KENDINI DOGRULAYAN script. Onceki script'in sadece bir kismi
-- calismis olabilir (ör. sadece ilk SELECT calistirilip DELETE/INDEX kismi
-- calistirilmamis olabilir) - bu yuzden hepsini TEK sorguda, en sonda da
-- "simdi kac yinelenen kaldi + unique index var mi" diye DOGRULAYAN bir
-- sonuc dondurecek sekilde birlestirdim.
--
-- KULLANIM: Bu dosyanin TAMAMINI kopyala, Supabase SQL Editor'de YENI bir
-- sorgu sekmesine yapistir, hicbir seyi SECMEDEN (tum sayfa bos/secili
-- degilken) sag ustteki Run/Ctrl+Enter'a bas. En altta bir SELECT sonucu
-- gorunecek - "kalan_yinelenen" 0, "unique_index_var_mi" true olmali.

with ranked as (
  select id,
    row_number() over (
      partition by user_id, day_index, exercise_index, set_index
      order by (done is true) desc, (weight is not null) desc, (reps is not null) desc, id desc
    ) as rn
  from workout_sets
)
delete from workout_sets where id in (select id from ranked where rn > 1);

create unique index if not exists workout_sets_unique_slot
on workout_sets (user_id, day_index, exercise_index, set_index);

-- DOGRULAMA - bu sonucu bana (ekran goruntusu) gonder:
select
  (select count(*) from (
    select 1 from workout_sets group by user_id, day_index, exercise_index, set_index having count(*) > 1
  ) x) as kalan_yinelenen,
  exists(select 1 from pg_indexes where indexname = 'workout_sets_unique_slot') as unique_index_var_mi;
