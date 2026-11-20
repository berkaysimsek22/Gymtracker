// Birim testi: avgMacrosAllTime - Ana Sayfa'daki "Ort. Protein/Karb/Yağ"
// hesaplaması. Eskiden kcal ve protein AYRI fonksiyonlarda, FARKLI bir "gün
// sayıldı mı" eşiğiyle hesaplanıyordu (biri dayKcal>0, diğeri dayProtein>0) -
// bir günde proteinsiz (ör. sadece meyve) bir şey yenmişse o gün kcal
// ortalamasına giriyor ama protein ortalamasından hep düşüyordu; son 7 günde
// böyle tek bir kayıt varsa "Ort. Protein" hep "—" gösteriyordu (kullanıcının
// bildirdiği bug). Artık tek eşik (dayKcal>0) kullanılıyor.
//
// sb.from() gerçek Supabase çağrısı yaptığı için burada basit bir stub ile
// taklit ediliyor (ağ/DB gerekmez).
//
// Çalıştırmak için: node tests/avg_macros.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FILE = path.join(__dirname, '..', 'gym_tracker.html');
const src = fs.readFileSync(FILE, 'utf-8');

function scanBalanced(s, i, open, close) {
  let depth = 0, inStr = false, strCh = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === strCh) inStr = false; continue; }
    if (c === '/' && s[i + 1] === '/') { let nl = s.indexOf('\n', i); i = (nl === -1 ? s.length : nl); continue; }
    if (c === '/' && s[i + 1] === '*') { let end = s.indexOf('*/', i + 2); i = (end === -1 ? s.length : end + 1); continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = true; strCh = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('dengelenmemiş blok (open=' + open + ')');
}
function extractFunction(name) {
  // "async function X(" de arıyoruz - önce bulunamazsa düz "function X(".
  // async'i KAÇIRMAK (idx 'function' kelimesinden başlardı) içeride 'await'
  // olan bir fonksiyonu async OLMAYAN bir bildirime çevirip
  // "await is only valid in async functions" hatası veriyordu.
  let marker = 'async function ' + name + '(';
  let idx = src.indexOf(marker);
  if (idx === -1) { marker = 'function ' + name + '('; idx = src.indexOf(marker); }
  if (idx === -1) throw new Error('function not found: ' + name);
  const parenEnd = scanBalanced(src, idx + marker.length - 1, '(', ')');
  let i = parenEnd;
  while (src[i] !== '{') i++;
  const bodyEnd = scanBalanced(src, i, '{', '}');
  return src.slice(idx, bodyEnd);
}
const parts = [
  extractFunction('localDateStr'),
  extractFunction('avgMacrosAllTime'),
].join('\n');

function makeSandbox(rows) {
  // Gerçek Supabase query builder'ı gibi "thenable" - zincirin HANGİ
  // metotla bitirildiğine bakılmaksızın (select/eq/gte/lte...) await
  // edildiğinde {data, error} ile çözülür.
  const sb = {
    from(table) {
      const qb = {
        select() { return qb; },
        eq() { return qb; },
        gte() { return qb; },
        lte() { return qb; },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
      return qb;
    },
  };
  const sandbox = { sb, console };
  new Function('exports', 'sb', parts + '\nexports.avgMacrosAllTime = avgMacrosAllTime;')(sandbox, sb);
  return sandbox;
}

function mealRow(items) {
  // items: [{kcal, protein, carb, fat}]
  return { data: { meals: [{ foods: items }] } };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

(async () => {
  console.log('== avgMacrosAllTime ==');

  await test('3 günün gerçek verisinin ortalaması doğru hesaplanır (tarih aralığı sınırı yok, tüm kayıtlı günler taranır)', async () => {
    const rows = [
      mealRow([{ kcal: 2000, protein: 150, carb: 200, fat: 60 }]),
      mealRow([{ kcal: 1800, protein: 140, carb: 180, fat: 55 }]),
      mealRow([{ kcal: 2200, protein: 160, carb: 220, fat: 65 }]),
    ];
    const { avgMacrosAllTime } = makeSandbox(rows);
    const r = await avgMacrosAllTime('u1');
    assert.strictEqual(r.kcal, 2000);
    assert.strictEqual(r.protein, 150);
    assert.strictEqual(r.carb, 200);
    assert.strictEqual(r.fat, 60);
  });

  await test('BUG DÜZELTMESİ: kcal\'li ama proteinsiz bir gün (ör. sadece meyve) protein ortalamasını "—" yapmaz, 0 olarak sayılır', async () => {
    const rows = [
      mealRow([{ kcal: 2000, protein: 150, carb: 200, fat: 60 }]),
      mealRow([{ kcal: 95, protein: 0, carb: 25, fat: 0 }]), // ör. sadece bir elma
    ];
    const { avgMacrosAllTime } = makeSandbox(rows);
    const r = await avgMacrosAllTime('u1');
    assert.notStrictEqual(r.protein, null, 'protein "—" (null) olmamalı');
    assert.strictEqual(r.protein, 75); // (150+0)/2
    assert.strictEqual(r.kcal, Math.round((2000 + 95) / 2));
  });

  await test('hiç gün yoksa (gerçekten boşsa) hepsi null döner', async () => {
    const { avgMacrosAllTime } = makeSandbox([]);
    const r = await avgMacrosAllTime('u1');
    assert.deepStrictEqual(r, { kcal: null, protein: null, carb: null, fat: null });
  });

  await test('kcal=0 olan (tamamen boş) bir satır gün sayılmaz', async () => {
    const rows = [
      mealRow([{ kcal: 2000, protein: 150, carb: 200, fat: 60 }]),
      { data: { meals: [] } }, // kayıt var ama hiç yemek yok
    ];
    const { avgMacrosAllTime } = makeSandbox(rows);
    const r = await avgMacrosAllTime('u1');
    assert.strictEqual(r.kcal, 2000);
  });

  console.log(`\n${passed} geçti, ${failed} başarısız.`);
  if (failed > 0) process.exit(1);
})();
