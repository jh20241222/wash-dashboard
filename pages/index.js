import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { KOREA_REGIONS, KOREA_VIEWBOX } from '../lib/koreaMap';
import { SIGUNGU_BY_SIDO } from '../lib/koreaSigungu';
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

// 시/도 원문 문자열이 실제 지도 데이터(KOREA_REGIONS)의 특정 지역과 일치하는지 판단.
// 행정구역 명칭 변경(강원도→강원특별자치도 등)이나 광주·전남 행정통합 같은 신설 명칭도 유연하게 인식.
function siMatchesRegion(siRaw, region){
  const si=String(siRaw||'');
  if(!si) return false;
  if(region.aliases.some(a=>si.includes(a))) return true;
  if((region.id==='south-jeolla'||region.id==='gwangju')&&si.includes('통합')&&si.includes('광주')&&si.includes('전남')) return true;
  return false;
}
function heatColor(ratio){ // 0~1 → 연한 오렌지~진한 레드
  const r=Math.max(0,Math.min(1,ratio||0));
  const stops=[[255,244,235],[255,171,92],[255,110,45],[228,25,25]];
  const seg=r*(stops.length-1);
  const i=Math.min(stops.length-2,Math.floor(seg));
  const t=seg-i;
  const [r1,g1,b1]=stops[i],[r2,g2,b2]=stops[i+1];
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}
// 업로드 데이터의 구/군 원문 문자열이 실제 구/군 경계 데이터(SIGUNGU_BY_SIDO)의 특정 district와 일치하는지 판단.
// "수원시"처럼 세부 구 없이 시 단위로만 기록된 경우, 해당 시에 속한 모든 세부구(수원시 장안구 등)에 매칭됨.
const normKo=s=>String(s||'').replace(/\s/g,'');
function guMatchesDistrict(guRaw, district){
  const gu=normKo(guRaw), d=normKo(district.nameKo);
  if(!gu||!d) return false;
  if(d===gu) return true;
  if(d.startsWith(gu)) return true;
  if(gu.startsWith(d)) return true;
  return false;
}

// ── 표 컬럼 정렬(오름/내림차순) 공용 유틸 ──
function useSort(initialKey=null){
  const [sort, setSort] = useState({ key: initialKey, dir: 1 });
  const onSort = (key) => setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  return [sort, onSort];
}
function sortRows(rows, sort){
  if(!sort || !sort.key) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    let va = a[key], vb = b[key];
    if(typeof va === 'string' || typeof vb === 'string'){
      return String(va ?? '').localeCompare(String(vb ?? ''), 'ko') * dir;
    }
    return ((va ?? 0) - (vb ?? 0)) * dir;
  });
}
function SortTh({ children, sortKey, sort, onSort, style }){
  const active = sort.key === sortKey;
  return (
    <th className="sortable-th" style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }} onClick={() => onSort(sortKey)}>
      {children}<span style={{ display:'inline-block', width:8, marginLeft: 2, fontSize: 8, color: active ? ORANGE : '#C7CFDA' }}>{active ? (sort.dir === 1 ? '▲' : '▼') : '⇅'}</span>
    </th>
  );
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

  // ── 지도(맵차트) 관련 상태 ──
  const [mapSnapshots, setMapSnapshots] = useState([]);
  const [mapData, setMapData] = useState({});
  const [selectedMapLabel, setSelectedMapLabel] = useState('');
  const [mapMetric, setMapMetric] = useState('count'); // count | avgElapsed | over21
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [mapTooltipPos, setMapTooltipPos] = useState({x:0,y:0});
  const [mapDrilldownSi, setMapDrilldownSi] = useState(''); // 지도 클릭 시 시/군/구 드릴다운 대상 region.id
  const [mapDrilldownGu, setMapDrilldownGu] = useState(''); // 구/군 단일 확대 대상 district.code
  const [mapUploadState, setMapUploadState] = useState('idle');
  const [mapUploadMsg, setMapUploadMsg] = useState('');
  const [showMapUpload, setShowMapUpload] = useState(false);

  // ── 각 표별 정렬 상태 (컬럼 헤더 클릭 시 오름/내림차순 토글) ──
  const [companySort, onCompanySort] = useSort();
  const [workerSort, onWorkerSort] = useSort();
  const [partnerSort, onPartnerSort] = useSort();
  const [modelSort, onModelSort] = useSort();
  const [regionSort, onRegionSort] = useSort();
  const [districtSort, onDistrictSort] = useSort();
  const [mapSiSort, onMapSiSort] = useSort();
  const [mapDrilldownSort, onMapDrilldownSort] = useSort();
  const [popupSort, onPopupSort] = useSort();

  useEffect(()=>{
    fetch('/api/map/snapshots').then(r=>r.json()).then(({snapshots})=>{
      setMapSnapshots(snapshots||[]);
      if(snapshots?.length>0) setSelectedMapLabel(snapshots[snapshots.length-1].label);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(!selectedMapLabel||mapData[selectedMapLabel]) return;
    fetch(`/api/map/${selectedMapLabel}`).then(r=>r.json()).then(d=>setMapData(p=>({...p,[selectedMapLabel]:d}))).catch(()=>{});
  },[selectedMapLabel]);

  useEffect(()=>{ setMapDrilldownSi(''); setMapDrilldownGu(''); },[selectedMapLabel]);
  useEffect(()=>{ setMapDrilldownGu(''); },[mapDrilldownSi]);

  const mapOnDrop = useCallback(async(files)=>{
    const file=files[0]; if(!file)return;
    setMapUploadState('uploading'); setMapUploadMsg('파일 분석 중...');
    try{
      const XLSX=await import('xlsx');
      const arrayBuffer=await file.arrayBuffer();
      const wb=XLSX.read(arrayBuffer,{type:'array',cellDates:false});
      const sheetName=wb.SheetNames.find(n=>n.includes('세차대상'))||wb.SheetNames[0];
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:null});
      if(!rows.length){setMapUploadState('error');setMapUploadMsg('❌ 데이터가 없습니다');return;}
      const get=(r,...keys)=>{for(const k of keys){if(r[k]!=null&&r[k]!=='')return r[k];}return null;};
      const regionMap={};
      const vehicles=[];
      let elapsedSum=0, elapsedCnt=0;
      for(const r of rows){
        const si=String(get(r,'지역(시/도)','시/도','지역시도')||'').trim();
        if(!si) continue;
        const gu=String(get(r,'지역(구/군)','구/군','지역구군')||'').trim();
        const days=Number(get(r,'세차경과일','경과일'))||0;
        const key=si+'|'+gu;
        if(!regionMap[key])regionMap[key]={si,gu,count:0,days:[],over21:0};
        regionMap[key].count++;
        regionMap[key].days.push(days);
        if(days>=21)regionMap[key].over21++;
        elapsedSum+=days; elapsedCnt++;
        vehicles.push({
          plate:String(get(r,'차량번호')||''),
          model:String(get(r,'차종명','차종')||''),
          bm:String(get(r,'운영 BM','운영BM')||''),
          si, gu,
          spot:String(get(r,'현재스팟명')||''),
          company:String(get(r,'담당업체')||''),
          partner:String(get(r,'차량소속')||''),
          days:Math.floor(days),
        });
      }
      const regions=Object.values(regionMap).map(r=>({
        si:r.si, gu:r.gu, count:r.count, over21:r.over21,
        avgElapsed:r.days.length?Math.round(r.days.reduce((a,b)=>a+b,0)/r.days.length*10)/10:0,
      })).sort((a,b)=>b.count-a.count);
      const fm=file.name.match(/(\d{6})/);
      const label=fm?fm[1]:new Date().toISOString().slice(2,10).replace(/-/g,'');
      const data={totalCount:rows.length,regions,vehicles};
      const res=await fetch('/api/map/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label,data})});
      const json=await res.json();
      if(json.ok){
        setMapUploadState('done');setMapUploadMsg(`✅ ${json.label} 지도 데이터 업로드 완료`);
        const r2=await fetch('/api/map/snapshots');const{snapshots:s2}=await r2.json();
        setMapSnapshots(s2||[]);
        setMapData(p=>{const n={...p};delete n[json.label];return n;});
        setSelectedMapLabel(json.label);
        setTimeout(()=>{setShowMapUpload(false);setMapUploadState('idle');},1800);
      } else {setMapUploadState('error');setMapUploadMsg('❌ '+(json.error||'업로드 실패'));}
    }catch(e){setMapUploadState('error');setMapUploadMsg('❌ '+e.message);}
  },[]);
  const {getRootProps:getMapRootProps,getInputProps:getMapInputProps,isDragActive:isMapDragActive}=useDropzone({onDrop:mapOnDrop,accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'],'application/vnd.ms-excel':['.xls']},multiple:false});

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
      const compTargetMap={},compElapsedMap={},compCompletedMap={},plateToCompany={},compBucket={};
      for(const r of targetRows){const c=r['담당업체']||'미지정';if(!c||c==='미지정')continue;compTargetMap[c]=(compTargetMap[c]||0)+1;if(!compElapsedMap[c])compElapsedMap[c]=[];compElapsedMap[c].push(Number(r['세차경과일'])||0);if(r['차량번호'])plateToCompany[r['차량번호']]=c;
        if(!compBucket[c])compBucket[c]={b0:0,b7:0,b14:0,b21:0};
        const d=Number(r['세차경과일'])||0;
        if(d<7)compBucket[c].b0++;else if(d<14)compBucket[c].b7++;else if(d<21)compBucket[c].b14++;else compBucket[c].b21++;
      }
      for(const r of washRows){const c=plateToCompany[r['차량번호']]||'미지정';if(c!=='미지정')compCompletedMap[c]=(compCompletedMap[c]||0)+1;}
      const companies=Object.keys(compTargetMap).map(c=>({name:c,target:compTargetMap[c]||0,completed:compCompletedMap[c]||0,avgElapsed:compElapsedMap[c]?.length?Math.round(compElapsedMap[c].reduce((a,b)=>a+b,0)/compElapsedMap[c].length*10)/10:0,bucket0_6:compBucket[c]?.b0||0,bucket7_13:compBucket[c]?.b7||0,bucket14_20:compBucket[c]?.b14||0,bucket21Plus:compBucket[c]?.b21||0})).sort((a,b)=>b.target-a.target);
      const buckets={'0-6일':0,'7-13일':0,'14-20일':0,'21일↑':0};
      for(const r of targetRows){const d=Number(r['세차경과일'])||0;if(d<7)buckets['0-6일']++;else if(d<14)buckets['7-13일']++;else if(d<21)buckets['14-20일']++;else buckets['21일↑']++;}
      const elapsed=Object.entries(buckets).map(([bucket,count])=>({bucket,count}));

      // ── 제휴사(차량소속)별 통계 ──
      const partnerTargetMap={},partnerElapsedMap={},partnerCompletedMap={},partnerOver21Map={},plateToPartner={};
      for(const r of targetRows){const p=String(r['차량소속']||'미지정');if(!p||p==='미지정')continue;partnerTargetMap[p]=(partnerTargetMap[p]||0)+1;if(!partnerElapsedMap[p])partnerElapsedMap[p]=[];partnerElapsedMap[p].push(Number(r['세차경과일'])||0);if(r['차량번호'])plateToPartner[r['차량번호']]=p;if((Number(r['세차경과일'])||0)>=21)partnerOver21Map[p]=(partnerOver21Map[p]||0)+1;}
      for(const r of washRows){const p=String(r['차량소속']||'')||plateToPartner[r['차량번호']]||'미지정';if(p!=='미지정')partnerCompletedMap[p]=(partnerCompletedMap[p]||0)+1;}
      const partners=Object.keys(partnerTargetMap).map(p=>({name:p,target:partnerTargetMap[p]||0,completed:partnerCompletedMap[p]||0,avgElapsed:partnerElapsedMap[p]?.length?Math.round(partnerElapsedMap[p].reduce((a,b)=>a+b,0)/partnerElapsedMap[p].length*10)/10:0,over21:partnerOver21Map[p]||0})).sort((a,b)=>b.target-a.target);

      // ── 차종별 통계 ──
      const modelTargetMap={},modelElapsedMap={},modelCompletedMap={};
      for(const r of targetRows){const m=String(r['차종명']||'미지정');if(!m||m==='미지정')continue;modelTargetMap[m]=(modelTargetMap[m]||0)+1;if(!modelElapsedMap[m])modelElapsedMap[m]=[];modelElapsedMap[m].push(Number(r['세차경과일'])||0);}
      for(const r of washRows){const m=String(r['차종']||'미지정');if(m!=='미지정')modelCompletedMap[m]=(modelCompletedMap[m]||0)+1;}
      const models=Object.keys(modelTargetMap).map(m=>({name:m,target:modelTargetMap[m]||0,completed:modelCompletedMap[m]||0,avgElapsed:modelElapsedMap[m]?.length?Math.round(modelElapsedMap[m].reduce((a,b)=>a+b,0)/modelElapsedMap[m].length*10)/10:0})).sort((a,b)=>b.target-a.target);

      // ── 지역(시/도+구/군)별 통계: 전체 대상 차량 수 · 장기미세차(21일↑) ──
      const regionMapAgg={};
      for(const r of targetRows){
        const si=String(r['지역(시/도)']||'').trim()||'기타';
        const gu=String(r['지역(구/군)']||'').trim();
        const key=si+'|'+gu;
        if(!regionMapAgg[key])regionMapAgg[key]={si,gu,target:0,over21:0,days:[]};
        regionMapAgg[key].target++;
        const d=Number(r['세차경과일'])||0;
        regionMapAgg[key].days.push(d);
        if(d>=21)regionMapAgg[key].over21++;
      }
      const regionStats=Object.values(regionMapAgg).map(r=>({
        si:r.si, gu:r.gu, target:r.target, over21:r.over21,
        avgElapsed:r.days.length?Math.round(r.days.reduce((a,b)=>a+b,0)/r.days.length*10)/10:0,
      })).sort((a,b)=>b.target-a.target);

      // 21일↑(장기미세차) 차량 번호판 집합 — 작업자별 "장기미세차 처리 비율" 계산용
      const over21Plates=new Set(over21.map(r=>String(r['차량번호']||'')));

      // ── 작업자별 통계 (이름·소속업체·왕복/혼용·장기미세차 처리 포함) ──
      const workerMap={};
      for(const r of washRows){
        const wid=r['예약자(ID)'];if(!wid)continue;
        const s=r['운행시작'],e=r['운행종료'];
        const sDate=excelToDate(s),eDate=excelToDate(e);
        const mins=sDate&&eDate?(new Date(typeof e==='number'?(e-25569)*86400*1000:e)-new Date(typeof s==='number'?(s-25569)*86400*1000:s))/60000:null;
        if(!workerMap[wid])workerMap[wid]={count:0,minutes:[],name:'',companyCount:{},round:0,longCount:0};
        workerMap[wid].count++;
        if(mins!=null&&mins>0&&mins<300)workerMap[wid].minutes.push(mins);
        if(!workerMap[wid].name&&r['예약자명'])workerMap[wid].name=String(r['예약자명']);
        const co=plateToCompany[r['차량번호']];
        if(co)workerMap[wid].companyCount[co]=(workerMap[wid].companyCount[co]||0)+1;
        if(String(r['차량구분']||'')==='왕복')workerMap[wid].round++;
        if(over21Plates.has(String(r['차량번호']||'')))workerMap[wid].longCount++;
      }
      const workers=Object.entries(workerMap).map(([id,v])=>{
        const topCompany=Object.entries(v.companyCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
        return{id,name:v.name,company:topCompany,count:v.count,roundCount:v.round,longCount:v.longCount,avgMinutes:v.minutes.length?Math.round(v.minutes.reduce((a,b)=>a+b,0)/v.minutes.length*10)/10:0};
      }).sort((a,b)=>b.count-a.count);
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
          partner:String(r['차량소속']||''),
          reason:String(r['세차 불가 여부']||'단순미세차').replace(/\s+/g,' ').trim(),
          carryOver:String(r['기타']||'-'),
        });
      }
      overdue.sort((a,b)=>b.days-a.days);
      const data={summary:{weekLabel,weekStart,weekEnd,targetCount:totalTarget,completedCount:washRows.length,over21Count,over21Simple,over21Impossible,utilizationRate,avgElapsedDays},daily,companies,elapsed,workers,overdue,completedPlates,partners,models,regionStats};
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
  const partners=weekData[selectedWk]?.partners||[];
  const models=weekData[selectedWk]?.models||[];
  const regionStatsSrv=weekData[selectedWk]?.regionStats||[]; // 시/도+구/군 전체 대상 수 (서버 집계)
  const rate=s?pct(s.completed_count,s.target_count):0;
  const longRate=(over21,target)=>target>0?Math.round(over21/target*100):0;

  // 구/군별 집계 (미조치 상세 + 전체 대상/장기미세차율 결합)
  const districtMap={};
  for(const v of overdue){
    const key=v.region||'기타';
    if(!districtMap[key])districtMap[key]={key,si:v.region?.split(' ')[0]||'기타',gu:v.region?.split(' ').slice(1).join(' ')||'-',count:0,vehicles:[]};
    districtMap[key].count++;
    districtMap[key].vehicles.push(v);
  }
  // 지역별(시/도) 집계
  const regionMap={};
  for(const v of overdue){
    const si=v.region?.split(' ')[0]||'기타';
    if(!regionMap[si])regionMap[si]={si,count:0,vehicles:[]};
    regionMap[si].count++;
    regionMap[si].vehicles.push(v);
  }
  const regionSiTotals={};
  for(const r of regionStatsSrv){
    if(!regionSiTotals[r.region_si])regionSiTotals[r.region_si]={target:0,over21:0};
    regionSiTotals[r.region_si].target+=r.target_count;
    regionSiTotals[r.region_si].over21+=r.over21_count;
  }
  const regionsRaw=Object.values(regionMap).map(r=>{
    const t=regionSiTotals[r.si]||{target:0,over21:r.count};
    const simple=r.vehicles.filter(v=>v.reason?.replace(/\s/g,'').includes('단순미세차')).length;
    const impossible=r.vehicles.filter(v=>v.reason?.includes('세차 불가')).length;
    const carryOver=r.vehicles.filter(v=>v.carryOver&&v.carryOver!=='-').length;
    return {...r, target:t.target, over21ForRate:t.over21, longRate:longRate(t.over21,t.target), simple, impossible, carryOver};
  }).sort((a,b)=>b.count-a.count);
  const regions=sortRows(regionsRaw,regionSort);
  const districtsRaw=Object.values(districtMap).map(d=>{
    const srv=regionStatsSrv.find(r=>r.region_si===d.si&&(r.region_gu||'')===(d.gu==='-'?'':d.gu));
    const target=srv?.target_count||0, over21=srv?.over21_count??d.count;
    const simple=d.vehicles.filter(v=>v.reason?.replace(/\s/g,'').includes('단순미세차')).length;
    const impossible=d.vehicles.filter(v=>v.reason?.includes('세차 불가')).length;
    return {...d, target, over21ForRate:over21, longRate:longRate(over21,target), simple, impossible};
  }).sort((a,b)=>b.count-a.count);
  const districts=sortRows(districtsRaw,districtSort);

  // ── 표 정렬용 파생 행 데이터 (업체/작업자/제휴사/차종) ──
  const companyRows=sortRows(companies.map((c,i)=>{
    const rr=pct(c.completed_count,c.target_count);
    const overdueCount=overdue.filter(v=>v.company_name===c.company_name).length;
    const staffCount=workers.filter(w=>w.company_name===c.company_name).length;
    const lr=pct(c.bucket_21_plus,c.target_count);
    return {...c, _rank:i+1, rate:rr, overdueCount, staffCount, longRate:lr};
  }),companySort);
  const workerRows=sortRows(workers.map((w,i)=>({...w, _rank:i+1, longRate:pct(w.long_overdue_count,w.completed_count)})),workerSort);
  const partnerRows=sortRows(partners.map((p,i)=>({...p, _rank:i+1, rate:pct(p.completed_count,p.target_count), longRate:pct(p.over21_count,p.target_count)})),partnerSort);
  const modelRows=sortRows(models.map((m,i)=>({...m, _rank:i+1, rate:pct(m.completed_count,m.target_count)})),modelSort);

  // ── 지도(맵차트) 데이터 가공 ──
  const mapRegions=mapData[selectedMapLabel]?.regions||[];
  const mapVehicles=mapData[selectedMapLabel]?.vehicles||[];
  const mapSnapshot=mapData[selectedMapLabel]?.snapshot||null;
  // 시/도 단위로 합산 (구/군은 별도 detail table 용)
  const mapSiMap={};
  for(const r of mapRegions){
    const si=r.region_si;
    if(!mapSiMap[si])mapSiMap[si]={si,count:0,elapsedSum:0,over21:0};
    mapSiMap[si].count+=r.target_count;
    mapSiMap[si].elapsedSum+=r.avg_elapsed_days*r.target_count;
    mapSiMap[si].over21+=r.over21_count;
  }
  const mapSiList=Object.values(mapSiMap).map(x=>({si:x.si,count:x.count,over21:x.over21,avgElapsed:x.count?Math.round(x.elapsedSum/x.count*10)/10:0,over21Rate:x.count?Math.round(x.over21/x.count*100):0}));
  // 실제 지도 경로(KOREA_REGIONS)마다 매칭되는 시/도 데이터 합산
  const mapRegionShapes=KOREA_REGIONS.map(region=>{
    const matched=mapSiList.filter(x=>siMatchesRegion(x.si,region));
    if(!matched.length) return {...region, data:null, siNames:[]};
    const count=matched.reduce((a,b)=>a+b.count,0);
    const over21=matched.reduce((a,b)=>a+b.over21,0);
    const elapsedSum=matched.reduce((a,b)=>a+b.avgElapsed*b.count,0);
    return {...region, siNames:matched.map(x=>x.si), data:{
      count, over21,
      avgElapsed:count?Math.round(elapsedSum/count*10)/10:0,
      over21Rate:count?Math.round(over21/count*100):0,
    }};
  });
  const mapMaxCount=Math.max(1,...mapRegionShapes.map(x=>x.data?.count||0));
  const mapMaxElapsed=Math.max(1,...mapRegionShapes.map(x=>x.data?.avgElapsed||0));
  const mapMaxOver21Rate=Math.max(1,...mapRegionShapes.map(x=>x.data?.over21Rate||0));
  const mapUnmatched=mapSiList.filter(x=>!KOREA_REGIONS.some(region=>siMatchesRegion(x.si,region)));
  const mapMetricValue=(d)=>!d?0:mapMetric==='count'?d.count:mapMetric==='avgElapsed'?d.avgElapsed:d.over21Rate;
  const mapMetricMax=mapMetric==='count'?mapMaxCount:mapMetric==='avgElapsed'?mapMaxElapsed:mapMaxOver21Rate;
  const mapMetricLabel={count:'세차대상 차량 수',avgElapsed:'평균 세차경과일',over21:'21일↑ 비율'}[mapMetric];
  // 구/군 top 20 (선택된 시/도 없으면 전체 기준)
  const mapDistricts=mapRegions.slice().sort((a,b)=>b.target_count-a.target_count);
  const mapSiRows=sortRows(mapSiList,mapSiSort);
  // 지도에서 특정 시/도를 클릭했을 때의 구/군 드릴다운 데이터
  const mapDrilldownRegion=mapDrilldownSi?mapRegionShapes.find(r=>r.id===mapDrilldownSi):null;
  const mapDrilldownRowsRaw=mapDrilldownRegion?mapRegions.filter(r=>siMatchesRegion(r.region_si,mapDrilldownRegion)).map(r=>({...r,longRate:pct(r.over21_count,r.target_count)})).sort((a,b)=>b.target_count-a.target_count):[];
  const mapDrilldownRows=sortRows(mapDrilldownRowsRaw,mapDrilldownSort);
  // 실제 구/군 경계 지도(SIGUNGU_BY_SIDO)에 해당 시/도의 데이터를 얹은 지도용 shape
  const mapDrilldownGeo=mapDrilldownRegion?SIGUNGU_BY_SIDO[mapDrilldownRegion.id]:null;
  const mapDrilldownDistrictShapes=mapDrilldownGeo?mapDrilldownGeo.regions.map(dist=>{
    const matched=mapDrilldownRowsRaw.filter(r=>guMatchesDistrict(r.region_gu,dist));
    const target=matched.reduce((a,b)=>a+b.target_count,0);
    const over21=matched.reduce((a,b)=>a+b.over21_count,0);
    const elapsedSum=matched.reduce((a,b)=>a+b.avg_elapsed_days*b.target_count,0);
    const data=matched.length?{
      count:target, over21,
      avgElapsed:target?Math.round(elapsedSum/target*10)/10:0,
      over21Rate:target?Math.round(over21/target*100):0,
    }:null;
    return {...dist, data, matchedGuNames:[...new Set(matched.map(r=>r.region_gu))]};
  }):[];
  const mapDrilldownMaxCount=Math.max(1,...mapDrilldownDistrictShapes.map(x=>x.data?.count||0));
  const mapDrilldownMaxElapsed=Math.max(1,...mapDrilldownDistrictShapes.map(x=>x.data?.avgElapsed||0));
  const mapDrilldownMaxOver21Rate=Math.max(1,...mapDrilldownDistrictShapes.map(x=>x.data?.over21Rate||0));
  const mapDrilldownMetricMax=mapMetric==='count'?mapDrilldownMaxCount:mapMetric==='avgElapsed'?mapDrilldownMaxElapsed:mapDrilldownMaxOver21Rate;
  // 구/군 하나만 선택해서 확대(isolate)한 경우
  const mapIsolatedDistrict=mapDrilldownGu?mapDrilldownDistrictShapes.find(d=>d.code===mapDrilldownGu):null;
  const mapIsolatedVehicles=mapIsolatedDistrict?mapVehicles.filter(v=>siMatchesRegion(v.region_si,mapDrilldownRegion)&&guMatchesDistrict(v.region_gu,mapIsolatedDistrict)):[];

  const mapCols=[
    {key:'license_plate',label:'번호판',style:()=>({fontFamily:'monospace',fontSize:12,fontWeight:600})},
    {key:'car_model',label:'차종'},
    {key:'bm',label:'운영BM'},
    {key:'elapsed_days',label:'경과일',render:v=><span className={`badge ${v>=21?'badge-red':v>=7?'badge-orange':'badge-green'}`}>{v}일</span>},
    {key:'region_si',label:'시/도'},
    {key:'region_gu',label:'구/군'},
    {key:'spot_name',label:'스팟',style:()=>({fontSize:11,color:MUTED,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'})},
    {key:'company_name',label:'업체'},
    {key:'partner_name',label:'제휴사'},
  ];

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
              <thead><tr>{popup.cols.map(c=><SortTh key={c.key} sortKey={c.key} sort={popupSort} onSort={onPopupSort}>{c.label}</SortTh>)}</tr></thead>
              <tbody>
                {sortRows(popup.rows,popupSort).map((row,i)=>(
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
    {key:'partner_name',label:'제휴사'},
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
          {/* 대시보드 */}
          <button className={`nav-parent ${menu==='dashboard'?'active':''}`} onClick={()=>{setMenu('dashboard');setSubMenu('');setSideOpen(false);}}>
            <span className="nav-icon">{ICONS.dashboard}</span>
            <span>대시보드</span>
            <span className={`nav-arrow ${menu==='dashboard'?'open':''}`}>▾</span>
          </button>
          {menu==='dashboard'&&(
            <div className="nav-children">
              <button className={`nav-child ${subMenu==='compare'?'active':''}`} onClick={()=>{setSubMenu('compare');setSideOpen(false);}}>주차별 비교</button>
            </div>
          )}
          {/* 통계 */}
          <button className={`nav-parent ${menu==='stats'?'active':''}`} onClick={()=>{setMenu('stats');setStatsMenu('company');setSubMenu('');setSideOpen(false);}}>
            <span className="nav-icon">{ICONS.stats}</span>
            <span>통계</span>
            <span className={`nav-arrow ${menu==='stats'?'open':''}`}>▾</span>
          </button>
          {menu==='stats'&&(
            <div className="nav-children">
              <button className={`nav-child ${statsMenu==='company'?'active':''}`} onClick={()=>{setMenu('stats');setStatsMenu('company');setSubMenu('');setSideOpen(false);}}>업체별 통계</button>
              <button className={`nav-child ${statsMenu==='worker'?'active':''}`} onClick={()=>{setMenu('stats');setStatsMenu('worker');setSubMenu('');setSideOpen(false);}}>작업자별 통계</button>
              <button className={`nav-child ${statsMenu==='partner'?'active':''}`} onClick={()=>{setMenu('stats');setStatsMenu('partner');setSubMenu('');setSideOpen(false);}}>제휴사별 통계</button>
              <button className={`nav-child ${statsMenu==='model'?'active':''}`} onClick={()=>{setMenu('stats');setStatsMenu('model');setSubMenu('');setSideOpen(false);}}>차종별 통계</button>
              <button className={`nav-child ${statsMenu==='region'?'active':''}`} onClick={()=>{setMenu('stats');setStatsMenu('region');setSubMenu('');setSideOpen(false);}}>지역별 통계</button>
            </div>
          )}
          {/* 데이터 관리 */}
          <button className={`nav-parent ${menu==='data'?'active':''}`} onClick={()=>{setMenu('data');setSubMenu('');setSideOpen(false);}}>
            <span className="nav-icon">{ICONS.data}</span>
            <span>데이터 관리</span>
          </button>
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
          {menu==='stats'&&statsMenu==='partner'&&'제휴사별 통계'}
          {menu==='stats'&&statsMenu==='model'&&'차종별 통계'}
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

        {/* ══ 세차대상 지도 (대시보드에 통합) ══ */}
        {menu==='dashboard'&&!subMenu&&s&&(
          <Card title="세차대상 지도" badge={selectedMapLabel||undefined} action={
            mapSiList.length>0&&(
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <div style={{display:'flex',gap:6}}>
                  {[['count','대상차량 수'],['avgElapsed','평균경과일'],['over21','21일↑ 비율']].map(([k,l])=>(
                    <button key={k} className={`wk-pill ${mapMetric===k?'active':''}`} style={{'--wc':ORANGE}} onClick={()=>setMapMetric(k)}>{l}</button>
                  ))}
                </div>
                {mapSnapshots.length>1&&(
                  <select className="wk-dropdown-btn" style={{appearance:'none'}} value={selectedMapLabel} onChange={e=>setSelectedMapLabel(e.target.value)}>
                    {mapSnapshots.map(sn=><option key={sn.label} value={sn.label}>{sn.label}</option>)}
                  </select>
                )}
              </div>
            )
          }>
            {mapSnapshots.length===0?(
              <div style={{textAlign:'center',padding:'32px 20px'}}>
                <div style={{fontSize:36,marginBottom:10}}>🗺️</div>
                <p style={{fontSize:13,color:MUTED,marginBottom:14}}>세차대상 리스트를 업로드하면 전국 지도로 분포를 볼 수 있어요</p>
                <button className="upload-btn-top" onClick={()=>setMenu('data')}>데이터 관리에서 업로드</button>
              </div>
            ):!mapSnapshot?(
              <div style={{padding:'32px 20px',textAlign:'center',color:MUTED,fontSize:13}}>불러오는 중...</div>
            ):(
              <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'flex-start'}}>
                <div style={{position:'relative',flexShrink:0,width:'100%',maxWidth:560}}>
                  {(mapDrilldownRegion||mapIsolatedDistrict)&&(
                    <button className="upload-btn-top" style={{position:'absolute',top:8,left:8,zIndex:5,padding:'5px 12px',fontSize:12}} onClick={()=>{
                      if(mapIsolatedDistrict)setMapDrilldownGu('');else{setMapDrilldownSi('');setHoveredRegion(null);}
                    }}>{mapIsolatedDistrict?`← ${mapDrilldownRegion.nameKo} 전체`:'← 전국 지도'}</button>
                  )}
                  {mapDrilldownRegion&&(
                    <div style={{position:'absolute',top:8,right:8,zIndex:5,background:'rgba(9,30,63,.85)',color:'#fff',fontSize:12,fontWeight:800,padding:'5px 12px',borderRadius:20}}>
                      {mapDrilldownRegion.nameKo}{mapIsolatedDistrict?` › ${mapIsolatedDistrict.nameKo}`:''}
                    </div>
                  )}
                  {mapDrilldownRegion&&!mapDrilldownGeo?(
                    <div style={{padding:'60px 20px',textAlign:'center',color:MUTED,fontSize:13,background:'#F6F7F9',borderRadius:12}}>이 지역은 구/군 경계 데이터가 없어 표만 제공됩니다.</div>
                  ):(
                    <svg viewBox={mapIsolatedDistrict?`${mapIsolatedDistrict.bbox.x-Math.max(mapIsolatedDistrict.bbox.w,mapIsolatedDistrict.bbox.h)*0.08} ${mapIsolatedDistrict.bbox.y-Math.max(mapIsolatedDistrict.bbox.w,mapIsolatedDistrict.bbox.h)*0.08} ${mapIsolatedDistrict.bbox.w*1.16} ${mapIsolatedDistrict.bbox.h*1.16}`:(mapDrilldownGeo?mapDrilldownGeo.viewBox:KOREA_VIEWBOX)} style={{width:'100%',height:'auto',display:'block',overflow:'visible',transition:'all .3s ease'}}>
                      {mapIsolatedDistrict?(()=>{
                        const val=mapMetricValue(mapIsolatedDistrict.data);
                        const ratio=mapIsolatedDistrict.data?val/mapDrilldownMetricMax:0;
                        return <path d={mapIsolatedDistrict.path} fill={mapIsolatedDistrict.data?heatColor(ratio):'#E8ECF0'} stroke={NAVY} strokeWidth={1.4}/>;
                      })():(mapDrilldownGeo?mapDrilldownDistrictShapes:mapRegionShapes).map(item=>{
                        const isDistrict=!!mapDrilldownGeo;
                        const itemId=isDistrict?item.code:item.id;
                        const val=mapMetricValue(item.data);
                        const metricMax=isDistrict?mapDrilldownMetricMax:mapMetricMax;
                        const ratio=item.data?val/metricMax:0;
                        const fill=item.data?heatColor(ratio):'#E8ECF0';
                        const hovered=hoveredRegion===itemId;
                        return(
                          <path key={itemId} d={item.path} fill={fill}
                            stroke={hovered?NAVY:'#fff'} strokeWidth={hovered?1.6:0.8}
                            style={{cursor:item.data?'pointer':'default',transition:'fill .25s,stroke .15s,transform .15s',transformBox:'fill-box',transformOrigin:'center',transform:hovered?'scale(1.015)':'scale(1)'}}
                            onMouseEnter={e=>{setHoveredRegion(itemId);setMapTooltipPos({x:e.clientX,y:e.clientY});}}
                            onMouseMove={e=>setMapTooltipPos({x:e.clientX,y:e.clientY})}
                            onMouseLeave={()=>setHoveredRegion(null)}
                            onClick={()=>{
                              if(!item.data)return;
                              if(isDistrict){setMapDrilldownGu(item.code);setHoveredRegion(null);}
                              else setMapDrilldownSi(item.id);
                            }}/>
                        );
                      })}
                    </svg>
                  )}
                  {!mapIsolatedDistrict&&hoveredRegion&&(()=>{
                    const item=mapDrilldownGeo?mapDrilldownDistrictShapes.find(r=>r.code===hoveredRegion):mapRegionShapes.find(r=>r.id===hoveredRegion);
                    if(!item)return null;
                    return(
                      <div style={{position:'fixed',left:mapTooltipPos.x+14,top:mapTooltipPos.y+14,background:NAVY,color:'#fff',borderRadius:8,padding:'8px 12px',fontSize:12,pointerEvents:'none',zIndex:200,boxShadow:'0 8px 20px rgba(9,30,63,.25)',minWidth:120}}>
                        <div style={{fontWeight:800,marginBottom:4}}>{item.nameKo}</div>
                        {item.data?(
                          <>
                            <div>대상 {fmt(item.data.count)}대</div>
                            <div>평균경과 {item.data.avgElapsed}일</div>
                            <div>21일↑ {item.data.over21}대 ({item.data.over21Rate}%)</div>
                          </>
                        ):<div style={{color:'#AEBBCF'}}>데이터 없음</div>}
                      </div>
                    );
                  })()}
                </div>
                <div style={{flex:1,minWidth:260}}>
                  {mapIsolatedDistrict?(
                    <>
                      <div style={{fontSize:14,fontWeight:900,color:NAVY,marginBottom:14}}>{mapDrilldownRegion.nameKo} {mapIsolatedDistrict.nameKo} 세차 통계 요약</div>
                      {!mapIsolatedDistrict.data?(
                        <div style={{fontSize:12,color:MUTED,padding:'12px 0'}}>이 구/군에 해당하는 데이터가 없습니다.</div>
                      ):(
                        <>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
                            <div style={{background:'#F6F7F9',borderRadius:10,padding:'12px 14px'}}>
                              <div style={{fontSize:10,color:MUTED,marginBottom:4}}>차량대수</div>
                              <div style={{fontSize:20,fontWeight:900,color:NAVY}}>{fmt(mapIsolatedDistrict.data.count)}대</div>
                            </div>
                            <div style={{background:'#F6F7F9',borderRadius:10,padding:'12px 14px'}}>
                              <div style={{fontSize:10,color:MUTED,marginBottom:4}}>평균 세차경과일</div>
                              <div style={{fontSize:20,fontWeight:900,color:ORANGE}}>{mapIsolatedDistrict.data.avgElapsed}일</div>
                            </div>
                            <div style={{background:'#F6F7F9',borderRadius:10,padding:'12px 14px'}}>
                              <div style={{fontSize:10,color:MUTED,marginBottom:4}}>장기미세차(21일↑)</div>
                              <div style={{fontSize:20,fontWeight:900,color:RED}}>{fmt(mapIsolatedDistrict.data.over21)}대</div>
                            </div>
                            <div style={{background:'#F6F7F9',borderRadius:10,padding:'12px 14px'}}>
                              <div style={{fontSize:10,color:MUTED,marginBottom:4}}>장기미세차율</div>
                              <div style={{fontSize:20,fontWeight:900,color:mapIsolatedDistrict.data.over21Rate>=20?RED:mapIsolatedDistrict.data.over21Rate>=10?ORANGE:GREEN}}>{mapIsolatedDistrict.data.over21Rate}%</div>
                            </div>
                          </div>
                          <button className="upload-btn-top" style={{width:'100%',padding:'12px 16px',fontSize:13}} onClick={()=>openPopup(`${mapDrilldownRegion.nameKo} ${mapIsolatedDistrict.nameKo} 세차대상 차량 · ${selectedMapLabel}`,mapIsolatedVehicles,mapCols,`${selectedMapLabel}_${mapIsolatedDistrict.nameKo}_세차대상.xlsx`)}>🚗 차량 상세보기 ({fmt(mapIsolatedVehicles.length)}건)</button>
                        </>
                      )}
                    </>
                  ):(
                    <>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                        <div style={{background:'#F6F7F9',borderRadius:10,padding:'10px 12px'}}>
                          <div style={{fontSize:10,color:MUTED,marginBottom:4}}>전체 세차대상</div>
                          <div style={{fontSize:16,fontWeight:900,color:NAVY}}>{fmt(mapSnapshot.total_count)}대</div>
                        </div>
                        <div style={{background:'#F6F7F9',borderRadius:10,padding:'10px 12px'}}>
                          <div style={{fontSize:10,color:MUTED,marginBottom:4}}>인식된 시/도</div>
                          <div style={{fontSize:16,fontWeight:900,color:ORANGE}}>{mapSiList.length}곳</div>
                        </div>
                        <div style={{background:'#F6F7F9',borderRadius:10,padding:'10px 12px'}}>
                          <div style={{fontSize:10,color:MUTED,marginBottom:4}}>21일↑ 차량</div>
                          <div style={{fontSize:16,fontWeight:900,color:RED}}>{fmt(mapSiList.reduce((a,b)=>a+b.over21,0))}대</div>
                        </div>
                      </div>
                      <div style={{fontSize:12,fontWeight:800,color:MUTED,marginBottom:8}}>{mapMetricLabel} 범례</div>
                      <div style={{display:'flex',height:10,borderRadius:6,overflow:'hidden',marginBottom:6}}>
                        {[0,.2,.4,.6,.8,1].map(r=><div key={r} style={{flex:1,background:heatColor(r)}}/>)}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:MUTED,marginBottom:16}}>
                        <span>0</span><span>{mapMetric==='avgElapsed'?`${mapMetricMax}일`:mapMetric==='over21'?`${mapMetricMax}%`:`${fmt(mapMetricMax)}대`}</span>
                      </div>
                      {mapDrilldownRegion?(
                        <>
                          <div style={{fontSize:13,fontWeight:800,color:NAVY,marginBottom:6}}>{mapDrilldownRegion.nameKo} 구/군별 상세</div>
                          <div style={{fontSize:11,color:MUTED,marginBottom:10}}>지도 또는 구/군을 클릭하면 해당 지역이 확대되고 통계 요약이 표시됩니다.</div>
                          {mapDrilldownRows.length===0?(
                            <div style={{fontSize:12,color:MUTED,padding:'12px 0'}}>구/군 상세 데이터가 없습니다.</div>
                          ):(
                            <div className="tbl-wrap" style={{maxHeight:220,overflowY:'auto'}}>
                              <table className="tbl">
                                <thead><tr>
                                  <SortTh sortKey="region_gu" sort={mapDrilldownSort} onSort={onMapDrilldownSort}>구/군</SortTh>
                                  <SortTh sortKey="target_count" sort={mapDrilldownSort} onSort={onMapDrilldownSort}>차량대수</SortTh>
                                  <SortTh sortKey="over21_count" sort={mapDrilldownSort} onSort={onMapDrilldownSort}>장기미세차</SortTh>
                                  <SortTh sortKey="longRate" sort={mapDrilldownSort} onSort={onMapDrilldownSort}>장기미세차율</SortTh>
                                </tr></thead>
                                <tbody>
                                  {mapDrilldownRows.map(r=>{
                                    const dist=mapDrilldownDistrictShapes.find(d=>guMatchesDistrict(r.region_gu,d));
                                    return(
                                      <tr key={r.region_si+'|'+r.region_gu} className="clickable" onClick={()=>dist&&setMapDrilldownGu(dist.code)}>
                                        <td><strong>{r.region_gu||'(미상세)'}</strong></td>
                                        <td>{fmt(r.target_count)}대</td>
                                        <td style={{color:r.over21_count>0?RED:GREEN}}>{r.over21_count}대</td>
                                        <td><span className={`badge ${r.longRate>=20?'badge-red':r.longRate>=10?'badge-orange':'badge-green'}`}>{r.longRate}%</span></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ):(
                        <>
                          <div style={{fontSize:11,color:MUTED,marginBottom:10}}>지역을 클릭하면 시/군/구 상세 지도가 표시됩니다.</div>
                          <div className="tbl-wrap" style={{maxHeight:220,overflowY:'auto'}}>
                            <table className="tbl">
                              <thead><tr>
                                <SortTh sortKey="si" sort={mapSiSort} onSort={onMapSiSort}>시/도</SortTh>
                                <SortTh sortKey="count" sort={mapSiSort} onSort={onMapSiSort}>대상</SortTh>
                                <SortTh sortKey="over21" sort={mapSiSort} onSort={onMapSiSort}>21일↑</SortTh>
                                <SortTh sortKey="over21Rate" sort={mapSiSort} onSort={onMapSiSort}>장기미세차율</SortTh>
                              </tr></thead>
                              <tbody>
                                {mapSiRows.map(r=>(
                                  <tr key={r.si} className="clickable" onClick={()=>{
                                    const matched=mapRegionShapes.find(rs=>siMatchesRegion(r.si,rs));
                                    if(matched)setMapDrilldownSi(matched.id);
                                    else openPopup(`${r.si} 세차대상 차량 · ${selectedMapLabel}`,mapVehicles.filter(v=>v.region_si===r.si),mapCols,`${selectedMapLabel}_${r.si}_세차대상.xlsx`)
                                  }}>
                                    <td><strong>{r.si}</strong></td>
                                    <td>{fmt(r.count)}대</td>
                                    <td style={{color:r.over21>0?RED:GREEN}}>{r.over21}대</td>
                                    <td><span className={`badge ${r.over21Rate>=20?'badge-red':r.over21Rate>=10?'badge-orange':'badge-green'}`}>{r.over21Rate}%</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {mapUnmatched.length>0&&(
                            <div style={{fontSize:11,color:MUTED,background:'#F6F7F9',borderRadius:8,padding:'8px 10px',marginTop:10}}>
                              지도에 표시되지 못한 지역: {mapUnmatched.map(u=>`${u.si}(${u.count}대)`).join(', ')}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
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
                  <thead><tr>
                    <th>순위</th>
                    <SortTh sortKey="company_name" sort={companySort} onSort={onCompanySort}>업체명</SortTh>
                    <SortTh sortKey="target_count" sort={companySort} onSort={onCompanySort}>세차대상</SortTh>
                    <SortTh sortKey="completed_count" sort={companySort} onSort={onCompanySort}>세차완료</SortTh>
                    <SortTh sortKey="rate" sort={companySort} onSort={onCompanySort}>완료율</SortTh>
                    <SortTh sortKey="overdueCount" sort={companySort} onSort={onCompanySort}>미조치</SortTh>
                    <SortTh sortKey="staffCount" sort={companySort} onSort={onCompanySort}>작업인원</SortTh>
                    <SortTh sortKey="longRate" sort={companySort} onSort={onCompanySort}>장기미세차율</SortTh>
                    <th>달성현황</th>
                  </tr></thead>
                  <tbody>
                    {companyRows.map(c=>(
                        <tr key={c.company_name} className="clickable" onClick={()=>openPopup(`${c.company_name} 미조치 차량 · ${selectedWk}`,overdue.filter(v=>v.company_name===c.company_name),overdueCols,`${selectedWk}_${c.company_name}_미조치.xlsx`)}>
                          <td><span className={`rank ${c._rank<=3?'top':''}`}>{c._rank}</span></td>
                          <td><strong>{c.company_name}</strong></td>
                          <td>{fmt(c.target_count)}대</td>
                          <td>{fmt(c.completed_count)}건</td>
                          <td><span className={`badge ${rateCls(c.rate)}`}>{c.rate}%</span></td>
                          <td style={{color:c.overdueCount>0?RED:GREEN}}>{c.overdueCount}대</td>
                          <td style={{color:MUTED}}>{c.staffCount}명</td>
                          <td><span className={`badge ${c.longRate>=20?'badge-red':c.longRate>=10?'badge-orange':'badge-green'}`}>{c.longRate}%</span></td>
                          <td style={{width:80}}><div className="bar-cell"><div style={{width:`${c.rate}%`,background:c.rate>=80?GREEN:c.rate>=60?ORANGE:RED,height:'100%',borderRadius:4}}/></div></td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="업체별 세차경과일 구간 분포" badge="세분화">
              <div style={{position:'relative',height:260}}>
                <Bar data={{labels:companies.map(c=>c.company_name),datasets:[
                  {label:'0-6일',data:companies.map(c=>c.bucket_0_6),backgroundColor:GREEN+'CC',borderRadius:3},
                  {label:'7-13일',data:companies.map(c=>c.bucket_7_13),backgroundColor:'#0EA5E9CC',borderRadius:3},
                  {label:'14-20일',data:companies.map(c=>c.bucket_14_20),backgroundColor:YELLOW+'CC',borderRadius:3},
                  {label:'21일↑',data:companies.map(c=>c.bucket_21_plus),backgroundColor:RED+'CC',borderRadius:3},
                ]}} options={{...CHART,scales:{...CHART.scales,x:{...CHART.scales.x,stacked:true},y:{...CHART.scales.y,stacked:true}}}}/>
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
              <div><h1 className="page-title">작업자별 통계</h1><p className="page-sub">누적 세차 완료 건수 · 평균 작업시간 · 소속업체 · 왕복/혼용</p></div>
              <WkDropdown/>
            </div>
            <Card title="완료 건수 순위 (상위 15명)">
              <div style={{position:'relative',height:320}}>
                <Bar data={{labels:workers.slice(0,15).map(w=>w.worker_name||w.worker_id),datasets:[{label:'완료건수',data:workers.slice(0,15).map(w=>w.completed_count),backgroundColor:workers.slice(0,15).map((_,i)=>i<3?YELLOW+'CC':NAVY+'66'),borderRadius:4}]}} options={{...CHART,indexAxis:'y',plugins:{...CHART.plugins,legend:{display:false}},scales:{x:CHART.scales.x,y:{...CHART.scales.y,grid:{display:false}}}}}/>
              </div>
            </Card>
            <Card title="업체별 작업 인원 분포" badge="세분화">
              <div style={{position:'relative',height:220}}>
                <Doughnut data={{
                  labels:companies.map(c=>c.company_name),
                  datasets:[{data:companies.map(c=>workers.filter(w=>w.company_name===c.company_name).length),backgroundColor:companies.map((_,i)=>wca(i)),borderWidth:0,cutout:'55%'}]
                }} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:11},color:MUTED,padding:10}},tooltip:{backgroundColor:NAVY}}}}/>
              </div>
            </Card>
            <Card title="작업자 상세 순위">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>
                    <th>순위</th>
                    <SortTh sortKey="worker_name" sort={workerSort} onSort={onWorkerSort}>이름</SortTh>
                    <SortTh sortKey="worker_id" sort={workerSort} onSort={onWorkerSort}>작업자 ID</SortTh>
                    <SortTh sortKey="company_name" sort={workerSort} onSort={onWorkerSort}>소속업체</SortTh>
                    <SortTh sortKey="completed_count" sort={workerSort} onSort={onWorkerSort}>완료건수</SortTh>
                    <th>왕복/혼용</th>
                    <SortTh sortKey="avg_work_minutes" sort={workerSort} onSort={onWorkerSort}>평균 작업시간</SortTh>
                    <SortTh sortKey="longRate" sort={workerSort} onSort={onWorkerSort}>장기미세차율</SortTh>
                  </tr></thead>
                  <tbody>
                    {workerRows.map((w)=>(
                      <tr key={w.worker_id}>
                        <td><span className={`rank ${w._rank<=3?'top':''}`}>{w._rank}</span></td>
                        <td><strong>{w.worker_name||'-'}</strong></td>
                        <td style={{fontFamily:'monospace',fontSize:12}}>{w.worker_id}</td>
                        <td>{w.company_name?<span className="badge badge-orange">{w.company_name}</span>:<span style={{color:MUTED}}>-</span>}</td>
                        <td><strong>{fmt(w.completed_count)}</strong>건</td>
                        <td style={{fontSize:11,color:MUTED}}>{w.round_count||0} / {w.mixed_count||0}</td>
                        <td>{w.avg_work_minutes>0?`${w.avg_work_minutes}분`:'-'}</td>
                        <td><span className={`badge ${w.longRate>=20?'badge-red':w.longRate>=10?'badge-orange':'badge-green'}`}>{w.longRate}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ══ 제휴사별 통계 ══ */}
        {menu==='stats'&&statsMenu==='partner'&&(
          <>
            <div className="page-hd">
              <div><h1 className="page-title">제휴사별 통계</h1><p className="page-sub">차량소속(제휴사) 기준 세차대상 vs 완료 · 행 클릭 시 미조치 차량 목록</p></div>
              <WkDropdown/>
            </div>
            {partners.length===0?<div className="empty"><p>제휴사 데이터가 없습니다</p></div>:(
              <>
                <Card title="제휴사별 세차대상 vs 완료">
                  <div style={{position:'relative',height:280}}>
                    <Bar data={{labels:partners.map(p=>p.partner_name),datasets:[{label:'세차대상',data:partners.map(p=>p.target_count),backgroundColor:NAVY+'AA',borderRadius:4},{label:'세차완료',data:partners.map(p=>p.completed_count),backgroundColor:ORANGE+'CC',borderRadius:4}]}} options={CHART}/>
                  </div>
                </Card>
                <Card title="제휴사별 상세">
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr>
                        <th>순위</th>
                        <SortTh sortKey="partner_name" sort={partnerSort} onSort={onPartnerSort}>제휴사명</SortTh>
                        <SortTh sortKey="target_count" sort={partnerSort} onSort={onPartnerSort}>세차대상</SortTh>
                        <SortTh sortKey="completed_count" sort={partnerSort} onSort={onPartnerSort}>세차완료</SortTh>
                        <SortTh sortKey="rate" sort={partnerSort} onSort={onPartnerSort}>완료율</SortTh>
                        <SortTh sortKey="avg_elapsed_days" sort={partnerSort} onSort={onPartnerSort}>평균경과일</SortTh>
                        <SortTh sortKey="over21_count" sort={partnerSort} onSort={onPartnerSort}>21일↑ 미조치</SortTh>
                        <SortTh sortKey="longRate" sort={partnerSort} onSort={onPartnerSort}>장기미세차율</SortTh>
                      </tr></thead>
                      <tbody>
                        {partnerRows.map(p=>(
                            <tr key={p.partner_name} className="clickable" onClick={()=>openPopup(`${p.partner_name} 미조치 차량 · ${selectedWk}`,overdue.filter(v=>v.partner_name===p.partner_name),overdueCols,`${selectedWk}_${p.partner_name}_미조치.xlsx`)}>
                              <td><span className={`rank ${p._rank<=3?'top':''}`}>{p._rank}</span></td>
                              <td><strong>{p.partner_name}</strong></td>
                              <td>{fmt(p.target_count)}대</td>
                              <td>{fmt(p.completed_count)}건</td>
                              <td><span className={`badge ${rateCls(p.rate)}`}>{p.rate}%</span></td>
                              <td>{p.avg_elapsed_days}일</td>
                              <td style={{color:p.over21_count>0?RED:GREEN}}>{p.over21_count}대</td>
                              <td><span className={`badge ${p.longRate>=20?'badge-red':p.longRate>=10?'badge-orange':'badge-green'}`}>{p.longRate}%</span></td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}

        {/* ══ 차종별 통계 ══ */}
        {menu==='stats'&&statsMenu==='model'&&(
          <>
            <div className="page-hd">
              <div><h1 className="page-title">차종별 통계</h1><p className="page-sub">차종 기준 세차대상 vs 완료 · 행 클릭 시 미조치 차량 목록</p></div>
              <WkDropdown/>
            </div>
            {models.length===0?<div className="empty"><p>차종 데이터가 없습니다</p></div>:(
              <>
                <Card title="차종별 세차대상 vs 완료 (상위 15종)">
                  <div style={{position:'relative',height:320}}>
                    <Bar data={{labels:models.slice(0,15).map(m=>m.model_name),datasets:[{label:'세차대상',data:models.slice(0,15).map(m=>m.target_count),backgroundColor:NAVY+'AA',borderRadius:4},{label:'세차완료',data:models.slice(0,15).map(m=>m.completed_count),backgroundColor:ORANGE+'CC',borderRadius:4}]}} options={{...CHART,indexAxis:'y'}}/>
                  </div>
                </Card>
                <Card title="차종별 상세">
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr>
                        <th>순위</th>
                        <SortTh sortKey="model_name" sort={modelSort} onSort={onModelSort}>차종</SortTh>
                        <SortTh sortKey="target_count" sort={modelSort} onSort={onModelSort}>세차대상</SortTh>
                        <SortTh sortKey="completed_count" sort={modelSort} onSort={onModelSort}>세차완료</SortTh>
                        <SortTh sortKey="rate" sort={modelSort} onSort={onModelSort}>완료율</SortTh>
                        <SortTh sortKey="avg_elapsed_days" sort={modelSort} onSort={onModelSort}>평균경과일</SortTh>
                      </tr></thead>
                      <tbody>
                        {modelRows.map(m=>(
                            <tr key={m.model_name} className="clickable" onClick={()=>openPopup(`${m.model_name} 미조치 차량 · ${selectedWk}`,overdue.filter(v=>v.car_model===m.model_name),overdueCols,`${selectedWk}_${m.model_name}_미조치.xlsx`)}>
                              <td><span className={`rank ${m._rank<=3?'top':''}`}>{m._rank}</span></td>
                              <td><strong>{m.model_name}</strong></td>
                              <td>{fmt(m.target_count)}대</td>
                              <td>{fmt(m.completed_count)}건</td>
                              <td><span className={`badge ${rateCls(m.rate)}`}>{m.rate}%</span></td>
                              <td>{m.avg_elapsed_days}일</td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
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
                <Card title="지역별 상세 (시/도)">
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr>
                        <th>순위</th>
                        <SortTh sortKey="si" sort={regionSort} onSort={onRegionSort}>지역</SortTh>
                        <SortTh sortKey="target" sort={regionSort} onSort={onRegionSort}>전체 대상</SortTh>
                        <SortTh sortKey="count" sort={regionSort} onSort={onRegionSort}>미조치 차량</SortTh>
                        <SortTh sortKey="simple" sort={regionSort} onSort={onRegionSort}>단순미세차</SortTh>
                        <SortTh sortKey="impossible" sort={regionSort} onSort={onRegionSort}>세차불가</SortTh>
                        <SortTh sortKey="carryOver" sort={regionSort} onSort={onRegionSort}>이월차량</SortTh>
                        <SortTh sortKey="longRate" sort={regionSort} onSort={onRegionSort}>장기미세차율</SortTh>
                      </tr></thead>
                      <tbody>
                        {regions.map((r,i)=>(
                            <tr key={r.si} className="clickable" onClick={()=>openPopup(`${r.si} 미조치 차량 · ${selectedWk}`,r.vehicles,overdueCols,`${selectedWk}_${r.si}_미조치.xlsx`)}>
                              <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                              <td><strong>{r.si}</strong></td>
                              <td>{r.target?fmt(r.target)+'대':'-'}</td>
                              <td><span className="badge badge-red">{r.count}대</span></td>
                              <td style={{color:'#F79009'}}>{r.simple}대</td>
                              <td style={{color:RED}}>{r.impossible}대</td>
                              <td style={{color:'#7C3AED'}}>{r.carryOver}대</td>
                              <td><span className={`badge ${r.longRate>=20?'badge-red':r.longRate>=10?'badge-orange':'badge-green'}`}>{r.longRate}%</span></td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title="구/군별 상세 (세분화, 상위 20)" badge="세분화">
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr>
                        <th>순위</th>
                        <SortTh sortKey="si" sort={districtSort} onSort={onDistrictSort}>시/도</SortTh>
                        <SortTh sortKey="gu" sort={districtSort} onSort={onDistrictSort}>구/군</SortTh>
                        <SortTh sortKey="target" sort={districtSort} onSort={onDistrictSort}>전체 대상</SortTh>
                        <SortTh sortKey="count" sort={districtSort} onSort={onDistrictSort}>미조치 차량</SortTh>
                        <SortTh sortKey="simple" sort={districtSort} onSort={onDistrictSort}>단순미세차</SortTh>
                        <SortTh sortKey="impossible" sort={districtSort} onSort={onDistrictSort}>세차불가</SortTh>
                        <SortTh sortKey="longRate" sort={districtSort} onSort={onDistrictSort}>장기미세차율</SortTh>
                      </tr></thead>
                      <tbody>
                        {districts.slice(0,20).map((d,i)=>(
                            <tr key={d.key} className="clickable" onClick={()=>openPopup(`${d.si} ${d.gu} 미조치 차량 · ${selectedWk}`,d.vehicles,overdueCols,`${selectedWk}_${d.si}${d.gu}_미조치.xlsx`)}>
                              <td><span className={`rank ${i<3?'top':''}`}>{i+1}</span></td>
                              <td>{d.si}</td>
                              <td><strong>{d.gu}</strong></td>
                              <td>{d.target?fmt(d.target)+'대':'-'}</td>
                              <td><span className="badge badge-red">{d.count}대</span></td>
                              <td style={{color:'#F79009'}}>{d.simple}대</td>
                              <td style={{color:RED}}>{d.impossible}대</td>
                              <td><span className={`badge ${d.longRate>=20?'badge-red':d.longRate>=10?'badge-orange':'badge-green'}`}>{d.longRate}%</span></td>
                            </tr>
                        ))}
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
            <div className="grid2">
              <Card title="지도 데이터 업로드">
                <p style={{fontSize:12,color:MUTED,marginBottom:12}}>시/도·구/군·세차경과일 컬럼이 있는 세차대상 리스트를 올려주세요.</p>
                <div {...getMapRootProps()} className={`dropzone ${isMapDragActive?'drag':''} s-${mapUploadState}`}>
                  <input {...getMapInputProps()}/>
                  {mapUploadState==='uploading'?<div className="drop-c"><div className="spin"/><span>분석 중...</span></div>:<div className="drop-c"><div style={{fontSize:28}}>🗺️</div><p>Excel 파일을 드래그하거나 클릭</p><span>.xlsx · .xls</span></div>}
                </div>
                {mapUploadMsg&&<div className={`up-msg ${mapUploadState}`}>{mapUploadMsg}</div>}
              </Card>
              <Card title="업로드된 지도 스냅샷 목록">
                {mapSnapshots.length===0?<p style={{fontSize:13,color:MUTED}}>아직 업로드된 지도 데이터가 없습니다</p>:(
                  <div className="week-list">
                    {mapSnapshots.map((s,i)=>(
                      <div key={s.label} className="week-item">
                        <span className="week-dot-sm" style={{background:wc(i)}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace'}}>{s.label}</div>
                          <div style={{fontSize:11,color:MUTED}}>{fmt(s.total_count)}대 · {dateOnly(s.uploaded_at)}</div>
                        </div>
                        <button className="del-btn" onClick={async()=>{
                          if(!confirm(`${s.label} 지도 데이터 삭제?`))return;
                          await fetch(`/api/map/delete?label=${s.label}`,{method:'DELETE'});
                          setMapSnapshots(p=>p.filter(x=>x.label!==s.label));
                          setMapData(p=>{const n={...p};delete n[s.label];return n;});
                          if(selectedMapLabel===s.label)setSelectedMapLabel(mapSnapshots.filter(x=>x.label!==s.label)[0]?.label||'');
                        }}>🗑</button>
                      </div>
                    ))}
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
        .nav-parent{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:none;background:transparent;border-radius:10px;font-size:14px;font-weight:800;color:#424D5C;transition:all .15s;text-align:left;cursor:pointer;}
        .nav-parent:hover{background:#F6F7F9;color:#212121;}
        .nav-parent.active{background:#FFF4EB;color:#FF8021;}
        .nav-icon{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .nav-arrow{margin-left:auto;font-size:11px;color:#AEBBCF;transition:transform .2s;}
        .nav-arrow.open{transform:rotate(180deg);color:#FF8021;}
        .nav-children{padding:2px 0 4px 16px;display:flex;flex-direction:column;gap:1px;}
        .nav-child{display:block;width:100%;padding:8px 12px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:700;color:#6D7B8F;text-align:left;cursor:pointer;transition:all .15s;border-left:2px solid #E8ECF0;}
        .nav-child:hover{background:#F6F7F9;color:#212121;}
        .nav-child.active{background:#FFF4EB;color:#FF8021;border-left-color:#FF8021;}

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

        .tbl-wrap{overflow-x:auto;border-radius:10px;}
        .tbl{width:100%;border-collapse:collapse;font-size:12px;table-layout:auto;}
        .tbl th{text-align:left;padding:9px 10px;font-size:10.5px;font-weight:800;color:#8492A5;letter-spacing:.01em;border-bottom:2px solid #E8ECF0;background:#FAFBFC;white-space:nowrap;}
        .tbl th:first-child{padding-left:12px;}
        .tbl td{padding:8px 10px;border-bottom:1px solid #F0F2F5;vertical-align:middle;white-space:nowrap;font-variant-numeric:tabular-nums;}
        .tbl td:first-child{padding-left:12px;}
        .tbl tr:last-child td{border-bottom:none;}
        .tbl tr:hover td{background:#FAFBFC;}
        .tbl tr.clickable{cursor:pointer;}
        .tbl tr.clickable:hover td{background:#FFF4EB;}
        .clickable{cursor:pointer;}
        .sortable-th:hover{color:#FF8021;}

        .badge{display:inline-block;padding:2px 7px;border-radius:6px;font-size:10.5px;font-weight:800;white-space:nowrap;}
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
