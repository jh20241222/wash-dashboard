// lib/db.js
// Vercel Postgres를 사용합니다. 로컬 개발 시 .env.local에 POSTGRES_URL 설정 필요.
import { sql } from '@vercel/postgres';

export { sql };

/**
 * 초기 DB 테이블 생성 (최초 1회 실행)
 * Vercel 배포 후 /api/init-db 엔드포인트 호출하거나
 * Vercel Dashboard > Storage > Query 탭에서 직접 실행 가능
 */
export const CREATE_TABLES_SQL = `
-- 주차별 요약 지표
CREATE TABLE IF NOT EXISTS weekly_summary (
  id SERIAL PRIMARY KEY,
  week_label VARCHAR(10) NOT NULL UNIQUE,   -- 'WK22', 'WK23', ...
  week_start DATE NOT NULL,
  week_end   DATE NOT NULL,
  target_count   INT NOT NULL DEFAULT 0,    -- 세차 대상 차량
  completed_count INT NOT NULL DEFAULT 0,   -- 세차 완료
  over21_count    INT NOT NULL DEFAULT 0,   -- 21일 이상 미세차
  over21_simple   INT NOT NULL DEFAULT 0,   -- 단순 미세차 (21일↑)
  over21_impossible INT NOT NULL DEFAULT 0, -- 세차 불가 (21일↑)
  utilization_rate FLOAT DEFAULT 0,         -- 고객운행 가동율 %
  avg_elapsed_days FLOAT DEFAULT 0,         -- 평균 경과일
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- 일별 세차 완료 건수
CREATE TABLE IF NOT EXISTS daily_completed (
  id SERIAL PRIMARY KEY,
  week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  completed_count INT NOT NULL DEFAULT 0,
  UNIQUE(week_label, work_date)
);

-- 업체별 세차 대상/완료
CREATE TABLE IF NOT EXISTS company_stats (
  id SERIAL PRIMARY KEY,
  week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
  company_name VARCHAR(50) NOT NULL,
  target_count INT NOT NULL DEFAULT 0,
  completed_count INT NOT NULL DEFAULT 0,
  avg_elapsed_days FLOAT DEFAULT 0,
  UNIQUE(week_label, company_name)
);

-- 경과일 구간 분포
CREATE TABLE IF NOT EXISTS elapsed_distribution (
  id SERIAL PRIMARY KEY,
  week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
  bucket VARCHAR(20) NOT NULL,   -- '0-6일', '7-13일', '14-20일', '21일↑'
  count INT NOT NULL DEFAULT 0,
  UNIQUE(week_label, bucket)
);

-- 작업자별 통계
CREATE TABLE IF NOT EXISTS worker_stats (
  id SERIAL PRIMARY KEY,
  week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
  worker_id VARCHAR(50) NOT NULL,
  completed_count INT NOT NULL DEFAULT 0,
  avg_work_minutes FLOAT DEFAULT 0,
  UNIQUE(week_label, worker_id)
);

-- 21일 이상 미조치 차량 목록
CREATE TABLE IF NOT EXISTS overdue_vehicles (
  id SERIAL PRIMARY KEY,
  week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
  license_plate VARCHAR(20),
  car_model VARCHAR(50),
  elapsed_days INT NOT NULL DEFAULT 0,
  region VARCHAR(30),
  spot_name VARCHAR(100),
  company_name VARCHAR(50),
  reason VARCHAR(30),         -- '단순미세차', '세차불가', '세차불가스팟'
  carry_over VARCHAR(20)      -- 'WK21 미조치', '-'
);
`;

export async function getAllWeeks() {
  const result = await sql`
    SELECT * FROM weekly_summary ORDER BY week_start ASC
  `;
  return result.rows;
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
  return {
    summary: summary.rows[0],
    daily: daily.rows,
    companies: companies.rows,
    elapsed: elapsed.rows,
    workers: workers.rows,
    overdue: overdue.rows,
  };
}

export async function insertWeekData(weekLabel, data) {
  const { summary, daily, companies, elapsed, workers, overdue } = data;

  // Upsert summary
  await sql`
    INSERT INTO weekly_summary
      (week_label, week_start, week_end, target_count, completed_count,
       over21_count, over21_simple, over21_impossible, utilization_rate, avg_elapsed_days)
    VALUES
      (${weekLabel}, ${summary.weekStart}, ${summary.weekEnd},
       ${summary.targetCount}, ${summary.completedCount},
       ${summary.over21Count}, ${summary.over21Simple}, ${summary.over21Impossible},
       ${summary.utilizationRate}, ${summary.avgElapsedDays})
    ON CONFLICT (week_label) DO UPDATE SET
      week_start = EXCLUDED.week_start,
      week_end = EXCLUDED.week_end,
      target_count = EXCLUDED.target_count,
      completed_count = EXCLUDED.completed_count,
      over21_count = EXCLUDED.over21_count,
      over21_simple = EXCLUDED.over21_simple,
      over21_impossible = EXCLUDED.over21_impossible,
      utilization_rate = EXCLUDED.utilization_rate,
      avg_elapsed_days = EXCLUDED.avg_elapsed_days,
      uploaded_at = NOW()
  `;

  // Delete old detail rows and reinsert
  await sql`DELETE FROM daily_completed WHERE week_label = ${weekLabel}`;
  for (const d of daily) {
    await sql`INSERT INTO daily_completed (week_label, work_date, completed_count) VALUES (${weekLabel}, ${d.date}, ${d.count})`;
  }

  await sql`DELETE FROM company_stats WHERE week_label = ${weekLabel}`;
  for (const c of companies) {
    await sql`INSERT INTO company_stats (week_label, company_name, target_count, completed_count, avg_elapsed_days)
              VALUES (${weekLabel}, ${c.name}, ${c.target}, ${c.completed}, ${c.avgElapsed})`;
  }

  await sql`DELETE FROM elapsed_distribution WHERE week_label = ${weekLabel}`;
  for (const e of elapsed) {
    await sql`INSERT INTO elapsed_distribution (week_label, bucket, count) VALUES (${weekLabel}, ${e.bucket}, ${e.count})`;
  }

  await sql`DELETE FROM worker_stats WHERE week_label = ${weekLabel}`;
  for (const w of workers) {
    await sql`INSERT INTO worker_stats (week_label, worker_id, completed_count, avg_work_minutes)
              VALUES (${weekLabel}, ${w.id}, ${w.count}, ${w.avgMinutes})`;
  }

  await sql`DELETE FROM overdue_vehicles WHERE week_label = ${weekLabel}`;
  for (const v of overdue) {
    await sql`INSERT INTO overdue_vehicles
      (week_label, license_plate, car_model, elapsed_days, region, spot_name, company_name, reason, carry_over)
      VALUES (${weekLabel}, ${v.plate}, ${v.model}, ${v.days}, ${v.region}, ${v.spot}, ${v.company}, ${v.reason}, ${v.carryOver})`;
  }
}
