// lib/parseExcel.js
// 실제 파일 구조 기반 파서
// 시트: WK{N}_세차대상, WK{N}_세차_RAW
// 파일명: WK22_세차현황.xlsx, WK23_세차현황.xlsx ...

import * as XLSX from 'xlsx';

export function parseCarwashExcel(buffer, weekLabel) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  // 시트명 찾기: WK숫자_세차대상, WK숫자_세차_RAW
  const find = (keyword) =>
    wb.SheetNames.find(n => n.toLowerCase().includes(keyword.toLowerCase())) || '';

  const sheetTarget = find('세차대상');
  const sheetWash   = find('세차_RAW');

  if (!sheetTarget) throw new Error('WK??_세차대상 시트를 찾을 수 없습니다.');
  if (!sheetWash)   throw new Error('WK??_세차_RAW 시트를 찾을 수 없습니다.');

  const targetRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetTarget], { defval: null });
  const washRows   = XLSX.utils.sheet_to_json(wb.Sheets[sheetWash],   { defval: null });

  // ── 1. 세차대상 기반 KPI ───────────────────────────────────────
  const totalTarget = targetRows.length;

  // 경과일 분포
  const elapsedBuckets = { '0-6일': 0, '7-13일': 0, '14-20일': 0, '21일↑': 0 };
  for (const r of targetRows) {
    const d = Number(r['세차경과일']) || 0;
    if (d < 7)       elapsedBuckets['0-6일']++;
    else if (d < 14) elapsedBuckets['7-13일']++;
    else if (d < 21) elapsedBuckets['14-20일']++;
    else             elapsedBuckets['21일↑']++;
  }

  const over21 = targetRows.filter(r => (Number(r['세차경과일']) || 0) >= 21);
  const over21Count     = over21.length;
  const normalizeReason = (v) => String(v || '').replace(/\s/g, '').toLowerCase();
  const over21Simple    = over21.filter(r => normalizeReason(r['세차 불가 여부']) === '단순미세차').length;
  const over21Impossible = over21.filter(r => normalizeReason(r['세차 불가 여부']).includes('세차불가')).length;

  const avgElapsedDays = totalTarget > 0
    ? Math.round((targetRows.reduce((s, r) => s + (Number(r['세차경과일']) || 0), 0) / totalTarget) * 10) / 10
    : 0;

  const utilizationRate = totalTarget > 0
    ? Math.round((targetRows.reduce((s, r) => s + (Number(r['가동율(고객운행,%)']) || 0), 0) / totalTarget) * 10) / 10
    : 0;

  // ── 2. 업체별 세차대상/완료 ───────────────────────────────────
  // 세차대상 시트에서 담당업체별 집계
  const companyTargetMap = {};
  const companyElapsedMap = {};
  for (const r of targetRows) {
    const c = r['담당업체'] || '미지정';
    companyTargetMap[c] = (companyTargetMap[c] || 0) + 1;
    if (!companyElapsedMap[c]) companyElapsedMap[c] = [];
    companyElapsedMap[c].push(Number(r['세차경과일']) || 0);
  }

  // 세차_RAW 에서 담당업체별 완료 건수 (세차대상 join)
  const plateToCompany = {};
  for (const r of targetRows) {
    if (r['차량번호'] && r['담당업체']) plateToCompany[r['차량번호']] = r['담당업체'];
  }
  const companyCompletedMap = {};
  for (const r of washRows) {
    const c = plateToCompany[r['차량번호']] || '미지정';
    companyCompletedMap[c] = (companyCompletedMap[c] || 0) + 1;
  }

  const companies = Object.keys(companyTargetMap)
    .filter(c => c !== 'undefined' && c !== 'null' && c !== '미지정')
    .map(c => ({
      name: c,
      target: companyTargetMap[c] || 0,
      completed: companyCompletedMap[c] || 0,
      avgElapsed: companyElapsedMap[c]?.length
        ? Math.round((companyElapsedMap[c].reduce((a,b)=>a+b,0) / companyElapsedMap[c].length) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.target - a.target);

  // ── 3. 세차_RAW 기반: 완료건수 / 일별 / 작업자 ───────────────
  const totalCompleted = washRows.length;

  // 엑셀 직렬번호 → Date
  const excelToDate = (v) => {
    if (!v) return null;
    if (typeof v === 'string') {
      const d = new Date(v);
      return isNaN(d) ? null : d;
    }
    if (typeof v === 'number') {
      // Excel serial: days since 1900-01-01 (with leap year bug)
      const d = new Date((v - 25569) * 86400 * 1000);
      return d;
    }
    return null;
  };

  // 일별 완료 집계
  // 먼저 전체 날짜 집계
  const dailyMapAll = {};
  for (const r of washRows) {
    const dt = excelToDate(r['운행시작']);
    if (!dt) continue;
    const key = String(dt.toISOString().slice(0, 10));
    dailyMapAll[key] = (dailyMapAll[key] || 0) + 1;
  }
  const allDates = Object.keys(dailyMapAll).sort();

  // 주차 기간: 가장 많은 날짜가 속한 월요일~일요일 범위 계산
  // 집계일: 월~일 (월요일 시작)
  const getMonday = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay(); // 0=일, 1=월
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  };
  const getSunday = (mondayStr) => {
    const d = new Date(mondayStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().slice(0, 10);
  };
  // 날짜 빈도로 가장 많은 주 찾기
  const mondayCount = {};
  allDates.forEach(d => {
    const mon = getMonday(d);
    mondayCount[mon] = (mondayCount[mon] || 0) + (dailyMapAll[d] || 0);
  });
  const mainMonday = Object.entries(mondayCount).sort((a,b) => b[1]-a[1])[0]?.[0] || allDates[0];
  const mainSunday = getSunday(mainMonday);

  // 주차 기간 내 날짜만 필터
  const daily = Object.entries(dailyMapAll)
    .filter(([d]) => d >= mainMonday && d <= mainSunday)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // 주차 시작/종료일
  const dates = daily.map(d => d.date).sort();
  const weekStart = dates[0] || null;
  const weekEnd   = dates[dates.length - 1] || null;

  // 작업자별 통계
  const workerMap = {};
  for (const r of washRows) {
    const wid = r['예약자(ID)'];
    if (!wid) continue;
    const start = excelToDate(r['운행시작']);
    const end   = excelToDate(r['운행종료']);
    const mins  = (start && end) ? (end - start) / 60000 : null;
    if (!workerMap[wid]) workerMap[wid] = { count: 0, minutes: [] };
    workerMap[wid].count++;
    if (mins != null && mins > 0 && mins < 300) workerMap[wid].minutes.push(mins);
  }
  const workers = Object.entries(workerMap)
    .map(([id, v]) => ({
      id,
      count: v.count,
      avgMinutes: v.minutes.length
        ? Math.round((v.minutes.reduce((a,b)=>a+b,0) / v.minutes.length) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── 4. 미조치 차량 목록 (21일↑) ──────────────────────────────
  const overdue = [];
  for (const r of over21) {
    const plate    = String(r['차량번호'] || '');
    const model    = String(r['차종명'] || '');
    const days     = Math.floor(Number(r['세차경과일']) || 0);
    const region   = [String(r['지역(시/도)'] || ''), String(r['지역(구/군)'] || '')].filter(Boolean).join(' ');
    const spot     = String(r['현재스팟명'] || '');
    const company  = String(r['담당업체'] || '');
    const reason   = String(r['세차 불가 여부'] || '단순미세차').replace(/\s+/g, ' ').trim();
    const carryOver = String(r['기타'] || '-');
    overdue.push({ plate, model, days, region, spot, company, reason, carryOver });
  }
  overdue.sort((a, b) => b.days - a.days);

  // ── 5. 요약 객체 ──────────────────────────────────────────────
  const summary = {
    weekLabel,
    weekStart,
    weekEnd,
    targetCount: totalTarget,
    completedCount: totalCompleted,
    over21Count,
    over21Simple,
    over21Impossible,
    utilizationRate,
    avgElapsedDays,
  };

  return {
    summary,
    daily,
    companies,
    elapsed: Object.entries(elapsedBuckets).map(([bucket, count]) => ({ bucket, count })),
    workers,
    overdue,
  };
}
