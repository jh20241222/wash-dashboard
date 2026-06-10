// pages/api/upload.js
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
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;
    const headerStart = boundaryIdx + boundaryBuf.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;
    const headers = buffer.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundaryBuf, dataStart);
    const dataEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : '',
      data: buffer.slice(dataStart, dataEnd),
    });
    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'boundary 없음' });

    const rawBody = await getRawBody(req);
    const parts = parseMultipart(rawBody, boundaryMatch[1]);
    const filePart = parts.find(p => p.filename);
    if (!filePart) return res.status(400).json({ error: '파일이 없습니다.' });

    const wkMatch = filePart.filename.match(/WK(\d+)/i);
    if (!wkMatch) return res.status(400).json({ error: '파일명에 WK숫자를 포함해주세요. 예: WK24_세차현황.xlsx' });

    const weekLabel = `WK${wkMatch[1]}`;
    const data = parseCarwashExcel(filePart.data, weekLabel);
    await insertWeekData(weekLabel, data);

    res.status(200).json({
      ok: true, weekLabel, summary: data.summary,
      rowCounts: { daily: data.daily.length, companies: data.companies.length, workers: data.workers.length, overdue: data.overdue.length }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
