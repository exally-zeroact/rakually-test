/* rls-tanin.mjs — ★他人のデータが 見えない・書けない★（渡す前の いちばん 大事な 見張り）
 * ==============================================================================
 * ★なぜ（司さん 2026-09-07「やれ」）★
 *   「知り合いに 使ってもらえる レベルか」と 聞かれ、私は こう答えた：
 *     ★他人のデータが 混ざらない事を 私は 一度も 測っていない★
 *     作りは RLS（account_id = ログインした人）だが、
 *     ★別アカウントで 実際に 叩いて 確かめた 見張りが 1本も 無かった★。
 *   人の 給料が 他人に 見えるのは ★取り返しが つかない★ので、ここは 毎回 測る。
 *
 * ★ここで 見る事★
 *   ① Bの 鍵で Aの 棚が ★1件も 読めない★（9棚）
 *   ② 鍵なし(anon)でも ★1件も 読めない★（9棚）
 *   ③ Bは Aの 行を ★書き換えられない★
 *   ④ Bは Aの 行を ★消せない★
 *   ⑤ ★空振りしていない★＝Aなら 読めるし 書ける
 *      （⑤が 無いと「棚が 空／欄名を 間違えて 弾かれた」を「守れている」と 読み違える。
 *        ★2026-09-07 に 実際に 踏んだ★＝存在しない欄 name に 書いて 400 が返り、
 *        私は それを 一瞬「拒まれた」と 読んだ。本当の 欄は data だった。）
 *
 * ★安全★
 *   ・★テスト線の repo でだけ 走る★（本番では repoEnv で 判って 抜ける）。
 *   ・Aの 行は ★書いたら すぐ 元に戻す★（元の値を 覚えてから 書く）。
 *   ・鍵は ブラウザに 配られている 公開鍵。★値は 画面に 出さない★。
 *
 * 使い方: node kyuyo/tests/rls-tanin.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..').split(path.sep).join('/');
const SELF = process.argv.includes('--self-test');

/* ── ★判定は 純関数に 出す★＝作り物を 通して 自己確認できる ── */
export function judge(a, b, anon) {
  /* a … Aで 読めた件数（null=読めない）／b … Bで／anon … 鍵なしで */
  if (a === null) return { mark: '🟡', ji: 'Aが 読めない（測れていない）' };
  if (a === 0) return { mark: '🟡', ji: '棚が 空＝この棚は 測れていない' };
  if (b > 0) return { mark: '🔴', ji: '★他人(B)から ' + b + '件 見えた★' };
  if (anon > 0) return { mark: '🔴', ji: '★鍵なしから ' + anon + '件 見えた★' };
  return { mark: '🟢', ji: 'Aだけ ' + a + '件（B・鍵なしは 0件）' };
}
export function judgeWrite(aKaketa, bKaketa) {
  if (aKaketa !== 1) return { mark: '🟡', ji: '★Aでも 書けない＝空振り（欄名 違いかも）★' };
  if (bKaketa > 0) return { mark: '🔴', ji: '★他人(B)が ' + bKaketa + '行 書けた★' };
  return { mark: '🟢', ji: 'Aは 書ける／Bは 0行' };
}

if (SELF) {
  console.log('\n[rls-tanin --self-test] わざと 壊したら 赤に なるか');
  let kowashita = 0, aka = 0;
  const shiken = [
    ['他人から 1件でも 見えたら 赤', judge(5, 1, 0).mark === '🔴'],
    ['鍵なしから 1件でも 見えたら 赤', judge(5, 0, 1).mark === '🔴'],
    ['他人が 1行でも 書けたら 赤', judgeWrite(1, 1).mark === '🔴'],
    ['★Aで 読めない時は 緑に しない★', judge(null, 0, 0).mark === '🟡'],
    ['★棚が 空の時は 緑に しない★（空を「守れている」と 読まない）', judge(0, 0, 0).mark === '🟡'],
    ['★Aでも 書けない時は 緑に しない★（欄名 違いを「拒まれた」と 読まない）', judgeWrite(0, 0).mark === '🟡'],
    ['ちゃんと 分かれていれば 緑', judge(5, 0, 0).mark === '🟢' && judgeWrite(1, 0).mark === '🟢'],
  ];
  for (const [na, ok] of shiken) {
    kowashita++; if (ok) aka++;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + na);
  }
  console.log('  ★見た ' + kowashita + '件／思ったとおり ' + aka + '件★');
  if (aka !== kowashita) { console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n' + kowashita + ' passed, 0 failed');
  process.exit(0);
}

/* ── ここから 実測 ── */
const cfg = fs.readFileSync(ROOT + '/js/supa-config.js', 'utf8');
const URL_ = (cfg.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
const KEY = (cfg.match(/key:\s*'([^']+)'/) || [])[1];
if (!URL_ || !KEY) { console.log('★倉庫の 向き先か 鍵が 読めない＝未測定★'); process.exit(2); }
/* ★倉庫の 名前を ここに 書かない★（2026-09-07 見張りに 正しく 赤に された）
   「向き先を 持っているのは js/supa-config.js だけ」という 約束が 在る
   （tests/no-hardcoded-supa.test.mjs）。★テスト線か 本番かは 既に 在る 道具に 聞く★。 */
const { repoEnv } = await import('file://' + ROOT + '/scripts/repo-env.mjs');
const ENV = repoEnv(ROOT);
if (ENV !== 'test') {
  /* ★本番の repo では 走らせない★＝試験用の 人が 本番の 倉庫には 居ない。
     ★黙って 緑に しない★＝ここでは 測れないと 字で 言ってから 抜ける。 */
  console.log('\n[rls-tanin] ★ここは ' + (ENV || '読めない') + ' の repo です＝測れません（テスト線で 測っています）★');
  process.exit(0);
}

const A = { email: 'test@test.com', pass: 'test1234' };   /* 中身を 持っている人 */
const B = { email: 'test-b@test.com', pass: 'test1234' }; /* 何も 持っていない人 */
/* ★給与だけでなく 請求書の 棚も 見る★（同じ ログインで 両方 使う 1つの器なので、
   片方だけ 守れていても 意味が ない。2026-09-07 実測＝どちらも 分かれていた） */
const TANA = ['pay_companies', 'pay_employees', 'pay_payslips', 'pay_ledger',
  'pay_meisai_pub', 'pay_meisai_docs', 'pay_nencho_decl', 'pay_emp_profile', 'payslip_batches',
  'pay_invoices', 'pay_receipts'];

async function login(u) {
  const r = await fetch(URL_ + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.pass }),
  });
  const j = await r.json().catch(() => ({}));
  return j.access_token || null;
}
async function yomu(tana, tok) {
  const h = { apikey: KEY };
  if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await fetch(URL_ + '/rest/v1/' + tana + '?select=*&limit=50', { headers: h });
  const t = await r.text();
  try { const j = JSON.parse(t); if (Array.isArray(j)) return j.length; } catch (e) { /* 表でない */ }
  return null;
}

console.log('\n[rls-tanin] 他人のデータが 見えない・書けないか（テスト線の 倉庫）');
let ng = 0, mita = 0;
const tokA = await login(A);
const tokB = await login(B);
if (!tokA || !tokB) {
  console.log('★A/B のどちらかで 入れませんでした＝未測定（0件・異常なし にしません）★'
    + ' A=' + (tokA ? 'ok' : 'ng') + ' B=' + (tokB ? 'ok' : 'ng'));
  process.exit(2);
}
for (const t of TANA) {
  const a = await yomu(t, tokA), b = await yomu(t, tokB), c = await yomu(t, null);
  const r = judge(a, b, c);
  if (r.mark === '🔴') ng++;
  if (r.mark === '🟢') mita++;
  console.log('   ' + r.mark + ' ' + t.padEnd(18) + ' ' + r.ji);
}
/* ★書ける／消せるか★ */
const rows = await (await fetch(URL_ + '/rest/v1/pay_employees?select=*&limit=1',
  { headers: { apikey: KEY, Authorization: 'Bearer ' + tokA } })).json().catch(() => []);
const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
if (!row) { console.log('   🟡 書ける/消せるは 測れず（Aに 従業員の 行が 無い）'); ng++; }
else {
  const moto = row.data;
  const kaku = async (tok, body) => {
    const w = await fetch(URL_ + '/rest/v1/pay_employees?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: 'Bearer ' + tok, 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    const t = await w.text();
    try { const j = JSON.parse(t); if (Array.isArray(j)) return j.length; } catch (e) { /* */ }
    return null;
  };
  const shirushi = Object.assign({}, moto || {}, { __rlsTanin: 1 });
  const aN = await kaku(tokA, { data: shirushi });
  if (aN === 1) await kaku(tokA, { data: moto });          /* ★すぐ 元に戻す★ */
  const bN = await kaku(tokB, { data: shirushi });
  if (bN > 0) await kaku(tokA, { data: moto });             /* 書かれたら 戻す */
  const r2 = judgeWrite(aN, bN);
  if (r2.mark !== '🟢') ng++;
  console.log('   ' + r2.mark + ' ' + '書き換え'.padEnd(16) + '  ' + r2.ji);
  const d = await fetch(URL_ + '/rest/v1/pay_employees?id=eq.' + encodeURIComponent(row.id),
    { method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + tokB, Prefer: 'return=representation' } });
  const dt = await d.text(); let dn = null;
  try { const j = JSON.parse(dt); if (Array.isArray(j)) dn = j.length; } catch (e) { /* */ }
  const keseta = (dn === 0 || d.status === 401 || d.status === 403);
  if (!keseta) ng++;
  console.log('   ' + (keseta ? '🟢' : '🔴') + ' ' + '消す'.padEnd(18) + '  他人(B)が 消せた行 ' + (dn === null ? d.status : dn));
  /* ★元に戻ったか 目で 確かめる★（戻し忘れたまま 緑に しない） */
  const ato = await (await fetch(URL_ + '/rest/v1/pay_employees?select=data&id=eq.' + encodeURIComponent(row.id),
    { headers: { apikey: KEY, Authorization: 'Bearer ' + tokA } })).json().catch(() => []);
  const nokori = Array.isArray(ato) && ato[0] && ato[0].data && ato[0].data.__rlsTanin;
  if (nokori) { ng++; console.log('   🔴 ★試験の 印が 残っている（戻せていない）★'); }
  else console.log('   🟢 試験の 印は 残っていない（元に戻した）');
}
console.log('\n  中身が 在って ちゃんと 分かれていた棚 … ' + mita + '個');
console.log('  ★赤 ' + ng + '件★');
process.exit(ng ? 1 : 0);
