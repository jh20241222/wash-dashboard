// pages/api/upload.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { parseCarwashExcel } from '../../lib/parseExcel';
import { insertWeekData } from '../../lib/db';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = new IncomingForm({ keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: '파일 파싱 실패: ' + err.message });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: '파일이 없습니다.' });

    // 파일명에서 주차 추출: WK22_세차현황.xlsx → WK22
    const originalName = file.originalFilename || file.name || '';
    const wkMatch = originalName.match(/WK(\d+)/i);
    if (!wkMatch) {
      return res.status(400).json({
        error: `파일명에서 주차를 인식할 수 없습니다. 파일명에 "WK숫자"를 포함해주세요.\n예: WK24_세차현황.xlsx`
      });
    }
    const weekLabel = `WK${wkMatch[1]}`;

    try {
      const buffer = fs.readFileSync(file.filepath);
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
  });
}
