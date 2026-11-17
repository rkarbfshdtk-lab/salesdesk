// SALES DESK v7.0 - Kakao Local keyword discovery (ephemeral display only)
// The Kakao REST key stays in Vercel environment variables and is never sent to the browser.
module.exports = async function handler(req,res){
 res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'GET 요청만 지원합니다.'});
 const key=process.env.KAKAO_REST_API_KEY;
 if(!key)return res.status(503).json({error:'Vercel 환경변수 KAKAO_REST_API_KEY가 없습니다.'});
 const query=String(req.query.query||'').trim();
 const page=Number(req.query.page||1);
 if(query.length<2||query.length>100)return res.status(400).json({error:'검색어를 2~100자로 입력하세요.'});
 if(!Number.isInteger(page)||page<1||page>3)return res.status(400).json({error:'조회 페이지는 1~3만 지원합니다.'});
 const endpoint=new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
 endpoint.searchParams.set('query',query);endpoint.searchParams.set('page',String(page));endpoint.searchParams.set('size','15');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetch(endpoint,{headers:{Authorization:`KakaoAK ${key}`},signal:controller.signal});
  let json;try{json=await response.json()}catch{throw new Error('카카오 API 응답 형식이 올바르지 않습니다.')}
  if(!response.ok){return res.status(502).json({error:json?.msg||json?.message||`카카오 API HTTP ${response.status}`})}
  const rows=(Array.isArray(json.documents)?json.documents:[]).map(d=>({
   id:String(d.id||''),name:String(d.place_name||''),phone:String(d.phone||''),
   category:String(d.category_name||''),address:String(d.road_address_name||d.address_name||''),
   placeUrl:/^https:\/\/place\.map\.kakao\.com\/\d+$/.test(String(d.place_url||''))?d.place_url:''
  }));
  return res.status(200).json({rows,page,hasMore:!json?.meta?.is_end&&page<3,totalCount:Number(json?.meta?.pageable_count||0)});
 }catch(e){return res.status(502).json({error:e.name==='AbortError'?'카카오 API 응답 시간 초과':e.message||'검색 오류'})}
 finally{clearTimeout(timer)}
};
