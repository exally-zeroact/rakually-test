/* _takasa.mjs — ★押す物の 決めた 高さ★（css/botan-takasa.css の min-height と 同じ 式・11-19 コンサルの 揃えた数）
   12px→32・13px→36・14px→36・16px→44（比 2.5〜2.8）。押せる所 44px は 見えない ::after で 守る。
   ★見える 高さに 44 を 求める 試験を 作らない★＝高さは takasa(字)、押せる所は 上下 ±21px を 突いて 自分に 当たるか（TAP_JS）で 見る。
   使う所＝tests/botan-takasa.test.mjs・seikyu/tests/seikyuu-shuukei.mjs・settei-wake-ui.mjs・ichiran-katachi.mjs */
export const takasa = (f) => Math.round(Math.max(2.5 * f, Math.min(2.8 * f, Math.max(Math.min(4 * f - 16, 36), 4 * f - 20))) * 10) / 10;
/* 画面の 中で 動く 字（文字列で 差し込む）＝ tapOK(要素) → 上下 ±21px が 自分（か 中身）に 当たれば true／fsOf(要素) → 字の 大きさ */
export const TAP_JS = 'function tapOK(e){e.scrollIntoView({block:"center",inline:"nearest"});var r=e.getBoundingClientRect();'
  + 'var x=Math.round(Math.max(1,Math.min(innerWidth-1,r.left+r.width/2))),cy=r.top+r.height/2;'
  + 'return [cy-21,cy+21].every(function(y){var h=document.elementFromPoint(x,Math.round(y));return !!h&&(h===e||e.contains(h));});}'
  + 'function fsOf(e){return parseFloat(getComputedStyle(e).fontSize);}'
  /* ★tapOK は 画面を 動かす★＝位置を 全部 測ってから 突く（tapLater で 預けて 最後に tapRun・突いた後は 頭へ 戻す） */
  + 'var TAPQ=[];function tapLater(o,e){TAPQ.push([o,e]);return o;}function tapRun(){TAPQ.forEach(function(p){p[0].hit=tapOK(p[1]);});TAPQ=[];window.scrollTo(0,0);}';
/* 判定（null＝よい）＝h は 整数に 丸めた 高さでも よい（±1） */
export function takasaNG(h, fs, hit) {
  const want = takasa(fs);
  if (Math.abs(h - want) > 1) return '高さ ' + h + 'px（' + fs + 'px の 字は ' + want + 'px）';
  if (!hit) return '押せる所 44px が 無い（上下 ±21px が 自分に 当たらない）';
  return null;
}
