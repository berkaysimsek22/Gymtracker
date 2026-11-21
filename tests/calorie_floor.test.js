// Birim testi: computeGoalCalorieTarget - kilo verirken bakım kalorisi
// zaten düşük olan bir profilde (kısa boy/ileri yaş/sedanter aktivite)
// sabit 550 kcal açık, hedefi sağlıksız derecede düşük bir seviyeye
// indirip protein+yağ hedeflerinin toplam kaloriyi aşmasına (ve
// karbonhidratın her zaman 0'a düşmesine) neden oluyordu. Artık kilo
// verirken bir taban (kadın 1200, erkek 1500 kcal) uygulanıyor.
//
// Çalıştırmak için: node tests/calorie_floor.test.js

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
  extractFunction('estimateMaintenanceKcal'),
  extractFunction('computeGoalCalorieTarget'),
].join('\n');

const sandbox = {};
new Function('exports', parts + '\nexports.computeGoalCalorieTarget = computeGoalCalorieTarget;')(sandbox);
const { computeGoalCalorieTarget } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

// Bu sohbetteki gerçek bug senaryosu: 155cm, 57 yaş, 72kg -> 60kg hedef, sedanter, kadın.
const smallSedentaryWoman = { gender: 'female', height: 155, age: 57, weight: 72, target_weight: 60, activity: 'sedentary' };

console.log('== computeGoalCalorieTarget - sağlıklı kalori tabanı ==');

test('BUG DÜZELTMESİ: küçük/sedanter bir profilde hedef artık 941 değil, 1200 (kadın tabanı) kcal', () => {
  const r = computeGoalCalorieTarget(smallSedentaryWoman);
  // Taban olmasaydı: maint(1491) - 550 = 941.
  assert.strictEqual(r, 1200);
});

test('erkek için taban 1500 kcal', () => {
  const smallSedentaryMan = { ...smallSedentaryWoman, gender: 'male' };
  const r = computeGoalCalorieTarget(smallSedentaryMan);
  assert.ok(r >= 1500, 'erkek tabanının altına inmemeli, aldı: ' + r);
});

test('taşan protein+yağ olmadan 1200 kcal ile artık pozitif karbonhidrat kalıyor (96g protein + 72g yağ ile)', () => {
  const kcal = computeGoalCalorieTarget(smallSedentaryWoman);
  const protein = 96, fat = 72;
  const carb = Math.round(Math.max(0, (kcal - protein * 4 - fat * 9) / 4));
  assert.ok(carb > 0, 'karbonhidrat hâlâ 0 çıkıyor: ' + carb);
  assert.strictEqual(carb, 42);
});

test('normal bir kilo verme senaryosunda (bakım zaten yüksek) taban davranışı DEĞİŞTİRMEZ', () => {
  // Bakımı yüksek biri (ör. uzun boylu, genç, aktif erkek) için maint-550
  // zaten tabanın üstünde kalır - regresyon olmamalı.
  const tallActiveMan = { gender: 'male', height: 185, age: 25, weight: 95, target_weight: 85, activity: 'active' };
  const bmr = 10 * 95 + 6.25 * 185 - 5 * 25 + 5;
  const maint = Math.round(bmr * 1.725);
  const r = computeGoalCalorieTarget(tallActiveMan);
  assert.strictEqual(r, maint - 550);
  assert.ok(r > 1500, 'bu senaryoda taban hiç devreye girmemeli');
});

test('kilo ALMA hedefinde taban uygulanmaz (sadece kilo verirken anlamlı)', () => {
  const bulkProfile = { gender: 'female', height: 155, age: 57, weight: 50, target_weight: 60, activity: 'sedentary' };
  const bmr = 10 * 50 + 6.25 * 155 - 5 * 57 - 161;
  const maint = Math.round(bmr * 1.2);
  const r = computeGoalCalorieTarget(bulkProfile);
  assert.strictEqual(r, maint + 550);
});

test('hedef kilo mevcut kiloya çok yakınsa (fark < 0.5kg) doğrudan bakım kalorisi döner, taban devreye girmez', () => {
  const r = computeGoalCalorieTarget({ ...smallSedentaryWoman, target_weight: 72.2 });
  assert.strictEqual(r, 1491);
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
