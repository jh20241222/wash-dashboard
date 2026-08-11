// pages/api/target-vehicles/[label].js
// 특정 주차의 세차대상 시트 원본 전체 행 조회 (원본 뷰어 · 피벗 빌더용)
import { getTargetVehicles } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const rows = await getTargetVehicles(req.query.label);
    res.status(200).json({ rows });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
