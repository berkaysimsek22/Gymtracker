-- Her set tamamlandiktan sonra secilen RIR (Reps in Reserve) degerini
-- workout_sets tablosunda ayni satirda tutmak icin. 0 = failure, 1/2 = normal,
-- 3 = "3+ (Rahat)" anlaminda kullaniliyor (uygulama tarafinda 3 ve ustu tek
-- secenek olarak sunuluyor). Zorunlu degil, bu yuzden nullable.
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS rir integer;
