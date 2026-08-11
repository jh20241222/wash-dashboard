import pg from 'pg';
const { Pool } = pg;
let _pool = null;
function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DB 환경변수 없음');
    _pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return _pool;
}
function safeInt(v){ const n=parseInt(v); return isNaN(n)?0:n; }
function safeFloat(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
function safeStr(v,max=200){ return String(v||'').slice(0,max); }
async function q(text,params=[]){
  const pool=getPool(); const client=await pool.connect();
  try{ return (await client.query(text,params)).rows; }
  finally{ client.release(); }
}
export async function initDb() {
  await q(`CREATE TABLE IF NOT EXISTS weekly_summary(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL UNIQUE,week_start DATE,week_end DATE,target_count INT DEFAULT 0,completed_count INT DEFAULT 0,over21_count INT DEFAULT 0,over21_simple INT DEFAULT 0,over21_impossible INT DEFAULT 0,utilization_rate FLOAT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,uploaded_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS daily_completed(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,work_date DATE NOT NULL,completed_count INT DEFAULT 0,UNIQUE(week_label,work_date))`);
  await q(`CREATE TABLE IF NOT EXISTS company_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,company_name VARCHAR(50) NOT NULL,target_count INT DEFAULT 0,completed_count INT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,UNIQUE(week_label,company_name))`);
  await q(`CREATE TABLE IF NOT EXISTS elapsed_distribution(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,bucket VARCHAR(20) NOT NULL,count INT DEFAULT 0,UNIQUE(week_label,bucket))`);
  await q(`CREATE TABLE IF NOT EXISTS worker_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,worker_id VARCHAR(50) NOT NULL,completed_count INT DEFAULT 0,avg_work_minutes FLOAT DEFAULT 0,UNIQUE(week_label,worker_id))`);
  await q(`CREATE TABLE IF NOT EXISTS overdue_vehicles(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,license_plate VARCHAR(20),car_model VARCHAR(100),elapsed_days INT DEFAULT 0,region VARCHAR(50),spot_name VARCHAR(200),company_name VARCHAR(50),reason VARCHAR(50),carry_over VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS completed_vehicles(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,license_plate VARCHAR(20),worker_id VARCHAR(50),work_date DATE)`);
  // ── 신규/확장 테이블 (제휴사·차종 통계, 작업자/업체 세분화) ──
  await q(`CREATE TABLE IF NOT EXISTS partner_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,partner_name VARCHAR(80) NOT NULL,target_count INT DEFAULT 0,completed_count INT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,over21_count INT DEFAULT 0,UNIQUE(week_label,partner_name))`);
  await q(`CREATE TABLE IF NOT EXISTS model_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,model_name VARCHAR(120) NOT NULL,target_count INT DEFAULT 0,completed_count INT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,UNIQUE(week_label,model_name))`);
  // 기존 배포 DB 호환을 위한 컬럼 추가 (이미 있으면 무시)
  await q(`ALTER TABLE company_stats ADD COLUMN IF NOT EXISTS bucket_0_6 INT DEFAULT 0`);
  await q(`ALTER TABLE company_stats ADD COLUMN IF NOT EXISTS bucket_7_13 INT DEFAULT 0`);
  await q(`ALTER TABLE company_stats ADD COLUMN IF NOT EXISTS bucket_14_20 INT DEFAULT 0`);
  await q(`ALTER TABLE company_stats ADD COLUMN IF NOT EXISTS bucket_21_plus INT DEFAULT 0`);
  await q(`ALTER TABLE worker_stats ADD COLUMN IF NOT EXISTS worker_name VARCHAR(50)`);
  await q(`ALTER TABLE worker_stats ADD COLUMN IF NOT EXISTS company_name VARCHAR(50)`);
  await q(`ALTER TABLE worker_stats ADD COLUMN IF NOT EXISTS round_count INT DEFAULT 0`);
  await q(`ALTER TABLE worker_stats ADD COLUMN IF NOT EXISTS mixed_count INT DEFAULT 0`);
  await q(`ALTER TABLE overdue_vehicles ADD COLUMN IF NOT EXISTS partner_name VARCHAR(80)`);
  await q(`ALTER TABLE worker_stats ADD COLUMN IF NOT EXISTS long_overdue_count INT DEFAULT 0`);
  // ── 지역별 통계 (시/도+구/군 단위 전체 대상 차량 수 · 장기미세차) ──
  await q(`CREATE TABLE IF NOT EXISTS region_stats(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,region_si VARCHAR(50) NOT NULL,region_gu VARCHAR(50) DEFAULT '',target_count INT DEFAULT 0,over21_count INT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_region_stats_week ON region_stats(week_label)`);
  // ── 지도(맵차트) 스냅샷 테이블 ──
  await q(`CREATE TABLE IF NOT EXISTS map_snapshots(id SERIAL PRIMARY KEY,label VARCHAR(30) NOT NULL UNIQUE,total_count INT DEFAULT 0,uploaded_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS map_region_stats(id SERIAL PRIMARY KEY,label VARCHAR(30) NOT NULL REFERENCES map_snapshots(label) ON DELETE CASCADE,region_si VARCHAR(50) NOT NULL,region_gu VARCHAR(50) DEFAULT '',target_count INT DEFAULT 0,avg_elapsed_days FLOAT DEFAULT 0,over21_count INT DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS map_vehicles(id SERIAL PRIMARY KEY,label VARCHAR(30) NOT NULL REFERENCES map_snapshots(label) ON DELETE CASCADE,license_plate VARCHAR(20),car_model VARCHAR(100),bm VARCHAR(10),region_si VARCHAR(50),region_gu VARCHAR(50),spot_name VARCHAR(200),company_name VARCHAR(50),partner_name VARCHAR(80),elapsed_days INT DEFAULT 0)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_map_region_label ON map_region_stats(label)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_map_vehicles_label ON map_vehicles(label)`);
  // ── 세차대상 시트 원본 전체 행 (원본 뷰어 · 피벗용) ──
  await q(`CREATE TABLE IF NOT EXISTS target_vehicles(id SERIAL PRIMARY KEY,week_label VARCHAR(10) NOT NULL REFERENCES weekly_summary(week_label) ON DELETE CASCADE,license_plate VARCHAR(20),elapsed_days INT DEFAULT 0,data JSONB NOT NULL)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_target_vehicles_week ON target_vehicles(week_label)`);
}
export async function getMapSnapshots(){
  return q('SELECT * FROM map_snapshots ORDER BY uploaded_at ASC');
}
export async function getMapSnapshotData(label){
  const [snap,regions,vehicles]=await Promise.all([
    q('SELECT * FROM map_snapshots WHERE label=$1',[label]),
    q('SELECT * FROM map_region_stats WHERE label=$1 ORDER BY target_count DESC',[label]),
    q('SELECT * FROM map_vehicles WHERE label=$1 ORDER BY elapsed_days DESC LIMIT 3000',[label]),
  ]);
  return {snapshot:snap[0]||null,regions,vehicles};
}
export async function insertMapSnapshot(label,data){
  const{totalCount=0,regions=[],vehicles=[]}=data;
  await q(`INSERT INTO map_snapshots(label,total_count)VALUES($1,$2) ON CONFLICT(label) DO UPDATE SET total_count=$2,uploaded_at=NOW()`,[safeStr(label,30),safeInt(totalCount)]);
  await q('DELETE FROM map_region_stats WHERE label=$1',[label]);
  for(const r of regions) await q('INSERT INTO map_region_stats(label,region_si,region_gu,target_count,avg_elapsed_days,over21_count)VALUES($1,$2,$3,$4,$5,$6)',[label,safeStr(r.si,50),safeStr(r.gu,50),safeInt(r.count),safeFloat(r.avgElapsed),safeInt(r.over21)]);
  await q('DELETE FROM map_vehicles WHERE label=$1',[label]);
  if(vehicles.length>0){
    const CH=500; // 청크 단위 삽입 (파라미터 개수 제한 회피)
    for(let i=0;i<vehicles.length;i+=CH){
      const chunk=vehicles.slice(i,i+CH);
      const vv=chunk.map((_,j)=>`($${j*10+1},$${j*10+2},$${j*10+3},$${j*10+4},$${j*10+5},$${j*10+6},$${j*10+7},$${j*10+8},$${j*10+9},$${j*10+10})`).join(',');
      const vp=chunk.flatMap(v=>[label,safeStr(v.plate,20),safeStr(v.model,100),safeStr(v.bm,10),safeStr(v.si,50),safeStr(v.gu,50),safeStr(v.spot,200),safeStr(v.company,50),safeStr(v.partner,80),safeInt(v.days)]);
      await q(`INSERT INTO map_vehicles(label,license_plate,car_model,bm,region_si,region_gu,spot_name,company_name,partner_name,elapsed_days)VALUES${vv}`,vp);
    }
  }
}
export async function deleteMapSnapshot(label){
  await q('DELETE FROM map_snapshots WHERE label=$1',[label]);
}
export async function getAllWeeks(){
  return q('SELECT * FROM weekly_summary ORDER BY week_start ASC NULLS LAST');
}
export async function getWeekData(weekLabel){
  const [summary,daily,companies,elapsed,workers,overdue,partners,models,regionStats]=await Promise.all([
    q('SELECT * FROM weekly_summary WHERE week_label=$1',[weekLabel]),
    q('SELECT * FROM daily_completed WHERE week_label=$1 ORDER BY work_date',[weekLabel]),
    q('SELECT * FROM company_stats WHERE week_label=$1 ORDER BY target_count DESC',[weekLabel]),
    q('SELECT * FROM elapsed_distribution WHERE week_label=$1',[weekLabel]),
    q('SELECT * FROM worker_stats WHERE week_label=$1 ORDER BY completed_count DESC',[weekLabel]),
    q('SELECT * FROM overdue_vehicles WHERE week_label=$1 ORDER BY elapsed_days DESC LIMIT 100',[weekLabel]),
    q('SELECT * FROM partner_stats WHERE week_label=$1 ORDER BY target_count DESC',[weekLabel]),
    q('SELECT * FROM model_stats WHERE week_label=$1 ORDER BY target_count DESC',[weekLabel]),
    q('SELECT * FROM region_stats WHERE week_label=$1 ORDER BY target_count DESC',[weekLabel]),
  ]);
  return {summary:summary[0]||null,daily,companies,elapsed,workers,overdue,partners,models,regionStats};
}
export async function getCompletedPlates(weekLabel){
  return q('SELECT license_plate FROM completed_vehicles WHERE week_label=$1',[weekLabel]);
}
export async function insertWeekData(weekLabel,data){
  const{summary:s,daily,companies,elapsed,workers,overdue,completedPlates=[],partners=[],models=[],regionStats=[]}=data;
  await q(`INSERT INTO weekly_summary(week_label,week_start,week_end,target_count,completed_count,over21_count,over21_simple,over21_impossible,utilization_rate,avg_elapsed_days)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(week_label) DO UPDATE SET week_start=$2,week_end=$3,target_count=$4,completed_count=$5,over21_count=$6,over21_simple=$7,over21_impossible=$8,utilization_rate=$9,avg_elapsed_days=$10,uploaded_at=NOW()`,
    [weekLabel,s.weekStart,s.weekEnd,safeInt(s.targetCount),safeInt(s.completedCount),safeInt(s.over21Count),safeInt(s.over21Simple),safeInt(s.over21Impossible),safeFloat(s.utilizationRate),safeFloat(s.avgElapsedDays)]);
  await q('DELETE FROM daily_completed WHERE week_label=$1',[weekLabel]);
  if(daily.length>0){
    const dv=daily.map((_,i)=>`($${i*3+1},$${i*3+2},$${i*3+3})`).join(',');
    const dp=daily.flatMap(d=>[weekLabel,safeStr(d.date),safeInt(d.count)]);
    await q(`INSERT INTO daily_completed(week_label,work_date,completed_count)VALUES${dv}`,dp);
  }
  await q('DELETE FROM company_stats WHERE week_label=$1',[weekLabel]);
  for(const c of companies) await q('INSERT INTO company_stats(week_label,company_name,target_count,completed_count,avg_elapsed_days,bucket_0_6,bucket_7_13,bucket_14_20,bucket_21_plus)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[weekLabel,safeStr(c.name,50),safeInt(c.target),safeInt(c.completed),safeFloat(c.avgElapsed),safeInt(c.bucket0_6),safeInt(c.bucket7_13),safeInt(c.bucket14_20),safeInt(c.bucket21Plus)]);
  await q('DELETE FROM elapsed_distribution WHERE week_label=$1',[weekLabel]);
  for(const e of elapsed) await q('INSERT INTO elapsed_distribution(week_label,bucket,count)VALUES($1,$2,$3)',[weekLabel,safeStr(e.bucket,20),safeInt(e.count)]);
  await q('DELETE FROM worker_stats WHERE week_label=$1',[weekLabel]);
  if(workers.length>0){
    const wv=workers.map((_,i)=>`($${i*7+1},$${i*7+2},$${i*7+3},$${i*7+4},$${i*7+5},$${i*7+6},$${i*7+7})`).join(',');
    const wp=workers.flatMap(w=>[weekLabel,safeStr(w.id,50),safeInt(w.count),safeFloat(w.avgMinutes),safeStr(w.name,50),safeStr(w.company,50),safeInt(w.roundCount)]);
    await q(`INSERT INTO worker_stats(week_label,worker_id,completed_count,avg_work_minutes,worker_name,company_name,round_count)VALUES${wv}`,wp);
    // mixed_count / long_overdue_count 는 별도 UPDATE (컬럼수 제한 우회)
    for(const w of workers) await q('UPDATE worker_stats SET mixed_count=$1,long_overdue_count=$2 WHERE week_label=$3 AND worker_id=$4',[Math.max(0,safeInt(w.count)-safeInt(w.roundCount)),safeInt(w.longCount),weekLabel,safeStr(w.id,50)]);
  }
  await q('DELETE FROM completed_vehicles WHERE week_label=$1',[weekLabel]);
  if(completedPlates.length>0){
    const vals=completedPlates.map((_,i)=>`($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',');
    const params=completedPlates.flatMap(c=>[weekLabel,safeStr(c.plate,20),safeStr(c.workerId,50),c.workDate||null]);
    await q(`INSERT INTO completed_vehicles(week_label,license_plate,worker_id,work_date)VALUES${vals}`,params);
  }
  await q('DELETE FROM overdue_vehicles WHERE week_label=$1',[weekLabel]);
  if(overdue.length>0){
    const ov=overdue.map((_,i)=>`($${i*10+1},$${i*10+2},$${i*10+3},$${i*10+4},$${i*10+5},$${i*10+6},$${i*10+7},$${i*10+8},$${i*10+9},$${i*10+10})`).join(',');
    const op=overdue.flatMap(v=>[weekLabel,safeStr(v.plate,20),safeStr(v.model,100),safeInt(v.days),safeStr(v.region,50),safeStr(v.spot,200),safeStr(v.company,50),safeStr(v.reason,50),safeStr(v.carryOver,30),safeStr(v.partner,80)]);
    await q(`INSERT INTO overdue_vehicles(week_label,license_plate,car_model,elapsed_days,region,spot_name,company_name,reason,carry_over,partner_name)VALUES${ov}`,op);
  }
  await q('DELETE FROM partner_stats WHERE week_label=$1',[weekLabel]);
  for(const p of partners) await q('INSERT INTO partner_stats(week_label,partner_name,target_count,completed_count,avg_elapsed_days,over21_count)VALUES($1,$2,$3,$4,$5,$6)',[weekLabel,safeStr(p.name,80),safeInt(p.target),safeInt(p.completed),safeFloat(p.avgElapsed),safeInt(p.over21)]);
  await q('DELETE FROM model_stats WHERE week_label=$1',[weekLabel]);
  for(const m of models) await q('INSERT INTO model_stats(week_label,model_name,target_count,completed_count,avg_elapsed_days)VALUES($1,$2,$3,$4,$5)',[weekLabel,safeStr(m.name,120),safeInt(m.target),safeInt(m.completed),safeFloat(m.avgElapsed)]);
  await q('DELETE FROM region_stats WHERE week_label=$1',[weekLabel]);
  for(const r of regionStats) await q('INSERT INTO region_stats(week_label,region_si,region_gu,target_count,over21_count,avg_elapsed_days)VALUES($1,$2,$3,$4,$5,$6)',[weekLabel,safeStr(r.si,50),safeStr(r.gu,50),safeInt(r.target),safeInt(r.over21),safeFloat(r.avgElapsed)]);
}
export async function deleteWeek(weekLabel){
  await q('DELETE FROM weekly_summary WHERE week_label=$1',[weekLabel]);
}

// ── 세차대상 시트 원본 전체 행 (원본 뷰어 · 피벗 빌더용) ──
// data 컬럼에 엑셀 시트의 원본 컬럼명·값을 그대로 JSON으로 저장한다.
// 시트에 커스텀 컬럼이 추가되어도 스키마 변경 없이 그대로 저장/조회된다.
export async function insertTargetVehicles(weekLabel, rows) {
  await q('DELETE FROM target_vehicles WHERE week_label=$1', [weekLabel]);
  if (!rows || !rows.length) return;
  const CH = 300; // 청크 단위 삽입 (파라미터 개수 제한 회피, JSON이라 청크를 작게)
  for (let i = 0; i < rows.length; i += CH) {
    const chunk = rows.slice(i, i + CH);
    const vv = chunk.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4})`).join(',');
    const vp = chunk.flatMap(r => [
      weekLabel,
      safeStr(r['차량번호'], 20),
      safeInt(r['세차경과일']),
      JSON.stringify(r),
    ]);
    await q(`INSERT INTO target_vehicles(week_label,license_plate,elapsed_days,data) VALUES ${vv}`, vp);
  }
}
export async function getTargetVehicles(weekLabel) {
  const rows = await q('SELECT data FROM target_vehicles WHERE week_label=$1 ORDER BY elapsed_days DESC, id ASC', [weekLabel]);
  return rows.map(r => r.data);
}
export async function hasTargetVehicles(weekLabel) {
  const rows = await q('SELECT 1 FROM target_vehicles WHERE week_label=$1 LIMIT 1', [weekLabel]);
  return rows.length > 0;
}
