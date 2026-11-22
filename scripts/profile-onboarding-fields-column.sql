-- Tek ekranlık "Hoş Geldin" onboarding formunun (ilk girişte sorulan ek
-- sorular: egzersiz sıklığı, vücut yağ oranı, kilo trendi, kilo geçmişi,
-- sportif düzey) cevaplarını saklar. Nullable - bu script çalıştırılmadan
-- uygulama eskisi gibi çalışır (onboarding ekranı sadece bu alanları
-- kaydetmeden gösterir, sayfa her girişte tekrar çıkar).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exercise_frequency text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS body_fat_range text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_trend text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_history text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS athletic_level text;
