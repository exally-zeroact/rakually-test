/* warehouse-perms.test.mjs — ★請求書が触る棚の権限を、名前で並べて固定する★
 *
 * ★なぜ要るのか★
 *   Timeally で踏んだ形＝★窓（view）に権限を付けただけで、実の棚（table）に付け忘れる★。
 *   窓は開くのに中身が読めない／逆に、窓の持ち主の権限で開いて ★他人のデータが見える★。
 *   請求書は8つの棚を跨いで動くので、★どれか1つ忘れた日★に気づける形にしておく。
 *
 * ★この検査が見る物（2つ）★
 *   ① ★画面が実際に叩く棚の一覧★（コードから機械で拾う）が、下の表と ★1つ違わず同じ★か。
 *      ＝棚を1つ足して権限を忘れたら、ここが赤くなる（人の記憶に頼らない）。
 *   ② この repo が定義している棚（pay_invoices / pay_receipts）について、
 *      ★棚と窓の両方に grant が在るか／RLSが有効か／決まりが在るか／security_invoker=true か★。
 *
 * ★正直に書いておく事★
 *   残り6つ（pay_partners / pay_org / pay_companies / pay_employees / pay_ledger /
 *   exally_entitlements）は ★この repo に定義が無い★（指示役の6部屋schemaの側）。
 *   だから ★静的には確かめられない★。下の表は ★2026-08-14 に指示役が実倉庫(DB-test)の
 *   pg_catalog を数えた結果★を書き写した物＝「いつ・何を見て・どうだったか」を残す。
 *   ★この表と食い違ったら、実倉庫を数え直して表を直す（表の方を黙って合わせない）★
 *
 * 使い方: node seikyu/tests/warehouse-perms.test.mjs
 *         node seikyu/tests/warehouse-perms.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_PATH = path.join(ROOT, 'supabase/schema-seikyu.sql');

/* ★請求書が触る棚：この8つで全部★（2026-08-14 実測）
   defined … この repo の supabase/*.sql に定義が在るか（在る物だけ静的に検査できる）
   room    … 部屋（schema）。★10月の改名で見直す。今は動かさない★ */
const TABLES = [
  { name: 'pay_invoices', room: 'kyuyo', defined: true, rls: true, policies: 1, invoker: true, note: '請求書1通＝1行' },
  { name: 'pay_receipts', room: 'kyuyo', defined: true, rls: true, policies: 1, invoker: true, note: '入金1回＝1行' },
  { name: 'pay_partners', room: 'kyuyo', defined: false, rls: true, policies: 1, invoker: true, note: '取引先マスタ（共有・請求と見積で使う）' },
  { name: 'pay_org', room: 'kyuyo', defined: false, rls: true, policies: 1, invoker: true, note: '自社情報（共有）' },
  { name: 'pay_companies', room: 'kyuyo', defined: false, rls: true, policies: 1, invoker: true, note: '給与の会社（共有データ層が読む）' },
  { name: 'pay_employees', room: 'kyuyo', defined: false, rls: true, policies: 1, invoker: true, note: '給与の従業員（共有データ層が読む）' },
  { name: 'pay_ledger', room: 'kyuyo', defined: false, rls: true, policies: 1, invoker: true, note: '台帳（共有データ層が読む）' },
  { name: 'exally_entitlements', room: 'exally', defined: false, rls: true, policies: 4, invoker: true, note: '利用権。★請求書の関所は課金11月なので今は読むだけ★' },
];
const MEASURED_AT = '2026-08-14';

/* ★anon にも書き込みの権限が付いている（Supabaseの既定）★ことを、忘れない形で書いておく。
   ・読み書きは ★RLS が account_id = auth.uid() で止める★＝anon は auth.uid() が空で1行も触れない
   ・★TRUNCATE だけは RLS を素通りする★が、★PostgREST は TRUNCATE を出していない★＝公開鍵から届かない
   ⇒ 今すぐ直す物ではない。ただし ★「なぜ安全か」を言えない状態にしない★ */
const ANON_NOTE = 'anon の INSERT/UPDATE/DELETE/TRUNCATE は Supabase の既定。RLS(account_id=auth.uid())が止める。'
  + 'TRUNCATE だけ RLS を素通りするが PostgREST が出していないので公開鍵からは届かない。';

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const eqSet = (a, b, m) => {
  const A = [...new Set(a)].sort(), B = [...new Set(b)].sort();
  if (A.join(',') !== B.join(',')) {
    const plus = A.filter((x) => B.indexOf(x) < 0), minus = B.filter((x) => A.indexOf(x) < 0);
    throw new Error((m ? m + ': ' : '') + '違う'
      + (plus.length ? ' ／ ★表に無い棚を叩いている: ' + plus.join(',') + '★' : '')
      + (minus.length ? ' ／ 表に在るのに叩いていない: ' + minus.join(',') : ''));
  }
};

/* ── 画面が実際に叩く棚を、コードから拾う ────────────────────────
   ★人が思い出して並べない★。sb.from('...') を機械で数える。 */
const SCANNED = ['seikyu/js/seikyu-store.js', 'seikyu/js/seikyu-app.js', 'seikyu/js/auth.js', 'js/suite-data.js'];
export function tablesUsedBy(files, root) {
  const out = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root || ROOT, f), 'utf8');
    for (const m of src.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g)) out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

/* ── SQL から「棚と窓の両方に grant が在るか」を読む ───────────── */
const SQL = fs.readFileSync(SQL_PATH, 'utf8').replace(/\r\n?/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
export function grantsOf(sql) {
  const code = stripComments(sql);
  const out = {};
  for (const m of code.matchAll(/grant\s+([a-z,\s]+?)\s+on\s+(?:table\s+)?([a-z_]+)\.([a-z_]+)\s+to\s+([a-z_]+)/gi)) {
    const [, verbs, schema, table, role] = m;
    const k = schema + '.' + table;
    (out[k] = out[k] || []).push({ verbs: verbs.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean), role: role.toLowerCase() });
  }
  return out;
}
export function viewsOf(sql) {
  const code = stripComments(sql);
  const out = {};
  for (const m of code.matchAll(/create\s+or\s+replace\s+view\s+public\.([a-z_]+)\s+with\s*\(\s*security_invoker\s*=\s*(true|false)\s*\)/gi)) {
    out[m[1]] = m[2].toLowerCase() === 'true';
  }
  return out;
}
export function rlsOf(sql) {
  const code = stripComments(sql);
  const on = [...code.matchAll(/alter\s+table\s+([a-z_]+)\.([a-z_]+)\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1] + '.' + m[2]);
  const pol = [...code.matchAll(/create\s+policy\s+([a-z_]+)\s+on\s+([a-z_]+)\.([a-z_]+)/gi)].map((m) => m[2] + '.' + m[3]);
  return { on: [...new Set(on)], policies: pol };
}

const NEEDED = ['select', 'insert', 'update', 'delete'];

/* ── self-test：わざと壊して赤になるかを先に見せる ───────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[warehouse-perms --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★窓の security_invoker を1本 落とすと赤（★命綱★＝落ちたら他人のデータが見える）', () => {
    const broken = SQL.replace(/(create or replace view public\.pay_receipts with \(security_invoker = )true/i, '$1false');
    if (broken === SQL) throw new Error('壊せていない＝この自己確認が空振り');
    const v = viewsOf(broken);
    if (v.pay_receipts !== false) throw new Error('落としたのに読み取れていない');
    if (Object.values(v).every(Boolean)) throw new Error('★落ちた窓を見逃している★');
  });

  S('★窓の with (...) ごと消すと赤（既定は false＝いちばん危ない形）', () => {
    const broken = SQL.replace(/ with \(security_invoker = true\)/i, '');
    const v = viewsOf(broken);
    if (Object.keys(v).length === Object.keys(viewsOf(SQL)).length) throw new Error('★消えた窓を見逃している★');
  });

  S('★実の棚(kyuyo.*)の grant を消すと赤（窓だけ許して棚を忘れる形＝Timeallyの穴）', () => {
    const broken = SQL.replace(/grant select, insert, update, delete on kyuyo\.pay_receipts to authenticated;/i, '');
    if (broken === SQL) throw new Error('壊せていない＝この自己確認が空振り');
    const g = grantsOf(broken);
    if (g['kyuyo.pay_receipts']) throw new Error('★消した棚の権限を、在ることにしている★');
  });

  S('★RLS を1つ切ると赤', () => {
    const broken = SQL.replace(/alter table kyuyo\.pay_receipts enable row level security;/i, '');
    const r = rlsOf(broken);
    if (r.on.indexOf('kyuyo.pay_receipts') >= 0) throw new Error('★切れたRLSを見逃している★');
  });

  S('★棚を1つ増やして権限を忘れたら赤（表と食い違う）', () => {
    const fake = tablesUsedBy(['seikyu/js/seikyu-store.js'], ROOT).concat(['pay_secret_new']);
    let caught = null;
    try { eqSet(fake, TABLES.map((t) => t.name), '叩く棚'); } catch (e) { caught = e; }
    if (!caught) throw new Error('★表に無い棚を通した★');
    if (!/pay_secret_new/.test(caught.message)) throw new Error('どの棚が余分か言っていない: ' + caught.message);
  });

  S('★コードから棚を拾えている（0本なら何も見ていない）', () => {
    const t = tablesUsedBy(SCANNED, ROOT);
    if (!t.length) throw new Error('.from(...) を1つも拾えていない');
    if (t.indexOf('pay_invoices') < 0) throw new Error('いちばん基本の棚を拾えていない');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書が触る棚の権限]');

const used = tablesUsedBy(SCANNED, ROOT);
const G = grantsOf(SQL), V = viewsOf(SQL), R = rlsOf(SQL);

T('★画面が叩く棚は、この8つで全部（1つ増えたら赤）', () => {
  ok(used.length > 0, '.from(...) を1つも拾えていない＝何も見ていない');
  eqSet(used, TABLES.map((t) => t.name), '画面が叩く棚と、この検査の表');
  eq(TABLES.length, 8, '表の本数');
});

T('★この repo が定義している棚は、棚と窓の両方に権限が在る（窓だけにしない）', () => {
  for (const t of TABLES.filter((x) => x.defined)) {
    const shelf = G[t.room + '.' + t.name];
    const window_ = G['public.' + t.name];
    ok(shelf, '★実の棚 ' + t.room + '.' + t.name + ' に grant が無い（窓だけ許している）★');
    ok(window_, '窓 public.' + t.name + ' に grant が無い');
    for (const v of NEEDED) {
      ok(shelf.some((g) => g.role === 'authenticated' && g.verbs.indexOf(v) >= 0), t.room + '.' + t.name + ' に ' + v + ' が無い');
      ok(window_.some((g) => g.role === 'authenticated' && g.verbs.indexOf(v) >= 0), 'public.' + t.name + ' に ' + v + ' が無い');
    }
  }
});

T('★窓は security_invoker = true（★命綱★・false だと他人のデータが見える）', () => {
  const defined = TABLES.filter((x) => x.defined);
  eq(Object.keys(V).length, defined.length, '窓の数');
  for (const t of defined) eq(V[t.name], true, 'public.' + t.name + ' の security_invoker');
});

T('★RLS が有効で、決まりが1本ずつ在る', () => {
  for (const t of TABLES.filter((x) => x.defined)) {
    ok(R.on.indexOf(t.room + '.' + t.name) >= 0, t.name + ' の RLS が有効になっていない');
    ok(R.policies.indexOf(t.room + '.' + t.name) >= 0, t.name + ' に決まりが無い');
  }
});

T('★この repo に定義が無い6つは「静的には見ていない」と分かる形で残っている', () => {
  const outside = TABLES.filter((x) => !x.defined);
  eq(outside.length, 6, 'この repo の外に在る棚の数');
  for (const t of outside) {
    ok(!G[t.room + '.' + t.name], t.name + ' は この repo の SQL に無いはずなのに grant が在る（表が古い）');
    ok(t.rls === true, t.name + ' の実測（RLS）が表に無い');
    ok(t.invoker === true, t.name + ' の実測（security_invoker）が表に無い');
  }
  ok(MEASURED_AT, 'いつ数えたかが書かれていない');
  ok(ANON_NOTE.length > 40, 'anon の権限について、なぜ安全かが書かれていない');
});

/* 表を毎回 出す＝「数えた」を報告に貼れる形にする */
console.log('\n     ── 請求書が触る棚（' + MEASURED_AT + ' 実測）──');
for (const t of TABLES) {
  console.log('     ' + (t.defined ? '[この repo]' : '[別の部屋]') + ' ' + t.room + '.' + t.name
    + '  RLS=' + (t.rls ? 'on' : '★off★') + ' 決まり' + t.policies + '本'
    + ' 窓のsecurity_invoker=' + (t.invoker ? 'true' : '★false★') + '  ' + t.note);
}
console.log('     anon について: ' + ANON_NOTE);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
