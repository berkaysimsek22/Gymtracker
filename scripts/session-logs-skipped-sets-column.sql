-- "Gunu Tamamla" sirasinda agirlik/tekrar girilmeden "tamamlandi" isaretlenmis
-- (atlanan) setlerin listesini saklamak icin. Her eleman {"exercise":"...", "set":N}
-- seklinde - hangi hareketin kacinci setinin atlandigini gosterir. Hic atlanan
-- set yoksa null kalir. Istatistik ekraninda ve "Son Antrenman" kartinda
-- gosteriliyor.
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS skipped_sets jsonb;
