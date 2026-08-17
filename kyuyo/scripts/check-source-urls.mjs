/* check-source-urls.mjs — ★中央 statutory の出典URLが、まだ生きているか★
 *
 * なぜ必要か（2026-08-03 に判明）:
 *   出典と確認日は入っているのに、★URLを叩いたら404が2本あった★
 *     koyo:2025       .../koyouhoken_ryouritsu.html
 *     warimashi:2023  .../K060000-A5.pdf
 *   ＝「確認日だけ残って、辿れない」状態。誰も見ていなかった。
 *   官公庁のページは年度替わりでURLが動く。値が正しくても、
 *   ★出典が辿れなければ「なぜその金額か」を客や社労士に示せない＝provenance の意味が半分死ぬ。★
 *
 * ★どこで回すか（この作りにした理由）
 *   通常のCIには入れない。理由:
 *     ・外のサイトに毎回13本叩く＝★向こうの都合(メンテ・混雑・レート制限)でCIが赤くなる★。
 *       それは「うちのコードが壊れた」ではないのに、pushが止まり、業務が止まる。
 *     ・赤が「自分のせいでない理由」で出ると、人は赤を無視するようになる。
 *       それが一番まずい（本物の赤も見なくなる）。
 *   なので:
 *     ・GitHub Actions の【別ワークフロー】で ★週1（月曜9時JST）＋手動★ に回す。
 *       .github/workflows/source-urls.yml。落ちても push は止まらない。
 *     ・見つかった404は Issue ではなく【実行ログ】に一覧で出す＝指示役が見て中央を直す。
 *       （中央への書き込みは本番データ操作なので、この道具は絶対に書かない＝GETのみ）
 *
 * 使い方: node scripts/check-source-urls.mjs          … 全部叩いて一覧（死んでいれば exit 3）
 *         node scripts/check-source-urls.mjs --json   … 機械で読む形
 *   ★中央そのものが読めない時は exit 0（ネットが無いだけで赤くしない）
 */
const SUPA_URL = 'https://tnfwipbgfgjaymlszeid.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek';

const JSON_OUT = process.argv.includes('--json');

async function head(url) {
  // HEAD を弾くサイトがあるので、ダメなら GET で確かめ直す（本文は読まない）
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': 'Kyually-source-check/1.0' } });
      if (r.ok) return { ok: true, status: r.status, method, finalUrl: r.url };
      if (method === 'GET') return { ok: false, status: r.status, method, finalUrl: r.url };
    } catch (e) {
      if (method === 'GET') return { ok: false, status: 0, method, error: e.message };
    }
  }
  return { ok: false, status: 0, method: '?' };
}

let rows;
try {
  const r = await fetch(SUPA_URL + '/rest/v1/statutory?select=kind,year,source_url,verified_at&order=kind,year',
    { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  rows = await r.json();
} catch (e) {
  console.log('中央statutoryを取得できませんでした（' + e.message + '）。検証スキップ＝赤くしない。');
  rows = null;
}

if (rows) {
  const results = [];
  for (const row of rows) {
    const key = row.kind + ':' + row.year;
    if (!row.source_url) { results.push({ key, url: null, ok: false, status: null, why: '出典URLが空' }); continue; }
    const r = await head(row.source_url);
    results.push({ key, url: row.source_url, verified_at: row.verified_at, ok: r.ok, status: r.status, method: r.method, why: r.ok ? null : ('HTTP ' + r.status + (r.error ? ' / ' + r.error : '')) });
  }
  const dead = results.filter(x => !x.ok);

  if (JSON_OUT) {
    console.log(JSON.stringify({ checked: results.length, dead: dead.length, results }, null, 1));
  } else {
    console.log('\n[check-source-urls] 中央 statutory の出典URLが生きているか（' + results.length + '本）\n');
    for (const x of results) {
      console.log('  ' + (x.ok ? '✓' : '✗') + ' ' + x.key.padEnd(24) + ' ' + String(x.status).padEnd(4) + ' ' + String(x.url).slice(0, 78));
    }
    console.log('\n── 実測 ──');
    console.log('  生きている: ' + (results.length - dead.length) + ' / 死んでいる: ' + dead.length);
    if (dead.length) {
      console.log('\n★辿れない出典があります（確認日だけ残って、なぜその金額かを示せない状態）:');
      dead.forEach(x => console.log('   - ' + x.key + '  ' + x.why + '\n     ' + x.url));
      console.log('\n   → 生きている一次情報を探して、★中央の source_url を直してください★（中央への書き込みは指示役）。');
      console.log('     ★適当なURLで埋めないこと。見つからないなら「見つからない」と書く。');
    }
  }
  if (dead.length) process.exitCode = 3;
}
