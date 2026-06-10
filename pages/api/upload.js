// pages/api/upload.js
import { parseCarwashExcel } from '../../lib/parseExcel';
import { insertWeekData } from '../../lib/db';

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data 형식으로 업로드해주세요.' });
    }

    // formidable 동적 import
    const { IncomingForm } = await import('formidable');
    const fs = await import('fs');

    const form = new IncomingForm({ keepExtensions: true, maxFileSize: 50 * 1024 * 1024 });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: '파일이 없습니다.' });

    const originalName = file.originalFilename || file.name || '';
    const wkMatch = originalName.match(/WK(\d+)/i);
    if (!wkMatch) {
      return res.status(400).json({ error: '파일명에 WK숫자를 포함해주세요. 예: WK24_세차현황.xlsx' });
    }
    const weekLabel = `WK${wkMatch[1]}`;

    const buffer = fs.default.readFileSync(file.filepath);
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
