// pages/index.js
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

// ── 컬러 팔레트 (투루카 브랜드) ──────────────────────────────────────
const C = {
  yellow: '#FBC400', orange: '#FF8021', subOrange: '#FF5F00',
  red: '#E41919', navy: '#091E3F', black: '#212121',
  bg: '#F6F7F9', panel: '#FFFFFF', muted: '#6D7B8F',
  line: '#D8E0EB', success: '#12B76A', warning: '#F79009',
};

const WEEK_COLORS = ['#FF8021','#091E3F','#FBC400','#12B76A','#6366F1','#E41919','#06B6D4','#8B5CF6'];
const wc = (i) => WEEK_COLORS[i % WEEK_COLORS.length];
const wca = (i, a=0.7) => {
  const h = wc(i); const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

const CHART_BASE = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: '#6D7B8F', padding: 16 } }, tooltip: { backgroundColor: '#091E3F', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 } },
  scales: {
    x: { grid: { color: 'rgba(216,224,235,.5)' }, ticks: { color: '#6D7B8F', font: { size: 11 } }, border: { display: false } },
    y: { grid: { color: 'rgba(216,224,235,.5)' }, ticks: { color: '#6D7B8F', font: { size: 11 } }, border: { display: false }, beginAtZero: true },
  },
};

const MENUS = [
  { id: 'home',    icon: '🏠', label: '종합 현황' },
  { id: 'compare', icon: '📊', label: '주차별 비교' },
  { id: 'trend',   icon: '📈', label: '트렌드 분석' },
  { id: 'company', icon: '🏢', label: '업체별 통계' },
  { id: 'worker',  icon: '👤', label: '작업자별 통계' },
  { id: 'overdue', icon: '🔴', label: '미조치 추적' },
  { id: 'data',    icon: '📂', label: '데이터 관리' },
];

const PERIODS = [
  { id: 'daily',   label: '일간' },
  { id: 'weekly',  label: '주간' },
  { id: 'monthly', label: '월간' },
];

// ── 유틸 ─────────────────────────────────────────────────────────────
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function deltaSign(v) { return v > 0 ? `+${v}` : `${v}`; }
function deltaColor(v, reverse=false) {
  if (v === 0) return C.muted;
  const pos = reverse ? v < 0 : v > 0;
  return pos ? C.success : C.red;
}

// ═══════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [menu, setMenu] = useState('home');
  const [period, setPeriod] = useState('weekly');
  const [sideOpen, setSideOpen] = useState(false);
  const [weeks, setWeeks] = useState([]);
  const [weekData, setWeekData] = useState({});
  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [uploadState, setUploadState] = useState('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  // ── 주차 목록 로드 ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/weeks').then(r => r.json()).then(({ weeks: w }) => {
      setWeeks(w || []);
      if (w?.length >= 2) setSelectedWeeks([w[w.length-2].week_label, w[w.length-1].week_label]);
      else if (w?.length === 1) setSelectedWeeks([w[0].week_label]);
    }).catch(() => {});
  }, []);

  // ── 주차 데이터 로드 ────────────────────────────────────────────
  useEffect(() => {
    selectedWeeks.forEach(wk => {
      if (!weekData[wk]) {
        fetch(`/api/week/${wk}`).then(r => r.json())
          .then(d => setWeekData(prev => ({ ...prev, [wk]: d }))).catch(() => {});
      }
    });
    weeks.forEach(w => {
      if (!weekData[w.week_label]) {
        fetch(`/api/week/${w.week_label}`).then(r => r.json())
          .then(d => setWeekData(prev => ({ ...prev, [w.week_label]: d }))).catch(() => {});
      }
    });
  }, [selectedWeeks, weeks]);

  // ── 업로드 ─────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0]; if (!file) return;
    setUploadState('uploading'); setUploadMsg('파일 분석 중...');
    const form = new FormData(); form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (json.ok) {
        setUploadState('done');
        setUploadMsg(`✅ ${json.weekLabel} 업로드 완료 — 세차대상 ${json.summary.targetCount}대 / 완료 ${json.summary.completedCount}대`);
        const r2 = await fetch('/api/weeks'); const { weeks: w2 } = await r2.json();
        setWeeks(w2 || []);
        setWeekData(prev => { const n = {...prev}; delete n[json.weekLabel]; return n; });
        setSelectedWeeks(prev => [...new Set([...prev, json.weekLabel])].slice(-2));
        setTimeout(() => { setShowUpload(false); setUploadState('idle'); }, 2500);
      } else { setUploadState('error'); setUploadMsg('❌ ' + (json.error || '업로드 실패')); }
    } catch (e) { setUploadState('error'); setUploadMsg('❌ ' + e.message); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'], 'text/csv': ['.csv'] }, multiple: false,
  });

  // ── 파생 데이터 ─────────────────────────────────────────────────
  const latest = weekData[selectedWeeks[selectedWeeks.length-1]];
  const prev   = weekData[selectedWeeks[0]];
  const hasData = !!latest;

  // 기간 필터에 따른 레이블/데이터 변환
  const getPeriodLabel = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (period === 'daily') return `${d.getMonth()+1}/${d.getDate()}`;
    if (period === 'weekly') return `WK${Math.ceil(d.getDate()/7)}`;
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`;
  };

  // 전체 일별 데이터 집계 (트렌드용)
  const allDailyData = weeks.map(w => ({
    label: w.week_label,
    completed: weekData[w.week_label]?.summary?.completed_count ?? null,
    target: weekData[w.week_label]?.summary?.target_count ?? null,
    over21: weekData[w.week_label]?.summary?.over21_count ?? null,
    rate: weekData[w.week_label]?.summary ? pct(weekData[w.week_label].summary.completed_count, weekData[w.week_label].summary.target_count) : null,
  }));

  // 월간 집계
  const monthlyData = (() => {
    const map = {};
    weeks.forEach(w => {
      const d = weekData[w.week_label]; if (!d?.summary) return;
      const key = w.week_start ? new Date(w.week_start).toISOString().slice(0,7) : w.week_label;
      if (!map[key]) map[key] = { target: 0, completed: 0, over21: 0, count: 0 };
      map[key].target += d.summary.target_count;
      map[key].completed += d.summary.completed_count;
      map[key].over21 += d.summary.over21_count;
      map[key].count++;
    });
    return Object.entries(map).map(([k, v]) => ({ label: k, ...v, rate: pct(v.completed, v.target) }));
  })();

  // 업체 집계 (전체 주차 합산)
  const companyTotal = (() => {
    const map = {};
    weeks.forEach(w => {
      (weekData[w.week_label]?.companies || []).forEach(c => {
        if (!map[c.company_name]) map[c.company_name] = { target: 0, completed: 0 };
        map[c.company_name].target += c.target_count;
        map[c.company_name].completed += c.completed_count;
      });
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v, rate: pct(v.completed, v.target) })).sort((a,b) => b.target - a.target);
  })();

  // 작업자 집계 (전체 주차 합산)
  const workerTotal = (() => {
    const map = {};
    weeks.forEach(w => {
      (weekData[w.week_label]?.workers || []).forEach(wk => {
        if (!map[wk.worker_id]) map[wk.worker_id] = { count: 0, minutes: [], weeks: 0 };
        map[wk.worker_id].count += wk.completed_count;
        if (wk.avg_work_minutes > 0) map[wk.worker_id].minutes.push(wk.avg_work_minutes);
        map[wk.worker_id].weeks++;
      });
    });
    return Object.entries(map).map(([id, v]) => ({
      id, count: v.count, weeks: v.weeks,
      avgMin: v.minutes.length ? Math.round(v.minutes.reduce((a,b)=>a+b,0)/v.minutes.length*10)/10 : 0,
    })).sort((a,b) => b.count - a.count);
  })();

  // 미조치 전체 집계
  const allOverdue = weeks.flatMap(w =>
    (weekData[w.week_label]?.overdue || []).map(v => ({ ...v, week: w.week_label }))
  ).sort((a,b) => b.elapsed_days - a.elapsed_days);

  // ── 차트 데이터 ─────────────────────────────────────────────────
  const trendData = period === 'monthly' ? {
    labels: monthlyData.map(m => m.label),
    datasets: [
      { label: '세차완료', data: monthlyData.map(m => m.completed), borderColor: C.orange, backgroundColor: 'rgba(255,128,33,.1)', borderWidth: 2.5, pointRadius: 4, tension: 0.3, fill: true },
      { label: '세차대상', data: monthlyData.map(m => m.target), borderColor: C.navy, backgroundColor: 'rgba(9,30,63,.07)', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      { label: '21일↑ 미세차', data: monthlyData.map(m => m.over21), borderColor: C.red, backgroundColor: 'rgba(228,25,25,.08)', borderWidth: 2, pointRadius: 3, tension: 0.3 },
    ],
  } : {
    labels: allDailyData.map(d => d.label),
    datasets: [
      { label: '세차완료', data: allDailyData.map(d => d.completed), borderColor: C.orange, backgroundColor: 'rgba(255,128,33,.1)', borderWidth: 2.5, pointRadius: 4, tension: 0.3, fill: true },
      { label: '세차대상', data: allDailyData.map(d => d.target), borderColor: C.navy, backgroundColor: 'rgba(9,30,63,.07)', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      { label: '21일↑ 미세차', data: allDailyData.map(d => d.over21), borderColor: C.red, backgroundColor: 'rgba(228,25,25,.08)', borderWidth: 2, pointRadius: 3, tension: 0.3 },
    ],
  };

  const rateData = {
    labels: period === 'monthly' ? monthlyData.map(m => m.label) : allDailyData.map(d => d.label),
    datasets: [{
      label: '완료율 (%)',
      data: period === 'monthly' ? monthlyData.map(m => m.rate) : allDailyData.map(d => d.rate),
      backgroundColor: allDailyData.map(d => d.rate >= 80 ? 'rgba(18,183,106,.7)' : d.rate >= 60 ? 'rgba(255,128,33,.7)' : 'rgba(228,25,25,.7)'),
      borderRadius: 6,
    }],
  };

  const companyBarData = {
    labels: companyTotal.map(c => c.name),
    datasets: [
      { label: '세차대상', data: companyTotal.map(c => c.target), backgroundColor: 'rgba(9,30,63,.7)', borderRadius: 4 },
      { label: '세차완료', data: companyTotal.map(c => c.completed), backgroundColor: 'rgba(255,128,33,.8)', borderRadius: 4 },
    ],
  };

  const workerBarData = {
    labels: workerTotal.slice(0,15).map(w => w.id),
    datasets: [{
      label: '완료건수',
      data: workerTotal.slice(0,15).map(w => w.count),
      backgroundColor: workerTotal.slice(0,15).map((_, i) => i < 3 ? 'rgba(251,196,0,.9)' : 'rgba(9,30,63,.6)'),
      borderRadius: 4,
    }],
  };

  // 주차 비교 차트
  const compareChartData = {
    labels: ['세차대상','세차완료','21일↑','단순미세차','세차불가'],
    datasets: selectedWeeks.map((wk, i) => ({
      label: wk,
      data: [
        weekData[wk]?.summary?.target_count ?? 0,
        weekData[wk]?.summary?.completed_count ?? 0,
        weekData[wk]?.summary?.over21_count ?? 0,
        weekData[wk]?.summary?.over21_simple ?? 0,
        weekData[wk]?.summary?.over21_impossible ?? 0,
      ],
      backgroundColor: wca(i, 0.75), borderRadius: 5,
    })),
  };

  // ── KPI 카드 ────────────────────────────────────────────────────
  const KpiCard = ({ icon, label, value, sub, delta, deltaReverse, accent, tooltip }) => {
    const dColor = delta != null ? deltaColor(delta, deltaReverse) : null;
    return (
      <div className="kpi-card" style={{ borderTop: `3px solid ${accent}` }}>
        <div className="kpi-head">
          <span className="kpi-icon">{icon}</span>
          {tooltip && <span className="kpi-tip" title={tooltip}>?</span>}
        </div>
        <div className="kpi-val" style={{ color: accent }}>{value}</div>
        <div className="kpi-label">{label}</div>
        {(sub || delta != null) && (
          <div className="kpi-foot">
            {sub && <span className="kpi-sub">{sub}</span>}
            {delta != null && <span className="kpi-delta" style={{ color: dColor, background: dColor + '18' }}>{deltaSign(delta)}</span>}
          </div>
        )}
      </div>
    );
  };

  // ── 섹션 헤더 ───────────────────────────────────────────────────
  const SectionHeader = ({ title, desc }) => (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {desc && <p className="section-desc">{desc}</p>}
      </div>
    </div>
  );

  // ── 현재 주차 KPI ───────────────────────────────────────────────
  const s = latest?.summary;
  const ps = prev?.summary;
  const completionRate = s ? pct(s.completed_count, s.target_count) : 0;
  const prevRate = ps ? pct(ps.completed_count, ps.target_count) : null;

  // ═══ RENDER ══════════════════════════════════════════════════════
  return (
    <>
      <Head>
        <title>세차현황 대시보드 · 투루카</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css" rel="stylesheet" />
      </Head>

      {/* ── 사이드바 ─────────────────────────────────────────── */}
      {sideOpen && <div className="sidebar-backdrop" onClick={() => setSideOpen(false)} />}
      <aside className={`sidebar ${sideOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/turucar-logo.png" alt="TuruCAR" className="sidebar-logo" />
          <div className="sidebar-logo-sub">세차현황 대시보드</div>
        </div>
        <nav className="sidebar-nav">
          {MENUS.map(m => (
            <button key={m.id} className={`nav-item ${menu === m.id ? 'active' : ''}`}
              onClick={() => { setMenu(m.id); setSideOpen(false); }}>
              <span className="nav-icon">{m.icon}</span>
              <span className="nav-label">{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-weeks">
            <div className="sidebar-weeks-title">업로드된 주차</div>
            {weeks.map((w, i) => (
              <div key={w.week_label} className={`sidebar-week-item ${selectedWeeks.includes(w.week_label) ? 'selected' : ''}`}
                onClick={() => setSelectedWeeks(prev => {
                  if (prev.includes(w.week_label)) return prev.filter(x => x !== w.week_label);
                  return [...prev, w.week_label].slice(-4);
                })}
                style={{ '--wc': wc(i) }}>
                <span className="week-dot" style={{ background: wc(i) }} />
                {w.week_label}
                {selectedWeeks.includes(w.week_label) && <span className="week-check">✓</span>}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── 탑바 ─────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-btn" onClick={() => setSideOpen(!sideOpen)}>☰</button>
          <div className="topbar-title">{MENUS.find(m => m.id === menu)?.icon} {MENUS.find(m => m.id === menu)?.label}</div>
        </div>
        <div className="topbar-right">
          <div className="period-tabs">
            {PERIODS.map(p => (
              <button key={p.id} className={`period-tab ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="upload-cta" onClick={() => { setShowUpload(true); setUploadState('idle'); setUploadMsg(''); }}>
            + 주차 업로드
          </button>
        </div>
      </header>

      {/* ── 업로드 모달 ──────────────────────────────────────── */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>새 주차 데이터 업로드</h3>
              <button className="modal-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <p className="modal-desc">파일명에 <code>WK숫자</code>가 포함되면 자동으로 주차가 인식됩니다.<br />예: <code>WK24_세차현황.xlsx</code></p>
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'drag' : ''} state-${uploadState}`}>
              <input {...getInputProps()} />
              {uploadState === 'uploading' ? (
                <div className="drop-inner"><div className="spinner" /><p>분석 중...</p></div>
              ) : (
                <div className="drop-inner">
                  <div className="drop-icon">📂</div>
                  <p>Excel 파일을 드래그하거나 클릭하여 선택</p>
                  <span>.xlsx · .xls · .csv</span>
                </div>
              )}
            </div>
            {uploadMsg && <div className={`upload-msg ${uploadState}`}>{uploadMsg}</div>}
          </div>
        </div>
      )}

      {/* ── 메인 콘텐츠 ──────────────────────────────────────── */}
      <main className="main">

        {/* ══ 빈 상태 ══════════════════════════════════════════ */}
        {!hasData && menu !== 'data' && (
          <div className="empty-state">
            <div className="empty-icon">🚿</div>
            <h2>데이터가 없습니다</h2>
            <p>Excel 파일을 업로드하면 자동으로 분석됩니다</p>
            <button className="upload-cta" onClick={() => setShowUpload(true)}>+ 첫 번째 주차 업로드</button>
          </div>
        )}

        {/* ══ 1. 종합 현황 ════════════════════════════════════ */}
        {menu === 'home' && hasData && (
          <>
            <SectionHeader
              title={`${selectedWeeks[selectedWeeks.length-1]} 종합 현황`}
              desc={`${(s?.week_start||'').slice(0,10)} ~ ${(s?.week_end||'').slice(0,10)} · ${period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 기준`}
            />
            {/* KPI 5개 */}
            <div className="kpi-grid">
              <KpiCard icon="🚗" label="세차 대상 차량" value={`${(s?.target_count??0).toLocaleString()}대`} sub={ps ? `이전 ${ps.target_count}대` : null} delta={ps ? (s.target_count - ps.target_count) : null} accent={C.navy} tooltip="해당 기간 세차가 필요한 전체 차량 수" />
              <KpiCard icon="✅" label="세차 완료" value={`${(s?.completed_count??0).toLocaleString()}건`} sub={ps ? `이전 ${ps.completed_count}건` : null} delta={ps ? (s.completed_count - ps.completed_count) : null} accent={C.success} tooltip="실제로 세차가 완료된 건수" />
              <KpiCard icon="📊" label="완료율" value={`${completionRate}%`} sub={ps ? `이전 ${prevRate}%` : null} delta={ps ? (completionRate - prevRate) : null} accent={C.orange} tooltip="세차대상 대비 완료 비율 (완료 ÷ 대상 × 100)" />
              <KpiCard icon="⚠️" label="21일↑ 미세차" value={`${(s?.over21_count??0)}대`} sub={`단순 ${s?.over21_simple??0} · 불가 ${s?.over21_impossible??0}`} delta={ps ? (s.over21_count - ps.over21_count) : null} deltaReverse accent={C.red} tooltip="마지막 세차 후 21일 이상 경과한 차량 수" />
              <KpiCard icon="📅" label="평균 경과일" value={`${s?.avg_elapsed_days??0}일`} sub={`가동율 ${s?.utilization_rate??0}%`} delta={ps ? Math.round((s.avg_elapsed_days - ps.avg_elapsed_days)*10)/10 : null} deltaReverse accent={C.warning} tooltip="전체 차량의 마지막 세차 후 평균 경과 일수" />
            </div>

            {/* 일별 완료 + 업체별 달성률 */}
            <div className="grid-2">
              <div className="card">
                <div className="card-head">일별 세차 완료 추이 <span className="card-badge">{selectedWeeks[selectedWeeks.length-1]}</span></div>
                <div className="chart-wrap" style={{ height: 220 }}>
                  <Bar data={{
                    labels: (latest?.daily ?? []).map(d => { const s = d.work_date || ''; const p = s.slice(0,10); return p.slice(5).replace('-','/'); }),
                    datasets: [{ label: '완료건수', data: (latest?.daily ?? []).map(d => d.completed_count), backgroundColor: 'rgba(255,128,33,.75)', borderRadius: 5 }],
                  }} options={{ ...CHART_BASE, plugins: { ...CHART_BASE.plugins, legend: { display: false } } }} />
                </div>
              </div>
              <div className="card">
                <div className="card-head">업체별 달성률</div>
                <div className="company-list">
                  {(latest?.companies ?? []).map(c => {
                    const rate = pct(c.completed_count, c.target_count);
                    return (
                      <div key={c.company_name} className="company-row">
                        <div className="company-name">{c.company_name}</div>
                        <div className="company-bar-wrap">
                          <div className="company-bar" style={{ width: `${rate}%`, background: rate >= 80 ? C.success : rate >= 60 ? C.orange : C.red }} />
                        </div>
                        <div className="company-rate">{rate}%</div>
                        <div className="company-nums">{c.completed_count}/{c.target_count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 21일↑ 긴급 알림 */}
            {(s?.over21_count ?? 0) > 0 && (
              <div className="alert-box">
                <div className="alert-icon">🔴</div>
                <div>
                  <div className="alert-title">21일 이상 미세차 차량 {s.over21_count}대 조치 필요</div>
                  <div className="alert-sub">단순미세차 {s.over21_simple}대 · 세차불가 {s.over21_impossible}대 · 미조치 탭에서 상세 확인</div>
                </div>
                <button className="alert-btn" onClick={() => setMenu('overdue')}>상세 보기 →</button>
              </div>
            )}
          </>
        )}

        {/* ══ 2. 주차별 비교 ══════════════════════════════════ */}
        {menu === 'compare' && hasData && (
          <>
            <SectionHeader title="주차별 비교" desc="왼쪽 사이드바에서 비교할 주차를 선택하세요 (최대 4개)" />
            {/* 선택 주차 KPI 비교 */}
            <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${selectedWeeks.length}, 1fr)` }}>
              {selectedWeeks.map((wk, i) => {
                const sd = weekData[wk]?.summary;
                const rate = sd ? pct(sd.completed_count, sd.target_count) : 0;
                return (
                  <div key={wk} className="compare-card" style={{ borderTop: `4px solid ${wc(i)}` }}>
                    <div className="compare-week" style={{ color: wc(i) }}>{wk}</div>
                    <div className="compare-kpis">
                      {[
                        ['세차대상', sd?.target_count ?? '-', '대'],
                        ['세차완료', sd?.completed_count ?? '-', '건'],
                        ['완료율', rate, '%'],
                        ['21일↑', sd?.over21_count ?? '-', '대'],
                        ['평균경과일', sd?.avg_elapsed_days ?? '-', '일'],
                        ['가동율', sd?.utilization_rate ?? '-', '%'],
                      ].map(([lbl, val, unit]) => (
                        <div key={lbl} className="compare-kpi-row">
                          <span className="compare-kpi-lbl">{lbl}</span>
                          <span className="compare-kpi-val" style={{ color: wc(i) }}>{val}{unit}</span>
                        </div>
                      ))}
                    </div>
                    {/* 증감 (2번째 이후) */}
                    {i > 0 && weekData[selectedWeeks[0]]?.summary && sd && (
                      <div className="compare-delta">
                        {[
                          ['완료', sd.completed_count - weekData[selectedWeeks[0]].summary.completed_count, false],
                          ['21일↑', sd.over21_count - weekData[selectedWeeks[0]].summary.over21_count, true],
                        ].map(([lbl, d, rev]) => (
                          <div key={lbl} className="delta-chip" style={{ color: deltaColor(d, rev), background: deltaColor(d, rev) + '18' }}>
                            {lbl} {deltaSign(d)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 바 차트 비교 */}
            <div className="card">
              <div className="card-head">주요 지표 나란히 비교</div>
              <div className="chart-wrap" style={{ height: 280 }}>
                <Bar data={compareChartData} options={CHART_BASE} />
              </div>
            </div>

            {/* 일별 완료 라인 차트 */}
            <div className="card">
              <div className="card-head">일별 완료 추이 비교</div>
              <div className="chart-wrap" style={{ height: 240 }}>
                <Line data={{
                  labels: [...new Set(selectedWeeks.flatMap(wk => (weekData[wk]?.daily || []).map(d => (d.work_date || '').slice(0,10).slice(5).replace('-','/'))))].sort(),
                  datasets: selectedWeeks.map((wk, i) => {
                    const map = Object.fromEntries((weekData[wk]?.daily || []).map(d => [(d.work_date||'').slice(0,10).slice(5).replace('-','/'), d.completed_count]));
                    return { label: wk, data: [...new Set(selectedWeeks.flatMap(w => (weekData[w]?.daily || []).map(d => d.work_date?.slice(5))))].sort().map(k => map[k] ?? null), borderColor: wc(i), backgroundColor: wca(i, 0.07), borderWidth: 2.5, pointRadius: 4, tension: 0.3, fill: true, spanGaps: false };
                  }),
                }} options={CHART_BASE} />
              </div>
            </div>
          </>
        )}

        {/* ══ 3. 트렌드 분석 ══════════════════════════════════ */}
        {menu === 'trend' && hasData && (
          <>
            <SectionHeader title="트렌드 분석" desc={`${period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 단위로 전체 흐름을 확인합니다`} />
            <div className="card">
              <div className="card-head">세차 완료 · 대상 · 미조치 추이</div>
              <div className="chart-wrap" style={{ height: 280 }}>
                <Line data={trendData} options={CHART_BASE} />
              </div>
            </div>
            <div className="grid-2">
              <div className="card">
                <div className="card-head">완료율 추이 <span className="card-badge-green">80% 이상 ✓</span></div>
                <div className="chart-wrap" style={{ height: 220 }}>
                  <Bar data={rateData} options={{ ...CHART_BASE, plugins: { ...CHART_BASE.plugins, legend: { display: false } } }} />
                </div>
              </div>
              <div className="card">
                <div className="card-head">{period === 'monthly' ? '월간' : '주간'} 요약 테이블</div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>기간</th><th>대상</th><th>완료</th><th>완료율</th><th>21일↑</th></tr></thead>
                    <tbody>
                      {(period === 'monthly' ? monthlyData : allDailyData).map((row, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }}>{row.label}</td>
                          <td>{(row.target || 0).toLocaleString()}</td>
                          <td>{(row.completed || 0).toLocaleString()}</td>
                          <td><span className={`rate-badge ${(row.rate||0) >= 80 ? 'good' : (row.rate||0) >= 60 ? 'warn' : 'bad'}`}>{row.rate||0}%</span></td>
                          <td style={{ color: C.red }}>{row.over21||0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══ 4. 업체별 통계 ══════════════════════════════════ */}
        {menu === 'company' && (
          <>
            <SectionHeader title="업체별 통계" desc="담당 업체별 세차 성과를 비교합니다" />
            <div className="card">
              <div className="card-head">업체별 세차 대상 vs 완료</div>
              <div className="chart-wrap" style={{ height: 260 }}>
                <Bar data={companyBarData} options={CHART_BASE} />
              </div>
            </div>
            <div className="card">
              <div className="card-head">업체별 상세 통계</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>순위</th><th>업체명</th><th>세차대상</th><th>세차완료</th><th>완료율</th><th>달성현황</th></tr>
                  </thead>
                  <tbody>
                    {companyTotal.map((c, i) => (
                      <tr key={c.name}>
                        <td><span className={`rank ${i < 3 ? 'top' : ''}`}>{i+1}</span></td>
                        <td style={{ fontWeight: 700 }}>{c.name}</td>
                        <td>{c.target.toLocaleString()}대</td>
                        <td>{c.completed.toLocaleString()}건</td>
                        <td><span className={`rate-badge ${c.rate >= 80 ? 'good' : c.rate >= 60 ? 'warn' : 'bad'}`}>{c.rate}%</span></td>
                        <td style={{ minWidth: 120 }}>
                          <div className="bar-cell">
                            <div className="bar-fill" style={{ width: `${c.rate}%`, background: c.rate >= 80 ? C.success : c.rate >= 60 ? C.orange : C.red }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* 주차별 업체 추이 */}
            <div className="card">
              <div className="card-head">주차별 업체 완료율 추이</div>
              <div className="chart-wrap" style={{ height: 260 }}>
                <Line data={{
                  labels: weeks.map(w => w.week_label),
                  datasets: companyTotal.map((c, i) => ({
                    label: c.name,
                    data: weeks.map(w => {
                      const co = weekData[w.week_label]?.companies?.find(x => x.company_name === c.name);
                      return co ? pct(co.completed_count, co.target_count) : null;
                    }),
                    borderColor: wc(i), backgroundColor: 'transparent',
                    borderWidth: 2, pointRadius: 4, tension: 0.3, spanGaps: true,
                  })),
                }} options={{ ...CHART_BASE, scales: { ...CHART_BASE.scales, y: { ...CHART_BASE.scales.y, max: 100, ticks: { ...CHART_BASE.scales.y.ticks, callback: v => v + '%' } } } }} />
              </div>
            </div>
          </>
        )}

        {/* ══ 5. 작업자별 통계 ════════════════════════════════ */}
        {menu === 'worker' && (
          <>
            <SectionHeader title="작업자별 통계" desc="작업자별 누적 세차 완료 건수와 평균 작업 시간입니다" />
            <div className="card">
              <div className="card-head">작업자 완료 건수 (상위 15명)</div>
              <div className="chart-wrap" style={{ height: 300 }}>
                <Bar data={workerBarData} options={{ ...CHART_BASE, indexAxis: 'y', scales: { x: CHART_BASE.scales.x, y: { ...CHART_BASE.scales.y, grid: { display: false } } } }} />
              </div>
            </div>
            <div className="card">
              <div className="card-head">작업자 상세 순위</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>순위</th><th>작업자 ID</th><th>총 완료건수</th><th>평균 작업시간</th><th>참여 주차</th></tr></thead>
                  <tbody>
                    {workerTotal.map((w, i) => (
                      <tr key={w.id}>
                        <td><span className={`rank ${i < 3 ? 'top' : ''}`}>{i+1}</span></td>
                        <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, fontWeight: 600 }}>{w.id}</td>
                        <td><strong>{w.count.toLocaleString()}</strong>건</td>
                        <td>{w.avgMin > 0 ? `${w.avgMin}분` : '-'}</td>
                        <td>{w.weeks}주차</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* 주차별 작업자 완료 추이 (상위 5명) */}
            <div className="card">
              <div className="card-head">주차별 작업자 완료건수 추이 (상위 5명)</div>
              <div className="chart-wrap" style={{ height: 260 }}>
                <Line data={{
                  labels: weeks.map(w => w.week_label),
                  datasets: workerTotal.slice(0,5).map((w, i) => ({
                    label: w.id,
                    data: weeks.map(wk => weekData[wk.week_label]?.workers?.find(x => x.worker_id === w.id)?.completed_count ?? null),
                    borderColor: wc(i), backgroundColor: 'transparent',
                    borderWidth: 2, pointRadius: 4, tension: 0.3, spanGaps: true,
                  })),
                }} options={CHART_BASE} />
              </div>
            </div>
          </>
        )}

        {/* ══ 6. 미조치 추적 ══════════════════════════════════ */}
        {menu === 'overdue' && (
          <>
            <SectionHeader title="미조치 추적" desc="21일 이상 세차가 이루어지지 않은 차량 목록입니다. 경과일이 길수록 위험도가 높습니다." />
            <div className="kpi-grid kpi-3">
              <KpiCard icon="🔴" label="전체 미조치 차량" value={`${allOverdue.length}대`} accent={C.red} tooltip="21일 이상 세차 미완료 차량 총합" />
              <KpiCard icon="🟡" label="단순 미세차" value={`${allOverdue.filter(v => v.reason === '단순미세차').length}대`} accent={C.warning} tooltip="세차가 가능하지만 아직 완료되지 않은 차량" />
              <KpiCard icon="⛔" label="세차 불가" value={`${allOverdue.filter(v => v.reason?.includes('세차 불가')).length}대`} accent={C.navy} tooltip="주차 위치 또는 차량 상태로 세차가 불가능한 차량" />
            </div>
            <div className="card">
              <div className="card-head">
                21일↑ 미조치 차량 전체 목록
                <span className="card-legend">
                  <span style={{ color: '#8B5CF6' }}>■</span> 60일↑ 위험
                  <span style={{ color: C.red }}>■</span> 40일↑ 경고
                  <span style={{ color: C.warning }}>■</span> 21일↑ 주의
                </span>
              </div>
              <div className="tbl-wrap" style={{ maxHeight: 480 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>번호판</th><th>차종</th><th>경과일</th><th>지역</th>
                      <th>스팟</th><th>업체</th><th>사유</th><th>이월</th><th>주차</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allOverdue.map((v, j) => {
                      const dcls = v.elapsed_days >= 60 ? 'crit' : v.elapsed_days >= 40 ? 'bad' : 'warn';
                      return (
                        <tr key={j}>
                          <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 600 }}>{v.license_plate}</td>
                          <td style={{ fontSize: 11 }}>{v.car_model}</td>
                          <td><span className={`day-badge day-${dcls}`}>{v.elapsed_days}일</span></td>
                          <td style={{ fontSize: 11 }}>{v.region}</td>
                          <td style={{ fontSize: 10, color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.spot_name}</td>
                          <td style={{ fontSize: 11 }}>{v.company_name}</td>
                          <td><span className={`reason-badge ${v.reason === '단순미세차' ? 'simple' : 'impossible'}`}>{v.reason}</span></td>
                          <td style={{ color: v.carry_over !== '-' ? '#8B5CF6' : C.muted, fontWeight: v.carry_over !== '-' ? 700 : 400, fontSize: 11 }}>{v.carry_over}</td>
                          <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: C.muted }}>{v.week}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══ 7. 데이터 관리 ══════════════════════════════════ */}
        {menu === 'data' && (
          <>
            <SectionHeader title="데이터 관리" desc="Excel 파일을 업로드하면 자동으로 분석됩니다. 파일명에 WK숫자를 포함해주세요." />
            <div className="grid-2">
              <div className="card">
                <div className="card-head">📂 새 주차 업로드</div>
                <p className="card-desc">파일명 예: <code>WK24_세차현황.xlsx</code></p>
                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'drag' : ''} state-${uploadState}`}>
                  <input {...getInputProps()} />
                  {uploadState === 'uploading' ? (
                    <div className="drop-inner"><div className="spinner" /><p>분석 중...</p></div>
                  ) : (
                    <div className="drop-inner">
                      <div className="drop-icon">📂</div>
                      <p>Excel 파일을 드래그하거나 클릭하여 선택</p>
                      <span>.xlsx · .xls · .csv</span>
                    </div>
                  )}
                </div>
                {uploadMsg && <div className={`upload-msg ${uploadState}`}>{uploadMsg}</div>}
              </div>
              <div className="card">
                <div className="card-head">📋 업로드된 주차 목록</div>
                <div className="weeks-list">
                  {weeks.length === 0 && <div className="empty-sub">아직 업로드된 주차가 없습니다</div>}
                  {weeks.map((w, i) => {
                    const d = weekData[w.week_label]?.summary;
                    return (
                      <div key={w.week_label} className="week-row">
                        <span className="week-dot-lg" style={{ background: wc(i) }} />
                        <div className="week-info">
                          <div className="week-name">{w.week_label}</div>
                          <div className="week-meta">{(w.week_start||'').slice(0,10)} ~ {(w.week_end||'').slice(0,10)}</div>
                        </div>
                        {d && (
                          <div className="week-stats">
                            <span>대상 {d.target_count}</span>
                            <span>완료 {d.completed_count}</span>
                            <span className={`rate-badge ${pct(d.completed_count,d.target_count) >= 80 ? 'good' : 'warn'}`}>{pct(d.completed_count,d.target_count)}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        /* ── 투루카 브랜드 토큰 ────────────────────────────── */
        :root {
          --yellow: #FBC400; --orange: #FF8021; --sub-orange: #FF5F00;
          --red: #E41919; --navy: #091E3F; --black: #212121;
          --bg: #F6F7F9; --panel: #FFFFFF; --muted: #6D7B8F;
          --line: #D8E0EB; --success: #12B76A; --warning: #F79009;
          --shadow: 0 8px 24px rgba(9,30,63,.09);
          --shadow-sm: 0 2px 8px rgba(9,30,63,.06);
          --radius: 16px; --radius-sm: 10px;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        html { font-size:14px; }
        body {
          font-family:'NanumSquare','Noto Sans KR',sans-serif; color:var(--black);
          background: radial-gradient(circle at 80% -10%, rgba(255,128,33,.12), transparent 32%),
            linear-gradient(180deg,#FBFCFE 0%,var(--bg) 50%,#EFF1F5 100%);
          min-height:100vh;
        }

        /* ── 사이드바 ──────────────────────────────────────── */
        .sidebar {
          position:fixed; top:0; left:0; bottom:0; width:240px; z-index:70;
          display:flex; flex-direction:column;
          background:#1C1C1E;
          color:#eef6ff; border-right:1px solid rgba(255,255,255,.06);
          transform:translateX(-100%); transition:transform .28s cubic-bezier(.4,0,.2,1);
        }
        .sidebar.open { transform:translateX(0); }
        @media(min-width:1024px){ .sidebar { transform:translateX(0); } .main { margin-left:240px; } .topbar { left:240px; } }
        .sidebar-backdrop { position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:65; display:block; }
        @media(min-width:1024px){ .sidebar-backdrop { display:none; } }

        .sidebar-brand { padding:28px 20px 16px; display:flex; flex-direction:column; gap:8px; }
        .sidebar-logo { width:120px; height:auto; filter:brightness(0) invert(1); object-fit:contain; }
        .sidebar-logo-sub { font-size:11px; color:rgba(255,255,255,.35); font-weight:700; letter-spacing:.08em; padding-left:2px; }

        .sidebar-nav { flex:1; padding:0 14px; display:flex; flex-direction:column; gap:1px; }
        .nav-item { display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,.5);font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;text-align:left;width:100%;letter-spacing:-.01em; }
        .nav-item:hover { background:rgba(255,255,255,.06);color:rgba(255,255,255,.85); }
        .nav-item.active { background:rgba(255,128,33,.15);color:#FF8021; }
        .nav-item.active .nav-icon { filter:none; }
        .nav-icon { font-size:18px;width:24px;text-align:center;flex-shrink:0;transition:transform .15s; }
        .nav-item:hover .nav-icon { transform:scale(1.1); }
        .nav-label { flex:1; }

        .sidebar-footer { padding:12px 14px 24px; border-top:1px solid rgba(255,255,255,.07); }
        .sidebar-weeks-title { font-size:10px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.08em;text-transform:uppercase;padding:0 4px;margin-bottom:8px; }
        .sidebar-week-item { display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;color:rgba(255,255,255,.45);transition:all .15s;font-family:'IBM Plex Mono',monospace; }
        .sidebar-week-item:hover { background:rgba(255,255,255,.06);color:#fff; }
        .sidebar-week-item.selected { background:rgba(255,128,33,.12);color:var(--orange); }
        .week-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0; }
        .week-check { margin-left:auto;font-size:11px; }

        /* ── 탑바 ──────────────────────────────────────────── */
        .topbar {
          position:fixed;top:0;left:0;right:0;z-index:60;height:68px;
          display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px;
          background:rgba(246,247,249,.9);backdrop-filter:blur(18px);
          border-bottom:1px solid rgba(216,224,235,.8);
        }
        .topbar-left { display:flex;align-items:center;gap:12px; }
        .topbar-right { display:flex;align-items:center;gap:12px; }
        .menu-btn { width:40px;height:40px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm); }
        @media(min-width:1024px){ .menu-btn { display:none; } }
        .topbar-title { font-size:16px;font-weight:800;letter-spacing:-.02em; }

        .period-tabs { display:flex;gap:2px;background:rgba(9,30,63,.06);padding:3px;border-radius:10px; }
        .period-tab { padding:6px 14px;border:none;background:transparent;border-radius:7px;font-size:12.5px;font-weight:700;color:var(--muted);cursor:pointer;transition:all .15s; }
        .period-tab.active { background:#fff;color:var(--navy);box-shadow:var(--shadow-sm); }
        .upload-cta { padding:9px 18px;background:linear-gradient(135deg,var(--sub-orange),var(--orange));color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px rgba(255,95,0,.22);transition:opacity .15s;white-space:nowrap; }
        .upload-cta:hover { opacity:.88; }

        /* ── 메인 ──────────────────────────────────────────── */
        .main { padding:88px 24px 40px;max-width:1400px;margin:0 auto; }

        /* ── 섹션 헤더 ─────────────────────────────────────── */
        .section-header { margin-bottom:20px; }
        .section-title { font-size:20px;font-weight:900;letter-spacing:-.03em;color:var(--navy); }
        .section-desc { font-size:12.5px;color:var(--muted);margin-top:4px; }

        /* ── KPI 카드 ───────────────────────────────────────── */
        .kpi-grid { display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:20px; }
        .kpi-grid.kpi-3 { grid-template-columns:repeat(3,1fr); }
        @media(max-width:1100px){ .kpi-grid { grid-template-columns:repeat(3,1fr); } }
        @media(max-width:700px){ .kpi-grid { grid-template-columns:repeat(2,1fr); } }

        .kpi-card { background:#fff;border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow);transition:transform .2s; }
        .kpi-card:hover { transform:translateY(-2px); }
        .kpi-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px; }
        .kpi-icon { font-size:20px; }
        .kpi-tip { width:18px;height:18px;border-radius:50%;background:var(--bg);border:1px solid var(--line);font-size:10px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:help;font-weight:700; }
        .kpi-val { font-size:26px;font-weight:900;letter-spacing:-.04em;line-height:1; }
        .kpi-label { font-size:11px;font-weight:700;color:var(--muted);margin-top:6px;letter-spacing:.02em; }
        .kpi-foot { display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap; }
        .kpi-sub { font-size:11px;color:var(--muted); }
        .kpi-delta { font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;font-family:'IBM Plex Mono',monospace; }

        /* ── 카드 ──────────────────────────────────────────── */
        .grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px; }
        @media(max-width:900px){ .grid-2 { grid-template-columns:1fr; } }
        .card { background:#fff;border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:16px; }
        .card-head { font-size:13px;font-weight:800;color:var(--navy);margin-bottom:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
        .card-badge { font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:rgba(9,30,63,.07);color:var(--navy); }
        .card-badge-green { font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:rgba(18,183,106,.1);color:var(--success); }
        .card-desc { font-size:12px;color:var(--muted);margin-bottom:12px; }
        .card-desc code { background:var(--bg);padding:2px 6px;border-radius:4px;font-family:'IBM Plex Mono',monospace;color:var(--orange); }
        .card-legend { font-size:10px;color:var(--muted);display:flex;gap:10px;align-items:center;margin-left:auto; }
        .chart-wrap { position:relative;width:100%; }

        /* ── 업체 달성률 바 ─────────────────────────────────── */
        .company-list { display:flex;flex-direction:column;gap:10px; }
        .company-row { display:grid;grid-template-columns:90px 1fr 40px 70px;align-items:center;gap:10px; }
        .company-name { font-size:12px;font-weight:700;color:var(--navy); }
        .company-bar-wrap { height:8px;background:var(--bg);border-radius:999px;overflow:hidden; }
        .company-bar { height:100%;border-radius:999px;transition:width .4s ease; }
        .company-rate { font-size:12px;font-weight:800;text-align:right; }
        .company-nums { font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace; }

        /* ── 알림 박스 ─────────────────────────────────────── */
        .alert-box { display:flex;align-items:center;gap:16px;padding:16px 20px;background:#fff5f5;border:1.5px solid rgba(228,25,25,.2);border-radius:var(--radius);margin-bottom:16px; }
        .alert-icon { font-size:24px;flex-shrink:0; }
        .alert-title { font-size:14px;font-weight:800;color:var(--red); }
        .alert-sub { font-size:12px;color:var(--muted);margin-top:3px; }
        .alert-btn { margin-left:auto;padding:8px 16px;background:var(--red);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0; }

        /* ── 비교 카드 ─────────────────────────────────────── */
        .compare-grid { display:grid;gap:14px;margin-bottom:16px; }
        .compare-card { background:#fff;border-radius:var(--radius);padding:20px;box-shadow:var(--shadow); }
        .compare-week { font-size:18px;font-weight:900;letter-spacing:-.03em;margin-bottom:14px;font-family:'IBM Plex Mono',monospace; }
        .compare-kpis { display:flex;flex-direction:column;gap:8px; }
        .compare-kpi-row { display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line); }
        .compare-kpi-row:last-child { border-bottom:none; }
        .compare-kpi-lbl { font-size:12px;color:var(--muted);font-weight:600; }
        .compare-kpi-val { font-size:16px;font-weight:900;letter-spacing:-.02em; }
        .compare-delta { display:flex;gap:6px;margin-top:12px;flex-wrap:wrap; }
        .delta-chip { font-size:11px;font-weight:800;padding:4px 10px;border-radius:8px;font-family:'IBM Plex Mono',monospace; }

        /* ── 테이블 ────────────────────────────────────────── */
        .tbl-wrap { overflow:auto;max-height:420px; }
        .tbl { width:100%;border-collapse:collapse;font-size:12.5px; }
        .tbl th { text-align:left;padding:10px 12px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1.5px solid var(--line);background:var(--bg);position:sticky;top:0;white-space:nowrap; }
        .tbl td { padding:10px 12px;border-bottom:1px solid rgba(216,224,235,.6);vertical-align:middle; }
        .tbl tr:last-child td { border-bottom:none; }
        .tbl tr:hover td { background:rgba(9,30,63,.02); }

        .rank { display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:11px;font-weight:800;background:var(--bg);color:var(--muted); }
        .rank.top { background:rgba(251,196,0,.15);color:#B8860B; }
        .rate-badge { display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800; }
        .rate-badge.good { background:rgba(18,183,106,.1);color:var(--success); }
        .rate-badge.warn { background:rgba(247,144,9,.1);color:var(--warning); }
        .rate-badge.bad { background:rgba(228,25,25,.1);color:var(--red); }
        .bar-cell { height:8px;background:var(--bg);border-radius:999px;min-width:80px;overflow:hidden; }
        .bar-fill { height:100%;border-radius:999px;transition:width .4s; }

        /* ── 미조치 뱃지 ───────────────────────────────────── */
        .day-badge { display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;font-family:'IBM Plex Mono',monospace; }
        .day-badge.day-warn { background:rgba(247,144,9,.12);color:var(--warning); }
        .day-badge.day-bad { background:rgba(228,25,25,.12);color:var(--red); }
        .day-badge.day-crit { background:rgba(139,92,246,.12);color:#7C3AED; }
        .reason-badge { display:inline-block;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700; }
        .reason-badge.simple { background:rgba(247,144,9,.1);color:var(--warning); }
        .reason-badge.impossible { background:rgba(228,25,25,.1);color:var(--red); }

        /* ── 데이터 관리 ───────────────────────────────────── */
        .weeks-list { display:flex;flex-direction:column;gap:8px; }
        .empty-sub { color:var(--muted);font-size:13px;text-align:center;padding:24px 0; }
        .week-row { display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg); }
        .week-dot-lg { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
        .week-info { flex:1;min-width:0; }
        .week-name { font-size:13px;font-weight:800;font-family:'IBM Plex Mono',monospace; }
        .week-meta { font-size:11px;color:var(--muted);margin-top:2px; }
        .week-stats { display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted); }

        /* ── 업로드 ────────────────────────────────────────── */
        .dropzone { border:2px dashed var(--line);border-radius:var(--radius);padding:36px 20px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:12px; }
        .dropzone.drag, .dropzone:hover { border-color:var(--orange);background:rgba(255,128,33,.04); }
        .dropzone.state-done { border-color:var(--success); }
        .dropzone.state-error { border-color:var(--red); }
        .drop-inner { display:flex;flex-direction:column;align-items:center;gap:8px; }
        .drop-icon { font-size:32px; }
        .drop-inner p { color:var(--navy);font-size:14px;font-weight:600; }
        .drop-inner span { font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace; }
        .upload-msg { padding:10px 14px;border-radius:10px;font-size:13px;font-weight:600; }
        .upload-msg.done { background:rgba(18,183,106,.1);color:var(--success); }
        .upload-msg.error { background:rgba(228,25,25,.1);color:var(--red); }
        .spinner { width:28px;height:28px;border:3px solid var(--line);border-top-color:var(--orange);border-radius:50%;animation:spin .8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        /* ── 모달 ──────────────────────────────────────────── */
        .modal-overlay { position:fixed;inset:0;background:rgba(9,30,63,.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100; }
        .modal { background:#fff;border-radius:20px;padding:28px;width:520px;max-width:95vw;box-shadow:0 32px 80px rgba(9,30,63,.18); }
        .modal-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
        .modal-head h3 { font-size:17px;font-weight:900;color:var(--navy); }
        .modal-close { width:32px;height:32px;border:none;background:var(--bg);border-radius:8px;font-size:16px;cursor:pointer;color:var(--muted); }
        .modal-desc { font-size:12.5px;color:var(--muted);margin-bottom:16px;line-height:1.7; }
        .modal-desc code { background:var(--bg);padding:2px 6px;border-radius:4px;font-family:'IBM Plex Mono',monospace;color:var(--orange); }

        /* ── 빈 상태 ───────────────────────────────────────── */
        .empty-state { text-align:center;padding:80px 20px; }
        .empty-icon { font-size:52px;margin-bottom:16px; }
        .empty-state h2 { font-size:22px;font-weight:900;color:var(--navy);margin-bottom:8px; }
        .empty-state p { font-size:14px;color:var(--muted);margin-bottom:24px; }

        @media(max-width:700px){
          .main { padding:80px 16px 32px; }
          .topbar { padding:0 16px; }
          .period-tabs { display:none; }
        }
      `}</style>
    </>
  );
}
