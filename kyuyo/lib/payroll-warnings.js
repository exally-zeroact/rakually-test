/* payroll-warnings.js — 月次給与の黄警告（headless・DOM非依存）
 *
 * ★このファイルは js/app.js から【移設】したものです。判定も文言も1文字も変えていません。
 *   差分は state.month / state.company / state._otHist を明示引数 ctx に置き換えただけ。
 *   js/app.js は同名の薄いラッパから、ここへ委譲します（＝警告文言の唯一の真実源＝二重定義を作らない）。
 *
 * 製品方針: すべて【黄色・非ブロック】。違法・グレーでもユーザーは入力・保存・計算できる。注意だけ伝える。
 *
 * collect(e, ctx)        … 従業員1人ぶんの警告を構造化 [{code,level,scope,text}] で返す（オペレーション用）
 * collectCompany(ctx, emps) … 会社スコープの警告（割増率の法定下限・年間労働時間・未収録年度）
 * それ以外の関数は app.js が描画にそのまま使う（HTML文字列を返すものは従来どおりの文字列）
 *
 * 【利用】ブラウザ window.PayrollWarnings / Node require('./payroll-warnings.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./payroll-monthly.js'), require('./payroll-calc.js'), require('./warimashi.js'),
      require('./saitei-chingin.js'), require('./shaho-kanyu.js'), require('./pay-rule.js'), require('./shakaihoken-hyo.js'),
      require('./shotokuzei-densan.js'), require('./shoyo-zei.js'), require('./koyo-hoken.js'));
  } else {
    // 所得税(ShotokuzeiDensan)は 渡さない＝読み込み順に 頼らず 使う時に window から 拾う（下の DN()）。
    // ★SAITEI_CHINGIN / SHAKAIHOKEN_HYO は `const` 宣言でwindowに付かない。UMDラッパはグローバル
    //   スコープで走るので bare 参照なら拾える。window経由だけだと最賃チェックが丸ごと無言で消える。
    root.PayrollWarnings = factory(root.PayrollMonthly, root.PayrollCalc, root.Warimashi,
      (typeof SAITEI_CHINGIN !== 'undefined' ? SAITEI_CHINGIN : root.SAITEI_CHINGIN), root.ShahoKanyu, root.PayRule,
      (typeof SHAKAIHOKEN_HYO !== 'undefined' ? SHAKAIHOKEN_HYO : root.SHAKAIHOKEN_HYO));
  }
})(typeof self !== 'undefined' ? self : this, function (_PM, _PayrollCalc, _Warimashi, _SAI, _ShahoKanyu, _PayRule, _SHH, _DN, _SZ, _KH) {
  'use strict';

  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
  function PM() { return _PM || G.PayrollMonthly; }
  function PC() { return _PayrollCalc || G.PayrollCalc; }
  function W() { return _Warimashi || G.Warimashi; }
  function SAI() { return _SAI || G.SAITEI_CHINGIN || null; }
  function SK() { return _ShahoKanyu || G.ShahoKanyu; }
  function PR() { return _PayRule || G.PayRule; }
  function SHH() { return _SHH || G.SHAKAIHOKEN_HYO || null; }
  function DN() { return _DN || G.ShotokuzeiDensan || null; }
  function KH() { return _KH || G.KoyoHoken || null; } // 雇用保険の 率の 表（ブラウザは 使う 時に window から 拾う＝DN と 同じ）
  function SZ() { return _SZ || G.ShoyoZei || null; } // 賞与の 所得税の 表（ブラウザは 使う 時に window から 拾う＝DN と 同じ）

  var num = function (v) { return PM().num(v); };
  // app.js と同じ文字列ユーティリティ（文言をバイト単位で一致させるために必要・業務ロジックではない）
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var fmtN = function (v) { var n = num(v); return n ? n.toLocaleString('ja-JP') : (v === 0 || v === '0' ? '0' : ''); };
  function C(ctx) { return (ctx && ctx.company) || {}; }
  function YM(ctx) { return (ctx && ctx.month) || ''; }

  // ── ① 最低賃金（最低賃金法） ──
  function isInMinWage(label) {
    label = label || '';
    if (/割増|残業|時間外|深夜|休日(出勤)?手当/.test(label)) return false;   // 所定外・休日・深夜(規則1条3〜5号)
    if (/通勤|家族|扶養|皆勤|精勤/.test(label)) return false;               // 精皆勤・通勤・家族(規則1条6号)
    if (/賞与|一時金|臨時|寸志|決算賞与|報奨金|インセンティブ/.test(label)) return false; // 臨時・1か月超(4条3項1・2号)
    if (/控除|欠勤|不就労|返還|立替/.test(label)) return false;             // マイナス行は算入賃金でない
    if (/基本給/.test(label)) return false;                                 // 基本給はbaseで別計上(二重計上防止)
    return true;
  }
  // 最賃算入の固定手当(月額・契約額=e.shikyuは日割前)。基本給と除外手当を除く。
  function minWageTeate(e) { return (e.shikyu || []).filter(function (x) { return isInMinWage(x.label) && num(x.value) > 0; }).reduce(function (a, x) { return a + num(x.value); }, 0); }
  /* ★その人に効く県★＝人の県が空なら ★会社の県★ を使う（2026-08-18 会社マスタ7問）。
     ・最低賃金は「事業場の所在地」で決まる＝会社に1つ持つのが正しい。
     ・人ごとの県は「上書き」＝入っていればそちらが勝つ（★勝手に書き換えない★）。
     ・ここ1か所で決める＝「画面は会社の県で緑なのに、計算は空で赤」を作らない。 */
  function effPref(e, ctx) {
    var p = String((e && e.pref) == null ? '' : e.pref).trim();
    if (p) return p;
    var co = C(ctx) || {};
    return String(co.pref == null ? '' : co.pref).trim();
  }
  // 最低賃金チェック(事業所所在地=従業員prefの地域別最賃と時間額を比較)。役員/休業中は対象外。返り{hourly,minWage,prefName,ok,teate}
  function minWageInfo(e, ctx) {
    if (!e || e.payType === '役員' || e.employmentType === 'contractor' || (e.workStatus && e.workStatus !== 'normal')) return null;
    var S = SAI(); if (!S || !S.getChingin) return null;
    // ★最賃は「発効日以降の労働」に効く。県ごとに発効日が違うので、対象月×県で額を選ぶ。
    //   月の途中で発効する月は額が2つある＝丸めずに両方持つ（丸めるとどちらでも嘘になる）。
    var pref = effPref(e, ctx);
    var sp = S.monthSplit ? S.monthSplit(pref, YM(ctx)) : null;
    var mw, split = null;
    if (sp && sp.split) { mw = sp.after; split = { hatsukoYmd: sp.hatsukoYmd, before: sp.before, after: sp.after }; }
    else if (sp) { mw = sp.chingin; }
    else { mw = S.getChingin(pref); }
    if (!mw) return null;
    var co = C(ctx);
    var ah = (e.annualHolidays != null && e.annualHolidays !== '') ? e.annualHolidays : co.annualHolidays;
    var dwh = num((e.dailyWorkH != null && e.dailyWorkH !== '') ? e.dailyWorkH : co.dailyWorkH) + num((e.dailyWorkM != null && e.dailyWorkM !== '') ? e.dailyWorkM : co.dailyWorkM) / 60;
    var ly = parseInt(String(YM(ctx) || '').slice(0, 4), 10) || 0, leap = (ly % 4 === 0 && ly % 100 !== 0) || (ly % 400 === 0);
    var stdH = W() ? W().monthlyStdHours(ah, dwh, leap) : 0;
    var teate = minWageTeate(e);                                   // 最賃算入の固定手当(月額)
    var teateHourly = stdH > 0 ? teate / stdH : 0;                 // 手当を月平均所定時間で時給換算し基本給の時給に加算(最賃法どおり手当も算入)
    var hourly = 0;
    if (e.payType === '時給') hourly = num(e.hourly) + teateHourly;
    else if (e.payType === '日給') hourly = (dwh > 0 ? num(e.base) / dwh : 0) + teateHourly;
    else if (e.payType === '歩合') { var wmw = PM().workedMin(e); var gpw = W() ? W().guaranteePay(e.hourlyGuarantee, wmw) : PM().yenRound(num(e.hourlyGuarantee) * wmw / 60); var bpw = Math.max(num(e.commissionAmt), gpw); hourly = (wmw > 0 ? bpw / (wmw / 60) : 0) + teateHourly; } // 歩合=賃金合計(高い方)÷総労働時間で最賃判定
    else if (e.payType === 'カスタム') { var wmc = PM().payRuleCtx(e).workMin; var prc = PM().payRuleResult(e); var bpc = prc ? prc.base : 0; hourly = (wmc > 0 ? bpc / (wmc / 60) : 0) + teateHourly; } // カスタム=基本給÷総労働時間(★K4:基本給と同じソース=台帳取り込み時は台帳のworkMin。未取り込みはworkedMin(e)と同値)
    else { hourly = (stdH > 0 ? num(e.base) / stdH : 0) + teateHourly; } // 月給=基本給÷月平均所定時間＋算入手当
    hourly = Math.floor(hourly);
    // 減額の特例(最賃法7条・労働局長許可): 障害者/試用期間/認定職業訓練/軽易業務/断続的労働。許可された減額率(%)で最賃を下げて判定。
    //  減額後最賃=最賃×(1−率)を円未満切り上げ(労働者有利・記入要領)。率は会社が許可どおり入力。
    var reduce = Math.max(0, Math.min(100, num(e.minWageReduce)));
    var eff = function (v) { return reduce > 0 ? Math.ceil(v * (100 - reduce) / 100) : v; };
    var effMw = eff(mw);
    var okNow = (hourly === 0 || hourly >= effMw);
    if (split) {
      split.effBefore = eff(split.before); split.effAfter = eff(split.after);
      // 発効前の額も上回っていなければ「その月ずっと割れ」。上回っているなら「発効後の日だけ要確認」。
      split.underBefore = !(hourly === 0 || hourly >= split.effBefore);
      split.ambiguous = !split.underBefore && !okNow;    // 旧額はクリア・新額は未達＝日で分かれる
    }
    return { hourly: hourly, minWage: mw, effMinWage: effMw, reduce: reduce, prefName: ((S.todofuken || {})[pref] || {}).name || '', ok: okNow, teate: teate, split: split, stale: (S.saiteiStale ? S.saiteiStale(YM(ctx)) : false) };
  }
  // 最賃割れのtooltip/説明文(表ビューの⚠とカードのバナーで文面を統一)。製品方針=黄色・非ブロック・具体的に伝える。
  function mwWarnText(mw) {
    var sfx = (mw.reduce > 0) ? '（減額特例' + fmtN(mw.reduce) + '%後）' : '';
    var sp = mw.split;
    // ★月の途中で最賃が上がる月。日ごとの勤務時間が無い時は丸めず、両方の額と発効日を出して確かめてもらう。
    if (sp && sp.ambiguous) {
      var d = String(sp.hatsukoYmd).split('-');
      return esc(mw.prefName) + 'は' + d[0] + '年' + (+d[1]) + '月' + (+d[2]) + '日から時給'
        + fmtN(mw.reduce > 0 ? sp.effAfter : sp.after) + '円（それまでは' + fmtN(mw.reduce > 0 ? sp.effBefore : sp.before) + '円）'
        + sfx + '。この月は日で分かれます（約' + fmtN(mw.hourly) + '円）。'
        + (+d[1]) + '月' + (+d[2]) + '日以降の勤務を確かめてください';   // ★呼ぶ側が「。」を付けるので、ここでは付けない
    }
    var v = (mw.reduce > 0) ? mw.effMinWage : mw.minWage;
    return '最低賃金（' + esc(mw.prefName) + '：時給' + fmtN(v) + '円' + sfx + '）を下回っています（約' + fmtN(mw.hourly) + '円）';
  }

  // ── ② 保障給（労基27条） ──
  // 出来高払制の保障給チェック(労基法27条)。完全歩合で保障(時給/日給の下限 or 固定給)が一切ない=27条違反の恐れ。役員/休業中は対象外。返り{ok} ok=false=無保障。
  //  ★製品方針=黄色・非ブロック(違法・グレーでもユーザーが選択/入力して使えるようにする=注意のみ)。構造判定は lib/pay-rule.js の lacksGuarantee に集約。
  function hoshoInfo(e) {
    if (!e || e.payType === '役員' || e.employmentType === 'contractor' || (e.workStatus && e.workStatus !== 'normal')) return null;
    if (e.payType === '歩合') return { ok: num(e.hourlyGuarantee) > 0 };                 // 歩合payType=保障給の時給が未設定(0)なら無保障
    if (e.payType === 'カスタム') { if (!e.payRule || !PR() || !PR().lacksGuarantee) return null; return { ok: !PR().lacksGuarantee(e.payRule) }; }
    return null;                                                                    // 月給/時給/日給=定額or時間給=保障あり(対象外)
  }
  function hoshoWarnText() { return '<b>保障給がありません</b>（労基法27条）。出来高払・歩合で働く人には<b>労働時間に応じた保障給</b>（例：時給の下限）が必要で、保障のない完全歩合は違反の恐れがあります。決め方を<b>「高い方（完全歩合＋保障）」</b>にして<b>時給×時間</b>の候補を足すか、歩合形態なら<b>保障給の時給</b>を入れてください。'; }

  // ── ③ 割増率の法定下限（労基37条・会社スコープ） ──
  // 割増率が法定下限を下回る時の黄警告(労基37条)。会社は上げてよいが下回りは違法の恐れ→非ブロックで注意。
  function rateFloorWarn(co) {
    if (!W() || !W().belowLegalRates) return '';
    var pr = function (v) { return (v != null && v !== '') ? num(v) / 100 : undefined; };
    var low = W().belowLegalRates({ ot: pr(co.rateOt), holiday: pr(co.rateHoliday), night: pr(co.rateNight), over60Add: pr(co.rateOver60) });
    if (!low.length) return '';
    var names = low.map(function (x) { return x.label + '（' + Math.round(x.value * 100) + '%→法定' + Math.round(x.floor * 100) + '%）'; }).join('・');
    return '<div class="cr-warn" style="margin:6px 2px 0">⚠ 割増の率が<b>法定下限</b>を下回っています：' + names + '。労基法37条の下限（時間外25%／休日35％／深夜+25%／月60時間超+25%）以上が必要です（このまま保存・計算はできます）。</div>';
  }

  // ── ③b 割増率・みなし時間が高すぎる（桁が1つ多い恐れ） ──
  // 前の入力欄は点を消したので「137.5」→1375%・「22.5」時間→225時間 で保存された会社が残る＝黙って多く/少なく払う。警告だけ（保存・計算は止めない）。
  //  ★毎月の入力の欄・集計の要確認・ops に出す（設定画面だけだと設定を開かない人に届かない）。みなしは月45時間（36協定の原則の上限）超。
  var MINASHI_CEIL_H = 45;
  function rateCeilItems(co) {
    if (!co || !W() || !W().aboveSaneRates) return [];
    var pr = function (v) { return (v != null && v !== '') ? num(v) / 100 : undefined; };
    return W().aboveSaneRates({ ot: pr(co.rateOt), holiday: pr(co.rateHoliday), night: pr(co.rateNight), over60Add: pr(co.rateOver60) }).map(function (x) {
      var code = x.key === 'ot' ? 'RATE_TOO_HIGH_OT' : x.key === 'holiday' ? 'RATE_TOO_HIGH_HOLIDAY' : x.key === 'night' ? 'RATE_TOO_HIGH_NIGHT' : 'RATE_TOO_HIGH_OVER60';
      var pct = Math.round(x.value * 1000) / 10;
      return { code: code, text: '割増の率が高すぎます：' + x.label + ' ' + pct + '%（桁が1つ多い恐れ・' + (pct / 10) + '% のつもりなら 会社の設定の「割増の率」を直してください）' };
    });
  }
  function minashiCeilItem(e, ctx) {
    if (!e || e.payType === '役員') return null; var co = C(ctx);
    var mh = (e.minashiH != null && e.minashiH !== '') ? e.minashiH : co.minashiH; var h = num(mh);
    if (!(h > MINASHI_CEIL_H)) return null;
    return { code: 'MINASHI_TOO_HIGH', text: '固定残業（みなし）' + h + '時間が月' + MINASHI_CEIL_H + '時間を超えています（桁が1つ多い恐れ・' + (h / 10) + '時間 のつもりなら直してください）' };
  }
  function ceilItems(e, ctx) { if (!e || e.payType === '役員') return []; var a = rateCeilItems(C(ctx)); var m = minashiCeilItem(e, ctx); if (m) a.push(m); return a; }
  function rateCeilWarn(co) { var it = rateCeilItems(co); return it.length ? '<div class="cr-warn" style="margin:6px 2px 0">⚠ ' + it.map(function (x) { return esc(x.text); }).join('<br>⚠ ') + '</div>' : ''; }
  function ceilWarn(e, ctx) { var it = ceilItems(e, ctx); return it.length ? '<div class="cr-warn" style="margin:6px 0">⚠ ' + it.map(function (x) { return esc(x.text); }).join('<br>⚠ ') + '</div>' : ''; }

  // ── ④ 年間労働時間（労基32条） ──
  // 年間所定労働時間が法定(週40h)目安を超える時の黄警告(労基32条)。年間休日過少/長時間所定。役員/休業中は対象外。
  //  ★ヘルプ(annual)で「黄色で教えます」と約束している警告の実体。変形労働時間制なら適法もあり=注意のみ・非ブロック。
  function annualHoursInfo(e, ctx) {
    if (!e || e.payType === '役員' || e.employmentType === 'contractor' || (e.workStatus && e.workStatus !== 'normal')) return null;
    if (!W() || !W().annualHoursCheck) return null;
    var co = C(ctx);
    var ah = (e.annualHolidays != null && e.annualHolidays !== '') ? e.annualHolidays : co.annualHolidays;
    var dwh = num((e.dailyWorkH != null && e.dailyWorkH !== '') ? e.dailyWorkH : co.dailyWorkH) + num((e.dailyWorkM != null && e.dailyWorkM !== '') ? e.dailyWorkM : co.dailyWorkM) / 60;
    var ly = parseInt(String(YM(ctx) || '').slice(0, 4), 10) || 0, leap = (ly % 4 === 0 && ly % 100 !== 0) || (ly % 400 === 0);
    return W().annualHoursCheck(ah, dwh, leap);
  }
  function annualHoursWarnText(r) { return '<b>年間の労働時間が法律の目安（週40時間）を超えています</b>（約' + fmtN(Math.round(r.annualHours)) + '時間／週あたり約' + (Math.round(r.avgWeekly * 10) / 10) + '時間・労基法32条）。年間休日を増やすか1日の所定を短くしてください。変形労働時間制なら適法な場合もあります（このまま保存・計算はできます）。'; }

  // ── ⑤ 36協定・年少者（労基36/60/61条） ──
  // ④36協定 時間外上限(労基36条)＋⑤年少者(18歳未満)の時間外/深夜/休日規制(労基60/61条)の黄警告。役員は労働時間規制の対象外。非ブロック。
  // ④⑤の警告メッセージ配列(HTMLの<b>込み)を単一ソースで返す。カードはcr-warn・表ビューは⚠tooltipで共用。
  function laborLimitItems(e, ctx) {
    if (!e || e.payType === '役員') return [];
    var Wm = W(), pc = PC(); if (!Wm) return []; var m = PM().warimashiMins(e.warimashi); var out = [];
    if (Wm.overtimeLimitLevel) {
      var lv = Wm.overtimeLimitLevel(m.otMin, m.holidayMin);
      if (lv === 'over100') out.push('<b>時間外＋休日労働</b>が<b>単月100時間以上</b>です。36協定の特別条項でも<b>上限違反の恐れ</b>があります（労基法36条・いわゆる過労死ライン）');
      else if (lv === 'over45') out.push('時間外が<b>月45時間</b>を超えています。原則の上限を超えるには36協定の<b>特別条項</b>が必要です（労基法36条）');
    }
    if (pc && pc.isMinor && pc.isMinor(e.birthYmd, YM(ctx))) {
      if (m.nightMin > 0) out.push('<b>18歳未満</b>の方に<b>深夜（22時〜翌5時）の労働</b>が入っています。年少者の深夜業は原則禁止です（労基法61条）');
      if (m.otMin > 0 || m.holidayMin > 0) out.push('<b>18歳未満</b>の方に<b>時間外・休日労働</b>が入っています。年少者は原則できません（労基法60条）');
    }
    // 36協定 特別条項の複数月/年の上限(履歴=保存済み過去11ヶ月[loadOtHistory]＋当月liveを合成)
    if (Wm.overtime36Check) {
      var hist = (((ctx && ctx.otHist) || {})[e.id] || []).map(function (x) { return { otMin: x.otMin, holidayMin: x.holidayMin }; });
      var c36 = Wm.overtime36Check(hist.concat([{ otMin: m.otMin, holidayMin: m.holidayMin }]));
      if (c36.over80) out.push('直近<b>' + c36.over80.months + 'か月</b>の時間外＋休日の平均が<b>月80時間</b>を超えています（約' + fmtN(Math.round(c36.over80.avgMin / 60)) + 'h/月）。特別条項でも複数月平均80hが上限です（労基法36条）');
      if (c36.over720) out.push('直近12か月の時間外が<b>年720時間</b>を超えています（約' + fmtN(Math.round(c36.over720.totalMin / 60)) + 'h/年）。特別条項でも年720hが上限です（労基法36条）');
      if (c36.over45count > 6) out.push('時間外が<b>月45時間を超えた月が年' + c36.over45count + '回</b>あります。特別条項でも年6回までです（労基法36条）');
    }
    return out;
  }
  function laborLimitWarn(e, ctx) { return laborLimitItems(e, ctx).map(function (t) { return '<div class="cr-warn" style="margin:8px 0 0">⚠ ' + t + '。</div>'; }).join(''); }
  function laborLimitText(e, ctx) { return laborLimitItems(e, ctx).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join(' / '); } // 表ビューの⚠tooltip用(タグ除去)

  // ── ⑥ 社会保険（健保法・厚年法） ──
  // ③社会保険(健保/厚年)を常用らしい人で恣意的にオフにした時の黄警告(健保法/厚年法の強制加入)。産育休/休職の免除・年齢による自動喪失・短時間は対象外。非ブロック。
  function shahoOffWarn(e, ctx) {
    if (!e || (e.workStatus && e.workStatus !== 'normal')) return '';           // 産育休/休職等=正当な免除/調整
    if (!(e.payType === '月給' || e.payType === '役員')) return '';             // 時給/日給/歩合の短時間は適用除外の可能性=誤警告回避
    if (e.shortTimeType) return '';                                       // 短時間就労者/短時間労働者を宣言済=適用除外の可能性=誤警告回避(L-3)
    var pc = PC(), ap = e.apply || {}, off = [];
    var healthElig = !(pc && pc.isHealthTarget) || pc.isHealthTarget(e.birthYmd, YM(ctx));   // 75歳未満=加入対象
    var pensionElig = !(pc && pc.isPensionTarget) || pc.isPensionTarget(e.birthYmd, YM(ctx)); // 70歳未満=加入対象
    if (ap.health === false && healthElig) off.push('健康保険');
    if (ap.pension === false && pensionElig) off.push('厚生年金');
    if (!off.length) return '';
    return '<div class="cr-warn" style="margin:6px 2px 0">⚠ ' + off.join('・') + 'をオフにしています。<b>短時間労働者などの適用除外</b>でなければ、常用の方は<b>加入が必要</b>です（健保法・厚年法。最終判断は会社でご確認ください）。</div>';
  }
  // 正社員(通常労働者)の週所定労働時間 = 1日の所定 × 週の労働日数(7 − 休みの曜日数)。会社設定から導出。未設定は法定上限40hで代用。
  function fullTimeWeeklyH(ctx) {
    var c = C(ctx);
    var dwh = num(c.dailyWorkH) + num(c.dailyWorkM) / 60; if (dwh <= 0) return 40;
    var offDays = ((c.holidays || []).length); var workDays = 7 - offDays; if (workDays <= 0 || workDays > 7) workDays = 5;
    var h = dwh * workDays; return (h > 0 && h <= 60) ? h : 40; // 常識外の値は40hで代用(誤判定防止)
  }
  // その人の「所定内 月額賃金」推定(社保88,000円判定用)。残業/賞与/通勤/家族/精皆勤は含めない=最賃算入賃金と同じ考え方。
  //  時給=時給×(週所定×52/12)/ 日給=日給×月所定日数概算 / 月給等=基本給+最賃算入手当。あくまで概算(黄警告の入口・最終は会社確認)。
  function shoteiMonthlyWage(e, ctx) {
    var wk = num(e.weeklyScheduledH);
    if (e.payType === '時給') { return Math.round(num(e.hourly) * (wk > 0 ? wk * 52 / 12 : 0)); }
    if (e.payType === '日給') { var co = C(ctx); var dwh = num((e.dailyWorkH !== '' && e.dailyWorkH != null) ? e.dailyWorkH : co.dailyWorkH) + num((e.dailyWorkM !== '' && e.dailyWorkM != null) ? e.dailyWorkM : co.dailyWorkM) / 60; var days = (dwh > 0 && wk > 0) ? (wk / dwh * 52 / 12) : 0; return Math.round(num(e.base) * days); }
    return num(e.base) + (minWageTeate ? num(minWageTeate(e)) : 0); // 月給/役員/歩合/カスタム=基本給+最賃算入手当
  }
  // ②社保 加入判定の黄警告(短時間労働者)。lib/shaho-kanyu.js。役員/業務委託/休職・既に社保オンは対象外。誤警告ゼロ最優先。
  function shahoKanyuWarn(e, ctx) {
    var sk = SK(); if (!sk) return '';
    if (!e || e.employmentType === 'contractor' || e.payType === '役員' || (e.workStatus && e.workStatus !== 'normal')) return '';
    var wk = num(e.weeklyScheduledH); if (wk <= 0) return ''; // 週所定未入力=判定材料なし(誤警告しない)
    var ap = e.apply || {}, alreadyOn = (ap.health !== false) && (ap.pension !== false); // 既に健保・厚年オン=加入済み→注意不要
    if (alreadyOn) return '';
    var r = sk.judge({ weeklyH: wk, fullTimeWeeklyH: fullTimeWeeklyH(ctx), monthlyShoteiWage: shoteiMonthlyWage(e, ctx),
      isStudent: !!e.honninKinrou, tokuteiTekiyo: !!C(ctx).shakaTokutei, ym: YM(ctx) });
    if (!r.required) return '';
    return '<div class="cr-warn" style="margin:6px 2px 0">⚠ この方は<b>社会保険（健康保険・厚生年金）の加入対象の可能性</b>があります（' + esc(r.reasons.join('／')) + '）。健保・厚年をオフにしています。最終判断は会社・年金事務所でご確認ください。</div>';
  }

  // ── ⑦ 法定データの鮮度（silent-wrong防止・会社/月スコープ） ──
  // 対象月の法定値(社保料率・所得税額表・最低賃金)が未収録年度なら暫定計算の黄警告(silent-wrong防止)。値は捏造せず直近収録値で暫定。
  /* ★2026-11-01 健保だけで なく 介護・所得税も 見る★
     前は getKenko の stale だけで「社会保険料率・所得税額表」を 出していた。
     ・介護：getKenko の stale は 年の 決め打ちで KAIGO_NENDO と つながらない＝健保だけ 新年度に 上げて
       介護を 入れ忘れると 介護は 前年度の 率で 黙って 計算され、この 警告も 出なかった。
     ・所得税：額は 支払日の 年で 選ぶ（payroll-monthly taxYearOf と 同じ・11-04 から。前は 対象月の 年）。収録（PARAMS）より 新しい 年分は
       直近の 表で 計算するのに、社保年度が 3月から なので 1・2月分（例 2027-01）は 健保が 古く ならず 警告が 出なかった。
     ★2026-11-04 候補④ 字を 分けた★ 前は「対象月（ym）の 社会保険料率・所得税額表」の 1種類＝
       2027-12 分 翌月払い（税は 2028 の表）でも 対象月・社保と 書き、社保だけ 古い 月（2027-06）でも 所得税額表と 書いた。
       ⇒ 社保（健保・介護）と 最賃は「対象月（ym）の …」、所得税は「所得税額表の YYYY年分（支払日の年／日払い・週払いの日の年／対象月の年）」。
       「は未収録の年度です」は 残す（ops-golden-parity・make-golden が この字で STATUTORY_STALE を 拾う）。 */
  function zeiSaishinNen() {
    var D = DN(); if (!D || !D.PARAMS) return null;
    var ks = Object.keys(D.PARAMS).filter(function (k) { return /^\d{4}$/.test(k); });
    return ks.length ? Math.max.apply(null, ks.map(Number)) : null;
  }
  function statutoryStaleWarn(ctx) {
    var msgs = []; var S = SHH(); var ym = YM(ctx); var shahoFurui = false;
    if (S && S.getKenko) { var k = S.getKenko('tokyo', ym); if (k && k.stale) shahoFurui = true; }
    if (S && S.getKaigo) { var g = S.getKaigo(ym); if (g && g.stale) shahoFurui = true; }
    // 所得税は 支払日の 年で 表を 選ぶ（payroll-monthly taxYearOf と 同じ年で 比べる・11-04）
    var _pm = PM(), zy = (_pm && _pm.taxYearOf) ? _pm.taxYearOf(ctx) : parseInt(String(ym).slice(0, 4), 10), zl = zeiSaishinNen();
    var cyc = C(ctx).payCycle, hibetsu = (cyc === 'daily' || cyc === 'weekly');
    var zei = []; // 古い 所得税の 年分（年＋基準）。年を またぐ 紙は 2年分とも 古い 事が ある＝両方 書く
    if (zy && zl != null && zy > zl) zei.push(zy + '年分（' + (hibetsu ? '対象月の年' : '支払日の年') + '）');
    /* ★日払い・週払いの 日別の 紙は 日ごとの 年で 表を 選ぶ（daily-pay taxYearForDay）★（2026-11-04 候補③）
       ＝12月の 紙に 翌年1月の 日が 入ると その年の 表が 無くても 黙って 最新の 表（tableFor）。taxYearOf は 日払い/週払いで 対象月の 年なので 見えなかった。
       ctx.dayTaxYear＝呼ぶ側（app.js）が taxYearForDay で 回した 紙の 年の 最大（決まりは lib の 1か所・ここで 年を 推し直さない）。無ければ 前と 同じ。 */
    var dty = parseInt(ctx && ctx.dayTaxYear, 10);
    if (hibetsu && dty && zl != null && dty > zl && dty > zy) zei.push(dty + '年分（日払い・週払いの日の年）');
    if (shahoFurui) msgs.push('社会保険料率');
    // ★2026-11-06 候補⑥ 雇用保険（労働保険年度＝4月から）も 見る＝前は 2027-04〜 黙って 令和8の 率
    var KHl = KH(); if (KHl && KHl.employStale && KHl.employStale(ym)) msgs.push('雇用保険料率');
    var SA = SAI();
    if (SA && SA.saiteiStale && SA.saiteiStale(YM(ctx))) msgs.push('最低賃金');
    var parts = [];
    if (msgs.length) parts.push('対象月（' + esc(YM(ctx)) + '）の <b>' + msgs.join('・') + '</b>');
    if (zei.length) parts.push('<b>所得税額表の ' + zei.join('・') + '</b>');
    if (!parts.length) return '';
    return '<div class="cr-warn" style="margin:0 0 10px">⚠ ' + parts.join('、') + ' は未収録の年度です。直近の収録年度の値で<b>暫定計算</b>しています（公式値が公表されたらデータ更新が必要）。</div>';
  }

  /* ★⑦-1b 賞与の 古い表の 黄警告＝支給月（payYm）で 見る★（2026-11-04 夜）
     賞与の 計算（app.js computeBonus）は ym＝支給月（bonusYmOf）で 健保・介護（支給月の 社保年度）と
     賞与の 所得税（shoyo-zei shoyoYearOf＝支給月の 年：甲乙の 算出率表 KOU/OTSU_BY_YEAR・前月なし等の 特例は 月額表＝densan PARAMS）を 選ぶ。
     前は 警告が 対象月（state.month）でしか 無く、賞与の 画面にも 印刷の 賞与の 紙にも 出なかった＝支給 2028-01 で 黙って 令和9の 表。
     ・税は 表ごとに「その年が 在るか」で 見る（最新との 比べでは ない）＝収録より 古い 年（支給 2025-12 → pickYear が 2026 へ 寄せる）も
       年の 抜け（中央から 甲だけ 新しい 年が 来た 日）も 拾う（設計前 taiketsu S1）。月額表が 読めない 時は 甲乙だけで 見る（黙る 側へ 倒さない・N2）。
     ・最賃は 賞与に 効かない＝見ない。雇用保険は 支給月の 労働保険年度で 見る（11-06 候補⑥・前は koyo-hoken が 黙って 2026 へ 寄せていた）。
     ・ctx.payDay が 年-月-日で 読めて 月が 支給月と 違う 時は「表は 支給月で 選んでいる」と 別の 黄色で 言う（式は 変えない・S2）。
       計算の 年を 支給日へ 移すかは お金の 決め＝司さんに 訊く 物。 */
  function bonusZeiAru(y) {
    var Z = SZ(), D = DN(); if (!Z || !y) return true; // 賞与の lib が 無い 時は 計算側（szMissing）が 確定を 止める
    var aru = !!(Z.KOU_BY_YEAR && Z.KOU_BY_YEAR[y]) && !!(Z.OTSU_BY_YEAR && Z.OTSU_BY_YEAR[y]);
    if (D && D.PARAMS) aru = aru && !!D.PARAMS[y];
    return aru;
  }
  function bonusStaleWarn(ctx) {
    var S = SHH(), ym = YM(ctx), furui = false, parts = [], out = '';
    if (S && S.getKenko) { var k = S.getKenko('tokyo', ym); if (k && k.stale) furui = true; }
    if (S && S.getKaigo) { var g = S.getKaigo(ym); if (g && g.stale) furui = true; }
    var KHb = KH(), koyoFurui = !!(KHb && KHb.employStale && KHb.employStale(ym)); // 賞与の 雇用保険料も 支給月の 年度（app.js computeBonus employYearOfYm(ym)）
    var hoken = []; if (furui) hoken.push('社会保険料率'); if (koyoFurui) hoken.push('雇用保険料率');
    if (hoken.length) parts.push('支給月（' + esc(ym) + '）の <b>' + hoken.join('・') + '</b>');
    var y = parseInt(String(ym).slice(0, 4), 10);
    if (y && !bonusZeiAru(y)) parts.push('<b>賞与の所得税の表の ' + y + '年分（支給月の年）</b>');
    // 締めの 字は 古い 年（もう 公表済み）にも 新しい 年にも 合う 言い方（差分 taiketsu 任意1）。「は未収録の年度です」は 月次と 揃えて 残す
    if (parts.length) out += '<div class="cr-warn" style="margin:0 0 10px">⚠ ' + parts.join('、') + ' は未収録の年度です。直近の収録年度の値で<b>暫定計算</b>しています（その年の公式値をデータに入れる必要があります）。</div>';
    var pd = String((ctx && ctx.payDay) || '').trim(), pym = shikyubiYm(pd, ym);
    if (pym && ym && pym !== String(ym)) {
      out += '<div class="cr-warn" style="margin:0 0 10px">⚠ 支給日（' + esc(pd) + '）と 賞与支給月（' + esc(ym) + '）の 月が 違います。社会保険料率・賞与の所得税の表は <b>賞与支給月</b>で 選んでいます。支給日の 月で 払うなら 賞与支給月を 直してください。</div>';
    }
    return out;
  }
  /* 支給日の 欄（自由文）→ 'YYYY-MM'。読めなければ ''（読めない 物で 決めない）。
     客が 打つ 書き方を 読む（差分 taiketsu 止め1）：2028-01-08・2028/1/8・2028.1.8・2028年1月8日・令和10年1月8日・全角数字。
     年の 無い 1月8日・1/8 は 月だけ 読み、年は 支給月の 年（支給月より 前の 月なら 翌年）＝月が 違えば ずれ。
     ★曜日「（土）」・「予定」「支給」・R10.1.8・令和10.1.8・全角の 区切り（．－／）・8桁 も 読む★（差分 taiketsu 2回目 任意1＝振込を 使わない 会社は ここでしか 気づけない）。
     ★付いた 語は 名簿で 消さず、日付の 字（数字・/ . - ・年月日・令和元・R）以外を 全部 空白に する★（4回目 任意1〜3＝名簿の 漏れ
       「支払い日」「振込日」が 毎回 出た）。頭に 残る「日」（支払い日 → 日）は 落とす。読みは ^…$＝字 全体が 日付の 形の 時だけ。 */
  function shikyubiYm(v, ym) {
    var s = String(v == null ? '' : v).replace(/[０-９．－／（）：　]/g, function (c) { return c === '　' ? ' ' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[ー−‐–―ｰ]/g, '-').replace(/\([^)]*\)/g, ' ').replace(/[^0-9\/\.\-年月日令和元Rr\s]/g, ' ').replace(/^[\s日\-\/\.]+/, '').trim(); // 頭の「日」「-」（ボーナス の ー 等）を 落とす
    if (!s) return '';
    var p2 = function (n) { return ('0' + n).slice(-2); }, m;
    var ok = function (y, mo) { y = +y; mo = +mo; return (y >= 1900 && mo >= 1 && mo <= 12) ? (y + '-' + p2(mo)) : ''; };
    if ((m = s.match(/^(\d{4})\s*[\/\.\-年]\s*(\d{1,2})\s*[\/\.\-月]\s*(\d{1,2})\s*日?$/))) return ok(m[1], m[2]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ok(m[1], m[2]);
    if ((m = s.match(/^(?:令和|R)\s*(\d{1,2}|元)\s*[年\.\/\-]\s*(\d{1,2})\s*[月\.\/\-]\s*(\d{1,2})\s*日?$/i))) return ok(2018 + (m[1] === '元' ? 1 : +m[1]), m[2]);
    if ((m = s.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?$/))) {
      var by = parseInt(String(ym || '').slice(0, 4), 10), bm = parseInt(String(ym || '').slice(5, 7), 10), mo = +m[1];
      if (!by || !bm) return '';
      return ok(mo < bm ? by + 1 : by, mo);
    }
    return '';
  }

  /* ── ⑦-2 ★都道府県の未選択（黙って東京で計算されるのを止める）★ ──────────────
   * 【2026-08-09 実測】従業員の都道府県が空だと:
   *   ・健康保険料率 … ★黙って東京の率で計算され、名前も「東京都」と出る★(getKenkoのフォールバック)
   *   ・最低賃金     … getChingin('')=null → minWageInfo が null ＝ ★最賃割れの判定が行われない★
   *   ＝ 赤くも黄色くもならずに違う金額で回る。だから【選ぶまで確定させない】。
   * ★既に入っている県は書き換えない★（勝手に直さない）。東京のままの人数は数えて出すだけ。
   * 純関数＝画面に触らないので、テストが作り物で確かめられる。 */
  function prefStats(emps, ctx) {
    /* ★会社の県が入っていれば、人が空でも「未選択」ではない★（会社の県で計算できる）。
       ctx を渡さずに呼ばれた時は 今までどおり人の県だけを見る（古い呼び方を壊さない）。 */
    var list = emps || [], missing = [], tokyo = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var p = String(effPref(e, ctx) == null ? '' : effPref(e, ctx)).trim();
      if (!p) missing.push({ id: e.id, name: e.name || '' });
      else if (p === 'tokyo') tokyo++;
    }
    return { missing: missing, missingCount: missing.length, tokyoCount: tokyo, total: list.length };
  }
  // 未選択が1人でもいれば黄色。0人なら空文字（＝何も出さない）。
  /* ★文は ここ 1か所★（画面の 警告も 確認の 札も 同じ 言い方にする＝2か所に 書かない） */
  var PREF_MISSING_TEXT = '都道府県が未選択です。健康保険料率が県ごとに違うため、選ぶまで正しい額になりません（最低賃金の判定もできません）。設定 ▸ 従業員マスタ で選んでください。';
  function prefMissingText() { return PREF_MISSING_TEXT; }
  /* ★案内は「押せる」まで 作る★（2026-09-03 穴①）
     前は 文で「設定 ▸ 従業員マスタ で選んでください」と 言うだけ＝★人が 自分で 探す★だった。
     同じアプリの ★最低賃金割れの 警告は もう 押せる★（data-fix-emp）ので ★その型を そのまま 借りる★。
     ★指すのは id★＝並び替え・絞り込みで ずれない（番号で 指すと 別人に 飛ぶ）。 */
  function prefMissingWarn(emps, ctx) {
    var s = prefStats(emps, ctx);
    if (!s.missingCount) return '';
    /* ★本文は 今までどおり★＝①誰か（2人までは 名前・3人以上は「ほか◯名」で ★1行に 収める★）
       ②理由 ③★どこで 直すか（設定 ▸ 従業員マスタ）★。
       ★押せる所を 足しても この3つを 消さない★（2026-09-03＝一度 消して 既存の 見張り2本が 赤に なった）。 */
    var nm = s.missing.map(function (x) { return esc(x.name); });
    var who = nm.length <= 2 ? nm.join('・') : (nm[0] + 'ほか' + (nm.length - 1) + '名');
    /* ★押せる所★は 最大3人まで（それ以上 並べると 帯が 伸びて 読まれない）。
       4人目からは「ほか◯名」を 押すと ★先頭の 未選択者★へ 行く（そこで 直せば 次が 出る）。 */
    var MAX = 3;
    var tap = s.missing.slice(0, MAX).map(function (x) {
      return '<b class="mw-fix" data-fix-emp-id="' + esc(x.id) + '">' + esc(x.name || '（無名）') + ' の県を選ぶ ▸</b>';
    });
    if (s.missingCount > MAX) {
      tap.push('<b class="mw-fix" data-fix-emp-id="' + esc(s.missing[MAX].id) + '">ほか' + (s.missingCount - MAX) + '名 ▸</b>');
    }
    return '<div class="cr-warn" style="margin:0 0 10px">⚠ <b>都道府県が未選択</b>です（' + who + '）。'
      + '健康保険料率が県ごとに違うため、<b>選ぶまで正しい額になりません</b>（最低賃金の判定もできません）。'
      + '設定 ▸ 従業員マスタ で選んでください。'
      + '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:8px 14px">' + tap.join('') + '</div></div>';
  }
  /* ★仮計算の札★（2026-09-03 指示役の裁定3）
     県が 未選択のままでも ★一覧/集計・明細の紙・帳票の 3本には 数字が 出る★（実測）。
     出るのを 止めない＝★でも 黙って 出さない★。★文は ここ 1か所★で 作り、画面も 紙も 同じ言い方にする。
     ★何の率で 計算したかを 必ず 名乗る★（getKenko の daiyo/riyu を そのまま 使う）。 */
  function kariKeisanNote(emp, ym) {
    var S = SHH(); if (!S || !S.getKenko) return '';
    var p = String((emp && emp.pref) || '');
    if (p) return '';                                   // ★県が 在れば 札は 出さない★
    var k = S.getKenko(p, ym);
    if (!k || !k.daiyo) return '';
    return '県が未選択のため、健康保険料は' + (k.name || '東京都') + 'の率で仮に計算しています';
  }
  // 「東京のままの人が何人いるか」を知らせるだけの1行（黄色にしない・書き換えない）。0人なら空。
  function prefTokyoNote(emps, ctx) {
    var s = prefStats(emps, ctx);
    if (!s.tokyoCount) return '';
    return '<p class="hint" style="margin:0 0 8px">都道府県が<b>東京都</b>のまま：' + s.tokyoCount + '名'
      + '（初期値のままかもしれません。健康保険料率は県ごとに違います）</p>';
  }

  // ── ⑦b 読めない金額（2026-11-09 ㉔）──
  /* ★支給・控除・勤怠の 値が 数として 読めないと、計算（PayrollMonthly.num）は ★黙って 0★ に する★
     （「ー５０００」「－５０００」「▲5000」「５０００円」「￥５０００」「５　０００」等＝打った 人は 入れた つもり）
     ⇒ その人は 支給が 消えた／控除が 消えた まま 確定・振込・印刷・Excel に 進めた。
     ★判定★＝num と ★同じ 正規化★（全角の数字と「．」を半角へ・「，」「、」「,」半角の空白を消す）の 後、
       「符号＋数字（＋小数）」で 無ければ 読めない。★isNaN だけでは 足りない★＝Infinity・1e400 は 数に なって
       net が Infinity/NaN に なり 振込で 黙って 払われない。5e3・0x10 も 人が 打つ 形で ないので 止める。
     ★空（null/undefined/空白だけ）は 読めない で ない★（0 として 読むのが 今までの 決まり）。
     ★対象★＝支給・法定外控除の 全行＋勤怠は 計算が 引く 行だけ（kintaiVal と 同じ「最初に 当たる 行」）。
       勤怠の 自由な 行（メモ代わり）は 計算に 入らないので 止めない。★読み方は 1つも 増やさない★（額は 変えない）。 */
  function yomenaiVal(v) {
    if (v == null) return false;
    var s = String(v).replace(/[０-９．]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); })
      .replace(/[，、]/g, '').replace(/[, ]/g, '').trim();
    if (!s) return false;
    return !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s);
  }
  var YOMENAI_KINTAI = [/出勤/, /欠勤/, /代休取得/];   // ★payroll-monthly.js の kintaiVal の 呼び（59・180・264）と 同じ★
  var YOMENAI_GUN = { shikyu: '支給', extraKojo: '控除', kintai: '勤怠' };
  function yomenaiGyou(e) {
    var out = []; if (!e) return out;
    ['shikyu', 'extraKojo'].forEach(function (g) {
      (e[g] || []).forEach(function (it, ri) { if (it && yomenaiVal(it.value)) out.push({ g: g, ri: ri, label: String(it.label || ''), value: String(it.value) }); });
    });
    var kt = e.kintai || [];
    YOMENAI_KINTAI.forEach(function (re) {
      var ri = -1; for (var i = 0; i < kt.length; i++) { if (re.test((kt[i] && kt[i].label) || '')) { ri = i; break; } }
      if (ri < 0 || !yomenaiVal(kt[ri].value)) return;
      if (out.some(function (x) { return x.g === 'kintai' && x.ri === ri; })) return;
      out.push({ g: 'kintai', ri: ri, label: String(kt[ri].label || ''), value: String(kt[ri].value) });
    });
    return out;
  }
  // ★文は ここ 1か所★（画面の 札・確認済みの 門・集計・Excel・ops で 同じ 言い方）。「金額が読めない」で 始める＝collect の 枝分けの 目印
  function yomenaiText(list) {
    if (!list || !list.length) return '';
    var MAX = 3;
    var ji = list.slice(0, MAX).map(function (x) { return (YOMENAI_GUN[x.g] || '') + '「' + esc(x.label || '項目名なし') + '」＝「' + esc(x.value) + '」'; }).join('、')
      + (list.length > MAX ? ' ほか' + (list.length - MAX) + '行' : '');
    return '金額が読めない行があります（' + ji + '）。今は0として計算されています。半角の数字（例 5000・-5000）で入れ直してください（入れ直すまで 確定・振込・印刷・Excel は止めます）';
  }

  // ── ⑧ 経理向けサマリ（Excel/集計に出す） ──
  // 経理向け警告(最賃割れ/差引マイナス/休業手当未入力)。従業員に渡す明細でなく集計/Excelに出す。
  function empWarnings(e, ctx) {
    var w = []; var mw = minWageInfo(e, ctx); if (mw && !mw.ok) w.push('最低賃金（' + mw.prefName + ' 時給' + fmtN(mw.reduce > 0 ? mw.effMinWage : mw.minWage) + '円' + (mw.reduce > 0 ? '・減額特例' + fmtN(mw.reduce) + '%後' : '') + '）未満（約' + fmtN(mw.hourly) + '円）');
    try { var r = PM().compute(e, ctx); if (r && r.netNegative) w.push('差引支給がマイナス'); } catch (_) { }
    if (e.workStatus === 'kyugyo' && num(e.leavePay) <= 0) w.push('休業手当が未入力（平均賃金60%以上・労基26条）');
    else if (e.workStatus === 'kyugyo' && e.payType === '月給' && num(e.leavePay) > 0 && num(e.leavePay) < 0.4 * num(e.base)) w.push('休業手当が平均賃金の60%を下回る可能性（労基26条・要確認）'); // 全月休業の下限≒平均賃金(月給/30.4)×0.6×所定20日≒0.4×基本給。誤警告を避け0.4未満のみ検知
    var h = hoshoInfo(e); if (h && !h.ok) w.push('保障給なし（完全歩合・労基27条の恐れ）');
    ceilItems(e, ctx).forEach(function (x) { w.push(x.text); });
    var yt = yomenaiText(yomenaiGyou(e)); if (yt) w.push(yt);
    return w;
  }

  // ── ⑨ 計算の注記（info・engine由来） ──
  // 入社月/退職月の日割・社保の注記(黄・ブロックしない)
  function prorateNote(e) {
    var pr = e._prorate, lw = e._leaveNoWork; var msg = [];
    if (pr && pr.prorate && pr.factor < 1) msg.push((pr.isJoin && !pr.isLeave ? '入社月' : pr.isLeave && !pr.isJoin ? '退職月' : '入社/退職月') + 'につき在籍' + pr.zd + '日で日割（' + pr.zd + '/' + pr.dim + '日）');
    if (pr && pr.mid) msg.push('月中退職のため当月の社保（健保・厚年・介護）は徴収しません（資格喪失=退職日翌日・前月分まで／雇用保険は実支払分）');
    if (!(pr && pr.prorate) && lw && lw.partial && lw.noWork > 0) msg.push((e.workStatus === 'ikukyu' ? '育休' : '産休') + 'で当月の所定' + lw.total + '日のうち' + lw.noWork + '日が不就労のため控除（就労' + (lw.total - lw.noWork) + '日分を支給）。社保は月末基準で免除・所得税/雇用保険は就労分に発生');
    return msg.length ? '<div class="cr-warn" style="margin:0 12px 10px">⚠ ' + msg.join('。') + '。</div>' : '';
  }

  // ══ オペレーション用: 構造化して返す ══
  var strip = function (h) { return String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^[⚠\s]+/, '').replace(/[。\s]+$/, '').trim(); };

  // 従業員1人ぶん。★compute() を先に通してから呼ぶこと(prorateNote は e._prorate を読む)
  function collect(e, ctx) {
    var out = [];
    var push = function (code, level, text) { if (text) out.push({ empId: e.id, code: code, level: level, scope: 'employee', text: strip(text) }); };
    var mw = minWageInfo(e, ctx); if (mw && !mw.ok) push('MIN_WAGE_UNDER', 'warn', mwWarnText(mw));
    var h = hoshoInfo(e); if (h && !h.ok) push('NO_GUARANTEE_PAY', 'warn', hoshoWarnText());
    var mc = minashiCeilItem(e, ctx); if (mc) push(mc.code, 'warn', mc.text);
    var an = annualHoursInfo(e, ctx); if (an && an.over) push('ANNUAL_HOURS_OVER', 'warn', annualHoursWarnText(an));
    laborLimitItems(e, ctx).forEach(function (t) {
      var code = /単月100時間/.test(t) ? 'OT_OVER100' : /月45時間</.test(t) || /月45時間<\/b>を超え/.test(t) ? 'OT_OVER45'
        : /深夜（22時/.test(t) ? 'MINOR_NIGHT' : /時間外・休日労働<\/b>が入って/.test(t) ? 'MINOR_OT'
          : /平均が<b>月80時間/.test(t) ? 'OT36_AVG80' : /年720時間/.test(t) ? 'OT36_YEAR720'
            : /月45時間を超えた月が年/.test(t) ? 'OT36_COUNT6' : 'OT_LIMIT';
      push(code, 'warn', t);
    });
    push('SHAHO_OFF_ELIGIBLE', 'warn', shahoOffWarn(e, ctx));
    push('SHAHO_KANYU_REQUIRED', 'warn', shahoKanyuWarn(e, ctx));
    if (e.employmentType === 'contractor') push('CONTRACTOR_DISGUISED', 'warn', '控除なしの報酬明細（源泉・社保・住民税・年末調整なし＝支給＝支払額）。実態が従業員なら社会保険・労働法の対象になる可能性があります（偽装請負）');
    if (e.taxClass === 'hei' && e.payType !== '日給') push('HEI_NOT_DAILY', 'warn', '丙は給与形態＝日給が前提です。現在「' + esc(e.payType) + '」なので丙は適用せず甲欄で計算しています');
    // 経理サマリ由来(差引マイナス・休業手当)。最賃/保障給は上で出しているので重複を避ける
    empWarnings(e, ctx).forEach(function (t) {
      if (/^最低賃金/.test(t) || /^保障給なし/.test(t) || /^割増の率が高すぎ/.test(t) || /^固定残業（みなし）.*を超えています/.test(t)) return;
      // ★読めない金額は ★先に★ 枝分け★（後ろの 枝は「未入力」→休業手当・残りは KYUGYO_TEATE_LOW に 化ける）
      push(/^金額が読めない/.test(t) ? 'KINGAKU_YOMENAI' : /マイナス/.test(t) ? 'NET_NEGATIVE' : /未入力/.test(t) ? 'KYUGYO_TEATE_MISSING' : 'KYUGYO_TEATE_LOW', 'warn', t);
    });
    // info(計算の注記)
    var pr = e._prorate, lw = e._leaveNoWork;
    if (pr && pr.prorate && pr.factor < 1) push('PRORATE_JOIN_LEAVE', 'info', (pr.isJoin && !pr.isLeave ? '入社月' : pr.isLeave && !pr.isJoin ? '退職月' : '入社/退職月') + 'につき在籍' + pr.zd + '日で日割（' + pr.zd + '/' + pr.dim + '日）');
    if (pr && pr.mid) push('MID_LEAVE_NO_SHAHO', 'info', '月中退職のため当月の社保（健保・厚年・介護）は徴収しません');
    if (!(pr && pr.prorate) && lw && lw.partial && lw.noWork > 0) push('LEAVE_NOWORK_DEDUCTED', 'info', (e.workStatus === 'ikukyu' ? '育休' : '産休') + 'で当月の所定' + lw.total + '日のうち' + lw.noWork + '日が不就労のため控除');
    var co = C(ctx);
    var mh = (e.minashiH != null && e.minashiH !== '') ? e.minashiH : co.minashiH;
    if (num(mh) > 0 && e.payType !== '役員') push('MINASHI_APPLIED', 'info', '固定残業（みなし）' + num(mh) + '時間を控除して計算中（超過分のみ）');
    return out;
  }

  // 会社スコープ
  function collectCompany(ctx) {
    var out = [];
    var push = function (code, level, text) { if (text) out.push({ empId: null, code: code, level: level, scope: 'company', text: strip(text) }); };
    var co = C(ctx);
    var rf = rateFloorWarn(co);
    if (rf) {
      var Wm = W(); var pr = function (v) { return (v != null && v !== '') ? num(v) / 100 : undefined; };
      var low = Wm.belowLegalRates({ ot: pr(co.rateOt), holiday: pr(co.rateHoliday), night: pr(co.rateNight), over60Add: pr(co.rateOver60) });
      low.forEach(function (x) {
        var code = /時間外/.test(x.label) ? 'RATE_BELOW_LEGAL_OT' : /休日/.test(x.label) ? 'RATE_BELOW_LEGAL_HOLIDAY'
          : /深夜/.test(x.label) ? 'RATE_BELOW_LEGAL_NIGHT' : 'RATE_BELOW_LEGAL_OVER60';
        push(code, 'warn', x.label + '（' + Math.round(x.value * 100) + '%→法定' + Math.round(x.floor * 100) + '%）が労基法37条の下限を下回っています');
      });
    }
    rateCeilItems(co).forEach(function (x) { push(x.code, 'warn', x.text); });
    push('STATUTORY_STALE', 'warn', statutoryStaleWarn(ctx));
    return out;
  }

  return {
    isInMinWage: isInMinWage, minWageTeate: minWageTeate, minWageInfo: minWageInfo, mwWarnText: mwWarnText,
    hoshoInfo: hoshoInfo, hoshoWarnText: hoshoWarnText,
    rateFloorWarn: rateFloorWarn, rateCeilWarn: rateCeilWarn, ceilWarn: ceilWarn, ceilItems: ceilItems, MINASHI_CEIL_H: MINASHI_CEIL_H,
    annualHoursInfo: annualHoursInfo, annualHoursWarnText: annualHoursWarnText,
    laborLimitItems: laborLimitItems, laborLimitWarn: laborLimitWarn, laborLimitText: laborLimitText,
    shahoOffWarn: shahoOffWarn, fullTimeWeeklyH: fullTimeWeeklyH, shoteiMonthlyWage: shoteiMonthlyWage, shahoKanyuWarn: shahoKanyuWarn,
    statutoryStaleWarn: statutoryStaleWarn, bonusStaleWarn: bonusStaleWarn, _shikyubiYm: shikyubiYm, empWarnings: empWarnings, prorateNote: prorateNote,
    yomenaiVal: yomenaiVal, yomenaiGyou: yomenaiGyou, yomenaiText: yomenaiText,
    prefStats: prefStats, prefMissingWarn: prefMissingWarn, prefMissingText: prefMissingText, prefTokyoNote: prefTokyoNote, kariKeisanNote: kariKeisanNote,
    collect: collect, collectCompany: collectCompany,
  };
});
