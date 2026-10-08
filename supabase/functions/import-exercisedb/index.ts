// ExerciseDB (RapidAPI) -> Supabase 'exercises' tablosu.
//
// Supabase Dashboard'dan (Edge Functions > New Function) deploy edilir,
// lokalde hicbir sey calistirmana gerek yok.
//
// Gerekli TEK secret: RAPIDAPI_KEY
//   Dashboard > Edge Functions > Secrets'tan ekle.
//   (SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY her Edge Function'a Supabase
//   tarafindan otomatik saglanir, ayrica eklemene gerek yok.)
//
// Calistirmadan once Supabase SQL Editor'de scripts/exercises-table.sql'i
// calistirmis olman gerekiyor ('exercises' ve 'exercise_import_progress'
// tablolari orada tanimli).
//
// Cagirma: fonksiyonun URL'ine (Dashboard'daki "Invoke"/test paneli ya da
// tarayicidan) herhangi bir istek atman yeterli. 10 istek/gun RapidAPI
// limiti nedeniyle her cagri en fazla 9 RapidAPI istegi yapar, ilerlemeyi
// 'exercise_import_progress' tablosuna kaydeder - limit dolarsa ertesi gun
// ayni URL'i tekrar cagirinca kaldigi yerden devam eder (bastan baslamaz).
// Istersen Dashboard'da bu fonksiyona gunluk bir Cron Trigger da ekleyip
// bunu otomatiklestirebilirsin - tamamlandiginda ("done") sonraki cagrilar
// zararsiz bir no-op olur.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PAGE_SIZE = 100;
const MAX_REQUESTS_PER_RUN = 9; // 10/gun limitinin altinda guvenli pay birak

Deno.serve(async (_req: Request) => {
  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!RAPIDAPI_KEY) {
    return new Response(
      JSON.stringify({
        error: "RAPIDAPI_KEY secret eksik. Dashboard > Edge Functions > Secrets'tan ekle.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let { data: progress } = await sb
    .from("exercise_import_progress")
    .select("offset_val, done")
    .eq("id", 1)
    .maybeSingle();

  if (!progress) {
    await sb.from("exercise_import_progress").insert({ id: 1, offset_val: 0, done: false });
    progress = { offset_val: 0, done: false };
  }

  if (progress.done) {
    return new Response(
      JSON.stringify({
        message:
          "Zaten tamamlanmis. Yeniden cekmek icin exercise_import_progress tablosunda offset_val=0, done=false yap.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  let offset = progress.offset_val;
  let requestsUsed = 0;
  const log: string[] = [];

  while (requestsUsed < MAX_REQUESTS_PER_RUN) {
    log.push(`Cekiliyor: offset=${offset}, limit=${PAGE_SIZE} (istek ${requestsUsed + 1}/${MAX_REQUESTS_PER_RUN})`);

    const res = await fetch(
      `https://exercisedb.p.rapidapi.com/exercises?limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: {
          "X-RapidAPI-Key": RAPIDAPI_KEY,
          "X-RapidAPI-Host": "exercisedb.p.rapidapi.com",
        },
      },
    );
    requestsUsed++;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `ExerciseDB istegi basarisiz: ${res.status} ${res.statusText}`, body, log }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const page = await res.json();

    if (!page || page.length === 0) {
      await sb.from("exercise_import_progress")
        .update({ offset_val: offset, done: true, updated_at: new Date().toISOString() })
        .eq("id", 1);
      log.push("Tum egzersizler cekildi.");
      return new Response(JSON.stringify({ message: "Tamamlandi", offset, log }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // deno-lint-ignore no-explicit-any
    const rows = page.map((e: any) => ({
      id: e.id,
      name: e.name,
      gif_url: e.gifUrl,
      body_part: e.bodyPart,
      target: e.target,
      equipment: e.equipment,
      secondary_muscles: e.secondaryMuscles ?? [],
      instructions: e.instructions ?? [],
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await sb.from("exercises").upsert(rows, { onConflict: "id" });
    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: `Supabase yazma hatasi: ${upsertErr.message}`, log }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    offset += page.length;
    log.push(`  -> ${page.length} egzersiz yazildi (toplam: ${offset})`);
    await sb.from("exercise_import_progress")
      .update({ offset_val: offset, done: false, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (page.length < PAGE_SIZE) {
      await sb.from("exercise_import_progress").update({ done: true }).eq("id", 1);
      log.push("Son sayfaya ulasildi, tum egzersizler cekildi.");
      return new Response(JSON.stringify({ message: "Tamamlandi", offset, log }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  log.push(`Gunluk istek payi (${MAX_REQUESTS_PER_RUN}) doldu. offset=${offset} kaydedildi. Yarin ayni URL'i tekrar cagir.`);
  return new Response(JSON.stringify({ message: "Gunluk limit - yarin devam et", offset, log }), {
    headers: { "Content-Type": "application/json" },
  });
});
