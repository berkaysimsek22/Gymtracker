#!/usr/bin/env node
// ExerciseDB (RapidAPI) -> Supabase 'exercises' tablosu tek seferlik/ara sira
// calistirilan import script'i. Veri Supabase'e yazildiktan sonra uygulama
// ExerciseDB API'sine HIC gitmiyor, sadece Supabase'den okuyor.
//
// Bagimlilik yok (sadece Node.js >= 18 - global fetch icin), npm install gerekmez.
//
// Kullanim:
//   RAPIDAPI_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-exercisedb.mjs
//
// (SUPABASE_URL vermene gerek yok, asagida uygulamanin kullandigi proje URL'i
// sabit yazili - istersen SUPABASE_URL env degiskeniyle ezebilirsin.)
//
// ONEMLI: Buradaki iki anahtari ASLA gym_tracker.html gibi tarayicida calisan
// kodun icine koyma. RAPIDAPI_KEY 10 istek/gun limitli, SUPABASE_SERVICE_ROLE_KEY
// ise RLS'i tamamen atlayip veritabanina tam erisim veriyor - ikisi de sadece
// bu script'i calistirdigin terminalde, ortam degiskeni olarak kalmali.
//
// 10 istek/gun limiti nedeniyle script ilerlemeyi .exercisedb-progress.json
// dosyasina kaydediyor - gun icinde limit dolarsa ertesi gun ayni komutla
// calistirinca kaldigi yerden devam eder, bastan baslamaz.

import fs from 'node:fs';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iuanbkucwzvldrcksuek.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!RAPIDAPI_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Eksik ortam degiskeni. Gerekli: RAPIDAPI_KEY, SUPABASE_SERVICE_ROLE_KEY');
  console.error('Ornek: RAPIDAPI_KEY=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/import-exercisedb.mjs');
  process.exit(1);
}

const PROGRESS_FILE = new URL('.exercisedb-progress.json', import.meta.url);
const PAGE_SIZE = 100; // tek istekte kac egzersiz cekilecek
const MAX_REQUESTS_PER_RUN = 9; // 10/gun limitinin altinda guvenli pay birak

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { offset: 0, done: false }; }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

async function fetchPage(offset, limit) {
  const res = await fetch(`https://exercisedb.p.rapidapi.com/exercises?limit=${limit}&offset=${offset}`, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ExerciseDB istegi basarisiz: ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

async function upsertBatch(exercises) {
  const rows = exercises.map(e => ({
    id: e.id,
    name: e.name,
    gif_url: e.gifUrl,
    body_part: e.bodyPart,
    target: e.target,
    equipment: e.equipment,
    secondary_muscles: e.secondaryMuscles || [],
    instructions: e.instructions || [],
    updated_at: new Date().toISOString(),
  }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/exercises`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase yazma hatasi: ${res.status} ${res.statusText} ${body}`);
  }
}

async function main() {
  const progress = loadProgress();
  if (progress.done) {
    console.log('Zaten tamamlanmis (.exercisedb-progress.json icinde "done":true). Yeniden cekmek icin dosyayi sil.');
    return;
  }
  let requestsUsed = 0;
  let offset = progress.offset;
  while (requestsUsed < MAX_REQUESTS_PER_RUN) {
    console.log(`Cekiliyor: offset=${offset}, limit=${PAGE_SIZE} (istek ${requestsUsed + 1}/${MAX_REQUESTS_PER_RUN})`);
    const page = await fetchPage(offset, PAGE_SIZE);
    requestsUsed++;
    if (!page || page.length === 0) {
      console.log('Tum egzersizler cekildi.');
      saveProgress({ offset, done: true });
      return;
    }
    await upsertBatch(page);
    console.log(`  -> ${page.length} egzersiz Supabase'e yazildi (toplam: ${offset + page.length})`);
    offset += page.length;
    saveProgress({ offset, done: false });
    if (page.length < PAGE_SIZE) {
      console.log('Son sayfaya ulasildi, tum egzersizler cekildi.');
      saveProgress({ offset, done: true });
      return;
    }
  }
  console.log(`\nGunluk istek payi (${MAX_REQUESTS_PER_RUN}) doldu. Ilerleme kaydedildi (offset=${offset}).`);
  console.log('Yarin ayni komutu tekrar calistir, kaldigi yerden devam edecek.');
}

main().catch(err => {
  console.error('Hata:', err.message);
  process.exit(1);
});
