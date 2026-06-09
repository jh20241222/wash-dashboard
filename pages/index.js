// pages/index.js
import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, RadialLinearScale,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, RadialLinearScale,
  Tooltip, Legend, Filler
);

// ── Color palette (matches original design) ─────────────────────────
const WEEK_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7',
  '#06b6d4', '#ef4444', '#f97316', '#8b5cf6',
];
const C_RED = '#ef4444', C_GRN = '#22c55e', C_PURP = '#a855f7', C_CYAN = '#06b6d4';

function weekColor(idx) { return WEEK_COLORS[idx % WEEK_COLORS.length]; }
function weekColorAlpha(idx, a = 0.7) {
  const hex = weekColor(idx);
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

const CHART_OPTS = {
  responsive: true,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: '#94a3b8' } } },
  scales: {
    x: { grid: { color: 'rgba(34,40,64,.6)' }, ticks: { color: '#64748b' } },
    y: { grid: { color: 'rgba(34,40,64,.6)' }, ticks: { color: '#64748b' }, beginAtZero: true },
  },
};

// ═══════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [weeks, setWeeks] = useState([]);          // [{week_label, ...}]
  const [weekData, setWeekData] = useState({});    // { WK22: {...}, WK23: {...} }
  const [selectedWeeks, setSelectedWeeks] = useState([]); // max 2
  const [activeTab, setActiveTab] = useState('overview');
  const [uploadState, setUploadState] = useState('idle'); // idle | uploading | done | error
  const [uploadMsg, setUploadMsg] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  // ── Fetch weeks list ────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/weeks')
      .then(r => r.json())
      .then(({ weeks: w }) => {
        setWeeks(w || []);
        if (w && w.length >= 2) {
          setSelectedWeeks([w[w.length-2].week_label, w[w.length-1].week_label]);
        } else if (w && w.length === 1) {
          setSelectedWeeks([w[0].week_label]);
        }
      })
      .catch(() => {});
  }, []);

  // ── Fetch week detail when selection changes ────────────────────────
  useEffect(() => {
    selectedWeeks.forEach(wk => {
      if (!weekData[wk]) {
        fetch(`/api/week/${wk}`)
          .then(r => r.json())
          .then(d => setWeekData(prev => ({ ...prev, [wk]: d })))
          .catch(() => {});
      }
    });
  }, [selectedWeeks]);

  // ── Dropzone ────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploadState('uploading');
    setUploadMsg('파일 분석 중...');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (json.ok) {
        setUploadState('done');
        setUploadMsg(`✅ ${json.weekLabel} 업로드 완료 — 세차대상 ${json.summary.targetCount}대, 완료 ${json.summary.completedCount}대`);
        // Refresh weeks list & auto-select
        const r2 = await fetch('/api/weeks');
        const { weeks: w2 } = await r2.json();
        setWeeks(w2 || []);
        setWeekData(prev => {
          const next = { ...prev };
          delete next[json.weekLabel];
          return next;
        });
        setSelectedWeeks(prev => {
          const set = new Set([...prev, json.weekLabel]);
          const arr = [...set];
          return arr.slice(-2);
        });
        setTimeout(() => setShowUpload(false), 2000);
      } else {
        setUploadState('error');
        setUploadMsg('❌ ' + (json.error || '업로드 실패'));
      }
    } catch (e) {
      setUploadState('error');
      setUploadMsg('❌ 네트워크 오류: ' + e.message);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
               'application/vnd.ms-excel': ['.xls'],
               'text/csv': ['.csv'] },
    multiple: false,
  });

  // ── Derived data ────────────────────────────────────────────────────
  const wkLabels = selectedWeeks;
  const wkDataArr = wkLabels.map(wk => weekData[wk]);
  const hasData = wkDataArr.some(Boolean);

  // KPI comparison
  const kpi = (field) => wkLabels.map((wk, i) => ({
    label: wk,
    value: weekData[wk]?.summary?.[field] ?? '—',
    color: weekColor(i),
  }));

  const delta = (field) => {
    if (wkLabels.length < 2) return null;
    const a = weekData[wkLabels[0]]?.summary?.[field];
    const b = weekData[wkLabels[1]]?.summary?.[field];
    if (a == null || b == null) return null;
    return b - a;
  };

  // Daily chart
  const dailyChartData = () => {
    const allDates = [...new Set(
      wkDataArr.flatMap(d => (d?.daily || []).map(r => r.work_date))
    )].sort();
    return {
      labels: allDates.map(d => d?.slice(5)), // MM-DD
      datasets: wkLabels.map((wk, i) => {
        const map = Object.fromEntries((weekData[wk]?.daily || []).map(r => [r.work_date, r.completed_count]));
        return {
          label: wk,
          data: allDates.map(d => map[d] ?? null),
          borderColor: weekColor(i),
          backgroundColor: weekColorAlpha(i, 0.1),
          borderWidth: 2.5, pointRadius: 4,
          pointBackgroundColor: weekColor(i),
          tension: 0.3, fill: true, spanGaps: false,
        };
      }),
    };
  };

  // Company chart
  const companyChartData = () => {
    const allCompanies = [...new Set(
      wkDataArr.flatMap(d => (d?.companies || []).map(c => c.company_name))
    )];
    return {
      labels: allCompanies,
      datasets: wkLabels.map((wk, i) => {
        const map = Object.fromEntries((weekData[wk]?.companies || []).map(c => [c.company_name, c.target_count]));
        return {
          label: wk,
          data: allCompanies.map(c => map[c] ?? 0),
          backgroundColor: weekColorAlpha(i, 0.7),
          borderRadius: 4,
        };
      }),
    };
  };

  // Elapsed distribution (last selected week)
  const elapsedChartData = (wkIdx) => {
    const wk = wkLabels[wkIdx];
    const rows = weekData[wk]?.elapsed || [];
    const BUCKETS = ['0-6일','7-13일','14-20일','21일↑'];
    const map = Object.fromEntries(rows.map(r => [r.bucket, r.count]));
    return {
      labels: BUCKETS,
      datasets: [{ data: BUCKETS.map(b => map[b] ?? 0),
        backgroundColor: [C_GRN, weekColor(wkIdx), C_RED, C_PURP], borderWidth: 0 }],
    };
  };

  // Worker count chart
  const workerChartData = () => {
    const allWorkers = [...new Set(
      wkDataArr.flatMap(d => (d?.workers || []).map(w => w.worker_id))
    )].slice(0, 15);
    return {
      labels: allWorkers,
      datasets: wkLabels.map((wk, i) => {
        const map = Object.fromEntries((weekData[wk]?.workers || []).map(w => [w.worker_id, w.completed_count]));
        return {
          label: wk, data: allWorkers.map(w => map[w] ?? 0),
          backgroundColor: weekColorAlpha(i, 0.7), borderRadius: 3,
        };
      }),
    };
  };

  // Multi-week trend (all weeks, total completed)
  const trendChartData = () => ({
    labels: weeks.map(w => w.week_label),
    datasets: [
      {
        label: '세차완료',
        data: weeks.map(w => weekData[w.week_label]?.summary?.completed_count ?? null),
        borderColor: C_GRN, backgroundColor: 'rgba(34,197,94,.1)',
        borderWidth: 2.5, pointRadius: 5, tension: 0.3, fill: true,
      },
      {
        label: '세차대상',
        data: weeks.map(w => weekData[w.week_label]?.summary?.target_count ?? null),
        borderColor: C_CYAN, backgroundColor: 'rgba(6,182,212,.07)',
        borderWidth: 2, pointRadius: 4, tension: 0.3,
        borderDash: [4, 3],
      },
      {
        label: '21일↑ 미세차',
        data: weeks.map(w => weekData[w.week_label]?.summary?.over21_count ?? null),
        borderColor: C_RED, backgroundColor: 'rgba(239,68,68,.08)',
        borderWidth: 2, pointRadius: 4, tension: 0.3,
      },
    ],
  });

  // ── Render helpers ──────────────────────────────────────────────────
  const DeltaBadge = ({ value }) => {
    if (value == null) return null;
    const cls = value > 0 ? 'delta-up' : value < 0 ? 'delta-dn' : 'delta-eq';
    return <span className={`delta ${cls}`}>{value > 0 ? `+${value}` : value}</span>;
  };

  const KpiCard = ({ label, field, colorClass, format = v => v }) => {
    const vals = kpi(field);
    const d = delta(field);
    const mainVal = vals[vals.length - 1]?.value;
    return (
      <div className={`kpi ${colorClass}`}>
        <div className="kpi-lbl">{label}</div>
        <div className="kpi-val">
          {format(mainVal)} {d != null && <DeltaBadge value={d} />}
        </div>
        {vals.length > 1 && (
          <div className="kpi-sub">
            {vals.map((v, i) => (
              <span key={i} style={{ color: v.color, marginRight: 8 }}>
                {v.label} {format(v.value)}
              </span>
            ))}
          </div>
        )}
        <div className="kpi-bar" />
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  return (
    <>
      <Head>
        <title>🚿 세차현황 대시보드</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </Head>

      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-main">
          <h1>🚿 세차현황 주간 대시보드</h1>
          <p>Excel 파일 업로드 시 자동 분석 · {weeks.length}개 주차 누적</p>
        </div>
        <div className="header-right">
          {/* Week selector */}
          <div className="week-selector">
            {weeks.map((w, i) => (
              <button
                key={w.week_label}
                onClick={() => {
                  setSelectedWeeks(prev => {
                    if (prev.includes(w.week_label)) return prev.filter(x => x !== w.week_label);
                    return [...prev, w.week_label].slice(-2);
                  });
                }}
                className={`wk-pill-btn ${selectedWeeks.includes(w.week_label) ? 'active' : ''}`}
                style={{ '--wk-c': weekColor(i) }}
              >
                {w.week_label}
              </button>
            ))}
          </div>
          <button className="upload-btn" onClick={() => { setShowUpload(true); setUploadState('idle'); setUploadMsg(''); }}>
            + 주차 업로드
          </button>
        </div>
      </header>

      {/* ── Upload Modal ───────────────────────────────────────────── */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>새 주차 데이터 업로드</h2>
              <button className="modal-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <p className="modal-desc">
              파일명에 <code>WK숫자</code>가 포함되면 자동으로 주차가 인식됩니다.<br />
              예: <code>WK24_세차현황.xlsx</code>
            </p>
            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? 'active' : ''} ${uploadState}`}
            >
              <input {...getInputProps()} />
              {uploadState === 'uploading' ? (
                <div className="drop-inner">
                  <div className="spinner" /><p>분석 중...</p>
                </div>
              ) : (
                <div className="drop-inner">
                  <div className="drop-icon">📂</div>
                  <p>Excel 파일을 드래그하거나 클릭하여 선택</p>
                  <span>.xlsx · .xls · .csv</span>
                </div>
              )}
            </div>
            {uploadMsg && (
              <div className={`upload-msg ${uploadState}`}>{uploadMsg}</div>
            )}
            <div className="modal-footer">
              <details>
                <summary>Excel 시트 구조 가이드</summary>
                <div className="guide">
                  <p><b>Sheet1 (요약)</b> — A열: 항목명, B열: 값</p>
                  <table className="guide-tbl">
                    <tbody>
                      {[['주차','WK24'],['시작일','2026-06-14'],['종료일','2026-06-20'],
                        ['세차대상','2350'],['세차완료','1900'],['21일이상','80'],
                        ['단순미세차','55'],['세차불가','18'],['가동율','25.1'],['평균경과일','7.2']
                      ].map(([k,v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
                    </tbody>
                  </table>
                  <p style={{marginTop:'10px'}}><b>Sheet2 (일별)</b> — 날짜 | 완료건수</p>
                  <p><b>Sheet3 (업체)</b> — 업체명 | 대상 | 완료 | 평균경과일</p>
                  <p><b>Sheet4 (경과일)</b> — 구간 | 건수</p>
                  <p><b>Sheet5 (작업자)</b> — 작업자ID | 건수 | 평균분</p>
                  <p><b>Sheet6 (미조치)</b> — 번호판 | 차종 | 경과일 | 지역 | 스팟 | 업체 | 사유 | 이월</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <nav className="nav">
        {[
          ['overview','📊 종합 비교'],
          ['trend','📈 누적 트렌드'],
          ['elapsed','📅 경과일 분석'],
          ['worker','👤 작업자 현황'],
          ['overflow','🔁 미조치 추적'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {/* ── Content ───────────────────────────────────────────────── */}
      <main className="content">
        {!hasData && (
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚿</div>
            <h2>아직 데이터가 없습니다</h2>
            <p>우측 상단 <b>+ 주차 업로드</b> 버튼으로 Excel 파일을 업로드하면 자동으로 분석됩니다.</p>
            <button className="upload-btn" style={{ marginTop: 20 }} onClick={() => setShowUpload(true)}>
              + 첫 번째 주차 업로드
            </button>
          </div>
        )}

        {/* ══ 종합 비교 ══════════════════════════════════════════════ */}
        {activeTab === 'overview' && hasData && (
          <>
            <div className="kpi-row kpi-5">
              <KpiCard label="세차 대상 차량" field="target_count" colorClass="cyan" />
              <KpiCard label="세차 완료" field="completed_count" colorClass="green" />
              <KpiCard label="21일 이상 미세차" field="over21_count" colorClass="amber" format={v => `${v}대`} />
              <KpiCard label="단순 미세차 (21일↑)" field="over21_simple" colorClass="red" />
              <KpiCard label="세차 불가" field="over21_impossible" colorClass="purple" />
            </div>
            <div className="grid-2">
              <div className="card">
                <div className="card-title"><span className="dot" style={{ background: 'var(--wk22)' }} />일별 세차 완료건 비교</div>
                <Line data={dailyChartData()} options={CHART_OPTS} />
              </div>
              <div className="card">
                <div className="card-title"><span className="dot" style={{ background: C_CYAN }} />담당업체별 세차 대상 비교</div>
                <Bar data={companyChartData()} options={CHART_OPTS} />
              </div>
            </div>
            <div className="grid-3">
              {wkLabels.map((wk, i) => (
                <div key={wk} className="card">
                  <div className="card-title"><span className="dot" style={{ background: weekColor(i) }} />{wk} 경과일 분포</div>
                  <Doughnut data={elapsedChartData(i)} options={{ responsive: true, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: '#94a3b8' } } } }} />
                </div>
              ))}
              {wkLabels.length < 3 && <div className="card placeholder-card"><p>비교할 주차를 상단에서 추가 선택하세요</p></div>}
            </div>
          </>
        )}

        {/* ══ 누적 트렌드 ════════════════════════════════════════════ */}
        {activeTab === 'trend' && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title"><span className="dot" style={{ background: C_GRN }} />주차별 세차 현황 누적 추이</div>
              <Line data={trendChartData()} options={{ ...CHART_OPTS, scales: { ...CHART_OPTS.scales, x: { ...CHART_OPTS.scales.x, grid: { display: false } } } }} />
            </div>
            <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {weeks.map((w, i) => {
                const d = weekData[w.week_label];
                return (
                  <div key={w.week_label} className="kpi" style={{ borderTop: `3px solid ${weekColor(i)}` }}>
                    <div className="kpi-lbl" style={{ color: weekColor(i) }}>{w.week_label}</div>
                    <div className="kpi-val" style={{ color: weekColor(i), fontSize: 22 }}>
                      {d?.summary?.completed_count ?? '—'}건
                    </div>
                    <div className="kpi-sub">
                      대상 {d?.summary?.target_count ?? '—'} · 21일↑ {d?.summary?.over21_count ?? '—'}대
                    </div>
                    <div className="kpi-bar" style={{ background: weekColor(i) }} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══ 경과일 분석 ════════════════════════════════════════════ */}
        {activeTab === 'elapsed' && hasData && (
          <>
            <div className="grid-2" style={{ marginBottom: 20 }}>
              {wkLabels.map((wk, i) => (
                <div key={wk} className="compare-col" style={{ borderTop: `3px solid ${weekColor(i)}` }}>
                  <div className="col-header" style={{ color: weekColor(i) }}>{wk} · {weekData[wk]?.summary?.week_start} ~ {weekData[wk]?.summary?.week_end}</div>
                  <div style={{ padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        ['세차대상', 'target_count', 'cyan'],
                        ['세차완료', 'completed_count', 'green'],
                        ['21일↑ 미세차', 'over21_count', 'red'],
                        ['세차불가(21일↑)', 'over21_impossible', 'purple'],
                      ].map(([lbl, field, cls]) => (
                        <div key={field} className={`kpi ${cls}`} style={{ marginBottom: 0 }}>
                          <div className="kpi-lbl">{lbl}</div>
                          <div className="kpi-val">{weekData[wk]?.summary?.[field] ?? '—'}</div>
                          <div className="kpi-bar" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title"><span className="dot" style={{ background: C_CYAN }} />경과일 구간 비교</div>
              <Bar
                data={{
                  labels: ['0-6일','7-13일','14-20일','21일↑'],
                  datasets: wkLabels.map((wk, i) => {
                    const rows = weekData[wk]?.elapsed || [];
                    const map = Object.fromEntries(rows.map(r => [r.bucket, r.count]));
                    return {
                      label: wk,
                      data: ['0-6일','7-13일','14-20일','21일↑'].map(b => map[b] ?? 0),
                      backgroundColor: weekColorAlpha(i, 0.7), borderRadius: 4,
                    };
                  })
                }}
                options={CHART_OPTS}
              />
            </div>
          </>
        )}

        {/* ══ 작업자 현황 ════════════════════════════════════════════ */}
        {activeTab === 'worker' && hasData && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title"><span className="dot" style={{ background: C_PURP }} />작업자별 완료 건수 비교</div>
              <Bar
                data={workerChartData()}
                options={{ ...CHART_OPTS, indexAxis: 'y', scales: {
                  x: CHART_OPTS.scales.x,
                  y: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }
                }}}
              />
            </div>
            <div className="card">
              <div className="card-title"><span className="dot" style={{ background: C_CYAN }} />작업자별 상세</div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>작업자</th>
                      {wkLabels.map(wk => <th key={wk}>{wk} 건수</th>)}
                      {wkLabels.map(wk => <th key={wk+'t'}>{wk} 평균(분)</th>)}
                      {wkLabels.length >= 2 && <th>증감</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const allWorkers = [...new Set(wkDataArr.flatMap(d => (d?.workers||[]).map(w => w.worker_id)))];
                      return allWorkers.map(wid => {
                        const vals = wkLabels.map(wk => weekData[wk]?.workers?.find(w => w.worker_id === wid));
                        const diff = vals.length >= 2 ? (vals[1]?.completed_count ?? 0) - (vals[0]?.completed_count ?? 0) : null;
                        return (
                          <tr key={wid}>
                            <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }}>{wid}</td>
                            {vals.map((v, i) => <td key={i}>{v?.completed_count ?? '—'}건</td>)}
                            {vals.map((v, i) => <td key={i+'t'} style={{ color: '#64748b', fontSize: 11 }}>{v?.avg_work_minutes ?? '—'}분</td>)}
                            {diff != null && <td><span className={`bdg ${diff > 0 ? 'bdg-ok' : diff < 0 ? 'bdg-bad' : 'bdg-muted'}`}>{diff > 0 ? `+${diff}` : diff}</span></td>}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══ 미조치 추적 ════════════════════════════════════════════ */}
        {activeTab === 'overflow' && hasData && (
          <>
            <div className="kpi-row kpi-3" style={{ marginBottom: 20 }}>
              {wkLabels.map((wk, i) => {
                const od = weekData[wk]?.overdue || [];
                const carryOvers = od.filter(v => v.carry_over && v.carry_over !== '-').length;
                return (
                  <div key={wk} className="kpi" style={{ borderTop: `3px solid ${weekColor(i)}` }}>
                    <div className="kpi-lbl" style={{ color: weekColor(i) }}>{wk} 미조치</div>
                    <div className="kpi-val" style={{ color: weekColor(i) }}>{od.length}건</div>
                    <div className="kpi-sub">이월 차량 {carryOvers}대 포함</div>
                    <div className="kpi-bar" style={{ background: weekColor(i) }} />
                  </div>
                );
              })}
            </div>
            {wkLabels.map((wk, i) => {
              const od = weekData[wk]?.overdue || [];
              if (!od.length) return null;
              return (
                <div key={wk} className="card" style={{ marginBottom: 20 }}>
                  <div className="card-title"><span className="dot" style={{ background: weekColor(i) }} />{wk} 21일↑ 미조치 차량</div>
                  <div className="tbl-wrap" style={{ maxHeight: 360 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>번호판</th><th>차종</th><th>경과일</th><th>지역</th>
                          <th>스팟</th><th>업체</th><th>사유</th><th>이월</th>
                        </tr>
                      </thead>
                      <tbody>
                        {od.map((v, j) => {
                          const dcls = v.elapsed_days >= 60 ? 'bdg-crit' : v.elapsed_days >= 40 ? 'bdg-bad' : 'bdg-warn';
                          const rcls = v.reason === '단순미세차' ? 'bdg-warn' : 'bdg-bad';
                          return (
                            <tr key={j}>
                              <td style={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }}>{v.license_plate}</td>
                              <td style={{ fontSize: 11 }}>{v.car_model}</td>
                              <td><span className={`bdg ${dcls}`}>{v.elapsed_days}일</span></td>
                              <td style={{ fontSize: 11 }}>{v.region}</td>
                              <td style={{ fontSize: 10, color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.spot_name}</td>
                              <td style={{ fontSize: 11 }}>{v.company_name}</td>
                              <td><span className={`bdg ${rcls}`}>{v.reason}</span></td>
                              <td style={{ color: v.carry_over !== '-' ? '#a855f7' : undefined, fontWeight: v.carry_over !== '-' ? 700 : undefined }}>{v.carry_over}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>

      <style jsx global>{`
        :root {
          --bg: #0c0f1a; --panel: #111520; --card: #161b2e; --card2: #1a2038;
          --border: #222840; --border2: #2a3458;
          --wk22: #f59e0b; --wk22-dim: rgba(245,158,11,.12); --wk22-border: rgba(245,158,11,.3);
          --wk23: #3b82f6; --wk23-dim: rgba(59,130,246,.12); --wk23-border: rgba(59,130,246,.3);
          --red: #ef4444; --red-dim: rgba(239,68,68,.12);
          --green: #22c55e; --green-dim: rgba(34,197,94,.12);
          --purple: #a855f7; --cyan: #06b6d4;
          --text: #e2e8f0; --muted: #64748b; --light: #94a3b8;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:var(--bg); color:var(--text); font-family:'Noto Sans KR',sans-serif; min-height:100vh; }

        /* Header */
        .header { background:linear-gradient(135deg,#0e1425 0%,#111827 100%); border-bottom:1px solid var(--border); padding:0 40px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
        .header-main { padding:20px 0; }
        .header-main h1 { font-size:20px; font-weight:800; letter-spacing:-.5px; }
        .header-main p { font-size:11px; color:var(--muted); margin-top:4px; font-family:'IBM Plex Mono',monospace; }
        .header-right { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .week-selector { display:flex; gap:6px; flex-wrap:wrap; }
        .wk-pill-btn { padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,.1); background:transparent; color:var(--muted); font-size:12px; font-weight:700; cursor:pointer; font-family:'IBM Plex Mono',monospace; transition:all .2s; }
        .wk-pill-btn.active { background:rgba(var(--wk-c-rgb,59,130,246),.15); color:var(--wk-c,#3b82f6); border-color:var(--wk-c,#3b82f6); }
        .wk-pill-btn:hover:not(.active) { color:var(--light); border-color:var(--border2); }
        .upload-btn { padding:8px 18px; background:var(--wk23); border:none; border-radius:8px; color:#fff; font-size:13px; font-weight:700; cursor:pointer; transition:opacity .2s; white-space:nowrap; }
        .upload-btn:hover { opacity:.85; }

        /* Nav */
        .nav { background:var(--panel); border-bottom:1px solid var(--border); padding:0 40px; display:flex; overflow-x:auto; }
        .tab { padding:13px 20px; font-size:13px; font-weight:500; color:var(--muted); cursor:pointer; border:none; background:none; border-bottom:2px solid transparent; transition:all .2s; white-space:nowrap; }
        .tab.active { color:var(--wk23); border-bottom-color:var(--wk23); font-weight:700; }
        .tab:hover:not(.active) { color:var(--light); }

        /* Content */
        .content { padding:28px 40px; max-width:1440px; margin:0 auto; }
        .empty-state { text-align:center; padding:80px 20px; color:var(--muted); }
        .empty-state h2 { font-size:24px; color:var(--light); margin-bottom:12px; }

        /* KPI */
        .kpi-row { display:grid; gap:16px; margin-bottom:20px; }
        .kpi-5 { grid-template-columns:repeat(5,1fr); }
        .kpi-4 { grid-template-columns:repeat(4,1fr); }
        .kpi-3 { grid-template-columns:repeat(3,1fr); }
        .kpi { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:18px 20px 16px; position:relative; overflow:hidden; transition:transform .2s; }
        .kpi:hover { transform:translateY(-2px); }
        .kpi-lbl { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.7px; margin-bottom:10px; font-family:'IBM Plex Mono',monospace; }
        .kpi-val { font-size:26px; font-weight:900; letter-spacing:-1px; line-height:1; }
        .kpi-sub { font-size:11px; color:var(--muted); margin-top:6px; }
        .kpi-bar { position:absolute; bottom:0; left:0; right:0; height:3px; }
        .kpi.amber .kpi-val{color:var(--wk22)}.kpi.amber .kpi-bar{background:var(--wk22)}
        .kpi.blue .kpi-val{color:var(--wk23)}.kpi.blue .kpi-bar{background:var(--wk23)}
        .kpi.green .kpi-val{color:var(--green)}.kpi.green .kpi-bar{background:var(--green)}
        .kpi.red .kpi-val{color:var(--red)}.kpi.red .kpi-bar{background:var(--red)}
        .kpi.purple .kpi-val{color:var(--purple)}.kpi.purple .kpi-bar{background:var(--purple)}
        .kpi.cyan .kpi-val{color:var(--cyan)}.kpi.cyan .kpi-bar{background:var(--cyan)}

        /* Delta */
        .delta { display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; padding:2px 7px; border-radius:4px; margin-left:6px; vertical-align:middle; }
        .delta-up { background:rgba(34,197,94,.15); color:var(--green); }
        .delta-dn { background:rgba(239,68,68,.15); color:var(--red); }
        .delta-eq { background:rgba(100,116,139,.15); color:var(--muted); }

        /* Cards / grids */
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; }
        .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-bottom:20px; }
        .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:22px; }
        .placeholder-card { display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:13px; }
        .card-title { font-size:12px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.7px; margin-bottom:18px; font-family:'IBM Plex Mono',monospace; display:flex; align-items:center; gap:8px; }
        .dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        canvas { max-height:260px; }

        /* Compare cols */
        .compare-col { background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
        .col-header { padding:14px 20px 10px; font-size:11px; font-weight:700; letter-spacing:1px; font-family:'IBM Plex Mono',monospace; text-transform:uppercase; border-bottom:1px solid var(--border); }

        /* Tables */
        .tbl-wrap { overflow:auto; }
        .tbl { width:100%; border-collapse:collapse; font-size:12.5px; }
        .tbl th { text-align:left; padding:9px 12px; font-size:10px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--border2); background:rgba(255,255,255,.02); font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
        .tbl td { padding:9px 12px; border-bottom:1px solid rgba(34,40,64,.7); color:var(--text); vertical-align:middle; }
        .tbl tr:last-child td { border-bottom:none; }
        .tbl tr:hover td { background:rgba(255,255,255,.025); }

        /* Badges */
        .bdg { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10.5px; font-weight:700; font-family:'IBM Plex Mono',monospace; }
        .bdg-ok { background:var(--green-dim); color:var(--green); }
        .bdg-warn { background:rgba(245,158,11,.12); color:var(--wk22); }
        .bdg-bad { background:rgba(239,68,68,.12); color:var(--red); }
        .bdg-crit { background:rgba(168,85,247,.12); color:var(--purple); }
        .bdg-muted { background:rgba(100,116,139,.15); color:var(--muted); }

        /* Modal */
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:100; }
        .modal { background:var(--panel); border:1px solid var(--border2); border-radius:16px; padding:28px; width:540px; max-width:95vw; }
        .modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .modal-header h2 { font-size:18px; font-weight:800; }
        .modal-close { background:none; border:none; color:var(--muted); font-size:18px; cursor:pointer; padding:4px 8px; }
        .modal-close:hover { color:var(--text); }
        .modal-desc { font-size:12px; color:var(--muted); margin-bottom:16px; line-height:1.7; }
        .modal-desc code { background:var(--card); padding:2px 6px; border-radius:4px; color:var(--cyan); font-family:'IBM Plex Mono',monospace; }
        .modal-footer { margin-top:16px; }
        .modal-footer summary { font-size:12px; color:var(--muted); cursor:pointer; }
        .guide { margin-top:10px; font-size:12px; color:var(--muted); line-height:1.9; }
        .guide-tbl { margin-top:6px; border-collapse:collapse; }
        .guide-tbl td { padding:2px 12px 2px 0; }
        .guide-tbl td:first-child { color:var(--cyan); font-family:'IBM Plex Mono',monospace; font-size:11px; }

        /* Dropzone */
        .dropzone { border:2px dashed var(--border2); border-radius:12px; padding:36px 20px; text-align:center; cursor:pointer; transition:all .2s; margin-bottom:12px; }
        .dropzone.active, .dropzone:hover { border-color:var(--wk23); background:var(--wk23-dim); }
        .dropzone.done { border-color:var(--green); }
        .dropzone.error { border-color:var(--red); }
        .drop-inner { display:flex; flex-direction:column; align-items:center; gap:8px; }
        .drop-icon { font-size:32px; }
        .drop-inner p { color:var(--light); font-size:14px; }
        .drop-inner span { font-size:11px; color:var(--muted); font-family:'IBM Plex Mono',monospace; }
        .upload-msg { padding:10px 14px; border-radius:8px; font-size:13px; font-weight:600; }
        .upload-msg.done { background:var(--green-dim); color:var(--green); }
        .upload-msg.error { background:var(--red-dim); color:var(--red); }
        .spinner { width:28px; height:28px; border:3px solid var(--border2); border-top-color:var(--wk23); border-radius:50%; animation:spin 0.8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        @media(max-width:900px) {
          .header { padding:0 20px; }
          .content { padding:16px 20px; }
          .nav { padding:0 20px; }
          .kpi-5,.kpi-4,.kpi-3 { grid-template-columns:repeat(2,1fr); }
          .grid-2,.grid-3 { grid-template-columns:1fr; }
        }
      `}</style>
    </>
  );
}
