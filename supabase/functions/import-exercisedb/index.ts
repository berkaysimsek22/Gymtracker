// ExerciseDB (RapidAPI) -> Supabase 'exercises' tablosu.
//
// Supabase Dashboard'dan (Edge Functions > New Function) deploy edilir,
// lokalde hicbir sey calistirmana gerek yok.
//
// NOT: RapidAPI'nin ucretsiz ExerciseDB plani TUM kataloga (~1300 hareket)
// erisim vermiyor - "tumunu cek" denemesinde API sadece 10 ornek kayit
// dondurup "bu kadar" dedi. Bu yuzden fonksiyon artik TUM kataloğu cekmeye
// calismiyor; sadece asagidaki TARGET_NAMES listesindeki (Ece'nin programi +
// Berkay's Split - toplam 32 benzersiz hareket) isimleri tek tek arayip
// Supabase'e yaziyor. Yeni bir split/kullanici icin yeni hareketler
// gerekirse bu listeye eklenip fonksiyon tekrar deploy edilebilir.
//
// Gerekli TEK secret: RAPIDAPI_KEY
//   Dashboard > Edge Functions > Secrets'tan ekle (isim TAM OLARAK boyle,
//   bosluksuz - "RAPID API" gibi bosluklu bir isim calismaz).
//   (SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY her Edge Function'a Supabase
//   tarafindan otomatik saglanir, ayrica eklemene gerek yok.)
//
// Calistirmadan once Supabase SQL Editor'de scripts/exercises-table.sql'i
// calistirmis olman gerekiyor ('exercises' ve 'exercise_import_progress'
// tablolari orada tanimli).
//
// Cagirma: fonksiyonun URL'ine (Dashboard'daki "Test"/"Invoke" paneli ya da
// tarayicidan) herhangi bir istek atman yeterli. 10 istek/gun RapidAPI
// limiti nedeniyle her cagri en fazla 9 isim arar, ilerlemeyi
// 'exercise_import_progress' tablosuna (hangi isme kadar geldigi) kaydeder -
// limit dolarsa ertesi gun ayni URL'i tekrar cagirinca kaldigi yerden devam
// eder. 32 hareket icin toplam ~4 gun/cagri yeterli.

import { createClient } from "jsr:@supabase/supabase-js@2";

// Ece'nin programi (Hip/Hinge/Squat Dominant) + Berkay's Split (GÜN A/B),
// tekrarlar cikarilmis, Turkce ek aciklamalar ("(yuksek ayak)" gibi)
// ExerciseDB'de aranamayacagi icin temel isme indirgenmis.
const TARGET_NAMES: string[] = [
  // Ece
  "Hip Thrust",
  "Hip Abduction",
  "Leg Press",
  "Lat Pulldown",
  "Seated Row",
  "Lateral Raise",
  "Barbell Curl",
  "Triceps Push Down",
  "Chest Press",
  "Romanian Deadlift",
  "Machine Kick Back",
  "Roman Chair Back Extension",
  "Seated Leg Curl",
  "Face Pull",
  "Bulgarian Split Squat",
  "Sumo Squat",
  "Walking Lunge",
  "Shoulder Press",
  "Overhead Triceps",
  // Berkay's Split (Ece'yle ortak olanlar haric)
  "Incline Barbell Press",
  "Weighted Pull Up",
  "Seated DB Shoulder Press",
  "Overhead Cable Triceps",
  "Rope Pushdown",
  "Incline DB Curl",
  "Hammer Curl",
  "Barbell Wrist Twist",
  "Weighted Dip",
  "Chest Supported Row",
  "DB Lateral Raise",
  "Bayesian Cable Curl",
  "Reverse Curl",
];

const MAX_REQUESTS_PER_RUN = 9; // 10/gun limitinin altinda guvenli pay birak

Deno.serve(async (_req: Request) => {
  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!RAPIDAPI_KEY) {
    return new Response(
      JSON.stringify({
        error: "RAPIDAPI_KEY secret eksik. Dashboard > Edge Functions > Secrets'tan ekle (isim tam olarak RAPIDAPI_KEY).",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // offset_val burada "TARGET_NAMES dizisinde hangi indekse kadar geldik" anlamina geliyor
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

  let index = progress.offset_val;
  let requestsUsed = 0;
  const log: string[] = [];
  const notFound: string[] = [];

  while (requestsUsed < MAX_REQUESTS_PER_RUN && index < TARGET_NAMES.length) {
    const name = TARGET_NAMES[index];
    log.push(`Araniyor (${index + 1}/${TARGET_NAMES.length}): "${name}"`);

    const res = await fetch(
      `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(name.toLowerCase())}`,
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
        JSON.stringify({ error: `ExerciseDB istegi basarisiz ("${name}"): ${res.status} ${res.statusText}`, body, log }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const matches = await res.json();

    if (Array.isArray(matches) && matches.length > 0) {
      // deno-lint-ignore no-explicit-any
      const rows = matches.map((e: any) => ({
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
          JSON.stringify({ error: `Supabase yazma hatasi ("${name}"): ${upsertErr.message}`, log }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      log.push(`  -> ${rows.length} eslesme yazildi`);
    } else {
      notFound.push(name);
      log.push(`  -> eslesme bulunamadi`);
    }

    index++;
    await sb.from("exercise_import_progress")
      .update({ offset_val: index, done: index >= TARGET_NAMES.length, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  if (index >= TARGET_NAMES.length) {
    log.push("Tum hedef hareketler tarandi.");
    return new Response(JSON.stringify({ message: "Tamamlandi", notFound, log }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  log.push(`Gunluk istek payi (${MAX_REQUESTS_PER_RUN}) doldu. index=${index}/${TARGET_NAMES.length} kaydedildi. Yarin ayni URL'i tekrar cagir.`);
  return new Response(JSON.stringify({ message: "Gunluk limit - yarin devam et", index, total: TARGET_NAMES.length, notFound, log }), {
    headers: { "Content-Type": "application/json" },
  });
});
