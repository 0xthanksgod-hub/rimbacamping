/* Komponen produk: pencarian tanggal, kartu produk, modal detail. */
(() => {
  const { icon, esc, rupiah, render, $, $$ } = RC;

  // ---- tanggal sewa terpilih (dibagi antar halaman) ----
  const KEY = "rc_dates";
  function getDates() {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY));
      if (d && d.startDate > RC.today() && d.endDate >= d.startDate) return d;
    } catch { /* abaikan */ }
    return { startDate: RC.addDays(RC.today(), 3), endDate: RC.addDays(RC.today(), 5) };
  }
  function setDates(d) {
    try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* abaikan */ }
  }
  RC.dates = { get: getDates, set: setDates };

  // ---- pencarian tanggal ----
  RC.dateSearch = (onSearch) => {
    const d = getDates();
    const min = RC.addDays(RC.today(), 1);
    const el = document.createElement("div");
    el.className = "date-search";
    el.innerHTML = `
      <div class="date-field">${icon("calendar-days", 21)}<div>
        <label for="mulai">Mulai sewa</label><input id="mulai" type="date" min="${min}" value="${d.startDate}" />
      </div></div>
      <div class="search-divider"></div>
      <div class="date-field">${icon("calendar-days", 21)}<div>
        <label for="selesai">Selesai sewa</label><input id="selesai" type="date" min="${min}" value="${d.endDate}" />
      </div></div>
      <button class="primary-button search-button" type="button">${icon("search", 19)} Cek Ketersediaan</button>`;
    const start = $("#mulai", el), end = $("#selesai", el);
    start.addEventListener("change", () => {
      if (end.value < start.value) end.value = start.value;
      end.min = start.value;
    });
    $("button", el).addEventListener("click", () => {
      if (!start.value || !end.value || start.value < min || end.value < start.value) {
        RC.toast("Pilih tanggal mulai (minimal besok) dan tanggal selesai yang valid.", "error");
        return;
      }
      setDates({ startDate: start.value, endDate: end.value });
      onSearch(getDates());
    });
    return el;
  };

  // ---- kartu produk ----
  RC.productCard = (p, avail = p.stock) => {
    const low = avail <= 2;
    const stockText = avail === 0 ? "Stok habis" : low ? `Tinggal ${avail} unit` : `${avail} unit tersedia`;
    return `
    <article class="product-card">
      <button class="product-image-wrap" data-detail="${p.id}" aria-label="Lihat detail ${esc(p.name)}">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
        ${p.popular ? `<span class="popular-badge">${icon("flame", 14, 'fill="currentColor"')} Populer</span>` : ""}
        <span class="heart-button">${icon("heart", 18)}</span>
      </button>
      <div class="product-content">
        <div class="stock-row"><span class="stock-dot ${low ? "low" : ""}"></span>${stockText}</div>
        <button class="product-title" data-detail="${p.id}">${esc(p.name)}</button>
        <span class="category-label">${esc(p.category)}</span>
        <div class="product-footer">
          <div><strong>${rupiah(p.price)}</strong><span>/hari</span></div>
          <button class="rent-button" data-book="${p.id}" ${avail === 0 ? "disabled" : ""}>Sewa ${icon("arrow-right", 16)}</button>
        </div>
      </div>
    </article>`;
  };

  /** Ambil stok tersedia untuk rentang tanggal; jika gagal pakai stok total. */
  RC.fetchAvailability = async (products, { startDate, endDate }) => {
    try {
      const a = await RC.api(`/api/availability?startDate=${startDate}&endDate=${endDate}`);
      return Object.fromEntries(products.map((p) => [p.id, a[p.id] ?? p.stock]));
    } catch {
      return Object.fromEntries(products.map((p) => [p.id, p.stock]));
    }
  };

  // ---- modal detail ----
  let modal;
  function closeModal() { modal?.remove(); modal = null; document.body.style.overflow = ""; }
  RC.closeModal = closeModal;

  async function openDetail(id) {
    const products = await RC.loadProducts();
    const p = products.find((x) => x.id === Number(id));
    if (!p) return;
    const dates = getDates();
    const avail = (await RC.fetchAvailability([p], dates))[p.id];
    closeModal();
    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = `
      <div class="detail-modal" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
        <button class="modal-close" data-close aria-label="Tutup detail">${icon("x", 21)}</button>
        <div class="detail-image"><img src="${esc(p.image)}" alt="${esc(p.name)}" />${p.popular ? '<span class="popular-badge">Paling populer</span>' : ""}</div>
        <div class="detail-content">
          <span class="eyebrow">${esc(p.category)}</span>
          <h2>${esc(p.name)}</h2>
          <div class="detail-price">${rupiah(p.price)} <span>/hari</span></div>
          <p>${esc(p.description)}</p>
          <div class="spec-grid">${p.specs.map((s) => `<div>${icon("badge-check", 18)}<span>${esc(s)}</span></div>`).join("")}</div>
          <div class="availability">
            <div><strong>Ketersediaan</strong><span>${RC.fmtRange(dates.startDate, dates.endDate)}</span></div>
            <span class="available">${icon("check", 15)} ${avail} unit tersedia</span>
          </div>
          <button class="primary-button wide" data-book="${p.id}" ${avail === 0 ? "disabled" : ""}>Sewa Sekarang ${icon("arrow-right", 18)}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    RC.paintIcons();
    modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest("[data-close]")) closeModal(); });
  }

  document.addEventListener("click", (e) => {
    const d = e.target.closest("[data-detail]");
    if (d) return openDetail(d.dataset.detail);
    const b = e.target.closest("[data-book]");
    if (b && !b.disabled) { RC.closeModal(); RC.openBooking(Number(b.dataset.book)); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal) closeModal(); });
})();
