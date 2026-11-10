
function collectRows(data){const candidates=[];const seen=new Set();function walk(v,d=0){if(d>8||v==null)return;if(Array.isArray(v)){if(v.length&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))candidates.push(v);for(const x of v)walk(x,d+1);return}if(typeof v!=='object')return;for(const [k,val] of Object.entries(v)){if(Array.isArray(val)&&/item|items|row|rows|list|data/i.test(k))candidates.push(val);walk(val,d+1)}}walk(data);candidates.sort((a,b)=>b.length-a.length);const rows=candidates[0]||[];return rows.filter(x=>{if(!x||typeof x!=='object'||Array.isArray(x))return false;const sig=JSON.stringify(x);if(seen.has(sig))return false;seen.add(sig);return true})}
function parseApiText(text){try{return{data:JSON.parse(text),format:'json'}}catch{return{data:null,format:'text',error:String(text).slice(0,400)}}}
function clean(v){return String(v??'').trim()}
function normalizeKey(v=''){const s=clean(v);try{return s.includes('%')?decodeURIComponent(s):s}catch{return s}}
async function call(url,ms=6000){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),ms);try{const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'PARK-SANGBEOM-SALES-DESK/1.0'}});const t=await r.text();const p=parseApiText(t);if(!p.data)throw new Error(p.error||`HTTP ${r.status}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);return {rows:collectRows(p.data),raw:p.data}}finally{clearTimeout(timer)}}
function brandUrl(key,page,rows,year){const u=new URL('https://apis.data.go.kr/1130000/FftcBrandRlsInfo2_Service/getBrandinfo');u.searchParams.set('serviceKey',key);u.searchParams.set('pageNo',String(page));u.searchParams.set('numOfRows',String(rows));u.searchParams.set('resultType','json');if(year)u.searchParams.set('jngBizCrtrYr',String(year));return u}
function statsUrl(key,page,rows,year){const u=new URL('https://apis.data.go.kr/1130000/FftcBrandFrcsBzmnIntgInfoEatoutTpbizStats2_Service/getBrandFrcsBzmnIntgInfoEatoutTpbiz2');u.searchParams.set('serviceKey',key);u.searchParams.set('pageNo',String(page));u.searchParams.set('numOfRows',String(rows));u.searchParams.set('resultType','json');if(year)u.searchParams.set('jngBizCrtrYr',String(year));return u}
function pick(o,keys){for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&clean(v)!=='')return clean(v)}return ''}
function norm(v){return clean(v).toLowerCase().replace(/주식회사|\(주\)|㈜|유한회사/g,'').replace(/[^0-9a-z가-힣]/g,'')}
function keyOf(r){return pick(r,['brandManageNo','BRAND_MANAGE_NO','frcsBrdMgtNo','frcsBrndMgtNo','jngBrndMgtNo','브랜드관리번호'])||pick(r,['headOfficeManageNo','frcsHdqrtrsMgtNo','jnghdqrtrsMgtNo','가맹본부관리번호'])||norm(pick(r,['brandName','BRAND_NAME','brdNm','브랜드명','jngBrndNm','frcsBrndNm']))}
function merge(a,b){return {...a,...Object.fromEntries(Object.entries(b||{}).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=='')),_brandList:a,_stats:b}}
module.exports=async function handler(req,res){
 try{
  const rawKey=process.env.DATA_GO_KR_SERVICE_KEY;if(!rawKey)return res.status(500).json({error:'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.'});
  const key=normalizeKey(rawKey),page=Math.max(1,Number(req.query.page||1)),rows=Math.min(150,Math.max(1,Number(req.query.rows||100))),keyword=clean(req.query.keyword);
  const warnings=[];let brands=[],selectedYear='';
  // 1) 먼저 기준연도 없이 가장 가볍게 조회
  try{const out=await call(brandUrl(key,page,rows,''),5500);brands=out.rows;if(!brands.length)warnings.push('기준연도 없는 브랜드 조회 0건')}catch(e){warnings.push(`브랜드 기본조회: ${e?.name==='AbortError'?'응답시간 초과':e.message}`)}
  // 2) 0건이면 최근 공개 가능 연도를 폭넓게 역순 탐색
  if(!brands.length){const thisYear=new Date().getFullYear();for(let y=thisYear-1;y>=2019;y--){try{const out=await call(brandUrl(key,page,rows,y),4500);if(out.rows.length){brands=out.rows;selectedYear=y;break}warnings.push(`${y}년 0건`)}catch(e){warnings.push(`${y}년 ${e?.name==='AbortError'?'시간초과':e.message}`);if(warnings.length>5)break}}}
  let stats=[];
  if(brands.length && selectedYear){try{stats=(await call(statsUrl(key,page,Math.min(rows,100),selectedYear),4500)).rows}catch(e){warnings.push(`외식업 통계: ${e?.name==='AbortError'?'응답시간 초과':e.message}`)}}
  const sm=new Map();for(const r of stats){const k=keyOf(r);if(k)sm.set(k,r)}
  let merged=brands.map(b=>{const k=keyOf(b);return k&&sm.has(k)?merge(b,sm.get(k)):{...b,_brandList:b}});
  if(keyword){const q=norm(keyword);merged=merged.filter(r=>norm([pick(r,['brandName','BRAND_NAME','brdNm','브랜드명','jngBrndNm','frcsBrndNm']),pick(r,['corpNm','frcsHqNm','가맹본부상호명','jnghdqrtrsNm','frcsHdqrtrsNm']),pick(r,['mainProductName','mnPrdlstNm','주요상품명','mainProductNm']),pick(r,['industryNm','업종명','lsClsNm','midClsNm'])].join(' ')).includes(q))}
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
  return res.status(200).json({source:'FTC Franchise',service:'15125467',year:selectedYear||null,rows:merged,meta:{brandRows:brands.length,statsRows:stats.length,warnings:warnings.slice(0,8)}})
 }catch(e){return res.status(500).json({error:e?.message||'프랜차이즈 조회 오류'})}
}
