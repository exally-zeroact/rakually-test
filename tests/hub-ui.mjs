// hub-ui.mjs — ★②UI 全ボタン検証★
//  本物の index.html(Rakunally の入口) + js/hub.js を jsdom に読み込み、全画面・全タブ・全ボタンを実際にクリックして
//  「JS例外0・各画面が中身を描画」を確かめる。Kyually の tests/ui-smoke.mjs と同じハーネス。
//  Supabase(ネット)には繋がない=偽のデータ層を差し込んで、実データ相当の中身で描く。
//  依存: jsdom。未導入なら SKIP(exit 0) だが「スキップした」と明示する。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const { repoEnv } = await import('../scripts/repo-env.mjs');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  NG   ' + name + '\n       ' + (e && e.message)); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── index.html(入口) を読み込み、ローカルの script だけ順に流す(CDN/auth は除外=ネットに出ない) ── */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
  .map(s => s.split('?')[0])   // ★キャッシュバスターの ?v=... を落としてから実ファイルを読む
  .filter(s => !/^https?:/.test(s) && !/supa-config|auth\.js/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
const errs = [];
win.addEventListener('error', e => errs.push('window.error: ' + (e.message || e)));
win.addEventListener('unhandledrejection', e => errs.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
win.confirm = () => true;   // 削除の確認は「はい」で通す(テスト用の偽データのみ)
win.scrollTo = () => {};    // jsdom未実装の警告を消す(挙動には関係しない)
for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
  doc.body.appendChild(el);
}
const H = win.__RAKUNALLY_TEST;
ok(H, '__RAKUNALLY_TEST 露出(hub.js の init 成功)');

/* ── 偽のデータ層(SuiteDataと同じ形の返り) ── */
const db = {
  org: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000', invoiceNo: 'T1234567890123', businesses: ['代行', '空調'] },
  employees: [
    { id: 'e1', sort: 0, name: '山田 太郎', employmentType: '従業員', business: '空調', data: {} },
    { id: 'e2', sort: 1, name: '鈴木 花子', employmentType: '業務委託', business: '代行', data: {} },
    { id: 'e3', sort: 2, name: '佐藤 次郎', employmentType: '従業員', business: '', data: {} }
  ],
  partners: [{ id: 'pt_a', sort: 0, data: { name: '○○建設株式会社', keisho: '御中', addr: '松山市1-1', invoiceNo: '' } }],
  ledger: [
    { id: 'l1', employeeId: 'e2', ymd: '2026-07-01', data: { uriage: 4200, minutes: 90, business: '代行' } },
    { id: 'l2', employeeId: 'e2', ymd: '2026-07-01', data: { uriage: 3800, minutes: 75 } },
    { id: 'l3', employeeId: 'e1', ymd: '2026-07-05', data: { uriage: 210000 } },
    { id: 'l4', employeeId: 'e3', ymd: '2026-07-16', data: { uriage: 1000 } }
  ]
};
const calls = [];
let failNext = null;
const fakeSD = {
  org: {
    get: () => Promise.resolve(db.org),
    save: (patch) => { calls.push(['org.save', patch]); if (failNext === 'org') { failNext = null; return Promise.resolve({ ok: false, reason: 'no-user' }); } Object.assign(db.org, patch); return Promise.resolve({ ok: true, data: db.org }); }
  },
  employees: {
    list: () => Promise.resolve(db.employees.map(e => ({ ...e }))),
    patch: (id, p) => { calls.push(['emp.patch', id, p]); const e = db.employees.find(x => x.id === id); if (!e) return Promise.resolve({ ok: false, reason: 'not-found' }); Object.assign(e, p); return Promise.resolve({ ok: true }); }
  },
  partners: {
    list: () => Promise.resolve(db.partners.map(p => ({ ...p }))),
    upsert: (p) => { calls.push(['pt.upsert', p]); const id = p.id || ('pt_' + (db.partners.length + 1)); const ex = db.partners.find(x => x.id === id); if (ex) ex.data = p.data; else db.partners.push({ id, sort: 0, data: p.data }); return Promise.resolve({ ok: true, id }); },
    remove: (id) => { calls.push(['pt.remove', id]); db.partners = db.partners.filter(x => x.id !== id); return Promise.resolve({ ok: true }); }
  },
  ledger: {
    list: (q) => { calls.push(['ledger.list', q]); if (failNext === 'ledger') { failNext = null; return Promise.reject(new Error('台帳が多すぎて全部読めませんでした（1000/4200件）。期間を短く区切ってください')); } return Promise.resolve(db.ledger.filter(r => r.ymd >= q.from && r.ymd <= q.to && (!q.employeeId || r.employeeId === q.employeeId))); },
    upsert: (r) => {
      calls.push(['ledger.upsert', r]);
      if (failNext === 'lgsave') { failNext = null; return Promise.resolve({ ok: false, reason: 'no-user' }); }
      const id = r.id || ('lg_new' + (db.ledger.length + 1));
      const ex = db.ledger.find(x => x.id === id);
      if (ex) { ex.ymd = r.ymd; ex.data = r.data; } else db.ledger.push({ id, employeeId: r.employeeId, ymd: r.ymd, data: r.data });
      return Promise.resolve({ ok: true, id });
    },
    remove: (id) => { calls.push(['ledger.remove', id]); db.ledger = db.ledger.filter(x => x.id !== id); return Promise.resolve({ ok: true }); }
  },
  entitlements: { get: () => Promise.resolve({ plan: 'trial' }), ensure: () => Promise.resolve({ plan: 'trial', existed: true }) },
  // E2: 締め方は Kyually の会社設定が唯一の源＝読むだけ
  company: { getShime: () => { calls.push(['company.getShime']); return Promise.resolve({ method: 'ten', n: 10, fromKyually: true }); } }
};

H.state.today = '2026-07-15';      // 現在時刻に依存させない
H._setSuiteData(fakeSD);
await H.loadAll();
await sleep(30);

/* ═══ 0. 未ログインで中身を見せない ═══ */
T('0. ★中身(.app)は最初 hidden＝未ログインで画面を見せない', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(/<div class="app" id="app" hidden>/.test(raw), 'index.html の .app に hidden が無い');
  const authSrc = fs.readFileSync(path.join(ROOT, 'js', 'auth.js'), 'utf8');
  ok(/a\.hidden\s*=\s*false/.test(authSrc), 'ログイン成功時に hidden を外していない');
  ok(/a\.hidden\s*=\s*true/.test(authSrc), 'ログイン画面に戻す時に hidden を付けていない');
});
doc.getElementById('app').hidden = false;   // 以降はログイン済みとして描画を見る

/* ═══ 1. ハブ ═══ */
/* ★3つ★＝給与/請求書/共有データ（2026-08-18 台帳と集計を外した＝Exally の物）。
   表(ブック)は Exally の物なので Rakunally には出さない（2026-08-17）。★数で見張る＝1つ増えても減っても赤★ */
/* ★2026-08-26★ この見張りは 本番(rakunally／請求書だけ)へも そのまま運ばれる。
   本番には ★給与の画面が無い★ ので タイルは2つ（請求書/共有データ）＝
   「出来ていない物のボタンを見せるな」を ★本番側でも 数で見張る★。
   どちらの repo かは 名札(js/supa-config.js の env)で決める。
   ★読み方は 1か所★＝scripts/repo-env.mjs（覚書に書いた env:'prod' に釣られない）。 */
const ENV = repoEnv(ROOT);
/* ★「給与が 在るか」は 名札(env)ではなく ★実物★で 決める★（2026-09-03）
   司さん 2026-09-03「渡せる状態にやって／★URLは1本かして★」＝
   ★本番にも 給与を 入れて 1つのURL・1つのログインで 両方 使える形にした★。
   前は「本番＝給与は無い」と 名札だけで 決めていたので、
   ★入れた瞬間に この見張りが 逆さになる★（在る物を「出すな」と言う）。
   ⇒ ★kyuyo/index.html が 在れば タイルを 出す／無ければ 出さない★＝
     ★出来ていない物のボタンを 見せない★（決まりは そのまま・見方だけ 実物に 合わせた）。 */
const HAS_KYUYO = fs.existsSync(path.join(ROOT, 'kyuyo/index.html'));
const WANT_TILES = HAS_KYUYO ? 3 : 2;
T('1. 入口が出る・タイルの数が この repo の通り(' + WANT_TILES + 'つ)', () => {
  ok(ENV === 'test' || ENV === 'prod', '名札(env)が test でも prod でもない: ' + JSON.stringify(ENV));
  ok(doc.getElementById('scr-hub').classList.contains('active'), '入口が表示されていない');
  ok(doc.querySelectorAll('#scr-hub .tile').length === WANT_TILES,
    'タイル数=' + doc.querySelectorAll('#scr-hub .tile').length + '（欲しい ' + WANT_TILES + '）');
});
// 2026-08-01 統合: 給与は別サイト(payslip-app-olive)ではなく【同一オリジンの kyuyo/】になった。
//   同一オリジンであることが「ログイン1回で両方使える」の条件そのものなので、そこを見張る。
// ★2026-08-01 staging: href は【相対】であること。ここは GitHub Pages のサブパス配信
//   (https://exally-zeroact.github.io/exally-staging/)なので、'/kyuyo/' と書くと
//   github.io の直下を指してしまい 404 になる。相対なら本番(ルート配信)でも同じ場所を指す＝両方で正しい。
//   機械での見張りは tests/no-absolute-paths.test.mjs（配信物全体）。ここは意味(同一オリジン)を見る。
T('1. ★給与タイル … ' + (HAS_KYUYO
  ? '同一オリジンの kyuyo/ へ繋がる(別サイトへ飛ばさない・相対)'
  : 'この配信に 給与が 無いので ★1つも出さない★（押した人を行き止まりにしない）'), () => {
  const a = doc.getElementById('tile-payslip');
  if (!HAS_KYUYO) {
    ok(!a, '★給与の画面が 無いのに 給与タイルが 出ている（押すと 404）★');
    ok(doc.getElementById('scr-hub').innerHTML.indexOf('kyuyo/') < 0,
      '★入口に kyuyo/ への行き先が残っている★');
    return;
  }
  ok(a, '給与タイルが無い');
  ok(a.tagName === 'A', 'リンクでない');
  ok(a.getAttribute('href') === 'kyuyo/', 'href=' + a.getAttribute('href') + ' (相対 kyuyo/ であること)');
  ok(!/^https?:/.test(a.getAttribute('href')), '外部URLになっている(別オリジン=ログインが分かれる)');
  ok(!a.getAttribute('target'), '別タブで開く指定が残っている(同一サイト内なので不要)');
});
// 2026-08-01 統合: 請求書/見積の旧ページは削除した。無い物は見せない＝タイルも消す。
//   「消したページへのリンクが戻ってくる」＝404を配るので、逆向きに見張る。
T('1. ★削除した旧ページ(請求書/見積/旧トップ/テンプレ)へのリンクがハブに無い', () => {
  const html = doc.getElementById('scr-hub').innerHTML;
  ['seikyusyo.html', 'mitsumoriyo.html', 'home.html', 'template.html', 'kyuuryoumeisai.html'].forEach(f => {
    ok(!new RegExp(f.replace('.', '\.')).test(html), 'ハブに ' + f + ' へのリンクが残っている');
  });
  ok(!doc.getElementById('tile-mitsumori'), '見積タイルが残っている');
});
// 2026-08-10: 請求書は【中身のある新しいアプリ seikyu/】として戻ってきた。
//   上の検査は「消した旧ページ(seikyusyo.html)へのリンク」を見ているので、そのまま生きている。
//   ここでは新しい方が、同一オリジンの相対リンクで繋がっているかを見る。
T('1. ★請求書タイルは同一オリジンの seikyu/ へ繋がる(相対)', () => {
  const a = doc.getElementById('tile-seikyu');
  ok(a, '請求書タイルが無い');
  ok(a.tagName === 'A', 'リンクでない');
  ok(a.getAttribute('href') === 'seikyu/', 'href=' + a.getAttribute('href') + ' (相対 seikyu/ であること)');
  ok(!/^https?:/.test(a.getAttribute('href')), '外部URLになっている(別オリジン=ログインが分かれる)');
  ok(!a.getAttribute('target'), '別タブで開く指定が残っている(同一サイト内なので不要)');
  const d = a.querySelector('.tile-d');
  ok(d && d.textContent.trim().length > 0, '説明が無い');
  ok(d.textContent.length <= 30, '説明が長すぎる(薄くの原則): ' + d.textContent);
});
T('1. ★撤去したお試し画面(chat.html)へのタイルは無い', () => {
  ok(!/chat.html/.test(doc.getElementById('scr-hub').innerHTML), 'ハブから chat.html へ行ける');
});

/* ★2026-08-17 Rakunally を立てた時に替えた★
   表(ブック)＝Excelの式エンジンは Exally の物なので Rakunally には無い（司さん「Exally には要らん機能やろが」）。
   ★無い物のボタンを出していない★事を、ここで逆向きに見張る（戻したら赤）。 */
T('1. ★表(ブック)のタイルは無い（Exally の物・ここに無い物のボタンを出さない）', () => {
  ok(!doc.getElementById('tile-book'), 'ブックのタイルが戻っている');
  ok(!/book\.html/.test(doc.getElementById('scr-hub').innerHTML), '入口から book.html へ行ける');
});

/* ═══ 2. 共有データ: 会社 ═══ */
T('2. 会社の情報がクラウドの値で埋まっている', () => {
  H.show('scr-data');
  ok(doc.getElementById('org-yago').value === '株式会社ゼロアクト', 'yago=' + doc.getElementById('org-yago').value);
  ok(doc.getElementById('org-invoice').value === 'T1234567890123');
});
T('2. 事業のチップが出る', () => {
  const chips = doc.querySelectorAll('#org-biz-chips .chip');
  ok(chips.length === 2, 'チップ数=' + chips.length);
  ok(/代行/.test(chips[0].textContent));
});
await (async () => {
  doc.getElementById('org-yago').value = '株式会社テスト';
  doc.getElementById('org-save').click(); await sleep(30);
  T('2. 保存すると成功が画面に出る', () => {
    ok(/保存しました/.test(doc.getElementById('org-msg').textContent), 'msg=' + doc.getElementById('org-msg').textContent);
    ok(db.org.yago === '株式会社テスト', 'クラウドに渡っていない');
  });
  failNext = 'org';
  doc.getElementById('org-save').click(); await sleep(30);
  T('2. ★保存に失敗したら「保存しました」と嘘をつかない', () => {
    const m = doc.getElementById('org-msg');
    ok(!/保存しました/.test(m.textContent), '失敗なのに成功と出た: ' + m.textContent);
    ok(m.className.indexOf('err') >= 0, '赤くなっていない');
    ok(/ログイン/.test(m.textContent), '理由が日本語で出ていない: ' + m.textContent);
  });
})();
await (async () => {
  doc.getElementById('org-biz-new').value = 'EC';
  doc.getElementById('org-biz-add').click(); await sleep(30);
  T('2. 事業を追加できる・入力欄が空に戻る', () => {
    ok(doc.querySelectorAll('#org-biz-chips .chip').length === 3, 'チップが増えていない');
    ok(doc.getElementById('org-biz-new').value === '', '入力欄が残っている');
  });
  doc.getElementById('org-biz-new').value = 'EC';
  doc.getElementById('org-biz-add').click(); await sleep(10);
  T('2. 同じ事業は二重に足せない', () => {
    ok(doc.querySelectorAll('#org-biz-chips .chip').length === 3, '重複して増えた');
    ok(/もうあります/.test(doc.getElementById('org-biz-msg').textContent));
  });
  // 今足した EC(最後)を消す。先頭を消すと「代行/空調」が減って後のテストの前提が変わるため。
  [...doc.querySelectorAll('#org-biz-chips [data-biz-del]')].pop().click(); await sleep(30);
  T('2. 事業を削除できる', () => {
    ok(doc.querySelectorAll('#org-biz-chips .chip').length === 2, '減っていない');
    ok(JSON.stringify(H.state.businesses) === '["代行","空調"]', '残った事業=' + JSON.stringify(H.state.businesses));
  });
})();

/* ═══ 3. 共有データ: 人 ═══ */
T('3. 人の一覧が出る・雇用形態と事業が見える', () => {
  H.showTab('emp');
  const rows = doc.querySelectorAll('#emp-rows .row');
  ok(rows.length === 3, '行数=' + rows.length);
  ok(/山田 太郎/.test(rows[0].textContent));
  ok(/業務委託/.test(rows[1].textContent), '雇用形態が出ていない');
  ok(/事業なし/.test(rows[2].textContent), '事業未設定が分かるようになっていない');
});
T('3. ★給与の項目は画面に出さない(二重管理を作らない)', () => {
  const t = doc.getElementById('pane-emp').textContent;
  ['基本給', '時給', '扶養', '社会保険', '通勤', '住民税'].forEach(w => {
    ok(t.indexOf(w) < 0, '給与の項目が出ている: ' + w);
  });
});
T('3. ★人を追加/削除するボタンが無い(源は給料明細アプリ)', () => {
  const html = doc.getElementById('pane-emp').innerHTML;
  ok(!/従業員を追加|＋ 人|人を追加/.test(html), '追加ボタンがある');
  ok(!/data-del-emp|人を削除/.test(html), '削除ボタンがある');
});
await (async () => {
  doc.querySelector('#emp-rows [data-emp="e1"]').click(); await sleep(10);
  T('3. 人をタップすると編集が開き、今の値が入っている', () => {
    ok(doc.getElementById('emp-edit').style.display !== 'none', '開いていない');
    ok(doc.getElementById('emp-edit-name').textContent === '山田 太郎');
    ok(doc.getElementById('emp-type').value === '従業員', 'type=' + doc.getElementById('emp-type').value);
    ok(doc.getElementById('emp-biz').value === '空調', 'biz=' + doc.getElementById('emp-biz').value);
  });
  doc.getElementById('emp-type').value = '業務委託';
  doc.getElementById('emp-biz').value = '代行';
  doc.getElementById('emp-save').click(); await sleep(30);
  T('3. 保存すると一覧に反映され、渡すのは2つのキーだけ', () => {
    const c = calls.filter(c => c[0] === 'emp.patch').pop();
    ok(c, 'patch が呼ばれていない');
    ok(JSON.stringify(Object.keys(c[2]).sort()) === '["business","employmentType"]', '渡したキー=' + Object.keys(c[2]));
    ok(/業務委託/.test(doc.querySelector('#emp-rows [data-emp="e1"]').textContent), '一覧が更新されていない');
    ok(doc.getElementById('emp-edit').style.display === 'none', '編集が閉じていない');
  });
  doc.querySelector('#emp-rows [data-emp="e3"]').click(); await sleep(10);
  doc.getElementById('emp-cancel').click(); await sleep(10);
  T('3. やめるで閉じる', () => ok(doc.getElementById('emp-edit').style.display === 'none'));
})();

/* ═══ 4. 共有データ: 取引先 ═══ */
await (async () => {
  H.showTab('pt');
  T('4. 取引先の一覧が出る', () => {
    ok(doc.querySelectorAll('#pt-rows .row').length === 1, '行数=' + doc.querySelectorAll('#pt-rows .row').length);
  });
  doc.getElementById('pt-add').click(); await sleep(10);
  T('4. 追加を押すと空のフォームが開く(削除ボタンは出さない)', () => {
    ok(doc.getElementById('pt-edit').style.display !== 'none');
    ok(doc.getElementById('pt-name').value === '', '前の値が残っている');
    ok(doc.getElementById('pt-del').style.display === 'none', '新規なのに削除が出ている');
  });
  doc.getElementById('pt-save').click(); await sleep(20);
  T('4. 名称が空なら保存させない', () => {
    ok(/名称を入れて/.test(doc.getElementById('pt-edit-msg').textContent), 'msg=' + doc.getElementById('pt-edit-msg').textContent);
    ok(db.partners.length === 1, '空のまま保存された');
  });
  doc.getElementById('pt-name').value = '△△工務店';
  doc.getElementById('pt-save').click(); await sleep(40);
  T('4. 取引先を追加できる', () => {
    ok(db.partners.length === 2, 'クラウドに増えていない');
    ok(doc.querySelectorAll('#pt-rows .row').length === 2, '一覧が更新されていない');
    ok(doc.getElementById('pt-edit').style.display === 'none', 'フォームが閉じていない');
  });
  doc.querySelector('#pt-rows [data-pt="pt_a"]').click(); await sleep(10);
  T('4. 既存をタップすると値が入り、削除ボタンが出る', () => {
    ok(doc.getElementById('pt-name').value === '○○建設株式会社');
    ok(doc.getElementById('pt-del').style.display !== 'none');
  });
  doc.getElementById('pt-del').click(); await sleep(40);
  T('4. 削除できる(確認あり)', () => {
    ok(db.partners.length === 1, '消えていない');
    ok(doc.getElementById('pt-edit').style.display === 'none');
  });
  doc.getElementById('pt-add').click(); await sleep(5);
  doc.getElementById('pt-cancel').click(); await sleep(5);
  T('4. やめるで閉じる', () => ok(doc.getElementById('pt-edit').style.display === 'none'));
})();

/* ★2026-08-18 「5. 集計(E1/E5)」と「5b. 日次台帳(E2)」の検査を外した★
   ＝どちらも Exally の物なので Rakunally の入口から外した（司さん「ささっと Exally から切り離せ」）。
   外したのは 263行。★戻す条件★＝Rakunally に台帳/集計を置く日に、画面・lib・この検査を まとめて戻す。 */
H.show('scr-hub');

/* ═══ 6. 画面移動と全ボタン ═══ */
T('6. 下部タブで2画面を行き来できる', () => {
  ['scr-hub', 'scr-data'].forEach(id => {
    doc.querySelector('.bn-i[data-go="' + id + '"]').click();
    ok(doc.getElementById(id).classList.contains('active'), id + ' に行けない');
    ok(doc.querySelector('.bn-i[data-go="' + id + '"]').classList.contains('active'), id + ' のタブが光らない');
  });
});
await (async () => {
  // 全ボタンを総当たりでクリックして例外0を確認(ログアウト等は無いので全部押せる)
  const before = errs.length;
  const btns = [...doc.querySelectorAll('button')];
  for (const b of btns) { try { b.click(); } catch (e) { errs.push('click例外: ' + (b.id || b.textContent).slice(0, 20) + ' — ' + e.message); } }
  await sleep(60);
  T('6. ★全ボタン(' + btns.length + '個)を押しても例外0', () => {
    ok(errs.length === before, '例外:\n       ' + errs.slice(before).join('\n       '));
  });
})();

T('7. ここまでで JS例外・未処理の失敗が0', () => {
  ok(errs.length === 0, errs.join('\n       '));
});

console.log('\nhub-ui: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
