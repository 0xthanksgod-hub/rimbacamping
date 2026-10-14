/* Utilitas bersama untuk semua halaman (namespace global: RC) */
window.RC = (() => {
  const TZ = "Asia/Jakarta";
  const MS_DAY = 86400000;

  const rupiah = (v) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

  // Escape wajib untuk semua data dari server/pengguna yang dimasukkan ke innerHTML
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /** Penanda ikon Lucide; diubah menjadi SVG oleh lucide.createIcons() */
  const icon = (name, size = 20, extra = "") =>
    `<i data-lucide="${name}" width="${size}" height="${size}" ${extra}></i>`;

  const paintIcons = () => window.lucide && window.lucide.createIcons();

  /** Isi elemen dengan HTML lalu gambar ikon */
  const render = (el, html) => {
    el.innerHTML = html;
    paintIcons();
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---- tanggal (Asia/Jakarta) ----
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const parse = (s) => new Date(s + "T00:00:00Z");
  const addDays = (s, n) => new Date(parse(s).getTime() + n * MS_DAY).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / MS_DAY);
  const fmtDate = (s, opts = { day: "numeric", month: "long", year: "numeric" }) =>
    new Intl.DateTimeFormat("id-ID", { ...opts, timeZone: "UTC" }).format(parse(s));
  const fmtDateTime = (iso) =>
    new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(iso)) + " WIB";
  const fmtRange = (a, b) => {
    const da = parse(a), db = parse(b);
    const m = (d) => new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(d);
    return a === b ? fmtDate(a) : da.getUTCMonth() === db.getUTCMonth()
      ? `${da.getUTCDate()}–${db.getUTCDate()} ${m(db)} ${db.getUTCFullYear()}`
      : `${fmtDate(a)} – ${fmtDate(b)}`;
  };

  // ---- API ----
  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* respons kosong */ }
    if (!res.ok) {
      const err = new Error(data.error || `Permintaan gagal (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const brand = (compact = false) =>
    `<div class="brand"><span class="brand-mark">${icon("tent-tree", compact ? 20 : 24, 'stroke-width="2.2"')}</span><span><strong>Rimba</strong>Camp</span></div>`;

  let productsPromise;
  const loadProducts = () => (productsPromise ||= fetch("/data/products.json").then((r) => r.json()));

  // ---- toast ----
  function toast(message, type = "info") {
    let box = $("#toast-box");
    if (!box) { box = document.createElement("div"); box.id = "toast-box"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.setAttribute("role", "status");
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  const statusLabel = {
    PENDING_PAYMENT: ["Menunggu pembayaran", "warning"],
    BOOKED: ["Sudah dibayar", "success"],
    PICKED_UP: ["Sedang disewa", "info"],
    COMPLETED: ["Selesai", "neutral"],
    EXPIRED: ["Kedaluwarsa", "neutral"],
    CANCELLED: ["Dibatalkan", "danger"],
    REJECTED: ["Ditolak", "danger"],
  };
  const statusBadge = (status, payStatus) => {
    let [label, type] = statusLabel[status] || [status, "neutral"];
    if (status === "PENDING_PAYMENT" && payStatus === "PROOF_UPLOADED") [label, type] = ["Menunggu verifikasi", "info"];
    return `<span class="status-badge ${type}">${esc(label)}</span>`;
  };

  return { brand, rupiah, esc, icon, paintIcons, render, $, $$, today, addDays, diffDays, fmtDate, fmtDateTime, fmtRange, api, loadProducts, toast, statusBadge, statusLabel };
})();
