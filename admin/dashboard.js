const CMS_BASE = "https://app.pagescms.org/nav-jh-catalog/classic-shop/main/collection/catalogo";
const ANALYTICS_API = "https://finds-analytics-api.josuehidalgocastro.workers.dev";
let analyticsReport = null;
const CATEGORY_LABELS = { nino:"Ropa Niño", nina:"Ropa Niña", hombre:"Hombre", mujer:"Mujer", tecnologia:"Tecnología", salud:"Salud y cuidado personal" };
const state = { products:[], query:"", category:"all", availability:"all" };
const elements = { list:document.querySelector("#product-list"), template:document.querySelector("#product-template"), empty:document.querySelector("#empty-state"), total:document.querySelector("#total-count"), available:document.querySelector("#available-count"), hidden:document.querySelector("#hidden-count"), results:document.querySelector("#result-count"), search:document.querySelector("#search"), category:document.querySelector("#category"), availability:document.querySelector("#availability") };
function normalize(value) { return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function productEditUrl(product) { return `${CMS_BASE}/edit/${encodeURIComponent(`products/${product.id}.json`)}`; }
function filteredProducts() {
  const query=normalize(state.query);
  return state.products.filter((product)=>{
    const text=normalize([product.name,product.description,product.category,product.price,product.sizes].join(" "));
    const matchesQuery=!query||text.includes(query);
    const matchesCategory=state.category==="all"||product.category===state.category;
    let matchesAvailability=true;
    if(state.availability==="hidden") matchesAvailability=product.visible===false;
    else if(state.availability!=="all") matchesAvailability=product.status===state.availability&&product.visible!==false;
    return matchesQuery&&matchesCategory&&matchesAvailability;
  });
}
function render() {
  const products=filteredProducts(); elements.list.replaceChildren(); elements.results.textContent=`${products.length} ${products.length===1?"producto":"productos"}`; elements.empty.hidden=products.length!==0;
  const fragment=document.createDocumentFragment();
  products.forEach((product)=>{
    const row=elements.template.content.firstElementChild.cloneNode(true); const image=row.querySelector(".product-image"); image.src=product.image||"../logo-finds.png"; image.alt=product.name||"Producto de Finds"; image.onerror=()=>{ image.src="../logo-finds.png"; };
    row.querySelector(".product-name").textContent=product.name;
    row.querySelector(".product-meta").textContent=[CATEGORY_LABELS[product.category]||product.category,product.sizes&&product.sizes!=="No aplica"?`Tallas: ${product.sizes}`:""].filter(Boolean).join(" · ");
    row.querySelector(".product-description").textContent=product.description||"Sin descripción"; row.querySelector(".product-price").textContent=product.price||"Sin precio";
    const status=row.querySelector(".status-pill"); if(product.visible===false){ status.textContent="Oculto"; status.classList.add("is-hidden"); } else { status.textContent=product.status||"Disponible"; if(product.status==="Agotado") status.classList.add("is-out"); }
    const edit=row.querySelector(".edit-button"); edit.href=productEditUrl(product); edit.setAttribute("aria-label",`Editar ${product.name}`); fragment.append(row);
  }); elements.list.append(fragment);
}
function updateStats() { elements.total.textContent=state.products.length; elements.available.textContent=state.products.filter((p)=>p.visible!==false&&p.status==="Disponible").length; elements.hidden.textContent=state.products.filter((p)=>p.visible===false||p.status==="Agotado").length; }
function estimatedSalesByMonth() {
  const months = new Map();
  state.products.filter(p=>p.status==="Agotado").forEach(p=>{ const month=(p.updatedAt||new Date().toISOString()).slice(0,7); months.set(month,(months.get(month)||0)+1); });
  return [...months].sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([label,value])=>({label,value}));
}
function renderBars(target, rows) {
  const el=document.querySelector(target); if(!rows?.length){el.innerHTML='<p class="chart-empty">Los datos aparecerán cuando el catálogo reciba actividad.</p>';return;}
  const max=Math.max(...rows.map(r=>Number(r.value)||0),1); el.innerHTML=rows.map(r=>`<div class="bar-item"><b>${r.value}</b><i style="height:${Math.max(3,(r.value/max)*125)}px"></i><small title="${r.label}">${r.label}</small></div>`).join("");
}
function renderRanks(target, rows) {
  const el=document.querySelector(target); if(!rows?.length){el.innerHTML='<p class="chart-empty">Todavía no hay datos suficientes.</p>';return;} const max=Math.max(...rows.map(r=>Number(r.value)||0),1);
  el.innerHTML=rows.slice(0,6).map(r=>`<div class="rank-row"><div><strong title="${r.label}">${r.label}</strong><i><span style="width:${(r.value/max)*100}%"></span></i></div><b>${r.value}</b></div>`).join("");
}
function renderAnalytics(report) {
  analyticsReport=report; const totals=report.totals||{}; const sales=state.products.filter(p=>p.status==="Agotado").length;
  document.querySelector("#metric-visits").textContent=totals.page_view||0; document.querySelector("#metric-products").textContent=totals.product_view||0; document.querySelector("#metric-whatsapp").textContent=totals.whatsapp_click||0; document.querySelector("#metric-instagram").textContent=totals.instagram_click||0; document.querySelector("#metric-searches").textContent=totals.search||0; document.querySelector("#metric-sales").textContent=sales;
  const namedProducts=(report.topProducts||[]).map(row=>({...row,label:state.products.find(product=>product.id===row.label)?.name||row.label}));
  renderBars("#visits-chart",report.dailyVisits); renderRanks("#products-chart",namedProducts); renderRanks("#searches-chart",report.topSearches); renderBars("#sales-chart",estimatedSalesByMonth());
}
async function loadAnalytics() {
  const status=document.querySelector("#analytics-status"); if(ANALYTICS_API.startsWith("__")){status.textContent="La conexión de estadísticas está pendiente de publicación.";return;}
  status.textContent="Actualizando datos…"; try{const days=document.querySelector("#analytics-range").value; const response=await fetch(`${ANALYTICS_API}/analytics?days=${days}`,{cache:"no-store"}); if(!response.ok)throw new Error(); const report=await response.json(); renderAnalytics(report); status.textContent=`Actualizado ${new Date().toLocaleString("es-CR")}`;}catch{status.textContent="No fue posible cargar las estadísticas. Intenta nuevamente.";}
}
function exportCsv(){ if(!analyticsReport)return; const rows=[["Reporte Finds"],["Periodo",document.querySelector("#analytics-range").selectedOptions[0].text],["Generado",new Date().toLocaleString("es-CR")],[],["Métrica","Cantidad"],...[Object.entries(analyticsReport.totals||{})],[],["Producto","Vistas"],...(analyticsReport.topProducts||[]).map(r=>[r.label,r.value]),[],["Búsqueda","Cantidad"],...(analyticsReport.topSearches||[]).map(r=>[r.label,r.value])]; const csv="\ufeff"+rows.map(row=>row.map(cell=>`"${String(cell??"").replaceAll('"','""')}"`).join(",")).join("\r\n"); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a");a.href=url;a.download=`finds-reporte-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);}
async function loadProducts() {
  try { let response; try{response=await fetch(`${ANALYTICS_API}/products`,{cache:"no-store"});}catch{} if(!response?.ok)response=await fetch(`../products.json?v=${Date.now()}`,{cache:"no-store"}); if(!response.ok) throw new Error(`No se pudo cargar el catálogo (${response.status})`); state.products=await response.json(); updateStats(); render(); if(analyticsReport) renderAnalytics(analyticsReport); }
  catch(error){ elements.results.textContent="Error de carga"; elements.list.innerHTML=`<p class="error">${error.message}. Actualiza la página para intentarlo nuevamente.</p>`; }
}
elements.search.addEventListener("input",(event)=>{ state.query=event.target.value; render(); });
elements.category.addEventListener("change",(event)=>{ state.category=event.target.value; render(); });
elements.availability.addEventListener("change",(event)=>{ state.availability=event.target.value; render(); });
document.querySelector("#analytics-range").addEventListener("change",loadAnalytics); document.querySelector("#export-excel").addEventListener("click",exportCsv); document.querySelector("#export-pdf").addEventListener("click",()=>window.print());
loadProducts();
loadAnalytics();
