// Birim testi: "Egzersizler" kütüphanesine eklenen 2 yeni statik hareket
// (One Arm Cable Crossover, Barbell 21s) ve kullanıcının kendi hareketini
// ekleyebildiği custom_exercises akışı (allExerciseDb/addCustomExercise/
// deleteCustomExercise).
//
// Çalıştırmak için: node tests/custom_exercises.test.js

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
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

async function main() {
  console.log('== EXERCISE_DB - yeni eklenen 2 hareket ==');
  {
    const sandbox = {};
    new Function('exports', extractConst('EXERCISE_DB') + '\nexports.EXERCISE_DB = EXERCISE_DB;')(sandbox);
    const { EXERCISE_DB } = sandbox;

    await test('"One Arm Cable Crossover" Göğüs (chest) olarak ekli', () => {
      const ex = EXERCISE_DB.find(e => e.name === 'One Arm Cable Crossover');
      assert.ok(ex, 'hareket bulunamadı');
      assert.deepStrictEqual(ex.muscles, ['chest']);
    });
    await test('"Barbell 21s" Biceps olarak ekli', () => {
      const ex = EXERCISE_DB.find(e => e.name === 'Barbell 21s');
      assert.ok(ex, 'hareket bulunamadı');
      assert.deepStrictEqual(ex.muscles, ['biceps']);
    });
  }

  console.log('== allExerciseDb (EXERCISE_DB + kullanıcının kendi eklediği hareketler) ==');
  {
    const parts = [
      extractConst('EXERCISE_DB'),
      'let customExerciseDB = [];',
      extractFunction('allExerciseDb'),
    ].join('\n');
    const sandbox = {};
    new Function('exports', parts + '\nexports.allExerciseDb = allExerciseDb; exports.setCustom = (v)=>{ customExerciseDB = v; };')(sandbox);
    const { allExerciseDb, setCustom } = sandbox;

    await test('customExerciseDB boşsa sadece EXERCISE_DB döner', () => {
      setCustom([]);
      const all = allExerciseDb();
      assert.ok(all.find(e => e.name === 'Cable Fly'));
      assert.ok(!all.some(e => e._custom));
    });
    await test('kullanıcının eklediği hareket listeye EKLENİR, mevcutları SİLMEZ', () => {
      setCustom([{ name: 'Spider Curl', muscle: 'Kol', muscles: ['biceps'], sets: 3, reps: '10-12', restSec: 90, tip: null, _custom: true, _customId: 'abc' }]);
      const all = allExerciseDb();
      assert.ok(all.find(e => e.name === 'Cable Fly'), 'orijinal liste kaybolmamalı');
      const custom = all.find(e => e.name === 'Spider Curl');
      assert.ok(custom);
      assert.strictEqual(custom._custom, true);
    });
  }

  console.log('== addCustomExercise / deleteCustomExercise (Supabase mock) ==');
  {
    const parts = [
      'let customExerciseDB = [];',
      extractFunction('addCustomExercise'),
      extractFunction('deleteCustomExercise'),
    ].join('\n');

    function makeHarness() {
      const dbRows = [];
      const sb = {
        from(table) {
          assert.strictEqual(table, 'custom_exercises');
          return {
            upsert(fields) {
              return {
                select() {
                  return {
                    single() {
                      const row = { id: 'id-' + dbRows.length, ...fields };
                      const existingIdx = dbRows.findIndex(r => r.user_id === fields.user_id && r.name === fields.name);
                      if (existingIdx >= 0) { dbRows[existingIdx] = { ...dbRows[existingIdx], ...fields }; return Promise.resolve({ data: dbRows[existingIdx], error: null }); }
                      dbRows.push(row);
                      return Promise.resolve({ data: row, error: null });
                    },
                  };
                },
              };
            },
            delete() {
              return {
                eq(col1, id) {
                  return {
                    eq(col2, uid) {
                      const idx = dbRows.findIndex(r => r.id === id && r.user_id === uid);
                      if (idx >= 0) dbRows.splice(idx, 1);
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
      const sandbox = { sb, customExerciseDB: [] };
      new Function('exports', 'sb', parts + '\nexports.addCustomExercise = addCustomExercise; exports.deleteCustomExercise = deleteCustomExercise; exports.getCustom = ()=>customExerciseDB;')(sandbox, sb);
      return sandbox;
    }

    await test('yeni hareket eklenince hem DB hem bellek (customExerciseDB) güncellenir', async () => {
      const h = makeHarness();
      const { error } = await h.addCustomExercise('u1', { name: 'Spider Curl', muscle: 'Kol', muscles: ['biceps'], tip: 'Yüzüstü bank' });
      assert.strictEqual(error, null);
      const custom = h.getCustom();
      assert.strictEqual(custom.length, 1);
      assert.strictEqual(custom[0].name, 'Spider Curl');
      assert.strictEqual(custom[0]._custom, true);
    });

    await test('isim boşsa hata döner, DB\'ye yazılmaz', async () => {
      const h = makeHarness();
      const { error } = await h.addCustomExercise('u1', { name: '  ' });
      assert.ok(error);
      assert.strictEqual(h.getCustom().length, 0);
    });

    await test('aynı isim tekrar eklenirse (upsert) ikinci kayıt oluşmaz, güncellenir', async () => {
      const h = makeHarness();
      await h.addCustomExercise('u1', { name: 'Spider Curl', muscle: 'Kol', tip: 'v1' });
      await h.addCustomExercise('u1', { name: 'Spider Curl', muscle: 'Kol', tip: 'v2' });
      const custom = h.getCustom();
      assert.strictEqual(custom.length, 1, 'ayni isim ikinci kez eklenince yeni satir OLUSMAMALI');
      assert.strictEqual(custom[0].tip, 'v2');
    });

    await test('silinince customExerciseDB listesinden çıkar', async () => {
      const h = makeHarness();
      await h.addCustomExercise('u1', { name: 'Spider Curl' });
      const id = h.getCustom()[0]._customId;
      await h.deleteCustomExercise('u1', id);
      assert.strictEqual(h.getCustom().length, 0);
    });
  }

  console.log(`\n${passed} geçti, ${failed} başarısız.`);
  if (failed > 0) process.exit(1);
}

main();
