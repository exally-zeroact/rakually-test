/* rireki-sql-guard.mjs — ★直しの 記録（kyuyo.pay_rireki）の sql だけを 通す 門番★（純関数・倉庫にも ネットにも 触らない）
 *
 * なぜ：倉庫には 給与・請求書・ダイコメ・飲み屋・アマかせの 実の データが 同居している。
 *       流す 道具に「何でも 流せる 口」を 作らない。★1つでも 落ちたら 1字も 流さない★。
 *
 * 通す 物：
 *   ・作る/替える＝kyuyo.pay_rireki（表・索引・RLS・policy）・kyuyo.pay_rireki_kaku()（関数）・public.pay_rireki（窓）
 *   ・引き金＝下の 6本の 名前と 表の 組だけ（drop trigger if exists と create trigger）
 *   ・権限＝revoke all／grant select（pay_rireki と その関数に 限る）
 *   ・関数の 中の insert は kyuyo.pay_rireki への 1文だけ
 * 止める 物：
 *   ・drop table/schema/view/function/column/index/constraint・truncate・delete from・update…set・alter … drop
 *   ・許した 物 以外の 名前（kyuyo.x・public.x）が 1つでも 出る
 *   ・6本 以外の 表への 引き金・security_invoker の 無い 窓
 */

export const HIKIGANE = [
  ['rireki_pay_companies', 'pay_companies'],
  ['rireki_pay_employees', 'pay_employees'],
  ['rireki_pay_payslips', 'pay_payslips'],
  ['rireki_pay_ledger', 'pay_ledger'],
  ['rireki_pay_nencho_decl', 'pay_nencho_decl'],
  ['rireki_pay_emp_profile', 'pay_emp_profile'],
];
const OK_NAMES = new Set(['kyuyo.pay_rireki', 'kyuyo.pay_rireki_kaku', 'public.pay_rireki', 'pay_rireki_account_at', 'pay_rireki_account_emp_ym',
  ...HIKIGANE.map(([, t]) => 'kyuyo.' + t)]);

export function stripComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const DANGER = [
  [/\bdrop\s+(table|schema|database|view|function|column|index|constraint|role|extension)\b/i, '消す 系（drop）'],
  [/\btruncate\b/i, 'truncate'],
  [/\bdelete\s+from\b/i, 'delete from'],
  [/\bupdate\s+[\w."]+\s+set\b/i, 'update … set'],
  [/\balter\s+table\b(?![^;]*\benable\s+row\s+level\s+security\b)/i, 'alter table（RLS を 入れる 以外）'],
  [/\bgrant\s+(?!select\b)/i, 'select 以外の grant'],
  [/\bsecurity\s+definer\b(?![^$]*set\s+search_path\s*=\s*'')/i, "search_path='' の 無い security definer"],
  [/\bcopy\b|\bexecute\s+format\b|\bdo\s+\$/i, 'copy・動く 文の 組み立て・do'],
];

/** sql を 調べる。{ ok, why[] } を 返す（why が 空なら ok） */
export function inspect(sql) {
  const s = stripComments(sql);
  const why = [];
  for (const [re, name] of DANGER) if (re.test(s)) why.push('止め：' + name);

  // 出てくる 部屋.名前 は 全部 許した 物か（auth.uid / auth.role と jsonb の 関数は 別）
  for (const m of s.matchAll(/\b(kyuyo|public|auth|storage|daikou|extensions|pg_catalog)\.([a-z_][a-z0-9_]*)/gi)) {
    const full = (m[1] + '.' + m[2]).toLowerCase();
    if (full === 'auth.uid' || full === 'auth.role') continue;
    if (!OK_NAMES.has(full)) why.push('止め：許していない 名前 ' + full);
  }

  // 引き金は 6本の 組だけ
  for (const m of s.matchAll(/\b(?:create|drop)\s+trigger\s+(?:if\s+exists\s+)?([a-z_0-9]+)\s+(?:after\s+[\s\S]*?\s+)?on\s+kyuyo\.([a-z_0-9]+)/gi)) {
    const ok = HIKIGANE.some(([g, t]) => g === m[1].toLowerCase() && t === m[2].toLowerCase());
    if (!ok) why.push('止め：知らない 引き金 ' + m[1] + ' on ' + m[2]);
  }
  const creates = [...s.matchAll(/\bcreate\s+trigger\s+([a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase());
  for (const [g] of HIKIGANE) if (!creates.includes(g)) why.push('止め：引き金 ' + g + ' が 無い');

  // ★6本の 給与の 表の 名前は 引き金の 文の 中だけ★（grant・policy・索引・窓を 給与の 表に 向けさせない）
  const soto = s.replace(/\b(?:create|drop)\s+trigger\b[^;]*;/gi, ' ');
  for (const [, t] of HIKIGANE) {
    if (new RegExp('\\bkyuyo\\.' + t + '\\b', 'i').test(soto)) why.push('止め：引き金 以外で 給与の 表 kyuyo.' + t + ' に 触る');
  }
  // grant / revoke / policy / index は pay_rireki（と その関数）だけ
  for (const m of soto.matchAll(/\b(grant|revoke)\b[^;]*?\bon\s+(?:table\s+|function\s+)?([\w.]+)/gi)) {
    if (!['kyuyo.pay_rireki', 'public.pay_rireki', 'kyuyo.pay_rireki_kaku'].includes(m[2].toLowerCase().replace(/\(\)$/, ''))) why.push('止め：' + m[1] + ' の 先が ' + m[2]);
  }
  for (const m of soto.matchAll(/\b(?:create|drop)\s+(?:policy|index)\b[^;]*?\bon\s+([\w.]+)/gi)) {
    if (m[1].toLowerCase() !== 'kyuyo.pay_rireki') why.push('止め：policy/index の 先が ' + m[1]);
  }

  // 関数の 中の insert は pay_rireki への 物だけ
  for (const m of s.matchAll(/\binsert\s+into\s+([\w.]+)/gi)) {
    if (m[1].toLowerCase() !== 'kyuyo.pay_rireki') why.push('止め：pay_rireki 以外への insert ' + m[1]);
  }

  // 窓は security_invoker = true
  for (const m of s.matchAll(/\bcreate\s+(?:or\s+replace\s+)?view\s+([\w.]+)([^;]*?)\bas\b/gi)) {
    if (!/security_invoker\s*=\s*true/i.test(m[2])) why.push('止め：security_invoker の 無い 窓 ' + m[1]);
  }
  return { ok: why.length === 0, why };
}
