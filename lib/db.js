import { neon } from '@neondatabase/serverless';

function getDb() { return neon(process.env.POSTGRES_URL); }

async function insertOneOverdue(db, wl, row) {
  const pl = String(row.plate||'').slice(0,20);
  const mo = String(row.model||'').slice(0,100);
  const dy = Math.floor(Number(row.days)||0);
  const re = String(row.region||'').slice(0,50);
  const sp = String(row.spot||'').slice(0,200);
  const co = String(row.company||'').slice(0,50);
  const rs = String(row.reason||'').slice(0,50);
  const cy = String(row.carryOver||'-').slice(0,30);
  await db`INSERT INTO overdue_vehicles(week_label,license_plate,car_model,elapsed_days,region,spot_name,company_name,reason,carry_over)VALUES(${wl},${pl},${mo},${dy},${re},${sp},${co},${rs},${cy})`;
}

export async function getAllWeeks() {
  const db = getDb();
  return db`SELECT * FROM weekly_summary ORDER BY week_start ASC NULLS LAST`;
}

export async function getWeekData(weekLabel) {
  const db = getDb();
  const [summary, daily, companies, elapsed, workers, overdue] = await Promise.all([
    db`SELECT * FROM weekly_summary WHERE week_label=${weekLabel}`,
    db`SELECT * FROM daily_completed WHERE week_label=${weekLabel} ORDER BY work_date`,
    db`SELECT * FROM company_stats WHERE week_label=${weekLabel} ORDER BY target_count DESC`,
    db`SELECT * FROM elapsed_distribution WHERE week_label=${weekLabel}`,
    db`SELECT * FROM worker_stats WHERE week_label=${weekLabel} ORDER BY completed_count DESC`,
    db`SELECT * FROM overdue_vehicles WHERE week_label=${weekLabel} ORDER BY elapsed_days DESC LIMIT 100`,
  ]);
  return { summary: summary[0]||null, daily, companies, elapsed, workers, overdue };
}

export async function insertWeekData(weekLabel, data) {
  const db = getDb();
  const { summary: s, daily, companies, elapsed, workers, overdue: overdueList } = data;

  await db`INSERT INTO weekly_summary(week_label,week_start,week_end,target_count,completed_count,over21_count,over21_simple,over21_impossible,utilization_rate,avg_elapsed_days)
    VALUES(${weekLabel},${s.weekStart},${s.weekEnd},${s.targetCount},${s.completedCount},${s.over21Count},${s.over21Simple},${s.over21Impossible},${s.utilizationRate},${s.avgElapsedDays})
    ON CONFLICT(week_label) DO UPDATE SET
      week_start=EXCLUDED.week_start,week_end=EXCLUDED.week_end,
      target_count=EXCLUDED.target_count,completed_count=EXCLUDED.completed_count,
      over21_count=EXCLUDED.over21_count,over21_simple=EXCLUDED.over21_simple,
      over21_impossible=EXCLUDED.over21_impossible,utilization_rate=EXCLUDED.utilization_rate,
      avg_elapsed_days=EXCLUDED.avg_elapsed_days,uploaded_at=NOW()`;

  await db`DELETE FROM daily_completed WHERE week_label=${weekLabel}`;
  for (const d of daily)
    await db`INSERT INTO daily_completed(week_label,work_date,completed_count)VALUES(${weekLabel},${String(d.date)},${Number(d.count)})`;

  await db`DELETE FROM company_stats WHERE week_label=${weekLabel}`;
  for (const c of companies)
    await db`INSERT INTO company_stats(week_label,company_name,target_count,completed_count,avg_elapsed_days)VALUES(${weekLabel},${String(c.name)},${Number(c.target)},${Number(c.completed)},${Number(c.avgElapsed)})`;

  await db`DELETE FROM elapsed_distribution WHERE week_label=${weekLabel}`;
  for (const e of elapsed)
    await db`INSERT INTO elapsed_distribution(week_label,bucket,count)VALUES(${weekLabel},${String(e.bucket)},${Number(e.count)})`;

  await db`DELETE FROM worker_stats WHERE week_label=${weekLabel}`;
  for (const w of workers)
    await db`INSERT INTO worker_stats(week_label,worker_id,completed_count,avg_work_minutes)VALUES(${weekLabel},${String(w.id)},${Number(w.count)},${Number(w.avgMinutes)})`;

  await db`DELETE FROM overdue_vehicles WHERE week_label=${weekLabel}`;
  for (const row of overdueList)
    await insertOneOverdue(db, weekLabel, row);
}

export async function deleteWeek(weekLabel) {
  const db = getDb();
  await db`DELETE FROM weekly_summary WHERE week_label=${weekLabel}`;
}
