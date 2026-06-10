import { parseCarwashExcel } from '../../lib/parseExcel';
import { insertWeekData } from '../../lib/db';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  let start = 0;
  while (start < buffer.length) {
    const bIdx = buffer.indexOf(boundaryBuf, start);
    if (bIdx === -1) break;
    const hStart = bIdx + boundaryBuf.length + 2;
    const hEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), hStart);
    if (hEnd === -1) break;
    const headers = buffer.slice(hStart, hEnd).toString();
    const dStart = hEnd + 4;
    const next = buffer.indexOf(boundaryBuf, dStart);
    const dEnd = next === -1 ? buffer.length : next - 2;
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]+)"/);
    parts.push({ name: nameMatch?.[1]||'', filename: fileMatch?.[1]||'', data: buffer.slice(dStart, dEnd) });
    start = next === -1 ? buffer.length : next;
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const ct = req.headers['content-type']||'';
    const bMatch = ct.match(/boundary=(.+)/);
    if (!bMatch) return res.status(400).json({ error: 'boundary 없음' });
    const raw = await getRawBody(req);
    const parts = parseMultipart(raw, bMatch[1]);
    const filePart = parts.find(p => p.filename);
    if (!filePart) return res.status(400).json({ error: '파일 없음' });
    const wkMatch = filePart.filename.match(/WK(\d+)/i);
    if (!wkMatch) return res.status(400).json({ error: '파일명에 WK숫자 포함 필요. 예: WK24_세차현황.xlsx' });
    const weekLabel = `WK${wkMatch[1]}`;
    const data = parseCarwashExcel(filePart.data, weekLabel);
    await insertWeekData(weekLabel, data);
    res.status(200).json({ ok: true, weekLabel, summary: data.summary, rowCounts: { daily: data.daily.length, companies: data.companies.length, workers: data.workers.length, overdue: data.overdue.length } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
