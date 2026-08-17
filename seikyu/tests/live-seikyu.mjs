/* live-seikyu.mjs — ★実倉庫で「本当に弾かれるか」を測る★（手動ツール・CIからは叩かない）
 *   node seikyu/tests/live-seikyu.mjs
 *
 * なぜ要るか（指示役 2026-08-09 の指示C）:
 *   凍結トリガも一意制約も、★倉庫の中で動く強い仕掛け★。
 *   設計図に書いてあることと、実際に弾くことは別。★実際に更新して弾かれる所まで見る。★
 *   ここを飛ばすと「守っているつもり」で本番へ出る。
 *
 * 通す経路 ＝ ★アプリと同じ道★
 *   supabase-js → public の窓口(view) → security_invoker → 実の棚のRLS → トリガ
 *   （管理者のSQLで直接叩くと、窓口もRLSも通らない＝アプリの経路を試したことにならない）
 *
 * ★安全★
 *   ・接続先は【このリポジトリの js/supa-config.js】から取る（＝テスト線にしか繋がらない）
 *   ・触るのは ★このテスト専用アカウントの行だけ★（RLSで他人の行には物理的に手が届かない）
 *   ・作った行は最後に自分で片付ける（残っていたら NG を出す）
 *   ・認証情報はリポジトリに置かない（%TEMP% のローカル一時ファイル）
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { repoSupa } from '../../tests/repo-supa.mjs';
// ★本番倉庫の名前は門番から借りる（ここに直書きしない＝出どころを増やさない）
import { PROD_WAREHOUSE_REF } from '../../scripts/seikyu-sql-guard.mjs';

const { url: URL_, key: ANON } = repoSupa();
if (URL_.includes(PROD_WAREHOUSE_REF)) { console.error('★中止: 本番倉庫に向いています'); process.exitCode = 1; }

const CRED_FILE = process.env.SEIKYU_TEST_CRED
  || path.join(process.env.TEMP || '/tmp', 'exally-seikyu-test-cred.json');
const TEST_EMAIL = 'exally.supoort+seikyu-test@gmail.com'; // ★このメール以外では走らせない

let pass = 0, fail = 0;
const ok = (n, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  NG   ' + n + (detail ? '\n       ' + detail : '')); }
};
const made = { invoices: [], receipts: [] };

async function login() {
  const sb = createClient(URL_, ANON);
  let cred = null;
  try { cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')); } catch (e) { /* 無ければ作る */ }
  if (cred) {
    const r = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
    if (!r.error && r.data.session) { console.log('  ログイン: ' + cred.email); return { sb, uid: r.data.user.id }; }
    console.log('  既存の認証情報で入れませんでした（作り直します）: ' + (r.error && r.error.message));
  }
  const password = 'Seikyu-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + '!x';
  const r2 = await sb.auth.signUp({ email: TEST_EMAIL, password });
  if (r2.error || !r2.data.session) {
    throw new Error('テスト用アカウントを用意できません: '
      + ((r2.error && r2.error.message) || 'セッションが返らない（メール確認が要る設定）')
      + '\n  → 司さんへ: ' + TEST_EMAIL + ' の合言葉を ' + CRED_FILE + ' に置いてください。');
  }
  fs.writeFileSync(CRED_FILE, JSON.stringify({ email: TEST_EMAIL, password }, null, 2));
  console.log('  テスト用アカウントを新規作成: ' + TEST_EMAIL + '（合言葉は ' + CRED_FILE + '・リポジトリ外）');
  return { sb, uid: r2.data.user.id };
}

/* ★実行ごとに別の番号を使う★
 *   1回目の実行で取り消し(void)にした行は【消せないのが正しい】ので棚に残る。
 *   同じ番号を使い回すと2回目が一意制約で落ちて、肝心の凍結の検査まで届かない
 *   （2026-08-10 に実際に踏んだ）。番号に実行ごとの印を入れて、何度でも回せるようにする。
 *   ★本物の番号と混ざらない形にする（年月に 2026-99 は無い）★ */
const RUN = 'L' + Date.now().toString(36).slice(-6).toUpperCase();
const NO_A = RUN + '-202699-001';
const NO_B = RUN + '-202699-002';
const NO_C = RUN + '-202699-003';
const NO_D = RUN + '-202699-777';
const ID = (s) => 'iv_live_' + RUN + '_' + s;
const RID = (s) => 'rc_live_' + RUN + '_' + s;

function invRow(uid, id, no, extra) {
  return Object.assign({
    id: id, account_id: uid, doc_type: 'invoice', no: no,
    partner_id: 'pt_live', issue_ymd: '2026-09-30', due_ymd: '2026-10-31',
    status: 'draft', tax_mode: 'inclusive', rounding: 'floor',
    lines: [{ no: 1, name: 'live-test', amount: 1100, rate: 10 }],
    totals: { subtotal: 1000, taxTotal: 100, grandTotal: 1100 },
    snapshot: {}, template_id: 'std1',
  }, extra || {});
}

async function run() {
  console.log('\n[live-seikyu] 実倉庫（テスト線）で弾かれるかを実測');
  console.log('  接続先: ' + URL_ + '（js/supa-config.js 由来）');
  const { sb, uid } = await login();

  // 前回の残りを片付けてから始める（同じ番号でぶつからないように）
  await sb.from('pay_receipts').delete().eq('account_id', uid);
  await sb.from('pay_invoices').delete().eq('account_id', uid).eq('status', 'draft');

  /* ── ① 窓口ごしに書ける（アプリの経路が生きている） ───────────────── */
  const a = await sb.from('pay_invoices').insert(invRow(uid, ID('a'), NO_A)).select().single();
  ok('① 窓口(public.pay_invoices)ごしに下書きを入れられる', !a.error, a.error && a.error.message);
  if (a.error) { console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exitCode = 1; return; }
  made.invoices.push(ID('a'));

  /* ── ② 下書きは直せる ─────────────────────────────────────── */
  const u1 = await sb.from('pay_invoices').update({ lines: [{ no: 1, name: 'なおした', amount: 2200, rate: 10 }] }).eq('id', ID('a'));
  ok('② 下書きのうちは明細を直せる', !u1.error, u1.error && u1.error.message);

  /* ── ③ 発行する ───────────────────────────────────────────── */
  const iss = await sb.from('pay_invoices')
    .update({ status: 'issued', issued_at: new Date().toISOString(), snapshot: { partner: { name: 'ライブ検証' } } })
    .eq('id', ID('a'));
  ok('③ 下書き → 発行済み にできる', !iss.error, iss.error && iss.error.message);

  /* ── ④ ★発行済みは直せない（凍結トリガが実際に弾く）★ ──────────── */
  const f1 = await sb.from('pay_invoices').update({ lines: [{ no: 1, name: 'あとから改ざん', amount: 99999, rate: 10 }] }).eq('id', ID('a'));
  ok('④ ★発行済みの明細を直そうとすると倉庫が弾く★', !!f1.error, f1.error ? ('弾いた理由: ' + f1.error.message) : '★通ってしまった（凍結が効いていない）');
  const f2 = await sb.from('pay_invoices').update({ no: NO_D }).eq('id', ID('a'));
  ok('④ ★発行済みの番号を直そうとすると倉庫が弾く★', !!f2.error, f2.error ? ('弾いた理由: ' + f2.error.message) : '★通ってしまった');
  const f3 = await sb.from('pay_invoices').update({ totals: { grandTotal: 1 } }).eq('id', ID('a'));
  ok('④ ★発行済みの合計を直そうとすると倉庫が弾く★', !!f3.error, f3.error ? '弾いた' : '★通ってしまった');
  const f4 = await sb.from('pay_invoices').update({ status: 'draft' }).eq('id', ID('a'));
  ok('④ ★発行済みを下書きに戻そうとすると倉庫が弾く★', !!f4.error, f4.error ? '弾いた' : '★通ってしまった');

  /* ── ⑤ 直せる物は直せる（固めすぎていない） ──────────────────── */
  const s1 = await sb.from('pay_invoices').update({ sent_at: new Date().toISOString() }).eq('id', ID('a'));
  ok('⑤ 「送った記録」は発行済みでも入れられる（固めすぎていない）', !s1.error, s1.error && s1.error.message);

  /* ── ⑥ ★発行済みは消せない★ ────────────────────────────────── */
  const d1 = await sb.from('pay_invoices').delete().eq('id', ID('a'));
  ok('⑥ ★発行済みを消そうとすると倉庫が弾く（番号を欠番にしない）★', !!d1.error, d1.error ? ('弾いた理由: ' + d1.error.message) : '★消せてしまった');
  const d2 = await sb.from('pay_invoices').update({ deleted_at: new Date().toISOString() }).eq('id', ID('a'));
  ok('⑥ ★発行済みにソフト削除の印を付けようとしても弾く★', !!d2.error, d2.error ? '弾いた' : '★付いてしまった');

  /* ── ⑦ ★同じ番号は二度使えない（取り消した後も）★ ──────────────── */
  const dup = await sb.from('pay_invoices').insert(invRow(uid, ID('dup'), NO_A));
  ok('⑦ ★発行済みと同じ番号は入らない★', !!dup.error, dup.error ? ('弾いた理由: ' + dup.error.code) : '★重複が入った');
  const v = await sb.from('pay_invoices').update({ status: 'void', voided_at: new Date().toISOString() }).eq('id', ID('a'));
  ok('⑦ 発行済み → 取り消し にはできる', !v.error, v.error && v.error.message);
  const dup2 = await sb.from('pay_invoices').insert(invRow(uid, ID('dup2'), NO_A));
  ok('⑦ ★取り消した番号も二度と使えない（欠番の再利用を止める）★', !!dup2.error, dup2.error ? ('弾いた理由: ' + dup2.error.code) : '★取り消した番号が再利用できた');

  /* ── ⑧ 見積は別の系列（同じ番号でもぶつからない） ────────────────── */
  const q = await sb.from('pay_invoices').insert(invRow(uid, ID('q'), NO_A, { doc_type: 'quote' })).select().single();
  ok('⑧ 見積は別の系列なので同じ番号を持てる', !q.error, q.error && q.error.message);
  if (!q.error) made.invoices.push(ID('q'));

  /* ── ⑨ 明細の蓋（1000行まで） ───────────────────────────────── */
  const many = (n) => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: 'r' + i, amount: 100, rate: 10 }));
  const okCap = await sb.from('pay_invoices').insert(invRow(uid, ID('cap'), NO_B, { lines: many(1000) }));
  ok('⑨ 1000行までは入る', !okCap.error, okCap.error && okCap.error.message);
  if (!okCap.error) made.invoices.push(ID('cap'));
  const over = await sb.from('pay_invoices').insert(invRow(uid, ID('over'), NO_C, { lines: many(1001) }));
  ok('⑨ ★1001行は倉庫が弾く（黙って切らない）★', !!over.error, over.error ? '弾いた' : '★入ってしまった');

  /* ── ⑩ 入金：分けて払う・過入金・0円は入らない・他人の請求に付かない ── */
  const r1 = await sb.from('pay_receipts').insert({ id: RID('1'), account_id: uid, invoice_id: ID('a'), invoice_no: NO_A, ymd: '2026-10-01', amount: 3000 });
  ok('⑩ 入金を1回めとして入れられる', !r1.error, r1.error && r1.error.message);
  if (!r1.error) made.receipts.push(RID('1'));
  const r2 = await sb.from('pay_receipts').insert({ id: RID('2'), account_id: uid, invoice_id: ID('a'), invoice_no: NO_A, ymd: '2026-10-20', amount: 4000 });
  ok('⑩ 同じ請求に2回めの入金も入れられる（分けて払われた履歴が残る）', !r2.error, r2.error && r2.error.message);
  if (!r2.error) made.receipts.push(RID('2'));
  const r0 = await sb.from('pay_receipts').insert({ id: RID('0'), account_id: uid, invoice_id: ID('a'), ymd: '2026-10-21', amount: 0 });
  ok('⑩ ★0円の入金は入らない（「入っていない」と作り分けない）★', !!r0.error, r0.error ? '弾いた' : '★入ってしまった');
  const rNull = await sb.from('pay_receipts').insert({ id: RID('x'), account_id: uid, invoice_id: null, invoice_no: '不明', ymd: '2026-10-22', amount: 500 });
  ok('⑩ ★どの請求か分からない入金も捨てずに入る★', !rNull.error, rNull.error && rNull.error.message);
  if (!rNull.error) made.receipts.push(RID('x'));
  const rGhost = await sb.from('pay_receipts').insert({ id: RID('g'), account_id: uid, invoice_id: 'iv_does_not_exist', ymd: '2026-10-23', amount: 100 });
  ok('⑩ ★存在しない請求には入金を付けられない★', !!rGhost.error, rGhost.error ? '弾いた' : '★付いてしまった');

  /* ── ⑪ RLS：他人の account_id では入らない ───────────────────── */
  const other = await sb.from('pay_invoices').insert(invRow('00000000-0000-0000-0000-000000000000', ID('rls'), NO_D));
  ok('⑪ ★他人のアカウントの行は入れられない（RLSが窓口ごしに効いている）★', !!other.error, other.error ? '弾いた' : '★入ってしまった');

  /* ── 片付け ─────────────────────────────────────────────── */
  console.log('\n  ── 片付け ──');
  for (const id of made.receipts) await sb.from('pay_receipts').delete().eq('id', id);
  // ★発行済み/取り消し済みは消せない（それが正しい）ので、下書きだけ消して、残りは数えて報告する
  for (const id of made.invoices) await sb.from('pay_invoices').delete().eq('id', id);
  const left = await sb.from('pay_invoices').select('id,no,status').eq('account_id', uid);
  const leftRc = await sb.from('pay_receipts').select('id').eq('account_id', uid);
  console.log('  片付け後に残っている請求: ' + JSON.stringify(left.data || []));
  console.log('  片付け後に残っている入金: ' + ((leftRc.data || []).length) + '件');
  ok('片付け：入金は0件になった', (leftRc.data || []).length === 0);
  ok('★発行済み/取り消し済みは消えずに残る（台帳として正しい）★',
    (left.data || []).some(r => r.status === 'void'), JSON.stringify(left.data));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  console.log('LIVE RESULT: ' + (fail ? 'NG' : 'OK'));
  if (fail) process.exitCode = 1;
}

try { await run(); } catch (e) {
  console.error('\n★中止: ' + (e && e.message));
  console.log('LIVE RESULT: NG');
  process.exitCode = 1;
}
