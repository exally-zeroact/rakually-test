/* zip-surgeon.js — ★zip(=xlsx/xlsm/xlsb)の「触った部品だけ」を入れ替える★
 *
 * なぜ必要か（2026-08-08〜09 実測）:
 *   受け取ったブックを SheetJS で読んで書き直すと、★罫線84・判子1・結合7・列幅が全部消える★。
 *   直し方は1つしかない：★元のzipを作り直さず、触った部品だけ差し替える★。
 *   実測でも「13部品中11部品がバイト一致・消えた0・増えた0」になった。
 *
 * ★他所の部品は "圧縮されたままのバイト列" をそのまま写す★
 *   展開して詰め直すと、圧縮の仕方の違いで中身が同じでもバイトが変わる。
 *   写すだけなら ★1バイトも変わらない★（マクロ vbaProject.bin もこれで無傷）。
 *
 * ★書き換えた部品は「まず圧縮してみる。駄目なら無圧縮」★
 *   無圧縮を既定にすると客のファイルが太る（実測: 0.36MB のブックが
 *   1シート直して 1.03MB＝2.8倍 / 14シートで 1.98MB＝5.5倍。★触るほど太り続ける★）。
 *   メールに添付できなくなる・50MBの蓋に当たる、という★客が気づく問題★になる。
 *   かといって圧縮を必須にすると、圧縮の口が無い端末で★保存できない客★が出る。
 *   ⇒ ★1回 実際に圧縮してみて、駄目だった時だけ無圧縮に落とす★（「たぶん使える」で分岐しない）
 *   　 どちらの道を通ったかは build() の戻りに残す（後で追えるように）。
 *
 * 使い方:
 *   const zip = await ZipSurgeon.read(bytes);      // 元のバイト列は zip.raw に残る
 *   const xml = await zip.text('xl/workbook.xml'); // 展開して文字にする
 *   zip.replaceText('xl/workbook.xml', newXml);    // 差し替えを予約
 *   zip.remove('xl/worksheets/binaryIndex1.bin');  // 部品を消す
 *   const out = zip.build();                       // 触っていない部品は そのまま写る
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZipSurgeon = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIG_LOCAL = 0x04034b50, SIG_CEN = 0x02014b50, SIG_EOCD = 0x06054b50;
  var SIG_EOCD64 = 0x06064b50;

  function u16(b, p) { return b[p] | (b[p + 1] << 8); }
  function u32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
  function put16(b, p, v) { b[p] = v & 255; b[p + 1] = (v >>> 8) & 255; }
  function put32(b, p, v) { b[p] = v & 255; b[p + 1] = (v >>> 8) & 255; b[p + 2] = (v >>> 16) & 255; b[p + 3] = (v >>> 24) & 255; }

  /* 名前は UTF-8。日本語のシート名がファイル名に出る事は無いが、安全側で統一する */
  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function toBytes(s) {
    if (enc) return enc.encode(s);
    var b = Buffer.from(s, 'utf8'); return new Uint8Array(b.buffer, b.byteOffset, b.length);
  }
  function toText(b) {
    if (dec) return dec.decode(b);
    return Buffer.from(b).toString('utf8');
  }

  /* ★展開★ 生deflate。ブラウザもNode(18+)も DecompressionStream を持つ */
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('この端末では圧縮された中身を開けません（DecompressionStream が無い）'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  /* CRC32（書き換えた部品ぶんだけ計算する） */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function findEOCD(b) {
    for (var p = b.length - 22; p >= 0 && p >= b.length - 22 - 65535; p--) {
      if (u32(b, p) === SIG_EOCD) return p;
    }
    return -1;
  }

  function parse(bytes) {
    var eocd = findEOCD(bytes);
    if (eocd < 0) throw new Error('zip として読めません（終端の印が見つからない）');
    var count = u16(bytes, eocd + 10);
    var cenSize = u32(bytes, eocd + 12);
    var cenOff = u32(bytes, eocd + 16);
    // ★zip64 は今は扱わない。黙って壊さず、はっきり断る★
    if (cenOff === 0xFFFFFFFF || cenSize === 0xFFFFFFFF || count === 0xFFFF) {
      throw new Error('とても大きい zip(zip64) は まだ直せません');
    }
    for (var q = eocd - 20; q >= 0 && q > eocd - 200; q--) {
      if (u32(bytes, q) === SIG_EOCD64) throw new Error('とても大きい zip(zip64) は まだ直せません');
    }

    var entries = [], p = cenOff;
    for (var i = 0; i < count; i++) {
      if (u32(bytes, p) !== SIG_CEN) throw new Error('部品の一覧が壊れています（' + i + '番目）');
      var flag = u16(bytes, p + 8);
      var method = u16(bytes, p + 10);
      var time = u16(bytes, p + 12), date = u16(bytes, p + 14);
      var crc = u32(bytes, p + 16);
      var csize = u32(bytes, p + 20), usize = u32(bytes, p + 24);
      var nlen = u16(bytes, p + 28), elen = u16(bytes, p + 30), clen = u16(bytes, p + 32);
      var lho = u32(bytes, p + 42);
      var name = toText(bytes.subarray(p + 46, p + 46 + nlen));
      // 実データの開始位置は「ローカルヘッダ」から求める（中央の情報だけでは足りない）
      if (u32(bytes, lho) !== SIG_LOCAL) throw new Error('部品の頭が壊れています: ' + name);
      var lnlen = u16(bytes, lho + 26), lelen = u16(bytes, lho + 28);
      var dataStart = lho + 30 + lnlen + lelen;
      entries.push({
        name: name, method: method, flag: flag, time: time, date: date,
        crc: crc, csize: csize, usize: usize,
        raw: bytes.subarray(dataStart, dataStart + csize),   // ★圧縮されたままの中身★
        replaced: null, removed: false,
      });
      p += 46 + nlen + elen + clen;
    }
    return entries;
  }

  function Zip(bytes) {
    this.raw = bytes;                 // ★元のバイト列。作業用コピーはこれを保存する★
    this.entries = parse(bytes);
    this.index = {};
    for (var i = 0; i < this.entries.length; i++) this.index[this.entries[i].name] = this.entries[i];
  }

  Zip.prototype.has = function (name) { return !!this.index[name] && !this.index[name].removed; };
  Zip.prototype.names = function () {
    var out = [];
    for (var i = 0; i < this.entries.length; i++) if (!this.entries[i].removed) out.push(this.entries[i].name);
    return out;
  };

  /** 部品の中身を Uint8Array で取り出す（必要な物だけ展開する） */
  Zip.prototype.bytes = function (name) {
    var e = this.index[name];
    if (!e || e.removed) return Promise.reject(new Error('部品がありません: ' + name));
    if (e.replaced) return Promise.resolve(e.replaced);
    if (e.method === 0) return Promise.resolve(e.raw.slice());
    if (e.method !== 8) return Promise.reject(new Error('知らない詰め方の部品です: ' + name));
    return inflateRaw(e.raw);
  };
  Zip.prototype.text = function (name) {
    return this.bytes(name).then(toText);
  };

  /** 差し替えを予約する（build まで元のバイト列は残る） */
  Zip.prototype.replace = function (name, u8) {
    var e = this.index[name];
    if (!e) throw new Error('部品がありません: ' + name);
    e.replaced = u8; e.removed = false;
    return this;
  };
  Zip.prototype.replaceText = function (name, s) { return this.replace(name, toBytes(s)); };
  Zip.prototype.remove = function (name) {
    var e = this.index[name];
    if (e) { e.removed = true; e.replaced = null; }
    return this;
  };

  /* ★詰める★ 生deflate。使えない端末では null を返す（＝無圧縮に落とす合図） */
  function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    try {
      var cs = new CompressionStream('deflate-raw');
      var w = cs.writable.getWriter();
      w.write(bytes); w.close();
      return new Response(cs.readable).arrayBuffer()
        .then(function (ab) { return new Uint8Array(ab); })
        .catch(function () { return null; });          // ★駄目なら無圧縮へ★
    } catch (_) { return Promise.resolve(null); }
  }

  /** 書き換えた部品を先に詰める（1回 実際に試す。駄目なら無圧縮） */
  Zip.prototype._pack = function () {
    var list = this.entries.filter(function (e) { return !e.removed && e.replaced; });
    var log = { compressed: 0, stored: 0, why: '' };
    var chain = Promise.resolve();
    list.forEach(function (e) {
      chain = chain.then(function () {
        return deflateRaw(e.replaced).then(function (z) {
          // ★詰めた方が大きくなる事もある。その時は無圧縮の方を採る★
          if (z && z.length < e.replaced.length) { e.packed = z; e.packedMethod = 8; log.compressed++; }
          else { e.packed = e.replaced; e.packedMethod = 0; log.stored++; if (!z) log.why = '圧縮の口が無い端末'; }
        });
      });
    });
    return chain.then(function () { return log; });
  };

  /** 組み立てる。★触っていない部品は圧縮されたまま写す＝1バイトも変わらない★
   *  戻り: Promise<{ bytes, log }>  log = どちらの道で詰めたか */
  Zip.prototype.build = function () {
    var self = this;
    return this._pack().then(function (log) { return { bytes: self._assemble(), log: log }; });
  };

  Zip.prototype._assemble = function () {
    var list = this.entries.filter(function (e) { return !e.removed; });
    var parts = [], cen = [], offset = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var nameB = toBytes(e.name);
      var data, method, crc, csize, usize;
      if (e.replaced) {
        data = e.packed || e.replaced; method = e.packedMethod || 0;
        crc = crc32(e.replaced);                       // ★CRCは「中身」に対して計算する★
        csize = data.length; usize = e.replaced.length;
      } else {
        data = e.raw; method = e.method;
        crc = e.crc; csize = e.csize; usize = e.usize;
      }
      var lh = new Uint8Array(30 + nameB.length);
      put32(lh, 0, SIG_LOCAL); put16(lh, 4, 20); put16(lh, 6, 0); put16(lh, 8, method);
      put16(lh, 10, e.time); put16(lh, 12, e.date);
      put32(lh, 14, crc); put32(lh, 18, csize); put32(lh, 22, usize);
      put16(lh, 26, nameB.length); put16(lh, 28, 0);
      lh.set(nameB, 30);
      parts.push(lh, data);

      var ch = new Uint8Array(46 + nameB.length);
      put32(ch, 0, SIG_CEN); put16(ch, 4, 20); put16(ch, 6, 20); put16(ch, 8, 0); put16(ch, 10, method);
      put16(ch, 12, e.time); put16(ch, 14, e.date);
      put32(ch, 16, crc); put32(ch, 20, csize); put32(ch, 24, usize);
      put16(ch, 28, nameB.length); put16(ch, 30, 0); put16(ch, 32, 0);
      put16(ch, 34, 0); put16(ch, 36, 0); put32(ch, 38, 0); put32(ch, 42, offset);
      ch.set(nameB, 46);
      cen.push(ch);
      offset += lh.length + data.length;
    }
    var cenStart = offset, cenLen = 0, j;
    for (j = 0; j < cen.length; j++) cenLen += cen[j].length;
    var eocd = new Uint8Array(22);
    put32(eocd, 0, SIG_EOCD); put16(eocd, 4, 0); put16(eocd, 6, 0);
    put16(eocd, 8, cen.length); put16(eocd, 10, cen.length);
    put32(eocd, 12, cenLen); put32(eocd, 16, cenStart); put16(eocd, 20, 0);

    var total = cenStart + cenLen + 22, out = new Uint8Array(total), at = 0;
    for (j = 0; j < parts.length; j++) { out.set(parts[j], at); at += parts[j].length; }
    for (j = 0; j < cen.length; j++) { out.set(cen[j], at); at += cen[j].length; }
    out.set(eocd, at);
    return out;
  };

  return {
    read: function (bytes) { return new Zip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); },
    crc32: crc32, inflateRaw: inflateRaw, toText: toText, toBytes: toBytes,
  };
});
