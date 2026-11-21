-- Profil sekmesindeki "Beslenme Programı" sihirbazının (MacroFactor tarzı:
-- hedef kilo + hedef hız + diyet tipi + kalori tabanı + antrenman tipi +
-- protein tercihi seçimleri ve hesaplanan kcal/protein/karb/yağ) kaydını
-- tutar. Nullable - bu script çalıştırılmadan uygulama eskisi gibi çalışır
-- (yeni özellik sadece pasif kalır, "Yeni Program Oluştur" kaydetme adımında
-- hata verir).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nutrition_program jsonb;
