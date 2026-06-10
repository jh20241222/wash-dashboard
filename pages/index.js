import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

const ORANGE='#FF8021', NAVY='#091E3F', RED='#E41919', GREEN='#12B76A', YELLOW='#FBC400', MUTED='#8492A5';
const WEEK_COLORS=[ORANGE,'#6366F1',GREEN,'#0EA5E9',YELLOW,RED,'#8B5CF6','#06B6D4'];
const wc=(i)=>WEEK_COLORS[i%WEEK_COLORS.length];
const wca=(i,a=0.75)=>{const h=wc(i),r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;};
const CHART={responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},color:MUTED,padding:14}},tooltip:{backgroundColor:NAVY,titleFont:{size:12},bodyFont:{size:11},padding:10,cornerRadius:8}},scales:{x:{grid:{color:'rgba(0,0,0,.05)'},ticks:{color:MUTED,font:{size:11}},border:{display:false}},y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{color:MUTED,font:{size:11}},border:{display:false},beginAtZero:true}}};

function pct(a,b){return b>0?Math.round(a/b*100):0;}
function fmt(v){return v!=null?Number(v).toLocaleString():'-';}
function dSign(v){return v>0?`+${v}`:String(v);}
function dColor(v,rev=false){if(!v)return MUTED;return(rev?v<0:v>0)?GREEN:RED;}
function dateOnly(s){return(s||'').slice(0,10);}
function dateMD(s){const d=dateOnly(s);return d?d.slice(5).replace('-','/'):'-';}
function rateCls(r){return r>=80?'badge-green':r>=60?'badge-orange':'badge-red';}

// 엑셀 다운로드
function downloadExcel(data, filename) {
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filename);
  });
}

export default function Dashboard() {
  const [menu, setMenu] = useState('dashboard');
  const [subMenu, setSubMenu] = useState('');
  const [statsMenu, setStatsMenu] = useState('company');
  const [weeks, setWeeks] = useState([]);
  const [weekData, setWeekData] = useState({});
  const [selectedWk, setSelectedWk] = useState('');
  const [compareWks, setCompareWks] = useState([]);
  const [uploadState, setUploadState] = useState('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [popup, setPopup] = useState(null);
  const [tracking, setTracking] = useState(null); // { title, rows, cols }
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(()=>{
    fetch('/api/weeks').then(r=>r.json()).then(({weeks:w})=>{
      setWeeks(w||[]);
      if(w?.length>0){
        const latest=w[w.length-1].week_label;
        setSelectedWk(latest);
        setCompareWks(w.length>=2?[w[w.length-2].week_label,latest]:[latest]);
      }
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    const toLoad=[selectedWk,...compareWks,...weeks.map(w=>w.week_label)].filter(Boolean);
    toLoad.forEach(wk=>{
      if(wk&&!weekData[wk]){
        fetch(`/api/week/${wk}`).then(r=>r.json()).then(d=>setWeekData(p=>({...p,[wk]:d}))).catch(()=>{});
      }
    });
  },[selectedWk,compareWks,weeks]);

  const onDrop = useCallback(async(files)=>{
    const file=files[0]; if(!file)return;
    setUploadState('uploading'); setUploadMsg('파일 분석 중...');
    try{
      const wm=file.name.match(/WK(\d+)/i);
      if(!wm){setUploadState('error');setUploadMsg('❌ 파일명에 WK숫자를 포함해주세요');return;}
      const weekLabel='WK'+wm[1];
      const XLSX=await import('xlsx');
      const arrayBuffer=await file.arrayBuffer();
      const wb=XLSX.read(arrayBuffer,{type:'array',cellDates:false});
      const findSheet=(kw)=>wb.SheetNames.find(n=>n.includes(kw))||'';
      const targetSheet=findSheet('세차대상');
      const washSheet=wb.SheetNames.find(n=>n.includes('세차_RAW')&&!n.includes('관리자')&&!n.includes('회원'))||'';
      if(!targetSheet||!washSheet){setUploadState('error');setUploadMsg('❌ 시트를 찾을 수 없습니다');return;}
      const targetRows=XLSX.utils.sheet_to_json(wb.Sheets[targetSheet],{defval:null});
      const washRows=XLSX.utils.sheet_to_json(wb.Sheets[washSheet],{defval:null});
      const normalize=v=>String(v||'').replace(/\s/g,'').toLowerCase();
      const over21=targetRows.filter(r=>(Number(r['세차경과일'])||0)>=21);
      const over21Count=over21.length;
      const over21Simple=over21.filter(r=>normalize(r['세차 불가 여부'])==='단순미세차').length;
      const over21Impossible=over21.filter(r=>normalize(r['세차 불가 여부']).includes('세차불가')).length;
      const totalTarget=targetRows.length;
      const avgElapsedDays=totalTarget>0?Math.round(targetRows.reduce((s,r)=>s+(Number(r['세차경과일'])||0),0)/totalTarget*10)/10:0;
      const utilizationRate=totalTarget>0?Math.round(targetRows.reduce((s,r)=>s+(Number(r['가동율(고객운행,%)'])||0),0)/totalTarget*10)/10:0;
      const excelToDate=v=>{if(!v)return null;if(typeof v==='string')return v.slice(0,10);if(typeof v==='number'){const d=new Date((v-25569)*86400*1000);return d.toISOString().slice(0,10);}return null;};
      const dailyMap={};
      for(const r of washRows){const dt=excelToDate(r['운행시작']);if(!dt)continue;dailyMap[dt]=(dailyMap[dt]||0)+1;}
      const getMonday=ds=>{const d=new Date(ds+'T00:00:00Z');const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()+(day===0?-6:1-day));return d.toISOString().slice(0,10);};
      const allDates=Object.keys(dailyMap).sort();
      const mondayCnt={};
      allDates.forEach(d=>{const m=getMonday(d);mondayCnt[m]=(mondayCnt[m]||0)+(dailyMap[d]||0);});
      const mainMonday=Object.entries(mondayCnt).sort((a,b)=>b[1]-a[1])[0]?.[0]||allDates[0];
      const mainSunday=(()=>{const d=new Date(mainMonday+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10);})();
      const daily=Object.entries(dailyMap).filter(([d])=>d>=mainMonday&&d<=mainSunday).sort().map(([date,count])=>({date,count}));
      const weekStart=daily[0]?.date||mainMonday;
      const weekEnd=daily[daily.length-1]?.date||mainSunday;
      const compTargetMap={},compElapsedMap={},compCompletedMap={},plateToCompany={};
      for(const r of targetRows){const c=r['담당업체']||'미지정';if(!c||c==='미지정')continue;compTargetMap[c]=(compTargetMap[c]||0)+1;if(!compElapsedMap[c])compElapsedMap[c]=[];compElapsedMap[c].push(Number(r['세차경과일'])||0);if(r['차량번호'])plateToCompany[r['차량번호']]=c;}
      for(const r of washRows){const c=plateToCompany[r['차량번호']]||'미지정';if(c!=='미지정')compCompletedMap[c]=(compCompletedMap[c]||0)+1;}
      const companies=Object.keys(compTargetMap).map(c=>({name:c,target:compTargetMap[c]||0,completed:compCompletedMap[c]||0,avgElapsed:compElapsedMap[c]?.length?Math.round(compElapsedMap[c].reduce((a,b)=>a+b,0)/compElapsedMap[c].length*10)/10:0})).sort((a,b)=>b.target-a.target);
      const buckets={'0-6일':0,'7-13일':0,'14-20일':0,'21일↑':0};
      for(const r of targetRows){const d=Number(r['세차경과일'])||0;if(d<7)buckets['0-6일']++;else if(d<14)buckets['7-13일']++;else if(d<21)buckets['14-20일']++;else buckets['21일↑']++;}
      const elapsed=Object.entries(buckets).map(([bucket,count])=>({bucket,count}));
      const workerMap={};
      for(const r of washRows){const wid=r['예약자(ID)'];if(!wid)continue;const s=r['운행시작'],e=r['운행종료'];const sDate=excelToDate(s),eDate=excelToDate(e);const mins=sDate&&eDate?(new Date(typeof e==='number'?(e-25569)*86400*1000:e)-new Date(typeof s==='number'?(s-25569)*86400*1000:s))/60000:null;if(!workerMap[wid])workerMap[wid]={count:0,minutes:[]};workerMap[wid].count++;if(mins!=null&&mins>0&&mins<300)workerMap[wid].minutes.push(mins);}
      const workers=Object.entries(workerMap).map(([id,v])=>({id,count:v.count,avgMinutes:v.minutes.length?Math.round(v.minutes.reduce((a,b)=>a+b,0)/v.minutes.length*10)/10:0})).sort((a,b)=>b.count-a.count);
      // 완료 차량 번호판 목록 (직전 미조치 추적용)
      const completedPlates = washRows.map(r => ({
        plate: String(r['차량번호']||''),
        workerId: String(r['예약자(ID)']||''),
        workDate: excelToDate(r['운행시작'])||'',
      })).filter(r => r.plate);

      const overdue=[];
      for(const r of over21){
        overdue.push({
          plate:String(r['차량번호']||''),model:String(r['차종명']||''),
          days:Math.floor(Number(r['세차경과일'])||0),
          region:[String(r['지역(시/도)']||''),String(r['지역(구/군)']||'')].filter(Boolean).join(' '),
          regionSi:String(r['지역(시/도)']||''),regionGu:String(r['지역(구/군)']||''),
          spot:String(r['현재스팟명']||''),company:String(r['담당업체']||''),
          reason:String(r['세차 불가 여부']||'단순미세차').replace(/\s+/g,' ').trim(),
          carryOver:String(r['기타']||'-'),
        });
      }
      overdue.sort((a,b)=>b.days-a.days);
      const data={summary:{weekLabel,weekStart,weekEnd,targetCount:totalTarget,completedCount:washRows.length,over21Count,over21Simple,over21Impossible,utilizationRate,avgElapsedDays},daily,companies,elapsed,workers,overdue,completedPlates};
      const res=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({weekLabel,data})});
      const json=await res.json();
      if(json.ok){
        setUploadState('done');setUploadMsg(`✅ ${json.weekLabel} 업로드 완료`);
        const r2=await fetch('/api/weeks');const{weeks:w2}=await r2.json();
        setWeeks(w2||[]);
        setWeekData(p=>{const n={...p};delete n[json.weekLabel];return n;});
        setSelectedWk(json.weekLabel);
        setCompareWks(p=>[...new Set([...p,json.weekLabel])].slice(-2));
        setTimeout(()=>{setShowUpload(false);setUploadState('idle');},2000);
      } else {setUploadState('error');setUploadMsg('❌ '+(json.error||'업로드 실패'));}
    }catch(e){setUploadState('error');setUploadMsg('❌ '+e.message);}
  },[]);

  const {getRootProps,getInputProps,isDragActive}=useDropzone({onDrop,accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'],'application/vnd.ms-excel':['.xls']},multiple:false});

  useEffect(()=>{
    if(!selectedWk) return;
    fetch(`/api/overdue-tracking?label=${selectedWk}`).then(r=>r.json()).then(d=>setTracking(d)).catch(()=>{});
  },[selectedWk]);

  const s=weekData[selectedWk]?.summary;
  const overdue=weekData[selectedWk]?.overdue||[];
  const companies=weekData[selectedWk]?.companies||[];
  const workers=weekData[selectedWk]?.workers||[];
  const daily=weekData[selectedWk]?.daily||[];
  const rate=s?pct(s.completed_count,s.target_count):0;

  // 지역별 집계
  const regionMap={};
  for(const v of overdue){
    const si=v.region?.split(' ')[0]||'기타';
    if(!regionMap[si])regionMap[si]={si,count:0,vehicles:[]};
    regionMap[si].count++;
    regionMap[si].vehicles.push(v);
  }
  const regions=Object.values(regionMap).sort((a,b)=>b.count-a.count);

  // 전체 주차 트렌드
  const allWkData=weeks.map(w=>({
    label:w.week_label,
    target:weekData[w.week_label]?.summary?.target_count??null,
    completed:weekData[w.week_label]?.summary?.completed_count??null,
    over21:weekData[w.week_label]?.summary?.over21_count??null,
    rate:weekData[w.week_label]?.summary?pct(weekData[w.week_label].summary.completed_count,weekData[w.week_label].summary.target_count):null,
  }));

  // 팝업 열기
  const openPopup=(title,rows,cols,filename)=>setPopup({title,rows,cols,filename});
  const closePopup=()=>setPopup(null);

  const ICONS={
    dashboard:<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/></svg>,
    compare:<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="10" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="8" y="6" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="14" y="2" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.6"/></svg>,
    stats:<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/><path d="M10 10L10 4M10 10L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
    data:<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 4h12v12H4z" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="M8 8h4M8 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  };

  const NavItem=({id,label,icon,active,onClick,indent})=>(
    <button className={`nav-btn ${active?'active':''} ${indent?'indent':''}`} onClick={onClick}>
      {!indent&&<span className="nav-icon">{icon}</span>}
      {indent&&<span className="nav-sub-dot"/>}
      <span>{label}</span>
    </button>
  );

  const Card=({title,badge,action,children,style})=>(
    <div className="card" style={style}>
      {(title||action)&&<div className="card-hd">{title&&<div className="card-title">{title}{badge&&<span className="chip chip-orange">{badge}</span>}</div>}{action}</div>}
      {children}
    </div>
  );

  const KpiCard=({label,value,sub,delta,rev,color,onClick})=>(
    <div className={`kpi-card ${onClick?'clickable':''}`} onClick={onClick}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" style={{color}}>{value}</div>
      <div className="kpi-foot">
        {sub&&<span className="kpi-sub">{sub}</span>}
        {delta!=null&&<span className="delta-chip" style={{color:dColor(delta,rev),background:dColor(delta,rev)+'18'}}>{dSign(delta)}</span>}
      </div>
    </div>
  );

  const WkDropdown=()=>{
    const [open,setOpen]=useState(false);
    return(
      <div style={{position:'relative',display:'inline-block'}}>
        <button className="wk-dropdown-btn" onClick={()=>setOpen(!open)}>
          {selectedWk||'주차 선택'} <span style={{fontSize:10}}>▼</span>
        </button>
        {open&&(
          <div className="wk-dropdown-menu">
            {weeks.map((w,i)=>(
              <button key={w.week_label} className={`wk-dropdown-item ${selectedWk===w.week_label?'active':''}`}
                onClick={()=>{setSelectedWk(w.week_label);setOpen(false);}}>
                <span className="week-dot-sm" style={{background:wc(i)}}/>
                {w.week_label}
                <span style={{marginLeft:'auto',fontSize:11,color:MUTED}}>{dateOnly(w.week_start)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Popup=()=>{
    if(!popup) return null;
    return(
      <div className="popup-overlay" onClick={closePopup}>
        <div className="popup-modal" onClick={e=>e.stopPropagation()}>
          <div className="popup-hd">
            <div>
              <div className="popup-title">{popup.title}</div>
              <div className="popup-sub">{popup.rows.length}건</div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="dl-btn" onClick={()=>downloadExcel(popup.rows.map(r=>{const obj={};popup.cols.forEach(c=>obj[c.label]=r[c.key]);return obj;}),popup.filename||'다운로드.xlsx')}>
                ⬇ 엑셀 다운로드
              </button>
              <button className="popup-close" onClick={closePopup}>✕</button>
            </div>
          </div>
          <div className="popup-body">
            <table className="tbl">
              <thead><tr>{popup.cols.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {popup.rows.map((row,i)=>(
                  <tr key={i}>
                    {popup.cols.map(c=>(
                      <td key={c.key} style={c.style?c.style(row[c.key]):{}}>
                        {c.render?c.render(row[c.key]):row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const overdueCols=[
    {key:'license_plate',label:'번호판',style:()=>({fontFamily:'monospace',fontSize:12,fontWeight:600})},
    {key:'car_model',label:'차종'},
    {key:'elapsed_days',label:'경과일',render:v=><span className={`badge ${v>=60?'badge-purple':v>=40?'badge-red':'badge-orange'}`}>{v}일</span>},
    {key:'region',label:'지역'},
    {key:'spot_name',label:'스팟',style:()=>({fontSize:11,color:MUTED,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'})},
    {key:'company_name',label:'업체'},
    {key:'reason',label:'사유',render:v=><span className={`badge ${v?.replace(/\s/g,'').includes('단순미세차')?'badge-orange':'badge-red'}`}>{v}</span>},
    {key:'carry_over',label:'이월',style:v=>v&&v!=='-'?{color:'#7C3AED',fontWeight:600}:{}},
  ];

  // prev week data for delta
  const prevWk=weeks.length>=2?weeks[weeks.findIndex(w=>w.week_label===selectedWk)-1]?.week_label:null;
  const ps=prevWk?weekData[prevWk]?.summary:null;

  return(
    <>
      <Head>
        <title>세차현황 대시보드 · TuruCAR</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet"/>
      </Head>

      {sideOpen&&<div className="backdrop" onClick={()=>setSideOpen(false)}/>}

      {/* ── 사이드바 ── */}
      <aside className={`side ${sideOpen?'open':''}`}>
        <div className="side-logo-wrap">
          <img src="/turucar-logo.png" alt="TuruCAR" className="side-logo"/>
        </div>
        <nav className="side-nav">
          <NavItem id="dashboard" label="대시보드" icon={ICONS.dashboard} active={menu==='dashboard'&&!subMenu} onClick={()=>{setMenu('dashboard');setSubMenu('');setSideOpen(false);}}/>
          <NavItem id="compare" label="주차별 비교" icon={null} active={subMenu==='compare'} onClick={()=>{setMenu('dashboard');setSubMenu('compare');setSideOpen(false);}} indent/>
          <div className="nav-section-label">통계</div>
          <NavItem id="company" label="업체별 통계" icon={null} active={menu==='stats'&&statsMenu==='company'} onClick={()=>{setMenu('stats');setStatsMenu('company');setSideOpen(false);}} indent/>
          <NavItem id="worker" label="작업자별 통계" icon={null} active={menu==='stats'&&statsMenu==='worker'} onClick={()=>{setMenu('stats');setStatsMenu('worker');setSideOpen(false);}} indent/>
          <NavItem id="region" label="지역별 통계" icon={null} active={menu==='stats'&&statsMenu==='region'} onClick={()=>{setMenu('stats');setStatsMenu('region');setSideOpen(false);}} indent/>
          <NavItem id="data" label="데이터 관리" icon={ICONS.data} active={menu==='data'} onClick={()=>{setMenu('data');setSubMenu('');setSideOpen(false);}}/>
        </nav>
      </aside>

      {/* ── 탑바 ── */}
      <header className="topbar">
        <button className="hamburger" onClick={()=>setSideOpen(!sideOpen)}>
          <svg viewBox="0 0 20 20" fill="none" width="18" height="18"><line x1="2" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="2" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
        <div className="topbar-title">
          {menu==='dashboard'&&!subMenu&&'대시보드'}
          {subMenu==='compare'&&'주차별 비교'}
          {menu==='stats'&&statsMenu==='company'&&'업체별 통계'}
          {menu==='stats'&&statsMenu==='worker'&&'작업자별 통계'}
          {menu==='stats'&&statsMenu==='region'&&'지역별 통계'}
          {menu==='data'&&'데이터 관리'}
        </div>
        <button className="upload-btn-top" style={{marginLeft:'auto'}} onClick={()=>{setShowUpload(true);setUploadState('idle');setUploadMsg('');}}>+ 주차 업로드</button>
      </header>

      {/* ── 업로드 모달 ── */}
      {showUpload&&(
        <div className="popup-overlay" onClick={()=>setShowUpload(false)}>
          <div className="popup-modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div className="popup-hd">
              <div className="popup-title">새 주차 데이터 업로드</div>
              <button className="popup-close" onClick={()=>setShowUpload(false)}>✕</button>
            </div>
            <div style={{padding:'16px 20px'}}>
              <p style={{fontSize:12,color:MUTED,marginBottom:12}}>파일명에 <code style={{background:'#F6F7F9',padding:'2px 6px',borderRadius:4,color:ORANGE}}>WK숫자</code>가 포함되면 자동 인식됩니다. 예: <code style={{background:'#F6F7F9',padding:'2px 6px',borderRadius:4,color:ORANGE}}>WK24_세차현황.xlsx</code></p>
              <div {...getRootProps()} className={`dropzone ${isDragActive?'drag':''} s-${uploadState}`}>
                <input {...getInputProps()}/>
                {uploadState==='uploading'?<div className="drop-c"><div className="spin"/><span>분석 중...</span></div>:<div className="drop-c"><div style={{fontSize:28}}>📂</div><p>Excel 파일을 드래그하거나 클릭</p><span>.xlsx · .xls</span></div>}
              </div>
              {uploadMsg&&<div className={`up-msg ${uploadState}`}>{uploadMsg}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── 팝업 ── */}
      <Popup/>

      {/* ── 메인 ── */}
      <main className="main">
        {!s&&menu!=='data'&&(
          <div className="empty">
            <div style={{fontSize:48,marginBottom:16}}>🚿</div>
            <h2>데이터가 없습니다</h2>
            <p>Excel 파일을 업로드하면 자동으로 분석됩니다</p>
            <button className="upload-btn-top" style={{marginTop:20}} onClick={()=>setShowUpload(true)}>+ 첫 번째 주차 업로드</button>
          </div>
        )}

        {/* ══ 대시보드 ══ */}
        {menu==='dashboard'&&!subMenu&&s&&(
          <>
            <div className="page-hd">
              <div>
                <h1 className="page-title">종합 현황</h1>
                <p className="page-sub">{dateOnly(s.week_start)} ~ {dateOnly(s.week_end)}</p>
              </div>
              <WkDropdown/>
            </div>

            <div className="kpi5">
              <KpiCard label="세차 대상 차량" value={`${fmt(s.target_count)}대`} color={NAVY}
                sub={ps?`이전 ${fmt(ps.target_count)}대`:null} delta={ps?s.target_count-ps.target_count:null}/>
              <KpiCard label="세차 완료" value={`${fmt(s.completed_count)}건`} color={GREEN}
                sub={ps?`이전 ${fmt(ps.completed_count)}건`:null} delta={ps?s.completed_count-ps.completed_count:null}/>
              <KpiCard label="완료율" value={`${rate}%`} color={ORANGE}
                sub={ps?`이전 ${pct(ps.completed_count,ps.target_count)}%`:null} delta={ps?rate-pct(ps.completed_count,ps.target_count):null}/>
              <KpiCard label="21일↑ 미세차" value={`${s.over21_count}대`} color={RED}
                sub={`단순 ${s.over21_simple} · 불가 ${s.over21_impossible}`}
                delta={ps?s.over21_count-ps.over21_count:null} rev
                onClick={()=>openPopup(`21일↑ 미세차 차량 · ${selectedWk}`,overdue,overdueCols,`${selectedWk}_미조치차량.xlsx`)}/>
              <KpiCard label="평균 경과일" value={`${s.avg_elapsed_days}일`} color='#F79009'
                sub={`가동율 ${s.utilization_rate}%`} delta={ps?Math.round((s.avg_elapsed_days-ps.avg_elapsed_days)*10)/10:null} rev/>
            </div>

            <div className="grid2">
              <Card title="일별 세차 완료 추이" badge={selectedWk}>
                <div style={{position:'relative',height:220}}>
                  <Bar data={{labels:daily.map(d=>dateMD(d.work_date)),datasets:[{label:'완료건수',data:daily.map(d=>d.completed_count),backgroundColor:ORANGE+'CC',borderRadius:5,borderSkipped:false}]}} options={{...CHART,plugins:{...CHART.plugins,legend:{display:false}}}}/>
                </div>
              </Card>
              <Card title="업체별 달성률">
                <div className="co-list">
                  {companies.map(c=>{
                    const r=pct(c.completed_count,c.target_count);
                    return(
                      <div key={c.company_name} className="co-row clickable" onClick={()=>openPopup(`${c.company_name} 미조치 차량 · ${selectedWk}`,overdue.filter(v=>v.company_name===c.company_name),overdueCols,`${selectedWk}_${c.company_name}_미조치.xlsx`)}>
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

            <div className="grid2">
              <Card title="21일↑ 미세차 현황">
                <div style={{display:'flex',alignItems:'center',gap:20}}>
                  <div style={{position:'relative',height:180,width:180,flexShrink:0}}>
                    <Doughnut data={{
                      labels:['단순 미세차','세차 불가','세차 불가 스팟'],
                      datasets:[{data:[s.over21_simple, s.over21_impossible, Math.max(0,s.over21_count-s.over21_simple-s.over21_impossible)],backgroundColor:['#F79009CC','#E41919CC','#7C3AEDCC'],borderWidth:0,cutout:'62%'}]
                    }} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},color:MUTED,padding:10}},tooltip:{backgroundColor:NAVY}}}}/>
                    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-60%)',textAlign:'center'}}>
                      <div style={{fontSize:22,fontWeight:900,color:RED}}>{s.over21_count}</div>
                      <div style={{fontSize:10,color:MUTED}}>대</div>
                    </div>
                  </div>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                    {[
                      {label:'단순 미세차',val:s.over21_simple,color:'#F79009',desc:'세차 가능 미완료'},
                      {label:'세차 불가',val:s.over21_impossible,color:RED,desc:'위치·차량 이슈'},
                      {label:'기타',val:Math.max(0,s.over21_count-s.over21_simple-s.over21_impossible),color:'#7C3AED',desc:'세차불가 스팟'},
                    ].map(item=>(
                      <div key={item.label} style={{cursor:'pointer'}} onClick={()=>{
                        const filtered = item.label==='단순 미세차'
                          ? overdue.filter(v=>(v.reason||'').replace(/\s/g,'').includes('단순미세차'))
                          : item.label==='세차 불가'
                          ? overdue.filter(v=>v.reason==='세차 불가')
                          : overdue.filter(v=>v.reason==='세차 불가 스팟');
                        openPopup(`${item.label} · ${selectedWk}`,filtered,overdueCols,`${selectedWk}_${item.label}.xlsx`);
                      }}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:12,fontWeight:700,color:item.color}}>{item.label}</span>
                          <span style={{fontSize:12,fontWeight:800}}>{item.val}대</span>
                        </div>
                        <div style={{height:6,background:'#F6F7F9',borderRadius:4,overflow:'hidden'}}>
                          <div style={{width:`${s.over21_count>0?Math.round(item.val/s.over21_count*100):0}%`,height:'100%',background:item.color,borderRadius:4,transition:'width .4s'}}/>
                        </div>
                        <div style={{fontSize:10,color:MUTED,marginTop:2}}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <Card title="이전 주차 대비 변화">
                {ps?(
                  <div style={{position:'relative',height:180}}>
                    <Bar data={{
                      labels:['세차대상','세차완료','21일↑','단순미세차','세차불가'],
                      datasets:[
                        {label:prevWk,data:[ps.target_count,ps.completed_count,ps.over21_count,ps.over21_simple,ps.over21_impossible],backgroundColor:NAVY+'66',borderRadius:4},
                        {label:selectedWk,data:[s.target_count,s.completed_count,s.over21_count,s.over21_simple,s.over21_impossible],backgroundColor:ORANGE+'CC',borderRadius:4},
                      ]
                    }} options={CHART}/>
                  </div>
                ):<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:180,color:MUTED,fontSize:13}}>이전 주차 데이터 없음</div>}
              </Card>
            </div>
          </>
        )}

        {/* ══ 직전 미조치 추적 카드 ══ */}
        {menu==='dashboard'&&!subMenu&&s&&tracking?.hasPrev&&(
          <Card title={`직전 ${tracking.prevLabel} 미조치 차량 · ${selectedWk} 처리 현황`}>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              {/* 요약 수치 */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,flex:1,minWidth:0}}>
                {[
                  {label:'직전 미조치',val:tracking.totalPrevOverdue+'대',color:NAVY},
                  {label:'이번 주 완료 ✓',val:tracking.completedCount+'대',color:GREEN},
                  {label:'여전히 미세차',val:tracking.stillOverdueCount+'대',color:RED},
                  {label:'완료율',val:Math.round(tracking.completedCount/tracking.totalPrevOverdue*100)+'%',color:ORANGE},
                ].map(item=>(
                  <div key={item.label} style={{background:'#F6F7F9',borderRadius:10,padding:'12px 14px'}}>
                    <div style={{fontSize:11,color:MUTED,marginBottom:6}}>{item.label}</div>
                    <div style={{fontSize:20,fontWeight:900,color:item.color}}>{item.val}</div>
                  </div>
                ))}
              </div>
              {/* 도넛 */}
              <div style={{position:'relative',height:140,width:140,flexShrink:0}}>
                <Doughnut data={{
                  labels:['완료','단순미세차','세차불가'],
                  datasets:[{data:[tracking.completedCount,tracking.stillSimple,tracking.stillImpossible],backgroundColor:[GREEN+'CC',YELLOW+'CC',RED+'CC'],borderWidth:0,cutout:'60%'}]
                }} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:NAVY}}}}/>
                <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}}>
                  <div style={{fontSize:13,fontWeight:900,color:GREEN}}>{Math.round(tracking.completedCount/tracking.totalPrevOverdue*100)}%</div>
                  <div style={{fontSize:9,color:MUTED}}>완료율</div>
                </div>
              </div>
              {/* 세부 버튼 */}
              <div style={{display:'flex',flexDirection:'column',gap:8,justifyContent:'center'}}>
                <button className="dl-btn" style={{background:'#ECFDF3',borderColor:'#12B76A',color:'#12B76A'}}
                  onClick={()=>openPopup(`${tracking.prevLabel} 미조치 → ${selectedWk} 완료 차량`,tracking.completedList,overdueCols,`${selectedWk}_직전미조치_완료.xlsx`)}>
                  ✓ 완료 {tracking.completedCount}대 보기
                </button>
                <button className="dl-btn" style={{background:'#FFF0F0',borderColor:'#E41919',color:'#E41919'}}
                  onClick={()=>openPopup(`${tracking.prevLabel} 미조치 → ${selectedWk} 여전히 미세차`,tracking.stillList,overdueCols,`${selectedWk}_직전미조치_미세차.xlsx`)}>
                  ✗ 미세차 {tracking.stillOverdueCount}대 보기
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ══ 주차별 비교 ══ */}
        {subMenu==='compare'&&(
          <>
            <div className="page-hd">
              <h1 className="page-title">주차별 비교</h1>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {weeks.map((w,i)=>(
                  <button key={w.week_label} className={`wk-pill ${compareWks.includes(w.week_label)?'active':''}`}
                    style={{'--wc':wc(i)}}
                    onClick={()=>setCompareWks(p=>p.includes(w.week_label)?p.filter(x=>x!==w.week_label):[...p,w.week_label].slice(-4))}>
                    {w.week_label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cmp-grid" style={{gridTemplateColumns:`repeat(${compareWks.length},1fr)`}}>
              {compareWks.map((wk,i)=>{
                const sd=weekData[wk]?.summary;
                const r=sd?pct(sd.completed_count,sd.target_count):0;
                const base=weekData[compareWks[0]]?.summary;
                return(
                  <div key={wk} className="cmp-card" style={{borderTop:`3px solid ${wc(i)}`}}>
                    <div className="cmp-week" style={{color:wc(i)}}>{wk}</div>
                    <div className="cmp-date">{dateOnly(sd?.week_start)} ~ {dateOnly(sd?.week_end)}</div>
                    {[['세차 대상',fmt(sd?.target_count)+'대'],['세차 완료',fmt(sd?.completed_count)+'건'],['완료율',r+'%'],['21일↑ 미세차',(sd?.over21_count??'-')+'대'],['단순 미세차',(sd?.over21_simple??'-')+'대'],['세차 불가',(sd?.over21_impossible??'-')+'대'],['평균 경과일',(sd?.avg_elapsed_days??'-')+'일'],['가동율',(sd?.utilization_rate??'-')+'%']].map(([lbl,val])=>(
                      <div key={lbl} className="cmp-row"><span className="cmp-lbl">{lbl}</span><span className="cmp-val">{val}</span></div>
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
            <Card title="주요 지표 비교">
              <div style={{position:'relative',height:280}}>
                <Bar data={{labels:['세차대상','세차완료','21일↑','단순미세차','세차불가'],datasets:compareWks.map((wk,i)=>({label:wk,data:[weekData[wk]?.summary?.target_count??0,weekData[wk]?.summary?.completed_count??0,weekData[wk]?.summary?.over21_count??0,weekData[wk]?.summary?.over21_simple??0,weekData[wk]?.summary?.over21_impossible??0],backgroundColor:wca(i),borderRadius:5}))}} options={CHART}/>
              </div>
            </Card>
            <Card title="완료율 추이">
              <div style={{position:'relative',height:240}}>
                <Line data={{labels:allWkData.map(d=>d.label),datasets:[{label:'완료율(%)',data:allWkData.map(d=>d.rate),borderColor:ORANGE,backgroundColor:ORANGE+'15',borderWidth:2.5,pointRadius:4,tension:.3,fill:true}]}} options={{...CHART,scales:{...CHART.scales,y:{...CHART.scales.y,max:100,ticks:{...CHART.scales.y.ticks,callback:v=>v+'%'}}}}}/>
              </div>
            </Card>
          </>
        )}

        {/* ══ 업체별 통계 ══ */}
        {menu==='stats'&&statsMenu==='company'&&(
          <>
            <div className="page-hd">
              <div><h1 className="page-title">업체별 통계</h1><p className="page-sub">업체 행 클릭 시 미조치 차량 목록</p></div>
              <WkDropdown/>
            </div>
            <Card title="업체별 세대 대상 vs 완료">
              <div style={{position:'relative',height:260}}>
                <Bar data={{labels:companies.map(c=>c.company_name),datasets:[{label:'세차대상',data:companies.map(c=>c.target_count),backgroundColor:NAVY+'AA',borderRadius:4},{label:'세차완료',data:companies.map(c=>c.completed_count),backgroundColor:ORANGE+'CC',borderRadius:4}]}} options={CHART}/>
              </div>
            </Card>
            <Card title="업체별 상세">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>순위</th><th>업체명</th><th>세차대상</th><th>세차완료</th><th>완료율</th><th>미조치</th><th>달성현황</th></tr></thead>
                  <tbody>
                    {companies.map((c,i)=>{
                      const r=pct(c.completed_count,c.target_count);
                      const overdueCount=overdue.filter(v=>v.company_name===c.company_name).length;
                      return(
                        <tr key={c.company_name} className="clickable" onClick={()=>openPopup(`${c.company_name} 미조치 차량 · ${selectedWk}`,overdue.filter(v=>v.company_name===c.company_name),overdueCols,`${selectedWk}_${c.company_name}_미조치.xlsx`)}>
                          <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                          <td><strong>{c.company_name}</strong></td>
                          <td>{fmt(c.target_count)}대</td>
                          <td>{fmt(c.completed_count)}건</td>
                          <td><span className={`badge ${rateCls(r)}`}>{r}%</span></td>
                          <td style={{color:overdueCount>0?RED:GREEN}}>{overdueCount}대</td>
                          <td style={{minWidth:120}}><div className="bar-cell"><div style={{width:`${r}%`,background:r>=80?GREEN:r>=60?ORANGE:RED,height:'100%',borderRadius:4}}/></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="주차별 업체 완료율 추이">
              <div style={{position:'relative',height:260}}>
                <Line data={{labels:weeks.map(w=>w.week_label),datasets:companies.map((c,i)=>({label:c.company_name,data:weeks.map(w=>{const co=weekData[w.week_label]?.companies?.find(x=>x.company_name===c.company_name);return co?pct(co.completed_count,co.target_count):null;}),borderColor:wc(i),backgroundColor:'transparent',borderWidth:2,pointRadius:4,tension:.3,spanGaps:true}))}} options={{...CHART,scales:{...CHART.scales,y:{...CHART.scales.y,max:100,ticks:{...CHART.scales.y.ticks,callback:v=>v+'%'}}}}}/>
              </div>
            </Card>
          </>
        )}

        {/* ══ 작업자별 통계 ══ */}
        {menu==='stats'&&statsMenu==='worker'&&(
          <>
            <div className="page-hd">
              <div><h1 className="page-title">작업자별 통계</h1><p className="page-sub">누적 세차 완료 건수 · 평균 작업시간</p></div>
              <WkDropdown/>
            </div>
            <Card title="완료 건수 순위 (상위 15명)">
              <div style={{position:'relative',height:320}}>
                <Bar data={{labels:workers.slice(0,15).map(w=>w.worker_id),datasets:[{label:'완료건수',data:workers.slice(0,15).map(w=>w.completed_count),backgroundColor:workers.slice(0,15).map((_,i)=>i<3?YELLOW+'CC':NAVY+'66'),borderRadius:4}]}} options={{...CHART,indexAxis:'y',plugins:{...CHART.plugins,legend:{display:false}},scales:{x:CHART.scales.x,y:{...CHART.scales.y,grid:{display:false}}}}}/>
              </div>
            </Card>
            <Card title="작업자 상세 순위">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>순위</th><th>작업자 ID</th><th>완료건수</th><th>평균 작업시간</th></tr></thead>
                  <tbody>
                    {workers.map((w,i)=>(
                      <tr key={w.worker_id}>
                        <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                        <td style={{fontFamily:'monospace',fontSize:12}}>{w.worker_id}</td>
                        <td><strong>{fmt(w.completed_count)}</strong>건</td>
                        <td>{w.avg_work_minutes>0?`${w.avg_work_minutes}분`:'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ══ 지역별 통계 ══ */}
        {menu==='stats'&&statsMenu==='region'&&(
          <>
            <div className="page-hd">
              <div><h1 className="page-title">지역별 통계</h1><p className="page-sub">21일↑ 미조치 차량 기준 · 지역 클릭 시 차량 목록</p></div>
              <WkDropdown/>
            </div>
            {overdue.length===0?<div className="empty"><p>미조치 차량이 없습니다</p></div>:(
              <>
                <Card title="지역별 미조치 차량">
                  <div style={{position:'relative',height:260}}>
                    <Bar data={{labels:regions.map(r=>r.si),datasets:[{label:'미조치 차량',data:regions.map(r=>r.count),backgroundColor:regions.map((_,i)=>i<3?RED+'CC':ORANGE+'99'),borderRadius:5}]}} options={{...CHART,plugins:{...CHART.plugins,legend:{display:false}}}}/>
                  </div>
                </Card>
                <Card title="지역별 상세">
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>순위</th><th>지역</th><th>미조치 차량</th><th>단순미세차</th><th>세차불가</th><th>이월차량</th></tr></thead>
                      <tbody>
                        {regions.map((r,i)=>{
                          const simple=r.vehicles.filter(v=>v.reason?.replace(/\s/g,'').includes('단순미세차')).length;
                          const impossible=r.vehicles.filter(v=>v.reason?.includes('세차 불가')).length;
                          const carryOver=r.vehicles.filter(v=>v.carryOver&&v.carryOver!=='-').length;
                          return(
                            <tr key={r.si} className="clickable" onClick={()=>openPopup(`${r.si} 미조치 차량 · ${selectedWk}`,r.vehicles,overdueCols,`${selectedWk}_${r.si}_미조치.xlsx`)}>
                              <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                              <td><strong>{r.si}</strong></td>
                              <td><span className="badge badge-red">{r.count}대</span></td>
                              <td style={{color:'#F79009'}}>{simple}대</td>
                              <td style={{color:RED}}>{impossible}대</td>
                              <td style={{color:'#7C3AED'}}>{carryOver}대</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}

        {/* ══ 데이터 관리 ══ */}
        {menu==='data'&&(
          <>
            <div className="page-hd"><h1 className="page-title">데이터 관리</h1></div>
            <div className="grid2">
              <Card title="새 주차 업로드">
                <p style={{fontSize:12,color:MUTED,marginBottom:12}}>파일명 예: <code style={{background:'#F6F7F9',padding:'2px 6px',borderRadius:4,color:ORANGE}}>WK24_세차현황.xlsx</code></p>
                <div {...getRootProps()} className={`dropzone ${isDragActive?'drag':''} s-${uploadState}`}>
                  <input {...getInputProps()}/>
                  {uploadState==='uploading'?<div className="drop-c"><div className="spin"/><span>분석 중...</span></div>:<div className="drop-c"><div style={{fontSize:28}}>📂</div><p>Excel 파일을 드래그하거나 클릭</p><span>.xlsx · .xls</span></div>}
                </div>
                {uploadMsg&&<div className={`up-msg ${uploadState}`}>{uploadMsg}</div>}
              </Card>
              <Card title="업로드된 주차 목록">
                {weeks.length===0?<p style={{fontSize:13,color:MUTED}}>아직 업로드된 주차가 없습니다</p>:(
                  <div className="week-list">
                    {weeks.map((w,i)=>{
                      const d=weekData[w.week_label]?.summary;
                      return(
                        <div key={w.week_label} className="week-item">
                          <span className="week-dot-sm" style={{background:wc(i)}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace'}}>{w.week_label}</div>
                            <div style={{fontSize:11,color:MUTED}}>{dateOnly(w.week_start)} ~ {dateOnly(w.week_end)}</div>
                          </div>
                          {d&&<div style={{display:'flex',gap:6,alignItems:'center',fontSize:11,color:MUTED}}>
                            <span>대상 {d.target_count}</span>
                            <span className={`badge ${rateCls(pct(d.completed_count,d.target_count))}`}>{pct(d.completed_count,d.target_count)}%</span>
                          </div>}
                          <button className="del-btn" onClick={async()=>{
                            if(!confirm(`${w.week_label} 삭제?`))return;
                            await fetch(`/api/delete-week?label=${w.week_label}`,{method:'DELETE'});
                            setWeeks(p=>p.filter(x=>x.week_label!==w.week_label));
                            setWeekData(p=>{const n={...p};delete n[w.week_label];return n;});
                            if(selectedWk===w.week_label)setSelectedWk(weeks[weeks.length-2]?.week_label||'');
                          }}>🗑</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:'NanumSquare','Apple SD Gothic Neo',sans-serif;color:#212121;background:#F6F7F9;min-height:100vh;}
        button{cursor:pointer;font:inherit;}

        .side{position:fixed;top:0;left:0;bottom:0;width:220px;z-index:70;background:#fff;border-right:1px solid #E8ECF0;display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .25s ease;overflow-y:auto;}
        .side.open{transform:translateX(0);}
        @media(min-width:1024px){.side{transform:translateX(0);}.main{margin-left:220px;}.topbar{left:220px;}}
        .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:65;}
        @media(min-width:1024px){.backdrop{display:none;}}
        .side-logo-wrap{padding:24px 20px 16px;}
        .side-logo{width:110px;height:auto;}
        .side-nav{flex:1;padding:0 12px 24px;}
        .nav-btn{display:flex;align-items:center;gap:10px;width:100%;padding:10px;border:none;background:transparent;border-radius:8px;font-size:13.5px;font-weight:700;color:#424D5C;transition:all .15s;text-align:left;}
        .nav-btn:hover{background:#F6F7F9;color:#212121;}
        .nav-btn.active{background:#FFF4EB;color:#FF8021;}
        .nav-btn.indent{padding-left:20px;font-size:13px;font-weight:600;}
        .nav-icon{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .nav-sub-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.4;flex-shrink:0;}
        .nav-section-label{font-size:10px;font-weight:800;color:#AEBBCF;letter-spacing:.08em;text-transform:uppercase;padding:12px 10px 4px;}

        .topbar{position:fixed;top:0;left:0;right:0;z-index:60;height:60px;display:flex;align-items:center;gap:12px;padding:0 20px;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid #E8ECF0;}
        .hamburger{width:34px;height:34px;border:1px solid #E8ECF0;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;}
        @media(min-width:1024px){.hamburger{display:none;}}
        .topbar-title{font-size:15px;font-weight:800;color:#091E3F;}
        .upload-btn-top{padding:8px 16px;background:linear-gradient(135deg,#FF5F00,#FF8021);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;white-space:nowrap;}

        .main{padding:76px 24px 40px;}
        .page-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap;}
        .page-title{font-size:20px;font-weight:900;color:#091E3F;}
        .page-sub{font-size:12px;color:#8492A5;margin-top:3px;}

        .kpi5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;}
        @media(max-width:1100px){.kpi5{grid-template-columns:repeat(3,1fr);}}
        @media(max-width:700px){.kpi5{grid-template-columns:repeat(2,1fr);}}
        .kpi-card{background:#fff;border-radius:14px;padding:18px;border:1px solid #E8ECF0;box-shadow:0 2px 8px rgba(9,30,63,.05);transition:transform .2s;}
        .kpi-card:hover{transform:translateY(-2px);}
        .kpi-card.clickable{cursor:pointer;}
        .kpi-card.clickable:hover{border-color:#FF8021;box-shadow:0 4px 16px rgba(255,128,33,.15);}
        .kpi-label{font-size:11px;font-weight:800;color:#8492A5;margin-bottom:8px;}
        .kpi-val{font-size:26px;font-weight:900;letter-spacing:-.04em;line-height:1;}
        .kpi-foot{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap;}
        .kpi-sub{font-size:11px;color:#8492A5;}
        .delta-chip{font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;font-family:'IBM Plex Mono',monospace;}

        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
        @media(max-width:900px){.grid2{grid-template-columns:1fr;}}
        .card{background:#fff;border-radius:14px;padding:20px;border:1px solid #E8ECF0;box-shadow:0 2px 8px rgba(9,30,63,.05);margin-bottom:16px;}
        .card-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
        .card-title{font-size:14px;font-weight:800;color:#091E3F;display:flex;align-items:center;gap:8px;}
        .chip{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;}
        .chip-orange{background:#FFF4EB;color:#FF8021;}

        .co-list{display:flex;flex-direction:column;gap:10px;}
        .co-row{display:grid;grid-template-columns:80px 1fr 44px 64px;align-items:center;gap:10px;padding:4px 6px;border-radius:8px;transition:background .15s;}
        .co-row.clickable{cursor:pointer;}
        .co-row.clickable:hover{background:#FFF4EB;}
        .co-name{font-size:12px;font-weight:700;}
        .co-bar-wrap{height:8px;background:#F6F7F9;border-radius:999px;overflow:hidden;}
        .co-bar{height:100%;border-radius:999px;transition:width .4s;}
        .co-rate{font-size:12px;font-weight:800;text-align:right;}
        .co-num{font-size:10px;color:#8492A5;font-family:'IBM Plex Mono',monospace;}

        .alert-strip{display:flex;align-items:center;gap:14px;padding:16px 20px;background:#FFF5F5;border:1.5px solid #F5C0C0;border-radius:14px;margin-bottom:16px;}
        .alert-dot{width:10px;height:10px;border-radius:50%;background:#E41919;flex-shrink:0;animation:pulse 1.5s infinite;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
        .alert-ttl{font-size:14px;font-weight:800;color:#C41818;}
        .alert-sub2{font-size:12px;color:#8492A5;margin-top:3px;}

        .cmp-grid{display:grid;gap:12px;margin-bottom:16px;}
        .cmp-card{background:#fff;border-radius:14px;padding:20px;border:1px solid #E8ECF0;}
        .cmp-week{font-size:20px;font-weight:900;font-family:'IBM Plex Mono',monospace;}
        .cmp-date{font-size:11px;color:#8492A5;margin-bottom:12px;margin-top:2px;}
        .cmp-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F0F2F5;}
        .cmp-row:last-of-type{border-bottom:none;}
        .cmp-lbl{font-size:12px;color:#6D7B8F;}
        .cmp-val{font-size:14px;font-weight:800;}
        .cmp-deltas{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}
        .cmp-d{font-size:11px;font-weight:800;padding:3px 9px;border-radius:6px;font-family:'IBM Plex Mono',monospace;}

        .wk-pill{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;font-size:12px;font-weight:700;color:#8492A5;transition:all .15s;font-family:'IBM Plex Mono',monospace;}
        .wk-pill.active{background:#FFF4EB;color:var(--wc,#FF8021);border-color:var(--wc,#FF8021);}

        .wk-dropdown-btn{padding:8px 14px;border:1px solid #E8ECF0;border-radius:10px;background:#fff;font-size:13px;font-weight:800;color:#091E3F;font-family:'IBM Plex Mono',monospace;cursor:pointer;display:flex;align-items:center;gap:6px;}
        .wk-dropdown-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #E8ECF0;border-radius:12px;box-shadow:0 8px 24px rgba(9,30,63,.12);z-index:50;min-width:200px;overflow:hidden;}
        .wk-dropdown-item{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:transparent;font-size:13px;font-weight:700;color:#424D5C;cursor:pointer;font-family:inherit;}
        .wk-dropdown-item:hover{background:#F6F7F9;}
        .wk-dropdown-item.active{background:#FFF4EB;color:#FF8021;}
        .week-dot-sm{width:8px;height:8px;border-radius:50%;flex-shrink:0;}

        .tbl-wrap{overflow:auto;}
        .tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
        .tbl th{text-align:left;padding:10px 12px;font-size:11px;font-weight:800;color:#8492A5;border-bottom:2px solid #E8ECF0;background:#FAFBFC;white-space:nowrap;}
        .tbl td{padding:10px 12px;border-bottom:1px solid #F0F2F5;vertical-align:middle;}
        .tbl tr:last-child td{border-bottom:none;}
        .tbl tr:hover td{background:#FAFBFC;}
        .tbl tr.clickable{cursor:pointer;}
        .tbl tr.clickable:hover td{background:#FFF4EB;}
        .clickable{cursor:pointer;}

        .badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;}
        .badge-green{background:#ECFDF3;color:#12B76A;}
        .badge-orange{background:#FFF4EB;color:#FF8021;}
        .badge-red{background:#FFF0F0;color:#E41919;}
        .badge-purple{background:#F5F0FF;color:#7C3AED;}
        .rank{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:11px;font-weight:800;background:#F6F7F9;color:#8492A5;}
        .rank.top{background:#FFF4EB;color:#FF8021;}
        .bar-cell{height:8px;background:#F6F7F9;border-radius:4px;overflow:hidden;}

        .popup-overlay{position:fixed;inset:0;background:rgba(9,30,63,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;}
        .popup-modal{background:#fff;border-radius:16px;width:100%;max-width:860px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(9,30,63,.18);}
        .popup-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E8ECF0;flex-shrink:0;}
        .popup-title{font-size:15px;font-weight:900;color:#091E3F;}
        .popup-sub{font-size:12px;color:#8492A5;margin-top:2px;}
        .popup-body{overflow-y:auto;flex:1;}
        .popup-close{width:30px;height:30px;border:none;background:#F6F7F9;border-radius:8px;font-size:15px;color:#6D7B8F;}
        .dl-btn{padding:7px 14px;border:1px solid #E8ECF0;border-radius:8px;background:#fff;font-size:12px;font-weight:700;color:#091E3F;display:flex;align-items:center;gap:6px;}
        .dl-btn:hover{background:#F6F7F9;}

        .week-list{display:flex;flex-direction:column;gap:8px;}
        .week-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1px solid #E8ECF0;background:#FAFBFC;}
        .del-btn{width:30px;height:30px;border:1px solid #E8ECF0;background:#fff;border-radius:8px;font-size:13px;color:#8492A5;flex-shrink:0;}
        .del-btn:hover{background:#FFF0F0;border-color:#F5C0C0;color:#E41919;}

        .dropzone{border:2px dashed #D8E0EB;border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:12px;}
        .dropzone.drag,.dropzone:hover{border-color:#FF8021;background:#FFF9F5;}
        .dropzone.s-done{border-color:#12B76A;}
        .dropzone.s-error{border-color:#E41919;}
        .drop-c{display:flex;flex-direction:column;align-items:center;gap:8px;}
        .drop-c p{color:#091E3F;font-size:14px;font-weight:700;}
        .drop-c span{font-size:11px;color:#8492A5;font-family:'IBM Plex Mono',monospace;}
        .up-msg{padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;}
        .up-msg.done{background:#ECFDF3;color:#12B76A;}
        .up-msg.error{background:#FFF0F0;color:#E41919;}
        .spin{width:26px;height:26px;border:3px solid #E8ECF0;border-top-color:#FF8021;border-radius:50%;animation:spin .8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}

        .empty{text-align:center;padding:80px 20px;}
        .empty h2{font-size:22px;font-weight:900;color:#091E3F;margin-bottom:8px;}
        .empty p{font-size:14px;color:#8492A5;}

        @media(max-width:700px){.main{padding:68px 16px 32px;}.topbar{padding:0 16px;}}
      `}</style>
    </>
  );
}
