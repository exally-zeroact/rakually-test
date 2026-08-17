/* seikyu-clean-junk.mjs — ★テスト線の倉庫だけ★ 請求書の「検証ゴミ」を片づける手道具
 *   node scripts/seikyu-clean-junk.mjs show    ... 今 入っている請求書を出すだけ（1行も書かない）
 *   node scripts/seikyu-clean-junk.mjs clean   ... ★ゴミと見分けた行だけ★ 片づける
 *
 * ★「消す」で全部が消える訳ではない（2026-08-11 実際に走らせて分かった）★
 *   倉庫は「一度でも発行した紙」を消させない。台帳なので、それが正しい。
 *     ・下書きのゴミ  → 消す
 *     ・発行済みのゴミ → 取り消し（void）にする
 *     ・取り消し済み  → もう片づいている（何もしない）
 *   取り消し済みは 一覧の既定「出した物」に出ないので、人の目からは消える。
 *
 * ★安全★（1つでも欠けたら中止する）
 *   ・接続先は【このリポジトリの js/supa-config.js】から取る（直書きしない）。
 *     直書きだと、本番のスナップショットから作ったリポジトリで走らせた時に本番倉庫を触る。
 *   ・env が 'test' でなければ中止する＝本番リポジトリでは絶対に走らない。
 *   ・消すのは ★下の isJunk に当てはまる行だけ★。年月-連番（202609-001 など）は1つも当てはまらない。
 *   ・消す前に「これから消す行」を全部 印字する（黙って消さない）。
 *   ・消した後、本物の行の ★金額が1円も動いていない★ ことを数えて出す。
 *
 * ログインは live-seed.mjs と同じ置き場所の資格情報ファイルを使う（コードに書かない）。
 *   %TEMP%\exally-e0-test-cred.json  … { "email": "...", "password": "..." }
 *   別のアカウントで見たい時は EXALLY_TEST_CRED でファイルを差し替える。
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { repoSupa } from '../tests/repo-supa.mjs';

const { url: URL, key: ANON, ref } = repoSupa();
console.log('接続先(このリポジトリの js/supa-config.js 由来): ' + URL);

/* ★本番リポジトリでは走らせない★ env の1行で見分ける（倉庫のIDを道具に書き写さない） */
const cfg = fs.readFileSync(path.join(process.cwd(), 'js', 'supa-config.js'), 'utf8');
if (!/env:\s*'test'/.test(cfg)) {
  console.error('中止: このリポジトリは テスト線ではありません（js/supa-config.js に env:\'test\' が無い）');
  process.exit(2);
}

const CRED_FILE = process.env.EXALLY_TEST_CRED || path.join(process.env.TEMP || '/tmp', 'exally-e0-test-cred.json');
if (!fs.existsSync(CRED_FILE)) {
  console.error('中止: 資格情報ファイルがありません: ' + CRED_FILE);
  console.error('  { "email": "...", "password": "..." } を置いてから走らせてください。');
  process.exit(2);
}
const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));

/* ★検証ゴミの見分け方★
   ・番号が「年月-連番」（202609-001）＝ 本物。★何があっても消さない★
   ・番号が「LIVE-」で始まる      … 実配信の動作確認で作った物
   ・番号が英数字の羅列（採番されていない）… 画面の総当たりで出来た物
   ・番号が付いていない残骸 */
const REAL_NO = /^\d{6}-\d{3,}$/;
function isJunk(v) {
  const no = String(v.no || '');
  if (REAL_NO.test(no)) return false;                 // 本物の番号は絶対に消さない
  if (/^LIVE-/i.test(no)) return true;
  if (/^[A-Z0-9]{6,}-/.test(no)) return true;
  if (!no) return true;
  return false;
}

const mode = process.argv[2] || 'show';
const sb = createClient(URL, ANON);
const { data: auth, error } = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
if (error || !auth.session) { console.error('ログインできません: ' + (error && error.message)); process.exit(2); }
console.log('ログイン: ' + cred.email + ' / 倉庫: ' + ref + '\n');

const r = await sb.from('pay_invoices')
  .select('id,doc_type,no,status,issue_ymd,totals,deleted_at')
  .order('issue_ymd', { ascending: false });
if (r.error) { console.error('読めません: ' + r.error.message); process.exit(2); }
const rows = r.data || [];

const yen = (n) => (n === null || n === undefined ? '（取れず）' : Number(n).toLocaleString('ja-JP'));
const grand = (v) => (v.totals && v.totals.grandTotal);
const line = (v) => '  ' + (isJunk(v) ? '✗ゴミ' : '○本物') + ' ' + String(v.no || '（番号なし）').padEnd(18)
  + ' ' + String(v.status).padEnd(7) + ' ' + (v.issue_ymd || '----------')
  + ' ' + yen(grand(v)).padStart(10) + ' 円' + (v.deleted_at ? '  ※削除済' : '');

console.log('今 入っている請求書 ' + rows.length + '件');
rows.forEach((v) => console.log(line(v)));

const junk = rows.filter(isJunk);
const real = rows.filter((v) => !isJunk(v));
console.log('\n  本物 ' + real.length + '件 / ゴミ ' + junk.length + '件');

if (mode !== 'clean') { console.log('\n（show のみ。1行も書いていません）'); process.exit(0); }
if (!junk.length) { console.log('\n消す物はありません。'); process.exit(0); }

console.log('\n★これから消す行★');
junk.forEach((v) => console.log('  ' + v.id + '  ' + (v.no || '（番号なし）')));

/* ★発行済みは「消す」ができない（倉庫が断る）★
   2026-08-11 に実際に走らせて分かった。発行した紙は出してしまった物なので、
   倉庫の側が delete を止めている（＝正しい）。
   だからゴミでも、発行済みは ★取り消し（void）★ にする。
   一覧の既定は「出した物」＝取り消しを出さないので、これで目の前からは消える。 */
let del = 0, voided = 0, already = 0;
const failed = [];
for (const v of junk) {
  /* ★取り消し済みは もう片づいている★
     倉庫は「一度でも発行した紙」を消させない（台帳として正しい）。
     取り消しにしてあれば 一覧の既定「出した物」には出ないので、これ以上やる事は無い。
     ここで delete を試すと必ず断られ、片づいているのに赤く見える。 */
  if (String(v.status) === 'void') { already++; continue; }
  if (String(v.status) === 'issued') {
    const u = await sb.from('pay_invoices')
      .update({ status: 'void', voided_at: new Date().toISOString() })
      .eq('id', v.id);
    if (u.error) { console.error('  取り消せません ' + v.id + ': ' + u.error.message); failed.push(v.no); continue; }
    console.log('  取り消し（発行済みは消せない）: ' + v.no);
    voided++;
    continue;
  }
  const d = await sb.from('pay_invoices').delete().eq('id', v.id);
  if (d.error) { console.error('  消せません ' + v.id + ': ' + d.error.message); failed.push(v.no); continue; }
  del++;
}
console.log('\n消した: ' + del + '件 / 取り消した: ' + voided + '件 / もう片づいていた: ' + already + '件');

/* ★本物が1円も動いていないか数える（消しついでに本物を壊していないか） */
const after = await sb.from('pay_invoices').select('id,no,status,totals').order('issue_ymd', { ascending: false });
const left = after.data || [];
console.log('残り ' + left.length + '件');
left.forEach((v) => console.log('  ' + String(v.no).padEnd(18) + ' ' + String(v.status).padEnd(7) + ' ' + yen(grand(v)).padStart(10) + ' 円'));

let moved = 0;
for (const b of real) {
  const a = left.find((x) => x.id === b.id);
  if (!a) { console.error('★本物が消えている: ' + b.no); moved++; continue; }
  if (grand(a) !== grand(b)) { console.error('★本物の金額が動いた: ' + b.no + ' ' + yen(grand(b)) + ' → ' + yen(grand(a))); moved++; }
}
console.log('本物 ' + real.length + '件の金額が動いた数: ' + moved);

/* 残ったゴミ＝取り消しにも出来なかった物だけを赤にする。
   取り消し済みは「一覧の既定（出した物）」に出ないので、片づいた扱いにする。 */
const bad = left.filter((v) => isJunk(v) && String(v.status) !== 'void');
if (bad.length) { console.error('★まだゴミが残っています: ' + bad.map((v) => v.no).join(' / ')); process.exit(1); }
const hidden = left.filter((v) => isJunk(v) && String(v.status) === 'void');
if (hidden.length) {
  console.log('取り消し済み＝一覧の既定「出した物」には出ない（倉庫は消させない＝台帳として正しい）:');
  hidden.forEach((v) => console.log('  ' + v.no));
}
if (failed.length) { console.error('★手が付けられなかった: ' + failed.join(' / ')); process.exit(1); }
if (moved) process.exit(1);
console.log('\n片づきました。');
