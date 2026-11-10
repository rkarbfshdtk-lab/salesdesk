
function collectRows(data){const candidates=[];const seen=new Set();function walk(v,d=0){if(d>8||v==null)return;if(Array.isArray(v)){if(v.length&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))candidates.push(v);for(const x of v)walk(x,d+1);return}if(typeof v!=='object')return;for(const [k,val] of Object.entries(v)){if(Array.isArray(val)&&/item|items|row|rows|list|data/i.test(k))candidates.push(val);walk(val,d+1)}}walk(data);candidates.sort((a,b)=>b.length-a.length);const rows=candidates[0]||[];return rows.filter(x=>{if(!x||typeof x!=='object'||Array.isArray(x))return false;const sig=JSON.stringify(x);if(seen.has(sig))return false;seen.add(sig);return true})}
function parseApiText(text){try{return{data:JSON.parse(text),format:'json'}}catch{return{data:null,format:'text',error:String(text).slice(0,400)}}}
function normalizeKey(v=''){
  const s=String(v||'').trim();
  try { return s.includes('%') ? decodeURIComponent(s) : s; } catch { return s; }
}
async function fetchText(url, ms=6000){
  const ctl=new AbortController();
  const t=setTimeout(()=>ctl.abort(),ms);
  try{
    const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'PARK-SANGBEOM-SALES-DESK/1.0'}});
    const text=await r.text();
    return {r,text};
  } finally { clearTimeout(t); }
}
function totalCount(data){
  return Number(data?.response?.body?.totalCount ?? data?.body?.totalCount ?? data?.totalCount ?? 0) || 0;
}
function apiMessage(data){
  return data?.response?.header?.resultMsg || data?.header?.resultMsg || data?.resultMsg || '';
}
async function primary(key,pageNo,numOfRows,keyword){
  const base='https://apis.data.go.kr/B553748/CertCompanyListService2/getCertCompanyListService2';
  const qs=new URLSearchParams({ServiceKey:key,pageNo:String(pageNo),numOfRows:String(numOfRows),returnType:'json'});
  if(keyword)qs.set('company',keyword);
  const {r,text}=await fetchText(`${base}?${qs.toString()}`,6000);
  const parsed=parseApiText(text);
  if(!parsed.data)throw new Error(parsed.error||`HACCP HTTP ${r.status}`);
  if(!r.ok)throw new Error(apiMessage(parsed.data)||`HACCP HTTP ${r.status}`);
  return {rows:collectRows(parsed.data),raw:parsed.data,service:'15033311'};
}
async function fallbackFoodCompany(key,pageNo,numOfRows){
  const base='https://apis.data.go.kr/B553748/FoodCompanyListService/getFoodCompanyList';
  const qs=new URLSearchParams({ServiceKey:key,retunType:'json',pageNo:String(pageNo),numOfRows:String(Math.min(numOfRows,100))});
  const {r,text}=await fetchText(`${base}?${qs.toString()}`,5000);
  const parsed=parseApiText(text);
  if(!parsed.data)throw new Error(parsed.error||`HACCP 제조가공 HTTP ${r.status}`);
  if(!r.ok)throw new Error(apiMessage(parsed.data)||`HACCP 제조가공 HTTP ${r.status}`);
  return {rows:collectRows(parsed.data),raw:parsed.data,service:'15065475'};
}
module.exports=async function handler(req,res){
  try{
    const rawKey=process.env.DATA_GO_KR_SERVICE_KEY;
    if(!rawKey)return res.status(500).json({error:'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.'});
    const key=normalizeKey(rawKey),pageNo=Math.max(1,Number(req.query.page||1)),numOfRows=Math.min(50,Math.max(1,Number(req.query.rows||20))),keyword=String(req.query.keyword||'').trim();
    const warnings=[];
    let out;
    try{out=await primary(key,pageNo,numOfRows,keyword)}catch(e){
      if(e?.name==='AbortError')warnings.push('HACCP 인증업체 API 응답시간 초과'); else warnings.push(`HACCP 인증업체: ${e.message}`);
      try{out=await fallbackFoodCompany(key,pageNo,numOfRows)}catch(f){
        if(f?.name==='AbortError')warnings.push('HACCP 제조가공 API 응답시간 초과'); else warnings.push(`HACCP 제조가공: ${f.message}`);
      }
    }
    if(!out)return res.status(504).json({error:'HACCP 원기관 응답이 지연되고 있습니다. 잠시 후 다시 조회해 주세요.',warnings});
    let rows=out.rows||[];
    if(keyword){const q=keyword.replace(/\s+/g,'').toLowerCase();rows=rows.filter(r=>JSON.stringify(r).replace(/\s+/g,'').toLowerCase().includes(q));}
    res.setHeader('Cache-Control','s-maxage=180, stale-while-revalidate=600');
    return res.status(200).json({source:'HACCP',service:out.service,rows,meta:{count:rows.length,totalCount:totalCount(out.raw),pageNo,numOfRows,keyword,warnings}});
  }catch(e){
    if(e?.name==='AbortError')return res.status(504).json({error:'HACCP 원기관 API 응답시간 초과'});
    return res.status(500).json({error:e?.message||'HACCP 조회 오류'});
  }
}
