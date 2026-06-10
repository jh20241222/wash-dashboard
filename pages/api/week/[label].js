import { getWeekData } from '../../../lib/db';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const data = await getWeekData(req.query.label);
    if (!data.summary) return res.status(404).json({ error: '없음' });
    res.status(200).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
}
