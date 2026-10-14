// RimbaCamp - server statis + API (tanpa dependensi, butuh Node.js 18+).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { createStore } = require("./lib/store");
const { createOrderService, HttpError } = require("./lib/orders");
const { createAuth } = require("./lib/auth");

const config = loadEnv();
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const products = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data", "products.json"), "utf8"));

if (config.isProduction && (config.admin.password.length < 12 || !config.admin.sessionSecret)) {
  console.error("Produksi: set ADMIN_PASSWORD (min. 12 karakter) dan SESSION_SECRET di .env");
  process.exit(1);
}

const store = createStore(config.dataDir, config.bank);
const orders = createOrderService({ store, products, config });
const auth = createAuth({ ...config.admin, isProduction: config.isProduction });

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

// ---------- helper ----------
function send(res, status, body, headers = {}) {
  const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, "Ukuran foto maksimal 4 MB")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// IP klien: di balik proxy Railway, entri TERAKHIR X-Forwarded-For adalah yang dipasang proxy (tidak bisa dipalsukan klien).
const clientIp = (req) => {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return config.isProduction && xff.length ? xff[xff.length - 1] : req.socket.remoteAddress;
};

function readJson(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, "Payload terlalu besar")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new HttpError(400, "JSON tidak valid")); }
    });
    req.on("error", reject);
  });
}

// ---------- rute ----------
// [method, pola, handler, perluAdmin]
const routes = [];
const route = (method, pattern, handler, admin = false) =>
  routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler, admin });

// Publik
route("GET", "/api/health", async () => ({ ok: true }));

route("GET", "/api/config", async () => ({
  paymentEnabled: orders.bankReady(),
  bankAccount: store.settings.bankAccount,
  holdMinutes: config.holdMinutes,
  slotCapacity: orders.SLOT_CAPACITY,
}));

route("GET", "/api/availability", async ({ query }) => {
  const { startDate, endDate } = query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") || endDate < startDate)
    throw new HttpError(400, "Rentang tanggal tidak valid");
  orders.expireStale();
  return Object.fromEntries(products.map((p) => [p.id, orders.available(p, startDate, endDate)]));
});

route("GET", "/api/slots", async ({ query }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date || "")) throw new HttpError(400, "Tanggal tidak valid");
  orders.expireStale();
  return { date: query.date, slots: orders.slotsFor(query.date) };
});

route("POST", "/api/orders", async ({ body }) => {
  const o = await orders.createOrder(body);
  return { status: 201, data: orders.publicView(o) };
});

route("GET", "/api/orders/:code", async ({ params }) => {
  orders.expireStale();
  const o = orders.find(params.code);
  if (!o) throw new HttpError(404, "Pesanan tidak ditemukan");
  return orders.publicView(o);
});

// Unggah bukti transfer: body = file gambar mentah (bukan JSON).
route("POST", "/api/orders/:code/proof", async ({ params, raw }) => {
  const o = orders.find(params.code);
  if (!o) throw new HttpError(404, "Pesanan tidak ditemukan");
  return orders.publicView(orders.uploadProof(o, raw));
});

// Admin
route("POST", "/api/admin/login", async ({ body, ip }) => {
  const r = auth.login(body.email, body.password, ip);
  if (r.error) throw new HttpError(r.status, r.error);
  return { status: 200, data: { ok: true }, headers: { "Set-Cookie": r.cookie } };
});
route("POST", "/api/admin/logout", async () => ({ status: 200, data: { ok: true }, headers: { "Set-Cookie": auth.logoutCookie() } }));
route("GET", "/api/admin/me", async ({ session }) => session, true);
route("GET", "/api/admin/summary", async () => orders.summary(), true);
route("GET", "/api/admin/orders", async () => { orders.expireStale(); return store.orders.slice().reverse().map(orders.adminView); }, true);
route("GET", "/api/admin/payments", async () => {
  orders.expireStale();
  return store.orders.slice().reverse().map(orders.adminView);
}, true);
route("GET", "/api/admin/orders/:code/proof", async ({ params }) => {
  const o = orders.find(params.code);
  const f = o && orders.proofFile(o);
  if (!f) throw new HttpError(404, "Bukti transfer tidak ada");
  return { file: f };
}, true);
route("POST", "/api/admin/orders/:code/verify", async ({ params, body, session }) => {
  const o = orders.find(params.code);
  if (!o) throw new HttpError(404, "Pesanan tidak ditemukan");
  orders.adminVerify(o, body.approve === true, session.email, body.reason);
  return orders.adminView(o);
}, true);
route("PATCH", "/api/admin/orders/:code/status", async ({ params, body, session }) => {
  const o = orders.find(params.code);
  if (!o) throw new HttpError(404, "Pesanan tidak ditemukan");
  orders.adminSetStatus(o, body.status, session.email);
  return orders.adminView(o);
}, true);
route("GET", "/api/admin/payment-settings", async () => ({ bankAccount: store.settings.bankAccount, paymentEnabled: orders.bankReady() }), true);
route("PUT", "/api/admin/payment-settings", async ({ body }) => {
  const clean = (v, max) => String(v ?? "").trim().slice(0, max);
  const acc = { bankName: clean(body.bankName, 40), accountNumber: clean(body.accountNumber, 30).replace(/[^\d\s-]/g, ""), accountHolder: clean(body.accountHolder, 60) };
  if (!acc.bankName || acc.accountNumber.replace(/\D/g, "").length < 5 || !acc.accountHolder)
    throw new HttpError(400, "Nama bank, nomor rekening (min. 5 digit), dan nama pemilik wajib diisi");
  store.settings.bankAccount = acc;
  store.save();
  return { bankAccount: acc, paymentEnabled: true };
}, true);
route("GET", "/api/admin/stock", async ({ query }) => {
  orders.expireStale();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || "") ? query.from : orders.todayJakarta();
  return orders.stockGrid(from, 7);
}, true);
route("GET", "/api/admin/products", async () => products, true);

// ---------- penanganan request ----------
async function handleApi(req, res, url) {
  const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
  if (!match) {
    if (routes.some((r) => r.re.test(url.pathname))) return send(res, 405, { error: "Method tidak diizinkan" });
    return send(res, 404, { error: "Endpoint tidak ditemukan" });
  }
  const session = auth.verify(req.headers.cookie);
  if (match.admin && !session) return send(res, 401, { error: "Perlu login admin" });

  // Perlindungan CSRF: request admin yang mengubah data wajib same-origin
  if (req.method !== "GET" && url.pathname.startsWith("/api/admin/")) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: "Origin tidak diizinkan" });
  }

  const params = match.re.exec(url.pathname).groups || {};
  const isProof = req.method === "POST" && /\/proof$/.test(url.pathname) && !match.admin;
  const raw = isProof ? await readRaw(req, 4 * 1024 * 1024) : null;
  const body = !isProof && ["POST", "PUT", "PATCH"].includes(req.method) ? await readJson(req) : {};
  const out = await match.handler({ params, query: Object.fromEntries(url.searchParams), body, raw, session, ip: clientIp(req) });
  if (out && out.file) {
    res.writeHead(200, { "Content-Type": out.file.mime, "Cache-Control": "private, no-store", "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'" });
    return fs.createReadStream(out.file.file).pipe(res);
  }
  if (out && out.data !== undefined) return send(res, out.status || 200, out.data, out.headers);
  return send(res, 200, out ?? {});
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  let file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Forbidden");
  if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html"; // /katalog -> katalog.html
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Halaman tidak ditemukan");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=300",
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method tidak diizinkan");
    return serveStatic(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    return send(res, 500, { error: "Terjadi kesalahan pada server" });
  }
});

setInterval(() => orders.expireStale(), 60000).unref();

server.listen(config.port, "0.0.0.0", () => {
  console.log(`RimbaCamp berjalan di port ${config.port}`);
  console.log(`Data disimpan di: ${config.dataDir}`);
  console.log(orders.bankReady() ? `Rekening toko: ${store.settings.bankAccount.bankName}` : "Rekening toko BELUM diatur (isi BANK_* di environment atau lewat Admin -> Pembayaran)");
  if (!auth.enabled) console.log("Admin: ADMIN_PASSWORD belum diisi - login admin dinonaktifkan");
  if (!config.identityKey) console.log("Peringatan: IDENTITY_ENCRYPTION_KEY kosong - nomor identitas penuh TIDAK disimpan (hanya 4 digit terakhir)");
});
