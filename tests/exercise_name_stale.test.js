// Birim testi: isWorkoutSetRowStale - bir workout_sets satırının ağırlık/
// tekrar bilgisinin, BUGÜN o (day_index, exercise_index) slotunda duran
// egzersize mi yoksa program değiştiği için artık FARKLI bir egzersize mi
// ait olduğunu belirler ("son antrenman günündeki ağırlığı değil, o
// hareketin kendi son ağırlığını göster" talebi).
//
// Çalıştırmak için: node tests/exercise_name_stale.test.js

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
  const marker = 'function ' + name + '(';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('function not found: ' + name);
  const parenEnd = scanBalanced(src, idx + marker.length - 1, '(', ')');
  let i = parenEnd;
  while (src[i] !== '{') i++;
  const bodyEnd = scanBalanced(src, i, '{', '}');
  return src.slice(idx, bodyEnd);
}

const sandbox = {};
new Function('exports', extractFunction('isWorkoutSetRowStale') + '\nexports.isWorkoutSetRowStale = isWorkoutSetRowStale;')(sandbox);
const { isWorkoutSetRowStale } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

const dayExercises = [
  { name: 'Incline Barbell Bench Press' },
  { name: 'Seated Row' },
];

console.log('== isWorkoutSetRowStale ==');

test('exercise_name şimdiki egzersizle AYNIysa stale değil', () => {
  const row = { exercise_index: 0, exercise_name: 'Incline Barbell Bench Press' };
  assert.strictEqual(isWorkoutSetRowStale(row, dayExercises), false);
});

test('exercise_name FARKLIysa (ör. Barbell Row -> Seated Row takası) stale', () => {
  const row = { exercise_index: 1, exercise_name: 'Barbell Row' };
  assert.strictEqual(isWorkoutSetRowStale(row, dayExercises), true);
});

test('exercise_name NULL ise (migration öncesi eski satır) stale SAYILMAZ - geriye dönük uyumluluk', () => {
  const row = { exercise_index: 1, exercise_name: null };
  assert.strictEqual(isWorkoutSetRowStale(row, dayExercises), false);
});

test('dayExercises o index için yoksa (program kısaldı vb.) stale sayılmaz, hata fırlatmaz', () => {
  const row = { exercise_index: 5, exercise_name: 'Herhangi Bir Şey' };
  assert.strictEqual(isWorkoutSetRowStale(row, dayExercises), false);
});

test('dayExercises hiç verilmezse hata fırlatmaz', () => {
  const row = { exercise_index: 0, exercise_name: 'Incline Barbell Bench Press' };
  assert.strictEqual(isWorkoutSetRowStale(row, null), false);
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
