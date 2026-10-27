const CMS_BASE = "https://app.pagescms.org/nav-jh-catalog/classic-shop/main/collection/catalogo";
const ANALYTICS_API = "https://finds-analytics-api.josuehidalgocastro.workers.dev";
let analyticsReport = null;
let analyticsPeriod = null;
const CATEGORY_LABELS = { nino:"Ropa Niño", nina:"Ropa Niña", hombre:"Hombre", mujer:"Mujer", tecnologia:"Tecnología", salud:"Salud y cuidado personal" };
const state = { products:[], query:"", category:"all", availability:"all", sort:"updated_desc" };
const elements = { list:document.querySelector("#product-list"), template:document.querySelector("#product-template"), empty:document.querySelector("#empty-state"), total:document.querySelector("#total-count"), available:document.querySelector("#available-count"), hidden:document.querySelector("#hidden-count"), results:document.querySelector("#result-count"), search:document.querySelector("#search"), category:document.querySelector("#category"), availability:document.querySelector("#availability"), sort:document.querySelector("#inventory-sort") };
const inventoryPanel=document.querySelector(".workspace"),inventoryToggle=document.querySelector("#toggle-inventory");
function setInventoryCollapsed(collapsed){inventoryPanel.classList.toggle("is-collapsed",collapsed);inventoryToggle.setAttribute("aria-expanded",String(!collapsed));inventoryToggle.textContent=collapsed?"Mostrar inventario":"Minimizar inventario";localStorage.setItem("finds_inventory_collapsed",collapsed?"1":"0");}
inventoryToggle.addEventListener("click",()=>setInventoryCollapsed(!inventoryPanel.classList.contains("is-collapsed")));setInventoryCollapsed(localStorage.getItem("finds_inventory_collapsed")==="1");
function normalize(value) { return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function productEditUrl(product) { return `${CMS_BASE}/edit/${encodeURIComponent(`products/${product.id}.json`)}`; }
function filteredProducts() {
  const query=normalize(state.query);
  const filtered=state.products.filter((product)=>{
    const text=normalize([product.name,product.description,product.category,product.price,product.sizes].join(" "));
    const matchesQuery=!query||text.includes(query);
    const matchesCategory=state.category==="all"||product.category===state.category;
    let matchesAvailability=true;
    if(state.availability==="hidden") matchesAvailability=product.visible===false;
    else if(state.availability!=="all") matchesAvailability=product.status===state.availability&&product.visible!==false;
    return matchesQuery&&matchesCategory&&matchesAvailability;
  });
  return filtered.sort((a,b)=>{if(state.sort==="name_asc")return String(a.name||"").localeCompare(String(b.name||""),"es");if(state.sort==="name_desc")return String(b.name||"").localeCompare(String(a.name||""),"es");const left=Date.parse(a.updatedAt||0)||0,right=Date.parse(b.updatedAt||0)||0;return state.sort==="updated_asc"?left-right:right-left;});
}
function render() {
  const products=filteredProducts(); elements.list.replaceChildren(); elements.results.textContent=`${products.length} ${products.length===1?"producto":"productos"}`; elements.empty.hidden=products.length!==0;
  const fragment=document.createDocumentFragment();
  products.forEach((product)=>{
    const row=elements.template.content.firstElementChild.cloneNode(true); const image=row.querySelector(".product-image"); image.src=product.image||"../logo-finds.png"; image.alt=product.name||"Producto de Finds"; image.onerror=()=>{ image.src="../logo-finds.png"; };
    row.querySelector(".product-name").textContent=product.name;
    const updated=product.updatedAt?new Date(product.updatedAt).toLocaleString("es-CR",{dateStyle:"short",timeStyle:"short"}):"Sin fecha";row.querySelector(".product-meta").textContent=[CATEGORY_LABELS[product.category]||product.category,product.sizes&&product.sizes!=="No aplica"?`Tallas: ${product.sizes}`:"",`Editado: ${updated}`].filter(Boolean).join(" · ");
    row.querySelector(".product-description").textContent=product.description||"Sin descripción"; row.querySelector(".product-price").textContent=product.price||"Sin precio";
    const status=row.querySelector(".status-pill"); if(product.visible===false){ status.textContent="Oculto"; status.classList.add("is-hidden"); } else { status.textContent=product.status||"Disponible"; if(product.status==="Agotado") status.classList.add("is-out"); }
    const edit=row.querySelector(".edit-button"); edit.dataset.productId=product.id; edit.setAttribute("aria-label",`Editar ${product.name}`);
    const quick=row.querySelector(".quick-status"); quick.dataset.productId=product.id; quick.textContent=product.status==="Agotado"?"Marcar disponible":"Marcar agotado"; quick.setAttribute("aria-label",`${quick.textContent}: ${product.name}`);
    for(const selector of [".share-whatsapp",".share-instagram"]){const button=row.querySelector(selector);button.dataset.productId=product.id;button.setAttribute("aria-label",`${button.textContent}: ${product.name}`);}
    fragment.append(row);
  }); elements.list.append(fragment);
}
function updateStats() { elements.total.textContent=state.products.length; elements.available.textContent=state.products.filter((p)=>p.visible!==false&&p.status==="Disponible").length; elements.hidden.textContent=state.products.filter((p)=>p.visible===false||p.status==="Agotado").length; }
function estimatedSalesByMonth() {
  const months = new Map();
  state.products.filter(p=>p.status==="Agotado"&&(!analyticsPeriod||(p.updatedAt>=analyticsPeriod.start&&p.updatedAt<analyticsPeriod.end))).forEach(p=>{ const month=(p.updatedAt||new Date().toISOString()).slice(0,7); months.set(month,(months.get(month)||0)+1); });
  return [...months].sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([label,value])=>({label,value}));
}
function isoDate(date){return date.toISOString().slice(0,10);}
function isoWeekValue(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));return `${d.getUTCFullYear()}-W${String(Math.ceil((((d-yearStart)/86400000)+1)/7)).padStart(2,"0")}`;}
function setupPeriodFilter(){const now=new Date(),month=document.querySelector("#analytics-month"),week=document.querySelector("#analytics-week"),year=document.querySelector("#analytics-year");month.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;week.value=isoWeekValue(now);for(let value=now.getFullYear();value>=2024;value--){const option=document.createElement("option");option.value=option.textContent=value;year.append(option);}year.value=String(now.getFullYear());}
function getPeriod(){const type=document.querySelector("#analytics-period-type").value;let start,end,label;if(type==="year"){const year=Number(document.querySelector("#analytics-year").value);start=new Date(Date.UTC(year,0,1));end=new Date(Date.UTC(year+1,0,1));label=`Año ${year}`;}else if(type==="week"){const [year,week]=document.querySelector("#analytics-week").value.split("-W").map(Number);const jan4=new Date(Date.UTC(year,0,4)),monday=new Date(jan4);monday.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()||7)+1+(week-1)*7);start=monday;end=new Date(start);end.setUTCDate(end.getUTCDate()+7);label=`Semana ${week} de ${year}`;}else{const [year,month]=document.querySelector("#analytics-month").value.split("-").map(Number);start=new Date(Date.UTC(year,month-1,1));end=new Date(Date.UTC(year,month,1));label=new Intl.DateTimeFormat("es-CR",{month:"long",year:"numeric",timeZone:"UTC"}).format(start);}return {type,start:isoDate(start),end:isoDate(end),label};}
function updatePeriodControls(){const type=document.querySelector("#analytics-period-type").value;document.querySelector("#analytics-month").hidden=type!=="month";document.querySelector("#analytics-week").hidden=type!=="week";document.querySelector("#analytics-year").hidden=type!=="year";loadAnalytics();}
function renderBars(target, rows) {
  const el=document.querySelector(target); if(!rows?.length){el.innerHTML='<p class="chart-empty">Los datos aparecerán cuando el catálogo reciba actividad.</p>';return;}
  const max=Math.max(...rows.map(r=>Number(r.value)||0),1); el.innerHTML=rows.map(r=>`<div class="bar-item"><b>${r.value}</b><i style="height:${Math.max(3,(r.value/max)*125)}px"></i><small title="${r.label}">${r.label}</small></div>`).join("");
}
function renderRanks(target, rows) {
  const el=document.querySelector(target); if(!rows?.length){el.innerHTML='<p class="chart-empty">Todavía no hay datos suficientes.</p>';return;} const max=Math.max(...rows.map(r=>Number(r.value)||0),1);
  el.innerHTML=rows.slice(0,6).map(r=>`<div class="rank-row"><div><strong title="${r.label}">${r.label}</strong><i><span style="width:${(r.value/max)*100}%"></span></i></div><b>${r.value}</b></div>`).join("");
}
function renderDevices(rows){const el=document.querySelector("#devices-chart"),labels={desktop:"Computadora",mobile:"Teléfono móvil",tablet:"Tablet"},icons={desktop:"▰",mobile:"▯",tablet:"▭"};if(!rows?.length){el.innerHTML='<p class="chart-empty">La clasificación comenzará con las nuevas visitas.</p>';return;}const total=rows.reduce((sum,row)=>sum+Number(row.value||0),0);el.innerHTML=rows.map(row=>{const percent=Math.round((Number(row.value)/total)*100);return `<div class="device-row"><span class="device-icon" aria-hidden="true">${icons[row.label]||"◇"}</span><div><strong>${labels[row.label]||"Otro"}</strong><i><span style="width:${percent}%"></span></i></div><b>${row.value}<small>${percent}%</small></b></div>`;}).join("");}
function renderAnalytics(report) {
  analyticsReport=report; const totals=report.totals||{}; const sales=state.products.filter(p=>p.status==="Agotado"&&(!analyticsPeriod||(p.updatedAt>=analyticsPeriod.start&&p.updatedAt<analyticsPeriod.end))).length;
  document.querySelector("#metric-visits").textContent=totals.page_view||0; document.querySelector("#metric-products").textContent=totals.product_view||0; document.querySelector("#metric-whatsapp").textContent=totals.whatsapp_click||0; document.querySelector("#metric-instagram").textContent=totals.instagram_click||0; document.querySelector("#metric-searches").textContent=totals.search||0; document.querySelector("#metric-sales").textContent=sales;
  const namedProducts=(report.topProducts||[]).map(row=>({...row,label:state.products.find(product=>product.id===row.label)?.name||row.label}));
  renderBars("#visits-chart",report.dailyVisits); renderDevices(report.deviceBreakdown); renderRanks("#products-chart",namedProducts); renderRanks("#searches-chart",report.topSearches); renderBars("#sales-chart",estimatedSalesByMonth());
}
async function loadAnalytics() {
  const status=document.querySelector("#analytics-status"); if(ANALYTICS_API.startsWith("__")){status.textContent="La conexión de estadísticas está pendiente de publicación.";return;}
  status.textContent="Actualizando datos…"; try{analyticsPeriod=getPeriod();const params=new URLSearchParams({start:analyticsPeriod.start,end:analyticsPeriod.end});const response=await fetch(`${ANALYTICS_API}/analytics?${params}`,{cache:"no-store"}); if(!response.ok)throw new Error(); const report=await response.json(); renderAnalytics(report); status.textContent=`${analyticsPeriod.label} · Actualizado ${new Date().toLocaleString("es-CR")}`;}catch{status.textContent="No fue posible cargar las estadísticas. Intenta nuevamente.";}
}
function exportCsv(){ if(!analyticsReport)return; const rows=[["Reporte Finds"],["Periodo",analyticsPeriod?.label||""],["Desde",analyticsPeriod?.start||""],["Hasta",analyticsPeriod?.end||""],["Generado",new Date().toLocaleString("es-CR")],[],["Métrica","Cantidad"],...[Object.entries(analyticsReport.totals||{})],[],["Dispositivo","Visitas"],...(analyticsReport.deviceBreakdown||[]).map(r=>[r.label,r.value]),[],["Producto","Vistas"],...(analyticsReport.topProducts||[]).map(r=>[r.label,r.value]),[],["Búsqueda","Cantidad"],...(analyticsReport.topSearches||[]).map(r=>[r.label,r.value])]; const csv="\ufeff"+rows.map(row=>row.map(cell=>`"${String(cell??"").replaceAll('"','""')}"`).join(",")).join("\r\n"); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a");a.href=url;a.download=`finds-reporte-${analyticsPeriod?.start||new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);}
async function loadProducts() {
  try { let response; try{response=await fetch(`${ANALYTICS_API}/products`,{cache:"no-store"});}catch{} if(!response?.ok)response=await fetch(`../products.json?v=${Date.now()}`,{cache:"no-store"}); if(!response.ok) throw new Error(`No se pudo cargar el catálogo (${response.status})`); state.products=await response.json(); window.findsProducts=state.products; updateStats(); render(); window.dispatchEvent(new CustomEvent("finds:products")); if(analyticsReport) renderAnalytics(analyticsReport); }
  catch(error){ elements.results.textContent="Error de carga"; elements.list.innerHTML=`<p class="error">${error.message}. Actualiza la página para intentarlo nuevamente.</p>`; }
}
elements.search.addEventListener("input",(event)=>{ state.query=event.target.value; render(); });
elements.category.addEventListener("change",(event)=>{ state.category=event.target.value; render(); });
elements.availability.addEventListener("change",(event)=>{ state.availability=event.target.value; render(); });
elements.sort.addEventListener("change",event=>{state.sort=event.target.value;render();});
setupPeriodFilter();document.querySelector("#analytics-period-type").addEventListener("change",updatePeriodControls);for(const id of ["#analytics-month","#analytics-week","#analytics-year"])document.querySelector(id).addEventListener("change",loadAnalytics); document.querySelector("#export-excel").addEventListener("click",exportCsv); document.querySelector("#export-pdf").addEventListener("click",()=>window.print());
loadProducts();
loadAnalytics();
