// pages/api/init-db.js
import { query } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await query(`CREATE TABLE IF NOT EXISTS weekly_summary (
      id SERIAL PRIMARY KEY, week_label VARCHAR(10) NOT NULL UNIQUE,
      week_start DATE, week_end DATE,
      target_count INT NOT NULL DEFAULT 0, completed_count INT NOT NULL DEFAULT 0,
      over21_count INT NOT NULL DEFAULT 0, over21_simple INT NOT NULL DEFAULT 0,
      over21_impossible INT NOT NULL DEFAULT 0, utilization_rate FLOAT DEFAULT 0,
      avg_elapsed_days FLOAT DEFAULT 0, uploaded_at TIMESTAMP DEFAULT NOW())`);

    await query(`CREATE TABLE IF NOT EXISTS daily_completed (
      id SERIAL PRIMARY KEY, week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
      work_date DATE NOT NULL, completed_count INT NOT NULL DEFAULT 0, UNIQUE(week_label, work_date))`);

    await query(`CREATE TABLE IF NOT EXISTS company_stats (
      id SERIAL PRIMARY KEY, week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
      company_name VARCHAR(50) NOT NULL, target_count INT NOT NULL DEFAULT 0,
      completed_count INT NOT NULL DEFAULT 0, avg_elapsed_days FLOAT DEFAULT 0, UNIQUE(week_label, company_name))`);

    await query(`CREATE TABLE IF NOT EXISTS elapsed_distribution (
      id SERIAL PRIMARY KEY, week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
      bucket VARCHAR(20) NOT NULL, count INT NOT NULL DEFAULT 0, UNIQUE(week_label, bucket))`);

    await query(`CREATE TABLE IF NOT EXISTS worker_stats (
      id SERIAL PRIMARY KEY, week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
      worker_id VARCHAR(50) NOT NULL, completed_count INT NOT NULL DEFAULT 0,
      avg_work_minutes FLOAT DEFAULT 0, UNIQUE(week_label, worker_id))`);

    await query(`CREATE TABLE IF NOT EXISTS overdue_vehicles (
      id SERIAL PRIMARY KEY, week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,
      license_plate VARCHAR(20), car_model VARCHAR(50), elapsed_days INT NOT NULL DEFAULT 0,
      region VARCHAR(30), spot_name VARCHAR(100), company_name VARCHAR(50),
      reason VARCHAR(30), carry_over VARCHAR(20))`);

    res.status(200).json({ ok: true, message: '테이블 생성 완료!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
