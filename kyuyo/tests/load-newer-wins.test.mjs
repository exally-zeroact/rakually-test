/* load-newer-wins.test.mjs — ★ロード側 newer-wins＝古いクラウドが 新しいローカル編集を 消さない★（jsdom・本物の applyCloudState）
 * ============================================================================
 * ★守る事（2026-10-07・司さん方針）★
 *   離脱で クラウド保存を 取りこぼすと localStorage には 残るのに、前は 次回ロードで applyCloudState が
 *   ★updated_at を見ず クラウドで 無条件上書き★＝新しいローカル編集が 古いクラウドに 消えていた（remote-always-wins 退化）。
 *   直し＝store.js の 純関数 Store.reconcileOnLoad で判じ、apply==='local' なら クラウドで上書きしない（ローカル優先）＋
 *   保護ドメイン(confirmed/nencho/bonus/payPatterns)は Store.unionNeverLose で クラウドの分も 絶対に落とさない。
 * ★この門が 見る事★ … ①dirty無→クラウド採用(従来) ②ローカル編集(dirty) ③据置クラウド再ロード→
 *   ★ローカル編集が 残る(消えない)★＋confirmed は 両端末の分が 揃う(union)。★本物の applyCloudState を 呼ぶ(真似ない)★。
 * ★空振り止め（--waza）★ … reconcileOnLoad を「常に apply:'cloud'」に差し替えて注入＝退行すると ローカルが消える＝門が赤。
 * 使い方: node kyuyo/tests/load-newer-wins.test.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }
const WAZA = process.argv.includes('--waza');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script'); el.textContent = fs.readFileSync(p, 'utf8'); doc.body.appendChild(el);
}
await sleep(400);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.applyCloudState || !A.state || !A.persistSaveDebounced || !win.PayslipSyncMeta) { console.log('✗ ★app.js から applyCloudState／state／persistSaveDebounced／PayslipSyncMeta が 取れない★'); process.exit(1); }
if (!win.Store || typeof win.Store.reconcileOnLoad !== 'function' || typeof win.Store.unionNeverLose !== 'function') { console.log('✗ ★Store.reconcileOnLoad／unionNeverLose が 読めない★'); process.exit(1); }

if (WAZA) {
  /* ★わざと退行＝reconcileOnLoad を 常に クラウド採用(replace)に＝ロード側 newer-wins を 殺す★ */
  win.Store.reconcileOnLoad = function () { return { apply: 'cloud', push: false, conflict: false, protect: 'replace' }; };
}

console.log('\n[load-newer-wins] 古いクラウドが 新しいローカル編集を 消さない' + (WAZA ? '  ★★newer-wins を 殺した回★★' : ''));

const emp = (id, name) => Object.assign(A.defEmp(), { id: id, name: name });

/* ① 初回ロード（dirty無）＝クラウドを採る（従来）。baseCoUA=UA1 が立つ */
A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], confirmed: { '2026-01': { e1: true } }, _coUA: 'UA1' });
const m1 = win.PayslipSyncMeta ? win.PayslipSyncMeta() : {};
T('① 初回ロードは クラウドを採る（dirty無）', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎', '名前=' + (A.state.employees[0] && A.state.employees[0].name));
T('① baseCoUA が UA1 に／dirty=false', m1.baseCoUA === 'UA1' && m1.dirty === false, JSON.stringify(m1));

/* ② ローカルで 編集（dirty=true）＝離脱で クラウドに 届かなかった体 */
A.state.employees[0].name = 'ローカル花子';
A.persistSaveDebounced();
const m2 = win.PayslipSyncMeta ? win.PayslipSyncMeta() : {};
T('② ローカル編集で dirty=true', m2.dirty === true, JSON.stringify(m2));

/* ③ 据置クラウド(同じ _coUA=UA1)を 再ロード＝★ローカル編集が 残る★＋confirmed は 両方 揃う(union) */
A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], confirmed: { '2026-01': { e1: true }, '2026-02': { e2: true } }, _coUA: 'UA1' });
if (!WAZA) {
  T('③ ★古いクラウドで ローカル編集を 消さない（ローカル花子 のまま）★', (A.state.employees[0] && A.state.employees[0].name) === 'ローカル花子',
    '消えた＝' + (A.state.employees[0] && A.state.employees[0].name));
  T('③ ★confirmed は 両端末の分が 揃う（2026-01.e1＋2026-02.e2・union）★', !!(A.state.confirmed && A.state.confirmed['2026-01'] && A.state.confirmed['2026-01'].e1 && A.state.confirmed['2026-02'] && A.state.confirmed['2026-02'].e2),
    JSON.stringify(A.state.confirmed));
  /* ④ 真の競合（クラウドが進んだ UA2・自分送りでない）＝stage1 は クラウド採用（従業員はクラウド＝黙って他端末の人を消さない）、
     ★但し confirmed 等 保護ドメインは union で 1件も落とさない（司さん②・taiketsu B の直し）★。Q1(競合でローカル優先)は Phase4+司さんA 後の次段。 */
  A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], confirmed: { '2026-03': { e3: true } }, _coUA: 'UA2' });
  T('④ 競合（クラウド進行）は 従業員はクラウド採用＝黙って他端末の人を消さない（stage1）', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎',
    '従業員=' + JSON.stringify((A.state.employees || []).map(function (x) { return x.name; })));
  T('④ ★競合でも confirmed は 1件も落とさない（2026-01/02＝ローカル分＋2026-03＝クラウド分・union）★',
    !!(A.state.confirmed && A.state.confirmed['2026-01'] && A.state.confirmed['2026-01'].e1 && A.state.confirmed['2026-02'] && A.state.confirmed['2026-02'].e2 && A.state.confirmed['2026-03'] && A.state.confirmed['2026-03'].e3),
    JSON.stringify(A.state.confirmed));
  var m4 = win.PayslipSyncMeta ? win.PayslipSyncMeta() : {};
  T('④ 競合でクラウドを採った後は baseCoUA=UA2／dirty=false', m4.baseCoUA === 'UA2' && m4.dirty === false, JSON.stringify(m4));

  /* ⑤ ★dirty=false の 通常ロード＝別端末が更新した 賞与の“値”が 古い値に 巻き戻らない（クラウド値が勝つ）★
     ＝taiketsu 2026-10-07 の「保護unionがローカル優先で値が巻き戻る」穴を 縛る。 */
  A.state.bonus = { payYm: '2026-06', payDay: '25', byEmp: { e1: { amount: 100 } } };   /* 手元＝古い値100（dirty=false＝④で clean） */
  A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], bonus: { payYm: '2026-06', payDay: '25', byEmp: { e1: { amount: 200 }, e2: { amount: 9 } } }, _coUA: 'UA2' });
  T('⑤ ★dirty=false で 賞与の値が 巻き戻らない（クラウドの 200 になる・100 に戻らない）★', !!(A.state.bonus && A.state.bonus.byEmp && A.state.bonus.byEmp.e1 && A.state.bonus.byEmp.e1.amount === 200),
    '巻き戻った＝' + JSON.stringify(A.state.bonus && A.state.bonus.byEmp));
  T('⑤ 別端末が足した賞与(e2)も 入る（消さない）', !!(A.state.bonus && A.state.bonus.byEmp && A.state.bonus.byEmp.e2 && A.state.bonus.byEmp.e2.amount === 9), JSON.stringify(A.state.bonus && A.state.bonus.byEmp));

  /* ⑥ ★Phase3＝未送信(dirty)を online/タブ復帰で 送り直す（離脱イベントが発火しない端末の本線）★（PayslipSyncMeta は上で必須済＝fail-openしない） */
  var d0 = win.PayslipSyncMeta().drainKai;             /* ⑤直後は dirty=false（クラウド採用） */
  win.dispatchEvent(new win.Event('online'));
  T('⑥ dirty=false なら online で 送り直さない（無駄打ちしない）', win.PayslipSyncMeta().drainKai === d0, 'drainKai=' + win.PayslipSyncMeta().drainKai + ' / dirty=' + win.PayslipSyncMeta().dirty);
  A.persistSaveDebounced();                            /* 編集＝dirty=true（未送信） */
  T('⑥ 編集で dirty=true', win.PayslipSyncMeta().dirty === true, JSON.stringify(win.PayslipSyncMeta()));
  win.dispatchEvent(new win.Event('online'));
  T('⑥ ★dirty=true なら online（線が戻った）で 送り直す（drain）★', win.PayslipSyncMeta().drainKai === d0 + 1, 'drainKai=' + win.PayslipSyncMeta().drainKai);
  try { Object.defineProperty(doc, 'visibilityState', { value: 'visible', configurable: true }); } catch (e) {}
  doc.dispatchEvent(new win.Event('visibilitychange'));
  T('⑥ ★dirty=true なら タブ可視(visible)でも 送り直す★', win.PayslipSyncMeta().drainKai === d0 + 2, 'drainKai=' + win.PayslipSyncMeta().drainKai);

  /* ⑦ ★未送信の 印が この端末に 書けない時は 黙らない★（2026-10-11・前は _saveSyncMeta の catch が 空）
     書けないまま 閉じると 次に 開いた時 dirty=false で 読まれ、クラウドが 手元の 編集を 上書きする 道が 在る。
     ⇒ 印の 鍵だけ setItem を 投げさせ、★どの画面でも 見える 帯（#save-alert）★が 出るかを 見る。 */
  const alertEl = doc.getElementById('save-alert');
  if (alertEl) { alertEl.hidden = true; alertEl.textContent = ''; }
  const SP = win.Storage.prototype, motoSet = SP.setItem;
  SP.setItem = function (k, v) { if (k === 'payslip_syncmeta_v1') throw new win.DOMException('QuotaExceededError', 'QuotaExceededError'); return motoSet.call(this, k, v); };
  const _ce = console.error; console.error = () => {};
  try { A.persistSaveDebounced(); } finally { SP.setItem = motoSet; console.error = _ce; }
  T('⑦ ★未送信の 印が 書けない時は 帯（#save-alert）で 知らせる★', !!(alertEl && !alertEl.hidden && /保存できません/.test(alertEl.textContent)),
    '帯=' + (alertEl ? (alertEl.hidden ? '隠れたまま' : alertEl.textContent) : '無い'));
  /* ⑧ ★0.5秒後の 本保存（persistSave）の 後も 帯が 残り「閉じないで」を 言い続ける★（taiketsu 10-11）
     前は 中身の 控えが 書ければ「自動保存済」（'ok'）で 帯が 消えた＝倉庫に 繋がらない形では 毎回この道。
     ★印は 書けていない★＝閉じれば 次に dirty=false で 読まれ 手元の 編集が 負ける＝「保存済」は 嘘。 */
  await sleep(800);
  T('⑧ ★本保存の 後も 帯が 残り「閉じないで」と 言う（嘘の「自動保存済」で 消えない）★', !!(alertEl && !alertEl.hidden && /閉じないで/.test(alertEl.textContent)),
    '帯=' + (alertEl ? (alertEl.hidden ? '隠れた' : alertEl.textContent) : '無い'));
  /* ⑨ 次の 編集で 印が 書ければ 旗を 降ろし、本保存で 帯が 消える（出しっぱなしに しない） */
  A.persistSaveDebounced();
  await sleep(800);
  T('⑨ 印が 書けたら 本保存で 帯が 消える', !!(alertEl && alertEl.hidden), '帯=' + (alertEl ? (alertEl.hidden ? '隠れた' : alertEl.textContent) : '無い'));
  /* ⑩⑪ ★クラウドの 道★（jsdom には 倉庫が 無い＝偽の cloudSaveState を 差す）
     ⑩ 印が 書けなくても クラウドに 届けば 帯を 消す（中身は クラウドに 在る＝言う事と 合う）
     ⑪ 通信で 転んだら「ローカルのみ保存」に「閉じないで」を 足す（印が 無い＝手元は 次の 読み込みで 負ける） */
  const kumoMoto = win.Store.cloudSaveState;
  const inKowasu = () => { SP.setItem = function (k, v) { if (k === 'payslip_syncmeta_v1') throw new win.DOMException('QuotaExceededError', 'QuotaExceededError'); return motoSet.call(this, k, v); }; };
  console.error = () => {};
  try {
    win.Store.cloudSaveState = () => Promise.resolve({ ok: true });
    inKowasu(); A.persistSaveDebounced(); SP.setItem = motoSet;
    await sleep(800);
    T('⑩ 印が 書けなくても クラウドに 届けば 帯を 消す', !!(alertEl && alertEl.hidden), '帯=' + (alertEl ? (alertEl.hidden ? '隠れた' : alertEl.textContent) : '無い'));
    win.Store.cloudSaveState = () => Promise.reject(new Error('no net'));
    inKowasu(); A.persistSaveDebounced(); SP.setItem = motoSet;
    await sleep(800);
    T('⑪ 通信で 転んだら「閉じないで」を 言い続ける', !!(alertEl && !alertEl.hidden && /ローカルのみ/.test(alertEl.textContent) && /閉じないで/.test(alertEl.textContent)),
      '帯=' + (alertEl ? (alertEl.hidden ? '隠れた' : alertEl.textContent) : '無い'));
  } finally { SP.setItem = motoSet; console.error = _ce; win.Store.cloudSaveState = kumoMoto; }

  /* ⑫ ★古い 保存の ok で 旗を 降ろさない★（taiketsu 10-11 指摘A）
     編集1を 送っている 途中に 編集2の 印も 書けず、編集1の 返事（ok）が 来た後に 編集2が 通信で 転ぶ。
     編集1の ok は 編集2を 運んでいない＝旗は 立ったまま「閉じないで」を 言い続ける。
     ⑬ 旗が 立っている 間は 小さな 字（#save-status の 元＝state._savedAt）にも「自動保存済」を 立てない（指摘B） */
  console.error = () => {};
  try {
    let tokeru = null;
    win.Store.cloudSaveState = () => new Promise((res) => { tokeru = res; });           /* 編集1の 送り＝返事を 止めておく */
    inKowasu(); A.persistSaveDebounced(); SP.setItem = motoSet;                          /* 編集1（印 書けない） */
    await sleep(700);                                                                     /* 本保存1 が 走って 返事待ち */
    A.state._savedAt = '12:34';                                                           /* 前に 一度 ok が 在った 体 */
    inKowasu(); A.persistSaveDebounced(); SP.setItem = motoSet;                          /* 編集2（印 書けない）＝本保存2 は まだ */
    T('⑬ 旗を 立てた 直後に 古い「自動保存済」（state._savedAt）を 消す', !A.state._savedAt, '_savedAt=' + A.state._savedAt);
    win.Store.cloudSaveState = () => Promise.reject(new Error('no net'));               /* 本保存2 は 転ぶ */
    if (tokeru) tokeru({ ok: true });                                                     /* 編集1の 返事 ok が 先に 着く */
    await sleep(50);
    T('⑬ 旗が 立っている 間は state._savedAt を 立てない（小さな 字が「自動保存済」と 食い違わない）', !A.state._savedAt, '_savedAt=' + A.state._savedAt);
    await sleep(800);                                                                     /* 本保存2 が 走って 転ぶ */
    T('⑫ ★古い 保存の ok で 旗を 降ろさない＝後の 編集が 転んだら「閉じないで」★', !!(alertEl && !alertEl.hidden && /閉じないで/.test(alertEl.textContent)),
      '帯=' + (alertEl ? (alertEl.hidden ? '隠れた' : alertEl.textContent) : '無い') + '／返事を 止めた=' + !!tokeru);
  } finally { SP.setItem = motoSet; console.error = _ce; win.Store.cloudSaveState = kumoMoto; }

  /* ⑭⑮⑯ ★自分の 保存が 届いた 後に 閉じても、送れなかった 編集が 開き直しで 消えない★（2026-10-12・taiketsu が 見つけた 前からの 穴）
     前は 自分の 保存が 届いても 基準の 時刻（baseCoUA）が 進まず、開き直すと「クラウドが 基準から 動いた」＝conflict で クラウドを 採り、
     送れなかった 編集が 黙って 消えた（自分が 送った 時刻の 名簿 _okuttaUA は 手元に 書かれず 開き直すと 空）。
     ＝倉庫の 字は 末尾の 0 を 落とす（送「…01.120Z」／返「…01.12+00:00」）ので、比べは ms で。 */
  console.error = () => {};
  try {
    const U1_OKURU = '2026-10-12T01:00:01.120Z', U1_KAESU = '2026-10-12T01:00:01.12+00:00';
    A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '基準花子')], _coUA: 'UA9' });   /* 読み込み＝基準 UA9・dirty=false */
    let tokeru3 = null;
    win.Store.cloudSaveState = () => new Promise((res) => { tokeru3 = res; });
    A.state.employees[0].name = '編集1'; A.persistSaveDebounced();                       /* 編集1 */
    await sleep(700);                                                                     /* 本保存1 が 返事待ち */
    A.state.employees[0].name = '編集2'; A.persistSaveDebounced();                       /* 編集2（本保存2 は まだ） */
    win.Store.cloudSaveState = () => Promise.reject(new Error('no net'));               /* 本保存2 は 届かない（閉じた 体） */
    if (tokeru3) tokeru3({ ok: true, coUA: U1_OKURU });                                   /* 編集1 が 届いた（倉庫は U1） */
    await sleep(50);
    let kaki2 = null; try { kaki2 = JSON.parse(win.localStorage.getItem('payslip_syncmeta_v1') || 'null'); } catch (e) { kaki2 = null; }
    T('⑭ ★古い 保存の ok で 未送信の 印を 消さない（編集2 は まだ 送っていない）★', win.PayslipSyncMeta().dirty === true && !!(kaki2 && kaki2.dirty === true),
      'メモリ=' + win.PayslipSyncMeta().dirty + '／端末=' + JSON.stringify(kaki2));
    await sleep(800);                                                                     /* 本保存2 が 転ぶ */
    /* 開き直し＝★手元の 中身は 端末の 写し（PKEY）から★（本物の 開き直しと 同じ）／倉庫は 編集1（U1・倉庫の 字の 形） */
    const utsushi = (() => { try { return JSON.parse(win.localStorage.getItem('payslip_state_v1') || 'null'); } catch (e) { return null; } })();
    if (utsushi && utsushi.employees) A.state.employees = utsushi.employees.map((x) => Object.assign(A.defEmp(), x));
    let okuriKai = 0; win.Store.cloudSaveState = () => { okuriKai++; return Promise.resolve({ ok: true, coUA: '2026-10-12T01:30:00.000Z' }); };
    A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '編集1')], _coUA: U1_KAESU });
    T('⑮ ★自分の 保存が 届いた 後に 閉じても 送れなかった 編集2 が 開き直しで 残る（端末の 写しから）★', (A.state.employees[0] && A.state.employees[0].name) === '編集2',
      '名前=' + (A.state.employees[0] && A.state.employees[0].name) + '／写し=' + (utsushi && utsushi.employees && utsushi.employees[0] && utsushi.employees[0].name) + '／印=' + JSON.stringify(win.PayslipSyncMeta()));
    await sleep(800);
    T('⑮ 残した 編集2 を 送り直した（cloudSaveState が 呼ばれた）', okuriKai >= 1, '送った 回数=' + okuriKai);
    /* ⑯ 別の 端末が その後 U2 に 進めていたら 今まで通り クラウド（stage1・他の 端末の 人を 黙って 消さない） */
    A.state.employees[0].name = '編集3'; A.persistSaveDebounced();
    await sleep(800);                                                                     /* 本保存3 も 転ぶ（dirty のまま） */
    A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '別の端末')], _coUA: '2026-10-12T02:00:00.5+00:00' });
    T('⑯ 別の 端末が 進めていたら 今まで通り クラウドを 採る（conflict）', (A.state.employees[0] && A.state.employees[0].name) === '別の端末',
      '名前=' + (A.state.employees[0] && A.state.employees[0].name));

    /* ⑰ ★端末の 写し（PKEY）が 書けない 時は 基準を 進めない＝開き直しで 古い 写しが「据置」で 勝たない★（taiketsu 10-12 指摘1・組A）
       写しは 大きいので 書けず、印は 小さいので 書ける。その時に 基準だけ U5 に 進むと、開き直しで 古い 写し（基準の 前の 中身）を 採って
       送り直し＝倉庫の 新しい 中身と 人を 消す。⇒ 進めなければ conflict でクラウド（今まで通り・消えない） */
    A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '古い写し')], _coUA: '2026-10-12T03:00:00.000Z' });
    A.persistSaveDebounced(); await sleep(700);                                          /* 写し＝『古い写し』が 端末に 書ける */
    const mae17 = win.PayslipSyncMeta().baseCoUA;
    const SP2 = win.Storage.prototype, moto2 = SP2.setItem;
    SP2.setItem = function (k, v) { if (k === 'payslip_state_v1') throw new win.DOMException('QuotaExceededError', 'QuotaExceededError'); return moto2.call(this, k, v); };
    try {
      win.Store.cloudSaveState = () => Promise.resolve({ ok: false, reason: 'no net' });
      A.state.employees[0].name = '新しい中身'; A.persistSaveDebounced(); await sleep(700);   /* dirty（写しは 書けない） */
      win.Store.cloudSaveState = () => Promise.resolve({ ok: true, coUA: '2026-10-12T03:05:00.000Z' });
      A.persistSaveDebounced(); await sleep(700);                                          /* 倉庫には『新しい中身』が 届く（写しは 古いまま） */
    } finally { SP2.setItem = moto2; }
    T('⑰ 写しが 書けない 間は 基準の 時刻を 進めない', win.PayslipSyncMeta().baseCoUA === mae17, '前=' + mae17 + '／今=' + win.PayslipSyncMeta().baseCoUA);

    /* ⑱ ★同じ 端末の 古い タブが 後から 閉じても、古い 写しが「据置」で 勝たない★（taiketsu 10-12 指摘B）
       タブ2（基準 T0 の 中身）を 開いたまま タブ1で 保存が 届き 基準 T1。タブ2が 閉じる時に 古い 写しを 書く。
       前は 基準を 印（SMKEY）だけに 持ち T1 のまま＝開き直しで 倉庫 T1 と 同じ＝タブ2の 古い 中身を 採って 送り、人を 消した。
       今は 写しの 中に 基準（T0）が 入る＝倉庫 T1 と 違う＝conflict で クラウド（消えない）。 */
    if (typeof A.persistLoad !== 'function') { T('⑱ persistLoad が 試験の 口に 在る', false, '無い'); }
    else {
      const T0 = '2026-10-12T04:00:00.000Z', T1 = '2026-10-12T04:10:00.000Z';
      A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '始め')], _coUA: T0 });
      win.Store.cloudSaveState = () => Promise.resolve({ ok: false, reason: 'no net' });
      A.state.employees[0].name = 'タブ2の中身'; A.persistSaveDebounced(); await sleep(700);
      const tab2Utsushi = win.localStorage.getItem('payslip_state_v1');                    /* タブ2が 持つ 写し（基準 T0 の 時の 物） */
      win.Store.cloudSaveState = () => Promise.resolve({ ok: true, coUA: T1 });
      A.state.employees[0].name = 'タブ1の人E'; A.persistSaveDebounced(); await sleep(700); /* タブ1＝倉庫に 届いた（T1） */
      win.Store.cloudSaveState = () => Promise.resolve({ ok: false, reason: 'no net' });
      A.state.employees[0].name = 'タブ1の編集F'; A.persistSaveDebounced(); await sleep(700); /* 届かない＝dirty */
      win.localStorage.setItem('payslip_state_v1', tab2Utsushi);                           /* 古い タブ2が 後から 閉じて 写しを 書いた */
      A.persistLoad();                                                                      /* 開き直し（本物） */
      A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'タブ1の人E')], _coUA: T1 });
      T('⑱ ★古い タブの 写しが 後から 書かれても 倉庫の 新しい 中身を 消さない（conflict→クラウド）★', (A.state.employees[0] && A.state.employees[0].name) === 'タブ1の人E',
        '名前=' + (A.state.employees[0] && A.state.employees[0].name) + '／印=' + JSON.stringify(win.PayslipSyncMeta()));
    }

    /* ⑲ 写しに 足す 基準（_syncBase）は クラウドへ 送る 中身に 混ぜない（taiketsu 10-12・`var o=s` に 壊すと 混ざる） */
    let okutta = null;
    win.Store.cloudSaveState = (snap) => { okutta = snap; return Promise.resolve({ ok: true, coUA: '2026-10-12T05:00:00.000Z' }); };
    A.persistSaveDebounced(); await sleep(700);
    win.Store.cloudSaveState = (snap) => { okutta = snap; return Promise.resolve({ ok: true, coUA: '2026-10-12T05:01:00.000Z' }); };
    A.persistSaveDebounced(); await sleep(700);                                            /* 2回目＝1回目の .then で 写しを 書いた 後 */
    T('⑲ クラウドへ 送る 中身に _syncBase が 混ざらない', !!okutta && !Object.prototype.hasOwnProperty.call(okutta, '_syncBase'), okutta ? ('鍵=' + Object.keys(okutta).join(',')) : '送られていない');

    /* ⑳ ★確定は クリックから 入る＝押した 時に 未送信の 印が 立つ★（2026-10-12・taiketsu 指摘7 の 確かめ）
       確定の 受け手（app.js の #input-list の click・.econf）は persistSave() を 直接 呼び、自分では 印を 立てない。
       印を 立てて いるのは document の capture の 受け手（input/change/click → persistSaveDebounced）だけ。
       ⇒ ★本物の 確定の チェック（.econf）を 押し★、届かずに 閉じても、開き直しで 確定が 残る事を 縛る。
       ★開き直しの 前に メモリの 確定を 消す★＝端末の 写しから 戻った 事を 見る（メモリが 残っているだけで 緑に しない）。
       capture を 外すと 赤／受け手が 確定を 立てなく なっても 赤。 */
    {
      const T20 = '2026-10-12T06:00:00.000Z';
      const e20 = Object.assign(A.defEmp(), { id: 'e20', name: '確定の人', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
      A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e20], confirmed: {}, _coUA: T20 });   /* dirty=false・確定 無し */
      win.Store.cloudSaveState = () => Promise.resolve({ ok: false, reason: 'no net' });   /* 確定の 保存は 届かない */
      const ym20 = A.state.month;
      A.renderInput();
      const box = doc.querySelector('#input-list .econf');
      if (!box) { T('⑳ 確定の チェック（.econf）が 描かれる', false, '無い'); }
      else {
        box.click();                                                                           /* ★本物の 確定の チェック★ */
        await sleep(800);
        let k20 = null; try { k20 = JSON.parse(win.localStorage.getItem('payslip_syncmeta_v1') || 'null'); } catch (e) { k20 = null; }
        T('⑳ 本物の 確定の チェックで 確定が 立つ', !!(A.state.confirmed[ym20] && A.state.confirmed[ym20].e20), JSON.stringify(A.state.confirmed[ym20]));
        T('⑳ 確定の クリックで 未送信の 印が 立つ（端末にも）', win.PayslipSyncMeta().dirty === true && !!(k20 && k20.dirty === true), 'メモリ=' + win.PayslipSyncMeta().dirty + '／端末=' + JSON.stringify(k20));
        A.state.confirmed = {};                                                                /* ★メモリの 確定を 消す★＝写しから 戻るかを 見る */
        A.persistLoad();                                                                       /* 閉じて 開き直し（本物） */
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e20], confirmed: {}, _coUA: T20 });
        T('⑳ ★届かずに 閉じても 開き直しで 確定が 残る（端末の 写しから）★', !!(A.state.confirmed && A.state.confirmed[ym20] && A.state.confirmed[ym20].e20), '確定=' + JSON.stringify(A.state.confirmed && A.state.confirmed[ym20]));
      }
    }

    /* ㉑㉒㉓ ★明細の 行が 倉庫で 落ちた 時の 札★（2026-10-12・store.js が {error} を 投げる 様に なった 後）
       ㉑ 下書き（確定して いない 月）が 落ちても「もう一度 確定して」の 札は 出さない（台帳に 入らない＝誤り。通信の 失敗は 会社の 帯が 言う）
       ㉒ ログインして いない（noUser）なら 札は 出さない（ログイン画面の 上に 出ていた・taiketsu 10-12）
       ㉓ 確定済みの 明細が 落ちたら 札が 出る（決めて 在った 警告） */
    {
      const slipMoto = win.Store.savePayslip;
      const fudaJi = () => { const t = doc.getElementById('app-toast'); return t ? (t.textContent || '').trim() : ''; };
      const fudaKesu = () => { const t = doc.getElementById('app-toast'); if (t) t.textContent = ''; };
      const e21 = Object.assign(A.defEmp(), { id: 'e21', name: '下書きの人', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
      try {
        win.Store.cloudSaveState = () => Promise.resolve({ ok: true, coUA: '2026-10-12T07:00:00.000Z' });
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e21], confirmed: {}, _coUA: '2026-10-12T07:00:00.000Z' });
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        fudaKesu(); A.persistSave(); await sleep(900);
        T('㉑ 下書きの 明細が 落ちても「保存できませんでした…確定して」の 札は 出ない', !/保存できませんでした/.test(fudaJi()), '札=' + fudaJi());
        /* ㉒ は ★本物の 確定の チェック★で 名指しの 保存を 走らせる（確定済みは 凍結で 送られない＝setConfirm＋persistSave では 空振りした） */
        let yobi22 = 0;
        win.Store.savePayslip = () => { yobi22++; const e = new Error('ログインしていない'); e.noUser = true; return Promise.reject(e); };
        A.renderInput(); const b22 = doc.querySelector('#input-list .econf');
        fudaKesu(); if (b22 && !b22.checked) b22.click(); await sleep(900);
        T('㉒ ログインして いない 時は 確定の 保存が 落ちても 札を 出さない（noUser）', yobi22 >= 1 && !/保存できませんでした/.test(fudaJi()), '保存を 呼んだ 回数=' + yobi22 + '／札=' + fudaJi());
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        A.renderInput(); const b23 = doc.querySelector('#input-list .econf');
        fudaKesu();
        if (b23 && b23.checked) { b23.click(); await sleep(200); const ok23 = [...doc.querySelectorAll('.ui-modal-ov button, .ui-modal-card button')].find((x) => /OK/.test(x.textContent || '')); if (ok23) ok23.click(); await sleep(400); A.renderInput(); const b23b = doc.querySelector('#input-list .econf'); fudaKesu(); if (b23b) b23b.click(); }
        await sleep(900);
        T('㉓ 確定済みの 明細が 落ちたら「保存できませんでした（台帳・年末調整に入っていません）」の 札が 出る', /保存できませんでした（台帳・年末調整に入っていません）/.test(fudaJi()), '札=' + fudaJi());
      } finally { win.Store.savePayslip = slipMoto; }
    }

    /* ㉔〜㉗ ★確定を 外す・月を 取り消す 時の 明細の 保存が 落ちたら 帯で 言う★（2026-10-12・指示役＝確定の 扱いは 変えず 失敗を 言うだけ）
       外すと confirmed:false の 明細を 送る。落ちると クラウドには confirmed:true の 古い 行が 残り、賃金台帳・年末調整が 数え続ける。
       ★札でなく 帯★＝月の 取り消しは 後から「Web明細から 下げました」の 札を 出す（札は 1枚を 上書き＝取り合う）。帯は 通るまで 消さない。
       ㉔ 1人の 確定を 外して 落ちたら 帯で 言う ㉕ クラウドの 保存が 通っても 帯を 消さない（「自動保存済」に しない）
       ㉖ 次の 保存で 外した 人の 明細が 通れば 帯が 消える ㉗ 一度も 確定して いない 下書きが 落ちても この 帯は 出ない */
    {
      const slipMoto = win.Store.savePayslip;
      const obi = () => { const el = doc.getElementById('save-alert'); return el && !el.hidden ? (el.textContent || '') : ''; };
      const e24 = Object.assign(A.defEmp(), { id: 'e24', name: '外す人', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
      const ym24 = A.state.month;
      const okBtn = async () => { for (let k = 0; k < 20; k++) { const b = [...doc.querySelectorAll('.ui-modal-ov button, .ui-modal-card button')].find((x) => /OK/.test(x.textContent || '')); if (b) { b.click(); return true; } await sleep(50); } return false; };
      try {
        win.Store.cloudSaveState = () => Promise.resolve({ ok: true, coUA: '2026-10-12T08:00:00.000Z' });
        const conf24 = {}; conf24[ym24] = { e24: true };
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e24], confirmed: conf24, _coUA: '2026-10-12T08:00:00.000Z' });
        const sae = doc.getElementById('save-alert'); if (sae) { sae.hidden = true; sae.textContent = ''; }
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        A.renderInput(); const b24 = doc.querySelector('#input-list .econf');
        if (b24 && b24.checked) { b24.click(); await okBtn(); }
        await sleep(1200);
        T('㉔ 1人の 確定を 外して 保存が 落ちたら 帯で「確定の 取り消しを … 確定のまま」と 言う', /取り消し/.test(obi()) && /確定のまま/.test(obi()), '確定=' + JSON.stringify(A.state.confirmed[ym24]) + '／帯=' + obi());
        A.persistSave(); await sleep(900);                                                   /* クラウドは 通る・明細は まだ 落ちる */
        T('㉕ クラウドの 保存が 通っても 外した 人の 明細が 落ちて いる 間は 帯を 消さない', /取り消し/.test(obi()), '帯=' + obi());
        win.Store.savePayslip = () => Promise.resolve({});                                   /* 通信が 戻った */
        A.persistSave(); await sleep(900);
        T('㉖ 次の 保存で 外した 人の 明細が 通れば 帯が 消える', obi() === '', '帯=' + obi());
        const e27 = Object.assign(A.defEmp(), { id: 'e27', name: '下書きの人', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e27], confirmed: {}, _coUA: '2026-10-12T08:10:00.000Z' });
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        A.persistSave(); await sleep(900);
        T('㉗ 一度も 確定して いない 下書きが 落ちても「確定の 取り消し」の 帯は 出ない', !/取り消し/.test(obi()), '帯=' + obi());
        /* ㉘ ★月の 確定を 取り消す（本物の [data-undo-month] を 押す）★＝2人とも 落ちたら 帯で「2名分」 */
        const e28a = Object.assign(A.defEmp(), { id: 'e28a', name: '月の人A', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
        const e28b = Object.assign(A.defEmp(), { id: 'e28b', name: '月の人B', pref: '東京都', birthYmd: '1991-01-01', base: 260000 });
        const conf28 = {}; conf28[ym24] = { e28a: true, e28b: true };
        win.Store.savePayslip = () => Promise.resolve({});
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e28a, e28b], confirmed: conf28, _coUA: '2026-10-12T08:20:00.000Z' });
        await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        A.renderInput(); const um = doc.querySelector('[data-undo-month]');
        if (!um) { T('㉘ 月の 取り消しの ボタンが 描かれる', false, '無い'); }
        else {
          um.click(); await okBtn(); await sleep(1500);
          T('㉘ 月の 確定を 取り消して 2人とも 落ちたら 帯で「2名分の 確定の 取り消し」と 言う', /2名分の 確定の 取り消し/.test(obi()), '確定=' + JSON.stringify(A.state.confirmed[ym24]) + '／帯=' + obi());
        }

        /* ㉙㉚㉛ ★取り消しの 帯が 嘘に ならない・前からの 帯を 消さない★（taiketsu 10-12） */
        const ymLabel = (ym) => { const m = /^(\d{4})-(\d{2})$/.exec(ym || ''); return m ? (m[1] + '年' + Number(m[2]) + '月') : ym; };
        const e29 = Object.assign(A.defEmp(), { id: 'e29', name: '外す人29', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
        const conf29 = {}; conf29[ym24] = { e29: true };
        win.Store.savePayslip = () => Promise.resolve({});
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e29], confirmed: conf29, _coUA: '2026-10-12T08:30:00.000Z' });
        await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
        /* ㉙ 印が 書けない（閉じないで）＋外した 人の 明細が 落ちる ⇒ 帯に「閉じないで」が 残る（取り消しの 字で 上書きしない） */
        const SPh = win.Storage.prototype, mothSet = SPh.setItem;
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        SPh.setItem = function (k, v) { if (k === 'payslip_syncmeta_v1') throw new win.DOMException('QuotaExceededError', 'QuotaExceededError'); return mothSet.call(this, k, v); };
        /* 会社の 保存も 通信で 転ぶ（taiketsu の S3）＝届かないので「閉じないで」は 降りない（届けば 降りるのは 前からの 決め） */
        const kumo29 = win.Store.cloudSaveState; win.Store.cloudSaveState = () => Promise.reject(new Error('no net'));
        try { A.setConfirm('e29', false); A.persistSaveDebounced(); await sleep(1200); } finally { SPh.setItem = mothSet; win.Store.cloudSaveState = kumo29; }
        T('㉙ 印が 書けない 時に 取り消しが 落ちても「閉じないで」を 消さない（両方 言う）', /閉じないで/.test(obi()) && /確定の 取り消し/.test(obi()), '帯=' + obi());
        /* 片付け（印が 書ける 様に 戻し、明細も 通す） */
        win.Store.savePayslip = () => Promise.resolve({}); A.persistSaveDebounced(); await sleep(1200);
        /* ㉚ 外した 月を 離れたら 帯は その 月を 名指しする（「次の 保存で 送り直します」と 言わない） */
        A.setConfirm('e29', true); win.Store.savePayslip = () => Promise.resolve({}); A.persistSave(); await sleep(700);
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        A.setConfirm('e29', false); A.persistSave(); await sleep(900);
        const ymMae = A.state.month; const [yy, mm] = ymMae.split('-').map(Number); const ymTsugi = mm === 12 ? (yy + 1) + '-01' : yy + '-' + String(mm + 1).padStart(2, '0');
        win.Store.savePayslip = () => Promise.resolve({});
        A.state.month = ymTsugi; A.persistSave(); await sleep(900);
        T('㉚ 外した 月を 離れても 帯は その 月（' + ymLabel(ymMae) + '）を 名指しする', obi().indexOf(ymLabel(ymMae)) >= 0 && !/次の 保存で/.test(obi()), '帯=' + obi());
        A.state.month = ymMae;
        /* ㉛ 外した 人を 消したら 帯は 消える（控えの 持ち主が 居ない） */
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた')); A.persistSave(); await sleep(900);
        A.state.employees = A.state.employees.filter((x) => x.id !== 'e29');
        win.Store.savePayslip = () => Promise.resolve({}); A.persistSave(); await sleep(900);
        T('㉛ 外した 人を 消したら 取り消しの 帯は 消える', !/確定の 取り消し/.test(obi()), '帯=' + obi());
        /* ㉜ ★前の 字が 帯に 出た 後に 取り消しの 失敗が 届いても 前の 字を 消さない★（明細の 失敗が 会社の 保存より 後に 返る 順） */
        const e32 = Object.assign(A.defEmp(), { id: 'e32', name: '外す人32', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
        const conf32 = {}; conf32[ym24] = { e32: true };
        win.Store.savePayslip = () => Promise.resolve({});
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e32], confirmed: conf32, _coUA: '2026-10-12T08:40:00.000Z' });
        await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
        const kumo32 = win.Store.cloudSaveState; win.Store.cloudSaveState = () => Promise.reject(new Error('no net'));   /* 会社は すぐ 転ぶ＝帯「ローカルのみ保存」 */
        win.Store.savePayslip = () => new Promise((_r, j) => setTimeout(() => j(new Error('倉庫で 落ちた')), 400));   /* 明細は 後から 落ちる */
        try { A.setConfirm('e32', false); A.persistSave(); await sleep(1200); } finally { win.Store.cloudSaveState = kumo32; }
        T('㉜ 前の 字（ローカルのみ保存）が 出た 後に 取り消しの 失敗が 届いても 両方 言う', /ローカルのみ保存/.test(obi()) && /確定の 取り消し/.test(obi()), '帯=' + obi());
        /* ㉝ ★開き直しても 控えが 残り 帯が 戻る★（taiketsu 10-12 B＝前は メモリだけで 開き直すと 黙った） */
        if (typeof A.hazushiWasureru !== 'function') { T('㉝ 試験の 口 hazushiWasureru が 在る', false, '無い'); }
        else {
          A.hazushiWasureru(); if (sae) { sae.hidden = true; sae.textContent = ''; }          /* メモリの 控えを 消す＝開き直しの 体 */
          A.state.employees = [];                                                             /* ★開いた 直後は 名簿も まだ 無い★（本物の 開き直しと 同じ＝写しから 読む 前） */
          A.persistLoad(); await sleep(300);
          T('㉝ 開き直しても 端末に 控えが 残り 取り消しの 帯が 戻る', /確定の 取り消し/.test(obi()), '帯=' + obi() + '／端末=' + win.localStorage.getItem('payslip_hazushi_v1'));
        }
        /* ㉞ ★外した 後に 退職日を 前に 直して その月に 居ない 人も、外した とおり 確定を 外す★（司さん 10-12「外したとおり確定を外す」）
           ＝明細の 数字は 作り直さず（在籍外の 月で 計算し直すと 定時決定の 読みに 変な 額が 入る）、倉庫の 行の confirmed だけを false に する（Store.unconfirmPayslip）。
           通れば 帯が 消える／落ちたら 帯で 言う */
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        const e32p = A.state.employees.find((x) => x.id === 'e32');
        if (e32p) { e32p.retired = true; e32p.taishokuYmd = '2000-01-31'; }
        /* ★外した 人だけ★に 効く 事を 見る＝在籍の 人1人と、控えに 無い 在籍外の 確定の 人1人を 並べる（taiketsu 10-12 指摘5） */
        const e34z = Object.assign(A.defEmp(), { id: 'e34z', name: '在籍の人', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
        const e34k = Object.assign(A.defEmp(), { id: 'e34k', name: '控えに無い在籍外', pref: '東京都', birthYmd: '1990-01-01', base: 250000, retired: true, taishokuYmd: '2000-01-31' });
        A.state.employees.push(e34z, e34k); A.state.confirmed[ym24] = A.state.confirmed[ym24] || {}; A.state.confirmed[ym24].e34k = true;
        const ucMoto = win.Store.unconfirmPayslip; const ucYobi = [];
        win.Store.unconfirmPayslip = (ym, id) => { ucYobi.push(ym + '|' + id); return Promise.reject(new Error('倉庫で 落ちた')); };
        A.persistSave(); await sleep(900);
        T('㉞ 在籍外の 人は 確定だけを 外しに 行き、落ちたら 帯で 言う', ucYobi.some((x) => /\|e32$/.test(x)) && /確定の 取り消し/.test(obi()), '呼んだ=' + JSON.stringify(ucYobi) + '／帯=' + obi());
        ucYobi.length = 0; win.Store.unconfirmPayslip = (ym, id) => { ucYobi.push(ym + '|' + id); return Promise.resolve({ ok: true }); };
        A.persistSave(); await sleep(900);
        T('㉞ 在籍外の 人の 確定を 外せたら 帯が 消える', ucYobi.some((x) => /\|e32$/.test(x)) && !/確定の 取り消し/.test(obi()), '呼んだ=' + JSON.stringify(ucYobi) + '／帯=' + obi());
        T('㉞ 確定を 外しに 行くのは 外した 人（e32）だけ（在籍の 人・控えに 無い 確定の 人には 行かない）', ucYobi.length === 1 && /\|e32$/.test(ucYobi[0]), '呼んだ=' + JSON.stringify(ucYobi));
        /* ㊴ ★先に 退職日を 直してから 月の 確定を 取り消しても、在籍外の 確定の 人を 外す★（taiketsu 10-12 指摘1） */
        ucYobi.length = 0;
        win.Store.savePayslip = () => Promise.resolve({});
        A.state.confirmed[ym24].e34z = true;                                                  /* 在籍の 人も 確定＝「月の 確定を 取り消す」が 出る 形 */
        A.renderInput(); const um39 = doc.querySelector('[data-undo-month]');
        if (um39) { um39.click(); await okBtn(); await sleep(1200); }
        T('㊴ 月の 取り消しで 在籍外の 確定の 人（e34k）も 確定から 外れ、確定だけを 外しに 行く', !!um39 && !(A.state.confirmed[ym24] && A.state.confirmed[ym24].e34k) && ucYobi.some((x) => /\|e34k$/.test(x)), '確定=' + JSON.stringify(A.state.confirmed[ym24]) + '／呼んだ=' + JSON.stringify(ucYobi));
        /* ㊵ ★在籍外の 人の 確定を 外すのが 後から 落ちても、月の 取り消しの 札は 緑に しない★（taiketsu 10-12【A】＝札が その 約束を 待って いなかった） */
        A.state.confirmed[ym24] = A.state.confirmed[ym24] || {}; A.state.confirmed[ym24].e34z = true; A.state.confirmed[ym24].e34k = true;
        win.Store.savePayslip = () => new Promise((res) => setTimeout(() => res({}), 30));            /* 在籍の 人の 明細は すぐ 通る */
        win.Store.unconfirmPayslip = () => new Promise((_r, j) => setTimeout(() => j(new Error('倉庫で 落ちた')), 400));   /* 在籍外の 外しは 後から 落ちる */
        A.renderInput(); const um40 = doc.querySelector('[data-undo-month]');
        const tt40 = doc.getElementById('app-toast'); if (tt40) tt40.textContent = '';
        if (um40) { um40.click(); await okBtn(); await sleep(1500); }
        const fuda40 = (doc.getElementById('app-toast') || {}).textContent || '';
        T('㊵ 在籍外の 人の 外しが 後から 落ちたら、札は「確定を取り消しました」と 言わない', !!um40 && !/確定を取り消しました/.test(fuda40) && /保存できて/.test(fuda40), '札=' + fuda40 + '／帯=' + obi());
        /* ㊶ ★月の 取り消しの 前から 送って いる 途中の 在籍外の 人が 後から 落ちても、札は 緑に しない★（taiketsu 10-12【C】＝途中の 人は 待つ 束から 外れて いた） */
        win.Store.savePayslip = () => Promise.resolve({});
        A.state.confirmed[ym24] = A.state.confirmed[ym24] || {}; A.state.confirmed[ym24].e34z = true;
        A.hazushiWasureru && A.hazushiWasureru();
        A.state.confirmed[ym24].e34k = true; A.setConfirm('e34k', false);                          /* e34k を 外した（在籍外） */
        win.Store.unconfirmPayslip = () => new Promise((_r, j) => setTimeout(() => j(new Error('倉庫で 落ちた')), 700));
        A.persistSave();                                                                      /* ふつうの 保存で e34k の 外しを 送り 始める */
        await sleep(100);
        A.renderInput(); const um41 = doc.querySelector('[data-undo-month]');
        const tt41 = doc.getElementById('app-toast'); if (tt41) tt41.textContent = '';
        if (um41) { um41.click(); await okBtn(); await sleep(1500); }
        const fuda41 = (doc.getElementById('app-toast') || {}).textContent || '';
        T('㊶ 取り消しの 前から 送って いる 途中の 人が 後から 落ちても、札は「確定を取り消しました」と 言わない', !!um41 && !/確定を取り消しました/.test(fuda41), '札=' + fuda41 + '／帯=' + obi());
        /* ㊷ ★在籍外の 人の 外しが 返らない（固まる）時も、上限で「まだ 終わって いません」と 言う★（taiketsu 10-12） */
        A.state.confirmed[ym24] = A.state.confirmed[ym24] || {}; A.state.confirmed[ym24].e34z = true; A.state.confirmed[ym24].e34k = true;
        win.Store.unconfirmPayslip = () => new Promise(() => {});
        win.__HAZUSHI_MACHI_MS__ = 600;
        A.renderInput(); const um42 = doc.querySelector('[data-undo-month]');
        const tt42 = doc.getElementById('app-toast'); if (tt42) tt42.textContent = '';
        if (um42) { um42.click(); await okBtn(); await sleep(1500); }
        const fuda42 = (doc.getElementById('app-toast') || {}).textContent || '';
        T('㊷ 在籍外の 外しが 返らなくても 上限で「まだ 終わって いません」と 言う（緑に しない）', !!um42 && /まだ 終わって いません/.test(fuda42) && !/確定を取り消しました/.test(fuda42), '札=' + fuda42);
        delete win.__HAZUSHI_MACHI_MS__;
        win.Store.unconfirmPayslip = ucMoto;
        A.state.employees = A.state.employees.filter((x) => x.id !== 'e34z' && x.id !== 'e34k');
        if (e32p) { e32p.retired = false; e32p.taishokuYmd = ''; }
        /* ㉟ ★月の 取り消しで 明細が 落ちたら 緑の「確定を取り消しました」を 出さない★（帯と 逆を 言わない） */
        const e35 = Object.assign(A.defEmp(), { id: 'e35', name: '月の人35', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
        const conf35 = {}; conf35[ym24] = { e35: true };
        win.Store.savePayslip = () => Promise.resolve({});
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e35], confirmed: conf35, _coUA: '2026-10-12T08:50:00.000Z' });
        await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
        win.Store.savePayslip = () => Promise.reject(new Error('倉庫で 落ちた'));
        A.renderInput(); const um35 = doc.querySelector('[data-undo-month]');
        const toastJi = () => { const t = doc.getElementById('app-toast'); return t ? (t.textContent || '').trim() : ''; };
        if (um35) { const tt = doc.getElementById('app-toast'); if (tt) tt.textContent = ''; um35.click(); await okBtn(); await sleep(1500); }
        T('㉟ 月の 取り消しで 明細が 落ちたら 札は「確定を取り消しました」と 言わない', !!um35 && !/確定を取り消しました/.test(toastJi()) && /保存できて/.test(toastJi()), '札=' + toastJi());

        /* ㊱ ★送って いる 途中で 閉じた（machi の まま）控えも、開き直したら 帯で 言う★（taiketsu 10-12【2】） */
        if (typeof A.hazushiWasureru === 'function') {
          const e36 = Object.assign(A.defEmp(), { id: 'e36', name: '外す人36', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
          const conf36 = {}; conf36[ym24] = { e36: true };
          win.Store.savePayslip = () => Promise.resolve({});
          A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e36], confirmed: conf36, _coUA: '2026-10-12T09:00:00.000Z' });
          await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
          win.Store.savePayslip = () => new Promise(() => {});                                 /* 返らない＝送って いる 途中 */
          A.setConfirm('e36', false); A.persistSave(); await sleep(300);
          A.hazushiWasureru(); A.state.employees = []; if (sae) { sae.hidden = true; sae.textContent = ''; }
          A.persistLoad(); await sleep(300);                                                    /* 閉じて 開き直し */
          T('㊱ 送って いる 途中で 閉じても 開き直したら 帯で「確定の 取り消し」と 言う', /確定の 取り消し/.test(obi()), '帯=' + obi() + '／端末=' + win.localStorage.getItem('payslip_hazushi_v1'));
          win.Store.savePayslip = () => Promise.resolve({}); A.persistSave(); await sleep(900);
          T('㊱ 送り直しが 通れば 帯は 消える', !/確定の 取り消し/.test(obi()), '帯=' + obi());
        }
        /* ㊲ ★月の 取り消しで 明細の 保存が 返らなくても 札は 待ち続けない（上限を 過ぎたら「まだ 終わって いない」と 言う）★（taiketsu【5】） */
        {
          const e37 = Object.assign(A.defEmp(), { id: 'e37', name: '月の人37', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
          const conf37 = {}; conf37[ym24] = { e37: true };
          win.Store.savePayslip = () => Promise.resolve({});
          A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e37], confirmed: conf37, _coUA: '2026-10-12T09:10:00.000Z' });
          await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
          win.__HAZUSHI_MACHI_MS__ = 600;                                                       /* 試験では 上限を 短く */
          win.Store.savePayslip = () => new Promise(() => {});                                 /* 返らない */
          A.renderInput(); const um37 = doc.querySelector('[data-undo-month]');
          const tt37 = doc.getElementById('app-toast'); if (tt37) tt37.textContent = '';
          if (um37) { um37.click(); await okBtn(); await sleep(1500); }
          T('㊲ 明細の 保存が 返らなくても 上限で「まだ 終わって いない」と 言う（黙らない・緑に しない）', !!um37 && /まだ 終わって いません/.test(toastJi()) && !/確定を取り消しました/.test(toastJi()), '札=' + toastJi());
          delete win.__HAZUSHI_MACHI_MS__;
        }
        /* ㊳ ★明細の 保存が その場で 投げても 緑の 札を 出さない★（taiketsu【6】） */
        {
          const e38 = Object.assign(A.defEmp(), { id: 'e38', name: '月の人38', pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
          const conf38 = {}; conf38[ym24] = { e38: true };
          win.Store.savePayslip = () => Promise.resolve({});
          A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [e38], confirmed: conf38, _coUA: '2026-10-12T09:20:00.000Z' });
          await sleep(300); if (sae) { sae.hidden = true; sae.textContent = ''; }
          win.Store.savePayslip = () => { throw new Error('その場で 投げた'); };
          A.renderInput(); const um38 = doc.querySelector('[data-undo-month]');
          const tt38 = doc.getElementById('app-toast'); if (tt38) tt38.textContent = '';
          if (um38) { um38.click(); await okBtn(); await sleep(1500); }
          T('㊳ 明細の 保存が その場で 投げても 札は「確定を取り消しました」と 言わない（何かは 言う）', !!um38 && toastJi() !== '' && !/確定を取り消しました/.test(toastJi()), '札=' + toastJi() + '／帯=' + obi());
        }
      } finally { win.Store.savePayslip = slipMoto; }
    }

    /* 【タブの印】 ★「自分が 送った 時刻」を 信じるのは 写しを 最後に 書いたのが この タブの 時だけ★（2026-10-24 本番前 taiketsu 止め）
       タブA が 保存（倉庫 T1・A の タブの 控えに T1）→ 古い タブC が 写しを 自分の 中身（基準 T0・dirty）で 上書き →
       A を 開き直すと、控えの T1 を 自分の 書きと 見て C の 古い 中身を 送り直し、A の 編集が 黙って 消えた。
       ⇒ 写しに 書いた タブの 印（_tab）を 入れ、印が 自分の タブと 違えば 自分の 書きと 見ない（倉庫を 採る）。 */
    {
      const ownMoto = win.Store.isOwnCompanyUA;
      const T0 = '2026-10-24T08:00:00.000Z', T1 = '2026-10-24T08:10:00.000Z';
      try {
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '倉庫の始め')], _coUA: T0 });
        win.Store.cloudSaveState = () => Promise.resolve({ ok: false, reason: 'no net' });
        win.Store.isOwnCompanyUA = (ua) => ua === T1;                                    /* この タブの 控えに T1（自分が 送った） */
        A.state.employees[0].name = 'このタブの編集'; A.persistSaveDebounced(); await sleep(700); /* 写しは この タブが 書いた（基準 T0・dirty） */
        A.persistLoad();
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', '倉庫の古い')], _coUA: T1 });
        T('【タブの印】 写しを 書いたのが この タブなら、開き直しで 自分の 書きと 見て 手元を 保つ（消した 人が 戻らない）', (A.state.employees[0] && A.state.employees[0].name) === 'このタブの編集',
          '名前=' + (A.state.employees[0] && A.state.employees[0].name));
        /* 別の タブC が 写しを 上書きした 形（印だけ 他の タブに 替える） */
        A.state.employees[0].name = 'タブCの古い中身'; A.persistSaveDebounced(); await sleep(700);
        const u = JSON.parse(win.localStorage.getItem('payslip_state_v1') || 'null');
        if (u) { u._tab = 'betsu-no-tab'; u._syncBase = T0; win.localStorage.setItem('payslip_state_v1', JSON.stringify(u)); }
        A.persistLoad();
        A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'タブAの保存済')], _coUA: T1 });
        T('【タブの印】 ★別の タブが 写しを 上書きした 後は、控えに 自分の 時刻が 在っても 倉庫を 採る（保存済みの 編集を 消さない）★', (A.state.employees[0] && A.state.employees[0].name) === 'タブAの保存済',
          '名前=' + (A.state.employees[0] && A.state.employees[0].name) + '／写しの 印=' + (u && u._tab));
      } finally { win.Store.isOwnCompanyUA = ownMoto; }
      /* 印を 引き継ぐのは 開き直し（reload）の 時だけ（タブの 複製・閉じた タブを 戻す・新しく 開く は 新しい 印＝自分の 書きを 信じない） */
      const ER = A.tabNoShirushiErabu;
      T('【タブの印】 開き直し（reload）は 前の 印を 引き継ぐ', typeof ER === 'function' && ER('reload', 'mae-no-tab') === 'mae-no-tab', typeof ER);
      T('【タブの印】 複製・戻す・新しく 開く（back_forward／navigate／不明）は 引き継がない', typeof ER === 'function'
        && ER('back_forward', 'mae-no-tab') === null && ER('navigate', 'mae-no-tab') === null && ER('', 'mae-no-tab') === null && ER('reload', null) === null);
    }
  } finally { console.error = _ce; win.Store.cloudSaveState = kumoMoto; }

} else {
  T('③ ★--waza: newer-wins を 殺すと ローカル編集が クラウドで 消える（＝門が 守っている証し）★', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎',
    '殺したのに 残った＝' + (A.state.employees[0] && A.state.employees[0].name));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
