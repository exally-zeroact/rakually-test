/* apply-statutory-central.mjs — ★中央(statutory)を lib に 合わせる／[反映]の門を 直す★
 * =============================================================================
 * ★なぜ 要るか（2026-09-13 実測。司さん「きっちり全部やれ」）★
 *   中央の 台帳を 読んだら こうだった（SELECT だけで 測った）
 *     ・statutory_upsert に ★rousai_ritsu が 入っていない★＝管理画面の[反映]から 労災は 書けない
 *     ・★rousai_ritsu の 行が 0件★（supabase/statutory-admin.sql の 覚書は「在る」と 書いていたが 無い）
 *     ・★saitei_chingin は 2025 だけ＝令和8(2026)が 中央に 無い★
 *     ・台帳 全体の 最終更新が ★2026-08-03★ から 動いていなかった
 *   ★客への 害は 出ていなかった★＝lib 側の hydrate に「中央が 古ければ 流し込まない」番人が
 *   入っていた為。だが ★「中央が 唯一の正」という 建て付けが 成り立っていない★。
 *
 * ★この道具の 守り★
 *   ① 向き先は ★js/supa-config.js から 読む★（この repo の 向き先以外には 当たらない）
 *   ② ★Exally の 倉庫なら 即 中止★（別のアプリの 台帳を 触らない）
 *   ③ ★足す物は lib から 作る★＝buildStatutoryRows（打ち込まない）
 *   ④ ★消す・作り替える SQL は 通さない★（drop/truncate/delete/alter を 見たら 1文字も 当てない）
 *   ⑤ ★当てた後に 読み戻して 突き合わせる★＝「出た字が 同じ」まで 見る（数が 同じ では 足りない）
 *
 * 使い方
 *   node scripts/apply-statutory-central.mjs            … ★測るだけ★（1バイトも 書かない）
 *   node scripts/apply-statutory-central.mjs --ddl      … [反映]の門（statutory_upsert）を 当てる
 *   node scripts/apply-statutory-central.mjs --write    … 中央の 行を lib に 合わせる
 *   （--ddl と --write は 一緒に 書ける。★どちらも 司さんの 一言が 要る★）
 *
 * 鍵: Supabase Personal Access Token（%TEMP%）。★中身は 画面に 出さない★。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const DDL = process.argv.includes('--ddl');
const WRITE = process.argv.includes('--write');
/* ★出典は 既定で 上書きしない（2026-09-13 実測で 危うく 5件 悪くした）★
   中央の 出典は ★PDF直リンク・年度ページ★、lib の 方が ★一覧ページ★だった＝
   lib で 上書きすると ★出典を 開いても 数字が 確かめられない★（09-12 に この repo が 決めた事の 逆）。
   ⇒ ★値が 無い/違う 行だけ 書く★。出典を 直すなら 中身を 見てから --urls を 付ける。 */
const URLS = process.argv.includes('--urls');

/* ★別のアプリの 倉庫の 名前を ここに 書かない★（no-hardcoded-supa に 捕まった＝見張りの 言い分が 正しい）
   ＝★向き先の 字は 1か所だけが 持つ★。門番が 既に 持っている物を 借りる。 */
import { PROD_WAREHOUSE_REF as EXALLY_REF } from './seikyu-sql-guard.mjs';

/* ── 向き先（この repo が 指している 倉庫だけ）───────────────── */
function refFromRepo() {
  const s = fs.readFileSync(path.join(ROOT, 'js', 'supa-config.js'), 'utf8');
  const m = s.match(/https:\/\/([a-z0-9]{16,})\.supabase\.co/);
  if (!m) throw new Error('js/supa-config.js から 向き先を 読めません');
  return m[1];
}
function token() {
  const tmp = process.env.TEMP || process.env.TMP || os.tmpdir();
  for (const f of ['nomiya-db-url-prod.json', 'nomiya-db-url.json']) {
    const p = path.join(tmp, f);
    if (fs.existsSync(p)) {
      const t = JSON.parse(fs.readFileSync(p, 'utf8')).token;
      if (t) return t;
    }
  }
  throw new Error('鍵が 見つかりません（%TEMP%/nomiya-db-url-prod.json）＝司さんに 作り直しを 頼む');
}
const REF = refFromRepo();
if (REF === EXALLY_REF) { console.log('★中止★ Exally の 倉庫を 指しています: ' + REF); process.exit(1); }
const TOK = token();

async function sql(q) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json', 'User-Agent': 'rakunally-statutory' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error('倉庫が 断りました(' + r.status + '): ' + t.slice(0, 400));
  try { return JSON.parse(t); } catch (e) { return t; }
}

/* ── あるべき行（★lib から 作る＝打ち込まない★）──────────────── */
const L = {
  SHH: require_(path.join(ROOT, 'kyuyo/lib/shakaihoken-hyo.js')),
  SAI: require_(path.join(ROOT, 'kyuyo/lib/saitei-chingin.js')),
  KOYO: require_(path.join(ROOT, 'kyuyo/lib/koyo-hoken.js')),
  D: require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-densan.js')),
  H: require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-hei.js')),
  NI: require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-nichi.js')),
  SZ: require_(path.join(ROOT, 'kyuyo/lib/shoyo-zei.js')),
  N: require_(path.join(ROOT, 'kyuyo/lib/nenmatsu.js')),
  WM: require_(path.join(ROOT, 'kyuyo/lib/warimashi.js')),
  SHZ: require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js')),
  RR: require_(path.join(ROOT, 'kyuyo/lib/rousai-ritsu.js')),
};
const SR = require_(path.join(ROOT, 'kyuyo/lib/statutory-rows.js'));
const desired = SR.buildStatutoryRows(L);

/* 中央と 突き合わせる時の 字（statutory-rows.js の stableStr と 同じ考え） */
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
/* ドル引用符（JSON の 中に 出ない 印を 選ぶ＝逃がし記号を 使わない） */
function dq(s) {
  let tag = '$j$';
  for (let i = 0; s.indexOf(tag) >= 0; i++) tag = '$j' + i + '$';
  return tag + s + tag;
}
const q1 = (s) => "'" + String(s).split("'").join("''") + "'";

console.log('\n[apply-statutory-central] 倉庫 ' + REF + '（この repo の 向き先）');

/* ── ① [反映]の門（statutory_upsert）─────────────────────── */
const teigi = await sql("select coalesce((select pg_get_functiondef(p.oid) from pg_proc p"
  + " join pg_namespace n on n.oid=p.pronamespace where p.proname='statutory_upsert' and n.nspname='public' limit 1),'') as def");
const defNow = (teigi[0] || {}).def || '';
const rousaiOk = defNow.indexOf('rousai_ritsu') >= 0;
console.log('  門 statutory_upsert … ' + (defNow ? '在る' : '★無い★')
  + ' ／ 労災(rousai_ritsu)を 許しているか … ' + (rousaiOk ? '許している' : '★許していない★'));

if (DDL) {
  const raw = fs.readFileSync(path.join(ROOT, 'supabase/statutory-admin.sql'), 'utf8');
  const warui = [];
  if (/\b(drop|truncate|delete\s+from|alter\s+table)\b/i.test(raw.replace(/--[^\n]*/g, ''))) warui.push('消す/作り替える 命令が 混ざっている');
  if (raw.indexOf(EXALLY_REF) >= 0) warui.push('別のアプリの 倉庫の 名前が 混ざっている');
  if (raw.indexOf('statutory_upsert') < 0) warui.push('statutory_upsert が 出てこない（別の物を 当てようとしている）');
  if (warui.length) { console.log('  ★門番で 止めました★ … ' + warui.join(' / ')); process.exit(1); }
  await sql(raw);
  const t2 = await sql("select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
    + " where p.proname='statutory_upsert' and n.nspname='public'");
  const ok2 = ((t2[0] || {}).def || '').indexOf('rousai_ritsu') >= 0;
  console.log('  → 当てた後 … 労災を 許しているか … ' + (ok2 ? '★許している（直った）★' : '★まだ 許していない＝当たっていない★'));
  if (!ok2) process.exit(1);
}

/* ── ② 中央の 行 vs lib ─────────────────────────────── */
const chuo = await sql('select kind, year, data, source_url from statutory order by kind, year');
const idx = {};
chuo.forEach((r) => { idx[r.kind + ' ' + r.year] = r; });

const sagyo = [];
for (const d of desired) {
  const cur = idx[d.kind + ' ' + d.year];
  let jotai;
  if (!cur) jotai = 'new';
  else if (stable(cur.data) !== stable(d.data)) jotai = 'changed';
  else if ((cur.source_url || '') !== (d.source_url || '')) jotai = 'url';
  else jotai = 'same';
  sagyo.push({ ...d, jotai });
}
const kazu = (s) => sagyo.filter((x) => x.jotai === s).length;
console.log('\n  中央の 行 ' + chuo.length + '件 ／ lib から 作った 行 ' + desired.length + '件');
console.log('  → 無い ' + kazu('new') + '件 ／ 値が 違う ' + kazu('changed') + '件 ／ 出典だけ 違う ' + kazu('url') + '件 ／ 同じ ' + kazu('same') + '件');
for (const s of sagyo) {
  if (s.jotai === 'same') continue;
  console.log('     ' + (s.jotai === 'new' ? '★中央に 無い★' : s.jotai === 'changed' ? '★値が 違う★' : '出典だけ 違う')
    + '  ' + s.kind + ':' + s.year);
}
/* ★中央にだけ 在る行★（lib が 知らない物）＝★消さない★。在る事だけ 言う */
const nokori = chuo.filter((c) => !desired.some((d) => d.kind === c.kind && d.year === c.year));
if (nokori.length) console.log('  （中央にだけ 在る行 ' + nokori.length + '件 … ' + nokori.map((r) => r.kind + ':' + r.year).join(', ') + ' ★消しません★）');

if (!WRITE) {
  console.log('\n  ★測っただけ＝1バイトも 書いていません★（書くなら --write）');
  process.exit(0);
}

/* ── ③ 書く（★消さない・足すと 直すだけ★）────────────────── */
let kaita = 0, mioku = 0;
for (const s of sagyo) {
  if (s.jotai === 'same') continue;
  if (s.jotai === 'url' && !URLS) { mioku++; continue; }   /* ★出典だけの 違いは 触らない★ */
  const j = dq(JSON.stringify(s.data));
  await sql('insert into statutory(kind, year, data, source_url, verified_at, updated_at) values ('
    + q1(s.kind) + ', ' + Number(s.year) + ', ' + j + '::jsonb, ' + q1(s.source_url || '') + ', now(), now())'
    + ' on conflict (kind, year) do update set data = excluded.data, source_url = excluded.source_url,'
    + ' verified_at = now(), updated_at = now()'
    + ' where statutory.data is distinct from excluded.data or statutory.source_url is distinct from excluded.source_url');
  kaita++;
}
console.log('\n  書いた 行 … ' + kaita + '件'
  + (mioku ? ' ／ ★出典だけ 違う ' + mioku + '件は 触っていない★（中央の 方が 具体的。直すなら --urls）' : ''));

/* ── ④ ★読み戻して 突き合わせる★（出た字が 同じ まで 見る）──────── */
const ato = await sql('select kind, year, data, source_url from statutory order by kind, year');
const idx2 = {};
ato.forEach((r) => { idx2[r.kind + ' ' + r.year] = r; });
const chigau = [];
for (const d of desired) {
  const cur = idx2[d.kind + ' ' + d.year];
  if (!cur) { chigau.push(d.kind + ':' + d.year + ' … 書いたのに 無い'); continue; }
  if (stable(cur.data) !== stable(d.data)) chigau.push(d.kind + ':' + d.year + ' … 値が 合わない');
  /* ★出典は わざと 触っていない行が 在る★＝それを「合わない」と 数えると 嘘の 赤に なる */
  const sonoGyo = sagyo.filter((x) => x.kind === d.kind && x.year === d.year)[0] || {};
  const sawatta = URLS || sonoGyo.jotai !== 'url';
  if (sawatta && (cur.source_url || '') !== (d.source_url || '')) chigau.push(d.kind + ':' + d.year + ' … 出典が 合わない');
}
console.log('  読み戻して 突き合わせ … ' + (chigau.length ? '★' + chigau.length + '件 合わない★\n     ' + chigau.join('\n     ') : '★' + desired.length + '行 とも 一致★'));
process.exit(chigau.length ? 1 : 0);
