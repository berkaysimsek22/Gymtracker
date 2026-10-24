-- Antrenman suresi (baslangic-bitis) ozelligi icin: finishDay() antrenman
-- bittiginde (otomatik ya da manuel durdurulmus) zamanlayicidan hesapladigi
-- toplam saniyeyi buraya yazar. Zamanlayici hic baslatilmadiysa (ör. hic set
-- isaretlenmeden gun tamamlandiysa) null kalir.
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS duration_sec integer;
