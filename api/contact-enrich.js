function clean(s=''){return String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()}
function norm(s=''){return clean(s).toLowerCase().replace(/주식회사|\(주\)|㈜|유한회사/g,'').replace(/[^0-9a-z가-힣]/g,'')}
function addrTokens(s=''){return clean(s).split(/\s+/).filter(x=>x.length>=2).slice(0,5)}
function score(doc,company,address){
  const a=norm(doc.place_name), b=norm(company); let sc=0;
  if(a&&b){if(a===b)sc+=70;else if(a.includes(b)||b.includes(a))sc+=50;}
  const da=clean(doc.road_address_name||doc.address_name), toks=addrTokens(address);
  for(const t of toks) if(da.includes(t)) sc+=7;
  if(doc.phone) sc+=8;
  return sc;
}
async function kakaoSearch(key,q){
  const u=new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  u.searchParams.set('query',q);u.searchParams.set('size','15');
  const r=await fetch(u,{headers:{Authorization:`KakaoAK ${key}`}});
  const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{throw new Error('카카오 API 응답 형식 오류')}
  if(!r.ok)throw new Error(j?.msg||j?.message||`카카오 API 오류 ${r.status}`);
  return Array.isArray(j.documents)?j.documents:[];
}
module.exports=async function handler(req,res){
 try{
  const key=process.env.KAKAO_REST_API_KEY;
  if(!key)return res.status(500).json({error:'KAKAO_REST_API_KEY가 설정되지 않았습니다.'});
  const company=clean(req.query.company),address=clean(req.query.address);
  if(!company)return res.status(400).json({error:'업체명이 없습니다.'});
  const region=address.split(/\s+/).slice(0,2).join(' ');
  const queries=[`${company} ${region}`.trim(),company];
  let docs=[];
  for(const q of queries){
    const got=await kakaoSearch(key,q);docs.push(...got);
    if(got.some(x=>x.phone))break;
  }
  const uniq=[];const seen=new Set();for(const d of docs){if(seen.has(d.id))continue;seen.add(d.id);uniq.push(d)}
  const ranked=uniq.map(d=>({d,score:score(d,company,address)})).sort((x,y)=>y.score-x.score);
  const best=ranked[0];
  if(!best||best.score<35)return res.status(200).json({matched:false,phone:'',score:best?.score||0,candidates:ranked.slice(0,3).map(x=>({name:x.d.place_name,address:x.d.road_address_name||x.d.address_name,phone:x.d.phone||'',score:x.score}))});
  const d=best.d;
  return res.status(200).json({matched:true,score:best.score,placeName:d.place_name||'',phone:d.phone||'',address:d.road_address_name||d.address_name||'',placeUrl:d.place_url||'',category:d.category_name||'',candidates:ranked.slice(0,3).map(x=>({name:x.d.place_name,address:x.d.road_address_name||x.d.address_name,phone:x.d.phone||'',score:x.score}))});
 }catch(e){return res.status(500).json({error:e.message||'연락처 보강 오류'});}
}
