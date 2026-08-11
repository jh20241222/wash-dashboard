// pages/api/upload.js
// 브라우저에서 파싱된 JSON 데이터를 받아서 DB에 저장
import { insertWeekData, insertTargetVehicles } from '../../lib/db';

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { weekLabel, data, targetRows } = req.body;
    if (!weekLabel || !data) return res.status(400).json({ error: '데이터 없음' });
    await insertWeekData(weekLabel, data);
    // 세차대상 시트 원본 전체 행 (원본 뷰어 · 피벗용) — 없으면 건너뜀(하위호환)
    if (Array.isArray(targetRows)) await insertTargetVehicles(weekLabel, targetRows);
    res.status(200).json({ ok: true, weekLabel, summary: data.summary });
  } catch(e) {
    console.error('UPLOAD ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
}
