const grid = document.querySelector("#product-grid");
const STORE_CONFIG = {
  whatsapp: "50688989259",
  businessName: "Finds"
};
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

function whatsappUrl(message) {
  return `https://wa.me/${STORE_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
}

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderProducts() {
  const categoryItems = (activeCategory === "Todos"
    ? products
    : products.filter(product => product.category === activeCategory));
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
          <p class="product-sizes">Tallas: ${product.sizes || "Consultar"}</p>
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
  imageViewerMeta.textContent = `${categoryLabels[product.category] || product.category} · ${product.price} · Tallas: ${product.sizes || "Consultar"} · ${product.status || "Disponible"}`;
  imageViewerDescription.textContent = product.description || "Consulta por más detalles y disponibilidad.";
  imageViewerContact.href = whatsappUrl(`Hola, me gusta ${product.name}. ¿Podrías darme más información y confirmar su disponibilidad?`);
  imageViewer.hidden = false;
  document.body.classList.add("viewer-open");
  imageViewerClose.focus();
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
document.querySelector("#copyright").textContent = `© ${new Date().getFullYear()} ${STORE_CONFIG.businessName}`;

async function loadProducts() {
  try {
    const response = await fetch(`products.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("No se pudo cargar el catálogo");
    products = await response.json();
    renderProducts();
  } catch (error) {
    grid.innerHTML = `<p class="catalog-error">El catálogo no está disponible temporalmente. Escríbenos por WhatsApp para recibir atención.</p>`;
  }
}

loadProducts();
