// pages/api/upload.js
export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

import { parseCarwashExcel } from '../../lib/parseExcel';
import { insertWeekData } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { filename, filedata } = req.body;
    if (!filedata) return res.status(400).json({ error: '파일 데이터가 없습니다.' });

    const wkMatch = (filename || '').match(/WK(\d+)/i);
    if (!wkMatch) {
      return res.status(400).json({ error: '파일명에 WK숫자를 포함해주세요. 예: WK24_세차현황.xlsx' });
    }
    const weekLabel = `WK${wkMatch[1]}`;

    // base64 → Buffer
    const buffer = Buffer.from(filedata, 'base64');
    const data = parseCarwashExcel(buffer, weekLabel);
    await insertWeekData(weekLabel, data);

    res.status(200).json({
      ok: true,
      weekLabel,
      summary: data.summary,
      rowCounts: {
        daily: data.daily.length,
        companies: data.companies.length,
        workers: data.workers.length,
        overdue: data.overdue.length,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '데이터 처리 중 오류: ' + e.message });
  }
}
