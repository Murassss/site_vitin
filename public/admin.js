const loginPanel = document.querySelector("#login-panel");
const adminPanel = document.querySelector("#admin-panel");
const loginForm = document.querySelector("#login-form");
const vehicleForm = document.querySelector("#vehicle-form");
const adminVehicles = document.querySelector("#admin-vehicles");
const loginMessage = document.querySelector("#login-message");
const adminMessage = document.querySelector("#admin-message");

async function request(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : { error: `O servidor retornou uma resposta inesperada (HTTP ${response.status}).` };
    if (response.status === 401) {
        loginPanel.classList.remove("hidden");
        adminPanel.classList.add("hidden");
        loginMessage.textContent = "Sua sessão terminou. Faça login novamente.";
    }
    if (!response.ok) throw new Error(data.error || "Ocorreu um erro.");
    return data;
}

async function checkSession() {
    const session = await request("/api/admin/session");
    if (session.authenticated) showAdminPanel();
}

function showAdminPanel() {
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    loadAdminVehicles();
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await request("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: document.querySelector("#password").value })
        });
        showAdminPanel();
    } catch (error) {
        loginMessage.textContent = error.message;
    }
});

vehicleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await request("/api/admin/vehicles", { method: "POST", body: new FormData(vehicleForm) });
        vehicleForm.reset();
        vehicleForm.querySelector('[name="available"]').checked = true;
        adminMessage.textContent = "Veículo cadastrado com sucesso.";
        loadAdminVehicles();
    } catch (error) {
        adminMessage.textContent = error.message;
    }
});

async function loadAdminVehicles() {
    let vehicles;
    try {
        vehicles = await request("/api/admin/vehicles");
    } catch (error) {
        adminMessage.textContent = error.message;
        return;
    }

    adminVehicles.replaceChildren();
    vehicles.forEach((vehicle) => {
        const card = document.createElement("article");
        card.className = "vehicle-card";
        const title = document.createElement("h2");
        title.textContent = `${vehicle.brand} ${vehicle.model}`;
        const status = document.createElement("p");
        status.textContent = vehicle.available ? "Publicado na vitrine" : "Oculto da vitrine";
        const toggle = document.createElement("button");
        toggle.className = "secondary";
        toggle.textContent = vehicle.available ? "Ocultar" : "Publicar";
        toggle.addEventListener("click", () => updateAvailability(vehicle.id, !vehicle.available));
        const remove = document.createElement("button");
        remove.className = "danger";
        remove.textContent = "Excluir";
        remove.addEventListener("click", () => removeVehicle(vehicle.id));
        card.append(title, status, toggle, remove);
        adminVehicles.append(card);
    });
}

async function updateAvailability(id, available) {
    await request(`/api/admin/vehicles/${id}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available })
    });
    loadAdminVehicles();
}

async function removeVehicle(id) {
    if (!confirm("Excluir este veículo definitivamente?")) return;
    await request(`/api/admin/vehicles/${id}`, { method: "DELETE" });
    loadAdminVehicles();
}

document.querySelector("#logout").addEventListener("click", async () => {
    await request("/api/logout", { method: "POST" });
    window.location.reload();
});

checkSession().catch((error) => { loginMessage.textContent = error.message; });
