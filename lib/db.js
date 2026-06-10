import pg from 'pg';
const { Pool } = pg;

let _pool = null;
function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DB 환경변수 없음: DATABASE_PUBLIC_URL, DATABASE_URL, POSTGRES_URL 중 하나 필요');
    _pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return _pool;
}

function safeInt(v)   { const n = parseInt(v);   return isNaN(n) ? 0 : n; }
function safeFloat(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function safeStr(v, max=200) { return String(v||'').slice(0,max); }

async function q(text, params=[]) {
  const pool = getPool();
  const client = await pool.connect();
  try { return (await client.query(text, params)).rows; }
  finally { client.release(); }
}

export async function initDb() {
  await q(`CREATE TABLE IF NOT EXISTS weekly_summary(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL UNIQUE,week_start DATE,week_end DATE,target_count INT DEFAULT 0,completed_count INT DEFAULT 0,over21_count INT DEFAULT 0,over21_simple INT DEFAULT 0,over21_impossible INT DEFAULT 0,utilization_rate FLOAT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,uploaded_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS daily_completed(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,work_date DATE NOT NULL,completed_count INT DEFAULT 0,UNIQUE(week_label,work_date))`);
  await q(`CREATE TABLE IF NOT EXISTS company_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,company_name VARCHAR(50) NOT NULL,target_count INT DEFAULT 0,completed_count INT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,UNIQUE(week_label,company_name))`);
  await q(`CREATE TABLE IF NOT EXISTS elapsed_distribution(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,bucket VARCHAR(20) NOT NULL,count INT DEFAULT 0,UNIQUE(week_label,bucket))`);
  await q(`CREATE TABLE IF NOT EXISTS worker_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,worker_id VARCHAR(50) NOT NULL,completed_count INT DEFAULT 0,avg_work_minutes FLOAT DEFAULT 0,UNIQUE(week_label,worker_id))`);
  await q(`CREATE TABLE IF NOT EXISTS overdue_vehicles(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,license_plate VARCHAR(20),car_model VARCHAR(100),elapsed_days INT DEFAULT 0,region VARCHAR(50),spot_name VARCHAR(200),company_name VARCHAR(50),reason VARCHAR(50),carry_over VARCHAR(30))`);
}

export async function getAllWeeks() {
  return q('SELECT * FROM weekly_summary ORDER BY week_start ASC NULLS LAST');
}

export async function getWeekData(weekLabel) {
  const [summary,daily,companies,elapsed,workers,overdue] = await Promise.all([
    q('SELECT * FROM weekly_summary WHERE week_label=$1',[weekLabel]),
    q('SELECT * FROM daily_completed WHERE week_label=$1 ORDER BY work_date',[weekLabel]),
    q('SELECT * FROM company_stats WHERE week_label=$1 ORDER BY target_count DESC',[weekLabel]),
    q('SELECT * FROM elapsed_distribution WHERE week_label=$1',[weekLabel]),
    q('SELECT * FROM worker_stats WHERE week_label=$1 ORDER BY completed_count DESC',[weekLabel]),
    q('SELECT * FROM overdue_vehicles WHERE week_label=$1 ORDER BY elapsed_days DESC LIMIT 100',[weekLabel]),
  ]);
  return { summary:summary[0]||null, daily, companies, elapsed, workers, overdue };
}

export async function insertWeekData(weekLabel, data) {
  const {summary:s, daily, companies, elapsed, workers, overdue} = data;
  await q(`INSERT INTO weekly_summary(week_label,week_start,week_end,target_count,completed_count,over21_count,over21_simple,over21_impossible,utilization_rate,avg_elapsed_days)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(week_label) DO UPDATE SET week_start=$2,week_end=$3,target_count=$4,completed_count=$5,over21_count=$6,over21_simple=$7,over21_impossible=$8,utilization_rate=$9,avg_elapsed_days=$10,uploaded_at=NOW()`,
    [weekLabel,s.weekStart,s.weekEnd,safeInt(s.targetCount),safeInt(s.completedCount),safeInt(s.over21Count),safeInt(s.over21Simple),safeInt(s.over21Impossible),safeFloat(s.utilizationRate),safeFloat(s.avgElapsedDays)]);

  await q('DELETE FROM daily_completed WHERE week_label=$1',[weekLabel]);
  for(const d of daily) await q('INSERT INTO daily_completed(week_label,work_date,completed_count)VALUES($1,$2,$3)',[weekLabel,safeStr(d.date),safeInt(d.count)]);

  await q('DELETE FROM company_stats WHERE week_label=$1',[weekLabel]);
  for(const c of companies) await q('INSERT INTO company_stats(week_label,company_name,target_count,completed_count,avg_elapsed_days)VALUES($1,$2,$3,$4,$5)',[weekLabel,safeStr(c.name,50),safeInt(c.target),safeInt(c.completed),safeFloat(c.avgElapsed)]);

  await q('DELETE FROM elapsed_distribution WHERE week_label=$1',[weekLabel]);
  for(const e of elapsed) await q('INSERT INTO elapsed_distribution(week_label,bucket,count)VALUES($1,$2,$3)',[weekLabel,safeStr(e.bucket,20),safeInt(e.count)]);

  await q('DELETE FROM worker_stats WHERE week_label=$1',[weekLabel]);
  for(const w of workers) await q('INSERT INTO worker_stats(week_label,worker_id,completed_count,avg_work_minutes)VALUES($1,$2,$3,$4)',[weekLabel,safeStr(w.id,50),safeInt(w.count),safeFloat(w.avgMinutes)]);

  await q('DELETE FROM overdue_vehicles WHERE week_label=$1',[weekLabel]);
  for(const v of overdue) await q('INSERT INTO overdue_vehicles(week_label,license_plate,car_model,elapsed_days,region,spot_name,company_name,reason,carry_over)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [weekLabel,safeStr(v.plate,20),safeStr(v.model,100),safeInt(v.days),safeStr(v.region,50),safeStr(v.spot,200),safeStr(v.company,50),safeStr(v.reason,50),safeStr(v.carryOver,30)]);
}

export async function deleteWeek(weekLabel) {
  await q('DELETE FROM weekly_summary WHERE week_label=$1',[weekLabel]);
}
