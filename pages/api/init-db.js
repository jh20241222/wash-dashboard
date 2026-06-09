// pages/api/init-db.js
// 최초 배포 후 한 번만 호출: GET /api/init-db
import { sql, CREATE_TABLES_SQL } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await sql.query(CREATE_TABLES_SQL);
    res.status(200).json({ ok: true, message: '테이블이 생성되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
