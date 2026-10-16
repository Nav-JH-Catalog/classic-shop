const grid = document.querySelector("#product-grid");

function whatsappUrl(message) {
  return `https://wa.me/${CATALOG_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
}

function renderProducts(filter = "Todos") {
  const items = filter === "Todos"
    ? CATALOG_CONFIG.products
    : CATALOG_CONFIG.products.filter(product => product.category === filter);

  grid.innerHTML = items.map(product => `
    <article class="product-card">
      <div class="product-image" style="--card-color:${product.color}">
        <span class="demo-tag">Demostración</span>
      </div>
      <div class="product-info">
        <div>
          <h3>${product.name}</h3>
          <p>${product.category} · ${product.price}</p>
        </div>
        <a class="product-action" href="${whatsappUrl(`Hola, me interesa ${product.name}. ¿Podrías darme más información?`)}" target="_blank" rel="noopener">Consultar</a>
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
document.querySelector("#copyright").textContent = `© ${new Date().getFullYear()} ${CATALOG_CONFIG.businessName}`;
renderProducts();
