// Google Gemini API icin sunucu-taraflii proxy. Amac: GEMINI_API_KEY
// tarayiciya hic gitmesin (gym_tracker.html gibi client-side kodda
// bulunmamali) - istemci sadece bu fonksiyonu cagirir, asil anahtar
// burada (Supabase Secrets'ta) kalir.
//
// GUVENLIK: Bu fonksiyon anonim/herkese acikti - Authorization header'i
// kontrol edilmiyordu, bu da GEMINI_API_KEY'in kotasini (ve dolayisiyla
// faturasini) baskasinin tuketebilecegi anlamina geliyordu. Artik istek,
// gecerli bir Supabase JWT (giris yapmis kullanicinin access_token'i)
// icermiyorsa 401 ile reddediliyor.
//
// Gerekli secret: GEMINI_API_KEY (zaten Dashboard > Edge Functions >
// Secrets'ta tanimli).
// SUPABASE_URL ve SUPABASE_ANON_KEY her Edge Function'a otomatik saglanir.
//
// Istemci tarafi (gym_tracker.html) artik Authorization: Bearer <access_token>
// header'ini gonderiyor (oturum acmis kullanicinin kendi token'i).

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.8-flash";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(
      JSON.stringify({ error: { message: "Giris yapmis olman gerekiyor (Authorization header eksik)." } }),
      { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "GEMINI_API_KEY secret eksik." } }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Gelen JWT'yi Supabase'e dogrulat - gecersiz/suresi dolmus token da burada reddedilir.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(
      JSON.stringify({ error: { message: "Gecersiz ya da suresi dolmus oturum." } }),
      { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "Istek govdesi gecerli JSON degil." } }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const geminiBody = await geminiRes.text();
  return new Response(geminiBody, {
    status: geminiRes.status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
