// Birim testi: defaultMealSlots - yeni bir beslenme gününün (hiç kayıt
// yoksa) 4 varsayılan öğünle (Kahvaltı/Öğle Yemeği/Atıştırmalıklar/
// Akşam Yemeği) başladığını doğrular.
//
// Çalıştırmak için: node tests/default_meal_slots.test.js

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

const sandbox = {};
new Function('exports', extractFunction('defaultMealSlots') + '\nexports.defaultMealSlots = defaultMealSlots;')(sandbox);
const { defaultMealSlots } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

console.log('== defaultMealSlots ==');

test('tam olarak 4 öğün döner: Kahvaltı, Öğle Yemeği, Atıştırmalıklar, Akşam Yemeği', () => {
  const meals = defaultMealSlots();
  assert.strictEqual(meals.length, 4);
  assert.deepStrictEqual(meals.map(m => m.name), ['Kahvaltı', 'Öğle Yemeği', 'Atıştırmalıklar', 'Akşam Yemeği']);
});

test('her öğün boş foods dizisiyle ve açık (open:true) başlar - kullanıcı direkt besin ekleyebilsin', () => {
  const meals = defaultMealSlots();
  meals.forEach(m => {
    assert.deepStrictEqual(m.foods, []);
    assert.strictEqual(m.open, true);
    assert.ok(/^\d{2}:\d{2}$/.test(m.time), 'time formatı HH:MM olmalı: ' + m.time);
  });
});

test('her çağrı YENİ bir dizi/nesne döner - bir güne yapılan değişiklik diğerini etkilemez', () => {
  const a = defaultMealSlots();
  const b = defaultMealSlots();
  a[0].foods.push({ name: 'test' });
  assert.strictEqual(b[0].foods.length, 0, 'defaultMealSlots çağrıları arasında paylaşılan referans var');
});

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
