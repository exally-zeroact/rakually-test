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
  } finally { console.error = _ce; win.Store.cloudSaveState = kumoMoto; }

} else {
  T('③ ★--waza: newer-wins を 殺すと ローカル編集が クラウドで 消える（＝門が 守っている証し）★', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎',
    '殺したのに 残った＝' + (A.state.employees[0] && A.state.employees[0].name));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
