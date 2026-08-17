/* dbtest-seed.mjs — ★DB-test 専用★ exally-staging のスモーク/実UI確認の下ごしらえ・後片付け
 *   node tests/dbtest-seed.mjs seed    ... 事業/従業員/締め方 を入れる(取引先と台帳は入れない=UIで入れて往復を確かめるため)
 *   node tests/dbtest-seed.mjs clean   ... このアカウントの Exally 側データを全部消す
 *   node tests/dbtest-seed.mjs show    ... 今の中身を出すだけ(書かない)
 *
 * ★安全★
 *   ・向き先は DB-test(khawdrnvssdenumbiwfg)に固定。**本番倉庫(tnfwipbgfgjaymlszeid)は絶対に触らない**。
 *   ・アカウントは test@test.com に固定。それ以外では何もせず中止する。
 *   ・本番用の tests/live-roundtrip.mjs / live-seed.mjs とは別ファイル(取り違え防止)。
 */
import { createClient } from '@supabase/supabase-js';

// ★DB-test 固定（本番倉庫と1文字も被らないことを起動時に確認する）
const URL = 'https://khawdrnvssdenumbiwfg.supabase.co';
const KEY = 'sb_publishable_UrRIobyVFbaJI_85RBxBOA_GZ4OUxPm';
const EMAIL = 'test@test.com';
const PW = 'test1234';
const PROD_REF = 'tnfwipbgfgjaymlszeid';           // 本番倉庫。ここに向いていたら即中止

if (URL.includes(PROD_REF)) { console.error('中止: 本番倉庫を指しています'); process.exit(2); }

const mode = process.argv[2] || 'show';
const sb = createClient(URL, KEY);
const { data: auth, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PW });
if (error || !auth.session) { console.error('ログインできません: ' + (error && error.message)); process.exit(2); }
if (auth.user.email !== EMAIL) { console.error('中止: 想定外のアカウント ' + auth.user.email); process.exit(2); }
const uid = auth.user.id;
console.log('DB-test / ' + EMAIL + ' (uid=' + uid + ')\n');

const TABLES = ['pay_ledger', 'pay_partners', 'pay_employees', 'pay_companies', 'pay_org'];

async function show() {
  const emps = (await sb.from('pay_employees').select('id,sort,data').order('sort')).data || [];
  const co = (await sb.from('pay_companies').select('data').maybeSingle()).data;
  const org = (await sb.from('pay_org').select('data').maybeSingle()).data;
  const pts = (await sb.from('pay_partners').select('id,data').is('deleted_at', null)).data || [];
  const lg = (await sb.from('pay_ledger').select('id,employee_id,ymd,data').is('deleted_at', null).order('ymd')).data || [];
  console.log('  従業員   ' + emps.length + '人 ' + emps.map(e => (e.data && e.data.name) || e.id).join(' / '));
  console.log('  締め方   ' + JSON.stringify(co && co.data && co.data.company ? { shimeMethod: co.data.company.shimeMethod, shimeN: co.data.company.shimeN } : null));
  console.log('  事業     ' + JSON.stringify(org && org.data ? org.data.businesses : null));
  console.log('  取引先   ' + pts.length + '件 ' + pts.map(p => (p.data && p.data.name) || p.id).join(' / '));
  console.log('  台帳     ' + lg.length + '件');
  lg.forEach(r => console.log('    - ' + r.ymd + ' ' + r.employee_id + ' ' + JSON.stringify(r.data)));
  return { emps, lg, pts };
}

async function clean() {
  for (const t of TABLES) {
    const { error } = await sb.from(t).delete().eq('account_id', uid);
    console.log('  clean ' + t.padEnd(16) + (error ? '✗ ' + error.message : 'ok'));
  }
}

if (mode === 'show') { await show(); process.exit(0); }
if (mode === 'clean') { await clean(); console.log('\n片付け完了'); process.exit(0); }

/* ═══ seed ═══
 * ★取引先と台帳は「入れない」★ = スモークで実UIから入れて、DB-testとの往復が生きているか確かめるため。
 * ここで入れるのは、台帳を使うのに最低限いる「人」と「事業」と「締め方」だけ。
 */
await clean();
const now = new Date().toISOString();
const EMPS = [
  { id: 'e_t1', name: '山田 太郎', business: '空調', employmentType: '従業員' },
  { id: 'e_t2', name: '鈴木 花子', business: '代行', employmentType: '業務委託' }
];
let ng = 0;
const put = async (t, rows) => {
  const { error } = await sb.from(t).upsert(rows);
  if (error) { ng++; console.log('  ✗ ' + t + ': ' + error.message); } else console.log('  ok ' + t + ' ' + rows.length + '件');
};

// 締め方=10日締め(1〜10/11〜20/21〜末)。★Kyuallyの会社設定が唯一の源＝Exallyは読むだけ
await put('pay_companies', [{ account_id: uid, data: { company: { name: '株式会社ゼロアクト', shimeMethod: 'ten', shimeN: '10' } }, updated_at: now }]);
await put('pay_org', [{ account_id: uid, data: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000', invoiceNo: 'T1234567890123', businesses: ['代行', '空調'] }, updated_at: now }]);
await put('pay_employees', EMPS.map((e, i) => ({
  id: e.id, account_id: uid, sort: i,
  data: { id: e.id, name: e.name, birthYmd: '1985-04-01', payType: '月給', base: '250000', business: e.business, employmentType: e.employmentType },
  updated_at: now
})));

console.log('\n入れた物（取引先と台帳は空のまま＝スモークで実UIから入れる）');
await show();
process.exit(ng ? 1 : 0);
