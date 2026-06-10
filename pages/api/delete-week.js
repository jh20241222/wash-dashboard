import { deleteWeek } from '../../lib/db';
export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end();
  const { label } = req.query;
  if (!label) return res.status(400).json({ error: '주차 레이블 필요' });
  try { await deleteWeek(label); res.status(200).json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
}
