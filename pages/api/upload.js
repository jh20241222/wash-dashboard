import { parseCarwashExcel } from '../../lib/parseExcel';
import { insertWeekData } from '../../lib/db';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buf, boundary) {
  const parts = [];
  const b = Buffer.from('--' + boundary);
  let start = 0;
  while (start < buf.length) {
    const bi = buf.indexOf(b, start);
    if (bi === -1) break;
    const hs = bi + b.length + 2;
    const he = buf.indexOf(Buffer.from('\r\n\r\n'), hs);
    if (he === -1) break;
    const headers = buf.slice(hs, he).toString();
    const ds = he + 4;
    const next = buf.indexOf(b, ds);
    const de = next === -1 ? buf.length : next - 2;
    parts.push({
      name: (headers.match(/name="([^"]+)"/) || [])[1] || '',
      filename: (headers.match(/filename="([^"]+)"/) || [])[1] || '',
      data: buf.slice(ds, de)
    });
    start = next === -1 ? buf.length : next;
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const ct = req.headers['content-type'] || '';
    const bm = ct.match(/boundary=(.+)/);
    if (!bm) return res.status(400).json({ error: 'boundary 없음' });
    const raw = await getRawBody(req);
    const parts = parseMultipart(raw, bm[1]);
    const fp = parts.find(p => p.filename);
    if (!fp) return res.status(400).json({ error: '파일 없음' });
    const wm = fp.filename.match(/WK(\d+)/i);
    if (!wm) return res.status(400).json({ error: '파일명에 WK숫자 포함 필요. 예: WK24_세차현황.xlsx' });
    const weekLabel = `WK${wm[1]}`;
    const data = parseCarwashExcel(fp.data, weekLabel);
    await insertWeekData(weekLabel, data);
    res.status(200).json({ ok: true, weekLabel, summary: data.summary });
  } catch(e) {
    console.error('UPLOAD ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
}
