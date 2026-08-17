/* live-seed.mjs — 実機(実ブラウザ)確認のための下ごしらえ／後片付け
 *   node tests/live-seed.mjs seed     ... テスト専用アカウントに 会社/事業/取引先/台帳 を入れる
 *   node tests/live-seed.mjs clean    ... 入れた物を全部消す
 *
 * ★安全★ テスト専用アカウント以外では何もせず中止する(本物のデータを触らない)。
 *   従業員は「Kyually形の行」をこのアカウントに作る(本番アカウントには一切触れない)。
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs'; import path from 'path';

// ★接続先は【このリポジトリの js/supa-config.js】から取る(直書きをやめた・2026-08-01)★
//   直書きだと、本番からスナップショットを持ってきたテストリポジトリで走らせた時に
//   本番倉庫を触ってしまう。リポジトリ由来にすれば 本番repo→本番 / stagingのrepo→DB-test にしかならない。
import { repoSupa } from './repo-supa.mjs';
const { url: URL, key: ANON } = repoSupa();
console.log('接続先(このリポジトリの js/supa-config.js 由来): ' + URL);
const TEST_EMAIL = 'exally.supoort+e0test@gmail.com';
const CRED_FILE = process.env.EXALLY_TEST_CRED || path.join(process.env.TEMP || '/tmp', 'exally-e0-test-cred.json');

const mode = process.argv[2] || 'seed';
const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
const sb = createClient(URL, ANON);
const { data: auth, error } = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
if (error || !auth.session) { console.error('ログインできません: ' + (error && error.message)); process.exit(2); }
if (cred.email !== TEST_EMAIL) { console.error('中止: テスト専用アカウント以外では走らせません: ' + cred.email); process.exit(2); }
const uid = auth.user.id;
console.log('ログイン: ' + cred.email);

// 今月の日付を作る(実機で「今月」を押した時に中身が出るように)
const now = new Date();
const ym = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
const d = (n) => ym + '-' + ('0' + n).slice(-2);

const EMPS = [
  { id: 'e_seed1', name: '山田 太郎', business: '空調', employmentType: '従業員' },
  { id: 'e_seed2', name: '鈴木 花子', business: '代行', employmentType: '業務委託' },
  { id: 'e_seed3', name: '佐藤 次郎', business: '', employmentType: '従業員' }
];
const LEDGER = [
  { id: 'lg_seed1', employee_id: 'e_seed2', ymd: d(1), data: { uriage: 4200, business: '代行' } },
  { id: 'lg_seed2', employee_id: 'e_seed2', ymd: d(1), data: { uriage: 3800 } },
  { id: 'lg_seed3', employee_id: 'e_seed2', ymd: d(3), data: { uriage: 5100 } },
  { id: 'lg_seed4', employee_id: 'e_seed1', ymd: d(5), data: { uriage: 210000, business: '空調' } },
  { id: 'lg_seed5', employee_id: 'e_seed1', ymd: d(12), data: { uriage: 96000 } },
  { id: 'lg_seed6', employee_id: 'e_seed3', ymd: d(8), data: { uriage: 12000 } }
];
const PARTNERS = [
  { id: 'pt_seed1', sort: 0, data: { name: '○○建設株式会社', keisho: '御中', addr: '愛媛県松山市本町1-1', invoiceNo: 'T9876543210987' } },
  { id: 'pt_seed2', sort: 1, data: { name: '△△工務店', keisho: '御中', addr: '愛媛県今治市南町2-2', invoiceNo: '' } }
];

async function clean() {
  for (const t of ['pay_ledger', 'pay_partners', 'pay_employees', 'pay_org', 'pay_companies']) {
    const { error } = await sb.from(t).delete().eq('account_id', uid);
    console.log('  clean ' + t + (error ? ' ✗ ' + error.message : ' ok'));
  }
}

if (mode === 'clean') { await clean(); console.log('片付け完了'); process.exit(0); }

await clean();   // 前回の残りを消してから入れる(何度実行しても同じ状態)
const nowIso = new Date().toISOString();
let ng = 0;
const put = async (t, rows) => { const { error } = await sb.from(t).upsert(rows); if (error) { ng++; console.log('  ✗ ' + t + ': ' + error.message); } else console.log('  ok ' + t + ' ' + rows.length + '件'); };

await put('pay_org', [{ account_id: uid, data: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市○○町1-2-3', tel: '0898-00-0000', invoiceNo: 'T1234567890123', businesses: ['代行', '空調'] }, updated_at: nowIso }]);
await put('pay_employees', EMPS.map((e, i) => ({ id: e.id, account_id: uid, sort: i, data: { id: e.id, name: e.name, birthYmd: '1985-04-01', payType: '月給', base: '250000', business: e.business, employmentType: e.employmentType }, updated_at: nowIso })));
await put('pay_partners', PARTNERS.map(p => ({ ...p, account_id: uid, deleted_at: null, updated_at: nowIso })));
await put('pay_ledger', LEDGER.map(r => ({ ...r, account_id: uid, deleted_at: null, updated_at: nowIso })));

// 実機で確かめる正解を出しておく(画面の数字と突き合わせる)
const byBiz = {};
for (const r of LEDGER) {
  const emp = EMPS.find(e => e.id === r.employee_id);
  const biz = (r.data.business || (emp && emp.business) || '未分類');
  byBiz[biz] = (byBiz[biz] || 0) + r.data.uriage;
}
console.log('\n★実機の集計で出るべき数字(今月 ' + ym + ')★');
Object.entries(byBiz).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('   ' + k + ' : ¥' + v.toLocaleString('ja-JP')));
console.log('   合計 : ¥' + LEDGER.reduce((s, r) => s + r.data.uriage, 0).toLocaleString('ja-JP') + ' / ' + LEDGER.length + '件');
process.exit(ng ? 1 : 0);
