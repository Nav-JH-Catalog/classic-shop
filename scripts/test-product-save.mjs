import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const worker=(await import('../cloudflare/worker.js')).default;
const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return db.prepare(sql).run(...this.args);}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
db.prepare("INSERT INTO admin_sessions(id,github_user,access_token,expires_at) VALUES ('test','nav-jh-catalog','fake',datetime('now','+1 hour'))").run();
const id='cable 1 metro',original={id,name:'Cable blanco',category:'tecnologia',price:'₡13.000',status:'Disponible',description:'Cable',visible:true,color:'#eee',updatedAt:'2026-10-20T10:00'};
let repository=structuredClone(original),published=[original],writeStatus=200,writes=0;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);if(u.hostname==='nav-jh-catalog.github.io')return Response.json(published);
 assert.ok(u.pathname.includes('/contents/products/cable%201%20metro.json'));
 if(options.method==='PUT'){writes++;if(writeStatus!==200)return Response.json({error:'conflict'},{status:writeStatus});const b=JSON.parse(options.body);assert.equal(b.sha,'sha');repository=JSON.parse(Buffer.from(b.content,'base64').toString());return Response.json({content:{sha:'new'}});}
 if(options.method==='DELETE')return Response.json({});
 return Response.json({sha:'sha',content:Buffer.from(JSON.stringify(repository)).toString('base64')});
};
const request=(path,method='GET',body,auth=true)=>worker.fetch(new Request('https://test'+path,{method,headers:{...(auth?{authorization:'Bearer test'}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB});
let r=await request('/products');assert.equal((await r.json())[0].name,'Cable blanco');
r=await request('/admin/product','PUT',{...original,name:'Cable gris'});assert.equal(r.status,200);let result=await r.json();assert.equal(result.product.color,'#eee');assert.equal(result.product.name,'Cable gris');
r=await request('/products');assert.equal((await r.json())[0].name,'Cable gris');
db.exec("UPDATE catalog_sync SET updated_at='2000-01-01' WHERE key='catalog_hash'");published=[{...original,description:'Otro contenido viejo'}];r=await request('/products');assert.equal((await r.json())[0].name,'Cable gris');
const before=writes;r=await request('/admin/product','PUT',{...original,name:' '});assert.equal(r.status,400);assert.equal(writes,before);
r=await request('/admin/product','PUT',original,false);assert.equal(r.status,401);
writeStatus=409;r=await request('/admin/product','PUT',{...original,name:'No guardado'});assert.equal(r.status,409);r=await request('/products');assert.equal((await r.json())[0].name,'Cable gris');
writeStatus=200;r=await request('/admin/product','DELETE'); // No id: no mutation
assert.equal(r.status,400);
r=await request('/admin/product?id='+encodeURIComponent(id),'DELETE');assert.equal(r.status,200);
db.exec("UPDATE catalog_sync SET updated_at='2000-01-01' WHERE key='catalog_hash'");published=[{...original,description:'Aún viejo'}];r=await request('/products');assert.equal(r.status,503);assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,0);
console.log('OK: edición inmediata, confirmación, metadatos conservados, sincronización antigua, validación, sesión, conflicto y eliminación.');
