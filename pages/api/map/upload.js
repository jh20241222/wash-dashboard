import { insertMapSnapshot } from '../../../lib/db';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { label, data } = req.body;
    if (!label || !data) return res.status(400).json({ error: '데이터 없음' });
    await insertMapSnapshot(label, data);
    res.status(200).json({ ok: true, label });
  } catch(e) {
    console.error('MAP UPLOAD ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
}
