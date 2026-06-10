import { getAllWeeks } from '../../lib/db';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try { res.status(200).json({ weeks: await getAllWeeks() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
}
