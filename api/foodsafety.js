
function clean(v){ return String(v ?? '').trim(); }
function pick(r, keys){ for (const k of keys) { const v=r?.[k]; if(v!==undefined&&v!==null&&String(v).trim()!=='') return String(v).trim(); } return ''; }
function uniqBy(rows,keyFn){ const m=new Map(); for(const r of rows||[]){const k=keyFn(r); if(k&&!m.has(k))m.set(k,r)} return [...m.values()]; }
async function foodSafetyCall(service,{start=1,end=100,params={}}={}){
 const key=process.env.FOODSAFETY_API_KEY; if(!key) throw new Error('FOODSAFETY_API_KEY가 설정되지 않았습니다.');
 const maxEnd=Math.min(Number(end)||100,(Number(start)||1)+999);
 const parts=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&clean(v)!=='').map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(clean(v))}`);
 const suffix=parts.length?'/'+parts.join('&'):'';
 const url=`https://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(key)}/${service}/json/${Number(start)||1}/${maxEnd}${suffix}`;
 const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),8000);
 let upstream,text; try{upstream=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'PARK-SANGBEOM-SALES-DESK/1.0'}}); text=await upstream.text();} finally{clearTimeout(t)}
 let data; try{data=JSON.parse(text)}catch{throw new Error(`${service} 응답 JSON 오류: ${String(text).slice(0,180)}`)}
 const block=data?.[service]||data?.[Object.keys(data||{})[0]]||{}; const result=block.RESULT||block.result||{}; const code=clean(result.CODE||result.code);
 if(code==='INFO-200') return {rows:[],total:0,code,message:clean(result.MSG||result.msg)};
 if(code&&code!=='INFO-000'){const e=new Error(clean(result.MSG||result.msg)||`${service} 오류 ${code}`);e.code=code;e.service=service;throw e}
 const rows=Array.isArray(block.row)?block.row:[]; return {rows,total:Number(block.total_count||rows.length),code:code||'INFO-000',message:clean(result.MSG||result.msg)};
}


function ymd(v){ return String(v||'').replace(/\D/g,'').slice(0,8); }
function normDate(v){ const s=ymd(v); return s.length===8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : ''; }
function companyKey(r){ return pick(r,['LCNS_NO']) || `${pick(r,['BSSH_NM'])}|${pick(r,['SITE_ADDR','ADDR','LOCP_ADDR'])}`; }
function baseRow(r, sourceService){
  return {
    sourceService,
    LCNS_NO: pick(r,['LCNS_NO']),
    BSSH_NM: pick(r,['BSSH_NM']),
    PRSDNT_NM: pick(r,['PRSDNT_NM']),
    INDUTY_CD_NM: pick(r,['INDUTY_CD_NM','INDUTY_CDNM','INDUTY_NM']),
    TELNO: pick(r,['TELNO']),
    ADDR: pick(r,['SITE_ADDR','ADDR','LOCP_ADDR']),
    PRMS_DT: pick(r,['PRMS_DT']),
    CHNG_DT: pick(r,['CHNG_DT','LAST_UPDT_DTM']),
    changeType: pick(r,['LCNS_LEDG_CI_CDNM']),
    productNames: [], rawMaterials: [], production: [],
    _raw:r
  };
}
function mergeInto(a,b){
  for (const k of ['LCNS_NO','BSSH_NM','PRSDNT_NM','INDUTY_CD_NM','TELNO','ADDR','PRMS_DT','CHNG_DT','changeType']) if(!a[k] && b[k]) a[k]=b[k];
  return a;
}
async function enrichBase(rows, limit=12){
  const targets = rows.slice(0,limit);
  await Promise.all(targets.map(async r => {
    const params = r.LCNS_NO ? {LCNS_NO:r.LCNS_NO} : {BSSH_NM:r.BSSH_NM};
    try {
      const j = await foodSafetyCall('I2500',{start:1,end:5,params});
      if(j.rows[0]) mergeInto(r, baseRow(j.rows[0],'I2500'));
    } catch {}
  }));
  return rows;
}

module.exports=async function handler(req,res){
  try{
    const mode = String(req.query.mode || 'recent');
    const from = ymd(req.query.from);
    const keyword = String(req.query.keyword || '').trim();
    const industry = String(req.query.industry || '').trim();
    const region = String(req.query.region || '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page)||1);
    const requestedRows = Math.min(300, Math.max(20, Number(req.query.rows)||200));
    const perServiceRows = Math.max(10, Math.ceil(requestedRows/2));
    const start = (page-1)*perServiceRows + 1;
    const end = start + perServiceRows - 1;
    let rows=[]; let meta={services:[],page,requestedRows};

    if(mode === 'material' || (mode==='search' && keyword)){
      if(!keyword) return res.status(400).json({error:'원재료/품목 검색어를 입력하세요.'});
      const [mat, prod] = await Promise.all([
        foodSafetyCall('C002',{start,end,params:{RAWMTRL_NM:keyword}}).catch(e=>({rows:[],warning:e.message})),
        foodSafetyCall('I1250',{start,end,params:{PRDLST_NM:keyword}}).catch(e=>({rows:[],warning:e.message}))
      ]);
      const map=new Map();
      const add=(r,kind)=>{
        const k=companyKey(r); if(!k)return;
        if(!map.has(k))map.set(k,baseRow(r,kind==='material'?'C002':'I1250'));
        const x=map.get(k);
        const pn=pick(r,['PRDLST_NM']); const rm=pick(r,['RAWMTRL_NM']);
        if(pn && !x.productNames.includes(pn))x.productNames.push(pn);
        if(rm && !x.rawMaterials.includes(rm))x.rawMaterials.push(rm);
        if(!x.PRMS_DT)x.PRMS_DT=pick(r,['PRMS_DT']); if(!x.CHNG_DT)x.CHNG_DT=pick(r,['CHNG_DT']);
      };
      mat.rows.forEach(r=>add(r,'material')); prod.rows.forEach(r=>add(r,'product'));
      rows=[...map.values()];
      await enrichBase(rows,15);
      meta={services:['C002','I1250','I2500'],page,requestedRows,materialCount:mat.rows.length,productCount:prod.rows.length,hasMore:mat.rows.length>=perServiceRows||prod.rows.length>=perServiceRows,warnings:[mat.warning,prod.warning].filter(Boolean)};
    } else if(mode === 'company' && keyword){
      const [base, restaurant] = await Promise.all([
        foodSafetyCall('I2500',{start,end,params:{BSSH_NM:keyword}}).catch(e=>({rows:[],warning:e.message})),
        foodSafetyCall('I1200',{start,end,params:{BSSH_NM:keyword}}).catch(e=>({rows:[],warning:e.message}))
      ]);
      rows = uniqBy([...base.rows.map(r=>baseRow(r,'I2500')),...restaurant.rows.map(r=>baseRow(r,'I1200'))],companyKey);
      meta={services:['I2500','I1200'],page,requestedRows,hasMore:base.rows.length>=perServiceRows||restaurant.rows.length>=perServiceRows,warnings:[base.warning,restaurant.warning].filter(Boolean)};
    } else {
      // 최근 신규/변경 기본조회는 가벼운 변경이력 API만 사용한다.
      // I2859 = 식품업소 인허가 변경 정보, I2861 = 음식점업소 인허가 변경 정보.
      // 상세/품목/원재료/생산실적은 카드의 영업정보에서 별도 보강한다.
      const now=new Date();
      const fmt=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      const sevenDaysAgo=new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
      const minAllowed=fmt(sevenDaysAgo);
      const requested=from || minAllowed;
      const pickedDate = requested < minAllowed ? minAllowed : requested;
      const params={CHNG_DT:pickedDate}; if(keyword)params.BSSH_NM=keyword;
      const [foodChanges, restaurantChanges] = await Promise.all([
        foodSafetyCall('I2859',{start,end,params}).catch(e=>({rows:[],warning:`I2859: ${e.message}`})),
        foodSafetyCall('I2861',{start,end,params}).catch(e=>({rows:[],warning:`I2861: ${e.message}`}))
      ]);
      const map=new Map();
      for(const r of [...foodChanges.rows.map(x=>baseRow(x,'I2859')),...restaurantChanges.rows.map(x=>baseRow(x,'I2861'))]){
        const k=companyKey(r); if(!k)continue; if(!map.has(k))map.set(k,r); else mergeInto(map.get(k),r);
      }
      rows=[...map.values()];
      meta={
        services:['I2859','I2861'],page,requestedRows,
        actualFrom:pickedDate,
        hasMore:foodChanges.rows.length>=perServiceRows||restaurantChanges.rows.length>=perServiceRows,
        attempts:[{from:pickedDate,food:foodChanges.rows.length,restaurant:restaurantChanges.rows.length,clamped:requested!==pickedDate}],
        warnings:[foodChanges.warning,restaurantChanges.warning].filter(Boolean)
      };
    }

    if(industry) rows=rows.filter(r=>(r.INDUTY_CD_NM||'').includes(industry));
    if(region) rows=rows.filter(r=>(r.ADDR||'').toLowerCase().includes(region));
    rows.sort((a,b)=>(ymd(b.CHNG_DT||b.PRMS_DT)).localeCompare(ymd(a.CHNG_DT||a.PRMS_DT)));
    rows=rows.slice(0,requestedRows).map(r=>({...r,displayDate:normDate(r.CHNG_DT||r.PRMS_DT)}));
    res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({source:'FoodSafetyKorea',mode,total:rows.length,rows,meta});
  }catch(e){ return res.status(500).json({error:e?.message||'서버 오류',code:e?.code||'',service:e?.service||''}); }
}
