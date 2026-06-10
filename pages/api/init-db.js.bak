import { initDb } from '../../lib/db';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try { await initDb(); res.status(200).json({ ok: true, message: '테이블 생성 완료!' }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
}
