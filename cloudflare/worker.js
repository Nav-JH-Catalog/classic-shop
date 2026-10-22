const ALLOWED_ORIGINS = new Set([
  "https://nav-jh-catalog.github.io",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
  "http://localhost:8765"
]);
const EVENT_TYPES = new Set(["page_view","product_view","whatsapp_click","instagram_click","search","category_filter"]);

function cors(request) {
  const origin=request.headers.get("Origin")||"";
  return {"access-control-allow-origin":ALLOWED_ORIGINS.has(origin)?origin:"https://nav-jh-catalog.github.io","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","vary":"Origin"};
}
function json(data,status,request){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=utf-8",...cors(request)}});}

export default {
  async fetch(request, env) {
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url);
    if(request.method==="POST"&&url.pathname==="/event"){
      const origin=request.headers.get("Origin")||""; if(!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,request);
      let body; try{body=await request.json();}catch{return json({error:"Invalid JSON"},400,request);}
      if(!EVENT_TYPES.has(body.type))return json({error:"Invalid event"},400,request);
      const clean=value=>String(value||"").slice(0,180);
      await env.DB.prepare("INSERT INTO events (type,session_id,product_id,category,query,result_count,source,path,referrer) VALUES (?,?,?,?,?,?,?,?,?)").bind(body.type,clean(body.sessionId),clean(body.productId),clean(body.category),clean(body.query),Number(body.resultCount)||0,clean(body.source),clean(body.path),clean(body.referrer)).run();
      return json({ok:true},201,request);
    }
    if(request.method==="GET"&&url.pathname==="/analytics"){
      const days=Math.min(365,Math.max(1,Number(url.searchParams.get("days"))||30)); const since=`-${days-1} days`;
      const [totals,daily,products,searches]=await Promise.all([
        env.DB.prepare("SELECT type,COUNT(*) value FROM events WHERE created_at>=datetime('now',?) GROUP BY type").bind(since).all(),
        env.DB.prepare("SELECT substr(created_at,1,10) label,COUNT(*) value FROM events WHERE type='page_view' AND created_at>=datetime('now',?) GROUP BY label ORDER BY label").bind(since).all(),
        env.DB.prepare("SELECT product_id label,COUNT(*) value FROM events WHERE type='product_view' AND created_at>=datetime('now',?) AND product_id<>'' GROUP BY product_id ORDER BY value DESC LIMIT 10").bind(since).all(),
        env.DB.prepare("SELECT query label,COUNT(*) value FROM events WHERE type='search' AND created_at>=datetime('now',?) AND query<>'' GROUP BY lower(query) ORDER BY value DESC LIMIT 10").bind(since).all()
      ]);
      return json({totals:Object.fromEntries(totals.results.map(r=>[r.type,r.value])),dailyVisits:daily.results,topProducts:products.results,topSearches:searches.results},200,request);
    }
    return json({service:"Finds Analytics",status:"ok"},200,request);
  }
};
