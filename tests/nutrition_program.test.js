// Birim testi: computeNutritionProgram - Profil sekmesindeki "Beslenme
// Programı" sihirbazının (MacroFactor tarzı) hesaplama mantığı.
//
// Çalıştırmak için: node tests/nutrition_program.test.js

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
function extractConst(name) {
  const marker = 'const ' + name + ' = ';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('const not found: ' + name);
  const i = idx + marker.length;
  const open = src[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : (() => { throw new Error('unexpected opener for ' + name); })();
  const end = scanBalanced(src, i, open, close);
  return src.slice(idx, end);
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
  extractFunction('localDateStr'),
  extractConst('NUTRITION_GOAL_RATES'),
  extractConst('NUTRITION_DIET_TYPES'),
  extractConst('NUTRITION_CALORIE_FLOORS'),
  extractConst('NUTRITION_TRAINING_TYPES'),
  extractConst('NUTRITION_PROTEIN_PREFS'),
  extractFunction('computeNutritionProgram'),
].join('\n');

const sandbox = {};
new Function('exports', parts + '\nexports.computeNutritionProgram = computeNutritionProgram;' +
  'exports.NUTRITION_GOAL_RATES=NUTRITION_GOAL_RATES;exports.NUTRITION_DIET_TYPES=NUTRITION_DIET_TYPES;' +
  'exports.NUTRITION_TRAINING_TYPES=NUTRITION_TRAINING_TYPES;exports.NUTRITION_PROTEIN_PREFS=NUTRITION_PROTEIN_PREFS;')(sandbox);
const { computeNutritionProgram, NUTRITION_DIET_TYPES, NUTRITION_TRAINING_TYPES, NUTRITION_PROTEIN_PREFS } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

// Kadın, 30 yaş, 165cm, 70kg - BMR (Mifflin-St Jeor) = 10*70+6.25*165-5*30-161 = 1420.25
const baseProfile = { gender: 'female', age: 30, height: 165, weight: 70 };

console.log('== computeNutritionProgram ==');

test('eksik profil bilgisiyle null döner (hata fırlatmaz)', () => {
  assert.strictEqual(computeNutritionProgram({ gender: 'female' }, {}), null);
  assert.strictEqual(computeNutritionProgram(null, {}), null);
});

test('BMR ve TDEE doğru hesaplanıyor (lifting, PAL 1.55)', () => {
  const r = computeNutritionProgram(baseProfile, { targetWeight: 70, trainingTypeId: 'lifting' });
  assert.strictEqual(r.bmr, 1420); // Math.round(1420.25)
  assert.strictEqual(r.tdee, Math.round(1420.25 * 1.55));
});

test('kilo kaybı (cut): yön doğru tespit edilir, kalori TDEE\'nin altında', () => {
  const r = computeNutritionProgram(baseProfile, { targetWeight: 60, goalRateId: 'standard', trainingTypeId: 'lifting' });
  assert.strictEqual(r.direction, 'cut');
  assert.ok(r.kcal < r.tdee);
});

test('kilo kazanımı (bulk): yön doğru tespit edilir, kalori TDEE\'nin üstünde', () => {
  const r = computeNutritionProgram(baseProfile, { targetWeight: 80, goalRateId: 'standard', trainingTypeId: 'lifting' });
  assert.strictEqual(r.direction, 'bulk');
  assert.ok(r.kcal > r.tdee);
});

test('koruma (maintain): hedef kiloya çok yakınsa kalori TDEE\'ye eşit, bitiş tarihi yok', () => {
  const r = computeNutritionProgram(baseProfile, { targetWeight: 70.05, goalRateId: 'standard', trainingTypeId: 'lifting' });
  assert.strictEqual(r.direction, 'maintain');
  assert.strictEqual(r.kcal, r.tdee);
  assert.strictEqual(r.estEndDate, null);
});

test('hedef hız (goal rate) arttıkça haftalık değişim ve açık büyür', () => {
  const slow = computeNutritionProgram(baseProfile, { targetWeight: 60, goalRateId: 'slow', trainingTypeId: 'lifting' });
  const standard = computeNutritionProgram(baseProfile, { targetWeight: 60, goalRateId: 'standard', trainingTypeId: 'lifting' });
  const fast = computeNutritionProgram(baseProfile, { targetWeight: 60, goalRateId: 'fast', trainingTypeId: 'lifting' });
  assert.ok(slow.weeklyChangeKg < standard.weeklyChangeKg);
  assert.ok(standard.weeklyChangeKg < fast.weeklyChangeKg);
  assert.ok(slow.kcal > standard.kcal); // yavaş kayıp -> daha az açık -> daha yüksek kalori
  assert.ok(standard.kcal > fast.kcal);
  // Hızlı daha kısa sürede bitirir.
  assert.ok(fast.totalWeeks < standard.totalWeeks);
});

test('her antrenman tipi kendi PAL değerini kullanır, kalori PAL ile birlikte artar', () => {
  let prevKcal = -Infinity;
  ['none', 'cardio', 'lifting', 'both'].forEach(id => {
    const r = computeNutritionProgram(baseProfile, { targetWeight: 70, trainingTypeId: id });
    assert.strictEqual(r.tdee, Math.round(1420.25 * NUTRITION_TRAINING_TYPES[id].pal));
    assert.ok(r.kcal >= prevKcal);
    prevKcal = r.kcal;
  });
});

test('her protein tercihi doğru g/kg uyguluyor', () => {
  Object.values(NUTRITION_PROTEIN_PREFS).forEach(pp => {
    const r = computeNutritionProgram(baseProfile, { targetWeight: 70, proteinPrefId: pp.id });
    assert.strictEqual(r.protein, Math.round(baseProfile.weight * pp.gPerKg));
  });
});

test('BUG OLMASIN: her diyet tipinde protein+yağ+karbonhidrat kalorisi, hedef kaloriyi (yuvarlama payı hariç) aşmaz/tam karşılar', () => {
  Object.values(NUTRITION_DIET_TYPES).forEach(d => {
    const r = computeNutritionProgram(baseProfile, { targetWeight: 60, goalRateId: 'standard', dietTypeId: d.id, trainingTypeId: 'lifting', proteinPrefId: 'moderate' });
    const totalKcal = r.protein * 4 + r.fat * 9 + r.carb * 4;
    assert.ok(Math.abs(totalKcal - r.kcal) <= 10, d.id + ' icin toplam makro kalorisi hedeften cok sapiyor: ' + totalKcal + ' vs ' + r.kcal);
  });
});

test('diyet tipleri arasında yağ/karbonhidrat oranı beklenen yönde değişir (keto en yüksek yağ, en düşük karb)', () => {
  const balanced = computeNutritionProgram(baseProfile, { targetWeight: 60, dietTypeId: 'balanced', trainingTypeId: 'lifting' });
  const keto = computeNutritionProgram(baseProfile, { targetWeight: 60, dietTypeId: 'keto', trainingTypeId: 'lifting' });
  assert.ok(keto.fat > balanced.fat);
  assert.ok(keto.carb < balanced.carb);
});

console.log('== Kalori tabanı (floor) senaryosu - 0 karbonhidrat bug\'ı ==');
test('BUG DÜZELTMESİ: küçük/sedanter bir profilde (155cm/57yaş/72kg->60kg) taban devreye girer, karbonhidrat 0 olmaz', () => {
  const smallProfile = { gender: 'female', age: 57, height: 155, weight: 72 };
  const r = computeNutritionProgram(smallProfile, {
    targetWeight: 60, goalRateId: 'standard', dietTypeId: 'balanced',
    calorieFloorId: 'standard', trainingTypeId: 'none', proteinPrefId: 'moderate',
  });
  assert.strictEqual(r.floorApplied, true);
  assert.strictEqual(r.kcal, 1200); // kadın standart taban
  assert.ok(r.carb > 0, 'karbonhidrat hâlâ 0 çıkıyor');
});

test('düşük (low) taban seçilirse minimum daha aşağı iner', () => {
  const smallProfile = { gender: 'female', age: 57, height: 155, weight: 72 };
  const r = computeNutritionProgram(smallProfile, {
    targetWeight: 60, goalRateId: 'fast', calorieFloorId: 'low', trainingTypeId: 'none',
  });
  assert.ok(r.kcal >= 1000); // kadın "low floor"
});

test('tahmini bitiş tarihi gelecekte bir tarih döner ve hafta sayısıyla tutarlıdır', () => {
  const r = computeNutritionProgram(baseProfile, { targetWeight: 60, goalRateId: 'standard', trainingTypeId: 'lifting' });
  assert.ok(r.estEndDate !== null);
  assert.ok(new Date(r.estEndDate) > new Date());
  assert.ok(r.totalWeeks > 0);
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
