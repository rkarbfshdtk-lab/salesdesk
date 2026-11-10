function clean(s=''){return String(s??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()}
function norm(s=''){return clean(s).toLowerCase().replace(/주식회사|\(주\)|㈜|유한회사|농업회사법인|영어조합법인/g,'').replace(/[^0-9a-z가-힣]/g,'')}
function pick(o,keys){for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim()}return ''}
function rowsFrom(v){const out=[];const seen=new Set();function walk(x,d=0){if(d>9||x==null)return;if(Array.isArray(x)){if(x.length&&x.some(y=>y&&typeof y==='object'&&!Array.isArray(y)))out.push(x);for(const y of x)walk(y,d+1);return}if(typeof x==='object')for(const y of Object.values(x))walk(y,d+1)}walk(v);out.sort((a,b)=>b.length-a.length);for(const a of out){const good=a.filter(x=>x&&typeof x==='object'&&!Array.isArray(x));if(good.length)return good.filter(x=>{const z=JSON.stringify(x);if(seen.has(z))return false;seen.add(z);return true})}return []}
function phone(v=''){const s=clean(v);if(!s||s.includes('*'))return '';const d=s.replace(/[^0-9]/g,'');return d.length>=8?s:''}
function addrTokens(s=''){return clean(s).split(/\s+/).filter(x=>x.length>=2).slice(0,6)}
function scoreRow(r,company,address){
 const name=pick(r,['bplcNm','BPLCNM','bsshNm','BSSH_NM','company','COMPANY','companyNm','COMPANY_NM','업체명','사업장명','상호명']);
 let sc=0,a=norm(name),b=norm(company);if(a&&b){if(a===b)sc+=75;else if(a.includes(b)||b.includes(a))sc+=52;}
 const ad=pick(r,['rdnWhlAddr','RDNWHLADDR','siteWhlAddr','SITEWHLADDR','roadAddress','ROAD_ADDRESS','address','ADDRESS','addr','ADDR','소재지주소','도로명주소']);
 for(const t of addrTokens(address))if(ad.includes(t))sc+=6;
 if(phone(pick(r,['siteTel','SITETEL','tel','TEL','telNo','TELNO','TEL_NO','phone','PHONE','전화번호'])))sc+=10;
 return sc;
}
async function getJson(url){const r=await fetch(url,{headers:{'User-Agent':'PARK-SANGBEOM-SALES-DESK/1.0'}});const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch{};if(!r.ok)throw new Error(`HTTP ${r.status}`);if(!j)throw new Error(txt.slice(0,160)||'JSON 응답 아님');return j}
function keyParam(key){return `serviceKey=${encodeURIComponent(key)}`}
async function tryMois(base,key,company){
 const variants=[
  `?${keyParam(key)}&pageNo=1&numOfRows=100&returnType=json&cond%5BbplcNm%3A%3ALIKE%5D=${encodeURIComponent(company)}`,
  `?${keyParam(key)}&pageNo=1&numOfRows=100&returnType=json&bplcNm=${encodeURIComponent(company)}`,
  `?${keyParam(key)}&pageNo=1&numOfRows=100&returnType=json`
 ];
 let lastErr='';
 for(const qs of variants){try{const j=await getJson(`${base}/info${qs}`);const rows=rowsFrom(j);if(rows.length)return {rows,url:`${base}/info`,ok:true}}catch(e){lastErr=e.message}}
 return {rows:[],ok:false,error:lastErr};
}
async function tryMoisCandidates(candidates,key,company){let errors=[];for(const base of candidates){const r=await tryMois(base,key,company);if(r.rows.length)return {...r,base};if(r.error)errors.push(`${base.split('/').pop()}: ${r.error}`)}return {rows:[],errors}}
async function haccp(key,company){
 const u=new URL('https://apis.data.go.kr/B553748/CertCompanyListService2/getCertCompanyListService2');u.searchParams.set('ServiceKey',key);u.searchParams.set('pageNo','1');u.searchParams.set('numOfRows','100');u.searchParams.set('returnType','json');u.searchParams.set('company',company);
 try{return {rows:rowsFrom(await getJson(u.toString())),ok:true}}catch(e){return {rows:[],ok:false,error:e.message}}
}
module.exports=async function handler(req,res){
 try{
  const key=process.env.DATA_GO_KR_SERVICE_KEY;if(!key)return res.status(500).json({error:'DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.'});
  const company=clean(req.query.company),address=clean(req.query.address);if(!company)return res.status(400).json({error:'업체명이 없습니다.'});
  const sources=[];
  const configs=[
   {name:'행안부 일반음식점',candidates:[process.env.MOIS_GENERAL_RESTAURANT_API_URL,'https://apis.data.go.kr/1741000/general_restaurants','https://apis.data.go.kr/1741000/general_restaurant','https://apis.data.go.kr/1741000/restaurants'].filter(Boolean)},
   {name:'행안부 즉석판매제조가공업',candidates:[process.env.MOIS_INSTANT_FOOD_API_URL,'https://apis.data.go.kr/1741000/instant_food_manufacturing','https://apis.data.go.kr/1741000/instant_sales_manufacturing','https://apis.data.go.kr/1741000/instant_food_manufacturing_processing'].filter(Boolean)},
   {name:'행안부 식품판매업(기타)',candidates:[process.env.MOIS_OTHER_FOOD_RETAILERS_API_URL||'https://apis.data.go.kr/1741000/other_food_retailers']}
  ];
  for(const c of configs){const r=await tryMoisCandidates(c.candidates,key,company);sources.push({name:c.name,rows:r.rows,error:r.errors?.slice(0,2).join(' / ')||''})}
  const h=await haccp(key,company);sources.push({name:'HACCP',rows:h.rows,error:h.error||''});
  const matches=[];
  for(const s of sources)for(const r of s.rows){const sc=scoreRow(r,company,address);if(sc<30)continue;matches.push({source:s.name,score:sc,name:pick(r,['bplcNm','BPLCNM','bsshNm','BSSH_NM','company','COMPANY','companyNm','COMPANY_NM','업체명','사업장명']),phone:phone(pick(r,['siteTel','SITETEL','tel','TEL','telNo','TELNO','TEL_NO','phone','PHONE','전화번호'])),fax:phone(pick(r,['fax','FAX','faxNo','FAX_NO','팩스번호'])),address:pick(r,['rdnWhlAddr','RDNWHLADDR','siteWhlAddr','SITEWHLADDR','address','ADDRESS','addr','ADDR','소재지주소','도로명주소']),president:pick(r,['representative','REPRESENTATIVE','repNm','REP_NM','prsdntNm','PRSDNT_NM','대표자명']),raw:r})}
  matches.sort((a,b)=>(b.phone?15:0)+(b.score||0)-((a.phone?15:0)+(a.score||0)));
  const best=matches.find(x=>x.phone)||matches[0];
  return res.status(200).json({matched:!!best,source:best?.source||'',score:best?.score||0,phone:best?.phone||'',fax:best?.fax||'',address:best?.address||'',president:best?.president||'',matches:matches.slice(0,8).map(({raw,...x})=>x),sourceStatus:sources.map(s=>({source:s.name,rows:s.rows.length,error:s.error||''}))});
 }catch(e){return res.status(500).json({error:e.message||'공공데이터 연락처 보강 오류'});}
}
