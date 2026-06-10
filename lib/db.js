// lib/db.js
import { Pool } from 'pg';

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export async function query(text, params) {
  const client = await getPool().connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

export async function getAllWeeks() {
  return query('SELECT * FROM weekly_summary ORDER BY week_start ASC');
}

export async function getWeekData(weekLabel) {
  const [summary, daily, companies, elapsed, workers, overdue] = await Promise.all([
    query('SELECT * FROM weekly_summary WHERE week_label = $1', [weekLabel]),
    query('SELECT * FROM daily_completed WHERE week_label = $1 ORDER BY work_date', [weekLabel]),
    query('SELECT * FROM company_stats WHERE week_label = $1 ORDER BY target_count DESC', [weekLabel]),
    query('SELECT * FROM elapsed_distribution WHERE week_label = $1', [weekLabel]),
    query('SELECT * FROM worker_stats WHERE week_label = $1 ORDER BY completed_count DESC', [weekLabel]),
    query('SELECT * FROM overdue_vehicles WHERE week_label = $1 ORDER BY elapsed_days DESC LIMIT 50', [weekLabel]),
  ]);
  return { summary: summary[0] || null, daily, companies, elapsed, workers, overdue };
}

export async function insertWeekData(weekLabel, data) {
  const { summary, daily, companies, elapsed, workers, overdue } = data;

  await query(`
    INSERT INTO weekly_summary (week_label, week_start, week_end, target_count, completed_count, over21_count, over21_simple, over21_impossible, utilization_rate, avg_elapsed_days)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (week_label) DO UPDATE SET
      week_start=EXCLUDED.week_start, week_end=EXCLUDED.week_end,
      target_count=EXCLUDED.target_count, completed_count=EXCLUDED.completed_count,
      over21_count=EXCLUDED.over21_count, over21_simple=EXCLUDED.over21_simple,
      over21_impossible=EXCLUDED.over21_impossible, utilization_rate=EXCLUDED.utilization_rate,
      avg_elapsed_days=EXCLUDED.avg_elapsed_days, uploaded_at=NOW()
  `, [weekLabel, summary.weekStart, summary.weekEnd, summary.targetCount, summary.completedCount,
      summary.over21Count, summary.over21Simple, summary.over21Impossible,
      summary.utilizationRate, summary.avgElapsedDays]);

  await query('DELETE FROM daily_completed WHERE week_label = $1', [weekLabel]);
  for (const d of daily) {
    await query('INSERT INTO daily_completed (week_label, work_date, completed_count) VALUES ($1,$2,$3)', [weekLabel, d.date, d.count]);
  }

  await query('DELETE FROM company_stats WHERE week_label = $1', [weekLabel]);
  for (const c of companies) {
    await query('INSERT INTO company_stats (week_label, company_name, target_count, completed_count, avg_elapsed_days) VALUES ($1,$2,$3,$4,$5)', [weekLabel, c.name, c.target, c.completed, c.avgElapsed]);
  }

  await query('DELETE FROM elapsed_distribution WHERE week_label = $1', [weekLabel]);
  for (const e of elapsed) {
    await query('INSERT INTO elapsed_distribution (week_label, bucket, count) VALUES ($1,$2,$3)', [weekLabel, e.bucket, e.count]);
  }

  await query('DELETE FROM worker_stats WHERE week_label = $1', [weekLabel]);
  for (const w of workers) {
    await query('INSERT INTO worker_stats (week_label, worker_id, completed_count, avg_work_minutes) VALUES ($1,$2,$3,$4)', [weekLabel, w.id, w.count, w.avgMinutes]);
  }

  await query('DELETE FROM overdue_vehicles WHERE week_label = $1', [weekLabel]);
  for (const v of overdue) {
    await query('INSERT INTO overdue_vehicles (week_label, license_plate, car_model, elapsed_days, region, spot_name, company_name, reason, carry_over) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [weekLabel, v.plate, v.model, v.days, v.region, v.spot, v.company, v.reason, v.carryOver]);
  }
}
