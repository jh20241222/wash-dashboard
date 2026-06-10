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

const ORANGE = '#FF8021';
const NAVY   = '#091E3F';
const RED    = '#E41919';
const GREEN  = '#12B76A';
const YELLOW = '#FBC400';
const MUTED  = '#8492A5';
const LINE   = '#E8ECF0';
const BG     = '#F6F7F9';

const WEEK_COLORS = [ORANGE,'#6366F1',GREEN,'#0EA5E9',YELLOW,RED,'#8B5CF6','#06B6D4'];
const wc  = (i) => WEEK_COLORS[i % WEEK_COLORS.length];
const wca = (i, a=0.75) => { const h=wc(i),r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };

const CHART = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{size:11}, color:MUTED, padding:14 } }, tooltip:{ backgroundColor:NAVY, titleFont:{size:12}, bodyFont:{size:11}, padding:10, cornerRadius:8 } },
  scales:{
    x:{ grid:{color:'rgba(0,0,0,.05)'}, ticks:{color:MUTED,font:{size:11}}, border:{display:false} },
    y:{ grid:{color:'rgba(0,0,0,.05)'}, ticks:{color:MUTED,font:{size:11}}, border:{display:false}, beginAtZero:true },
  },
};

const MENUS = [
  { id:'home',    icon:'home',    label:'홈' },
  { id:'compare', icon:'chart',   label:'주차별 비교' },
  { id:'trend',   icon:'trend',   label:'트렌드 분석' },
  { id:'company', icon:'company', label:'업체별 통계' },
  { id:'worker',  icon:'worker',  label:'작업자별 통계' },
  { id:'overdue', icon:'alert',   label:'미조치 추적' },
  { id:'data',    icon:'folder',  label:'데이터 관리' },
];

const ICONS = {
  home:    <svg viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
  chart:   <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="10" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="8" y="6" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="14" y="2" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.6"/></svg>,
  trend:   <svg viewBox="0 0 20 20" fill="none"><polyline points="2,14 7,8 12,11 18,4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/><polyline points="14,4 18,4 18,8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/></svg>,
  company: <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="7" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><line x1="10" y1="11" x2="10" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  worker:  <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3 18c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  alert:   <svg viewBox="0 0 20 20" fill="none"><path d="M10 3L2 17h16L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><line x1="10" y1="9" x2="10" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="10" cy="15.5" r="0.75" fill="currentColor"/></svg>,
  folder:  <svg viewBox="0 0 20 20" fill="none"><path d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.707 5.707A1 1 0 0010.414 6H16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
};

function pct(a,b){ return b>0?Math.round(a/b*100):0; }
function fmt(v){ return v!=null?Number(v).toLocaleString():'-'; }
function dSign(v){ return v>0?`+${v}`:String(v); }
function dColor(v,rev=false){ if(!v)return MUTED; return (rev?v<0:v>0)?GREEN:RED; }
function dateOnly(s){ return (s||'').slice(0,10); }
function dateMD(s){ const d=dateOnly(s); return d?d.slice(5).replace('-','/'):'-'; }

export default function Dashboard() {
  const [menu, setMenu]   = useState('home');
  const [period, setPeriod] = useState('weekly');
  const [sideOpen, setSideOpen] = useState(false);
  const [weeks, setWeeks] = useState([]);
  const [weekData, setWeekData] = useState({});
  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [uploadState, setUploadState] = useState('idle');
  const [uploadMsg, setUploadMsg]   = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetch('/api/weeks').then(r=>r.json()).then(({weeks:w})=>{
      setWeeks(w||[]);
      if(w?.length>=2) setSelectedWeeks([w[w.length-2].week_label, w[w.length-1].week_label]);
      else if(w?.length===1) setSelectedWeeks([w[0].week_label]);
    }).catch(()=>{});
  },[]);

  useEffect(() => {
    [...selectedWeeks, ...weeks.map(w=>w.week_label)].forEach(wk=>{
      if(wk && !weekData[wk]){
        fetch(`/api/week/${wk}`).then(r=>r.json())
          .then(d=>setWeekData(p=>({...p,[wk]:d}))).catch(()=>{});
      }
    });
  },[selectedWeeks,weeks]);

  const deleteWeek = async (wk) => {
    if (!confirm(`${wk} 데이터를 삭제하시겠습니까?`)) return;
    setDeleting(wk);
    try {
      const res = await fetch(`/api/delete-week?label=${wk}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        setWeeks(p => p.filter(w => w.week_label !== wk));
        setWeekData(p => { const n={...p}; delete n[wk]; return n; });
        setSelectedWeeks(p => p.filter(x => x !== wk));
      }
    } catch(e) { alert('삭제 실패: '+e.message); }
    setDeleting(null);
  };

  const onDrop = useCallback(async(files)=>{
    const file=files[0]; if(!file)return;
    setUploadState('uploading'); setUploadMsg('파일 분석 중...');
    try{
      // 파일명에서 주차 추출
      const wm = file.name.match(/WK(\d+)/i);
      if(!wm){ setUploadState('error'); setUploadMsg('❌ 파일명에 WK숫자를 포함해주세요. 예: WK24_세차현황.xlsx'); return; }
      const weekLabel = 'WK'+wm[1];

      // 브라우저에서 직접 Excel 파싱
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });

      const findSheet = (kw) => wb.SheetNames.find(n => n.includes(kw)) || '';
      const targetSheet = findSheet('세차대상');
      const washSheet = wb.SheetNames.find(n => n.includes('세차_RAW') && !n.includes('관리자') && !n.includes('회원')) || '';

      if(!targetSheet || !washSheet){ setUploadState('error'); setUploadMsg('❌ 시트를 찾을 수 없습니다'); return; }

      const targetRows = XLSX.utils.sheet_to_json(wb.Sheets[targetSheet], { defval: null });
      const washRows   = XLSX.utils.sheet_to_json(wb.Sheets[washSheet],   { defval: null });

      // KPI 계산
      const totalTarget = targetRows.length;
      const normalize = v => String(v||'').replace(/\s/g,'').toLowerCase();
      const over21 = targetRows.filter(r => (Number(r['세차경과일'])||0) >= 21);
      const over21Count = over21.length;
      const over21Simple = over21.filter(r => normalize(r['세차 불가 여부']) === '단순미세차').length;
      const over21Impossible = over21.filter(r => normalize(r['세차 불가 여부']).includes('세차불가')).length;
      const avgElapsedDays = totalTarget>0 ? Math.round(targetRows.reduce((s,r)=>s+(Number(r['세차경과일'])||0),0)/totalTarget*10)/10 : 0;
      const utilizationRate = totalTarget>0 ? Math.round(targetRows.reduce((s,r)=>s+(Number(r['가동율(고객운행,%)'])||0),0)/totalTarget*10)/10 : 0;

      // 일별 완료
      const excelToDate = v => {
        if(!v) return null;
        if(typeof v==='string') return v.slice(0,10);
        if(typeof v==='number') { const d=new Date((v-25569)*86400*1000); return d.toISOString().slice(0,10); }
        return null;
      };
      const dailyMap = {};
      for(const r of washRows){
        const dt = excelToDate(r['운행시작']); if(!dt) continue;
        dailyMap[dt] = (dailyMap[dt]||0)+1;
      }
      // 주차 범위 필터 (월~일)
      const getMonday = ds => { const d=new Date(ds+'T00:00:00Z'); const day=d.getUTCDay(); d.setUTCDate(d.getUTCDate()+(day===0?-6:1-day)); return d.toISOString().slice(0,10); };
      const allDates = Object.keys(dailyMap).sort();
      const mondayCnt = {};
      allDates.forEach(d => { const m=getMonday(d); mondayCnt[m]=(mondayCnt[m]||0)+(dailyMap[d]||0); });
      const mainMonday = Object.entries(mondayCnt).sort((a,b)=>b[1]-a[1])[0]?.[0] || allDates[0];
      const mainSunday = (() => { const d=new Date(mainMonday+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+6); return d.toISOString().slice(0,10); })();
      const daily = Object.entries(dailyMap).filter(([d])=>d>=mainMonday&&d<=mainSunday).sort().map(([date,count])=>({date,count}));
      const weekStart = daily[0]?.date || mainMonday;
      const weekEnd   = daily[daily.length-1]?.date || mainSunday;

      // 업체별
      const compTargetMap={}, compElapsedMap={}, compCompletedMap={};
      const plateToCompany={};
      for(const r of targetRows){
        const c=r['담당업체']||'미지정'; if(!c||c==='미지정') continue;
        compTargetMap[c]=(compTargetMap[c]||0)+1;
        if(!compElapsedMap[c]) compElapsedMap[c]=[];
        compElapsedMap[c].push(Number(r['세차경과일'])||0);
        if(r['차량번호']) plateToCompany[r['차량번호']]=c;
      }
      for(const r of washRows){ const c=plateToCompany[r['차량번호']]||'미지정'; if(c!=='미지정') compCompletedMap[c]=(compCompletedMap[c]||0)+1; }
      const companies = Object.keys(compTargetMap).map(c=>({ name:c, target:compTargetMap[c]||0, completed:compCompletedMap[c]||0, avgElapsed:compElapsedMap[c]?.length?Math.round(compElapsedMap[c].reduce((a,b)=>a+b,0)/compElapsedMap[c].length*10)/10:0 })).sort((a,b)=>b.target-a.target);

      // 경과일 분포
      const buckets={'0-6일':0,'7-13일':0,'14-20일':0,'21일↑':0};
      for(const r of targetRows){ const d=Number(r['세차경과일'])||0; if(d<7)buckets['0-6일']++; else if(d<14)buckets['7-13일']++; else if(d<21)buckets['14-20일']++; else buckets['21일↑']++; }
      const elapsed = Object.entries(buckets).map(([bucket,count])=>({bucket,count}));

      // 작업자별
      const workerMap={};
      for(const r of washRows){
        const wid=r['예약자(ID)']; if(!wid) continue;
        const s=excelToDate(r['운행시작']), e=excelToDate(r['운행종료']);
        const mins = s&&e ? (new Date(r['운행종료'])-new Date(r['운행시작']))/60000 : null;
        if(!workerMap[wid]) workerMap[wid]={count:0,minutes:[]};
        workerMap[wid].count++;
        if(mins!=null&&mins>0&&mins<300) workerMap[wid].minutes.push(mins);
      }
      const workers = Object.entries(workerMap).map(([id,v])=>({ id, count:v.count, avgMinutes:v.minutes.length?Math.round(v.minutes.reduce((a,b)=>a+b,0)/v.minutes.length*10)/10:0 })).sort((a,b)=>b.count-a.count);

      // 미조치 차량
      const overdue = [];
      for(const r of over21){
        const plate=String(r['차량번호']||'');
        const model=String(r['차종명']||'');
        const days=Math.floor(Number(r['세차경과일'])||0);
        const region=[String(r['지역(시/도)']||''),String(r['지역(구/군)']||'')].filter(Boolean).join(' ');
        const spot=String(r['현재스팟명']||'');
        const company=String(r['담당업체']||'');
        const reason=String(r['세차 불가 여부']||'단순미세차').replace(/\s+/g,' ').trim();
        const carryOver=String(r['기타']||'-');
        overdue.push({plate,model,days,region,spot,company,reason,carryOver});
      }
      overdue.sort((a,b)=>b.days-a.days);

      const data = {
        summary:{ weekLabel,weekStart,weekEnd,targetCount:totalTarget,completedCount:washRows.length,over21Count,over21Simple,over21Impossible,utilizationRate,avgElapsedDays },
        daily, companies, elapsed, workers, overdue
      };

      const res=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({weekLabel,data})});
      const json=await res.json();
      if(json.ok){
        setUploadState('done');
        setUploadMsg(`✅ ${json.weekLabel} 업로드 완료 — 대상 ${json.summary.targetCount}대 / 완료 ${json.summary.completedCount}대`);
        const r2=await fetch('/api/weeks'); const {weeks:w2}=await r2.json();
        setWeeks(w2||[]);
        setWeekData(p=>{const n={...p};delete n[json.weekLabel];return n;});
        setSelectedWeeks(p=>[...new Set([...p,json.weekLabel])].slice(-2));
        setTimeout(()=>{setShowUpload(false);setUploadState('idle');},2500);
      } else { setUploadState('error'); setUploadMsg('❌ '+(json.error||'업로드 실패')); }
    }catch(e){ setUploadState('error'); setUploadMsg('❌ '+e.message); }
  },[]);

  const {getRootProps,getInputProps,isDragActive}=useDropzone({
    onDrop, accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'],'application/vnd.ms-excel':['.xls'],'text/csv':['.csv']}, multiple:false,
  });

  // 파생 데이터
  const latestWk = selectedWeeks[selectedWeeks.length-1];
  const prevWk   = selectedWeeks.length>=2 ? selectedWeeks[0] : null;
  const latest   = weekData[latestWk];
  const prev     = prevWk ? weekData[prevWk] : null;
  const s  = latest?.summary;
  const ps = prev?.summary;
  const rate  = s  ? pct(s.completed_count, s.target_count) : 0;
  const prate = ps ? pct(ps.completed_count, ps.target_count) : null;

  // 월간 집계
  const monthlyData = (() => {
    const map={};
    weeks.forEach(w=>{
      const d=weekData[w.week_label]; if(!d?.summary)return;
      const key=(w.week_start||w.week_label).slice(0,7);
      if(!map[key])map[key]={target:0,completed:0,over21:0};
      map[key].target+=d.summary.target_count;
      map[key].completed+=d.summary.completed_count;
      map[key].over21+=d.summary.over21_count;
    });
    return Object.entries(map).map(([k,v])=>({label:k,...v,rate:pct(v.completed,v.target)}));
  })();

  const allWkData = weeks.map(w=>({
    label:w.week_label,
    target:weekData[w.week_label]?.summary?.target_count??null,
    completed:weekData[w.week_label]?.summary?.completed_count??null,
    over21:weekData[w.week_label]?.summary?.over21_count??null,
    rate:weekData[w.week_label]?.summary?pct(weekData[w.week_label].summary.completed_count,weekData[w.week_label].summary.target_count):null,
  }));

  const trendSrc = period==='monthly' ? monthlyData : allWkData;

  const companyTotal=(()=>{
    const map={};
    weeks.forEach(w=>{
      (weekData[w.week_label]?.companies||[]).forEach(c=>{
        if(!map[c.company_name])map[c.company_name]={target:0,completed:0};
        map[c.company_name].target+=c.target_count;
        map[c.company_name].completed+=c.completed_count;
      });
    });
    return Object.entries(map).map(([name,v])=>({name,...v,rate:pct(v.completed,v.target)})).sort((a,b)=>b.target-a.target);
  })();

  const workerTotal=(()=>{
    const map={};
    weeks.forEach(w=>{
      (weekData[w.week_label]?.workers||[]).forEach(wk=>{
        if(!map[wk.worker_id])map[wk.worker_id]={count:0,mins:[],wks:0};
        map[wk.worker_id].count+=wk.completed_count;
        if(wk.avg_work_minutes>0)map[wk.worker_id].mins.push(wk.avg_work_minutes);
        map[wk.worker_id].wks++;
      });
    });
    return Object.entries(map).map(([id,v])=>({id,count:v.count,wks:v.wks,avgMin:v.mins.length?Math.round(v.mins.reduce((a,b)=>a+b,0)/v.mins.length*10)/10:0})).sort((a,b)=>b.count-a.count);
  })();

  const allOverdue=weeks.flatMap(w=>(weekData[w.week_label]?.overdue||[]).map(v=>({...v,week:w.week_label}))).sort((a,b)=>b.elapsed_days-a.elapsed_days);

  // 배지 색
  const rateCls = (r) => r>=80?'badge-green':r>=60?'badge-orange':'badge-red';

  // ── 공통 컴포넌트
  const PageHeader = ({title,sub})=>(
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {sub&&<p className="page-sub">{sub}</p>}
    </div>
  );

  const KpiRow = ({items})=>(
    <div className="kpi-row" style={{gridTemplateColumns:`repeat(${items.length},1fr)`}}>
      {items.map((item,i)=>(
        <div key={i} className="kpi-box">
          <div className="kpi-box-label">{item.label}</div>
          <div className="kpi-box-val" style={{color:item.color||NAVY}}>{item.value}</div>
          {item.sub&&<div className="kpi-box-sub">{item.sub}</div>}
          {item.delta!=null&&<span className="kpi-delta" style={{color:dColor(item.delta,item.rev),background:dColor(item.delta,item.rev)+'18'}}>{dSign(item.delta)}</span>}
        </div>
      ))}
    </div>
  );

  const Card = ({title,badge,children,style})=>(
    <div className="card" style={style}>
      {title&&<div className="card-title">{title}{badge&&<span className="card-badge">{badge}</span>}</div>}
      {children}
    </div>
  );

  const ChartBox = ({h=240,children})=>(<div style={{position:'relative',height:h}}>{children}</div>);

  return (
    <>
      <Head>
        <title>세차현황 대시보드 · TuruCAR</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet"/>
      </Head>

      {/* 사이드바 backdrop */}
      {sideOpen&&<div className="backdrop" onClick={()=>setSideOpen(false)}/>}

      {/* ── 사이드바 ────────────────────────────────── */}
      <aside className={`side ${sideOpen?'open':''}`}>
        {/* 로고 */}
        <div className="side-logo-wrap">
          <img src="/turucar-logo.png" alt="TuruCAR" className="side-logo"/>
        </div>

        {/* 주차 선택 */}
        {weeks.length>0&&(
          <div className="side-week-section">
            <div className="side-section-label">비교 주차 선택</div>
            {weeks.map((w,i)=>(
              <button key={w.week_label}
                className={`side-week-btn ${selectedWeeks.includes(w.week_label)?'on':''}`}
                onClick={()=>setSelectedWeeks(p=>{
                  if(p.includes(w.week_label))return p.filter(x=>x!==w.week_label);
                  return [...p,w.week_label].slice(-4);
                })}>
                <span className="week-dot-sm" style={{background:wc(i)}}/>
                <span>{w.week_label}</span>
                {selectedWeeks.includes(w.week_label)&&<span className="week-chk">✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* 메뉴 */}
        <nav className="side-nav">
          <div className="side-section-label">메뉴</div>
          {MENUS.map(m=>(
            <button key={m.id} className={`side-menu-btn ${menu===m.id?'on':''}`}
              onClick={()=>{setMenu(m.id);setSideOpen(false);}}>
              <span className="menu-icon">{ICONS[m.icon]}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </nav>

        {/* 하단 업로드 버튼 */}
        <div className="side-bottom">
          <button className="side-upload-btn" onClick={()=>{setShowUpload(true);setUploadState('idle');setUploadMsg('');}}>
            + 주차 업로드
          </button>
        </div>
      </aside>

      {/* ── 탑바 ─────────────────────────────────────── */}
      <header className="topbar">
        <button className="hamburger" onClick={()=>setSideOpen(!sideOpen)}>
          <svg viewBox="0 0 20 20" fill="none"><line x1="2" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="2" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
        <div className="topbar-menu-name">{MENUS.find(m=>m.id===menu)?.label}</div>
        <div className="topbar-right">
          <div className="period-tabs">
            {[['daily','일간'],['weekly','주간'],['monthly','월간']].map(([id,lbl])=>(
              <button key={id} className={`period-btn ${period===id?'on':''}`} onClick={()=>setPeriod(id)}>{lbl}</button>
            ))}
          </div>
          <button className="upload-btn-top" onClick={()=>{setShowUpload(true);setUploadState('idle');setUploadMsg('');}}>+ 주차 업로드</button>
        </div>
      </header>

      {/* ── 업로드 모달 ───────────────────────────────── */}
      {showUpload&&(
        <div className="modal-bg" onClick={()=>setShowUpload(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <strong>새 주차 데이터 업로드</strong>
              <button className="modal-x" onClick={()=>setShowUpload(false)}>✕</button>
            </div>
            <p className="modal-hint">파일명에 <code>WK숫자</code>가 포함되면 자동으로 주차가 인식됩니다.<br/>예: <code>WK24_세차현황.xlsx</code></p>
            <div {...getRootProps()} className={`dropzone ${isDragActive?'drag':''} s-${uploadState}`}>
              <input {...getInputProps()}/>
              {uploadState==='uploading'
                ?<div className="drop-c"><div className="spin"/><span>분석 중...</span></div>
                :<div className="drop-c"><div className="drop-ico">📂</div><p>Excel 파일을 드래그하거나 클릭</p><span>.xlsx · .xls · .csv</span></div>}
            </div>
            {uploadMsg&&<div className={`up-msg ${uploadState}`}>{uploadMsg}</div>}
          </div>
        </div>
      )}

      {/* ── 메인 ─────────────────────────────────────── */}
      <main className="main">

        {/* 빈 상태 */}
        {!s && menu!=='data' && (
          <div className="empty">
            <div style={{fontSize:48,marginBottom:16}}>🚿</div>
            <h2>데이터가 없습니다</h2>
            <p>Excel 파일을 업로드하면 자동으로 분석됩니다</p>
            <button className="upload-btn-top" style={{marginTop:20}} onClick={()=>setShowUpload(true)}>+ 첫 번째 주차 업로드</button>
          </div>
        )}

        {/* ══ 홈 ══════════════════════════════════════ */}
        {menu==='home'&&s&&(
          <>
            <PageHeader
              title={`${latestWk} 종합 현황`}
              sub={`${dateOnly(s.week_start)} ~ ${dateOnly(s.week_end)} · ${period==='daily'?'일간':period==='weekly'?'주간':'월간'} 기준`}
            />
            {/* KPI 카드 5개 */}
            <div className="kpi5">
              {[
                {label:'세차 대상 차량',val:fmt(s.target_count)+'대',sub:ps?`이전 ${fmt(ps.target_count)}대`:null,d:ps?s.target_count-ps.target_count:null,c:NAVY},
                {label:'세차 완료',val:fmt(s.completed_count)+'건',sub:ps?`이전 ${fmt(ps.completed_count)}건`:null,d:ps?s.completed_count-ps.completed_count:null,c:GREEN},
                {label:'완료율',val:rate+'%',sub:prate!=null?`이전 ${prate}%`:null,d:prate!=null?rate-prate:null,c:ORANGE},
                {label:'21일↑ 미세차',val:s.over21_count+'대',sub:`단순 ${s.over21_simple} · 불가 ${s.over21_impossible}`,d:ps?s.over21_count-ps.over21_count:null,rev:true,c:RED},
                {label:'평균 경과일',val:s.avg_elapsed_days+'일',sub:`가동율 ${s.utilization_rate}%`,d:ps?Math.round((s.avg_elapsed_days-ps.avg_elapsed_days)*10)/10:null,rev:true,c:'#F79009'},
              ].map((item,i)=>(
                <div key={i} className="kpi5-card">
                  <div className="kpi5-label">{item.label}</div>
                  <div className="kpi5-val" style={{color:item.c}}>{item.val}</div>
                  <div className="kpi5-foot">
                    {item.sub&&<span className="kpi5-sub">{item.sub}</span>}
                    {item.d!=null&&<span className="kpi5-d" style={{color:dColor(item.d,item.rev),background:dColor(item.d,item.rev)+'15'}}>{dSign(item.d)}</span>}
                  </div>
                  <div className="kpi5-bar" style={{background:item.c+'33'}}><div style={{width:item.c===GREEN?`${rate}%`:item.c===ORANGE?`${rate}%`:'100%',background:item.c,height:'100%',borderRadius:4,transition:'width .5s'}}/></div>
                </div>
              ))}
            </div>

            <div className="grid2">
              <Card title="일별 세차 완료 추이" badge={latestWk}>
                <ChartBox h={220}>
                  <Bar data={{
                    labels:(latest?.daily??[]).map(d=>dateMD(d.work_date)),
                    datasets:[{label:'완료건수',data:(latest?.daily??[]).map(d=>d.completed_count),backgroundColor:ORANGE+'CC',borderRadius:5,borderSkipped:false}],
                  }} options={{...CHART,plugins:{...CHART.plugins,legend:{display:false}}}}/>
                </ChartBox>
              </Card>
              <Card title="업체별 달성률">
                <div className="co-list">
                  {(latest?.companies??[]).map(c=>{
                    const r=pct(c.completed_count,c.target_count);
                    return(
                      <div key={c.company_name} className="co-row">
                        <div className="co-name">{c.company_name}</div>
                        <div className="co-bar-wrap"><div className="co-bar" style={{width:`${r}%`,background:r>=80?GREEN:r>=60?ORANGE:RED}}/></div>
                        <div className="co-rate" style={{color:r>=80?GREEN:r>=60?ORANGE:RED}}>{r}%</div>
                        <div className="co-num">{c.completed_count}/{c.target_count}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {s.over21_count>0&&(
              <div className="alert-strip">
                <span className="alert-dot"/>
                <div>
                  <div className="alert-ttl">21일 이상 미세차 차량 {s.over21_count}대 조치 필요</div>
                  <div className="alert-sub2">단순미세차 {s.over21_simple}대 · 세차불가 {s.over21_impossible}대 · 미조치 탭에서 상세 확인</div>
                </div>
                <button className="alert-go" onClick={()=>setMenu('overdue')}>상세 보기 →</button>
              </div>
            )}
          </>
        )}

        {/* ══ 주차별 비교 ═══════════════════════════════ */}
        {menu==='compare'&&s&&(
          <>
            <PageHeader title="주차별 비교" sub="왼쪽에서 비교할 주차를 선택하세요 (최대 4개)"/>
            <div className="cmp-grid" style={{gridTemplateColumns:`repeat(${selectedWeeks.length},1fr)`}}>
              {selectedWeeks.map((wk,i)=>{
                const sd=weekData[wk]?.summary;
                const r=sd?pct(sd.completed_count,sd.target_count):0;
                const base=weekData[selectedWeeks[0]]?.summary;
                return(
                  <div key={wk} className="cmp-card" style={{borderTop:`3px solid ${wc(i)}`}}>
                    <div className="cmp-week" style={{color:wc(i)}}>{wk}</div>
                    <div className="cmp-date">{dateOnly(sd?.week_start)} ~ {dateOnly(sd?.week_end)}</div>
                    {[['세차 대상',fmt(sd?.target_count)+'대'],['세차 완료',fmt(sd?.completed_count)+'건'],['완료율',r+'%'],['21일↑ 미세차',(sd?.over21_count??'-')+'대'],['단순 미세차',(sd?.over21_simple??'-')+'대'],['세차 불가',(sd?.over21_impossible??'-')+'대'],['평균 경과일',(sd?.avg_elapsed_days??'-')+'일'],['가동율',(sd?.utilization_rate??'-')+'%']].map(([lbl,val])=>(
                      <div key={lbl} className="cmp-row">
                        <span className="cmp-lbl">{lbl}</span>
                        <span className="cmp-val">{val}</span>
                      </div>
                    ))}
                    {i>0&&base&&sd&&(
                      <div className="cmp-deltas">
                        {[['완료',sd.completed_count-base.completed_count,false],['21일↑',sd.over21_count-base.over21_count,true]].map(([lbl,d,rev])=>(
                          <span key={lbl} className="cmp-d" style={{color:dColor(d,rev),background:dColor(d,rev)+'15'}}>{lbl} {dSign(d)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Card title="주요 지표 나란히 비교">
              <ChartBox h={280}>
                <Bar data={{
                  labels:['세차대상','세차완료','21일↑','단순미세차','세차불가'],
                  datasets:selectedWeeks.map((wk,i)=>({label:wk,data:[weekData[wk]?.summary?.target_count??0,weekData[wk]?.summary?.completed_count??0,weekData[wk]?.summary?.over21_count??0,weekData[wk]?.summary?.over21_simple??0,weekData[wk]?.summary?.over21_impossible??0],backgroundColor:wca(i),borderRadius:5})),
                }} options={CHART}/>
              </ChartBox>
            </Card>
            <Card title="일별 완료 추이 비교">
              <ChartBox h={240}>
                <Line data={{
                  labels:[...new Set(selectedWeeks.flatMap(wk=>(weekData[wk]?.daily||[]).map(d=>dateMD(d.work_date))))].sort(),
                  datasets:selectedWeeks.map((wk,i)=>{
                    const allLbls=[...new Set(selectedWeeks.flatMap(w=>(weekData[w]?.daily||[]).map(d=>dateMD(d.work_date))))].sort();
                    const map=Object.fromEntries((weekData[wk]?.daily||[]).map(d=>[dateMD(d.work_date),d.completed_count]));
                    return{label:wk,data:allLbls.map(k=>map[k]??null),borderColor:wc(i),backgroundColor:wca(i,.07),borderWidth:2.5,pointRadius:4,tension:.3,fill:true,spanGaps:false};
                  }),
                }} options={CHART}/>
              </ChartBox>
            </Card>
          </>
        )}

        {/* ══ 트렌드 분석 ═══════════════════════════════ */}
        {menu==='trend'&&s&&(
          <>
            <PageHeader title="트렌드 분석" sub={`${period==='daily'?'일간':period==='weekly'?'주간':'월간'} 단위 전체 흐름`}/>
            <Card title="세차 완료 · 대상 · 미조치 추이">
              <ChartBox h={280}>
                <Line data={{
                  labels:trendSrc.map(d=>d.label),
                  datasets:[
                    {label:'세차완료',data:trendSrc.map(d=>d.completed),borderColor:ORANGE,backgroundColor:ORANGE+'18',borderWidth:2.5,pointRadius:4,tension:.3,fill:true},
                    {label:'세차대상',data:trendSrc.map(d=>d.target),borderColor:NAVY,backgroundColor:'transparent',borderWidth:2,pointRadius:3,tension:.3,borderDash:[4,3]},
                    {label:'21일↑ 미세차',data:trendSrc.map(d=>d.over21),borderColor:RED,backgroundColor:RED+'10',borderWidth:2,pointRadius:3,tension:.3},
                  ],
                }} options={CHART}/>
              </ChartBox>
            </Card>
            <div className="grid2">
              <Card title="완료율 추이">
                <ChartBox h={220}>
                  <Bar data={{
                    labels:trendSrc.map(d=>d.label),
                    datasets:[{label:'완료율(%)',data:trendSrc.map(d=>d.rate),backgroundColor:trendSrc.map(d=>(d.rate||0)>=80?GREEN+'CC':(d.rate||0)>=60?ORANGE+'CC':RED+'CC'),borderRadius:5}],
                  }} options={{...CHART,plugins:{...CHART.plugins,legend:{display:false}}}}/>
                </ChartBox>
              </Card>
              <Card title={`${period==='monthly'?'월간':'주간'} 요약`}>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>기간</th><th>대상</th><th>완료</th><th>완료율</th><th>21일↑</th></tr></thead>
                    <tbody>
                      {trendSrc.map((row,i)=>(
                        <tr key={i}>
                          <td className="mono">{row.label}</td>
                          <td>{fmt(row.target)}</td>
                          <td>{fmt(row.completed)}</td>
                          <td><span className={`badge ${rateCls(row.rate||0)}`}>{row.rate||0}%</span></td>
                          <td style={{color:RED}}>{row.over21||0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ══ 업체별 통계 ═══════════════════════════════ */}
        {menu==='company'&&(
          <>
            <PageHeader title="업체별 통계" sub="담당 업체별 세차 성과를 비교합니다"/>
            <Card title="업체별 세차 대상 vs 완료">
              <ChartBox h={260}>
                <Bar data={{
                  labels:companyTotal.map(c=>c.name),
                  datasets:[
                    {label:'세차대상',data:companyTotal.map(c=>c.target),backgroundColor:NAVY+'AA',borderRadius:4},
                    {label:'세차완료',data:companyTotal.map(c=>c.completed),backgroundColor:ORANGE+'CC',borderRadius:4},
                  ],
                }} options={CHART}/>
              </ChartBox>
            </Card>
            <Card title="업체별 상세 통계">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>순위</th><th>업체명</th><th>세차대상</th><th>세차완료</th><th>완료율</th><th>달성현황</th></tr></thead>
                  <tbody>
                    {companyTotal.map((c,i)=>(
                      <tr key={c.name}>
                        <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                        <td><strong>{c.name}</strong></td>
                        <td>{fmt(c.target)}대</td>
                        <td>{fmt(c.completed)}건</td>
                        <td><span className={`badge ${rateCls(c.rate)}`}>{c.rate}%</span></td>
                        <td style={{minWidth:120}}>
                          <div className="bar-cell"><div style={{width:`${c.rate}%`,background:c.rate>=80?GREEN:c.rate>=60?ORANGE:RED,height:'100%',borderRadius:4,transition:'width .4s'}}/></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="주차별 업체 완료율 추이">
              <ChartBox h={260}>
                <Line data={{
                  labels:weeks.map(w=>w.week_label),
                  datasets:companyTotal.map((c,i)=>({
                    label:c.name,
                    data:weeks.map(w=>{const co=weekData[w.week_label]?.companies?.find(x=>x.company_name===c.name);return co?pct(co.completed_count,co.target_count):null;}),
                    borderColor:wc(i),backgroundColor:'transparent',borderWidth:2,pointRadius:4,tension:.3,spanGaps:true,
                  })),
                }} options={{...CHART,scales:{...CHART.scales,y:{...CHART.scales.y,max:100,ticks:{...CHART.scales.y.ticks,callback:v=>v+'%'}}}}}/>
              </ChartBox>
            </Card>
          </>
        )}

        {/* ══ 작업자별 통계 ═════════════════════════════ */}
        {menu==='worker'&&(
          <>
            <PageHeader title="작업자별 통계" sub="작업자별 누적 세차 완료 건수와 평균 작업 시간"/>
            <Card title="완료 건수 순위 (상위 15명)">
              <ChartBox h={320}>
                <Bar data={{
                  labels:workerTotal.slice(0,15).map(w=>w.id),
                  datasets:[{label:'완료건수',data:workerTotal.slice(0,15).map(w=>w.count),backgroundColor:workerTotal.slice(0,15).map((_,i)=>i<3?YELLOW+'CC':NAVY+'66'),borderRadius:4}],
                }} options={{...CHART,indexAxis:'y',plugins:{...CHART.plugins,legend:{display:false}},scales:{x:CHART.scales.x,y:{...CHART.scales.y,grid:{display:false}}}}}/>
              </ChartBox>
            </Card>
            <Card title="작업자 상세 순위">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>순위</th><th>작업자 ID</th><th>총 완료건수</th><th>평균 작업시간</th><th>참여 주차</th></tr></thead>
                  <tbody>
                    {workerTotal.map((w,i)=>(
                      <tr key={w.id}>
                        <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                        <td className="mono">{w.id}</td>
                        <td><strong>{fmt(w.count)}</strong>건</td>
                        <td>{w.avgMin>0?`${w.avgMin}분`:'-'}</td>
                        <td>{w.wks}주차</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="주차별 작업자 완료건수 추이 (상위 5명)">
              <ChartBox h={260}>
                <Line data={{
                  labels:weeks.map(w=>w.week_label),
                  datasets:workerTotal.slice(0,5).map((w,i)=>({
                    label:w.id,
                    data:weeks.map(wk=>weekData[wk.week_label]?.workers?.find(x=>x.worker_id===w.id)?.completed_count??null),
                    borderColor:wc(i),backgroundColor:'transparent',borderWidth:2,pointRadius:4,tension:.3,spanGaps:true,
                  })),
                }} options={CHART}/>
              </ChartBox>
            </Card>
          </>
        )}

        {/* ══ 미조치 추적 ═══════════════════════════════ */}
        {menu==='overdue'&&(
          <>
            <PageHeader title="미조치 추적" sub="21일 이상 세차가 이루어지지 않은 차량입니다. 경과일이 길수록 위험도가 높습니다."/>
            <div className="kpi3">
              {[
                {label:'전체 미조치 차량',val:allOverdue.length+'대',c:RED,tip:'21일 이상 세차 미완료'},
                {label:'단순 미세차',val:allOverdue.filter(v=>v.reason?.replace(/\s/g,'')?.includes('단순미세차')).length+'대',c:'#F79009',tip:'세차 가능하나 미완료'},
                {label:'세차 불가',val:allOverdue.filter(v=>v.reason?.includes('세차 불가')).length+'대',c:NAVY,tip:'위치/차량 상태로 불가'},
              ].map((item,i)=>(
                <div key={i} className="kpi3-card" style={{borderLeft:`4px solid ${item.c}`}}>
                  <div className="kpi3-label">{item.label}</div>
                  <div className="kpi3-val" style={{color:item.c}}>{item.val}</div>
                  <div className="kpi3-tip">{item.tip}</div>
                </div>
              ))}
            </div>
            <Card title="21일↑ 미조치 차량 전체 목록">
              <div className="tbl-wrap" style={{maxHeight:500}}>
                <table className="tbl">
                  <thead><tr><th>번호판</th><th>차종</th><th>경과일</th><th>지역</th><th>스팟</th><th>업체</th><th>사유</th><th>이월</th><th>주차</th></tr></thead>
                  <tbody>
                    {allOverdue.map((v,j)=>{
                      const dc=v.elapsed_days>=60?'day-crit':v.elapsed_days>=40?'day-bad':'day-warn';
                      const rc=v.reason?.replace(/\s/g,'')?.includes('단순미세차')?'badge-orange':'badge-red';
                      return(
                        <tr key={j}>
                          <td className="mono fw">{v.license_plate}</td>
                          <td>{v.car_model}</td>
                          <td><span className={`badge ${dc}`}>{v.elapsed_days}일</span></td>
                          <td>{v.region}</td>
                          <td className="spot-cell">{v.spot_name}</td>
                          <td>{v.company_name}</td>
                          <td><span className={`badge ${rc}`}>{v.reason}</span></td>
                          <td style={{color:v.carry_over!=='-'?'#7C3AED':MUTED,fontWeight:v.carry_over!=='-'?700:400}}>{v.carry_over}</td>
                          <td className="mono">{v.week}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ══ 데이터 관리 ═══════════════════════════════ */}
        {menu==='data'&&(
          <>
            <PageHeader title="데이터 관리" sub="Excel 파일을 업로드하면 자동으로 분석됩니다"/>
            <div className="grid2">
              <Card title="새 주차 업로드">
                <p className="hint-text">파일명 예: <code>WK24_세차현황.xlsx</code></p>
                <div {...getRootProps()} className={`dropzone ${isDragActive?'drag':''} s-${uploadState}`}>
                  <input {...getInputProps()}/>
                  {uploadState==='uploading'
                    ?<div className="drop-c"><div className="spin"/><span>분석 중...</span></div>
                    :<div className="drop-c"><div className="drop-ico">📂</div><p>Excel 파일을 드래그하거나 클릭</p><span>.xlsx · .xls · .csv</span></div>}
                </div>
                {uploadMsg&&<div className={`up-msg ${uploadState}`}>{uploadMsg}</div>}
              </Card>
              <Card title="업로드된 주차 목록">
                {weeks.length===0&&<p className="hint-text">아직 업로드된 주차가 없습니다</p>}
                <div className="week-list">
                  {weeks.map((w,i)=>{
                    const d=weekData[w.week_label]?.summary;
                    return(
                      <div key={w.week_label} className="week-item">
                        <span className="week-dot-sm" style={{background:wc(i)}}/>
                        <div className="week-item-info">
                          <div className="week-item-name">{w.week_label}</div>
                          <div className="week-item-date">{dateOnly(w.week_start)} ~ {dateOnly(w.week_end)}</div>
                        </div>
                        {d&&<div className="week-item-stats">
                          <span>대상 {d.target_count}</span>
                          <span>완료 {d.completed_count}</span>
                          <span className={`badge ${rateCls(pct(d.completed_count,d.target_count))}`}>{pct(d.completed_count,d.target_count)}%</span>
                        </div>}
                        <button className="del-btn" onClick={()=>deleteWeek(w.week_label)} disabled={deleting===w.week_label}>
                          {deleting===w.week_label?'..':'🗑'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        *{margin:0;padding:0;box-sizing:border-box;}
        html{font-size:14px;}
        body{font-family:'NanumSquare','Apple SD Gothic Neo',sans-serif;color:#212121;background:#F6F7F9;min-height:100vh;}
        a{color:inherit;text-decoration:none;}
        button{cursor:pointer;font:inherit;}

        /* ── 사이드바 ──────────────────────────── */
        .side{
          position:fixed;top:0;left:0;bottom:0;width:220px;z-index:70;
          background:#fff;border-right:1px solid #E8ECF0;
          display:flex;flex-direction:column;
          transform:translateX(-100%);transition:transform .25s cubic-bezier(.4,0,.2,1);
          overflow-y:auto;
        }
        .side.open{transform:translateX(0);}
        @media(min-width:1024px){.side{transform:translateX(0);} .main{margin-left:220px;} .topbar{left:220px;}}
        .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:65;}
        @media(min-width:1024px){.backdrop{display:none;}}

        .side-logo-wrap{padding:24px 20px 16px;}
        .side-logo{width:110px;height:auto;display:block;}

        .side-week-section{padding:0 12px 12px;}
        .side-section-label{font-size:10px;font-weight:800;color:#AEBBCF;letter-spacing:.08em;text-transform:uppercase;padding:8px 8px 6px;}
        .side-week-btn{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:700;color:#424D5C;transition:all .15s;font-family:inherit;}
        .side-week-btn:hover{background:#F6F7F9;}
        .side-week-btn.on{background:#FFF4EB;color:#FF8021;}
        .week-dot-sm{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .week-chk{margin-left:auto;color:#FF8021;font-size:12px;}

        .side-nav{flex:1;padding:0 12px;}
        .side-menu-btn{display:flex;align-items:center;gap:10px;width:100%;padding:10px 10px;border:none;background:transparent;border-radius:8px;font-size:13.5px;font-weight:700;color:#424D5C;transition:all .15s;font-family:inherit;text-align:left;}
        .side-menu-btn:hover{background:#F6F7F9;color:#212121;}
        .side-menu-btn.on{background:#FFF4EB;color:#FF8021;}
        .menu-icon{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .menu-icon svg{width:18px;height:18px;}

        .side-bottom{padding:16px 12px 24px;border-top:1px solid #E8ECF0;}
        .side-upload-btn{width:100%;padding:10px;background:linear-gradient(135deg,#FF5F00,#FF8021);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;font-family:inherit;}

        /* ── 탑바 ──────────────────────────────── */
        .topbar{
          position:fixed;top:0;left:0;right:0;z-index:60;height:64px;
          display:flex;align-items:center;gap:12px;padding:0 24px;
          background:rgba(255,255,255,.92);backdrop-filter:blur(16px);
          border-bottom:1px solid #E8ECF0;
        }
        .hamburger{width:36px;height:36px;border:1px solid #E8ECF0;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .hamburger svg{width:18px;height:18px;color:#424D5C;}
        @media(min-width:1024px){.hamburger{display:none;}}
        .topbar-menu-name{font-size:15px;font-weight:800;color:#091E3F;}
        .topbar-right{display:flex;align-items:center;gap:10px;margin-left:auto;}
        .period-tabs{display:flex;background:#F6F7F9;border:1px solid #E8ECF0;border-radius:10px;padding:3px;gap:2px;}
        .period-btn{padding:5px 14px;border:none;background:transparent;border-radius:7px;font-size:12.5px;font-weight:700;color:#6D7B8F;transition:all .15s;font-family:inherit;}
        .period-btn.on{background:#fff;color:#FF8021;box-shadow:0 1px 4px rgba(0,0,0,.1);}
        .upload-btn-top{padding:8px 16px;background:linear-gradient(135deg,#FF5F00,#FF8021);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;box-shadow:0 4px 12px rgba(255,128,33,.3);font-family:inherit;white-space:nowrap;}

        /* ── 메인 ──────────────────────────────── */
        .main{padding:80px 28px 40px;}
        .page-header{margin-bottom:20px;}
        .page-title{font-size:22px;font-weight:900;color:#091E3F;letter-spacing:-.03em;}
        .page-sub{font-size:12.5px;color:#6D7B8F;margin-top:4px;}

        /* ── KPI 5개 ───────────────────────────── */
        .kpi5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;}
        @media(max-width:1100px){.kpi5{grid-template-columns:repeat(3,1fr);}}
        .del-btn{width:30px;height:30px;border:1px solid #E8ECF0;background:#fff;border-radius:8px;font-size:13px;color:#8492A5;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .del-btn:hover{background:#FFF0F0;border-color:#F5C0C0;color:#E41919;}
        .del-btn:disabled{opacity:.5;}
        @media(max-width:700px){.kpi5{grid-template-columns:repeat(2,1fr);}}
        .kpi5-card{background:#fff;border-radius:14px;padding:18px;border:1px solid #E8ECF0;box-shadow:0 2px 8px rgba(9,30,63,.06);transition:transform .2s;}
        .kpi5-card:hover{transform:translateY(-2px);}
        .kpi5-label{font-size:11px;font-weight:800;color:#8492A5;margin-bottom:8px;letter-spacing:.02em;}
        .kpi5-val{font-size:26px;font-weight:900;letter-spacing:-.04em;line-height:1;}
        .kpi5-foot{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;}
        .kpi5-sub{font-size:11px;color:#8492A5;}
        .kpi5-d{font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;font-family:'IBM Plex Mono',monospace;}
        .kpi5-bar{height:4px;background:#F6F7F9;border-radius:4px;margin-top:12px;overflow:hidden;}

        /* ── KPI 3개 ───────────────────────────── */
        .kpi3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}
        .del-btn{width:30px;height:30px;border:1px solid #E8ECF0;background:#fff;border-radius:8px;font-size:13px;color:#8492A5;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .del-btn:hover{background:#FFF0F0;border-color:#F5C0C0;color:#E41919;}
        .del-btn:disabled{opacity:.5;}
        @media(max-width:700px){.kpi3{grid-template-columns:1fr;}}
        .kpi3-card{background:#fff;border-radius:14px;padding:20px;border:1px solid #E8ECF0;box-shadow:0 2px 8px rgba(9,30,63,.06);}
        .kpi3-label{font-size:11px;font-weight:800;color:#8492A5;margin-bottom:8px;}
        .kpi3-val{font-size:28px;font-weight:900;letter-spacing:-.04em;}
        .kpi3-tip{font-size:11px;color:#8492A5;margin-top:6px;}

        /* ── 카드 ──────────────────────────────── */
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
        @media(max-width:900px){.grid2{grid-template-columns:1fr;}}
        .card{background:#fff;border-radius:14px;padding:20px;border:1px solid #E8ECF0;box-shadow:0 2px 8px rgba(9,30,63,.06);margin-bottom:16px;}
        .card-title{font-size:14px;font-weight:800;color:#091E3F;margin-bottom:16px;display:flex;align-items:center;gap:8px;}
        .card-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#FFF4EB;color:#FF8021;}

        /* ── 업체 달성률 ───────────────────────── */
        .co-list{display:flex;flex-direction:column;gap:10px;}
        .co-row{display:grid;grid-template-columns:80px 1fr 44px 64px;align-items:center;gap:10px;}
        .co-name{font-size:12px;font-weight:700;}
        .co-bar-wrap{height:8px;background:#F6F7F9;border-radius:999px;overflow:hidden;}
        .co-bar{height:100%;border-radius:999px;transition:width .4s;}
        .co-rate{font-size:12px;font-weight:800;text-align:right;}
        .co-num{font-size:10px;color:#8492A5;font-family:'IBM Plex Mono',monospace;}

        /* ── 알림 ──────────────────────────────── */
        .alert-strip{display:flex;align-items:center;gap:14px;padding:16px 20px;background:#FFF5F5;border:1.5px solid #F5C0C0;border-radius:14px;margin-bottom:16px;}
        .alert-dot{width:12px;height:12px;border-radius:50%;background:#E41919;flex-shrink:0;animation:pulse 1.5s infinite;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
        .alert-ttl{font-size:14px;font-weight:800;color:#C41818;}
        .alert-sub2{font-size:12px;color:#8492A5;margin-top:3px;}
        .alert-go{margin-left:auto;padding:8px 16px;background:#E41919;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:800;flex-shrink:0;font-family:inherit;}

        /* ── 비교 카드 ─────────────────────────── */
        .cmp-grid{display:grid;gap:12px;margin-bottom:16px;}
        .cmp-card{background:#fff;border-radius:14px;padding:20px;border:1px solid #E8ECF0;box-shadow:0 2px 8px rgba(9,30,63,.06);}
        .cmp-week{font-size:20px;font-weight:900;letter-spacing:-.03em;font-family:'IBM Plex Mono',monospace;}
        .cmp-date{font-size:11px;color:#8492A5;margin-bottom:12px;margin-top:2px;}
        .cmp-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #F0F2F5;}
        .cmp-row:last-of-type{border-bottom:none;}
        .cmp-lbl{font-size:12px;color:#6D7B8F;font-weight:600;}
        .cmp-val{font-size:14px;font-weight:800;}
        .cmp-deltas{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}
        .cmp-d{font-size:11px;font-weight:800;padding:3px 9px;border-radius:6px;font-family:'IBM Plex Mono',monospace;}

        /* ── 테이블 ────────────────────────────── */
        .tbl-wrap{overflow:auto;}
        .tbl{width:100%;border-collapse:collapse;font-size:13px;}
        .tbl th{text-align:left;padding:10px 12px;font-size:11px;font-weight:800;color:#8492A5;letter-spacing:.04em;border-bottom:2px solid #E8ECF0;background:#FAFBFC;white-space:nowrap;position:sticky;top:0;}
        .tbl td{padding:10px 12px;border-bottom:1px solid #F0F2F5;vertical-align:middle;}
        .tbl tr:last-child td{border-bottom:none;}
        .tbl tr:hover td{background:#FAFBFC;}
        .mono{font-family:'IBM Plex Mono',monospace;font-size:12px;}
        .fw{font-weight:700;}
        .spot-cell{font-size:11px;color:#8492A5;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

        /* ── 뱃지 ──────────────────────────────── */
        .badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;}
        .badge-green{background:#ECFDF3;color:#12B76A;}
        .badge-orange{background:#FFF4EB;color:#FF8021;}
        .badge-red{background:#FFF0F0;color:#E41919;}
        .day-warn{background:#FFF4EB;color:#F79009;}
        .day-bad{background:#FFF0F0;color:#E41919;}
        .day-crit{background:#F5F0FF;color:#7C3AED;}
        .rank{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:11px;font-weight:800;background:#F6F7F9;color:#8492A5;}
        .rank.top{background:#FFF4EB;color:#FF8021;}
        .bar-cell{height:8px;background:#F6F7F9;border-radius:4px;overflow:hidden;}

        /* ── 데이터 관리 ───────────────────────── */
        .week-list{display:flex;flex-direction:column;gap:8px;}
        .week-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1px solid #E8ECF0;background:#FAFBFC;}
        .week-item-info{flex:1;}
        .week-item-name{font-size:13px;font-weight:800;font-family:'IBM Plex Mono',monospace;}
        .week-item-date{font-size:11px;color:#8492A5;margin-top:2px;}
        .week-item-stats{display:flex;gap:6px;align-items:center;font-size:11px;color:#8492A5;}
        .hint-text{font-size:12.5px;color:#8492A5;margin-bottom:12px;}
        .hint-text code{background:#F6F7F9;padding:2px 6px;border-radius:4px;font-family:'IBM Plex Mono',monospace;color:#FF8021;}

        /* ── 업로드 ────────────────────────────── */
        .dropzone{border:2px dashed #D8E0EB;border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:12px;}
        .dropzone.drag,.dropzone:hover{border-color:#FF8021;background:#FFF9F5;}
        .dropzone.s-done{border-color:#12B76A;}
        .dropzone.s-error{border-color:#E41919;}
        .drop-c{display:flex;flex-direction:column;align-items:center;gap:8px;}
        .drop-ico{font-size:30px;}
        .drop-c p{color:#091E3F;font-size:14px;font-weight:700;}
        .drop-c span{font-size:11px;color:#8492A5;font-family:'IBM Plex Mono',monospace;}
        .up-msg{padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;}
        .up-msg.done{background:#ECFDF3;color:#12B76A;}
        .up-msg.error{background:#FFF0F0;color:#E41919;}
        .spin{width:28px;height:28px;border:3px solid #E8ECF0;border-top-color:#FF8021;border-radius:50%;animation:spin .8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}

        /* ── 모달 ──────────────────────────────── */
        .modal-bg{position:fixed;inset:0;background:rgba(9,30,63,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;}
        .modal{background:#fff;border-radius:18px;padding:28px;width:500px;max-width:95vw;box-shadow:0 24px 60px rgba(9,30,63,.18);}
        .modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
        .modal-head strong{font-size:16px;font-weight:900;color:#091E3F;}
        .modal-x{width:30px;height:30px;border:none;background:#F6F7F9;border-radius:8px;font-size:15px;color:#6D7B8F;}
        .modal-hint{font-size:12.5px;color:#6D7B8F;margin-bottom:16px;line-height:1.7;}
        .modal-hint code{background:#F6F7F9;padding:2px 6px;border-radius:4px;font-family:'IBM Plex Mono',monospace;color:#FF8021;}

        /* ── 빈 상태 ───────────────────────────── */
        .empty{text-align:center;padding:80px 20px;}
        .empty h2{font-size:22px;font-weight:900;color:#091E3F;margin-bottom:8px;}
        .empty p{font-size:14px;color:#8492A5;}

        .del-btn{width:30px;height:30px;border:1px solid #E8ECF0;background:#fff;border-radius:8px;font-size:13px;color:#8492A5;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .del-btn:hover{background:#FFF0F0;border-color:#F5C0C0;color:#E41919;}
        .del-btn:disabled{opacity:.5;}
        @media(max-width:700px){
          .main{padding:72px 16px 32px;}
          .topbar{padding:0 16px;}
          .period-tabs{display:none;}
          .upload-btn-top{font-size:12px;padding:7px 12px;}
        }
      `}</style>
    </>
  );
}
