// lib/db.js
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

export async function getAllWeeks() {
  return sql`SELECT * FROM weekly_summary ORDER BY week_start ASC NULLS LAST`;
}

export async function getWeekData(weekLabel) {
  const [summary, daily, companies, elapsed, workers, overdue] = await Promise.all([
    sql`SELECT * FROM weekly_summary WHERE week_label = ${weekLabel}`,
    sql`SELECT * FROM daily_completed WHERE week_label = ${weekLabel} ORDER BY work_date`,
    sql`SELECT * FROM company_stats WHERE week_label = ${weekLabel} ORDER BY target_count DESC`,
    sql`SELECT * FROM elapsed_distribution WHERE week_label = ${weekLabel}`,
    sql`SELECT * FROM worker_stats WHERE week_label = ${weekLabel} ORDER BY completed_count DESC`,
    sql`SELECT * FROM overdue_vehicles WHERE week_label = ${weekLabel} ORDER BY elapsed_days DESC LIMIT 50`,
  ]);
  return { summary: summary[0]||null, daily, companies, elapsed, workers, overdue };
}

export async function insertWeekData(weekLabel, data) {
  const { summary: s, daily, companies, elapsed, workers, overdue } = data;

  await sql`
    INSERT INTO weekly_summary
      (week_label,week_start,week_end,target_count,completed_count,over21_count,over21_simple,over21_impossible,utilization_rate,avg_elapsed_days)
    VALUES
      (${weekLabel},${s.weekStart},${s.weekEnd},${s.targetCount},${s.completedCount},${s.over21Count},${s.over21Simple},${s.over21Impossible},${s.utilizationRate},${s.avgElapsedDays})
    ON CONFLICT (week_label) DO UPDATE SET
      week_start=EXCLUDED.week_start, week_end=EXCLUDED.week_end,
      target_count=EXCLUDED.target_count, completed_count=EXCLUDED.completed_count,
      over21_count=EXCLUDED.over21_count, over21_simple=EXCLUDED.over21_simple,
      over21_impossible=EXCLUDED.over21_impossible, utilization_rate=EXCLUDED.utilization_rate,
      avg_elapsed_days=EXCLUDED.avg_elapsed_days, uploaded_at=NOW()
  `;

  await sql`DELETE FROM daily_completed WHERE week_label=${weekLabel}`;
  for (const d of daily)
    await sql`INSERT INTO daily_completed(week_label,work_date,completed_count) VALUES(${weekLabel},${d.date},${d.count})`;

  await sql`DELETE FROM company_stats WHERE week_label=${weekLabel}`;
  for (const c of companies)
    await sql`INSERT INTO company_stats(week_label,company_name,target_count,completed_count,avg_elapsed_days) VALUES(${weekLabel},${c.name},${c.target},${c.completed},${c.avgElapsed})`;

  await sql`DELETE FROM elapsed_distribution WHERE week_label=${weekLabel}`;
  for (const e of elapsed)
    await sql`INSERT INTO elapsed_distribution(week_label,bucket,count) VALUES(${weekLabel},${e.bucket},${e.count})`;

  await sql`DELETE FROM worker_stats WHERE week_label=${weekLabel}`;
  for (const w of workers)
    await sql`INSERT INTO worker_stats(week_label,worker_id,completed_count,avg_work_minutes) VALUES(${weekLabel},${w.id},${w.count},${w.avgMinutes})`;

  await sql`DELETE FROM overdue_vehicles WHERE week_label=${weekLabel}`;
  for (const v of overdue) {
    const plate    = String(v.plate||'');
    const model    = String(v.model||'');
    const days     = parseInt(v.days)||0;
    const region   = String(v.region||'');
    const spot     = String(v.spot||'');
    const company  = String(v.company||'');
    const reason   = String(v.reason||'');
    const carryOver= String(v.carryOver||'-');
    await sql`INSERT INTO overdue_vehicles(week_label,license_plate,car_model,elapsed_days,region,spot_name,company_name,reason,carry_over) VALUES(${weekLabel},${plate},${model},${days},${region},${spot},${company},${reason},${carryOver})`;
  }
}
