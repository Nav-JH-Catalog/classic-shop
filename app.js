const grid = document.querySelector("#product-grid");
const STORE_CONFIG = {
  whatsapp: "50688989259",
  instagram: "https://www.instagram.com/finds_cr/",
  businessName: "Finds"
};
const ANALYTICS_API = "https://finds-analytics-api.josuehidalgocastro.workers.dev";
function analyticsDevice(){const ua=navigator.userAgent||"";if(/iPad|Tablet|Kindle|Silk/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1))return "tablet";if(navigator.userAgentData?.mobile||/Mobi|Android|iPhone|iPod/i.test(ua))return "mobile";return "desktop";}
const ANALYTICS_ENABLED = !ANALYTICS_API.startsWith("__");
const analyticsSession = (() => {
  const key = "finds_analytics_session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, value);
  return value;
})();

function trackEvent(type, details = {}) {
  if (!ANALYTICS_ENABLED) return;
  const payload = JSON.stringify({ type, sessionId: analyticsSession, path: location.pathname, device:analyticsDevice(), ...details });
  fetch(`${ANALYTICS_API}/event`, { method:"POST", headers:{"content-type":"application/json"}, body:payload, keepalive:true }).catch(() => {});
}
let products = [];
let activeCategory = "Todos";
let searchTerm = "";
const categoryLabels = {
  nino: "Ropa Niño",
  nina: "Ropa Niña",
  hombre: "Hombre",
  mujer: "Mujer",
  tecnologia: "Tecnología",
  salud: "Salud y cuidado personal"
};
const clothingCategories = new Set(["nino", "nina", "hombre", "mujer"]);

function productSizeMarkup(product) {
  return clothingCategories.has(product.category)
    ? `<p class="product-sizes">Tallas: ${product.sizes || "Consultar"}</p>`
    : "";
}

function whatsappUrl(message) {
  return `https://wa.me/${STORE_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
}

const leadDialog=document.querySelector("#lead-dialog"),leadForm=document.querySelector("#lead-form"),leadStatus=document.querySelector("#lead-status");
let pendingWhatsapp=null;
function savedLead(){try{return JSON.parse(localStorage.getItem("finds_customer")||"null");}catch{return null;}}
async function registerLead(lead,target){const response=await fetch(`${ANALYTICS_API}/lead`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...lead,consent:true,sessionId:analyticsSession,productId:target.productId||""})});if(!response.ok)throw new Error("No pudimos guardar el contacto.");}
document.addEventListener("click",event=>{const link=event.target.closest("a");if(!link||!(link.classList.contains("whatsapp-general")||link.id==="image-viewer-contact"||(link.classList.contains("product-action")&&!link.classList.contains("sold-out"))))return;event.preventDefault();const card=link.closest(".product-card"),target={url:link.href,productId:link.dataset.productId||card?.querySelector(".product-image")?.dataset.productId||""};const known=savedLead();if(known){const popup=window.open("about:blank","_blank");registerLead(known,target).catch(()=>{}).finally(()=>{if(popup)popup.location.href=target.url;else location.href=target.url;});return;}pendingWhatsapp=target;leadStatus.textContent="";leadDialog.showModal();},{capture:true});
leadForm.addEventListener("submit",async event=>{event.preventDefault();if(!pendingWhatsapp)return;const values=Object.fromEntries(new FormData(leadForm));const popup=window.open("about:blank","_blank");leadStatus.textContent="Guardando tus datos…";try{const lead={name:values.name.trim(),phone:values.phone,email:values.email||""};await registerLead(lead,pendingWhatsapp);localStorage.setItem("finds_customer",JSON.stringify(lead));const url=pendingWhatsapp.url;pendingWhatsapp=null;leadDialog.close();if(popup)popup.location.href=url;else location.href=url;}catch(error){if(popup)popup.close();leadStatus.textContent=error.message;}});
leadDialog.querySelector(".lead-close").addEventListener("click",()=>{pendingWhatsapp=null;leadDialog.close();});

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderProducts() {
  const publicProducts = products.filter(product => product.visible !== false);
  const categoryItems = (activeCategory === "Todos"
    ? publicProducts
    : publicProducts.filter(product => product.category === activeCategory));
  const query = normalizeText(searchTerm.trim());
  const items = query
    ? categoryItems.filter(product => normalizeText([
        product.name,
        product.description,
        product.sizes,
        product.price,
        product.status,
        categoryLabels[product.category]
      ].join(" ")).includes(query))
    : categoryItems;

  document.querySelector("#results-count").textContent = `${items.length} ${items.length === 1 ? "producto" : "productos"}`;

  if (!items.length) {
    grid.innerHTML = `<div class="empty-results"><strong>No encontramos resultados</strong><span>Prueba con otro término o selecciona todas las categorías.</span><button type="button" id="clear-catalog-filters">Limpiar búsqueda</button></div>`;
    document.querySelector("#clear-catalog-filters")?.addEventListener("click", clearCatalogFilters);
    return;
  }

  grid.innerHTML = items.map(product => `
    <article class="product-card">
      <div class="product-image ${product.image ? "has-photo" : ""}" style="--card-color:${product.color || "#ded9ce"}" ${product.image ? `role="button" tabindex="0" data-product-id="${product.id}" aria-label="Ver imagen completa de ${product.name}"` : ""}>
        ${product.image ? `<img src="${product.image}" alt="${product.name}" loading="lazy">` : `<span class="demo-tag">Sin fotografía</span>`}
        <span class="status-tag ${product.status === "Agotado" ? "is-sold-out" : "is-available"}"><span aria-hidden="true"></span>${product.status || "Disponible"}</span>
      </div>
      <div class="product-info">
        <div>
          <h3>${product.name}</h3>
          <p>${categoryLabels[product.category] || product.category} · ${product.price}</p>
          ${productSizeMarkup(product)}
          ${product.description ? `<p class="product-description">${product.description}</p>` : ""}
        </div>
        ${product.status === "Agotado"
          ? `<span class="product-action sold-out" aria-label="Producto agotado">Agotado</span>`
          : `<a class="product-action" href="${whatsappUrl(`Hola, me interesa ${product.name}. ¿Podrías darme más información?`)}" target="_blank" rel="noopener">Consultar</a>`}
      </div>
    </article>
  `).join("");
}

const imageViewer = document.querySelector("#image-viewer");
const imageViewerPhoto = document.querySelector("#image-viewer-photo");
const imageViewerCaption = document.querySelector("#image-viewer-caption");
const imageViewerMeta = document.querySelector("#image-viewer-meta");
const imageViewerDescription = document.querySelector("#image-viewer-description");
const imageViewerContact = document.querySelector("#image-viewer-contact");
const imageViewerClose = imageViewer.querySelector("[data-close-viewer]");
let viewerPreviousFocus = null;

function openImageViewer(product) {
  viewerPreviousFocus = document.activeElement;
  imageViewerPhoto.src = product.image;
  imageViewerPhoto.alt = product.name;
  imageViewerCaption.textContent = product.name;
  const sizeDetail = clothingCategories.has(product.category) ? ` · Tallas: ${product.sizes || "Consultar"}` : "";
  imageViewerMeta.textContent = `${categoryLabels[product.category] || product.category} · ${product.price}${sizeDetail} · ${product.status || "Disponible"}`;
  imageViewerDescription.textContent = product.description || "Consulta por más detalles y disponibilidad.";
  imageViewerContact.href = whatsappUrl(`Hola, me gusta ${product.name}. ¿Podrías darme más información y confirmar su disponibilidad?`);
  imageViewerContact.dataset.productId = product.id;
  imageViewer.hidden = false;
  document.body.classList.add("viewer-open");
  imageViewerClose.focus();
  trackEvent("product_view", { productId:product.id, category:product.category });
}

function closeImageViewer() {
  if (imageViewer.hidden) return;
  imageViewer.hidden = true;
  imageViewerPhoto.src = "";
  document.body.classList.remove("viewer-open");
  viewerPreviousFocus?.focus();
}

grid.addEventListener("click", event => {
  const target = event.target.closest(".product-image.has-photo");
  if (!target) return;
  const product = products.find(item => item.id === target.dataset.productId);
  if (product) openImageViewer(product);
});

grid.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target.closest(".product-image.has-photo");
  if (!target) return;
  event.preventDefault();
  const product = products.find(item => item.id === target.dataset.productId);
  if (product) openImageViewer(product);
});

imageViewer.addEventListener("click", event => {
  if (event.target === imageViewer || event.target.closest("[data-close-viewer]")) closeImageViewer();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeImageViewer();
});

const searchInput = document.querySelector("#catalog-search");
const categoryFilter = document.querySelector(".category-filter");
const categoryButton = document.querySelector("#category-filter-button");
const categoryMenu = document.querySelector("#category-menu");
const categoryFilterLabel = document.querySelector("#category-filter-label");

function setCategoryMenu(open) {
  categoryMenu.hidden = !open;
  categoryButton.setAttribute("aria-expanded", String(open));
}

function clearCatalogFilters() {
  activeCategory = "Todos";
  searchTerm = "";
  searchInput.value = "";
  categoryFilterLabel.textContent = "Todas las categorías";
  document.querySelectorAll(".category-option").forEach(option => {
    const selected = option.dataset.filter === "Todos";
    option.classList.toggle("active", selected);
    option.setAttribute("aria-checked", String(selected));
  });
  renderProducts();
  searchInput.focus();
}

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderProducts();
  clearTimeout(searchInput.analyticsTimer);
  searchInput.analyticsTimer = setTimeout(() => {
    if (searchTerm.trim().length > 1) trackEvent("search", { query:searchTerm.trim(), resultCount:document.querySelectorAll(".product-card").length });
  }, 700);
});

categoryButton.addEventListener("click", () => setCategoryMenu(categoryMenu.hidden));

document.querySelectorAll(".category-option").forEach(button => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.filter;
    categoryFilterLabel.textContent = button.textContent;
    document.querySelectorAll(".category-option").forEach(option => {
      const selected = option === button;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-checked", String(selected));
    });
    setCategoryMenu(false);
    renderProducts();
    trackEvent("category_filter", { category:activeCategory });
  });
});

document.addEventListener("click", event => {
  if (!categoryFilter.contains(event.target)) setCategoryMenu(false);
});

categoryFilter.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    setCategoryMenu(false);
    categoryButton.focus();
  }
});

const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector("nav");
menuButton.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}));

document.querySelectorAll(".whatsapp-general").forEach(link => {
  link.href = whatsappUrl("Hola, quisiera recibir más información sobre el catálogo.");
});
document.querySelectorAll(".instagram-link").forEach(link => {
  link.href = STORE_CONFIG.instagram;
});
document.addEventListener("click", event => {
  const link = event.target.closest("a");
  if (!link) return;
  if (link.classList.contains("instagram-link")) trackEvent("instagram_click");
  if (link.classList.contains("whatsapp-general")) trackEvent("whatsapp_click", { source:"general" });
  if (link.id === "image-viewer-contact") trackEvent("whatsapp_click", { source:"product", productId:link.dataset.productId || "" });
  if (link.classList.contains("product-action") && !link.classList.contains("sold-out")) {
    const card = link.closest(".product-card");
    trackEvent("whatsapp_click", { source:"product", productId:card?.querySelector(".product-image")?.dataset.productId || "" });
  }
});
document.querySelector("#copyright").textContent = `© ${new Date().getFullYear()} ${STORE_CONFIG.businessName}`;

async function loadProducts() {
  try {
    let response;
    try { response = await fetch(`${ANALYTICS_API}/products`, { cache:"no-store" }); } catch {}
    if (!response?.ok) response = await fetch(`products.json?v=${Date.now()}`, { cache:"no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el catálogo");
    products = await response.json();
    renderProducts();
  } catch (error) {
    grid.innerHTML = `<p class="catalog-error">El catálogo no está disponible temporalmente. Escríbenos por WhatsApp para recibir atención.</p>`;
  }
}

loadProducts();
trackEvent("page_view", { referrer:document.referrer ? new URL(document.referrer).hostname : "direct" });
