/* shoyo-zenmonth-nashi.test.mjs — ★「前月の給与が 無い」の 2つを 取り違えない★
 * ==============================================================================
 * ★なぜ（2026-09-06・指示役の 問い → 一次情報で 確かめた）★
 *   私は 賞与の 源泉が 出せない時に「止める」直しを 入れた。
 *   指示役「★①前月に 給与が 無い は『止める』では なく『特例へ 進む』のでは★」
 *   ⇒★国税庁 No.2523 を 引いた（私の 記憶で 書かない）★
 *     「前月に 給与の 支払が ない場合」は ★別の 方法で 計算する★
 *       （賞与−社保）÷6（または12）を ★月額表★に 当てて 税額 → ×6（12）
 *     ⇒★「計算できない」では ない★＝★止めては いけない★
 *   ⇒★私の 直しは 間違い★だった。★入社したばかりの 人が 永久に 確定できない★所だった。
 *
 * ★「前月の 給与が 無い」は 2つ 在る★
 *   ★A 本当に 無い★（入社が 当月・前月に 在籍していない）… ★特例で 計算する★のが 法
 *   ★B 在るのに アプリが 取れていない★（前月を まだ 計算していない）… 特例で 出すと
 *      ★法的に 誤った 税額★に なる ⇒ ★止めて 前月を 入れてもらう★
 *   ⇒★聞かずに 機械で 分けられる★＝★前月に 在籍していたか★（isActiveInMonth）
 *
 * ★手で なぞった 検算（2026-09-06）★
 *   賞与 300,000 − 社保 46,500 = 253,500 ／ ÷6 = 42,250
 *   42,250 を 月額表(甲・扶養0)に 当てる … ★0 円★ ／ ×6 = ★0 円★
 *   ⇒ アプリの 答え 0 と 一致（★0 は「出せない」では なく ★法どおりの 0★★）
 *   （参考）前月 250,000 が 在る時 … 算出率表で 10,352 円
 *
 * ★ここで 見る事★
 *   ① 前月に 居るのに 額が 無い人 … ★止まる★（taxMitei=true）
 *   ② 前月に 居ない人 … ★特例(月額表)で 計算され 止まらない★（special かつ specialComputed）
 *   ③ 居ない人も ★手取りが 出る★
 *   ④ ★空振りしていない★（賞与額が 本当に 入っている＝bonus>0）
 *      ＝私は 最初 state.bonus の 形を 間違えて（rows に 入れた）★賞与額0 のまま 測っていた★
 *
 * 使い方: node kyuyo/tests/shoyo-zenmonth-nashi.test.mjs
 *   ・★ログイン不要★（jsdom で アプリの 中身を 直に 見る）＝CIで 毎回 回せる
 */
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
/* ★手元の 絶対パスを 焼き込まない★（2026-09-06 実測）
   ここに 'C:/Users/zeroa/rakually-test' と 書いて push したら
   ★手元は 緑・GitHubのCIだけ 赤★に なった（Linuxに その道は 無い）。
   ⇒ ★自分の 居場所から 数える★（他の 試験と 同じ 書き方）。 */
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..').split(path.sep).join('/');
const req=createRequire(pathToFileURL(ROOT+'/package.json'));
const { JSDOM }=req('jsdom');
const html=fs.readFileSync(ROOT+'/kyuyo/index.html','utf8');
async function okosu(appSrc){
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/kyuyo/index.html'});
  const w=dom.window, d=w.document;
  w.fetch=()=>Promise.reject(new Error('no net')); w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{}; w.print=()=>{};
  w.URL.createObjectURL=()=>'blob:x'; w.open=()=>({document:{write(){},close(){}},focus(){},print(){},close(){}});
  for(const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)){
    const s2=m[1].split('?')[0], base=s2.split('/').pop();
    if(/^https?:/.test(s2)||['supa-config.js','auth.js','env-badge.js','store.js','rakunally-login.js'].includes(base)) continue;
    const p2=path.resolve(ROOT+'/kyuyo', s2);
    if(!fs.existsSync(p2)) continue;
    const el=d.createElement('script');
    el.textContent=(base==='app.js'&&appSrc)?appSrc:fs.readFileSync(p2,'utf8');
    d.body.appendChild(el);
  }
  await new Promise(r=>setTimeout(r,600));
  return w.__PAYSLIP_TEST;
}
const APP=ROOT+'/kyuyo/js/app.js';
const MARK="else if(prevAfter==null && _zaisekiPrev) noPrev=true;";
const MAE ="else if(prevAfter==null) noPrev=true;";   /* ★直す前の 姿★＝在籍を 見ずに 一律 止める */

async function hakaru(appSrc){
  const A=await okosu(appSrc);
  if(!A) throw new Error('アプリの 中身が 出ていない');
  const S=A.state;
  const ym=A.bonusYmOf?A.bonusYmOf():'2026-09';
  S.employees=[Object.assign(A.defEmp?A.defEmp():{}, {id:'e1',name:'試し 太郎',joinYmd:'2020-04-01',pref:'愛媛県',fuyou:0,taxClass:'ko',base:250000})];
  /* ★実物の 形で 入れる★（bonusEntry が 見るのは state.bonus.byEmp）
     ＝私は 最初 rows に 入れていて ★賞与額 0 のまま 測っていた★ */
  S.bonus={ payYm:ym, payDay:'', byEmp:{ e1:{ amount:300000, prevAfter:'', ytd:'', addShikyu:[], addKojo:[] } } };
  const yomu=()=>{const c=A.computeBonus(S.employees[0]);
    return {noPrev:c.noPrev,taxMitei:c.taxMitei,tax:c.taxAmt,special:!!(c.tax&&c.tax.special),
      sc:!!(c.tax&&c.tax.specialComputed),bonus:c.bonus,si:c.si&&c.si.total,net:c.net};};
  const iru=yomu();                       /* 前月に 居る（額は 無い） */
  S.employees[0].joinYmd=ym+'-01';        /* ★入社が 当月＝前月に 居ない★ */
  const inai=yomu();
  return { ym, iru, inai };
}

console.log('\n[shoyo-zenmonth-nashi]「前月の 給与が 無い」の 2つを 取り違えないか');
const r=await hakaru(null);
console.log('  賞与月 '+r.ym);
console.log('  ★前月に 居る（額は 無い）★  … '+JSON.stringify(r.iru));
console.log('  ★前月に 居ない（入社 当月）★ … '+JSON.stringify(r.inai));
console.log('');
let ng=0; const iu=(ok,s2)=>{if(!ok)ng++;console.log('   '+(ok?'🟢':'🔴')+' '+s2);};
iu(r.iru.taxMitei===true, '① 居るのに 額が 無い人 … ★止まる★（前月を 入れてもらう）');
iu(r.inai.taxMitei===false && r.inai.special===true && r.inai.sc===true,
   '② 居ない人 … ★特例(月額表)で 計算され 止まらない★（国税庁 No.2523 どおり）');
iu(typeof r.inai.net==='number' && r.inai.net>0, '③ 居ない人も 手取りが 出る … ¥'+r.inai.net);
iu(r.iru.bonus>0 && r.inai.bonus>0, '④ 空振りしていない（賞与額が 本当に 入っている … ¥'+r.inai.bonus+'）');

if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★アプリの 1行を 直す前に 戻すと 赤に なるか★');
  const keep=fs.readFileSync(APP,'utf8');
  if(keep.indexOf(MARK)<0){ console.log('  ★壊す場所が 見つからない＝この 自己確認は 古い★'); process.exit(2); }
  const r2=await hakaru(keep.replace(MARK, MAE));
  let kowashita=0, aka=0;
  for (const [na,ok] of [
    ['居ない人も 止める（直す前の 姿）', r2.inai.taxMitei===true],
    ['居ない人の 手取りが 出なくなる',   !(typeof r2.inai.net==='number' && r2.inai.net>0) || r2.inai.taxMitei===true],
  ]) { kowashita++; if(ok) aka++;
    console.log('  '+(ok?'✓':'✗')+' '+na+' … '+(ok?'赤に なる（見張りが 気づく）':'★気づけない★')); }
  console.log('  ★壊した '+kowashita+'件／気づけた '+aka+'件★');
  console.log('     戻した姿の 中身 … '+JSON.stringify(r2.inai));
  if(aka!==kowashita){ console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n'+kowashita+' passed, 0 failed');
  process.exit(0);
}
console.log('\n  ★赤 '+ng+'件★');
process.exit(ng?1:0);
