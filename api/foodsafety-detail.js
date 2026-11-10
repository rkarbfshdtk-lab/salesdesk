
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


function num(v){ const n=Number(String(v??'').replace(/,/g,'')); return Number.isFinite(n)?n:0; }
function uniq(arr){ return [...new Set((arr||[]).filter(Boolean))]; }
module.exports=async function handler(req,res){
  try{
    const license=String(req.query.license||'').trim();
    const company=String(req.query.company||'').trim();
    if(!license && !company) return res.status(400).json({error:'인허가번호 또는 업체명이 필요합니다.'});
    const params=license?{LCNS_NO:license}:{BSSH_NM:company};
    const currentYear=new Date().getFullYear();
    const productionYears=[currentYear-1,currentYear-2,currentYear-3];
    const calls=[
      ['I2500',foodSafetyCall('I2500',{start:1,end:20,params})],
      ['I1200',foodSafetyCall('I1200',{start:1,end:20,params})],
      ['I1250',foodSafetyCall('I1250',{start:1,end:500,params})],
      ['C002',foodSafetyCall('C002',{start:1,end:1000,params})]
    ];
    const prodCalls=productionYears.map(y=>[`I0300-${y}`,foodSafetyCall('I0300',{start:1,end:1000,params:{...params,EVL_YR:String(y)}})]);
    const settled=await Promise.allSettled([...calls.map(x=>x[1]),...prodCalls.map(x=>x[1])]);
    const names=[...calls.map(x=>x[0]),...prodCalls.map(x=>x[0])];
    const got={}; const warnings=[];
    settled.forEach((s,i)=>{if(s.status==='fulfilled')got[names[i]]=s.value.rows;else warnings.push(`${names[i]}: ${s.reason?.message||'조회 실패'}`)});
    const base=(got.I2500?.[0]||got.I1200?.[0]||{});
    const products=got.I1250||[]; const materials=got.C002||[];
    const production=productionYears.flatMap(y=>(got[`I0300-${y}`]||[]).map(r=>({...r,_year:y})));
    const productNames=uniq(products.map(r=>pick(r,['PRDLST_NM'])).concat(materials.map(r=>pick(r,['PRDLST_NM']))).concat(production.map(r=>pick(r,['PRDLST_NM'])))).slice(0,80);
    const rawMaterials=uniq(materials.map(r=>pick(r,['RAWMTRL_NM']))).slice(0,120);
    const seafoodMaterials=rawMaterials.filter(x=>/새우|쉬림프|shrimp|주꾸미|쭈꾸미|낙지|오징어|갑오징어|문어|홍합|바지락|가리비|게|크랩|수산|어류|생선/i.test(x));
    const productionSummary=production.map(r=>({year:pick(r,['EVL_YR'])||r._year,product:pick(r,['PRDLST_NM']),type:pick(r,['H_ITEM_NM']),capacity:num(pick(r,['FYER_PRDCTN_ABRT_QY'])),quantity:num(pick(r,['PRDCTN_QY']))})).filter(x=>x.product||x.quantity||x.capacity);
    const latestYear=Math.max(0,...productionSummary.map(x=>Number(x.year)||0));
    const latestProduction=productionSummary.filter(x=>Number(x.year)===latestYear);
    return res.status(200).json({
      company:pick(base,['BSSH_NM'])||company,license:pick(base,['LCNS_NO'])||license,
      president:pick(base,['PRSDNT_NM']),industry:pick(base,['INDUTY_CD_NM','INDUTY_NM']),
      phone:pick(base,['TELNO']),address:pick(base,['ADDR','SITE_ADDR','LOCP_ADDR']),permitDate:pick(base,['PRMS_DT']),closedDate:pick(base,['CLSBIZ_DT']),
      hygieneGrade:pick(base,['HG_LV']),products:productNames,rawMaterials,seafoodMaterials,
      latestProductionYear:latestYear||'',production:latestProduction.slice(0,30),warnings
    });
  }catch(e){return res.status(500).json({error:e?.message||'상세조회 오류',code:e?.code||''});}
}
