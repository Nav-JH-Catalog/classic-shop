const grid = document.querySelector("#product-grid");
const STORE_CONFIG = {
  whatsapp: "50688989259",
  businessName: "Finds"
};
let products = [];

function whatsappUrl(message) {
  return `https://wa.me/${STORE_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
}

function renderProducts(filter = "Todos") {
  const items = (filter === "Todos"
    ? products
    : products.filter(product => product.category === filter));

  grid.innerHTML = items.map(product => `
    <article class="product-card">
      <div class="product-image ${product.image ? "has-photo" : ""}" style="--card-color:${product.color || "#ded9ce"}">
        ${product.image ? `<img src="${product.image}" alt="${product.name}" loading="lazy">` : `<span class="demo-tag">Sin fotografía</span>`}
        <span class="status-tag ${product.status === "Agotado" ? "is-sold-out" : "is-available"}"><span aria-hidden="true"></span>${product.status || "Disponible"}</span>
      </div>
      <div class="product-info">
        <div>
          <h3>${product.name}</h3>
          <p>${product.category} · ${product.price}</p>
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

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(".filter.active")?.classList.remove("active");
    button.classList.add("active");
    renderProducts(button.dataset.filter);
  });
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
