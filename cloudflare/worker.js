const ALLOWED_ORIGINS = new Set([
  "https://nav-jh-catalog.github.io",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
  "http://localhost:8765"
]);
const EVENT_TYPES = new Set(["page_view","product_view","whatsapp_click","instagram_click","search","category_filter"]);
const DEVICE_TYPES = new Set(["desktop","mobile","tablet"]);
const ADMIN_USERS = new Set(["nav-jh-catalog","juanpajimenez"]);
const REPO = "Nav-JH-Catalog/classic-shop";
const ADMIN_URL = "https://nav-jh-catalog.github.io/classic-shop/admin/";
const CATALOG_SOURCE = "https://nav-jh-catalog.github.io/classic-shop/products.json";
const CATALOG_SYNC_SECONDS = 300;

function cors(request) {
  const origin=request.headers.get("Origin")||"";
  return {"access-control-allow-origin":ALLOWED_ORIGINS.has(origin)?origin:"https://nav-jh-catalog.github.io","access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type,authorization","vary":"Origin"};
}
function json(data,status,request){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=utf-8","cache-control":"no-store",...cors(request)}});}

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
  let products=JSON.parse(raw);
  if(!Array.isArray(products))throw new Error("Invalid catalog");
  // Conservar las ediciones del panel mientras se publica el archivo estático.
  const edits=await env.DB.prepare("SELECT a.* FROM admin_activity a JOIN (SELECT product_id,MAX(id) id FROM admin_activity GROUP BY product_id) latest ON a.id=latest.id").all();
  const merged=new Map(products.map(product=>[product.id,product]));
  for(const edit of edits.results){
    const published=merged.get(edit.product_id);
    const after=edit.after_data?JSON.parse(edit.after_data):null;
    const editedAt=after?.updatedAt&&/[zZ]|[+-]\d\d:\d\d$/.test(after.updatedAt)?after.updatedAt:`${edit.created_at.replace(' ','T')}Z`;
    if(!published||productTime(published.updatedAt)<=productTime(editedAt)){
      if(after)merged.set(edit.product_id,after);else merged.delete(edit.product_id);
    }
  }
  products=[...merged.values()];
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
function decodeGithubFile(file){try{const bytes=Uint8Array.from(atob(String(file.content||"").replace(/\s/g,"")),char=>char.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}}
async function logActivity(env,session,action,product,before,after){const activity=env.DB.prepare("INSERT INTO admin_activity (action,product_id,product_name,github_user,before_data,after_data) VALUES (?,?,?,?,?,?)").bind(action,product.id,product.name||before?.name||"",session.github_user,before?JSON.stringify(before):null,after?JSON.stringify(after):null);
  const change=after?env.DB.prepare("INSERT INTO products (id,data,sort_order,synced_at) VALUES (?,?,COALESCE((SELECT sort_order FROM products WHERE id=?),(SELECT COALESCE(MAX(sort_order),0)+1 FROM products)),datetime('now')) ON CONFLICT(id) DO UPDATE SET data=excluded.data,synced_at=excluded.synced_at").bind(product.id,JSON.stringify(after),product.id):env.DB.prepare("DELETE FROM products WHERE id=?").bind(product.id);
  await env.DB.batch([activity,change]);
}
function productTime(value){if(!value)return 0;return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:`${value}-06:00`)||0;}
const productPath=id=>`products/${encodeURIComponent(id)}.json`;
function validProduct(body){return ['name','category','price','description'].every(key=>typeof body[key]==='string'&&body[key].trim())&&['nino','nina','hombre','mujer','tecnologia','salud'].includes(body.category)&&['Disponible','Agotado'].includes(body.status)&&(!body.id||(typeof body.id==='string'&&!/[\\/\x00-\x1f?#]/.test(body.id)&&body.id.length<=200));}

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
    if(request.method==="GET"&&url.pathname==="/admin/activity"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request);
      const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit"))||20));
      const rows=await env.DB.prepare("SELECT id,action,product_id,product_name,github_user,created_at,before_data IS NOT NULL can_restore FROM admin_activity ORDER BY id DESC LIMIT ?").bind(limit).all();
      return json(rows.results,200,request);
    }
    if(request.method==="GET"&&url.pathname==="/admin/customers"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request);
      const rows=await env.DB.prepare("SELECT c.*,(SELECT COUNT(*) FROM events e JOIN customer_sessions s ON s.session_id=e.session_id WHERE s.customer_id=c.id AND e.type='page_view') visits,(SELECT COUNT(*) FROM customer_interactions i WHERE i.customer_id=c.id AND i.type='contact') contacts,(SELECT COUNT(*) FROM customer_interactions i WHERE i.customer_id=c.id AND i.type='purchase') purchases,(SELECT COALESCE(SUM(i.amount),0) FROM customer_interactions i WHERE i.customer_id=c.id AND i.type='purchase') total_spent,(SELECT GROUP_CONCAT(DISTINCT i.channel) FROM customer_interactions i WHERE i.customer_id=c.id) channels FROM customers c ORDER BY c.last_contact_at DESC").all();
      return json(rows.results,200,request);
    }
    if(request.method==="GET"&&url.pathname==="/admin/customer"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request); const id=Number(url.searchParams.get("id"));
      const customer=await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(id).first(); if(!customer)return json({error:"Not found"},404,request);
      const interactions=await env.DB.prepare("SELECT * FROM customer_interactions WHERE customer_id=? ORDER BY id DESC").bind(id).all(); return json({customer,interactions:interactions.results},200,request);
    }
    if(request.method==="POST"&&url.pathname==="/admin/customer-interaction"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request); const body=await request.json(),id=Number(body.customerId);
      if(!id||!["contact","purchase","note"].includes(body.type)||!["whatsapp","instagram","phone","in_person","other"].includes(body.channel))return json({error:"Invalid interaction"},400,request);
      await env.DB.batch([env.DB.prepare("INSERT INTO customer_interactions (customer_id,type,channel,product_id,note,amount,created_by) VALUES (?,?,?,?,?,?,?)").bind(id,body.type,body.channel,String(body.productId||"").slice(0,120),String(body.note||"").slice(0,500),Number(body.amount)||0,session.github_user),env.DB.prepare("UPDATE customers SET last_contact_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(id)]); return json({ok:true},201,request);
    }
    if(request.method==="POST"&&url.pathname==="/admin/image"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request);
      const body=await request.json(); const extension=String(body.extension||"jpg").toLowerCase().replace(/[^a-z0-9]/g,""); const filename=`${slug(body.name)||"producto"}-${Date.now()}.${extension}`;
      const response=await github(`/repos/${REPO}/contents/images/products/${filename}`,session.access_token,{method:"PUT",body:JSON.stringify({message:`Agregar imagen de ${body.name||"producto"}`,content:String(body.content||"").replace(/^data:[^,]+,/,""),branch:"main"})});
      if(!response.ok)return json({error:"No fue posible subir la imagen"},response.status,request); return json({path:`images/products/${filename}`},201,request);
    }
    if(request.method==="PUT"&&url.pathname==="/admin/product"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request);
      const body=await request.json(); const id=body.id||slug(body.name); if(!id||!validProduct(body))return json({error:"Complete nombre, categoría, precio, descripción y disponibilidad con valores válidos."},400,request);
      const path=productPath(id); const current=await github(`/repos/${REPO}/contents/${path}?ref=main`,session.access_token); const existing=current.ok?await current.json():null; const before=existing?decodeGithubFile(existing):null;
      if(!current.ok&&current.status!==404)return json({error:"No fue posible consultar la versión actual. Intente nuevamente."},502,request);
      const activity=body._activity==="status"?"status":existing?"update":"create"; const product={...(before||{}),...body,id,visible:body.visible!==false,updatedAt:new Date().toISOString()}; delete product.originalId; delete product._activity;
      const saved=await putGithubFile(path,`${JSON.stringify(product,null,2)}\n`,`${existing?"Actualizar":"Agregar"} ${body.name} desde el panel Finds`,session.access_token,existing?.sha);
      if(!saved.ok)return json({error:saved.status===409?"El producto cambió mientras lo editabas. Recarga su información y vuelve a intentar.":saved.status===403?"Tu cuenta no tiene permiso para guardar este producto.":"No fue posible guardar el producto. Intenta nuevamente."},saved.status,request); await logActivity(env,session,activity,product,before,product); return json({ok:true,id,product,message:"Cambios guardados y disponibles en el catálogo."},200,request);
    }
    if(request.method==="DELETE"&&url.pathname==="/admin/product"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request); const id=url.searchParams.get("id")||""; if(!id||/[\\/\x00-\x1f?#]/.test(id))return json({error:"Identificador inválido."},400,request);
      const path=productPath(id); const current=await github(`/repos/${REPO}/contents/${path}?ref=main`,session.access_token); if(!current.ok)return json({error:"Product not found"},404,request); const file=await current.json(); const before=decodeGithubFile(file);
      const removed=await github(`/repos/${REPO}/contents/${path}`,session.access_token,{method:"DELETE",body:JSON.stringify({message:`Eliminar ${id} desde el panel Finds`,sha:file.sha,branch:"main"})});
      if(!removed.ok)return json({error:"No fue posible eliminar"},removed.status,request); await logActivity(env,session,"delete",before||{id,name:id},before,null); return json({ok:true},200,request);
    }
    if(request.method==="POST"&&url.pathname==="/admin/restore"){
      const session=await adminSession(request,env); if(!session)return json({error:"Unauthorized"},401,request); const activityId=Number(url.searchParams.get("id"));
      const activity=await env.DB.prepare("SELECT * FROM admin_activity WHERE id=?").bind(activityId).first(); if(!activity?.before_data)return json({error:"Nothing to restore"},400,request);
      const restored=JSON.parse(activity.before_data),path=productPath(restored.id); const current=await github(`/repos/${REPO}/contents/${path}?ref=main`,session.access_token); const existing=current.ok?await current.json():null,before=existing?decodeGithubFile(existing):null;
      restored.updatedAt=new Date().toISOString(); const saved=await putGithubFile(path,`${JSON.stringify(restored,null,2)}\n`,`Restaurar ${restored.name} desde el historial Finds`,session.access_token,existing?.sha);
      if(!saved.ok)return json({error:"No fue posible restaurar"},saved.status,request); await logActivity(env,session,"restore",restored,before,restored); return json({ok:true},200,request);
    }
    if(request.method==="POST"&&url.pathname==="/event"){
      const origin=request.headers.get("Origin")||""; if(!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,request);
      let body; try{body=await request.json();}catch{return json({error:"Invalid JSON"},400,request);}
      if(!EVENT_TYPES.has(body.type))return json({error:"Invalid event"},400,request);
      const clean=value=>String(value||"").slice(0,180);
      const device=DEVICE_TYPES.has(body.device)?body.device:"unknown";
      await env.DB.prepare("INSERT INTO events (type,session_id,product_id,category,query,result_count,source,path,referrer,device) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(body.type,clean(body.sessionId),clean(body.productId),clean(body.category),clean(body.query),Number(body.resultCount)||0,clean(body.source),clean(body.path),clean(body.referrer),device).run();
      return json({ok:true},201,request);
    }
    if(request.method==="POST"&&url.pathname==="/lead"){
      const origin=request.headers.get("Origin")||""; if(!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,request); let body;try{body=await request.json();}catch{return json({error:"Invalid JSON"},400,request);}
      const phone=String(body.phone||"").replace(/\D/g,"").slice(0,15),name=String(body.name||"").trim().slice(0,100),email=String(body.email||"").trim().slice(0,140),sessionId=String(body.sessionId||"").slice(0,180),productId=String(body.productId||"").slice(0,120);
      if(!body.consent||name.length<2||phone.length<8)return json({error:"Name, phone and consent are required"},400,request);
      await env.DB.prepare("INSERT INTO customers (name,phone,email,consent_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,email=CASE WHEN excluded.email<>'' THEN excluded.email ELSE customers.email END,updated_at=datetime('now'),last_contact_at=datetime('now')").bind(name,phone,email).run(); const customer=await env.DB.prepare("SELECT id FROM customers WHERE phone=?").bind(phone).first();
      await env.DB.batch([env.DB.prepare("INSERT INTO customer_sessions (session_id,customer_id) VALUES (?,?) ON CONFLICT(session_id) DO UPDATE SET customer_id=excluded.customer_id").bind(sessionId,customer.id),env.DB.prepare("INSERT INTO customer_interactions (customer_id,type,channel,product_id,note,created_by) VALUES (?,'contact','whatsapp',?,?,'cliente')").bind(customer.id,productId,productId?"Consulta desde producto":"Consulta general")]); return json({ok:true,id:customer.id},201,request);
    }
    if(request.method==="GET"&&url.pathname==="/analytics"){
      const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||"");
      const requestedStart=url.searchParams.get("start"),requestedEnd=url.searchParams.get("end"),hasRange=validDate(requestedStart)&&validDate(requestedEnd)&&requestedStart<requestedEnd;
      const days=Math.min(365,Math.max(1,Number(url.searchParams.get("days"))||30)),start=hasRange?requestedStart:null,end=hasRange?requestedEnd:null,since=`-${days-1} days`;
      const periodSql=hasRange?"created_at>=? AND created_at<?":"created_at>=datetime('now',?)",bindings=hasRange?[start,end]:[since];
      const [totals,daily,products,searches,devices]=await Promise.all([
        env.DB.prepare(`SELECT type,COUNT(*) value FROM events WHERE ${periodSql} GROUP BY type`).bind(...bindings).all(),
        env.DB.prepare(`SELECT substr(created_at,1,10) label,COUNT(*) value FROM events WHERE type='page_view' AND ${periodSql} GROUP BY label ORDER BY label`).bind(...bindings).all(),
        env.DB.prepare(`SELECT product_id label,COUNT(*) value FROM events WHERE type='product_view' AND ${periodSql} AND product_id<>'' GROUP BY product_id ORDER BY value DESC LIMIT 10`).bind(...bindings).all(),
        env.DB.prepare(`SELECT query label,COUNT(*) value FROM events WHERE type='search' AND ${periodSql} AND query<>'' GROUP BY lower(query) ORDER BY value DESC LIMIT 10`).bind(...bindings).all(),
        env.DB.prepare(`SELECT device label,COUNT(*) value FROM events WHERE type='page_view' AND ${periodSql} AND device<>'unknown' GROUP BY device ORDER BY value DESC`).bind(...bindings).all()
      ]);
      return json({range:{start,end},totals:Object.fromEntries(totals.results.map(r=>[r.type,r.value])),dailyVisits:daily.results,topProducts:products.results,topSearches:searches.results,deviceBreakdown:devices.results},200,request);
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
