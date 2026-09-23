const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const initSqlJs = require("sql.js");

const app = express();
const port = process.env.PORT || 3000;
const rootDir = __dirname;
const uploadDir = path.join(rootDir, "uploads");
const databasePath = path.join(rootDir, "vehicles.sqlite");

fs.mkdirSync(uploadDir, { recursive: true });

const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const adminPasswordHash = bcrypt.hashSync(adminPassword, 12);
const upload = multer({
    dest: uploadDir,
    limits: { files: 12, fileSize: 5 * 1024 * 1024 },
    fileFilter: (request, file, callback) => callback(null, file.mimetype.startsWith("image/"))
});

let database;

function saveDatabase() {
    fs.writeFileSync(databasePath, Buffer.from(database.export()));
}

function query(sql, params = {}) {
    const statement = database.prepare(sql);
    if (Array.isArray(params) ? params.length > 0 : Object.keys(params).length > 0) {
        statement.bind(params);
    }
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
}

function run(sql, params = {}) {
    const statement = database.prepare(sql);
    const hasParams = Array.isArray(params)
        ? params.length > 0
        : Object.keys(params).length > 0;

    if (hasParams) statement.bind(params);
    statement.step();
    statement.free();
}

function buscarVeiculos(apenasDisponiveis) {
    const filtro = apenasDisponiveis ? "WHERE v.available = 1" : "";
    return query(
        `SELECT v.*, GROUP_CONCAT(i.filename) AS image_names
         FROM vehicles v
         LEFT JOIN vehicle_images i ON i.vehicle_id = v.id
         ${filtro}
         GROUP BY v.id
         ORDER BY v.created_at DESC`
    ).map((vehicle) => ({
        ...vehicle,
        available: Boolean(vehicle.available),
        images: vehicle.image_names
            ? vehicle.image_names.split(",").map((name) => `/uploads/${name}`)
            : []
    }));
}

function exigirAdmin(request, response, next) {
    if (!request.session.admin) return response.status(401).json({ error: "Acesso não autorizado." });
    next();
}

async function start() {
    const SQL = await initSqlJs({
        locateFile: (file) => path.join(rootDir, "node_modules", "sql.js", "dist", file)
    });
    database = fs.existsSync(databasePath)
        ? new SQL.Database(new Uint8Array(fs.readFileSync(databasePath)))
        : new SQL.Database();
    database.run(fs.readFileSync(path.join(rootDir, "database.sql"), "utf8"));
    saveDatabase();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({
        secret: process.env.SESSION_SECRET || "troque-esta-chave-em-producao",
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 8 * 60 * 60 * 1000 }
    }));
    app.use("/uploads", express.static(uploadDir));
    app.use(express.static(path.join(rootDir, "public")));

    app.get("/api/vehicles", (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(buscarVeiculos(true));
    });

    app.post("/api/login", (request, response) => {
        if (typeof request.body.password !== "string" || !bcrypt.compareSync(request.body.password, adminPasswordHash)) {
            return response.status(401).json({ error: "Senha incorreta." });
        }
        request.session.admin = true;
        response.json({ authenticated: true });
    });

    app.post("/api/logout", exigirAdmin, (request, response) => {
        request.session.destroy((error) => {
            if (error) return response.status(500).json({ error: "Não foi possível sair." });
            response.json({ authenticated: false });
        });
    });

    app.get("/api/admin/session", (request, response) => response.json({ authenticated: Boolean(request.session.admin) }));
    app.get("/api/admin/vehicles", exigirAdmin, (request, response) => response.json(buscarVeiculos(false)));

    app.post("/api/admin/vehicles", exigirAdmin, upload.array("images"), (request, response) => {
        const fields = request.body;
        const requiredFields = ["type", "brand", "model", "year", "price", "mileage", "fuel", "transmission", "color"];
        if (requiredFields.some((field) => !fields[field])) {
            return response.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }

        run(
            `INSERT INTO vehicles
            (type, brand, model, year, price, mileage, fuel, transmission, color, description, available)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                fields.type,
                fields.brand,
                fields.model,
                Number(fields.year),
                Number(fields.price),
                Number(fields.mileage),
                fields.fuel,
                fields.transmission,
                fields.color,
                fields.description || "",
                fields.available === "on" ? 1 : 0
            ]
        );
        const vehicleId = query("SELECT last_insert_rowid() AS id")[0].id;
        (request.files || []).forEach((file) => {
            run("INSERT INTO vehicle_images (vehicle_id, filename) VALUES (?, ?)", [vehicleId, file.filename]);
        });
        saveDatabase();
        response.status(201).json({ message: "Veículo cadastrado com sucesso." });
    });

    app.patch("/api/admin/vehicles/:id/availability", exigirAdmin, (request, response) => {
        run("UPDATE vehicles SET available = ? WHERE id = ?", [request.body.available ? 1 : 0, request.params.id]);
        saveDatabase();
        response.json({ message: "Disponibilidade atualizada." });
    });

    app.delete("/api/admin/vehicles/:id", exigirAdmin, (request, response) => {
        const images = query("SELECT filename FROM vehicle_images WHERE vehicle_id = ?", [request.params.id]);
        const exists = query("SELECT id FROM vehicles WHERE id = ?", [request.params.id]).length > 0;
        if (!exists) return response.status(404).json({ error: "Veículo não encontrado." });
        run("DELETE FROM vehicles WHERE id = ?", [request.params.id]);
        images.forEach(({ filename }) => {
            const imagePath = path.join(uploadDir, filename);
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        });
        saveDatabase();
        response.json({ message: "Veículo removido." });
    });

    app.get("/admin", (request, response) => response.sendFile(path.join(rootDir, "public", "admin.html")));

    app.use((error, request, response, next) => {
        console.error("Erro na API:", error);
        if (request.path.startsWith("/api/")) {
            return response.status(500).json({ error: "Erro interno ao processar a solicitação." });
        }
        next(error);
    });

    app.listen(port, () => console.log(`Servidor disponível em http://localhost:${port}`));
}

start().catch((error) => {
    console.error("Não foi possível iniciar o servidor.", error);
    process.exitCode = 1;
});
