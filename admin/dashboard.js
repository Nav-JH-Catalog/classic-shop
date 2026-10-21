const CMS_BASE = "https://app.pagescms.org/nav-jh-catalog/classic-shop/main/collection/catalogo";
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
async function loadProducts() {
  try { const response=await fetch(`../products.json?v=${Date.now()}`,{cache:"no-store"}); if(!response.ok) throw new Error(`No se pudo cargar el catálogo (${response.status})`); state.products=await response.json(); updateStats(); render(); }
  catch(error){ elements.results.textContent="Error de carga"; elements.list.innerHTML=`<p class="error">${error.message}. Actualiza la página para intentarlo nuevamente.</p>`; }
}
elements.search.addEventListener("input",(event)=>{ state.query=event.target.value; render(); });
elements.category.addEventListener("change",(event)=>{ state.category=event.target.value; render(); });
elements.availability.addEventListener("change",(event)=>{ state.availability=event.target.value; render(); });
loadProducts();
