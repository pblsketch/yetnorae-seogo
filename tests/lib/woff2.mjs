// 점검용 WOFF2 읽기. 글꼴 파일을 풀어 표(table)를 꺼내고, 글자 지도(cmap)·GSUB 기능 이름·이름표(name)를 읽는다.
// 글리프 모양(glyf·loca 변환)은 풀지 않는다. 점검에 필요한 표는 변환 없이 담겨 있다.
import zlib from 'node:zlib';

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

function base128(buf, pos) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos.i++];
    if (i === 0 && b === 0x80) throw Error('WOFF2: 0으로 시작하는 UIntBase128');
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) return v;
  }
  throw Error('WOFF2: UIntBase128이 너무 길다');
}

// buf(Buffer) → Map(태그 → Buffer)
export function readWoff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw Error('WOFF2 파일이 아니다');
  const numTables = buf.readUInt16BE(12);
  const pos = { i: 48 };
  const dir = [];
  for (let t = 0; t < numTables; t++) {
    const flags = buf[pos.i++];
    let tag;
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', pos.i, pos.i + 4); pos.i += 4; } else tag = KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const origLength = base128(buf, pos);
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    const length = transformed ? base128(buf, pos) : origLength;
    dir.push({ tag, length, transformed });
  }
  const totalCompressed = buf.readUInt32BE(20);
  const data = zlib.brotliDecompressSync(buf.subarray(pos.i, pos.i + totalCompressed));
  const tables = new Map();
  let off = 0;
  for (const d of dir) {
    tables.set(d.tag, d.transformed ? null : data.subarray(off, off + d.length));
    off += d.length;
  }
  if (off !== data.length) throw Error(`WOFF2: 풀어낸 길이가 표 길이의 합과 다르다(${off} ≠ ${data.length})`);
  return tables;
}

// cmap → Set(코드 포인트)
export function readCmap(cmap) {
  const n = cmap.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) {
    const p = 4 + i * 8;
    subs.push({ platform: cmap.readUInt16BE(p), encoding: cmap.readUInt16BE(p + 2), offset: cmap.readUInt32BE(p + 4) });
  }
  const out = new Set();
  for (const s of subs) {
    const f = cmap.readUInt16BE(s.offset);
    if (f === 12) {
      const groups = cmap.readUInt32BE(s.offset + 12);
      for (let g = 0; g < groups; g++) {
        const p = s.offset + 16 + g * 12;
        const start = cmap.readUInt32BE(p), end = cmap.readUInt32BE(p + 4), glyph = cmap.readUInt32BE(p + 8);
        for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.add(c);
      }
    } else if (f === 4) {
      const segX2 = cmap.readUInt16BE(s.offset + 6);
      const segs = segX2 / 2;
      const ends = s.offset + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let k = 0; k < segs; k++) {
        const end = cmap.readUInt16BE(ends + k * 2), start = cmap.readUInt16BE(starts + k * 2);
        const delta = cmap.readInt16BE(deltas + k * 2), ro = cmap.readUInt16BE(ranges + k * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph;
          if (ro === 0) glyph = (c + delta) & 0xffff;
          else {
            const gp = ranges + k * 2 + ro + (c - start) * 2;
            glyph = cmap.readUInt16BE(gp);
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) out.add(c);
        }
      }
    }
  }
  return out;
}

// GSUB → Set(기능 이름)
export function readGsubFeatures(gsub) {
  const out = new Set();
  if (!gsub) return out;
  const fl = gsub.readUInt16BE(6);
  const count = gsub.readUInt16BE(fl);
  for (let i = 0; i < count; i++) out.add(gsub.toString('latin1', fl + 2 + i * 6, fl + 6 + i * 6));
  return out;
}

// name → Map(nameID → 글) (Windows 유니코드 이름만)
export function readNames(name) {
  const count = name.readUInt16BE(2), strOff = name.readUInt16BE(4);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const p = 6 + i * 12;
    const platform = name.readUInt16BE(p), id = name.readUInt16BE(p + 6), len = name.readUInt16BE(p + 8), off = name.readUInt16BE(p + 10);
    if (platform !== 3) continue;
    const raw = name.subarray(strOff + off, strOff + off + len);
    let s = '';
    for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k));
    out.set(id, s);
  }
  return out;
}
