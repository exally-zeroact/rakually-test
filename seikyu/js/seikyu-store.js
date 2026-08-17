/* seikyu-store.js — 請求書の倉庫（kyuyo.pay_invoices / kyuyo.pay_receipts）
 * ==============================================================================
 * 契約の一次情報 = docs/SPEC_seikyu_data.md ／ 棚 = supabase/schema-seikyu.sql
 *
 * ★取引先と自社は新しく作らない★
 *   既にある pay_partners / pay_org を js/suite-data.js（E0 共有データ層）越しに使う。
 *   ここで別の取引先マスタを持つと二重管理になる。
 *
 * ★最後の砦は倉庫★
 *   番号の重複は uq_pay_invoices_no が止める。画面のチェックだけを信じない。
 *   弾かれたら seikyu-doc.bumpNo() で1つ進めて出し直す（同時発行の再試行）。
 *
 * ★失敗を握り潰さない★
 *   書けなかったら {ok:false, reason} を返す。嘘の成功を返さない。
 *
 * 【利用】window.SeikyuStore.create({ client, suite })
 */
(function (global) {
  'use strict';

  var MAX_BUMP = 20;   // 同時発行のぶつかりで番号を進める上限（これを超えたら人に返す）

  function err(e) { return (e && (e.message || e.reason)) || 'error'; }
  /* 一意制約に弾かれたか（番号の重複）。PostgREST は 23505 を返す */
  function isDup(e) {
    var s = String((e && (e.code || e.message)) || '');
    return /23505/.test(s) || /duplicate key|uq_pay_invoices_no/i.test(String((e && e.message) || ''));
  }

  function create(opts) {
    opts = opts || {};
    var sb = opts.client;
    var suite = opts.suite || null;
    if (!sb) throw new Error('SeikyuStore.create: client(supabaseクライアント) が必要です');
    var DOC = global.SeikyuDoc;
    if (!DOC) throw new Error('seikyu-doc.js を先に読んでください');

    var seq = 0;
    var newId = opts.newId || function (p) {
      seq++;
      return p + '_' + Math.abs(Date.now()).toString(36) + '_' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
    };
    var nowIso = opts.now || function () { return new Date().toISOString(); };

    function uid() {
      return Promise.resolve(sb.auth.getUser())
        .then(function (r) { return (r && r.data && r.data.user && r.data.user.id) || null; })
        .catch(function () { return null; });
    }

    /* 全件ページング（PostgREST 既定 max_rows=1000 で"黙って"切れるのを根治）。
       ★請求の一覧が静かに過少になると、去年の請求が消えたように見える★ */
    function fetchAllQ(build) {
      var out = [], from = 0, size = 1000;
      function step() {
        return Promise.resolve(build(from, from + size - 1)).then(function (r) {
          if (r && r.error) return { data: null, error: r.error };
          var got = (r && r.data) || [];
          out = out.concat(got);
          if (!got.length || r.count == null || out.length >= r.count) {
            return { data: out, error: null, count: (r && r.count != null) ? r.count : out.length };
          }
          from += got.length;
          return step();
        });
      }
      return step();
    }

    var COLS = 'id,doc_type,no,partner_id,issue_ymd,due_ymd,status,tax_mode,rounding,'
      + 'lines,totals,snapshot,data,template_id,quote_from,issued_at,sent_at,voided_at,updated_at';

    var api = {
      /* ═══ 請求書 ═══ */
      invoices: {
        // 一覧（消していない物だけ・新しい順）。docType 省略で請求書
        list: function (docType) {
          var dt = docType || 'invoice';
          return fetchAllQ(function (a, b) {
            return sb.from('pay_invoices').select(COLS, { count: 'exact' })
              .eq('doc_type', dt).is('deleted_at', null)
              /* ★並びをはっきり決める＝新しい順（請求日）→ 同じ日は番号の大きい順 → 最後はidで固定★
                 （最後まで決めないと、同じ日・同じ番号の時に開くたび順が変わる） */
              .order('issue_ymd', { ascending: false })
              .order('no', { ascending: false })
              .order('id', { ascending: false })
              .range(a, b);
          }).then(function (r) {
            if (r && r.error) throw new Error(err(r.error));
            return r.data || [];
          });
        },
        get: function (id) {
          return Promise.resolve(sb.from('pay_invoices').select(COLS).eq('id', id).maybeSingle())
            .then(function (r) {
              if (r && r.error) throw new Error(err(r.error));
              return (r && r.data) || null;
            });
        },
        /* 使用済みの番号を全部（自動採番がぶつからないように）。
           ★取り消した番号も含める＝倉庫の一意制約に where が無いのと同じ扱い★ */
        usedNos: function (docType) {
          var dt = docType || 'invoice';
          return fetchAllQ(function (a, b) {
            return sb.from('pay_invoices').select('no', { count: 'exact' }).eq('doc_type', dt).range(a, b);
          }).then(function (r) {
            if (r && r.error) throw new Error(err(r.error));
            return (r.data || []).map(function (x) { return x.no; });
          });
        },
        /* 下書きの保存（新規も更新も）。★発行済みには使わない（倉庫のトリガが弾く）★ */
        saveDraft: function (inv) {
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'ログインしていません' };
            var id = inv.id || newId('iv');
            var row = {
              id: id, account_id: u,
              doc_type: inv.doc_type || 'invoice',
              no: inv.no || '',
              partner_id: inv.partner_id || '',
              issue_ymd: inv.issue_ymd || null,
              due_ymd: inv.due_ymd || null,
              status: 'draft',
              tax_mode: inv.tax_mode, rounding: inv.rounding,
              lines: inv.lines || [], totals: inv.totals || {}, snapshot: inv.snapshot || {},
              data: inv.data || {}, template_id: inv.template_id || '',
              quote_from: inv.quote_from || '',
              deleted_at: null, updated_at: nowIso(),
            };
            return Promise.resolve(sb.from('pay_invoices').upsert(row))
              .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error), dup: isDup(w.error) } : { ok: true, id: id }; })
              .catch(function (e) { return { ok: false, reason: err(e), dup: isDup(e) }; });
          });
        },
        /* ★発行★ 番号・合計・写しを決めて固める。
           倉庫が番号の重複で弾いたら bumpNo で1つ進めて出し直す（最後の砦は倉庫）。 */
        issue: function (inv, at) {
          var stamp = at || nowIso();
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'ログインしていません' };
            var id = inv.id || newId('iv');
            var no = inv.no || '';
            if (!no) return { ok: false, reason: '請求番号が空です' };
            var base = {
              id: id, account_id: u,
              doc_type: inv.doc_type || 'invoice',
              partner_id: inv.partner_id || '',
              issue_ymd: inv.issue_ymd || null,
              due_ymd: inv.due_ymd || null,
              status: 'issued',
              tax_mode: inv.tax_mode, rounding: inv.rounding,
              lines: inv.lines || [], totals: inv.totals || {}, snapshot: inv.snapshot || {},
              data: inv.data || {}, template_id: inv.template_id || '',
              quote_from: inv.quote_from || '',
              issued_at: stamp, deleted_at: null, updated_at: stamp,
            };
            var tries = 0;
            function attempt(n) {
              base.no = n;
              return Promise.resolve(sb.from('pay_invoices').upsert(base))
                .then(function (w) {
                  if (!(w && w.error)) return { ok: true, id: id, no: n, bumped: tries };
                  if (isDup(w.error) && tries < MAX_BUMP) {
                    var next = DOC.bumpNo(n);
                    // ★数で終わらない番号は自動で進めない（人が決めた番号を勝手にいじらない）
                    if (!next) return { ok: false, reason: 'この番号は既に使われています（' + n + '）。別の番号にしてください', dup: true };
                    tries++;
                    return attempt(next);
                  }
                  return { ok: false, reason: err(w.error), dup: isDup(w.error) };
                })
                .catch(function (e) { return { ok: false, reason: err(e), dup: isDup(e) }; });
            }
            return attempt(no);
          });
        },
        /* 取り消し（★消さない・番号を欠番にしない★） */
        voidIt: function (id, at) {
          var stamp = at || nowIso();
          return Promise.resolve(sb.from('pay_invoices').update({ status: 'void', voided_at: stamp, updated_at: stamp }).eq('id', id))
            .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; })
            .catch(function (e) { return { ok: false, reason: err(e) }; });
        },
        /* 下書きだけ消せる（発行済みは倉庫が2枚で止める） */
        removeDraft: function (id) {
          return Promise.resolve(sb.from('pay_invoices').delete().eq('id', id).eq('status', 'draft'))
            .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; })
            .catch(function (e) { return { ok: false, reason: err(e) }; });
        },
        /* 「送った」記録（発行後も入れられる＝固まる列に入っていない） */
        markSent: function (id, at) {
          var stamp = at || nowIso();
          return Promise.resolve(sb.from('pay_invoices').update({ sent_at: stamp, updated_at: stamp }).eq('id', id))
            .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; })
            .catch(function (e) { return { ok: false, reason: err(e) }; });
        },
      },

      /* ═══ 入金 ═══
         ★読めなかった時は null を返す＝「0件」と作り分ける（未確認と未入金は違う）★
         ★1回＝1行で足す。上書きしない★
           代行請求は「会社×月」で1行だけ持って上書きしていた＝分割払いの履歴が消えていた。
           ここは insert だけ（upsert を使わない＝同じ日に2回 入っても2行 残る）。 */
      receipts: {
        /* ★消した入金も含めて取る★
           理由＝★領収番号の枝番（202610-001-1）は、消した入金にも席を残す★から。
             消した行を取らないと枝番が繰り上がり、★同じ番号の領収書が2枚 外に出る★。
           ★ただし 合計・残り・過入金には混ぜない★（数が黙って狂う＝うちで一番 高くついた型）。
             数える側（seikyu-doc.paymentStateOf / seikyu-carry.compute）は
             deleted_at の行を必ず飛ばす作りになっていて、その検査も在る。
           ★読めなかった時は null（0件と混ぜない）★ は変えない。 */
        list: function () {
          return fetchAllQ(function (a, b) {
            return sb.from('pay_receipts').select('id,invoice_id,invoice_no,ymd,amount,method,memo,created_at,deleted_at', { count: 'exact' })
              .order('ymd', { ascending: true }).order('id', { ascending: true }).range(a, b);
          }).then(function (r) {
            if (r && r.error) return null;      // ★取れなかった＝null（0件と混ぜない）
            return r.data || [];
          }).catch(function () { return null; });
        },
        /* 入金を1件 足す。★決まり（日付・0円・桁）は seikyu-doc.validateReceipt が唯一の正★
           ここは配線だけ＝倉庫が弾いた時は理由をそのまま返す（嘘の成功を返さない）。 */
        add: function (rc) {
          var o = rc || {};
          var chk = DOC.validateReceipt(o);
          if (!chk.ok) return Promise.resolve({ ok: false, reason: chk.errors[0] });
          var amount = DOC.receiptAmountOf(o.amount);
          return uid().then(function (u) {
            if (!u) return { ok: false, reason: 'ログインしていません' };
            var id = o.id || newId('rc');
            var row = {
              id: id, account_id: u,
              // ★どの請求か分からない入金も捨てない（棚は invoice_id に null を許す）
              invoice_id: o.invoice_id || null,
              invoice_no: o.invoice_no || '',
              ymd: o.ymd, amount: amount,
              method: o.method || '', memo: o.memo || '',
              deleted_at: null, updated_at: nowIso(),
            };
            return Promise.resolve(sb.from('pay_receipts').insert(row))
              .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true, id: id, amount: amount }; })
              .catch(function (e) { return { ok: false, reason: err(e) }; });
          });
        },
        /* 打ち間違いの取り消し。★行は消さない（deleted_at を入れるだけ）★
           物理削除すると「いつ何を消したか」が残らない＝入金の履歴が信用できなくなる。 */
        remove: function (id, at) {
          var stamp = at || nowIso();
          return Promise.resolve(sb.from('pay_receipts').update({ deleted_at: stamp, updated_at: stamp }).eq('id', id))
            .then(function (w) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; })
            .catch(function (e) { return { ok: false, reason: err(e) }; });
        },
      },

      /* ═══ 共有マスタ（E0 に委譲・ここでは持たない） ═══ */
      org: {
        get: function () { return suite ? suite.org.get() : Promise.resolve(null); },
        save: function (patch) { return suite ? suite.org.save(patch) : Promise.resolve({ ok: false, reason: '共有データ層がありません' }); },
      },
      partners: {
        list: function () { return suite ? suite.partners.list() : Promise.resolve([]); },
        /* ★請求書の中で 取引先を作れる★（司さん 2026-08-17）
           ＝★Rakually は別アプリ★。取引先は ★請求書の持ち物★なのに、
             「他のアプリの画面で追加してください」と ★外へ出して★ いた。
             初めて使う人は ★1通も出さないうちに 必ず外へ出される★＝一番の壁だった。
           ★同じ名前の相手を2つ作らない★＝すでに在れば その相手を返す（作らない）。 */
        create: function (p) {
          if (!suite) return Promise.resolve({ ok: false, reason: '共有データ層がありません' });
          var name = String((p && p.name) || '').trim();
          if (!name) return Promise.resolve({ ok: false, reason: '会社名を入れてください' });
          return suite.partners.list().then(function (list) {
            var same = list.filter(function (x) { return String(((x.data || {}).name || '')).trim() === name; })[0];
            if (same) return { ok: true, id: same.id, already: true };
            var data = {};
            ['name', 'honor', 'keisho', 'addr', 'zip', 'tel', 'person', 'invoiceNo', 'code'].forEach(function (k) {
              var v = (p || {})[k];
              if (v !== undefined && String(v).trim() !== '') data[k] = String(v).trim();
            });
            /* ★敬称は空にしない★（紙の宛名が「会社名 」で終わる） */
            if (!data.honor) { data.honor = '御中'; data.keisho = '御中'; }
            var sort = list.reduce(function (a, x) { return Math.max(a, Number(x.sort) || 0); }, -1) + 1;
            return Promise.resolve(suite.partners.upsert({ sort: sort, data: data })).then(function (r) {
              if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || '保存できませんでした' };
              return { ok: true, id: r.id || (r.data && r.data.id) || null, already: false };
            });
          });
        },
        /* ★丸ごと置換しない★ 既存の data（他の画面が入れた名称・住所など）を残して足す */
        patch: function (id, add) {
          if (!suite) return Promise.resolve({ ok: false, reason: '共有データ層がありません' });
          return suite.partners.list().then(function (list) {
            var cur = list.filter(function (x) { return x.id === id; })[0];
            if (!cur) return { ok: false, reason: 'この取引先が見つかりません' };
            var data = Object.assign({}, cur.data || {}, add || {});
            return suite.partners.upsert({ id: id, sort: cur.sort, data: data });
          });
        },
      },
    };
    return api;
  }

  global.SeikyuStore = { create: create, MAX_BUMP: MAX_BUMP };
})(typeof window !== 'undefined' ? window : globalThis);
