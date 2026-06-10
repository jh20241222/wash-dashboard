// lib/db.js
// Neon serverless HTTP 방식 - tagged template 미사용
import { neon } from '@neondatabase/serverless';

// 매 요청마다 새 connection
const getDb = () => neon(process.env.POSTGRES_URL);

// 단순 쿼리 실행 (파라미터 없음)
async function q(sql) {
  const db = getDb();
  return db([sql]);
}

// 파라미터 있는 쿼리 - 값을 SQL에 직접 안전하게 삽입
function safe(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return isFinite(v) ? String(Math.floor(v === Math.floor(v) ? v : v)) : '0';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  // 문자열 - SQL injection 방지
  return "'" + String(v).replace(/'/g, "''").slice(0, 500) + "'";
}

function safeInt(v) {
  const n = parseInt(v);
  return isNaN(n) ? 0 : n;
}

function safeFloat(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function safeStr(v, maxLen = 200) {
  return "'" + String(v || '').replace(/'/g, "''").slice(0, maxLen) + "'";
}

async function run(sql) {
  const db = getDb();
  return db([sql]);
}

// ── 공개 API ──────────────────────────────────────────────────────────

export async function getAllWeeks() {
  return run('SELECT * FROM weekly_summary ORDER BY week_start ASC NULLS LAST');
}

export async function getWeekData(weekLabel) {
  const wl = safeStr(weekLabel, 10).slice(1,-1); // 따옴표 제거
  const escaped = "'" + wl.replace(/'/g,"''") + "'";
  const [summary, daily, companies, elapsed, workers, overdue] = await Promise.all([
    run(`SELECT * FROM weekly_summary WHERE week_label=${escaped}`),
    run(`SELECT * FROM daily_completed WHERE week_label=${escaped} ORDER BY work_date`),
    run(`SELECT * FROM company_stats WHERE week_label=${escaped} ORDER BY target_count DESC`),
    run(`SELECT * FROM elapsed_distribution WHERE week_label=${escaped}`),
    run(`SELECT * FROM worker_stats WHERE week_label=${escaped} ORDER BY completed_count DESC`),
    run(`SELECT * FROM overdue_vehicles WHERE week_label=${escaped} ORDER BY elapsed_days DESC LIMIT 100`),
  ]);
  return { summary: summary[0]||null, daily, companies, elapsed, workers, overdue };
}

export async function insertWeekData(weekLabel, data) {
  const { summary: s, daily, companies, elapsed, workers, overdue } = data;
  const wl = "'" + String(weekLabel).replace(/'/g,"''") + "'";

  // weekly_summary upsert
  await run(`
    INSERT INTO weekly_summary(week_label,week_start,week_end,target_count,completed_count,over21_count,over21_simple,over21_impossible,utilization_rate,avg_elapsed_days)
    VALUES(${wl},${safeStr(s.weekStart)},${safeStr(s.weekEnd)},${safeInt(s.targetCount)},${safeInt(s.completedCount)},${safeInt(s.over21Count)},${safeInt(s.over21Simple)},${safeInt(s.over21Impossible)},${safeFloat(s.utilizationRate)},${safeFloat(s.avgElapsedDays)})
    ON CONFLICT(week_label) DO UPDATE SET
      week_start=EXCLUDED.week_start,week_end=EXCLUDED.week_end,
      target_count=EXCLUDED.target_count,completed_count=EXCLUDED.completed_count,
      over21_count=EXCLUDED.over21_count,over21_simple=EXCLUDED.over21_simple,
      over21_impossible=EXCLUDED.over21_impossible,utilization_rate=EXCLUDED.utilization_rate,
      avg_elapsed_days=EXCLUDED.avg_elapsed_days,uploaded_at=NOW()
  `);

  // daily_completed
  await run(`DELETE FROM daily_completed WHERE week_label=${wl}`);
  for (const d of daily) {
    await run(`INSERT INTO daily_completed(week_label,work_date,completed_count)VALUES(${wl},${safeStr(d.date)},${safeInt(d.count)})`);
  }

  // company_stats
  await run(`DELETE FROM company_stats WHERE week_label=${wl}`);
  for (const c of companies) {
    await run(`INSERT INTO company_stats(week_label,company_name,target_count,completed_count,avg_elapsed_days)VALUES(${wl},${safeStr(c.name,50)},${safeInt(c.target)},${safeInt(c.completed)},${safeFloat(c.avgElapsed)})`);
  }

  // elapsed_distribution
  await run(`DELETE FROM elapsed_distribution WHERE week_label=${wl}`);
  for (const e of elapsed) {
    await run(`INSERT INTO elapsed_distribution(week_label,bucket,count)VALUES(${wl},${safeStr(e.bucket,20)},${safeInt(e.count)})`);
  }

  // worker_stats
  await run(`DELETE FROM worker_stats WHERE week_label=${wl}`);
  for (const w of workers) {
    await run(`INSERT INTO worker_stats(week_label,worker_id,completed_count,avg_work_minutes)VALUES(${wl},${safeStr(w.id,50)},${safeInt(w.count)},${safeFloat(w.avgMinutes)})`);
  }

  // overdue_vehicles
  await run(`DELETE FROM overdue_vehicles WHERE week_label=${wl}`);
  for (const v of overdue) {
    const plate   = safeStr(v.plate,   20);
    const model   = safeStr(v.model,  100);
    const days    = safeInt(v.days);
    const region  = safeStr(v.region,  50);
    const spot    = safeStr(v.spot,   200);
    const company = safeStr(v.company, 50);
    const reason  = safeStr(v.reason,  50);
    const carry   = safeStr(v.carryOver,30);
    await run(`INSERT INTO overdue_vehicles(week_label,license_plate,car_model,elapsed_days,region,spot_name,company_name,reason,carry_over)VALUES(${wl},${plate},${model},${days},${region},${spot},${company},${reason},${carry})`);
  }
}

export async function deleteWeek(weekLabel) {
  const wl = "'" + String(weekLabel).replace(/'/g,"''") + "'";
  await run(`DELETE FROM weekly_summary WHERE week_label=${wl}`);
}
