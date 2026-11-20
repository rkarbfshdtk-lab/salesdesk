// SALES DESK v7.2 — server-only public data daily lead refresh
// No NAVER/KAKAO data is copied into Supabase. No client-side service-role credential.
const crypto=require('crypto');
function clean(v){return String(v??'').trim()}
function pick(r,keys){for(const k of keys){if(r?.[k]!==undefined&&r[k]!==null&&clean(r[k]))return clean(r[k])}return ''}
function normName(v){return clean(v).toLowerCase().replace(/[\s()（）.,·\-]/g,'').replace(/(주식회사|\(주\)|㈜|유한회사|법인)/g,'')}
function phoneKey(v){let n=clean(v).replace(/\D/g,'');if(n.startsWith('82')&&n.length>=11)n='0'+n.slice(2);return n}
function scoreLead(lead){const text=[lead.company,lead.industry,lead.products].join(' ').toLowerCase();let score=38;const checks=[[/수산|해물|해산|seafood/i,30],[/냉동|가공|제조|원료|haccp/i,12],[/도매|유통|식자재|급식/i,15],[/새우|낙지|쭈꾸미|주꾸미|오징어|연체|조개/i,14]];for(const [r,p] of checks)if(r.test(text))score+=p;return Math.min(100,score)}
function relevant(x){const t=[x.company,x.industry,x.products].join(' ');return /수산|해물|해산|냉동|식품제조|식품가공|식자재|유통|도매|새우|낙지|쭈꾸미|주꾸미|오징어|조개|밀키트|간편식/i.test(t)}
function sourceId(source,r){const direct=source==='foodsafety'?pick(r,['LCNS_NO','PRDLST_REPORT_NO']):pick(r,['appointno','APPOINTNO','haccpNo','haccp_no','appointNo']);if(direct)return direct;const company=pick(r,['BSSH_NM','company','COMPANY','companyNm','company_name','COMPANY_NM','업체명']);const addr=pick(r,['ADDR','SITE_ADDR','LOCP_ADDR','worksaddr','WORKSADDR','ADDRESS','address','addr']);return crypto.createHash('sha256').update(`${company}|${addr}`).digest('hex').slice(0,30)}
function normalize(source,r){let x;if(source==='foodsafety'){
  x={company:pick(r,['BSSH_NM','업소명']),region:'',address:pick(r,['ADDR','SITE_ADDR','LOCP_ADDR']),industry:pick(r,['INDUTY_CD_NM','INDUTY_NM']),phone:pick(r,['TELNO','PHONE']),products:Array.isArray(r.productNames)?r.productNames.join(' / '):'',evidence:'식품안전나라 인허가 변경자료. 원료 매입 여부 및 영업상태 별도 확인 필요'};
 }else{
  x={company:pick(r,['company','COMPANY','companyNm','COMPANY_NM','company_name','업체명']),region:'',address:pick(r,['worksaddr','WORKSADDR','address','ADDRESS','addr','ADDR']),industry:[pick(r,['companykindNm','COMPANYKINDNM','bizTypeNm','BIZTYPE_NM']),pick(r,['businessitemNm','BUSINESSITEMNM','typeNm','TYPE_NM'])].filter(Boolean).join(' / '),phone:pick(r,['tel','TEL','telNo','TEL_NO','phone','PHONE']),products:pick(r,['businessitemNm','BUSINESSITEMNM','typeNm','TYPE_NM','itemNm','ITEM_NM']),evidence:'공공 HACCP 인증업체 조회. 최근 인증·신규 설립 여부 별도 확인 필요'};
 }x.source=source;x.source_key=sourceId(source,r);x.score=scoreLead(x);return x;
}
function fakeResponse(){let code=200,body=null;return {status(n){code=n;return this},setHeader(){return this},json(o){body=o;return this},result(){return {code,body}}}}
async function callInternal(name,query){const handler=require('./'+name+'.js');const res=fakeResponse();await handler({query,method:'GET'},res);const r=res.result();if(r.code<200||r.code>=300)throw new Error(`${name} HTTP ${r.code}: ${clean(r.body?.error)}`);return r.body}
function httpFail(res,n,error){return res.status(n).json({ok:false,error})}
async function supa(table,opts={}){
 const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)throw Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정');
 const suffix=opts.query?'?'+opts.query:'';
 const headers={apikey:secret,'Content-Type':'application/json',Prefer:opts.prefer||'return=minimal',...(opts.range?{Range:opts.range}:{})};
 if(secret.startsWith('eyJ'))headers.Authorization='Bearer '+secret; // legacy service_role JWT only
 const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+table+suffix,{method:opts.method||'GET',headers,body:opts.body?JSON.stringify(opts.body):undefined});
 const raw=await r.text();if(!r.ok)throw Error(`Supabase ${table} HTTP ${r.status}: ${raw.slice(0,250)}`);return raw?JSON.parse(raw):null;
}
async function allRows(table,fields,owner,maxPages=15){const out=[];for(let i=0;i<maxPages;i++){const q=`select=${encodeURIComponent(fields)}&owner_id=eq.${owner}&limit=1000&offset=${i*1000}`;const rows=await supa(table,{query:q});out.push(...(rows||[]));if((rows||[]).length<1000)break}return out}
async function main(req,res){
 const s=process.env.CRON_SECRET;
 if(!s)return httpFail(res,503,'CRON_SECRET 미설정: 안전을 위해 자동 실행 비활성화');
 if(req.headers?.authorization!==`Bearer ${s}`)return httpFail(res,401,'Unauthorized');
 const owner=clean(process.env.SALES_DESK_OWNER_ID);
 if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(owner))return httpFail(res,503,'SALES_DESK_OWNER_ID 설정 필요');
 let warnings=[],sourceNames=[],rows=[];
 const collected=await Promise.allSettled([
   callInternal('foodsafety',{mode:'recent',rows:'200',page:'1'}),
   callInternal('haccp',{page:'1',rows:'20'})
 ]);
 const sources=['foodsafety','haccp'];
 for(let i=0;i<collected.length;i++){const x=collected[i],source=sources[i];if(x.status==='rejected'){warnings.push(source+': '+clean(x.reason?.message));continue}
   sourceNames.push(source);const batch=Array.isArray(x.value?.rows)?x.value.rows:[];if(x.value?.meta?.warnings?.length)warnings.push(...x.value.meta.warnings.map(w=>source+': '+w));rows.push(...batch.map(r=>normalize(source,r)).filter(x=>x.company&&x.source_key&&relevant(x)));}
 if(!sourceNames.length)return httpFail(res,504,'모든 원기관 API 호출 실패: '+warnings.join('; ').slice(0,300));
 const received=rows.length;
 const seen=new Set();rows=rows.filter(r=>{const k=r.source+'|'+r.source_key;if(seen.has(k))return false;seen.add(k);return true});
 let skipped=0,saved=0;
 try{
  const [crm,legacy,contacts,existing]=await Promise.all([
   allRows('sw_crm_customers','company,phone,mobile,legacy_phone,excluded,sales_status,exclusion_type',owner),
   allRows('sw_legacy_accounts','company_name',owner),
   allRows('sw_contact_pool','phone_norm',owner),
   allRows('sw_lead_candidates','source,source_key,review_status,company,first_seen_at',owner),
  ]);
  const excludeName=new Set([...crm.filter(c=>c.excluded||c.exclusion_type||c.sales_status==='영업제외').map(c=>normName(c.company)),...legacy.map(c=>normName(c.company_name))]);
  const crmNames=new Set(crm.map(c=>normName(c.company))),names=new Set([...excludeName,...crmNames]);
  const phones=new Set([...crm.flatMap(c=>[c.phone,c.mobile,c.legacy_phone]),...contacts.map(c=>c.phone_norm)].map(phoneKey).filter(Boolean));
  const old=new Map(existing.map(x=>[x.source+'|'+x.source_key,x]));
  const now=new Date().toISOString();const toSave=[];
  for(const row of rows){
   const k=row.source+'|'+row.source_key,already=old.get(k);
   // Preserve manually excluded/processed candidates and avoid re-adding any known contacts.
   if(already && already.review_status!=='신규'){skipped++;continue}
   const n=normName(row.company),p=phoneKey(row.phone);
   if(n&&(names.has(n)||(p&&phones.has(p)))){skipped++;continue}
   toSave.push({...row,owner_id:owner,review_status:'신규',first_seen_at:already?.first_seen_at||now,last_seen_at:now});
  }
  for(let i=0;i<toSave.length;i+=100){const batch=toSave.slice(i,i+100);
   await supa('sw_lead_candidates',{method:'POST',query:'on_conflict=owner_id,source,source_key',prefer:'resolution=merge-duplicates,return=minimal',body:batch});saved+=batch.length}
  await supa('sw_lead_runs',{method:'POST',body:{owner_id:owner,sources:sourceNames,received_count:received,saved_count:saved,skipped_count:skipped,warnings}});
  return res.status(200).json({ok:true,sources:sourceNames,received,saved,skipped,warnings,at:now});
 }catch(e){return httpFail(res,500,'후보 DB 저장 실패: '+e.message)}
}
module.exports=main;
