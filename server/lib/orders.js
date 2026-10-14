// Logika bisnis: ketersediaan stok, slot pengambilan, pembuatan order, dan sinkronisasi status pembayaran.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TZ = "Asia/Jakarta";
const SLOTS = ["08.00", "09.00", "10.00", "14.00", "15.00", "16.00", "17.00", "18.00"];
const SLOT_CAPACITY = 5;
const MS_DAY = 86400000;

const todayJakarta = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const nowJakartaMinutes = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
};
const parseDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00Z") : null);
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmtDate(new Date(parseDate(s).getTime() + n * MS_DAY));
const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / MS_DAY);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function createOrderService({ store, products, config }) {
  const productById = new Map(products.map((p) => [p.id, p]));

  // ---------- identitas terenkripsi (AES-256-GCM) ----------
  const key = config.identityKey ? Buffer.from(config.identityKey, "base64") : null;
  if (key && key.length !== 32) throw new Error("IDENTITY_ENCRYPTION_KEY harus 32 byte (base64)");
  function encrypt(text) {
    if (!key) return null;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
  }

  // ---------- ketersediaan ----------
  const holdsStock = (o) =>
    o.status === "BOOKED" || o.status === "PICKED_UP" ||
    (o.status === "PENDING_PAYMENT" && (o.payment.status === "PROOF_UPLOADED" || new Date(o.holdExpiresAt) > new Date()));

  function reservedQty(productId, start, end) {
    let max = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      let used = 0;
      for (const o of store.orders) {
        if (!holdsStock(o) || o.startDate > d || o.endDate < d) continue;
        for (const it of o.items) if (it.productId === productId) used += it.qty;
      }
      max = Math.max(max, used);
    }
    return max;
  }
  const available = (p, start, end) => Math.max(0, p.stock - reservedQty(p.id, start, end));

  function slotUsage(date) {
    const usage = Object.fromEntries(SLOTS.map((s) => [s, 0]));
    for (const o of store.orders) {
      if (!holdsStock(o) || !o.pickupAt.startsWith(date)) continue;
      usage[o.pickupSlot] = (usage[o.pickupSlot] || 0) + 1;
    }
    return usage;
  }

  function slotsFor(date) {
    const usage = slotUsage(date);
    const today = todayJakarta();
    return SLOTS.map((time) => {
      const past = date < today || (date === today && Number(time.slice(0, 2)) * 60 <= nowJakartaMinutes());
      return { time, full: usage[time] >= SLOT_CAPACITY, past };
    });
  }

  // ---------- siklus hidup order ----------
  function log(order, to, actor, note) {
    order.statusLog.push({ from: order.status, to, at: new Date().toISOString(), actor, note: note || null });
    order.status = to;
  }

  function expireStale() {
    let changed = false;
    for (const o of store.orders) {
      // Bukti yang sudah diunggah menunggu verifikasi admin, jadi stok tidak dilepas otomatis.
      if (o.status === "PENDING_PAYMENT" && o.payment.status !== "PROOF_UPLOADED" && new Date(o.holdExpiresAt) <= new Date()) {
        log(o, "EXPIRED", "system", "Batas waktu pembayaran habis");
        if (["PENDING", "REJECTED"].includes(o.payment.status)) o.payment.status = "EXPIRE";
        changed = true;
      }
    }
    if (changed) store.save();
  }

  // ---------- validasi & pembuatan order ----------
  function validate(input) {
    const today = todayJakarta();
    const { startDate, endDate, items, customer, pickupSlot } = input || {};
    if (!parseDate(startDate) || !parseDate(endDate)) throw new HttpError(400, "Tanggal tidak valid");
    if (startDate <= today) throw new HttpError(400, "Tanggal mulai minimal besok");
    if (endDate < startDate) throw new HttpError(400, "Tanggal selesai harus setelah tanggal mulai");
    const days = diffDays(startDate, endDate) + 1;
    if (days > 14) throw new HttpError(400, "Maksimal sewa 14 hari");
    if (!Array.isArray(items) || !items.length || items.length > 10) throw new HttpError(400, "Pilih minimal satu alat");

    const lines = [];
    for (const it of items) {
      const p = productById.get(Number(it.productId));
      const qty = Number(it.qty);
      if (!p || !Number.isInteger(qty) || qty < 1) throw new HttpError(400, "Item pesanan tidak valid");
      if (qty > available(p, startDate, endDate)) throw new HttpError(409, `Stok ${p.name} tidak cukup pada tanggal tersebut`);
      lines.push({ productId: p.id, name: p.name, qty, dailyPrice: p.price, lineTotal: p.price * qty * days });
    }

    const name = String(customer?.name || "").trim();
    const idNumber = String(customer?.identityNumber || "").replace(/\s+/g, "");
    const wa = String(customer?.whatsapp || "").replace(/[\s-]/g, "");
    if (name.length < 3 || name.length > 80) throw new HttpError(400, "Nama sesuai identitas wajib diisi");
    if (!["KTP", "SIM", "PASSPORT"].includes(customer?.identityType)) throw new HttpError(400, "Jenis identitas tidak valid");
    if (!/^[A-Za-z0-9]{6,24}$/.test(idNumber)) throw new HttpError(400, "Nomor identitas tidak valid");
    if (!/^(\+62|62|0)8\d{7,12}$/.test(wa)) throw new HttpError(400, "Nomor WhatsApp tidak valid (contoh 08123456789)");
    if (!customer?.consent) throw new HttpError(400, "Syarat sewa harus disetujui");

    const pickupDate = addDays(startDate, -1); // aturan: ambil H-1
    const slot = slotsFor(pickupDate).find((s) => s.time === pickupSlot);
    if (!slot) throw new HttpError(400, "Jadwal pengambilan tidak valid");
    if (slot.past) throw new HttpError(400, "Jam pengambilan sudah lewat");
    if (slot.full) throw new HttpError(409, "Jadwal pengambilan sudah penuh");

    return { startDate, endDate, days, lines, name, idNumber, wa, pickupDate, pickupSlot };
  }

  const newCode = (today) =>
    `RMC-${today.slice(2).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  const bankReady = () => Boolean(store.settings.bankAccount.accountNumber && store.settings.bankAccount.bankName);

  async function createOrder(input) {
    expireStale();
    if (!bankReady()) throw new HttpError(503, "Rekening pembayaran toko belum diatur. Hubungi admin.");

    // Validasi + reservasi stok dilakukan sinkron (tanpa await) agar tidak ada race condition.
    const v = validate(input);
    const subtotal = v.lines.reduce((s, l) => s + l.lineTotal, 0);
    const code = newCode(todayJakarta());
    const order = {
      code,
      status: "PENDING_PAYMENT",
      createdAt: new Date().toISOString(),
      startDate: v.startDate, endDate: v.endDate, rentalDays: v.days,
      items: v.lines, subtotal, total: subtotal,
      holdExpiresAt: new Date(Date.now() + config.holdMinutes * 60000).toISOString(),
      pickupAt: `${v.pickupDate}T${v.pickupSlot.replace(".", ":")}`,
      pickupSlot: v.pickupSlot,
      customer: {
        name: v.name,
        identityType: input.customer.identityType,
        identityNumberEnc: encrypt(v.idNumber),
        identityLast4: v.idNumber.slice(-4),
        whatsapp: v.wa,
        consentedAt: new Date().toISOString(),
      },
      // status pembayaran: PENDING (belum transfer) -> PROOF_UPLOADED (menunggu verifikasi) -> SETTLEMENT | REJECTED | EXPIRE | CANCEL
      payment: { status: "PENDING", amount: subtotal, proof: null, rejectReason: null },
      statusLog: [{ from: null, to: "PENDING_PAYMENT", at: new Date().toISOString(), actor: "customer", note: "Order dibuat" }],
    };
    store.orders.push(order);
    store.save();

    return order;
  }

  // ---------- tampilan publik / admin ----------
  function publicView(o) {
    const p = o.payment;
    return {
      code: o.code, status: o.status, createdAt: o.createdAt,
      startDate: o.startDate, endDate: o.endDate, rentalDays: o.rentalDays,
      items: o.items, total: o.total, pickupAt: o.pickupAt, pickupSlot: o.pickupSlot,
      holdExpiresAt: o.holdExpiresAt,
      customerName: o.customer.name,
      payment: {
        status: p.status, settlementAt: p.settlementAt || null,
        proofUploadedAt: p.proof?.uploadedAt || null,
        rejectReason: p.status === "REJECTED" ? p.rejectReason : null,
      },
    };
  }

  function adminView(o) {
    return {
      ...publicView(o),
      customer: { name: o.customer.name, identityType: o.customer.identityType, identityLast4: o.customer.identityLast4, whatsapp: o.customer.whatsapp },
      payment: { ...publicView(o).payment, hasProof: Boolean(o.payment.proof), updatedAt: o.payment.updatedAt || null },
      statusLog: o.statusLog,
    };
  }

  const find = (code) => store.orders.find((o) => o.code === code);

  // ---------- bukti transfer ----------
  const MAX_PROOF = 4 * 1024 * 1024;
  function detectImage(buf) {
    if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
    if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
    if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
    return null;
  }

  function uploadProof(order, buf) {
    expireStale();
    if (order.status !== "PENDING_PAYMENT") throw new HttpError(409, "Pesanan ini sudah tidak menunggu pembayaran");
    if (order.payment.status === "PROOF_UPLOADED") throw new HttpError(409, "Bukti sudah dikirim dan sedang diverifikasi");
    if (!buf.length) throw new HttpError(400, "File bukti kosong");
    if (buf.length > MAX_PROOF) throw new HttpError(413, "Ukuran foto maksimal 4 MB");
    const type = detectImage(buf);
    if (!type) throw new HttpError(400, "Bukti harus berupa foto JPG, PNG, atau WEBP");
    const name = `${order.code}-${Date.now()}.${type.ext}`;
    fs.writeFileSync(path.join(store.proofDir, name), buf);
    if (order.payment.proof) fs.rm(path.join(store.proofDir, order.payment.proof.file), () => {});
    order.payment.proof = { file: name, mime: type.mime, uploadedAt: new Date().toISOString() };
    order.payment.status = "PROOF_UPLOADED";
    order.payment.rejectReason = null;
    order.payment.updatedAt = new Date().toISOString();
    store.save();
    return order;
  }

  function proofFile(order) {
    const pr = order.payment.proof;
    if (!pr) return null;
    const file = path.join(store.proofDir, path.basename(pr.file));
    return fs.existsSync(file) ? { file, mime: pr.mime } : null;
  }

  /** Admin memverifikasi bukti: setujui (lunas -> BOOKED) atau tolak (customer bisa unggah ulang). */
  function adminVerify(order, approve, actor, reason) {
    if (order.payment.status !== "PROOF_UPLOADED") throw new HttpError(400, "Belum ada bukti transfer yang perlu diverifikasi");
    const p = order.payment;
    p.updatedAt = new Date().toISOString();
    if (approve) {
      p.status = "SETTLEMENT";
      p.settlementAt = p.updatedAt;
      log(order, "BOOKED", actor, "Pembayaran diverifikasi admin");
    } else {
      p.status = "REJECTED";
      p.rejectReason = String(reason || "Bukti transfer tidak sesuai").slice(0, 200);
      order.holdExpiresAt = new Date(Date.now() + config.holdMinutes * 60000).toISOString(); // beri waktu unggah ulang
      order.statusLog.push({ from: order.status, to: order.status, at: p.updatedAt, actor, note: "Bukti ditolak: " + p.rejectReason });
    }
    store.save();
  }

  function adminSetStatus(order, to, actor) {
    const allowed = {
      BOOKED: ["PICKED_UP", "CANCELLED"],
      PICKED_UP: ["COMPLETED"],
      PENDING_PAYMENT: ["CANCELLED"],
    };
    if (!allowed[order.status]?.includes(to)) throw new HttpError(400, `Status ${order.status} tidak dapat diubah ke ${to}`);
    log(order, to, actor, "Diubah oleh admin");
    if (to === "CANCELLED" && ["PENDING", "PROOF_UPLOADED", "REJECTED"].includes(order.payment.status)) order.payment.status = "CANCEL";
    store.save();
  }

  function summary() {
    expireStale();
    const today = todayJakarta();
    const month = today.slice(0, 7);
    const paid = store.orders.filter((o) => o.payment.status === "SETTLEMENT");
    const monthRevenue = paid.filter((o) => (o.payment.settlementAt || o.createdAt).slice(0, 7) === month).reduce((s, o) => s + o.total, 0);
    const prev = (() => { const d = parseDate(today); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return fmtDate(d).slice(0, 7); })();
    const prevRevenue = paid.filter((o) => (o.payment.settlementAt || o.createdAt).slice(0, 7) === prev).reduce((s, o) => s + o.total, 0);

    const months = [];
    const base = parseDate(today); base.setUTCDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base); d.setUTCMonth(d.getUTCMonth() - i);
      const k = fmtDate(d).slice(0, 7);
      months.push({ month: k, revenue: paid.filter((o) => (o.payment.settlementAt || o.createdAt).slice(0, 7) === k).reduce((s, o) => s + o.total, 0) });
    }

    const counts = {};
    const rented = store.orders.filter((o) => ["BOOKED", "PICKED_UP", "COMPLETED"].includes(o.status) && o.startDate.slice(0, 7) === month);
    for (const o of rented) {
      for (const it of o.items) {
        const c = (counts[it.productId] ||= { productId: it.productId, name: it.name, times: 0, revenue: 0 });
        c.times += it.qty; c.revenue += it.lineTotal;
      }
    }
    return {
      today,
      bookingsToday: store.orders.filter((o) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(o.createdAt)) === today).length,
      pickupsToday: store.orders.filter((o) => o.pickupAt.startsWith(today) && ["BOOKED", "PICKED_UP"].includes(o.status)).length,
      returnsToday: store.orders.filter((o) => o.endDate === today && o.status === "PICKED_UP").length,
      pendingPayments: store.orders.filter((o) => o.status === "PENDING_PAYMENT").length,
      needsVerification: store.orders.filter((o) => o.payment.status === "PROOF_UPLOADED").length,
      monthRevenue, prevRevenue, months,
      topProducts: Object.values(counts).sort((a, b) => b.times - a.times).slice(0, 3),
      needsAction: store.orders
        .filter((o) => (o.status === "BOOKED" && o.pickupAt.startsWith(today)) || o.status === "PENDING_PAYMENT" || (o.status === "PICKED_UP" && o.endDate <= today))
        .slice(-8).reverse().map(adminView),
    };
  }

  function stockGrid(from, days = 7) {
    return products.map((p) => ({
      productId: p.id, name: p.name, total: p.stock,
      days: Array.from({ length: days }, (_, i) => {
        const d = addDays(from, i);
        return { date: d, available: Math.max(0, p.stock - reservedQty(p.id, d, d)) };
      }),
    }));
  }

  return { createOrder, find, publicView, adminView, uploadProof, proofFile, adminVerify, bankReady, adminSetStatus, summary, stockGrid, slotsFor, available, expireStale, HttpError, todayJakarta, addDays, SLOTS, SLOT_CAPACITY };
}

module.exports = { createOrderService, HttpError, todayJakarta };
