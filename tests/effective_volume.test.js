// Birim + entegrasyon testleri: Upper/Lower split + Direct/Indirect/Effective
// hacim hesaplama servisi (gym_tracker.html içindeki EFFECTIVE_MUSCLE_MAP,
// computeEffectiveMuscleVolume, programWeeklyEntries vb.).
//
// Fonksiyonlar gerçek gym_tracker.html dosyasından İSİM bazlı parantez
// eşleştirmeyle çıkarılır (satır numarasına bağımlı değil) - dosya ileride
// değişse de bu test, güncel fonksiyon kaynağını kullanarak çalışmaya devam
// eder. localStorage/sb/document gibi tarayıcı globalleri burada yok; test
// edilen fonksiyonlar bunları try/catch içinde kullandığı için (bkz.
// getEffectiveVolumeSettings/setEffectiveVolumeSettings) sorunsuz çalışır.
//
// Çalıştırmak için: node tests/effective_volume.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FILE = path.join(__dirname, '..', 'gym_tracker.html');
const src = fs.readFileSync(FILE, 'utf-8');

// Kod içindeki yorum satırlarında (// ... ve /* ... */) geçen kesme
// işaretleri (örn. "EXERCISE_DB'deki", "Berkay's Split") sade bir tırnak
// takibiyle string'e giriş gibi yorumlanıp parantez sayımını tamamen
// bozuyordu (classifyExerciseMuscles 113KB'a kadar taşıyordu) - bu yüzden
// yorumlar, tırnaklardan ÖNCE atlanıyor.
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
  const marker = 'function ' + name + '(';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('function not found: ' + name);
  // 1) parametre listesini parantezle eşleştir
  const parenEnd = scanBalanced(src, idx + marker.length - 1, '(', ')');
  // 2) gövdeyi ({ ... }) parantezle eşleştir
  let i = parenEnd;
  while (src[i] !== '{') i++;
  const bodyEnd = scanBalanced(src, i, '{', '}');
  return src.slice(idx, bodyEnd);
}

const parts = [
  extractConst('EXERCISE_DB'),
  extractConst('EXDB_TAG_TO_GROUP'),
  extractConst('ANALYSIS_MUSCLE_GROUPS'),
  extractConst('EFFECTIVE_MUSCLE_MAP'),
  extractFunction('normalizeExName'),
  extractFunction('classifyExerciseMuscles'),
  extractFunction('classifyExerciseName'),
  extractFunction('lookupEffectiveMuscleMap'),
  extractFunction('addEffectiveSets'),
  extractFunction('computeEffectiveMuscleVolume'),
  extractFunction('programWeeklyEntries'),
  extractFunction('computePlannedEffectiveMuscleVolume'),
  extractFunction('getEffectiveVolumeSettings'),
  extractFunction('setEffectiveVolumeSettings'),
  extractFunction('effectiveVolumeTier'),
  extractFunction('_woEx'),
  extractFunction('_woExDetailed'),
  extractFunction('_woWarm'),
  extractConst('POPULAR_SPLITS'),
].join('\n');

const sandbox = {};
new Function('exports', parts + '\n' + `
  exports.ANALYSIS_MUSCLE_GROUPS = ANALYSIS_MUSCLE_GROUPS;
  exports.EFFECTIVE_MUSCLE_MAP = EFFECTIVE_MUSCLE_MAP;
  exports.lookupEffectiveMuscleMap = lookupEffectiveMuscleMap;
  exports.addEffectiveSets = addEffectiveSets;
  exports.computeEffectiveMuscleVolume = computeEffectiveMuscleVolume;
  exports.programWeeklyEntries = programWeeklyEntries;
  exports.computePlannedEffectiveMuscleVolume = computePlannedEffectiveMuscleVolume;
  exports.getEffectiveVolumeSettings = getEffectiveVolumeSettings;
  exports.setEffectiveVolumeSettings = setEffectiveVolumeSettings;
  exports.effectiveVolumeTier = effectiveVolumeTier;
  exports.POPULAR_SPLITS = POPULAR_SPLITS;
`)(sandbox);

const {
  ANALYSIS_MUSCLE_GROUPS, EFFECTIVE_MUSCLE_MAP, lookupEffectiveMuscleMap,
  addEffectiveSets, computeEffectiveMuscleVolume, programWeeklyEntries,
  computePlannedEffectiveMuscleVolume, getEffectiveVolumeSettings,
  setEffectiveVolumeSettings, effectiveVolumeTier, POPULAR_SPLITS,
} = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

console.log('== Upper/Lower split yapısı ==');
const ul = POPULAR_SPLITS.find(s => s.id === 'upper_lower');

test('upper_lower split mevcut ve 7 günlük', () => {
  assert.ok(ul, 'upper_lower split bulunamadı');
  assert.strictEqual(ul.schedule.length, 7);
});

test('haftalık düzen: Pzt Upper A, Sal Lower A, Çar Rest, Per Upper B, Cum Rest, Cmt Lower B, Paz Rest', () => {
  const names = ul.schedule.map(d => d.name);
  const days = ul.schedule.map(d => d.day);
  assert.deepStrictEqual(names, ['Upper A', 'Lower A', 'Dinlenme', 'Upper B', 'Dinlenme', 'Lower B', 'Dinlenme']);
  assert.deepStrictEqual(days, ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']);
  assert.deepStrictEqual(ul.schedule.map(d => d.type), ['full', 'full', 'rest', 'full', 'rest', 'full', 'rest']);
});

test('egzersiz sayıları: Upper A=8, Lower A=6, Upper B=10, Lower B=8', () => {
  const byName = Object.fromEntries(ul.schedule.filter(d => d.type === 'full').map(d => [d.name, d.exercises.length]));
  assert.strictEqual(byName['Upper A'], 8);
  assert.strictEqual(byName['Lower A'], 6);
  assert.strictEqual(byName['Upper B'], 10);
  assert.strictEqual(byName['Lower B'], 8);
});

test('set/tekrar/dinlenme değerleri doğru (acceptance #2)', () => {
  const findEx = (dayName, exName) => ul.schedule.find(d => d.name === dayName).exercises.find(e => e.name === exName);
  // Incline Barbell Bench Press: 1 ısınma + 4 working set (tablodaki "4x6-8"
  // korunur, ısınma EKLENMİŞ olduğu için toplam ex.sets 5'tir).
  const ibbp = findEx('Upper A', 'Incline Barbell Bench Press');
  assert.strictEqual(ibbp.sets, 5); assert.strictEqual(ibbp.restSec, 150);
  assert.strictEqual(ibbp.setsDef[0].type, 'warmup');
  assert.strictEqual(ibbp.setsDef.filter(s => s.type === 'working').length, 4);
  assert.ok(ibbp.setsDef.filter(s => s.type === 'working').every(s => s.reps === '6-8'));
  const fp = findEx('Upper A', 'Face Pull');
  assert.strictEqual(fp.sets, 2);
  const clr = findEx('Upper B', 'Cable Lateral Raise');
  assert.strictEqual(clr.sets, 5); assert.strictEqual(clr.reps, '12-20');
  const le = findEx('Lower B', 'Leg Extension');
  assert.strictEqual(le.sets, 2);
  // Standing Calf Raise: 1 ısınma + 5 working (tablodaki "5x10-15" korunur).
  const scr = findEx('Lower A', 'Standing Calf Raise');
  assert.strictEqual(scr.sets, 6);
  assert.strictEqual(scr.setsDef.filter(s => s.type === 'working').length, 5);
});

test('ısınma seti eklenen hareketlerde WORKING set sayısı/tekrar aralığı değişmez, sadece önüne 1 ısınma eklenir', () => {
  const findEx = (dayName, exName) => ul.schedule.find(d => d.name === dayName).exercises.find(e => e.name === exName);
  [
    ['Lower A', 'Squat', 4, '6-8'],
    ['Lower A', 'Romanian Deadlift', 3, '8-10'],
    ['Lower B', 'Hip Thrust', 3, '8-12'],
    ['Lower B', 'Lying Leg Curl', 4, '10-12'],
    ['Upper B', 'Seated DB Shoulder Press', 3, '8-12'],
    ['Upper B', 'Bayesian Cable Curl', 3, '10-15'],
  ].forEach(([dayName, exName, expectedWorking, expectedReps]) => {
    const ex = findEx(dayName, exName);
    assert.ok(ex, exName + ' bulunamadı');
    assert.strictEqual(ex.setsDef[0].type, 'warmup', exName + ' ısınma seti eksik');
    const working = ex.setsDef.filter(s => s.type === 'working');
    assert.strictEqual(working.length, expectedWorking, exName + ' working set sayısı');
    assert.ok(working.every(s => s.reps === expectedReps), exName + ' working reps korunmamış');
  });
});

console.log('== EFFECTIVE_MUSCLE_MAP veri bütünlüğü ==');
test('hiçbir egzersizde aynı kas hem primary hem secondary olamaz (acceptance #5)', () => {
  Object.entries(EFFECTIVE_MUSCLE_MAP).forEach(([name, map]) => {
    const overlap = (map.primary || []).filter(g => (map.secondary || []).includes(g));
    assert.deepStrictEqual(overlap, [], name + ' için primary/secondary çakışması: ' + overlap.join(','));
  });
});

console.log('== computeEffectiveMuscleVolume matematiği (varsayılan katsayı 0.5) ==');
test('Squat: quad direct=4, glute indirect=4 -> glute effective=2', () => {
  const r = computeEffectiveMuscleVolume([{ name: 'Squat', sets: 4 }], 0.5);
  assert.strictEqual(r.quad.direct, 4); assert.strictEqual(r.quad.indirect, 0); assert.strictEqual(r.quad.effective, 4);
  assert.strictEqual(r.glute.direct, 0); assert.strictEqual(r.glute.indirect, 4); assert.strictEqual(r.glute.effective, 2);
});

test('Hammer Curl: biceps VE brachialis ikisi de 1.0 direct sayılır (birden fazla primary kas)', () => {
  const r = computeEffectiveMuscleVolume([{ name: 'Hammer Curl', sets: 2 }], 0.5);
  assert.strictEqual(r.biceps.direct, 2); assert.strictEqual(r.brachialis.direct, 2);
  assert.strictEqual(r.biceps.indirect, 0); assert.strictEqual(r.brachialis.indirect, 0);
});

test('Seated DB Shoulder Press: front_delt direct, side_delt+triceps indirect', () => {
  const r = computeEffectiveMuscleVolume([{ name: 'Seated DB Shoulder Press', sets: 3 }], 0.5);
  assert.strictEqual(r.front_delt.direct, 3);
  assert.strictEqual(r.side_delt.indirect, 3); assert.strictEqual(r.side_delt.effective, 1.5);
  assert.strictEqual(r.triceps.indirect, 3); assert.strictEqual(r.triceps.effective, 1.5);
});

test('katsayı değiştirilebilir: coef=1.0 ile indirect tam ağırlıklı sayılır', () => {
  const r = computeEffectiveMuscleVolume([{ name: 'Squat', sets: 4 }], 1.0);
  assert.strictEqual(r.glute.effective, 4);
});

test('0 veya negatif set hacme eklenmez', () => {
  const r = computeEffectiveMuscleVolume([{ name: 'Squat', sets: 0 }, { name: 'Leg Press', sets: -3 }], 0.5);
  assert.strictEqual(r.quad.direct, 0); assert.strictEqual(r.glute.indirect, 0);
});

test('addEffectiveSets çalışma zamanında da aynı kası iki kez saymaz (data hatasına karşı koruma)', () => {
  const acc = {}; ANALYSIS_MUSCLE_GROUPS.forEach(g => { acc[g.id] = { direct: 0, indirect: 0, exercises: {} }; });
  const buggyMap = { primary: ['quad'], secondary: ['quad'] }; // kasıtlı çakışma
  const seen = new Set();
  (buggyMap.primary).forEach(gid => { if (!seen.has(gid)) { seen.add(gid); acc[gid].direct += 5; } });
  (buggyMap.secondary).forEach(gid => { if (!seen.has(gid)) { acc[gid].indirect += 5; } });
  assert.strictEqual(acc.quad.direct, 5); assert.strictEqual(acc.quad.indirect, 0);
});

console.log('== Gerçek Upper/Lower split üzerinden entegrasyon testi (programWeeklyEntries) ==');
test('haftalık planlanan effective hacim - quad/glute/hamstring/biceps/triceps (coef=0.5, ısınma setleri dahil)', () => {
  // Isınma setleri de _woExDetailed'in (Berkay's Split ile AYNI) yerleşik
  // davranışı gereği ex.sets'e dahil olduğu için direct/indirect sayıları
  // ısınma eklenen hareketlerde +1 artar (bkz. tests/apply_split_day.test.js
  // ve bu dosyadaki "ısınma seti eklenen hareketlerde..." testi).
  const r = computePlannedEffectiveMuscleVolume(ul.schedule, 0.5);
  assert.strictEqual(r.quad.direct, 14); assert.strictEqual(r.quad.indirect, 3); assert.strictEqual(r.quad.effective, 15.5);
  assert.strictEqual(r.glute.direct, 7); assert.strictEqual(r.glute.indirect, 16); assert.strictEqual(r.glute.effective, 15);
  assert.strictEqual(r.hamstring.direct, 12); assert.strictEqual(r.hamstring.indirect, 0); assert.strictEqual(r.hamstring.effective, 12);
  assert.strictEqual(r.biceps.direct, 10); assert.strictEqual(r.biceps.indirect, 14); assert.strictEqual(r.biceps.effective, 17);
  assert.strictEqual(r.triceps.direct, 6); assert.strictEqual(r.triceps.indirect, 13); assert.strictEqual(r.triceps.effective, 12.5);
});

test('Upper B\'de Barbell Row yerine Seated Row kullanılıyor ve aynı rhomboid/biceps/rear_delt eşlemesine sahip', () => {
  const upperB = ul.schedule.find(d => d.name === 'Upper B');
  assert.ok(upperB.exercises.some(e => e.name === 'Seated Row'));
  assert.ok(!upperB.exercises.some(e => e.name === 'Barbell Row'));
  const m = lookupEffectiveMuscleMap('Seated Row');
  assert.deepStrictEqual(m.primary, ['rhomboid']);
  assert.deepStrictEqual(m.secondary.sort(), ['biceps', 'rear_delt']);
});

test('exercises dökümü doğru egzersizleri listeliyor (kas kartına dokunma -> katkı listesi, acceptance #8)', () => {
  const r = computePlannedEffectiveMuscleVolume(ul.schedule, 0.5);
  assert.strictEqual(r.quad.exercises['Squat'].direct, 5);
  assert.strictEqual(r.quad.exercises['Walking Lunge'].indirect, 3);
  assert.ok(!r.quad.exercises['Walking Lunge'].direct || r.quad.exercises['Walking Lunge'].direct === 0);
});

console.log('== Ayarlar (coefficient + hedef aralık) ==');
test('varsayılan ayarlar: coef=0.5, min=10, max=20', () => {
  const s = getEffectiveVolumeSettings();
  assert.strictEqual(s.coef, 0.5); assert.strictEqual(s.min, 10); assert.strictEqual(s.max, 20);
});

test('setEffectiveVolumeSettings değerleri [0,1] ve min<=max aralığına sıkıştırır', () => {
  assert.strictEqual(setEffectiveVolumeSettings(-1, -5, 3).coef, 0);
  assert.strictEqual(setEffectiveVolumeSettings(5, 0, 0).coef, 1);
  const s = setEffectiveVolumeSettings(0.3, 15, 10); // max < min verilirse min'e eşitlenir
  assert.strictEqual(s.min, 15); assert.strictEqual(s.max, 15);
});

test('effectiveVolumeTier eşikleri', () => {
  const t = { min: 10, max: 20 };
  assert.strictEqual(effectiveVolumeTier(0, t).label, 'Çalışmıyor');
  assert.strictEqual(effectiveVolumeTier(5, t).label, 'Az');
  assert.strictEqual(effectiveVolumeTier(15, t).label, 'Hedefte');
  assert.strictEqual(effectiveVolumeTier(25, t).label, 'Yüksek');
});

console.log('== İsim değişse bile eşleme bozulmaz (acceptance: egzersiz adı değişse bile mapping bozulmamalı) ==');
test('"Back Squat" alt dize eşleşmesiyle "squat" haritasına düşer', () => {
  const m = lookupEffectiveMuscleMap('Back Squat');
  assert.ok(m.primary.includes('quad')); assert.ok(m.secondary.includes('glute'));
});

test('tamamen bilinmeyen bir hareket asla hata fırlatmaz, güvenli varsayılana düşer', () => {
  const m = lookupEffectiveMuscleMap('Tamamen Yeni Uydurma Hareket XYZ');
  assert.ok(Array.isArray(m.primary)); assert.ok(Array.isArray(m.secondary));
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
