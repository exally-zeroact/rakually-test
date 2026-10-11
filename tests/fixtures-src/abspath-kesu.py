# 見本の xlsx / xlsb の「保存した場所の道（absPath）」を空にする（公開 repo に 手元の 利用者名・フォルダ名を 入れない）。
# Excel は保存の時に 保存した場所を xl/workbook.xml（xlsx）・xl/workbook.bin の 記録 0x817 BrtAbsPath15（xlsb）に 書く。
# 見本を Excel で 作り直したら 必ず これを 通す（nomiya-app-test の tests/fixtures-src/set-sample-author.ps1 と 同じ 役・作者名は 別）。
# 部品の並び・圧縮の形・日付・属性は保つ。使い方: python -I tests/fixtures-src/abspath-kesu.py tests/fixtures/book-open-sample.xlsb
import io, re, sys, zipfile

def rd_varint(b, i, maxlen):
    v = 0
    for k in range(maxlen):
        c = b[i]; i += 1
        v |= (c & 0x7F) << (7 * k)
        if not c & 0x80:
            break
    return v, i

def wr_varint(v, maxlen):
    out = bytearray()
    for _ in range(maxlen):
        c = v & 0x7F; v >>= 7
        if v:
            out.append(c | 0x80)
        else:
            out.append(c); break
    if v:
        raise ValueError("長すぎる")
    return bytes(out)

def fix_bin(b):
    i, out, n = 0, bytearray(), 0
    while i < len(b):
        s = i
        t, i = rd_varint(b, i, 2)
        size, i = rd_varint(b, i, 4)
        body = b[i:i + size]; i += size
        if t == 0x817:
            # 中身＝XLWideString（4バイトの字数＋UTF-16LE）。空に。
            cch = int.from_bytes(body[:4], "little") if len(body) >= 4 else 0
            rest = body[4 + 2 * cch:]
            nb = (0).to_bytes(4, "little") + rest
            out += wr_varint(t, 2) + wr_varint(len(nb), 4) + nb
            n += 1
            print("記録 0x817：字数", cch, "→ 0（後ろの", len(rest), "バイトは そのまま）")
        else:
            out += b[s:i]
    return bytes(out), n

path = sys.argv[1]
zin = zipfile.ZipFile(io.BytesIO(open(path, "rb").read()))
buf = io.BytesIO(); zout = zipfile.ZipFile(buf, "w")
changed = 0
for info in zin.infolist():
    data = zin.read(info.filename)
    if info.filename == "xl/workbook.xml":
        s = data.decode("utf-8")
        s2, k = re.subn(r'(<x15ac:absPath\b[^>]*?\surl=")[^"]*(")', r"\1\2", s)
        if s2 != s:
            data = s2.encode("utf-8"); changed += 1; print("workbook.xml の absPath", k, "個を空に")
    elif info.filename == "xl/workbook.bin":
        d2, k = fix_bin(data)
        if k:
            data = d2; changed += 1
    ni = zipfile.ZipInfo(info.filename, date_time=info.date_time)
    ni.compress_type = info.compress_type
    ni.external_attr = info.external_attr
    ni.create_system = info.create_system
    zout.writestr(ni, data)
zout.close()
if changed:
    open(path, "wb").write(buf.getvalue())
print("部品", len(zin.infolist()), "替えた部品", changed)
