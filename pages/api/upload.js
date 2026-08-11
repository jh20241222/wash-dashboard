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
    // 세차대상 시트 원본 전체 행 (원본 뷰어 · 피벗용).
    // target_vehicles 테이블이 아직 없는 배포(=/api/init-db 미실행)에서도
    // 요약/통계 저장 자체는 실패하지 않도록 별도로 감싸고, 경고만 응답에 담아 알려준다.
    let warning = null;
    if (Array.isArray(targetRows)) {
      try {
        await insertTargetVehicles(weekLabel, targetRows);
      } catch (e2) {
        console.error('TARGET_VEHICLES INSERT ERROR:', e2.message);
        warning = '세차대상 원본은 저장되지 못했습니다. /api/init-db 접속 후 이 주차를 다시 업로드해주세요.';
      }
    }
    res.status(200).json({ ok: true, weekLabel, summary: data.summary, warning });
  } catch(e) {
    console.error('UPLOAD ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
}
