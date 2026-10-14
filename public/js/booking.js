/* Wizard booking 5 langkah + pembayaran transfer bank manual (unggah bukti). */
(() => {
  const { icon, esc, rupiah, $, $$ } = RC;
  const STEPS = ["Alat & Tanggal", "Data & Jaminan", "Jadwal Ambil", "Bayar", "Selesai"];
  const ORDERS_KEY = "rc_orders";

  let root, s, config, poll, tick;

  const saveOrderCode = (code) => {
    try {
      const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      if (!list.includes(code)) localStorage.setItem(ORDERS_KEY, JSON.stringify([code, ...list].slice(0, 20)));
    } catch { /* abaikan */ }
  };

  async function open(productId) {
    const products = await RC.loadProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    try { config = await RC.api("/api/config"); } catch { config = { bankAccount: {}, paymentEnabled: false, holdMinutes: 180 }; }
    const dates = RC.dates.get();
    s = {
      step: 1, product, qty: 1, ...dates, maxQty: product.stock,
      name: "", identityType: "KTP", identityNumber: "", whatsapp: "", agreed: false,
      slot: null, slots: [], order: null, busy: false,
    };
    root = document.createElement("div");
    root.className = "modal-backdrop booking-backdrop";
    document.body.appendChild(root);
    document.body.style.overflow = "hidden";
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    RC.pay.bind(root, (o) => { s.order = o; startPolling(); draw(); });
    await refreshAvailability();
    draw();
  }

  function close() {
    clearInterval(poll); clearInterval(tick);
    root?.remove(); root = null;
    document.body.style.overflow = "";
  }

  const days = () => Math.max(1, RC.diffDays(s.startDate, s.endDate) + 1);
  const total = () => s.product.price * days() * s.qty;

  async function refreshAvailability() {
    const a = await RC.fetchAvailability([s.product], { startDate: s.startDate, endDate: s.endDate });
    s.maxQty = a[s.product.id];
    s.qty = Math.max(1, Math.min(s.qty, s.maxQty || 1));
  }

  async function loadSlots() {
    s.slots = [];
    try { s.slots = (await RC.api(`/api/slots?date=${RC.addDays(s.startDate, -1)}`)).slots; } catch (e) { RC.toast(e.message, "error"); }
    if (s.slot && !s.slots.find((x) => x.time === s.slot && !x.full && !x.past)) s.slot = null;
  }

  // ---------- tampilan ----------
  function draw() {
    if (!root) return;
    const body = {
      1: step1, 2: step2, 3: step3, 4: step4, 5: step5,
    }[s.step]();
    root.innerHTML = `
    <div class="booking-modal" role="dialog" aria-modal="true" aria-label="Booking alat">
      <div class="booking-header">
        <button data-act="back" aria-label="Kembali" ${s.step === 5 || s.order ? "hidden" : ""}>${icon("arrow-left", 21)}</button>
        <strong>Booking alat</strong>
        <button data-act="close" aria-label="Tutup">${icon("x", 21)}</button>
      </div>
      <div class="booking-steps">
        ${STEPS.map((l, i) => `<div class="${s.step >= i + 1 ? "active" : ""}"><span>${s.step > i + 1 ? icon("check", 13) : i + 1}</span><small>${l}</small></div>`).join("")}
      </div>
      <div class="booking-layout">
        <div class="booking-main">
          ${body}
          <div class="booking-footer">${footer()}</div>
        </div>
        <aside class="booking-summary">
          <span class="eyebrow">Ringkasan pesanan</span>
          <div class="summary-product">
            <img src="${esc(s.product.image)}" alt="${esc(s.product.name)}" />
            <div><strong>${esc(s.product.name)}</strong><span>${s.qty} unit · ${days()} hari</span></div>
          </div>
          <div class="summary-row"><span>Tanggal sewa</span><strong>${RC.fmtRange(s.startDate, s.endDate)}</strong></div>
          <div class="summary-row"><span>${rupiah(s.product.price)} × ${days()} hari × ${s.qty}</span><strong>${rupiah(total())}</strong></div>
          <div class="summary-total"><span>Total</span><strong>${rupiah(total())}</strong></div>
          <small>Jaminan berupa kartu identitas asli, tanpa uang deposit.</small>
        </aside>
      </div>
    </div>`;
    RC.paintIcons();
    if (s.step === 5) startPolling();
    startTimer();
  }

  function footer() {
    if (s.step === 5) {
      return `<a class="primary-button wide" href="/pesanan.html">Lihat Pesanan Saya ${icon("arrow-right", 18)}</a>`;
    }
    if (s.step === 4) {
      return `<button class="primary-button wide" data-act="pay" ${s.busy || !config.paymentEnabled ? "disabled" : ""}>${s.busy ? "Memproses…" : "Buat pesanan"} ${icon("arrow-right", 18)}</button>`;
    }
    const disabled = (s.step === 1 && s.maxQty === 0) || (s.step === 2 && !s.agreed) || (s.step === 3 && !s.slot);
    return `<button class="primary-button wide" data-act="next" ${disabled ? "disabled" : ""}>Lanjutkan ${icon("arrow-right", 18)}</button>`;
  }

  function step1() {
    const min = RC.addDays(RC.today(), 1);
    return `<div class="step-panel">
      <span class="eyebrow">Langkah 1 dari 5</span>
      <h2>Kapan kamu mau berangkat?</h2>
      <p>Pilih rentang tanggal, lalu tentukan jumlah alat.</p>
      <div class="form-grid">
        <label>Tanggal mulai<input id="f-start" type="date" min="${min}" value="${s.startDate}" /></label>
        <label>Tanggal selesai<input id="f-end" type="date" min="${s.startDate}" value="${s.endDate}" /></label>
      </div>
      <div class="quantity-row">
        <div><strong>Jumlah unit</strong><span>${s.maxQty ? `Maksimal ${s.maxQty} unit pada tanggal ini` : "Stok habis pada tanggal ini"}</span></div>
        <div class="quantity">
          <button data-act="dec" aria-label="Kurangi">${icon("minus", 17)}</button>
          <strong>${s.qty}</strong>
          <button data-act="inc" aria-label="Tambah">${icon("plus", 17)}</button>
        </div>
      </div>
    </div>`;
  }

  function step2() {
    return `<div class="step-panel">
      <span class="eyebrow">Langkah 2 dari 5</span>
      <h2>Data jaminan identitas</h2>
      <div class="identity-alert">${icon("shield-check", 25)}
        <p><strong>Bawa KTP/SIM ASLI saat ambil barang.</strong>
        Data harus sama dengan yang kamu isi di sini. Kartu dikembalikan saat alat dikembalikan.</p></div>
      <div class="form-grid">
        <label>Nama sesuai identitas<input id="f-name" autocomplete="name" placeholder="Contoh: Aditya Pratama" value="${esc(s.name)}" /></label>
        <label>Jenis identitas
          <select id="f-idtype">${[["KTP", "KTP"], ["SIM", "SIM"], ["PASSPORT", "Paspor"]].map(([v, l]) => `<option value="${v}" ${s.identityType === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Nomor identitas<input id="f-idnum" inputmode="text" autocomplete="off" placeholder="Masukkan nomor identitas" value="${esc(s.identityNumber)}" /></label>
        <label>Nomor WhatsApp<input id="f-wa" type="tel" autocomplete="tel" placeholder="08xxxxxxxxxx" value="${esc(s.whatsapp)}" /></label>
      </div>
      <label class="agree-row"><input id="f-agree" type="checkbox" ${s.agreed ? "checked" : ""} />
        <span>Saya menyetujui syarat sewa dan kebijakan privasi.</span></label>
    </div>`;
  }

  function step3() {
    const pickupDate = RC.addDays(s.startDate, -1);
    return `<div class="step-panel">
      <span class="eyebrow">Langkah 3 dari 5</span>
      <h2>Pilih jadwal pengambilan</h2>
      <p>Alat dapat diambil H-1 sebelum tanggal sewa.</p>
      <div class="pickup-date">${icon("calendar-days", 24)}
        <div><strong>${RC.fmtDate(pickupDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong><span>RimbaCamp · Jl. Kaliurang KM 9</span></div></div>
      <strong class="field-title">Pilih jam yang tersedia</strong>
      <div class="slot-grid">
        ${s.slots.length ? s.slots.map((x) => `<button data-slot="${x.time}" ${x.full || x.past ? "disabled" : ""} class="${s.slot === x.time ? "selected" : ""}">${x.time}${x.full ? "<small>Penuh</small>" : x.past ? "<small>Lewat</small>" : ""}</button>`).join("") : "<p>Memuat jadwal…</p>"}
      </div>
    </div>`;
  }

  function step4() {
    return `<div class="step-panel payment-panel">
      <span class="timer">${icon("clock-3", 18)} Stok ditahan ${config.holdMinutes >= 60 ? `${config.holdMinutes / 60} jam` : `${config.holdMinutes} menit`} setelah pesanan dibuat</span>
      <h2>Pembayaran transfer bank</h2>
      <p>Bayar lewat transfer ke rekening toko, lalu unggah foto bukti transfer. Pesananmu aktif setelah admin memverifikasi.</p>
      ${!config.paymentEnabled ? `<div class="notice danger">Rekening pembayaran belum diatur. Hubungi admin toko.</div>` : RC.pay.bankBox(config, total())}
      <p class="hint">Tekan <b>Buat pesanan</b> untuk mengunci stok. Setelah itu kamu bisa mentransfer dan mengunggah bukti di langkah berikutnya.</p>
    </div>`;
  }

  function step5() {
    const o = s.order;
    if (!o) return `<div class="step-panel"><p>Memuat…</p></div>`;
    if (o.status === "BOOKED" || o.status === "PICKED_UP" || o.status === "COMPLETED") {
      return `<div class="success-panel">
        <span class="success-icon">${icon("check", 38)}</span>
        <span class="eyebrow">Pembayaran terverifikasi</span>
        <h2>Alatmu siap untuk petualangan!</h2>
        <p>Simpan kode booking ini untuk ditunjukkan saat pengambilan.</p>
        <button class="booking-code" data-act="copy" data-copy="${esc(o.code)}"><span>#${esc(o.code)}</span>${icon("copy", 18)}</button>
        <div class="must-bring"><strong>Yang harus dibawa</strong>
          <span>${icon("check", 16)} Kartu identitas asli</span>
          <span>${icon("check", 16)} Kode booking</span>
          <span>${icon("check", 16)} Bukti transfer (di HP)</span></div>
      </div>`;
    }
    if (o.status === "EXPIRED" || o.status === "CANCELLED") {
      return `<div class="success-panel">
        <span class="success-icon fail">${icon("x", 38)}</span>
        <span class="eyebrow">Pembayaran ${o.status === "EXPIRED" ? "kedaluwarsa" : "dibatalkan"}</span>
        <h2>Pesanan ini tidak dilanjutkan</h2>
        <p>Stok sudah dilepas kembali. Kamu bisa membuat booking baru kapan saja.</p>
      </div>`;
    }
    return `<div class="success-panel pending">
      <span class="success-icon wait">${icon("clock-3", 36)}</span>
      <span class="eyebrow">${o.payment.status === "PROOF_UPLOADED" ? "Menunggu verifikasi" : "Menunggu pembayaran"}</span>
      <h2>${o.payment.status === "PROOF_UPLOADED" ? "Bukti transfer terkirim" : "Selesaikan transfer bank"}</h2>
      <p>Kode booking <b>#${esc(o.code)}</b>${o.payment.status === "PROOF_UPLOADED" ? "" : ` · unggah bukti sebelum <b id="hold-timer">--:--</b>`}</p>
      ${RC.pay.actions(o, config)}
      <small class="hint">Simpan kode booking. Status juga bisa dicek di halaman Pesanan Saya.</small>
    </div>`;
  }

  // ---------- interaksi ----------
  function onInput(e) {
    const t = e.target;
    if (t.id === "f-name") s.name = t.value;
    else if (t.id === "f-idtype") s.identityType = t.value;
    else if (t.id === "f-idnum") s.identityNumber = t.value;
    else if (t.id === "f-wa") s.whatsapp = t.value;
    else if (t.id === "f-agree") { s.agreed = t.checked; $('[data-act="next"]', root).disabled = !s.agreed; }
    else if (t.id === "f-start" || t.id === "f-end") onDates(t);
  }

  async function onDates(t) {
    const min = RC.addDays(RC.today(), 1);
    let start = $("#f-start", root).value, end = $("#f-end", root).value;
    if (!start || start < min) return;
    if (!end || end < start) end = start;
    if (RC.diffDays(start, end) + 1 > 14) { RC.toast("Maksimal sewa 14 hari.", "error"); end = RC.addDays(start, 13); }
    Object.assign(s, { startDate: start, endDate: end, slot: null });
    RC.dates.set({ startDate: start, endDate: end });
    await refreshAvailability();
    draw();
  }

  function validateStep() {
    if (s.step === 2) {
      if (s.name.trim().length < 3) return "Nama sesuai identitas wajib diisi.";
      if (!/^[A-Za-z0-9\s]{6,30}$/.test(s.identityNumber)) return "Nomor identitas tidak valid.";
      if (!/^(\+62|62|0)8[\d\s-]{7,14}$/.test(s.whatsapp.trim())) return "Nomor WhatsApp tidak valid (contoh 08123456789).";
    }
    return null;
  }

  async function onClick(e) {
    const slot = e.target.closest("[data-slot]");
    if (slot && !slot.disabled) { s.slot = slot.dataset.slot; return draw(); }
    const act = e.target.closest("[data-act]")?.dataset.act;
    const btn = e.target.closest("[data-act]");
    if (!act) return;
    switch (act) {
      case "close": return close();
      case "back": if (s.step === 1) return close(); s.step -= 1; return draw();
      case "inc": s.qty = Math.min(s.maxQty || 1, s.qty + 1); return draw();
      case "dec": s.qty = Math.max(1, s.qty - 1); return draw();
      case "next": {
        const err = validateStep();
        if (err) return RC.toast(err, "error");
        s.step += 1;
        if (s.step === 3) { draw(); await loadSlots(); }
        return draw();
      }
      case "pay": return pay();
      case "copy":
        try { await navigator.clipboard.writeText(btn.dataset.copy); RC.toast("Disalin ke clipboard", "success"); }
        catch { RC.toast("Salin manual: " + btn.dataset.copy); }
    }
  }

  // ---------- pembayaran ----------
  async function pay() {
    if (s.busy || s.order) return;
    s.busy = true; draw();
    try {
      s.order = await RC.api("/api/orders", {
        method: "POST",
        body: {
          startDate: s.startDate, endDate: s.endDate, pickupSlot: s.slot,
          items: [{ productId: s.product.id, qty: s.qty }],
          customer: { name: s.name.trim(), identityType: s.identityType, identityNumber: s.identityNumber, whatsapp: s.whatsapp.trim(), consent: s.agreed },
        },
      });
      saveOrderCode(s.order.code);
      s.busy = false; s.step = 5; draw();
    } catch (err) {
      s.busy = false;
      RC.toast(err.message, "error");
      if (err.status === 409) { await refreshAvailability(); s.step = 1; }
      draw();
    }
  }

  function startPolling() {
    clearInterval(poll);
    if (s.order?.status !== "PENDING_PAYMENT") return;
    poll = setInterval(async () => {
      if (!root || s.step !== 5) return clearInterval(poll);
      // Jangan menggambar ulang saat pengguna sedang memilih file.
      if (document.activeElement?.type === "file") return;
      const before = JSON.stringify([s.order.status, s.order.payment.status]);
      try { s.order = await RC.api(`/api/orders/${encodeURIComponent(s.order.code)}`); } catch { return; }
      const after = JSON.stringify([s.order.status, s.order.payment.status]);
      if (before !== after) draw();
      if (s.order.status !== "PENDING_PAYMENT") clearInterval(poll);
    }, 8000);
  }

  function startTimer() {
    clearInterval(tick);
    const el = $("#hold-timer", root);
    if (!el || !s.order) return;
    const update = () => {
      const left = Math.max(0, Math.floor((new Date(s.order.holdExpiresAt) - Date.now()) / 1000));
      el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    };
    update();
    tick = setInterval(update, 1000);
  }

  RC.openBooking = open;
})();
