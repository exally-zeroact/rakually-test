/* yomenai-kakutei.test.mjs — ★クラウドに つながらない 間は 賞与の 確定・月の 確定の 取り消しを させない★
 * =============================================================================
 * ★なぜ（2026-10-14 taiketsu・件1）★
 *   読めない 間は 明細（pay_payslips）を 書かない（store.js _yomenaiNara）。ところが
 *   ・★賞与の 確定★は 押せた＝明細は 書かれず 黙り（saveFailed が yomenai で 黙る）、札は「年調・台帳に反映」と 逆を 言い、
 *     読めた 後も 賞与の 行は 二度と 送られなかった（押した 時しか 送らない）。従業員の Web明細には 公開された。
 *   ・★月の 確定の 取り消し★も 押せた＝取り消しの 明細は 書かれず、Web明細だけ 消え、読めた 後に 倉庫の 確定が union で 戻り得る。
 *   ⇒ つながらない（ng）／読み込み中（machi）の 間は 両方 押せない＋押されても 歯止め（明細も 公開も 0本・逆の 札を 出さない）。
 * ★押す物★ … 本物の app.js（jsdom）。倉庫だけ 差し替え（書いた 本数を 数える）。
 * 使い方: node kyuyo/tests/yomenai-kakutei.test.mjs   ／  --waza（守りを 外した app.js で 赤に なるか）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch (e) { console.log('★jsdom が 入って いません＝未測定（緑に しません）★'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAZA = process.argv.includes('--waza');

let pass = 0, fail = 0, mihakari = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

/* ★わざと 守りを 外す★（ボタンの disabled と 押した 時の 歯止めを 両方 外す） */
function appJi(ji) {
  if (!WAZA) return ji;
  /* ★1つずつ 当たったか 数える★（taiketsu 10-14＝4つの うち 1つ 当たれば 通る 門だった） */
  const W = [
    ["if(soukoMachi()||soukoNG()){ toast('クラウドに つながらないので、賞与は まだ 確定していません。", "if(false){ toast('"],
    ["if(umb && (soukoMachi()||soukoNG())){", 'if(false){'],
    ["if(cmb && (soukoMachi()||soukoNG())){ toast('クラウドに つながらないので、今月は", "if(false){ toast('"],
    ["var _soukoB = soukoMachi() ? '読み込み中です' : (soukoNG() ? 'クラウドに つながりません' : '');", "var _soukoB = '';"],
    ["'+(soukoTomeru?' disabled':'')+'>この月の確定を取り消す'", "'+''+'>この月の確定を取り消す'"],
  ];
  let a = ji;
  W.forEach(([k, v], i) => {
    if (a.split(k).length !== 2) { console.log('★--waza の 置き換え ' + (i + 1) + ' が 当たらない＝空振り★'); process.exit(1); }
    a = a.replace(k, v);
  });
  return a;
}

async function hiraku() {
  const file = path.join(ROOT, 'kyuyo/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    const base = src.split('/').pop();
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = base === 'app.js' ? appJi(fs.readFileSync(p, 'utf8')) : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(400);
  const A = win.__PAYSLIP_TEST;
  if (!A) throw new Error('app.js が 動いて いない');
  const kazu = { save: 0, bonus: 0, pub: 0, unpub: 0 };
  win.Store = {
    savePayslip: (ym, id, d, kind) => { if (kind === 'bonus') kazu.bonus++; else kazu.save++; return Promise.resolve(); },   /* ★賞与の 明細は 別に 数える★（月次は click の 自動の 保存でも 呼ばれる＝本物では store の 守りが 断る） */
    publishMeisai: () => { kazu.pub++; return Promise.resolve(); },
    unpublishMonth: () => { kazu.unpub++; return Promise.resolve({ ok: true }); },
    unconfirmPayslip: () => { kazu.save++; return Promise.resolve(); },
    listMeisaiPub: () => Promise.resolve([]),
  };
  const fuda = [];
  let mae = '';
  const mihari = setInterval(() => { const t = doc.getElementById('app-toast'); const ji = (t && t.textContent) || ''; if (ji && ji !== mae) { fuda.push(ji); mae = ji; } }, 5);
  return { dom, win, doc, A, kazu, fuda, owari: () => { clearInterval(mihari); dom.window.close(); } };
}
const osu = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

console.log('\n[yomenai-kakutei] ★つながらない 間は 賞与の 確定・月の 取り消しを させない★' + (WAZA ? '  ★★守りを 外した 回★★' : ''));
let akaWaza = 0;
for (const souko of ['ng', 'machi']) {
  /* ── 賞与の 確定 ── */
  {
    const h = await hiraku();
    const { win, doc, A, kazu, fuda } = h;
    const e1 = A.defEmp('山田 太郎');
    e1.payType = '月給'; e1.base = '260000'; if (e1.shikyu && e1.shikyu[0]) e1.shikyu[0].value = '260000'; e1.pref = 'ehime';
    A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
    A.state.month = '2026-08'; A.state.employees = [e1];
    /* ★源泉が 決まる 人にする★（前月の 給与＝社保を 引いた 後 を 入れる）＝taiketsu 10-14：源泉が 未定だと
       倉庫に 関係なく ボタンが 灰色に なり、守りを 外しても 緑の まま だった（空振り） */
    const be = A.bonusEntry(e1); if (be) { be.amount = 500000; be.prevAfter = '230000'; }
    A.state.inputMode = 'bonus';
    const bnI = doc.querySelector('.bn[data-scr="scr-input"]'); if (bnI) osu(win, bnI);   /* ★入力の 画面を 開いてから 描く★（開いて いないと 賞与の 画面は 描かれない） */
    await sleep(150);
    /* ★前提★＝倉庫が 読めて いる（ok）時は 押せる。押せなければ ここは 何も 測って いない＝未測定 */
    A.state._souko = 'ok';
    osu(win, bnI); await sleep(200);   /* ★客の 道と 同じ 描き直し★（soukoRedraw → showScreen → renderInputArea。renderInput は 月次しか 描かない） */
    const b0 = doc.querySelector('[data-confirm-bonus]');
    const maeOk = !!b0 && b0.disabled === false;
    A.state._souko = souko;
    osu(win, bnI); await sleep(200);
    const b = doc.querySelector('[data-confirm-bonus]');
    if (!b || !maeOk) { console.log('  🟡 ★賞与の 確定ボタンが 出ない／読めて いる 時も 押せない＝未測定★（' + souko + '・前提 ' + (b0 ? (b0.textContent || '').trim() : '無し') + '）'); mihakari++; h.owari(); }
    else {
    const ji = (b.textContent || '').trim();
    T('★' + souko + ' … 賞与の 確定は 押せない（理由は ボタンの 中）', b.disabled === true && /読み込み中|つながりません/.test(ji), '押せる／字「' + ji + '」');
    b.disabled = false; osu(win, b);   /* ★灰色を 外して 押しても（歯止め）★ */
    await sleep(500);
    T('★' + souko + ' … 押されても 賞与の 明細も 公開も 0本', kazu.bonus === 0 && kazu.pub === 0, '賞与の 明細 ' + kazu.bonus + '／公開 ' + kazu.pub);
    T('★' + souko + ' … 「年調・台帳に反映」の 札を 出さない', !fuda.some((x) => /賞与を確定しました/.test(x)), fuda.join(' ／ '));
    h.owari();
    }
  }
  /* ── 月の 確定の 取り消し ── */
  {
    const h = await hiraku();
    const { win, doc, A, kazu } = h;
    const e1 = A.defEmp('山田 太郎');
    e1.payType = '月給'; e1.base = '260000'; if (e1.shikyu && e1.shikyu[0]) e1.shikyu[0].value = '260000'; e1.pref = 'ehime';
    A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
    A.state.month = '2026-08'; A.state.employees = [e1];
    A.state.confirmed = A.state.confirmed || {}; A.state.confirmed['2026-08'] = {}; A.state.confirmed['2026-08'][e1.id] = true;
    A.state.inputMode = 'monthly';
    A.state._souko = souko;
    const bnI = doc.querySelector('.bn[data-scr="scr-input"]'); if (bnI) osu(win, bnI);   /* ★入力の 画面を 開いてから 描く★（開いて いないと 賞与の 画面は 描かれない） */
    await sleep(150);
    if (A.renderInput) A.renderInput();
    await sleep(200);
    const b = doc.querySelector('[data-undo-month]');
    if (!b) { console.log('  🟡 ★取り消しの ボタンが 出ない＝未測定★（' + souko + '）'); mihakari++; h.owari(); }
    else {
    const ji = (b.textContent || '').trim();
    T('★' + souko + ' … 月の 確定の 取り消しは 押せない（理由は ボタンの 中）', b.disabled === true && /読み込み中|つながりません/.test(ji), '押せる／字「' + ji + '」');
    b.disabled = false; osu(win, b);
    await sleep(300);
    const y = [...doc.querySelectorAll('button')].filter((x) => /^(はい|OK|取り消す)/.test((x.textContent || '').trim()))[0];
    if (y) osu(win, y);
    await sleep(500);
    T('★' + souko + ' … 押されても 確定を 外さない（明細 0本・公開の 取り下げ 0本）', kazu.save === 0 && kazu.unpub === 0 && !!(A.state.confirmed['2026-08'] || {})[e1.id], '明細 ' + kazu.save + '／取り下げ ' + kazu.unpub + '／確定 ' + JSON.stringify(A.state.confirmed['2026-08']));
    /* ★月の 確定も 灰色だけで 守らない★（2026-10-14 taiketsu 指摘4）＝灰色を 外して 押しても 公開 0本・確定の 札を 出さない */
    const cm = doc.querySelector('[data-confirm-month]');
    if (!cm) { console.log('  🟡 ★今月を確定の ボタンが 出ない＝未測定★（' + souko + '）'); mihakari++; }
    else {
      const pub0 = kazu.pub;
      const fuda0 = h.fuda.length;
      cm.disabled = false; osu(win, cm); await sleep(300);
      const y2 = [...doc.querySelectorAll('button')].filter((x) => /^(はい|OK|確定)/.test((x.textContent || '').trim()))[0];
      if (y2) osu(win, y2);
      await sleep(600);
      T('★' + souko + ' … 灰色を 外して「今月を確定」を 押しても 公開 0本・確定の 札を 出さない', kazu.pub === pub0 && !h.fuda.slice(fuda0).some((x) => /今月を確定しました/.test(x)), '公開 ' + (kazu.pub - pub0) + '／札 ' + h.fuda.slice(fuda0).join(' ／ '));
    }
    h.owari();
    }
  }
}
/* ★押せなかった（ボタンが 出ない）＝未測定★＝赤とも 緑とも 数えない（--waza が 空振りで 合格しない） */
if (mihakari) { console.log('\n  🟡 ★未測定 ' + mihakari + '件★（ボタンが 出ない＝この 見張りは 押せて いません）'); process.exit(2); }
if (WAZA) {
  console.log('\n  守りを 外した 回 … 赤 ' + fail + '件');
  if (fail > 0) { console.log('  ✓ ★守りを 外すと 赤に なる＝空振り して いない★'); process.exit(0); }
  console.log('  ✗ ★★外したのに 赤 0件＝空振り★★'); process.exit(1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
