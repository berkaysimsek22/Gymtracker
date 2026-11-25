// Birim testi: "Workouts > Split" sekmesindeki gün detayı (showWoDayDetail)
// düzenleme modunda artık set SAYISI da editlenebiliyor (updateExSetsInPreview),
// ve bu bu sohbette KEŞFEDİLEN bir kalıcılık boşluğunu da kapatıyor:
// "Şu Anki Programım" (canlı aktif program, _woSplitMeta===null) üzerinde
// yapılan ekle/sil/taşı/set-değiştir işlemleri artık saveProgram ile
// Supabase'e yazılıyor; henüz UYGULANMAMIŞ bir split önizlemesindeyken
// (_woSplitMeta dolu) ise YAZILMIYOR (aksi halde "🚀 Uygula"ya basmadan
// kullanıcının gerçek aktif programı sessizce ezilirdi).
//
// Çalıştırmak için: node tests/wo_preview_edit.test.js

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

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

const parts = [
  extractConst('COMPOUND_EXERCISE_NAMES'),
  extractConst('ISOLATION_EXERCISE_NAMES'),
  extractFunction('isCompoundExercise'),
  extractFunction('sortExercisesCompoundFirst'),
  extractFunction('persistWoPreviewIfLive'),
  extractFunction('moveExInPreview'),
  extractFunction('delExFromPreview'),
  extractFunction('updateExSetsInPreview'),
  extractFunction('addExToPreview'),
].join('\n');

// _woSchedule/_woDayDetailIdx/_woSplitMeta bu fonksiyonlarda sadece OKUNUYOR
// (yeniden atanmıyor) - bu yüzden parametre olarak geçmek güvenli; diğer
// bağımlılıklar (activeProfile/saveProgram/showWoDayDetail/confirm/alert/
// document) da aynı şekilde mock olarak geçiliyor (tests/avg_macros.test.js'teki
// 'sb' parametresiyle AYNI yöntem).
function makeHarness({ schedule, dayIdx = 0, splitMeta = null, profile = { id: 'u1' }, domValues = {}, confirmResult = true }) {
  const saveProgramCalls = [];
  let renderCount = 0;
  const factory = new Function(
    '_woSchedule', '_woDayDetailIdx', '_woSplitMeta',
    'activeProfile', 'saveProgram', 'showWoDayDetail', 'confirm', 'alert', 'document',
    parts + `
    return { persistWoPreviewIfLive, moveExInPreview, delExFromPreview, updateExSetsInPreview, addExToPreview };
    `
  );
  const api = factory(
    schedule, dayIdx, splitMeta,
    () => profile,
    (uid) => { saveProgramCalls.push(uid); },
    () => { renderCount++; },
    () => confirmResult,
    () => {},
    { getElementById: (id) => (domValues[id] !== undefined ? { value: domValues[id] } : null) }
  );
  return { ...api, saveProgramCalls, getRenderCount: () => renderCount };
}

function sampleDay() {
  return { type: 'full', exercises: [
    { name: 'Squat', muscle: 'Quad', sets: 4, reps: '8,8,6,6', restSec: 150 },
    { name: 'Leg Extension', muscle: 'Quad', sets: 3, reps: '15', restSec: 60 },
  ] };
}

console.log('== updateExSetsInPreview ==');
test('set sayısını günceller', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day] });
  h.updateExSetsInPreview(0, '6');
  assert.strictEqual(day.exercises[0].sets, 6);
});
test('0 veya negatif/boş değer 1\'e sıkıştırılır (set sayısı asla 0 olmamalı)', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day] });
  h.updateExSetsInPreview(0, '0');
  assert.strictEqual(day.exercises[0].sets, 1);
  h.updateExSetsInPreview(0, 'abc');
  assert.strictEqual(day.exercises[0].sets, 1);
});
test('olmayan bir egzersiz indexi hata fırlatmaz', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day] });
  assert.doesNotThrow(() => h.updateExSetsInPreview(99, '5'));
});

console.log('== KALICILIK: "Şu Anki Programım" (canlı program) değişiklikleri KAYDEDİLİR ==');
test('updateExSetsInPreview, _woSplitMeta boşsa (canlı program) saveProgram çağırır', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day], splitMeta: null, profile: { id: 'u42' } });
  h.updateExSetsInPreview(0, '5');
  assert.deepStrictEqual(h.saveProgramCalls, ['u42']);
});
test('moveExInPreview, canlı programda saveProgram çağırır', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day], splitMeta: null, profile: { id: 'u42' } });
  h.moveExInPreview(0, 1);
  assert.deepStrictEqual(h.saveProgramCalls, ['u42']);
  assert.strictEqual(day.exercises[0].name, 'Leg Extension');
});
test('delExFromPreview, canlı programda saveProgram çağırır', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day], splitMeta: null, profile: { id: 'u42' }, confirmResult: true });
  h.delExFromPreview(1);
  assert.deepStrictEqual(h.saveProgramCalls, ['u42']);
  assert.strictEqual(day.exercises.length, 1);
});
test('addExToPreview, canlı programda saveProgram çağırır', () => {
  const day = sampleDay();
  const h = makeHarness({
    schedule: [day], splitMeta: null, profile: { id: 'u42' },
    domValues: { 'aef-name': 'Hip Thrust', 'aef-muscle': 'Glute', 'aef-sets': '4', 'aef-reps': '10', 'aef-rest': '90', 'aef-tip': '' },
  });
  h.addExToPreview();
  assert.deepStrictEqual(h.saveProgramCalls, ['u42']);
  assert.ok(day.exercises.some(e => e.name === 'Hip Thrust'));
});

console.log('== BUG KORUMASI: henüz UYGULANMAMIŞ bir split önizlemesi SESSİZCE kaydedilmemeli ==');
test('updateExSetsInPreview, _woSplitMeta DOLUYSA (henüz uygulanmamış önizleme) saveProgram ÇAĞIRMAZ', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day], splitMeta: { id: 'upper_lower', name: 'Upper/Lower' } });
  h.updateExSetsInPreview(0, '5');
  assert.strictEqual(day.exercises[0].sets, 5, 'yerel degisiklik yine de uygulanmali');
  assert.deepStrictEqual(h.saveProgramCalls, [], 'uygulanmamis onizlemede Supabase a YAZILMAMALI');
});
test('delExFromPreview, önizleme modunda saveProgram ÇAĞIRMAZ', () => {
  const day = sampleDay();
  const h = makeHarness({ schedule: [day], splitMeta: { id: 'upper_lower' } });
  h.delExFromPreview(0);
  assert.deepStrictEqual(h.saveProgramCalls, []);
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
