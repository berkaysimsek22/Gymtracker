// Birim testi: tek ekranlık "Hoş Geldin" onboarding akışı -
// isOnboardingNeeded (ilk girişte modal'ın ne zaman gösterileceği) ve
// updateProfileSafe (yeni onboarding kolonları henüz migration ile
// eklenmemişse profil kaydının TÜMDEN başarısız olmaması gereken
// defansif geri-dönüş mantığı).
//
// Çalıştırmak için: node tests/onboarding.test.js

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

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

async function main() {
  console.log('== isOnboardingNeeded ==');
  {
    const sandbox = {};
    new Function('exports', extractFunction('isOnboardingNeeded') + '\nexports.isOnboardingNeeded = isOnboardingNeeded;')(sandbox);
    const { isOnboardingNeeded } = sandbox;

    await test('profil yoksa (null) false döner - auth akışı kendi ekranını gösterir', () => {
      assert.strictEqual(isOnboardingNeeded(null), false);
    });
    await test('cinsiyet/yaş/boy/kilo DOLU ise onboarding gerekmez', () => {
      assert.strictEqual(isOnboardingNeeded({ gender: 'female', age: 30, height: 165, weight: 60 }), false);
    });
    await test('sadece kilo EKSİK ise onboarding gerekir', () => {
      assert.strictEqual(isOnboardingNeeded({ gender: 'female', age: 30, height: 165 }), true);
    });
    await test('hiçbiri dolu değilse (yeni kayıt) onboarding gerekir', () => {
      assert.strictEqual(isOnboardingNeeded({ name: 'Berkay' }), true);
    });
    await test('yaş 0 gibi falsy ama gerçek bir değer değilse yine eksik sayılır', () => {
      assert.strictEqual(isOnboardingNeeded({ gender: 'male', age: 0, height: 180, weight: 80 }), true);
    });
  }

  console.log('== ONBOARD_LEVEL_OPTIONS ==');
  {
    const sandbox = {};
    new Function('exports', extractConst('ONBOARD_LEVEL_OPTIONS') + '\nexports.ONBOARD_LEVEL_OPTIONS = ONBOARD_LEVEL_OPTIONS;')(sandbox);
    const { ONBOARD_LEVEL_OPTIONS } = sandbox;

    await test('"Yok" (none) seçeneği var - MacroFactor ekranındaki "None" karşılığı', () => {
      assert.ok(ONBOARD_LEVEL_OPTIONS.some(o => o.id === 'none'));
    });
    await test('tam olarak 4 seçenek: none/beginner/intermediate/advanced', () => {
      assert.deepStrictEqual(ONBOARD_LEVEL_OPTIONS.map(o => o.id), ['none', 'beginner', 'intermediate', 'advanced']);
    });
  }

  console.log('== updateProfileSafe (kolon yoksa düşüp temel alanları yine de kaydeder) ==');
  {
    const parts = [
      extractConst('ONBOARD_NEW_COLUMNS'),
      extractFunction('updateProfileSafe'),
    ].join('\n');

    function makeUpdateProfileSafe(sb) {
      const sandbox = { sb };
      new Function('exports', 'sb', parts + '\nexports.updateProfileSafe = updateProfileSafe;')(sandbox, sb);
      return sandbox.updateProfileSafe;
    }

    function makeMockSb(shouldFailOn) {
      const calls = [];
      return {
        calls,
        from() {
          return {
            update(fields) {
              calls.push(fields);
              return {
                eq(col, val) {
                  const hasBadColumn = Object.keys(fields).some(k => shouldFailOn.includes(k));
                  if (hasBadColumn) {
                    return Promise.resolve({ error: { message: `Could not find the '${shouldFailOn[0]}' column of 'profiles' in the schema cache` } });
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    }

    await test('migration çalıştırılmış gibi (hata yok) - tek denemede başarılı', async () => {
      const sb = makeMockSb([]);
      const updateProfileSafe = makeUpdateProfileSafe(sb);
      const { error } = await updateProfileSafe('u1', { name: 'Berkay', age: 30, exercise_frequency: '4-6' });
      assert.strictEqual(error, null);
      assert.strictEqual(sb.calls.length, 1, 'kolon eksik değilse ikinci bir deneme yapılmamalı');
    });

    await test('migration ÇALIŞTIRILMAMIŞ (yeni kolon eksik) - yeni alanlar düşülüp temel alanlar yine kaydedilir', async () => {
      const sb = makeMockSb(['exercise_frequency']);
      const updateProfileSafe = makeUpdateProfileSafe(sb);
      const { error } = await updateProfileSafe('u1', { name: 'Berkay', age: 30, exercise_frequency: '4-6', body_fat_range: '13-17' });
      assert.strictEqual(error, null, 'ikinci denemede (yeni kolonlar olmadan) basarili olmali');
      assert.strictEqual(sb.calls.length, 2, 'once tum alanlarla, sonra yeni kolonlar cikarilarak 2 kez denenmeli');
      const secondCallFields = sb.calls[1];
      assert.strictEqual(secondCallFields.name, 'Berkay');
      assert.strictEqual(secondCallFields.exercise_frequency, undefined, 'ikinci denemede sorunlu yeni kolon tamamen cikarilmali');
    });
  }

  console.log(`\n${passed} geçti, ${failed} başarısız.`);
  if (failed > 0) process.exit(1);
}

main();
