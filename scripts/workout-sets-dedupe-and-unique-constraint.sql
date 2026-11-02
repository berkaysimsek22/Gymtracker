-- "Günü Tamamla" sonrası sayfa YENİLENİNCE setlerin eski haline dönmesi
-- şikayetinin kök sebeplerinden biri: aynı set (user_id+day_index+
-- exercise_index+set_index) için eşzamanlı iki yazım (ör. ağırlık alanının
-- 600ms'lik debounce'u ile checkmark'ın anlık yazımı aynı ana denk gelirse),
-- ikisi de henüz bir db_id bilmediği (o haftanın ilk kaydı olduğu) için
-- "mevcut satır var mı" diye aynı anda sorup ikisi de "yok" görüp AYRI AYRI
-- INSERT edebiliyordu. Uygulama tarafı bu yarışı artık engelliyor (bkz.
-- queuedPerformSetSave), ama BU SCRIPT ÖNCESİNDE zaten oluşmuş olabilecek
-- yinelenen satırları temizler ve bir daha oluşmasını veritabanı seviyesinde
-- de imkansız hale getirir.

-- 1) ÖNCE KONTROL ET (hiçbir şeyi silmez/değiştirmez) - kaç grup etkilenecek gör:
select user_id, day_index, exercise_index, set_index, count(*) as kac_satir
from workout_sets
group by 1,2,3,4
having count(*) > 1;

-- 2) Yinelenenleri temizle: her grupta EN FAZLA bilgiyi taşıyan satırı
-- (önce done=true, sonra weight dolu, sonra reps dolu olanı tercih ederek)
-- tutar, diğerlerini siler. NOT: workout_sets'te güvenilir bir "ne zaman
-- yazıldı" sütunu olmadığı için (id uuid - zaman sırası taşımaz), eşitlik
-- durumunda hangisinin tutulacağı rastgeledir; bu script'i çalıştırdıktan
-- sonra birkaç kendi antrenman kaydını gözden geçirmen iyi olur.
with ranked as (
  select id,
    row_number() over (
      partition by user_id, day_index, exercise_index, set_index
      order by (done is true) desc, (weight is not null) desc, (reps is not null) desc, id desc
    ) as rn
  from workout_sets
)
delete from workout_sets where id in (select id from ranked where rn > 1);

-- 3) Aynı slot için ikinci bir satır oluşmasını artık VERİTABANI SEVİYESİNDE
-- de engelle (uygulama tarafı zaten engelliyor, bu ekstra bir güvenlik katmanı).
create unique index if not exists workout_sets_unique_slot
on workout_sets (user_id, day_index, exercise_index, set_index);
