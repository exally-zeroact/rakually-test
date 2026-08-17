/* check-hosts.mjs — ★入口が生きているか／古い入口がちゃんと今の入口へ飛ぶか★
 *
 * なぜ必要か（2026-08-04）:
 *   司さんが古い入口を「テスト用」だと思って開いた。中身は古く、その日の直しが1つも入っていなかった。
 *   ★「古い」と書くだけでは人は開く。★ 塞いだ後も、塞がったままかを機械で見る。
 *   旧本番 payslip-app-olive は ★本番のデータを見ている★ ので、開かれると事故になる。
 *
 * 見るもの（docs/HOSTS.md の表と1対1）:
 *   ① 今の入口が 200 で返るか
 *   ② 古い入口が、今の入口へ飛ぶか
 *      ・サーバ側の転送(301/302/308) … Location を見る
 *      ・ページ内の転送(GitHub Pages はサーバ転送が打てない) … 本文に飛び先が入っているかを見る
 *   ③ ★うしろ(?t=... / ?c=...)を落としていないか★
 *      落とすと Web明細のリンク（従業員に配ったQR）が死ぬ。
 *   ④ ★飛んだ先が本当に開けるか★（転送だけ成功して 404 に着地する事故を止める）
 *      旧ホストは cleanUrls で /meisai.html → /meisai に化ける。新ホストに /meisai は無い。
 *      ここを見ないと「転送は出来ている／でも真っ白」になる。
 *
 * どこで回すか: ★通常CIには入れない★。外の都合(Vercelのメンテ等)で赤くなると、
 *   自分のせいでない赤で push が止まり、赤が信用されなくなる（source-urls と同じ理由）。
 *   → .github/workflows/hosts.yml で 週1(月曜9時JST)＋手動。
 *   ★落ちた時に誰が見るか＝docs/HOSTS.md の「落ちた時に誰が見るか」に1行で書いてある。
 *
 * 使い方: node scripts/check-hosts.mjs        （NGがあれば exit 3）
 *         node scripts/check-hosts.mjs --json
 *         node scripts/check-hosts.mjs --self-test   ★判定そのものが空振りしていないかを確かめる
 */

const LIVE = [
  /* ★Rakually の入口は2本だけ★（2026-08-17 に立てた・司さん「本番用とテスト用のURL作ってきっちり分けろや」）
     ・配信は Vercel に揃える（★github.io は使わない★）
     ・★repo名やホスト名では環境を判断しない★。倉庫の向き先は 配信された js/supa-config.js を読んで確かめる
       （静的な突き合わせは tests/pages-hosting.test.mjs D2／週1の実測は下の checkWarehouse ではなく
         scripts/check-warehouse-pointers.mjs が6か所で見る）。 */
  { name: 'テスト 入口', url: 'https://rakually-test.vercel.app/' },
  { name: 'テスト 給与', url: 'https://rakually-test.vercel.app/kyuyo/' },
  { name: 'テスト 請求書', url: 'https://rakually-test.vercel.app/seikyu/' },
  { name: 'テスト Web明細', url: 'https://rakually-test.vercel.app/kyuyo/meisai.html?t=PROBE' },
  /* ★本番(rakually)は「枠だけ」＝Deployment Protection が入っている★。
     保護が入っている間は 401 が正しい姿なので、200 を期待する この一覧には ★まだ載せない★。
     ★載せる条件★＝司さんの見た目OKで本番へ運び、保護を外して公開した日（その日に この行を足す）。 */
];

/* 古い入口 → どこへ飛ぶべきか。
   mustKeep : 飛び先に必ず残っていないといけない文字（うしろを落としていないか）
   landing  : 飛んだ先を実際に叩いて 200 かを見る（転送だけ成功して404、を止める）
   pending  : まだ塞いでいない（理由つき）＝NGにするが、何が残っているかが一覧で見える */
const OLD = [
  /* ★今は0本★（2026-08-17）。
     Rakually はまだ ★誰にも配っていない★ ので、古い入口が無い。
     ★ここが埋まる日★＝Exally から kyuyo/ を外して exally.vercel.app/kyuyo/ を
       rakually.vercel.app/kyuyo/ へ転送する日（22人が使っている＝★消さずに転送を残す★）。
       その転送を打つのは ★Exally セッションの手番★。打った日に この一覧へ1行足す
       （うしろの ?t= を落としていないかを、Web明細のリンクで必ず見る）。
     ★0本のまま緑にしない★＝下の実行部が「0本です」と数を出す。 */
];

async function get(url) {
  try {
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Kyually-host-check/1.0' } });
    const loc = r.headers.get('location');
    const body = await r.text().catch(() => '');
    return { status: r.status, location: loc, body: body.slice(0, 200000) };
  } catch (e) {
    return { status: 0, error: e.message, body: '' };
  }
}
async function head(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Kyually-host-check/1.0' } });
    return r.status;
  } catch (e) { return 0; }
}

/* ★純関数: 1件の判定。self-test で作り物を通せる＝判定そのものが空振りしていないかを見る。 */
export function judge(h, r) {
  if (h.expectNoRedirect) {
    if (r.location) return { ok: false, how: 'サーバ転送 ' + r.status, why: '★ここは飛ばしてはいけない（飛ばすとSWが更新できず居座る）' };
    if (r.status !== 200) return { ok: false, how: 'HTTP ' + r.status, why: '★中身が返っていない（SWのキルスイッチが消えている）' };
    for (const need of (h.mustContainBody || [])) {
      if (r.body.indexOf(need) < 0) return { ok: false, how: '中身あり', why: '★中身に「' + need + '」が無い＝キルスイッチになっていない' };
    }
    return { ok: true, how: '飛ばさない(200)' };
  }
  let how = null, ok = false;
  if (r.location && r.location.indexOf(h.to) === 0) { how = 'サーバ転送 ' + r.status; ok = true; }
  else if (r.body && r.body.indexOf(h.to) >= 0) { how = 'ページ内転送'; ok = true; }
  if (!ok) return { ok: false, how, why: '飛び先(' + h.to + ')が見つからない' };
  // ★うしろを落としていないか（サーバ転送は Location、ページ内転送は本文の作りを見る）
  const hay = r.location || r.body;
  for (const need of (h.mustKeep || [])) {
    if (hay.indexOf(need) < 0) return { ok: false, how, why: '★うしろを落としている（「' + need + '」が飛び先に無い）' };
  }
  for (const need of (h.mustContainBody || [])) {
    if (r.body.indexOf(need) < 0) return { ok: false, how, why: '★条件不足（本文に「' + need + '」が無い）' };
  }
  return { ok: true, how };
}

/* ══ self-test（判定そのものを、わざと壊して赤にする） ═══════════════════ */
if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0;
  const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  const H = { to: 'https://new/kyuyo/meisai.html', mustKeep: ['t=PROBE'] };
  console.log('\n[check-hosts --self-test] 判定そのものが空振りしていないか');
  T('★飛び先が違えば赤', () => { if (judge(H, { status: 308, location: 'https://old/other', body: '' }).ok) throw new Error('赤にならない'); });
  T('★うしろ(?t=)を落としたら赤', () => { const v = judge(H, { status: 308, location: 'https://new/kyuyo/meisai.html', body: '' }); if (v.ok) throw new Error('赤にならない'); });
  T('うしろが残っていれば緑', () => { const v = judge(H, { status: 308, location: 'https://new/kyuyo/meisai.html?t=PROBE', body: '' }); if (!v.ok) throw new Error('緑にならない: ' + v.why); });
  T('★転送そのものが無ければ赤（200のまま生きている）', () => { if (judge(H, { status: 200, location: null, body: '<html>給与</html>' }).ok) throw new Error('赤にならない'); });
  const SW = { expectNoRedirect: true, mustContainBody: ['unregister'] };
  T('★sw.js が飛ばされていたら赤', () => { if (judge(SW, { status: 308, location: 'https://new/', body: '' }).ok) throw new Error('赤にならない'); });
  T('★sw.js の中身がキルスイッチでなければ赤', () => { if (judge(SW, { status: 200, location: null, body: 'self.addEventListener("fetch",...)' }).ok) throw new Error('赤にならない'); });
  T('sw.js がキルスイッチのままなら緑', () => { if (!judge(SW, { status: 200, location: null, body: 'registration.unregister()' }).ok) throw new Error('緑にならない'); });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
} else {
  /* ══ 本番（実物を叩く） ═══════════════════════════════════════════════ */
  const JSON_OUT = process.argv.includes('--json');
  const results = { live: [], old: [] };

  for (const h of LIVE) {
    const r = await get(h.url);
    const ok = r.status >= 200 && r.status < 400;
    results.live.push({ ...h, status: r.status, ok, why: ok ? null : ('HTTP ' + r.status + (r.error ? ' / ' + r.error : '')) });
  }

  for (const h of OLD) {
    const r = await get(h.url);
    let v = judge(h, r);
    let landStatus = null;
    if (v.ok && h.landing && r.location) {
      landStatus = await head(r.location);
      if (landStatus !== 200) v = { ok: false, how: v.how, why: '★飛んだ先が開けない（HTTP ' + landStatus + '）＝転送は出来ているのに真っ白になる' };
    }
    if (h.pending) v = { ok: false, how: v.how, why: h.pending };
    results.old.push({ ...h, status: r.status, location: r.location, landStatus, ...v });
  }

  const ngLive = results.live.filter(x => !x.ok);
  const ngOld = results.old.filter(x => !x.ok);

  if (JSON_OUT) {
    console.log(JSON.stringify({ ngLive: ngLive.length, ngOld: ngOld.length, results }, null, 1));
  } else {
    console.log('\n[check-hosts] 入口の生死と、古い入口の飛び先（docs/HOSTS.md と1対1）\n');
    console.log('■ 今の入口');
    results.live.forEach(x => console.log('  ' + (x.ok ? '✓' : '✗') + ' ' + String(x.status).padEnd(4) + ' ' + x.name.padEnd(14) + ' ' + x.url));
    console.log('\n■ 古い入口（今の入口へ飛ぶか）');
    results.old.forEach(x => console.log('  ' + (x.ok ? '✓' : '✗') + ' ' + String(x.status).padEnd(4) + ' ' + x.name
      + '\n      ' + x.url
      + (x.location ? '\n      → ' + x.location + (x.landStatus ? '  [飛び先 HTTP ' + x.landStatus + ']' : '') : (x.to ? '\n      → ' + x.to : ''))
      + '\n      ' + (x.how || '—') + (x.why ? '  ／ ' + x.why : '')));
    console.log('\n── 実測 ──');
    console.log('  今の入口 OK ' + (results.live.length - ngLive.length) + ' / NG ' + ngLive.length);
    console.log('  古い入口 OK ' + (results.old.length - ngOld.length) + ' / NG ' + ngOld.length);
    /* ★0件を「見て異常なし」に見せない★＝数えた物が0本なら、そう言う */
    if (!results.old.length) console.log('  ※ 古い入口は ★まだ0本★（Rakually を誰にも配っていないため）。'
      + 'Exally の kyuyo/ を転送する日に1行 足す＝それまでは「見張る物が無い」の0件。');
    if (!results.live.length) console.log('  ※ ★今の入口が0本＝この見張りは空振り★（一覧に足し忘れている）');
  }

  if (ngLive.length || ngOld.length) process.exitCode = 3;
}
