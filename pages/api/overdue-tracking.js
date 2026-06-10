import { getWeekData, getCompletedPlates } from '../../lib/db';
import { getAllWeeks } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { label } = req.query;
  if (!label) return res.status(400).json({ error: '주차 레이블 필요' });

  try {
    // 현재 주차 완료 차량 번호판
    const completedRows = await getCompletedPlates(label);
    const completedPlates = new Set(completedRows.map(r => r.license_plate));

    // 직전 주차 찾기
    const weeks = await getAllWeeks();
    const idx = weeks.findIndex(w => w.week_label === label);
    if (idx <= 0) return res.status(200).json({ hasPrev: false });

    const prevLabel = weeks[idx - 1].week_label;
    const prevData = await getWeekData(prevLabel);
    const prevOverdue = prevData.overdue || [];

    // 직전 미조치 차량들이 이번 주에 어떻게 됐는지 분류
    const results = prevOverdue.map(v => {
      const plate = v.license_plate;
      const completed = completedPlates.has(plate);
      return { ...v, completedThisWeek: completed };
    });

    const completedCount = results.filter(r => r.completedThisWeek).length;
    const stillOverdue = results.filter(r => !r.completedThisWeek);
    const stillSimple = stillOverdue.filter(r => (r.reason||'').replace(/\s/g,'').includes('단순미세차')).length;
    const stillImpossible = stillOverdue.filter(r => (r.reason||'').includes('세차 불가')).length;

    res.status(200).json({
      hasPrev: true,
      prevLabel,
      totalPrevOverdue: prevOverdue.length,
      completedCount,
      stillOverdueCount: stillOverdue.length,
      stillSimple,
      stillImpossible,
      completedList: results.filter(r => r.completedThisWeek),
      stillList: stillOverdue,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
