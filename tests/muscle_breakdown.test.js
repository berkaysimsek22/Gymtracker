// Birim testi: "Çalışan Kaslar" (computeDayMuscleBreakdown) - EXERCISE_DB'de
// eşi bulunamayan ve Türkçe etiket kullanan hareketlerin (ör. "Incline
// Barbell Bench Press" / "Göğüs (Üst)") artık doğru kas grubuna (chest)
// düştüğünü doğrular. Eski kod sadece İngilizce 'chest'/'pectoral' anahtar
// kelimesi arıyordu, Türkçe "Göğüs" hiç eşleşmiyordu - ekranda sadece
// Cable Fly'ın 3 seti görünüyor, bench press'in 4 working seti hiç
// sayılmıyordu (kullanıcının bildirdiği bug).
//
// Çalıştırmak için: node tests/muscle_breakdown.test.js

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
  const marker = 'function ' + name + '(';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('function not found: ' + name);
  const parenEnd = scanBalanced(src, idx + marker.length - 1, '(', ')');
  let i = parenEnd;
  while (src[i] !== '{') i++;
  const bodyEnd = scanBalanced(src, i, '{', '}');
  return src.slice(idx, bodyEnd);
}

const parts = [
  extractConst('EXERCISE_DB'),
  extractConst('ANALYSIS_MUSCLE_GROUPS'),
  extractConst('EXDB_TAG_TO_GROUP'),
  extractConst('GROUP_TO_EXDB_TAG'),
  extractFunction('classifyExerciseMuscles'),
  extractFunction('computeDayMuscleBreakdown'),
  extractFunction('computeWeekMuscleBreakdown'),
  extractFunction('_woEx'),
  extractFunction('_woExDetailed'),
  extractFunction('_woWarm'),
  extractConst('POPULAR_SPLITS'),
].join('\n');

const sandbox = {};
new Function('exports', parts + '\n' + `
  exports.computeDayMuscleBreakdown = computeDayMuscleBreakdown;
  exports.computeWeekMuscleBreakdown = computeWeekMuscleBreakdown;
  exports.POPULAR_SPLITS = POPULAR_SPLITS;
`)(sandbox);

const { computeDayMuscleBreakdown, computeWeekMuscleBreakdown, POPULAR_SPLITS } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

const ul = POPULAR_SPLITS.find(s => s.id === 'upper_lower');
const upperA = ul.schedule.find(d => d.name === 'Upper A');

console.log('== computeDayMuscleBreakdown Türkçe etiket düzeltmesi ==');

test('Göğüs (chest): Incline Barbell Bench Press (5 set) + Cable Fly (3 set) = 8, sadece Cable Fly\'ın 3 seti değil', () => {
  const { muscleSets, muscleExercises } = computeDayMuscleBreakdown(upperA);
  assert.strictEqual(muscleSets.chest, 8, 'chest toplam set sayısı yanlış - bench press hâlâ sayılmıyor olabilir');
  const chestExNames = [...(muscleExercises.chest || new Map()).keys()];
  assert.ok(chestExNames.includes('Incline Barbell Bench Press'), 'Incline Barbell Bench Press chest listesinde değil');
  assert.ok(chestExNames.includes('Cable Fly'), 'Cable Fly chest listesinde değil');
  assert.strictEqual(muscleExercises.chest.get('Incline Barbell Bench Press'), 5);
  assert.strictEqual(muscleExercises.chest.get('Cable Fly'), 3);
});

test('Sırt (lat+mid_back): Pull-Up/Lat Pulldown + Chest Supported Row + Face Pull doğru sayılıyor', () => {
  const { muscleSets } = computeDayMuscleBreakdown(upperA);
  assert.strictEqual(muscleSets.lat, 4); // Pull-Up / Lat Pulldown: 1 ısınma + 3 working
  // Chest Supported Row (3) + Face Pull (2) - Face Pull'un EXERCISE_DB kaydı
  // (muscles:['rear_delt','mid_back']) zaten trapezius'u da ikincil olarak
  // etiketliyor, bu satır benim düzeltmemden bağımsız, EXERCISE_DB'nin
  // kendi tanımı.
  assert.strictEqual(muscleSets.mid_back, 5);
});

test('Omuz (Arka) / rear_delt: Face Pull doğru sayılıyor (Türkçe "Omuz (Arka)" etiketi)', () => {
  const { muscleSets } = computeDayMuscleBreakdown(upperA);
  assert.ok(muscleSets.rear_delt >= 2);
});

test('Haftalık (computeWeekMuscleBreakdown) de aynı düzeltmeyi kullanıyor - chest haftalık toplamda da doğru', () => {
  const { muscleSets } = computeWeekMuscleBreakdown(ul.schedule);
  // Upper A (8) + Upper B: Incline DB Press (4, exact EXERCISE_DB eşleşmesi) = 12
  assert.strictEqual(muscleSets.chest, 12);
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
