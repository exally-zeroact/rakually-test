/* todokede-csv.js — ★届書（算定基礎届など）の CSV を 作る土台★（純関数・2026-09-03）
 * ============================================================================
 * 【一次情報】日本年金機構「ＣＳＶ形式届書作成仕様書（電子申請）／電子媒体届書作成仕様書
 *   （健康保険・厚生年金保険適用関係届書）」★令和8年3月・第16.2版★（PDF 342ページ・原文を 読んだ）
 *   https://www.nenkin.go.jp/denshibenri/denshishinsei/20210401-2.files/specs080302_16.2.pdf
 *   ・項目区切り …「★“,”（カンマ）と設定する／項目区切りは省略しない★」（35p）
 *   ・改行 …「★改行 0D0A（１６進）★／項目区切り 2C」（38p）＝★CRLF★
 *      ★全銀は「改行は 銀行ごと＝勝手に 直すな」だが、ここは ★仕様が 1つに 決めている★★
 *   ・文字 …「1バイト＝ＪＩＳ８単位符号（JIS X 0201-1976）／
 *      2バイト＝★シフトＪＩＳ（JIS X 0208-1990 第一水準・第二水準）★」（38p）
 *   ・元号 …「★昭和：「5」・平成：「7」・令和：「9」★」（137p）
 *   ・引用符（" で囲む）の 記載 … ★342ページ 探して 0件★
 *      ⇒★囲まない で 進む★／★「無い＝囲んではいけない」とは 書かない（未測定）★
 *      ⇒ 囲まないので ★カンマ・改行が 名前に 入ると 列が ずれる★＝★止める★
 *
 * 【★ここが 今日 一番 大事★】★cp932 と JIS X 0208 は 違う★
 *   ★髙・﨑・①・㈱ は cp932（Windows）では 出せるが、仕様の JIS X 0208 では 出せない★。
 *   cp932 で 判定すると ★出せた つもりで 年金機構に 弾かれる★＝★画面に 何も 出ないまま 手が 止まる★。
 *   ⇒ ★巻末（参考資料２「使用可能文字一覧」333p〜）の 区分に 合わせて 判定する★:
 *      使える … 0x8140〜0x84BE（特殊文字・数字・ローマ字・かな 等）／0x889F〜0x9FFC（第一水準）／
 *               0xE040〜0xEAA4（第二水準）
 *      止める … NEC特殊文字 0x8740〜（①Ⅰ㈱）／NEC選定IBM拡張 0xED40〜0xEEFC（髙・﨑）／IBM拡張 0xFA40〜
 *   ※★範囲での 判定は「見込み」★＝巻末の 表を 1字ずつ 突き合わせては いない（機械で 抜こうとして 失敗した）。
 *     ★実物で 通すまで「出せる／出せない」を 言い切らない★。
 *
 * 【★既に在る 全銀の 変換は 使えない★】Zengin.toShiftJisBytes は ★半角だけ★＝
 *   漢字は 0x20（スペース）に 落ちる＝★氏名が 消える★。だから ここで 別に 作る。
 *   ★表は その場で 作る★＝読む側（TextDecoder('shift_jis')）は 標準で 在るので
 *   0x8140〜0xFCFC を 1つずつ 読ませて ★逆引き★を 作る（★9,206字／12ms／データファイル 0★）。
 *   ⇒★外部の 部品も CDN も 要らない＝オフラインの 決まりを 壊さない★。
 *
 * 【利用】ブラウザ window.TodokedeCsv / Node require('./todokede-csv.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.TodokedeCsv = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── ① 元号（一次情報 137p：昭和5・平成7・令和9） ───────────────────────
     ★改元の 日で 変わる★（年だけで 決めない）:
       昭和 … 〜1989-01-07 ／ 平成 … 1989-01-08〜2019-04-30 ／ 令和 … 2019-05-01〜
     ★大正より 前は 返さない★（仕様の 表に 無い＝★分からない物を 埋めない★）。 */
  var GENGO = [
    { code: '9', name: '令和', from: '2019-05-01', base: 2018 },
    { code: '7', name: '平成', from: '1989-01-08', base: 1988 },
    { code: '5', name: '昭和', from: '1926-12-25', base: 1925 }
  ];
  function gengoOf(ymd) {
    var s = String(ymd == null ? '' : ymd).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;                                   /* ★読めない日付は 何も 返さない★ */
    for (var i = 0; i < GENGO.length; i++) {
      if (s >= GENGO[i].from) {
        var y = Number(m[1]) - GENGO[i].base;
        if (y < 1 || y > 99) return null;
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        return { code: GENGO[i].code, name: GENGO[i].name, year: y,
          ymd6: p2(y) + m[2] + m[3] };                     /* YYMMDD 6桁 */
      }
    }
    return null;                                            /* 昭和より 前＝出さない */
  }

  /* ── ② Shift_JIS（表は その場で 作る） ───────────────────────────── */
  var _map = null;
  var _noTool = false;
  function _resetSjisMap() { _map = null; _noTool = false; }   /* 試験で 積み替える為 */
  function sjisMap() {
    if (_map) return _map;
    _map = new Map();
    /* ★道具（TextDecoder）が 無い時は ★空の 表★に なる★＝
       そのまま 使うと ★漢字が 全部 消えた ファイル★が 出る（★静かに 壊れる★）。
       ⇒★印を 立てて badChars が 全部 止める★（2026-09-03＝指示役が 自分の 測り台で 踏んだ）。 */
    if (typeof TextDecoder === 'undefined') { _noTool = true; return _map; }
    var dec = new TextDecoder('shift_jis');
    for (var hi = 0x81; hi <= 0xFC; hi++) {
      for (var lo = 0x40; lo <= 0xFC; lo++) {
        if (lo === 0x7F) continue;
        var s = dec.decode(new Uint8Array([hi, lo]));
        if (s.length === 1 && s !== '�' && !_map.has(s)) _map.set(s, (hi << 8) | lo);
      }
    }
    return _map;
  }
  /* ★JIS X 0208 の 第一・第二水準か★（巻末の 区分に 合わせた・上の注記参照） */
  function inJis(code) {
    return (code >= 0x8140 && code <= 0x84BE)
      || (code >= 0x889F && code <= 0x9FFC)
      || (code >= 0xE040 && code <= 0xEAA4);
  }
  /* 1バイトで 出せる字（ＪＩＳ８単位符号＝ASCII と 半角カナ） */
  function isOneByte(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x20 && c <= 0x7E) || (c >= 0xFF61 && c <= 0xFF9F);
  }
  /* ★出せない 字を 名指しで 返す★（★止めた理由が 人に 分かる★） */
  function badChars(text) {
    var s = String(text == null ? '' : text);
    var map = sjisMap(), out = [], seen = {};
    /* ★道具が 無い＝1字も 出せない★＝★2バイトの 字を 全部 名指しで 止める★（黙って 消さない） */
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      /* ★囲まないので カンマ・改行は 入れられない★（列が ずれる） */
      if (ch === ',' || ch === '\r' || ch === '\n') { if (!seen[ch]) { seen[ch] = 1; out.push(ch === '\n' ? '\\n' : (ch === '\r' ? '\\r' : ch)); } continue; }
      if (isOneByte(ch)) continue;
      var code = _noTool ? null : map.get(ch);
      if (_noTool || code == null || !inJis(code)) { if (!seen[ch]) { seen[ch] = 1; out.push(ch); } }
    }
    return out;
  }
  function toSjis(text) {
    var s = String(text == null ? '' : text), map = sjisMap(), bytes = [];
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '\r') { bytes.push(0x0D); continue; }
      if (ch === '\n') { bytes.push(0x0A); continue; }
      if (isOneByte(ch)) { bytes.push(ch.charCodeAt(0) <= 0x7E ? ch.charCodeAt(0) : (0xA1 + (ch.charCodeAt(0) - 0xFF61))); continue; }
      var code = map.get(ch);
      if (code == null) continue;                            /* ★出せない字は ここへ 来ない（先に 止める）★ */
      bytes.push((code >> 8) & 0xFF); bytes.push(code & 0xFF);
    }
    return new Uint8Array(bytes);
  }

  /* ── ③ 行と ファイル ───────────────────────────────────────
     ★区切りは カンマ・囲まない★（35p）／★改行は CRLF（0D0A）★（38p）
     ★1件も 作れない時は 0バイト★＝全銀と 同じ（中途半端な ファイルを 出さない）。 */
  var CRLF = '\r\n';
  function joinLine(cells) { return (cells || []).map(function (c) { return String(c == null ? '' : c); }).join(','); }
  function build(rows) {
    var list = (rows || []).filter(function (r) { return r && r.length; });
    if (!list.length) return { text: '', bytes: new Uint8Array(0), rows: 0 };
    var text = list.map(joinLine).join(CRLF) + CRLF;
    return { text: text, bytes: toSjis(text), rows: list.length };
  }

  /* ── ④ 算定基礎届データレコード（53項目・136〜142p） ─────────────────
     ★境界の 決め（2026-09-03・指示役の 3つ）★
       ①★1千万円以上は「9999999」★（原文28〜36）＝★丸めた事を santeiWarn で 言う★
         （★黙って お金を 丸めない★）
       ②★報酬が 無い月は「0000000」／基礎日数 0日は「00」★（原文どおり・★どちらを出すか 決めて 揃える★）
       ③★前ゼロを 付けて 桁を 揃える★（原文は「300000」でも「0300000」でも よいが ★1つに 決める★）
         理由＝★取り込む側の 検査が どちらに 厳しいか 分からない／揃っている方が 目で 数えやすい★
     ★個人番号（項番40）は いつも 空★＝★持たない★（70歳未満は 原文でも 空で 通る）。
     ★備考欄項目7・8（項番50・51）は 未測定＝空★（作る時に PDF を もう一度 開く）。 */
  var MAN10 = 9999999;                         /* 1千万円以上の 置き換え値（原文） */
  function n(v) { var x = Number(v); return (isFinite(x) && x > 0) ? Math.round(x) : 0; }
  function pad(v, keta) { var s2 = String(n(v)); while (s2.length < keta) s2 = '0' + s2; return s2.slice(-keta); }
  function money7(v) { return pad(Math.min(n(v), MAN10), 7); }     /* ①＋③ */
  function ym2(ym, which) {                    /* 'YYYY-MM' → 元号/年/月 */
    var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    if (!m) return { code: '', year: '', month: '' };
    var g = gengoOf(m[1] + '-' + m[2] + '-01');
    if (!g) return { code: '', year: '', month: '' };
    return { code: g.code, year: pad(g.year, 2), month: m[2] };
  }
  function santeiRow(inp) {
    inp = inp || {};
    var j = inp.jimusho || {}, e = inp.emp || {}, z = inp.zenzen || {}, b = inp.bikou || {};
    var ms = (inp.months || []).slice(0, 3);
    while (ms.length < 3) ms.push({});
    var born = gengoOf(e.birthYmd) || { code: '', ymd6: '' };
    var tek = ym2(inp.tekiyoYm);
    var kai = z.kaiteiYmd ? gengoOf(z.kaiteiYmd) : null;
    var kaiYm = kai ? { code: kai.code, year: pad(kai.year, 2), month: String(z.kaiteiYmd).slice(5, 7) } : { code: '', year: '', month: '' };
    var goukei = ms.map(function (m2) { return n(m2.tsuka) + n(m2.genbutsu); });
    var soukei = goukei.reduce(function (a2, b2) { return a2 + b2; }, 0);
    var atari = ms.filter(function (m2) { return n(m2.days) > 0; }).length;
    var heikin = atari ? Math.floor(soukei / atari) : 0;
    var r = [];
    r[0] = '2225700';                                   /* 1 様式コード（136p） */
    r[1] = String(j.todofuken || '');                   /* 2 都道府県コード */
    r[2] = String(j.gunshiku || '');                    /* 3 郡市区符号 */
    r[3] = String(j.kigou || '');                       /* 4 事業所記号 */
    r[4] = e.seiriNo ? String(e.seiriNo) : '';          /* 5 被保険者整理番号（0~6・省略可） */
    r[5] = String(e.kana || '');                        /* 6 氏名カナ */
    r[6] = String(e.kanji || '');                       /* 7 氏名漢字 */
    r[7] = born.code; r[8] = born.ymd6;                 /* 8-9 生年月日 */
    r[9] = tek.code; r[10] = tek.year; r[11] = tek.month; /* 10-12 適用年月 */
    r[12] = z.health ? pad(Math.round(n(z.health) / 1000), 4) : '';   /* 13 従前(健保)＝千円単位4桁 */
    r[13] = z.pension ? pad(Math.round(n(z.pension) / 1000), 4) : ''; /* 14 従前(厚年) */
    r[14] = kaiYm.code; r[15] = kaiYm.year; r[16] = kaiYm.month;      /* 15-17 従前改定年月 */
    r[17] = b.shokyuMonth ? pad(b.shokyuMonth, 2) : '';               /* 18 昇(降)給月 */
    r[18] = b.shokyuKubun ? String(b.shokyuKubun) : '';               /* 19 昇(降)給区分 1昇/2降 */
    r[19] = b.sokyuMonth ? pad(b.sokyuMonth, 2) : '';                 /* 20 遡及支払月 */
    r[20] = b.sokyuAmount ? money7(b.sokyuAmount) : '';               /* 21 遡及支払額 */
    r[21] = '04'; r[22] = '05'; r[23] = '06';                         /* 22-24 給与支給月（原文で 固定） */
    r[24] = pad(ms[0].days, 2); r[25] = pad(ms[1].days, 2); r[26] = pad(ms[2].days, 2); /* 25-27 基礎日数（0日は00） */
    r[27] = money7(ms[0].tsuka); r[28] = money7(ms[1].tsuka); r[29] = money7(ms[2].tsuka);       /* 28-30 通貨 */
    r[30] = money7(ms[0].genbutsu); r[31] = money7(ms[1].genbutsu); r[32] = money7(ms[2].genbutsu); /* 31-33 現物 */
    r[33] = money7(goukei[0]); r[34] = money7(goukei[1]); r[35] = money7(goukei[2]);             /* 34-36 合計 */
    r[36] = money7(soukei);                              /* 37 総計 */
    r[37] = money7(heikin);                              /* 38 平均額 */
    r[38] = inp.shuseiHeikin ? money7(inp.shuseiHeikin) : '';  /* 39 修正平均額（省略可） */
    r[39] = '';                                          /* 40 ★個人番号＝持たない★ */
    r[40] = String(b.kashoFugou || '');                  /* 41 課所符号 */
    r[41] = String(b.kisoNenkinNo || '');                /* 42 基礎年金番号 一連番号 */
    for (var i = 42; i <= 50; i++) r[i] = '';            /* 43-51 備考欄項目1〜8＋70歳算定基礎月 */
    if (b.over70) r[42] = '1';                           /* 43 備考欄項目1＝70歳以上被用者 */
    if (b.santeiTsuki70) r[43] = String(b.santeiTsuki70);/* 44 70歳算定基礎月 */
    if (b.nijo) r[44] = '1';                             /* 45 二以上事業所勤務 */
    if (b.getsugakuYotei) r[45] = '1';                   /* 46 月額変更の予定 */
    if (b.tochuNyusha) r[46] = '1';                      /* 47 途中入社で1か月分なし */
    if (b.kyushoku) r[47] = '1';                         /* 48 病休・育休・休職 */
    if (b.tanjikan) r[48] = '1';                         /* 49 特定適用事業所の 短時間労働者 */
    /* 50・51（備考欄項目7・8）＝★未測定＝空★ */
    r[51] = String(b.bikouText || '');                   /* 52 備考欄（漢字） */
    r[52] = b.over70Only ? '1' : '';                     /* 53 70歳以上被用者届のみ提出 */
    for (var k = 0; k < 53; k++) if (r[k] == null) r[k] = '';
    return r;
  }
  /* ★丸めた事・止める事を 言う★（★黙って お金を 丸めない★） */
  function santeiWarn(inp) {
    inp = inp || {};
    var out = [], ms = (inp.months || []);
    var namae = ((inp.emp || {}).kanji) || ((inp.emp || {}).kana) || '';
    ['4月', '5月', '6月'].forEach(function (lb, i) {
      var m2 = ms[i] || {};
      var g = n(m2.tsuka) + n(m2.genbutsu);
      if (g > MAN10) out.push(namae + ' ' + lb + '＝1千万円以上のため「9999999」で出します（' + g.toLocaleString() + '円）');
      if (n(m2.tsuka) > MAN10) out.push(namae + ' ' + lb + ' 通貨＝1千万円以上のため「9999999」で出します');
    });
    var bad = badChars(((inp.emp || {}).kanji || '') + ((inp.emp || {}).kana || ''));
    if (bad.length) out.push(namae + '＝この字は電子申請で使えません：' + bad.join('・'));
    return out;
  }

  /* ── ⑤ 1行目（媒体管理）・2行目（事業所管理）／ファイル全体 ───────────────
     ★原文の 例（64ページ）★:
       21,01,ｹｲﾄ,001,20170101,22223
       [kanri]
       ,001
       21,01,ｹｲﾄ,123,100,0000,東京都千代田区霞が関１－２－２,健保サービス株式会社,健保 良一,03,1234,5678
       [data]
       2200700,21,01,ｹｲﾄ,123,…
     ★[kanri] [data] は 区切りの 符号★（35p 表３．３－１「“[kanri]”と設定する」「“[data]”と設定する」）
     ★事業所数情報＝「,001」★（66p「１ 予備 － ０ 省略する／２ 事業所情報数 数字 1~3「001」を設定する」）
     ★媒体通番★（45p）…「001から999までの数字を…昇順に設定する／★999に達した場合は再度001から★」
       ⇒★上げるのは「落とした時」／1件も 作れない時は 上げない★（2026-09-03 指示役の決め）
     ★ファイル名★（30p）…「ＳＨＦＤ０００６．ＣＳＶ（★電子申請では、拡張子がＣＳＶでなければならない★）」 */
  /* ★都道府県コード★（★参考資料３・342ページの 原文を そのまま★）
     ★総務省の 都道府県番号とは まったく 違う★（東京 21／大阪 41／愛知 51 …）
     ⇒★思い込みで 埋めては いけない所★＝原文の 一覧を そのまま 写した。 */
  var KEN_CODE = {
    hokkaido:'01', aomori:'02', iwate:'03', miyagi:'04', akita:'05', yamagata:'06', fukushima:'07',
    ibaraki:'08', tochigi:'09', gunma:'10', saitama:'11', chiba:'12', tokyo:'21', kanagawa:'31',
    niigata:'32', toyama:'33', ishikawa:'34', fukui:'35', yamanashi:'36', nagano:'37', gifu:'38',
    shizuoka:'39', osaka:'41', hyogo:'42', aichi:'51', mie:'52', shiga:'53', kyoto:'54', nara:'55',
    wakayama:'56', tottori:'57', shimane:'58', okayama:'59', hiroshima:'60', yamaguchi:'61',
    tokushima:'71', kagawa:'72', ehime:'73', kochi:'74', fukuoka:'75', saga:'76', nagasaki:'77',
    kumamoto:'78', oita:'79', miyazaki:'80', kagoshima:'81', okinawa:'82'
  };
  /* ★事業所整理記号を 分ける★（原文 69p）
     「★事業所整理記号の 上２桁を 郡市区符号に、上２桁以外を 事業所記号に 分けて 設定する★」
     （例）「０１－ケイト」→ 郡市区符号「01」／事業所記号「ｹｲﾄ」
     ★全角で 入れられても 読む★（お客さんは 通知書のまま 打つ）。 */
  function splitSeiriKigou(text) {
    var s2 = String(text == null ? '' : text).trim();
    /* 全角英数・全角ハイフン・全角カナ を 半角へ */
    s2 = s2.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
           .replace(/[－ー―‐]/g, '-').replace(/\s+/g, '');
    var m = /^([0-9]{2})-?(.+)$/.exec(s2);
    if (!m) return null;
    var kigou = m[2];
    if (!/-/.test(String(text)) && !/[－ー―‐]/.test(String(text))) return null;   /* ★区切りが 無い物は 通さない★ */
    /* カナは 半角へ（仕様の 例が 半角カナ） */
    var Z2H = { 'ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ','カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ','サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ','タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ','ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ','ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ','マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ','ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ','ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ','ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ','ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ','ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ','ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ','バ':'ﾊﾞ','ビ':'ﾋﾞ','ブ':'ﾌﾞ','ベ':'ﾍﾞ','ボ':'ﾎﾞ','パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ' };
    kigou = kigou.split('').map(function (c) { return Z2H[c] || c; }).join('');
    return { gunshiku: m[1], kigou: kigou };
  }
  /* ★大きさの 上限★（2026-09-04 指示役の裁定＝甲）
     一次情報が ★1つの ページの 中で 割れている★（操作説明書 第三部 18ページ・原文）:
       「＜電子申請の届書ファイルサイズが ★4.5MB以上★の場合＞…★電子申請が行えない★」
       「…届書ファイルを ★4.5MB以下★のファイルサイズとなるように分割し」
     ⇒★ちょうど 4.5MB は「行えない」でも「分割後の 合格」でも ある★＝★誰にも 決められない（未測定）★
     ⇒★両方の 読みが 揃って 許すのは「未満」だけ★＝★4.5MB 以上で 止める★
     ★MB の 数え方も 原文に 無い★（1024×1024＝4,718,592 か 1,000,000×4.5＝4,500,000 か）
     ⇒★小さい方で 止める＝早く 止まる＝安全側★。
     ★実物は 1人 約300バイト＝1万人でも 約3MB★＝★今は 起きない★
       （★起きない物に 2段目（近づいたら 知らせる 画面）は 作らない★＝指示役の裁定 丙）。 */
  var MAX_BYTES = 4500000;
  function tooBig(n2) { return Number(n2) >= MAX_BYTES; }
  var FILE_NAME = 'SHFD0006.CSV';
  var SEP_KANRI = '[kanri]';
  var SEP_DATA = '[data]';
  function nextTsuban(now) { var v = n(now) + 1; return (v > 999 || v < 1) ? 1 : v; }
  function ymd8(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    return m ? (m[1] + m[2] + m[3]) : '';
  }
  /* 1行目＝媒体管理レコード（年金事務所提出・45p） */
  function baitaiRow(jimusho, opt) {
    var j = jimusho || {}; opt = opt || {};
    return [
      String(j.todofuken || ''),          /* 1 都道府県コード */
      String(j.gunshiku || ''),           /* 2 郡市区符号 */
      String(j.kigou || ''),              /* 3 事業所記号 */
      pad(opt.tsuban || 1, 3),            /* 4 媒体通番（001〜999） */
      ymd8(opt.ymd),                      /* 5 作成年月日 YYYYMMDD */
      String(opt.daihyo || '')            /* 6 代表届書コード */
    ];
  }
  /* 2行目のかたまり＝事業所管理レコード（事業所数情報＋事業所情報・66p/69p） */
  function jigyoshoRows(jimusho) {
    var j = jimusho || {};
    return [
      ['', '001'],                        /* 事業所数情報＝1 予備(省略)／2 事業所情報数 */
      [ String(j.todofuken || ''), String(j.gunshiku || ''), String(j.kigou || ''),
        String(j.jigyoshoNo || ''),       /* 4 事業所番号（納入告知書に 在る） */
        String(j.zipOya || ''), String(j.zipKo || ''),   /* 5-6 郵便番号 親/子 */
        String(j.address || ''),          /* 7 事業所所在地 */
        String(j.name || ''),             /* 8 事業所名称 */
        String(j.nushi || ''),            /* 9 事業主氏名 */
        String(j.tel1 || ''), String(j.tel2 || ''), String(j.tel3 || '') ]   /* 10-12 電話 */
    ];
  }
  /* ★ファイル全体★＝媒体管理／[kanri]／事業所管理／[data]／データレコード…
     ★1件も 作れない時は 0バイト★（ヘッダだけ 出さない＝全銀と 同じ） */
  function santeiCsv(inp) {
    inp = inp || {};
    var rows = (inp.rows || []).filter(function (r) { return r && r.length; });
    if (!rows.length) return { text: '', bytes: new Uint8Array(0), rows: 0, name: FILE_NAME };
    var out = [];
    out.push(baitaiRow(inp.jimusho, inp.baitai || {}));
    out.push([SEP_KANRI]);
    jigyoshoRows(inp.jimusho).forEach(function (r) { out.push(r); });
    out.push([SEP_DATA]);
    rows.forEach(function (r) { out.push(r); });
    var f = build(out);
    f.name = FILE_NAME;
    /* ★4.5MB 以上は 出さない★（電子申請が 行えない＝出しても 無駄に なる） */
    f.tooBig = tooBig(f.bytes.length);
    return f;
  }

  return {
    GENGO: GENGO, gengoOf: gengoOf, santeiRow: santeiRow, santeiWarn: santeiWarn, MAN10: MAN10,
    baitaiRow: baitaiRow, jigyoshoRows: jigyoshoRows, santeiCsv: santeiCsv,
    nextTsuban: nextTsuban, FILE_NAME: FILE_NAME, SEP_KANRI: SEP_KANRI, SEP_DATA: SEP_DATA,
    KEN_CODE: KEN_CODE, splitSeiriKigou: splitSeiriKigou,
    MAX_BYTES: MAX_BYTES, tooBig: tooBig,
    _resetSjisMap: _resetSjisMap,
    sjisMap: sjisMap, inJis: inJis, badChars: badChars, toSjis: toSjis,
    joinLine: joinLine, build: build, CRLF: CRLF,
    YOSHIKI_SANTEI: '2225700'   /* 一次情報 136p「2225700を設定する」 */
  };
});
