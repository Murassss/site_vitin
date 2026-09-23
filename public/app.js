const vehicleList = document.querySelector("#vehicle-list");
const resultMessage = document.querySelector("#result-message");
const search = document.querySelector("#search");
const typeFilter = document.querySelector("#type-filter");
const priceFilter = document.querySelector("#price-filter");
const searchButton = document.querySelector("#search-button");
let vehicles = [];

async function loadVehicles() {
    const response = await fetch("/api/vehicles", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar os veículos.");
    vehicles = await response.json();
}

function renderVehicles() {
    const term = search.value.trim().toLowerCase();
    const type = typeFilter.value;
    const maxPrice = Number(priceFilter.value);
    const filtered = vehicles.filter((vehicle) => {
        const matchesTerm = `${vehicle.brand} ${vehicle.model}`.toLowerCase().includes(term);
        const matchesType = !type || vehicle.type === type;
        const matchesPrice = !maxPrice || vehicle.price <= maxPrice;
        return matchesTerm && matchesType && matchesPrice;
    });

    vehicleList.replaceChildren();
    filtered.forEach((vehicle) => vehicleList.append(createCard(vehicle)));
    resultMessage.textContent = filtered.length === 0
        ? "Nenhum veículo disponível para os filtros selecionados."
        : `${filtered.length} veículo(s) disponível(is).`;
}

async function searchVehicles() {
    resultMessage.textContent = "Buscando veículos...";

    try {
        await loadVehicles();
        renderVehicles();
    } catch (error) {
        vehicleList.replaceChildren();
        resultMessage.textContent = error.message;
    }
}

function createCard(vehicle) {
    const card = document.createElement("article");
    card.className = "vehicle-card";
    const image = document.createElement("img");
    image.src = vehicle.images[0] || "https://placehold.co/600x400?text=Sem+foto";
    image.alt = `${vehicle.brand} ${vehicle.model}`;
    const title = document.createElement("h2");
    title.textContent = `${vehicle.brand} ${vehicle.model}`;
    const details = document.createElement("p");
    details.textContent = `${vehicle.year} • ${vehicle.mileage.toLocaleString("pt-BR")} km • ${vehicle.fuel}`;
    const price = document.createElement("strong");
    price.textContent = formatPrice(vehicle.price);
    const contact = document.createElement("a");
    contact.className = "contact-button";
    contact.href = `https://wa.me/?text=${encodeURIComponent(`Olá! Tenho interesse no ${vehicle.brand} ${vehicle.model}.`)}`;
    contact.target = "_blank";
    contact.rel = "noopener";
    contact.textContent = "Tenho interesse";
    card.append(image, title, details, price, contact);
    return card;
}

function formatPrice(value) {
    return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

searchButton.addEventListener("click", searchVehicles);
search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        searchVehicles();
    }
});
loadVehicles()
    .then(renderVehicles)
    .catch((error) => {
    resultMessage.textContent = error.message;
    });
