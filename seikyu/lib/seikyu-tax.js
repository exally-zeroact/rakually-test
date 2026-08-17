/* seikyu-tax.js — 請求書の消費税（計算の唯一の正）
 * ==============================================================================
 * ★法律で決まっている所（選べない）★  出典: 国税庁 適格請求書等保存方式（インボイス）
 *   ・「一の適格請求書につき、★税率ごとに1回の端数処理★を行う必要があります」
 *   ・「個々の商品ごとに消費税額等を計算し、1円未満の端数処理を行い、その合計額を
 *      消費税額等として記載することは★認められません★」
 *   → ★税率ごとに合計を出してから、そこで1回だけ丸める★
 *   → ★8%が1行でもあれば、10%と8%を別々に集計して別々に丸める★
 *
 * ★会社が選べる所★
 *   ・丸め方（切捨て floor / 切上げ ceil / 四捨五入 round）… 法律は任意としている
 *   ・内税(inclusive) か 外税(exclusive) か
 *
 * ★率の数字はこのファイルに1つも書かない★
 *   kyuyo/lib/shouhizei-ritsu.js（唯一の正）から取る。率が変わってもここは直さない。
 *
 * ★出典（一次情報・確認日 2026-08-15）★
 *   国税庁 インボイス制度に関するQ&A 問57「適格請求書に記載する消費税額等の端数処理」
 *     https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/57.pdf
 *     ・「一の適格請求書につき、★税率ごとに1回の端数処理★を行う」
 *     ・「★個々の商品ごとに消費税額等を計算し、1円未満の端数処理を行い、
 *        その合計額を消費税額等として記載することは 認められません★」
 *     ・端数の寄せ方（切上げ・切捨て・四捨五入）は ★会社が選んでよい★
 *   同 問59（税抜と税込が混ざる場合も同じ扱い）
 *
 * ★行ごとの税額(line.tax)も返す★（うちの実物32枚は全部この列を持っている）。
 *   ただし ★足したら必ず「税率ごとに1回 端数処理した額」に一致させる★。
 *   ＝行ごとに丸めて足す道は作らない（上のQ&Aで認められていない）。
 *   端数は最後の行に寄せ、寄せた事は spread に残す（★黙って寄せない★）。
 *   taxRef は「行ごとに丸めただけの生の値」＝寄せる前（比べる時に使う）。
 *
 * ★画面に依らない（DOMを1つも触らない）★＝素のNodeで全パターン回せる。
 *
 * 【利用】ブラウザ window.SeikyuTax（先に shouhizei-ritsu.js を読む）
 *         Node    require('./seikyu-tax.js')
 */
(function (root, factory) {
  var SR = null;
  if (typeof module === 'object' && module.exports) {
    SR = require('../../kyuyo/lib/shouhizei-ritsu.js');
    module.exports = factory(SR);
  } else {
    root.SeikyuTax = factory(root.ShouhizeiRitsu);
  }
})(typeof self !== 'undefined' ? self : this, function (SR) {
  'use strict';

  var ROUNDINGS = ['floor', 'ceil', 'round'];
  var TAX_MODES = ['inclusive', 'exclusive'];
  var MAX_LINES = 1000; // ★1通の蓋。超えたら赤で止める（黙って切らない）

  /* 率(%)の一覧を「唯一の正」から作る。0=消費税がかからない行（非課税・対象外）。
     ★ここで 10 や 8 と書かない。書いた瞬間、法が変わった日に嘘をつく。 */
  function pctOf(v) { return Math.round(Number(v) * 10000) / 100; }
  function defaultRates() {
    if (!SR || typeof SR.hyojun !== 'number' || typeof SR.keigen !== 'number') return null;
    return [pctOf(SR.hyojun), pctOf(SR.keigen), 0];
  }

  /* 円未満の丸め。★符号対称＝絶対値で丸めて符号を戻す★
     理由: 値引き行(マイナス)で「切捨て」が税を増やす向きに働くと、引いたはずが増える。
     切捨て=0に近づく / 切上げ=0から遠ざかる、で表裏を揃える。 */
  function roundYen(x, mode) {
    var s = x < 0 ? -1 : 1, a = Math.abs(x);
    var r = mode === 'ceil' ? Math.ceil(a) : mode === 'round' ? Math.floor(a + 0.5) : Math.floor(a);
    return s * r;
  }

  /* 行の金額。★金額を直接打った行はその額をそのまま使う（勝手に作り直さない）★
     数量×単価しか無い行だけ、会社の丸め方で円にする。 */
  function amountOf(ln, rounding) {
    if (ln.amount !== undefined && ln.amount !== null && ln.amount !== '') return Number(ln.amount);
    if (ln.qty === undefined || ln.price === undefined) return 0;
    return roundYen(Number(ln.qty) * Number(ln.price), rounding);
  }

  function zero(errors) {
    return {
      ok: false, errors: errors, lines: [], byRate: [], spread: [],
      exempt: { base: 0 }, nontaxable: { base: 0 }, hasReduced: false,
      subtotal: 0, taxTotal: 0, grandTotal: 0,
    };
  }

  /**
   * compute({ lines, taxMode, rounding }, opts?)
   *   lines[i] = { name, qty?, price?, amount?, rate }   rate は % の数（10 / 8 / 0）
   *   opts.rates … 率の一覧を差し替える（テスト用。null を渡すと投げる＝出どころ無しで動かさない）
   * 返り = { ok, errors[], lines[], byRate[], exempt, hasReduced, subtotal, taxTotal, grandTotal }
   */
  function compute(input, opts) {
    opts = opts || {};
    var rates = Object.prototype.hasOwnProperty.call(opts, 'rates') ? opts.rates : defaultRates();
    if (!rates || !rates.length) {
      throw new Error('消費税率の出どころがありません（kyuyo/lib/shouhizei-ritsu.js を先に読んでください）');
    }
    var inp = input || {};
    var lines = inp.lines || [];
    var taxMode = inp.taxMode;
    var rounding = inp.rounding;
    var errors = [];

    if (TAX_MODES.indexOf(taxMode) < 0) errors.push('税の入れ方が不明です（' + taxMode + '）。内税か外税かを選んでください');
    if (ROUNDINGS.indexOf(rounding) < 0) errors.push('丸め方が不明です（' + rounding + '）。切捨て・切上げ・四捨五入から選んでください');
    if (!Array.isArray(lines)) errors.push('明細がありません');
    else if (lines.length > MAX_LINES) errors.push('明細が' + lines.length + '行あります。1通あたり' + MAX_LINES + '行までです（分けて出してください）');
    if (errors.length) return zero(errors);

    // ── 行を読む（★税率が空・知らない値なら赤。黙って標準税率に寄せない★）
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i] || {};
      var rate = ln.rate;
      if (rate === undefined || rate === null || rate === '') {
        errors.push((i + 1) + '行目「' + (ln.name || '') + '」の税率が空です（税率を選んでください）');
        continue;
      }
      rate = Number(rate);
      if (rates.indexOf(rate) < 0) {
        errors.push((i + 1) + '行目「' + (ln.name || '') + '」の税率 ' + ln.rate + ' は扱えません（使えるのは ' + rates.join('% / ') + '%）');
        continue;
      }
      var amount = amountOf(ln, rounding);
      if (!Number.isFinite(amount)) { errors.push((i + 1) + '行目の金額が数になりません'); continue; }
      if (!Number.isInteger(amount)) { errors.push((i + 1) + '行目の金額に円未満が残っています（' + amount + '）'); continue; }
      // ★計算に使わない項目（摘要・会社が足した自由な列）も そのまま持って出る★
      //   ここで落とすと、紙に「書いたはずの列」が出なくなる（2026-08-10 実際に落ちていた）。
      out.push({
        index: i, name: ln.name || '', qty: ln.qty, unit: ln.unit, price: ln.price,
        amount: amount, rate: rate, taxRef: 0,
        memo: ln.memo || '', extra: ln.extra || {},
        gensen: !!ln.gensen,   // ★源泉の対象か（印だけを持って出る。金額や名前から当てない）
        // ★非課税の印は 0% の行にだけ効く（税率のある行に付いても税は消さない）
        nontax: (rate === 0 && !!ln.nontax),
      });
    }
    if (errors.length) return zero(errors);

    // ── 税率ごとに束ねる（★ここで初めて丸める。1回だけ★）
    var buckets = {};
    var exemptBase = 0;      // 不課税（対象外）＝そもそも取引でない（立替金・給与・寄付）
    var nontaxBase = 0;      // ★非課税★＝住宅の家賃・保険料・切手・印紙（取引だが消費税がかからない）
    for (var j = 0; j < out.length; j++) {
      var r = out[j];
      if (r.rate === 0) { if (r.nontax) nontaxBase += r.amount; else exemptBase += r.amount; continue; }
      if (!buckets[r.rate]) buckets[r.rate] = { pct: r.rate, sum: 0, rows: [] };
      buckets[r.rate].sum += r.amount;
      buckets[r.rate].rows.push(r);
    }

    var byRate = [];
    var spread = [];      // ★端数を最後の行に寄せた記録（黙って寄せない）★
    var taxTotal = 0, taxableBase = 0;
    var pcts = Object.keys(buckets).map(Number).sort(function (a, b) { return b - a; });
    for (var k = 0; k < pcts.length; k++) {
      var b = buckets[pcts[k]];
      var num = Math.round(b.pct * 100); // 10% → 1000（整数で持つ＝小数の誤差を作らない）
      var base, tax, gross;
      if (taxMode === 'inclusive') {
        // ★税込の合計から割り戻す（税率ごとに1回）
        gross = b.sum;
        tax = roundYen(gross * num / (10000 + num), rounding);
        base = gross - tax;
      } else {
        // ★税抜の合計に掛ける（税率ごとに1回）
        base = b.sum;
        tax = roundYen(base * num / 10000, rounding);
        gross = base + tax;
      }
      byRate.push({ pct: b.pct, base: base, tax: tax, gross: gross });
      taxTotal += tax;
      taxableBase += base;
      /* ★行ごとの税額★
         うちの実物32枚は ★全部★ 明細に「消費税」の列を持っている（=E12*0.1）。
         ＝行ごとの税額は「参考」ではなく ★紙に出る本番の数字★。

         ★足したら必ず その税率の税額に一致させる★
           行ごとに丸めた物を足すと、税率ごとに1回だけ丸めた額と ★1円ずれる事がある★。
           ずれたまま列を出すと ★合計 ＝ 小計 ＋ 消費税 が崩れる★（紙の中で辻褄が合わない）。
         ★端数は最後の行に寄せる★。寄せたら ★spread に残して 黙って寄せない★。
         （taxRef は「行ごとに丸めただけの生の値」＝寄せる前。比べる時に要るので残す） */
      var acc = 0;
      for (var q = 0; q < b.rows.length; q++) {
        var row = b.rows[q];
        var t = taxMode === 'inclusive'
          ? roundYen(row.amount * num / (10000 + num), rounding)
          : roundYen(row.amount * num / 10000, rounding);
        row.taxRef = t;
        row.tax = t;
        acc += t;
      }
      /* ★端数は後ろの行から寄せる。ただし ★行の税額をマイナスにしない★★
         （司さん 2026-08-17「検算は 描いた文字を1行ずつ足せ」で見つけた）
         切り上げ(ceil)だと 行ごとの和が 税率ごとの税額を ★上回る★ので 端数は マイナス。
         それを最後の1行だけに押し付けると、その行の税額が ★マイナスになって紙に出る★。
         ★実測 2026-08-17：1680通り中 168通り（10.0%）でマイナス・最悪 −43円★
           例）9行・切り上げ … 最後の行の税が 1円 なのに −3円 を押し付けて ★−2円★。
         ＝★吸収できる行まで さかのぼって分けて寄せる★（0円で止める）。
         ★寄せたら spread に1行ずつ残す★＝黙って寄せない。 */
      var resid = tax - acc;
      for (var z = b.rows.length - 1; z >= 0 && resid !== 0; z--) {
        var rw = b.rows[z];
        /* この行が引き受けられる幅（プラスはいくらでも／マイナスは その行の税額まで） */
        var take = (resid > 0) ? resid : -Math.min(-resid, rw.tax);
        if (take === 0) continue;
        rw.tax += take;
        resid -= take;
        spread.push({ pct: b.pct, residual: take, line: rw.index + 1, name: rw.name || '' });
      }
      /* ★どの行も引き受けられなかった分は 黙って捨てない★
         （その税率の行が全部 0円＝そもそも税額も0のはずなので、ふつうは起きない） */
      if (resid !== 0) spread.push({ pct: b.pct, residual: resid, line: null, name: '（寄せ先が無い）' });
    }

    var subtotal = taxableBase + exemptBase + nontaxBase;
    var redPct = rates.length > 1 ? rates[1] : null;
    return {
      ok: true, errors: [],
      lines: out,
      byRate: byRate,
      exempt: { base: exemptBase },
      nontaxable: { base: nontaxBase },
      hasReduced: redPct !== null && byRate.some(function (x) { return x.pct === redPct; }),
      subtotal: subtotal,
      taxTotal: taxTotal,
      grandTotal: subtotal + taxTotal,
      spread: spread,        // ★1円の端数を最後の行に寄せた時だけ中身が入る★
    };
  }

  return {
    compute: compute,
    roundYen: roundYen,
    rates: defaultRates,
    ROUNDINGS: ROUNDINGS,
    TAX_MODES: TAX_MODES,
    MAX_LINES: MAX_LINES,
  };
});
