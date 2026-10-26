const ALLOWED_ORIGINS = new Set([
  "https://nav-jh-catalog.github.io",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
  "http://localhost:8765"
]);
const EVENT_TYPES = new Set(["page_view","product_view","whatsapp_click","instagram_click","search","category_filter"]);
const ADMIN_USERS = new Set(["nav-jh-catalog","juanpajimenez"]);
const REPO = "Nav-JH-Catalog/classic-shop";
const ADMIN_URL = "https://nav-jh-catalog.github.io/classic-shop/admin/";
const CATALOG_SOURCE = "https://nav-jh-catalog.github.io/classic-shop/products.json";
const CATALOG_SYNC_SECONDS = 300;

function cors(request) {
  const origin=request.headers.get("Origin")||"";
  return {"access-control-allow-origin":ALLOWED_ORIGINS.has(origin)?origin:"https://nav-jh-catalog.github.io","access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type,authorization","vary":"Origin"};
}
function json(data,status,request){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=utf-8",...cors(request)}});}

async function digest(value) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function syncCatalog(env) {
  const last=await env.DB.prepare("SELECT value,updated_at FROM catalog_sync WHERE key='catalog_hash'").first();
  if(last?.updated_at){
    const age=(Date.now()-Date.parse(`${last.updated_at}Z`))/1000;
    if(Number.isFinite(age)&&age<CATALOG_SYNC_SECONDS)return;
  }
  const response=await fetch(`${CATALOG_SOURCE}?sync=${Date.now()}`,{cache:"no-store",headers:{"accept":"application/json","cache-control":"no-cache","user-agent":"Finds-Catalog-Sync"}});
  if(!response.ok)throw new Error(`Catalog source ${response.status}`);
  const raw=await response.text();
  const hash=await digest(raw);
  if(last?.value===hash){
    await env.DB.prepare("UPDATE catalog_sync SET updated_at=datetime('now') WHERE key='catalog_hash'").run();
    return;
  }
  const products=JSON.parse(raw);
  if(!Array.isArray(products))throw new Error("Invalid catalog");
  const statements=[env.DB.prepare("DELETE FROM products")];
  products.forEach((product,index)=>{
    if(!product?.id)return;
    statements.push(env.DB.prepare("INSERT INTO products (id,data,sort_order,synced_at) VALUES (?,?,?,datetime('now'))").bind(String(product.id),JSON.stringify(product),index));
  });
  statements.push(env.DB.prepare("INSERT INTO catalog_sync (key,value,updated_at) VALUES ('catalog_hash',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(hash));
  await env.DB.batch(statements);
}

const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const randomToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const slug=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);
async function adminSession(request,env){
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  return env.DB.prepare("SELECT id,github_user,access_token FROM admin_sessions WHERE id=? AND expires_at>datetime('now')").bind(token).first();
}
async function github(path,token,options={}){
  return fetch(`https://api.github.com${path}`,{...options,headers:{accept:"application/vnd.github+json",authorization:`Bearer ${token}`,"content-type":"application/json","user-agent":"Finds-Admin",...(options.headers||{})}});
}
async function putGithubFile(path,content,message,token,sha){
  const body={message,content:btoa(unescape(encodeURIComponent(content))),branch:"main"}; if(sha)body.sha=sha;
  return github(`/repos/${REPO}/contents/${path}`,token,{method:"PUT",body:JSON.stringify(body)});
}

export default {
  async fetch(request, env) {
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/auth/login"){
      if(!env.GITHUB_CLIENT_ID)return json({error:"Authentication not configured"},503,request);
      const state=randomToken();
      await env.DB.prepare("INSERT INTO catalog_sync (key,value,updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(`oauth:${state}`,"pending").run();
      return Response.redirect(`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID)}&scope=public_repo%20read:user&state=${encodeURIComponent(state)}`,302);
    }
    if(request.method==="GET"&&url.pathname==="/auth/callback"){
      const code=url.searchParams.get("code"),state=url.searchParams.get("state");
      const pending=state&&await env.DB.prepare("SELECT value FROM catalog_sync WHERE key=? AND updated_at>datetime('now','-10 minutes')").bind(`oauth:${state}`).first();
      if(!code||!pending)return Response.redirect(`${ADMIN_URL}?auth=invalid`,302);
      await env.DB.prepare("DELETE FROM catalog_sync WHERE key=?").bind(`oauth:${state}`).run();
      const exchange=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code})});
      const auth=await exchange.json(); if(!auth.access_token)return Response.redirect(`${ADMIN_URL}?auth=failed`,302);
      const profileResponse=await github("/user",auth.access_token); const profile=await profileResponse.json();
      if(!ADMIN_USERS.has(String(profile.login||"").toLowerCase()))return Response.redirect(`${ADMIN_URL}?auth=denied`,302);
      const session=randomToken();
      await env.DB.prepare("INSERT INTO admin_sessions (id,github_user,access_token,expires_at) VALUES (?,?,?,datetime('now','+8 hours'))").bind(session,profile.login,auth.access_token).run();
      return Response.redirect(`${ADMIN_URL}?session=${encodeURIComponent(session)}`,302);
    }
    if(request.method==="GET"&&url.pathname==="/admin/me"){
      const session=await adminSession(request,env); return session?json({user:session.github_user},200,request):json({error:"Unauthorized"},401,request);
    }
    if(request.method==="POST"&&url.pathname==="/admin/logout"){
      const session=await adminSession(request,env); if(session)await env.DB.prepare("DELETE FROM admin_sessions WHERE id=?").bind(session.id).run(); return json({ok:true},200,request);
    }
    if(request.method==="POST"&&url.pathname==="/admin/image"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request);
      const body=await request.json(); const extension=String(body.extension||"jpg").toLowerCase().replace(/[^a-z0-9]/g,""); const filename=`${slug(body.name)||"producto"}-${Date.now()}.${extension}`;
      const response=await github(`/repos/${REPO}/contents/images/products/${filename}`,session.access_token,{method:"PUT",body:JSON.stringify({message:`Agregar imagen de ${body.name||"producto"}`,content:String(body.content||"").replace(/^data:[^,]+,/,""),branch:"main"})});
      if(!response.ok)return json({error:"No fue posible subir la imagen"},response.status,request); return json({path:`images/products/${filename}`},201,request);
    }
    if(request.method==="PUT"&&url.pathname==="/admin/product"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request);
      const body=await request.json(); const id=body.id||slug(body.name); if(!id||!body.name||!body.category||!body.price||!body.description)return json({error:"Missing required fields"},400,request);
      const path=`products/${id}.json`; const current=await github(`/repos/${REPO}/contents/${path}?ref=main`,session.access_token); const existing=current.ok?await current.json():null;
      const product={...body,id,visible:body.visible!==false,updatedAt:new Date().toISOString().slice(0,16)}; delete product.originalId;
      const saved=await putGithubFile(path,`${JSON.stringify(product,null,2)}\n`,`${existing?"Actualizar":"Agregar"} ${body.name} desde el panel Finds`,session.access_token,existing?.sha);
      if(!saved.ok)return json({error:"No fue posible guardar el producto"},saved.status,request); return json({ok:true,id},200,request);
    }
    if(request.method==="DELETE"&&url.pathname==="/admin/product"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request); const id=slug(url.searchParams.get("id"));
      const path=`products/${id}.json`; const current=await github(`/repos/${REPO}/contents/${path}?ref=main`,session.access_token); if(!current.ok)return json({error:"Product not found"},404,request); const file=await current.json();
      const removed=await github(`/repos/${REPO}/contents/${path}`,session.access_token,{method:"DELETE",body:JSON.stringify({message:`Eliminar ${id} desde el panel Finds`,sha:file.sha,branch:"main"})});
      return removed.ok?json({ok:true},200,request):json({error:"No fue posible eliminar"},removed.status,request);
    }
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
    if(request.method==="GET"&&url.pathname==="/products"){
      try{await syncCatalog(env);}catch(error){console.error("Catalog sync failed",error);}
      const rows=await env.DB.prepare("SELECT data FROM products ORDER BY sort_order").all();
      if(!rows.results.length)return json({error:"Catalog not synchronized"},503,request);
      return json(rows.results.map(row=>JSON.parse(row.data)),200,request);
    }
    return json({service:"Finds Analytics",status:"ok"},200,request);
  }
};
