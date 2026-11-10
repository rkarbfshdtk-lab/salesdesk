function clean(v){return String(v??'').trim()}
function normalizeKey(v=''){const s=clean(v);try{return s.includes('%')?decodeURIComponent(s):s}catch{return s}}
function pick(o,keys){for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&clean(v)!=='')return clean(v)}return ''}
function num(v){const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0}
function collectRows(data){
  const candidates=[];const seen=new Set();
  function walk(v,d=0){
    if(d>10||v==null)return;
    if(Array.isArray(v)){
      if(v.length&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))candidates.push(v);
      for(const x of v)walk(x,d+1);return;
    }
    if(typeof v!=='object')return;
    for(const [k,val] of Object.entries(v)){
      if(Array.isArray(val)&&/item|items|row|rows|list|data|result/i.test(k))candidates.push(val);
      if(val&&typeof val==='object'&&!Array.isArray(val)&&/item|row/i.test(k))candidates.push([val]);
      walk(val,d+1);
    }
  }
  walk(data);
  candidates.sort((a,b)=>b.length-a.length);
  const rows=candidates[0]||[];
  return rows.filter(x=>{if(!x||typeof x!=='object'||Array.isArray(x))return false;const sig=JSON.stringify(x);if(seen.has(sig))return false;seen.add(sig);return true});
}
function findMeta(data){
  let total=null,resultCode='',resultMsg='';
  function walk(v,d=0){if(d>8||v==null||typeof v!=='object')return;for(const [k,val] of Object.entries(v)){
    const lk=k.toLowerCase();
    if(total===null&&/(totalcount|totalcnt|total_count)/.test(lk)&&!Number.isNaN(Number(val)))total=Number(val);
    if(!resultCode&&/(resultcode|returncode|code)/.test(lk)&&typeof val!=='object')resultCode=clean(val);
    if(!resultMsg&&/(resultmsg|returnmsg|message|msg)/.test(lk)&&typeof val!=='object')resultMsg=clean(val);
    if(val&&typeof val==='object')walk(val,d+1);
  }}walk(data);return{total,resultCode,resultMsg};
}
async function callJson(url,ms=9000){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),ms);
  try{
    const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'PARK-SANGBEOM-SALES-DESK/1.0','Accept':'application/json'}});
    const text=await r.text();let data=null;
    try{data=JSON.parse(text)}catch{throw new Error(`비JSON 응답 HTTP ${r.status}: ${text.slice(0,180)}`)}
    const meta=findMeta(data);
    if(!r.ok)throw new Error(`HTTP ${r.status}${meta.resultMsg?` · ${meta.resultMsg}`:''}`);
    return{rows:collectRows(data),raw:data,meta,status:r.status};
  }finally{clearTimeout(timer)}
}
function makeUrl(base,path,key,page,rows,extra={}){
  const u=new URL(`${base}/${path}`);u.searchParams.set('serviceKey',key);u.searchParams.set('pageNo',String(page));u.searchParams.set('numOfRows',String(rows));u.searchParams.set('resultType','json');
  for(const [k,v] of Object.entries(extra)){if(v!==''&&v!==null&&v!==undefined)u.searchParams.set(k,String(v))}
  return u;
}
function canonicalize(r,source){
  const brand=pick(r,['BRAND_NM','brandNm','brandName','brdNm','jngBrndNm','frcsBrndNm','브랜드명']);
  const hq=pick(r,['JNGHQ_NM','jnghqNm','frcsHdqrtrsNm','jnghdqrtrsNm','frcsHqNm','headOfficeName','corpNm','가맹본부상호명','가맹본부명','법인명']);
  const major=pick(r,['MAIN_PRDLST_NM','mainPrdlstNm','mnPrdlstNm','mainProductName','mainProductNm','주요상품명']);
  const industryLarge=pick(r,['TPBIZ_LCLSF_NM','tpbizLclsfNm','lsClsNm','industryLargeNm','업종대분류명']);
  const industryMid=pick(r,['TPBIZ_MCLSF_NM','tpbizMclsfNm','midClsNm','industryNm','업종중분류명','업종명']);
  const year=pick(r,['JNG_BIZ_CRTR_YR','jngBizCrtrYr','baseYear','가맹사업기준년도','기준년도']);
  return{
    _source:source,_raw:r,
    brandName:brand,headOfficeName:hq,corpNm:pick(r,['CORP_NM','corpNm','법인명'])||hq,
    representative:pick(r,['JNGHQ_RPRSV_NM','jnghqRprsvNm','jnghdqrtrsRprsvNm','representative','rprsvNm','가맹본부대표자명','대표자명']),
    businessNo:pick(r,['BIZRNO','bizrNo','bsnmNo','businessNo','사업자등록번호']),
    brandManageNo:pick(r,['BRAND_MNG_NO','brandMngNo','brandManageNo','frcsBrndMgtNo','jngBrndMgtNo','브랜드관리번호']),
    headOfficeManageNo:pick(r,['JNGHQ_MNG_NO','jnghqMngNo','headOfficeManageNo','frcsHdqrtrsMgtNo','jnghdqrtrsMgtNo','가맹본부관리번호']),
    mainProductName:major,industryNm:[industryLarge,industryMid].filter(Boolean).join(' / '),midIndustryNm:industryMid,
    baseYear:year,
    franchiseStoreCount:num(pick(r,['FRCSTR_CNT','frcstrCnt','FRCSTOR_CO','frcsStorCo','frcsStoreCnt','franchiseStoreCount','가맹점수'])),
    directStoreCount:num(pick(r,['DRCTSTOR_CNT','drctstorCnt','DRCT_STOR_CO','drctStorCo','directStoreCnt','directStoreCount','직영점수'])),
    avgSales:num(pick(r,['AVG_SLS_AMT','avgSlsAmt','FRCSTR_AVG_SLS_AMT','frcsAvgSlsAmt','평균매출액'])),
    annualSales:num(pick(r,['ANLS_SLS_AMT','anlsSlsAmt','YR_SLS_AMT','yrSlsAmt','annualSales','연간매출액'])),
    address:pick(r,['ADDR','addr','ADDRESS','address','JNGHQ_ADDR','jnghqAddr','frcsHdqrtrsAdres','jnghdqrtrsAdres','소재지','주소']),
    phone:pick(r,['TELNO','telno','TEL','tel','PHONE','phone','전화번호']),fax:pick(r,['FAX_NO','faxNo','FAX','fax','팩스번호'])
  }
}
function norm(v){return clean(v).toLowerCase().replace(/주식회사|\(주\)|㈜|유한회사/g,'').replace(/[^0-9a-z가-힣]/g,'')}
function dedupe(rows){const out=[],seen=new Set();for(const r of rows){const k=r.brandManageNo||`${norm(r.brandName)}|${norm(r.headOfficeName)}`;if(!k||seen.has(k))continue;seen.add(k);out.push(r)}return out}
module.exports=async function handler(req,res){
  try{
    const rawKey=process.env.DATA_GO_KR_SERVICE_KEY;if(!rawKey)return res.status(500).json({error:'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.'});
    const key=normalizeKey(rawKey),page=Math.max(1,Number(req.query.page||req.query.pageNo||1)),rows=Math.min(100,Math.max(1,Number(req.query.rows||req.query.numOfRows||30))),keyword=clean(req.query.keyword);
    const warnings=[];let primary=[],legacy=[],primaryMeta=null,legacyMeta=null;

    const years=[new Date().getFullYear()-1,new Date().getFullYear()-2,new Date().getFullYear()-3,2023,2022,2021,2020].filter((v,i,a)=>v>=2017&&a.indexOf(v)===i);

    // 1순위: AI친화 외식업 통합정보 (15165094)
    // 공식 명세상 jngBizCrtrYr(가맹사업기준년도)가 필수다.
    for(const year of years){
      try{
        const u=makeUrl(
          'https://apis.data.go.kr/1130000/FftcBrandFrcsBzmnIntgInfoEatoutTpbizStats2_Service',
          'getBrandFrcsBzmnIntgInfoEatoutTpbiz2',
          key,page,rows,{jngBizCrtrYr:year}
        );
        const out=await callJson(u,9000);
        primaryMeta={...out.meta,year};
        const got=out.rows.map(r=>canonicalize(r,'15165094'));
        if(got.length){primary=got;break}
        warnings.push(`15165094 ${year}년 0건${out.meta.resultMsg?` · ${out.meta.resultMsg}`:''}`);
      }catch(e){
        warnings.push(`15165094 ${year}년 ${e?.name==='AbortError'?'응답시간 초과':e.message}`);
      }
    }

    // 2순위: 기존 브랜드 목록 (15125467)
    // FTC 계열 서비스마다 기준년도 파라미터 표기가 달라 두 표기를 함께 전송한다.
    if(!primary.length){
      for(const year of years){
        try{
          const u=makeUrl(
            'https://apis.data.go.kr/1130000/FftcBrandRlsInfo2_Service',
            'getBrandinfo',
            key,page,rows,{jngBizCrtrYr:year,jngBizCrtraYr:year}
          );
          const out=await callJson(u,7000);
          legacyMeta={...out.meta,year};
          const got=out.rows.map(r=>canonicalize(r,'15125467'));
          if(got.length){legacy=got;break}
          warnings.push(`15125467 ${year}년 0건${out.meta.resultMsg?` · ${out.meta.resultMsg}`:''}`);
        }catch(e){
          warnings.push(`15125467 ${year}년 ${e?.name==='AbortError'?'시간초과':e.message}`);
        }
      }
    }

    let finalRows=dedupe(primary.length?primary:legacy);
    if(keyword){const q=norm(keyword);finalRows=finalRows.filter(r=>norm([r.brandName,r.headOfficeName,r.corpNm,r.mainProductName,r.industryNm].join(' ')).includes(q))}
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({source:'FTC Franchise',service:primary.length?'15165094':'15125467',year:(primaryMeta&&primaryMeta.year)||(legacyMeta&&legacyMeta.year)||null,rows:finalRows,meta:{page,requestedRows:rows,primaryRows:primary.length,legacyRows:legacy.length,primaryMeta,legacyMeta,warnings:warnings.slice(0,12)}});
  }catch(e){return res.status(500).json({error:e?.message||'프랜차이즈 조회 오류'})}
}
