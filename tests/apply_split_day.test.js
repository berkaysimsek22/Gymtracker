// Birim + entegrasyon testleri: split uygulanırken "hangi gün bugün olsun?"
// seçimi (rotateScheduleToStartDay). Amaç: kullanıcı bir split'i BUGÜN
// Pazartesi olmadığı bir günde uygularken, split'in kendi gün diziliminde
// seçtiği günün gerçekten BUGÜN'e denk gelmesi - programs[uid] her zaman
// 0=Pazartesi..6=Pazar sırasıyla okunduğu için (activeProgram, storageDayIndex
// vb.), içerik döndürülürken her pozisyonun .day etiketi de yeniden yazılmalı.
//
// Fonksiyonlar gerçek gym_tracker.html dosyasından İSİM bazlı parantez
// eşleştirmeyle çıkarılır (satır numarasına bağımlı değil).
//
// Çalıştırmak için: node tests/apply_split_day.test.js

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
  extractConst('CUSTOM_SPLIT_WEEK_DAYS'),
  extractFunction('dc'),
  extractFunction('rotateScheduleToStartDay'),
  extractFunction('_woEx'),
  extractFunction('_woExDetailed'),
  extractFunction('_woWarm'),
  extractConst('POPULAR_SPLITS'),
].join('\n');

const sandbox = {};
new Function('exports', parts + '\n' + `
  exports.CUSTOM_SPLIT_WEEK_DAYS = CUSTOM_SPLIT_WEEK_DAYS;
  exports.rotateScheduleToStartDay = rotateScheduleToStartDay;
  exports.POPULAR_SPLITS = POPULAR_SPLITS;
`)(sandbox);

const { CUSTOM_SPLIT_WEEK_DAYS, rotateScheduleToStartDay, POPULAR_SPLITS } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

const ul = POPULAR_SPLITS.find(s => s.id === 'upper_lower');

console.log('== rotateScheduleToStartDay ==');

test('startIdx=0, todayIdx=0 (Pazartesi) -> hiçbir şey değişmez (identity)', () => {
  const rotated = rotateScheduleToStartDay(ul.schedule, 0, 0);
  assert.deepStrictEqual(rotated.map(d => d.name), ul.schedule.map(d => d.name));
  assert.deepStrictEqual(rotated.map(d => d.day), ul.schedule.map(d => d.day));
});

test('7 gün uzunluğu korunur', () => {
  const rotated = rotateScheduleToStartDay(ul.schedule, 3, 5);
  assert.strictEqual(rotated.length, 7);
});

test('kullanıcı "Upper A" seçer (startIdx=0), bugün Çarşamba (todayIdx=2) -> Upper A Çarşamba\'ya gelir', () => {
  // Ekran görüntüsündeki tam senaryo: bugün Çarşamba, "Upper/Lower"ı şimdi
  // ekliyor ve Upper A'nın bugün olmasını istiyor.
  const todayIdx = 2; // Çarşamba
  const rotated = rotateScheduleToStartDay(ul.schedule, 0, todayIdx);
  assert.strictEqual(rotated[2].name, 'Upper A');
  assert.strictEqual(rotated[2].day, 'Çarşamba');
  // Haftanın geri kalanı da Upper A'dan devam ederek kaymalı:
  assert.strictEqual(rotated[3].name, 'Lower A'); assert.strictEqual(rotated[3].day, 'Perşembe');
  assert.strictEqual(rotated[4].name, 'Dinlenme'); assert.strictEqual(rotated[4].day, 'Cuma');
  assert.strictEqual(rotated[5].name, 'Upper B'); assert.strictEqual(rotated[5].day, 'Cumartesi');
  assert.strictEqual(rotated[6].name, 'Dinlenme'); assert.strictEqual(rotated[6].day, 'Pazar');
  assert.strictEqual(rotated[0].name, 'Lower B'); assert.strictEqual(rotated[0].day, 'Pazartesi');
  assert.strictEqual(rotated[1].name, 'Dinlenme'); assert.strictEqual(rotated[1].day, 'Salı');
});

test('kullanıcı "Lower A" seçer (startIdx=1), bugün Cuma (todayIdx=4) -> Lower A Cuma\'ya gelir', () => {
  const todayIdx = 4; // Cuma
  const rotated = rotateScheduleToStartDay(ul.schedule, 1, todayIdx);
  assert.strictEqual(rotated[4].name, 'Lower A');
  assert.strictEqual(rotated[4].day, 'Cuma');
});

test('her pozisyonun .day etiketi CUSTOM_SPLIT_WEEK_DAYS ile birebir eşleşir (programs[uid] 0=Pzt..6=Paz varsayımı bozulmaz)', () => {
  const rotated = rotateScheduleToStartDay(ul.schedule, 2, 5);
  rotated.forEach((d, i) => assert.strictEqual(d.day, CUSTOM_SPLIT_WEEK_DAYS[i]));
});

test('egzersiz içerikleri derin kopyalanır - döndürülen diziyi değiştirmek orijinali bozmaz', () => {
  const rotated = rotateScheduleToStartDay(ul.schedule, 0, 2);
  rotated[2].exercises.push({ name: 'TEST-MUTATION' });
  assert.notStrictEqual(ul.schedule[0].exercises.length, rotated[2].exercises.length);
  assert.ok(!ul.schedule[0].exercises.some(e => e.name === 'TEST-MUTATION'));
});

test('hiçbir gün kaybolmaz veya kopyalanmaz - isim kümesi aynı kalır', () => {
  const rotated = rotateScheduleToStartDay(ul.schedule, 4, 1);
  const origNames = ul.schedule.map(d => d.name).sort();
  const rotNames = rotated.map(d => d.name).sort();
  assert.deepStrictEqual(rotNames, origNames);
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
