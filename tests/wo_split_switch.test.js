// Birim testi: Workouts > Split > "Şu Anki Programım" (hem hafta tablosu
// hem gün detayı görünümünde) artık bir "🔁 Split'i Değiştir" kısayolu var -
// eskiden split listesine dönmek için önce "← Hafta" sonra "← Split
// Listesi" demek gerekiyordu. Bu kısayol SADECE canlı/aktif programı
// görüntülerken (_woSplitMeta===null) çıkmalı - henüz UYGULANMAMIŞ bir
// split önizlemesindeyken (_woSplitMeta dolu) çıkarsa, o önizlemenin
// İÇİNDEN bir başka önizlemeye geçiş gibi kafa karıştırıcı bir iç içe
// navigasyon oluşur.
//
// Çalıştırmak için: node tests/wo_split_switch.test.js

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

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

function makeFakeEl() {
  return { _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
}

console.log('== renderWoWeekTable: "Split\'i Değiştir" kısayolu ==');
{
  const parts = [extractFunction('_woDayMeta'), extractFunction('renderWoWeekTable')].join('\n');
  function run({ schedule, splitMeta, canEditVal }) {
    const el = makeFakeEl();
    const fn = new Function(
      '_woSchedule', '_woSplitMeta', '_woShowAlt', 'canEdit', 'document',
      parts + '\nrenderWoWeekTable();'
    );
    fn(schedule, splitMeta, false, () => canEditVal, { getElementById: () => el });
    return el.innerHTML;
  }
  const schedule = [{ type: 'full', day: 'Pazartesi', name: 'Gün B', exercises: [{ name: 'Squat' }] }];

  test('"Şu Anki Programım" (canlı program, _woSplitMeta=null) görüntülenirken ve düzenleme yetkisi varken kısayol GÖRÜNÜR', () => {
    const html = run({ schedule, splitMeta: null, canEditVal: true });
    assert.ok(html.includes("Split'i Değiştir"));
  });
  test('henüz UYGULANMAMIŞ bir split önizlemesindeyken (_woSplitMeta dolu) kısayol GÖRÜNMEZ', () => {
    const html = run({ schedule, splitMeta: { id: 'upper_lower', name: 'Upper/Lower' }, canEditVal: true });
    assert.ok(!html.includes("Split'i Değiştir"));
  });
  test('düzenleme yetkisi yoksa (canEdit()=false) kısayol GÖRÜNMEZ', () => {
    const html = run({ schedule, splitMeta: null, canEditVal: false });
    assert.ok(!html.includes("Split'i Değiştir"));
  });
}

console.log('== showWoDayDetail: aynı kısayol gün detayında da var ==');
{
  const parts = [extractFunction('_woDayMeta'), extractFunction('showWoDayDetail')].join('\n');
  function run({ schedule, dayIdx, splitMeta, canEditVal }) {
    const el = makeFakeEl();
    const fn = new Function(
      '_woSchedule', '_woSplitMeta', '_woPreviewEditMode', '_woDayDetailIdx',
      'canEdit', 'document', 'renderMiniMuscleVolumeHtml', 'exerciseRegionPillsHtml',
      parts + '\nshowWoDayDetail(' + dayIdx + ');'
    );
    fn(schedule, splitMeta, false, null, () => canEditVal, { getElementById: () => el }, () => '', () => '');
    return el.innerHTML;
  }
  const schedule = [{ type: 'full', day: 'Pazartesi', name: 'Gün B', exercises: [{ name: 'Squat', muscle: 'Quad', sets: 3, reps: '8,8,6', restSec: 90 }] }];

  test('"Şu Anki Programım" gün detayında (canlı program) kısayol GÖRÜNÜR', () => {
    const html = run({ schedule, dayIdx: 0, splitMeta: null, canEditVal: true });
    assert.ok(html.includes("Split'i Değiştir"));
  });
  test('henüz uygulanmamış split önizlemesinin gün detayında kısayol GÖRÜNMEZ', () => {
    const html = run({ schedule, dayIdx: 0, splitMeta: { id: 'ppl' }, canEditVal: true });
    assert.ok(!html.includes("Split'i Değiştir"));
  });
}

console.log(`\n${passed} geçti, ${failed} başarısız.`);
if (failed > 0) process.exit(1);
