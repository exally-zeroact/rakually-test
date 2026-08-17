// hub-ui.mjs — ★②UI 全ボタン検証★
//  本物の index.html(Rakually の入口) + js/hub.js を jsdom に読み込み、全画面・全タブ・全ボタンを実際にクリックして
//  「JS例外0・各画面が中身を描画」を確かめる。Kyually の tests/ui-smoke.mjs と同じハーネス。
//  Supabase(ネット)には繋がない=偽のデータ層を差し込んで、実データ相当の中身で描く。
//  依存: jsdom。未導入なら SKIP(exit 0) だが「スキップした」と明示する。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
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
const H = win.__EXALLY_TEST;
ok(H, '__EXALLY_TEST 露出(hub.js の init 成功)');

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
/* ★5つ★＝給与/請求書/日次台帳/集計/共有データ。
   表(ブック)は Exally の物なので Rakually には出さない（2026-08-17）。★数で見張る＝1つ増えても減っても赤★ */
T('1. 入口が出る・タイルは5つ(給与/請求書/日次台帳/集計/共有データ)', () => {
  ok(doc.getElementById('scr-hub').classList.contains('active'), '入口が表示されていない');
  ok(doc.querySelectorAll('#scr-hub .tile').length === 5, 'タイル数=' + doc.querySelectorAll('#scr-hub .tile').length);
});
// 2026-08-01 統合: 給与は別サイト(payslip-app-olive)ではなく【同一オリジンの kyuyo/】になった。
//   同一オリジンであることが「ログイン1回で両方使える」の条件そのものなので、そこを見張る。
// ★2026-08-01 staging: href は【相対】であること。ここは GitHub Pages のサブパス配信
//   (https://exally-zeroact.github.io/exally-staging/)なので、'/kyuyo/' と書くと
//   github.io の直下を指してしまい 404 になる。相対なら本番(ルート配信)でも同じ場所を指す＝両方で正しい。
//   機械での見張りは tests/no-absolute-paths.test.mjs（配信物全体）。ここは意味(同一オリジン)を見る。
T('1. ★給与タイルは同一オリジンの kyuyo/ へ繋がる(別サイトへ飛ばさない・相対)', () => {
  const a = doc.getElementById('tile-payslip');
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

/* ★2026-08-17 Rakually を立てた時に替えた★
   表(ブック)＝Excelの式エンジンは Exally の物なので Rakually には無い（司さん「Exally には要らん機能やろが」）。
   ★無い物のボタンを出していない★事を、ここで逆向きに見張る（戻したら赤）。 */
T('1. ★表(ブック)のタイルは無い（Exally の物・ここに無い物のボタンを出さない）', () => {
  ok(!doc.getElementById('tile-book'), 'ブックのタイルが戻っている');
  ok(!/book\.html/.test(doc.getElementById('scr-hub').innerHTML), '入口から book.html へ行ける');
});

T('1. 日次台帳(E2)は本物になり「準備中」は消えた', () => {
  const t = doc.getElementById('tile-ledger');
  ok(!/準備中/.test(t.textContent), 'まだ準備中と出ている');
  ok(t.getAttribute('data-go') === 'scr-ledger', '台帳へ行かない');
});
T('1. 日次台帳を押すと台帳が開く', () => {
  doc.getElementById('tile-ledger').click();
  ok(doc.getElementById('scr-ledger').classList.contains('active'), '台帳が開かない');
  H.show('scr-hub');
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

/* ═══ 5. 集計 ═══ */
await (async () => {
  H.show('scr-agg'); await sleep(40);
  // この時点の前提: テスト3で e1(山田)の事業を 空調→代行 に変えた。台帳は
  //   l1 e2 代行(行で明示) 4200 / l2 e2 (人の既定=代行) 3800 / l3 e1 (人の既定=代行) 210000 / l4 e3 (事業なし) 1000
  //   → 代行 218,000(3件) / 未分類 1,000(1件) / 合計 219,000(4件)。空調は台帳が無いので出ない。
  T('5. 今月の期間が出て、事業別の数字が出る', () => {
    ok(/2026-07-01 〜 2026-07-31/.test(doc.getElementById('agg-range').textContent), 'range=' + doc.getElementById('agg-range').textContent);
    const rows = doc.querySelectorAll('#agg-body .agg-row');
    ok(rows.length === 2, '行数=' + rows.length);
  });
  T('5. ★実数値で合っている(代行218,000/3件・未分類1,000/1件・合計219,000/4件)', () => {
    const txt = doc.getElementById('agg-body').textContent.replace(/\s+/g, '');
    ok(/代行/.test(txt) && /¥218,000/.test(txt), '代行の売上が違う: ' + txt);
    ok(/未分類/.test(txt) && /¥1,000/.test(txt), '未分類が違う: ' + txt);
    ok(/合計4¥219,000/.test(txt), '合計が違う: ' + txt);
    ok(!/空調/.test(txt), '台帳が無い事業まで出ている: ' + txt);
  });
  T('5. 並びは多い順・未分類は最後・バーが出る', () => {
    const names = [...doc.querySelectorAll('#agg-body .agg-b')].map(e => e.textContent.replace(/\d+%/, '').trim());
    ok(names[0].indexOf('代行') === 0 && names[names.length - 1].indexOf('未分類') === 0, '並び=' + names.join(','));
    ok(doc.querySelectorAll('#agg-body .agg-bar > i').length === 2, 'バーが無い');
  });
  T('5. ★散布図や円グラフを作っていない', () => {
    const h = doc.getElementById('scr-agg').innerHTML;
    ok(!/<canvas|<svg[^>]*chart|scatter|pie/i.test(h), '凝ったグラフがある');
  });
  doc.getElementById('agg-kind').value = 'lastMonth';
  doc.getElementById('agg-kind').dispatchEvent(new win.Event('change')); await sleep(40);
  T('5. 先月に切り替わり、記録が無ければ正直に空を出す(数字を作らない)', () => {
    ok(/2026-06-01 〜 2026-06-30/.test(doc.getElementById('agg-range').textContent));
    const t = doc.getElementById('agg-body').textContent;
    ok(/まだありません/.test(t), '空状態が出ていない: ' + t);
    ok(!/¥/.test(t), '0件なのに金額が出ている');
  });
  doc.getElementById('agg-kind').value = 'custom';
  doc.getElementById('agg-kind').dispatchEvent(new win.Event('change')); await sleep(10);
  T('5. 期間指定にすると日付欄が出る', () => {
    ok(doc.getElementById('agg-custom').classList.contains('on'), '日付欄が出ていない');
  });
  doc.getElementById('agg-from').value = '2026-07-31';
  doc.getElementById('agg-to').value = '2026-07-01';
  doc.getElementById('agg-reload').click(); await sleep(30);
  T('5. 開始日と終了日が逆なら、数字を出さずに教える', () => {
    ok(/終了日が開始日より前/.test(doc.getElementById('agg-msg').textContent), 'msg=' + doc.getElementById('agg-msg').textContent);
    ok(doc.getElementById('agg-body').innerHTML === '', '数字が残っている');
  });
  doc.getElementById('agg-from').value = '2026-07-01';
  doc.getElementById('agg-to').value = '2026-07-31';
  failNext = 'ledger';
  doc.getElementById('agg-reload').click(); await sleep(40);
  T('5. ★件数上限で全部読めない時は、合計を出さずに「期間を短く」と出す', () => {
    const m = doc.getElementById('agg-msg').textContent;
    ok(/期間を短く/.test(m), 'msg=' + m);
    ok(doc.getElementById('agg-body').innerHTML === '', '嘘の合計が残っている');
  });
})();

/* ═══ 5c. E5 横断集計(事業のまとめ) ═══ */
await (async () => {
  H.show('scr-agg'); await sleep(60);
  T('5c. 事業のまとめが出る(登録した事業ぶん)', () => {
    const rows = [...doc.querySelectorAll('#x-body .x-row .x-b')].map(e => e.textContent);
    ok(rows.length >= 2, '行数=' + rows.length + ' / ' + rows.join(','));
    ok(rows.includes('代行'), '事業=' + rows.join(','));
  });
  T('5c. ★動いていない事業も出す(0を隠さない)', () => {
    // db.org.businesses = 代行/空調 のうち、台帳の実績があるのは代行だけ
    const zero = [...doc.querySelectorAll('#x-body .x-row.x-zero .x-b')].map(e => e.textContent);
    ok(zero.length >= 1, '実績0の事業が出ていない');
    ok(doc.querySelector('#x-body .x-zero-tag'), '「記録なし」の印が無い');
  });
  T('5c. 月の推移が棒で出る(散布図・折れ線は作らない)', () => {
    const mo = doc.querySelectorAll('#x-body .x-months .x-mo');
    ok(mo.length >= 3, '月の棒が足りない: ' + mo.length);
    const h = doc.getElementById('scr-agg').innerHTML;
    ok(!/<canvas|scatter|polyline|<path/i.test(h), '凝ったグラフがある');
  });
  T('5c. ★支給額(円)を出していない', () => {
    const t = doc.querySelector('.x-sec').textContent;
    ok(!/支給額|手取り|差引/.test(t), '支給額を出している: ' + t.slice(0, 120));
  });
  await (async () => {
    const sel = doc.getElementById('x-span');
    sel.value = '12'; sel.dispatchEvent(new win.Event('change')); await sleep(60);
    T('5c. 期間を変えると読み直して月が増える', () => {
      // 棒は「1事業あたり月数」ぶん出る（全体は 月数 × 事業数）
      const first = doc.querySelector('#x-body .x-row');
      const per = first.querySelectorAll('.x-months .x-mo').length;
      ok(per === 12, '1事業あたり12か月ぶんの棒が出ていない: ' + per);
      ok(/2025|2026/.test(doc.getElementById('x-range').textContent), 'range=' + doc.getElementById('x-range').textContent);
    });
    sel.value = '3'; sel.dispatchEvent(new win.Event('change')); await sleep(60);
  })();
  await (async () => {
    failNext = 'ledger';
    doc.getElementById('x-reload').click(); await sleep(60);
    T('5c. ★件数上限で全部読めない時は、合計を出さずに教える', () => {
      ok(/期間を短く/.test(doc.getElementById('x-msg').textContent), 'msg=' + doc.getElementById('x-msg').textContent);
      ok(doc.getElementById('x-body').innerHTML === '', '嘘の合計が残っている');
    });
    doc.getElementById('x-reload').click(); await sleep(60);
  })();
})();

/* ═══ 5b. 日次台帳(E2) ═══ */
await (async () => {
  // 月の選択肢は「実行した日の今月」から作られるので、テストの月を強制的に足して固定する(実日付に依存させない)
  const sel = doc.getElementById('lg-ym');
  if (![...sel.options].some(o => o.value === '2026-07')) sel.insertAdjacentHTML('afterbegin', '<option value="2026-07">2026年7月</option>');
  sel.value = '2026-07';
  await win.Ledger.attach(fakeSD);
  await sleep(40);
  H.show('scr-ledger');

  T('5b. 締め方は Kyually の会社設定を読んで表示するだけ', () => {
    ok(calls.some(c => c[0] === 'company.getShime'), '締め方を読んでいない');
    const t = doc.getElementById('lg-shime').textContent;
    ok(/10日締め/.test(t), '締め方が出ていない: ' + t);
    ok(/給料明細アプリ/.test(t), 'どこの設定か書いていない: ' + t);
    // ★設定UIを作っていない(二重管理しない)
    const h = doc.getElementById('scr-ledger').innerHTML;
    ok(!/shimeMethod|締め方を変え|<select[^>]*shime/i.test(h), '締め方の設定UIがある');
  });
  T('5b. 10日締め=期間タブが3つ', () => {
    const tabs = [...doc.querySelectorAll('#lg-ptabs .ptab')];
    ok(tabs.length === 3, 'タブ数=' + tabs.length);
    ok(tabs.map(t => t.textContent).join(',') === '1〜10,11〜20,21〜末', tabs.map(t => t.textContent).join(','));
  });
  T('5b. ★人ごとの実績が実数値で合う(鈴木 1〜10 = 売上8,000/2件/2時間45分)', () => {
    win.Ledger.state.periodKey = 'P1'; win.Ledger.recompute();
    const txt = doc.getElementById('lg-body').textContent.replace(/\s+/g, '');
    ok(/鈴木花子/.test(txt), '人が出ていない');
    ok(/¥8,000/.test(txt), '売上が違う: ' + txt);          // 4200+3800
    ok(/2件/.test(txt), '件数が違う: ' + txt);
    ok(/2時間45分/.test(txt), '時間が違う: ' + txt);        // 90+75=165分
  });
  T('5b. ★支給額(円)を出していない=金額はKyuallyの仕事', () => {
    const t = doc.getElementById('scr-ledger').textContent;
    // 「給料明細アプリが支給額を計算します」という案内文だけは許す(それ以外に支給額の語を出さない)
    const body = t.replace('給料明細アプリが支給額を計算します', '');
    ok(!/支給額|支給合計|お給料|手取り|差引支給/.test(body), '支給額を出している: ' + body.slice(0, 140));
    ok(/給料明細アプリが支給額を計算します/.test(t), 'どこで金額が出るのか書いていない');
    // 実績値のラベルしか使っていない
    ok(/売上|件|時間|金額/.test(t), '実績値が出ていない');
  });
  T('5b. まだ入れていない人も出る(入れる導線がある)', () => {
    const t = doc.getElementById('lg-body').textContent;
    ok(/まだ入れていません/.test(t), '未入力の人が出ていない');
    ok(doc.querySelectorAll('#lg-body [data-lg-add]').length === 3, '＋入れるが人数ぶん無い');
  });

  // 入力画面
  doc.querySelector('#lg-body [data-lg-add="e2"]').click(); await sleep(20);
  T('5b. ＋入れる→入力画面。期間の外の日は選べない', () => {
    ok(doc.getElementById('scr-lg-entry').classList.contains('active'), '入力画面が開かない');
    ok(/鈴木 花子/.test(doc.getElementById('lge-title').textContent));
    ok(doc.getElementById('lge-ymd').min === '2026-07-01', 'min=' + doc.getElementById('lge-ymd').min);
    ok(doc.getElementById('lge-ymd').max === '2026-07-10', 'max=' + doc.getElementById('lge-ymd').max);
  });
  T('5b. 事業はマスタからチップで選ぶ(実データ接地・捏造しない)', () => {
    const chips = [...doc.querySelectorAll('#lge-biz-chips .chip-btn')].map(c => c.getAttribute('data-lg-biz'));
    ok(chips.includes('代行') && chips.includes('空調'), '事業チップ=' + chips.join(','));
    ok(chips.includes(''), '「指定しない」が無い');
  });
  T('5b. 時間は +30分/+1時間 で足せる', () => {
    doc.querySelector('[data-hm="60"]').click();
    doc.querySelector('[data-hm="30"]').click();
    ok(doc.getElementById('lge-hm').value === '1:30', 'hm=' + doc.getElementById('lge-hm').value);
    doc.querySelector('[data-hm="0"]').click();
    ok(doc.getElementById('lge-hm').value === '', '消せない');
  });
  T('5b. 件数は －/＋ で増減し、0未満にならない', () => {
    doc.getElementById('lge-cnt-plus').click(); doc.getElementById('lge-cnt-plus').click();
    ok(doc.getElementById('lge-count').value === '2');
    doc.getElementById('lge-cnt-minus').click(); doc.getElementById('lge-cnt-minus').click(); doc.getElementById('lge-cnt-minus').click();
    ok(doc.getElementById('lge-count').value === '0', 'マイナスになった: ' + doc.getElementById('lge-count').value);
  });
  await (async () => {
    doc.getElementById('lge-uriage').value = ''; doc.getElementById('lge-count').value = '';
    doc.getElementById('lge-save').click(); await sleep(20);
    T('5b. 実績値(売上/時間/件数/金額)が無ければ保存させない', () => {
      ok(/どれか1つは入れて/.test(doc.getElementById('lge-msg').textContent), 'msg=' + doc.getElementById('lge-msg').textContent);
    });
  })();
  await (async () => {
    doc.getElementById('lge-ymd').value = '2026-07-20';   // この期間(1〜10)の外
    doc.getElementById('lge-uriage').value = '1000';
    doc.getElementById('lge-save').click(); await sleep(20);
    T('5b. 期間の外の日は保存させない(期間がズレた記録を作らない)', () => {
      ok(/この期間/.test(doc.getElementById('lge-msg').textContent), 'msg=' + doc.getElementById('lge-msg').textContent);
    });
  })();
  const before = db.ledger.length;
  await (async () => {
    doc.getElementById('lge-ymd').value = '2026-07-04';
    doc.getElementById('lge-uriage').value = '2500';
    doc.getElementById('lge-count').value = '1';
    doc.querySelector('[data-lg-biz="代行"]').click();
    doc.getElementById('lge-save').click(); await sleep(60);
    T('5b. ★入れられる・書き先は pay_ledger だけ', () => {
      ok(db.ledger.length === before + 1, '増えていない');
      const c = calls.filter(c => c[0] === 'ledger.upsert').pop();
      ok(c[1].employeeId === 'e2' && c[1].ymd === '2026-07-04', '渡した中身=' + JSON.stringify(c[1]));
      ok(c[1].data.uriage === 2500 && c[1].data.business === '代行', 'data=' + JSON.stringify(c[1].data));
      ok(!calls.some(x => /payslip/i.test(x[0])), 'pay_payslips に書いている');
    });
    T('5b. ★入れた直後に「続けてもう1件」(1日に何本も入れる現場)', () => {
      ok(doc.getElementById('scr-lg-entry').classList.contains('active'), '入力画面から離れてしまった');
      ok(/続けてもう1件/.test(doc.getElementById('lge-msg').textContent), 'msg=' + doc.getElementById('lge-msg').textContent);
      ok(doc.getElementById('lge-ymd').value === '2026-07-04', '同じ日が残っていない');
      ok(doc.getElementById('lge-uriage').value === '', '前の金額が残っている');
    });
  })();
  H.show('scr-ledger'); win.Ledger.recompute(); await sleep(20);
  T('5b. 合計に反映される(8,000 + 2,500 = 10,500)', () => {
    const txt = doc.getElementById('lg-body').textContent.replace(/\s+/g, '');
    ok(/¥10,500/.test(txt), '合計が反映されていない: ' + txt);
  });
  // 中身を見る（1日複数行が見える）
  doc.querySelector('#lg-body [data-lg-list="e2"]').click(); await sleep(20);
  T('5b. ★中身を見ると「同じ日に2件」が見える', () => {
    ok(doc.getElementById('mo').classList.contains('on'), 'モーダルが開かない');
    const t = doc.getElementById('mo-b').textContent;
    ok(/2026-07-01（2件）/.test(t), '同じ日の複数行が見えない: ' + t.slice(0, 120));
  });
  await (async () => {
    doc.querySelector('#mo-b [data-lg-edit]').click(); await sleep(20);
    T('5b. 記録をタップすると直せる(削除も出る)', () => {
      ok(doc.getElementById('scr-lg-entry').classList.contains('active'), '編集が開かない');
      ok(doc.getElementById('lge-del').style.display !== 'none', '削除が出ていない');
      ok(doc.getElementById('lge-save').textContent === '直す', 'ボタン=' + doc.getElementById('lge-save').textContent);
    });
    const n = db.ledger.length;
    doc.getElementById('lge-del').click(); await sleep(60);
    T('5b. 削除できる(確認あり)', () => {
      ok(db.ledger.length === n - 1, '消えていない');
      ok(doc.getElementById('scr-ledger').classList.contains('active'), '台帳に戻っていない');
    });
  })();
  await (async () => {
    doc.querySelector('#lg-body [data-lg-add="e1"]').click(); await sleep(20);
    failNext = 'lgsave';
    doc.getElementById('lge-uriage').value = '999';
    doc.getElementById('lge-save').click(); await sleep(40);
    T('5b. ★保存に失敗したら「入れました」と嘘をつかない', () => {
      const m = doc.getElementById('lge-msg');
      ok(!/入れました/.test(m.textContent), '失敗なのに成功と出た: ' + m.textContent);
      ok(m.className.indexOf('err') >= 0, '赤くなっていない');
    });
    doc.getElementById('lge-cancel').click(); await sleep(10);
  })();
  T('5b. 月を切り替えると読み直す', () => {
    const n = calls.filter(c => c[0] === 'ledger.list').length;
    sel.value = sel.options[sel.options.length - 1].value;
    sel.dispatchEvent(new win.Event('change'));
    ok(calls.filter(c => c[0] === 'ledger.list').length > n, '読み直していない');
    sel.value = '2026-07'; sel.dispatchEvent(new win.Event('change'));
  });
})();
await sleep(60);
H.show('scr-hub');

/* ═══ 6. 画面移動と全ボタン ═══ */
T('6. 下部タブで4画面を行き来できる', () => {
  ['scr-hub', 'scr-ledger', 'scr-data', 'scr-agg'].forEach(id => {
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
