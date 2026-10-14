/* Halaman Pembayaran: rekening toko (bisa diubah) + verifikasi bukti transfer. */
(async () => {
  const { icon, esc, rupiah, render } = RC;
  const content = await RC.admin.init({ page: "pembayaran", title: "Pembayaran" });
  let payments = [], settings, filter = "VERIFY";

  async function load() {
    [payments, settings] = await Promise.all([RC.api("/api/admin/payments"), RC.api("/api/admin/payment-settings")]);
    draw();
  }

  function draw() {
    const sum = (st) => payments.filter((o) => o.payment.status === st);
    const received = sum("SETTLEMENT").reduce((t, o) => t + o.total, 0);
    const verify = sum("PROOF_UPLOADED");
    const waiting = payments.filter((o) => o.status === "PENDING_PAYMENT" && ["PENDING", "REJECTED"].includes(o.payment.status));
    const list = payments.filter((o) => filter === "ALL" || (filter === "VERIFY" ? o.payment.status === "PROOF_UPLOADED" : o.payment.status === filter));
    const filters = [["VERIFY", `Perlu verifikasi (${verify.length})`], ["PENDING", "Belum transfer"], ["SETTLEMENT", "Lunas"], ["REJECTED", "Ditolak"], ["EXPIRE", "Kedaluwarsa"], ["ALL", "Semua"]];
    const b = settings.bankAccount;

    render(content, `
      ${!settings.paymentEnabled ? `<div class="notice danger">Rekening toko belum diatur, jadi customer belum bisa membuat pesanan. Isi form di bawah.</div>` : ""}
      <div class="admin-stats">
        <div class="stat-card"><span class="stat-icon green">${icon("circle-dollar-sign", 20)}</span><p>Total diterima</p><strong>${rupiah(received)}</strong><small>${sum("SETTLEMENT").length} transaksi lunas</small></div>
        <div class="stat-card"><span class="stat-icon purple">${icon("file-check", 20)}</span><p>Perlu diverifikasi</p><strong>${verify.length}</strong><small>${rupiah(verify.reduce((t, o) => t + o.total, 0))}</small></div>
        <div class="stat-card"><span class="stat-icon orange">${icon("clock-3", 20)}</span><p>Belum transfer</p><strong>${waiting.length}</strong><small>${rupiah(waiting.reduce((t, o) => t + o.total, 0))} tertahan</small></div>
      </div>

      <section class="admin-card bank-card pad">
        <div class="card-title"><div><h3>Rekening tujuan transfer</h3><p>Ditampilkan ke customer saat membayar. Perubahan langsung berlaku untuk pesanan berikutnya.</p></div></div>
        <form id="bank-form" class="form-grid bank-form">
          <label>Nama bank<input name="bankName" required maxlength="40" placeholder="Contoh: BCA" value="${esc(b.bankName)}" /></label>
          <label>Nomor rekening<input name="accountNumber" required inputmode="numeric" maxlength="30" placeholder="Contoh: 1234567890" value="${esc(b.accountNumber)}" /></label>
          <label>Atas nama<input name="accountHolder" required maxlength="60" placeholder="Nama pemilik rekening" value="${esc(b.accountHolder)}" /></label>
          <div><button class="primary-button" type="submit">Simpan rekening</button></div>
        </form>
      </section>

      <div class="toolbar"><div class="chips">${filters.map(([k, l]) => `<button data-f="${k}" class="${filter === k ? "selected" : ""}">${l}</button>`).join("")}</div></div>
      <section class="admin-card action-card"><div class="table-wrap"><table>
        <thead><tr><th>Order</th><th>Customer</th><th>Nominal</th><th>Bukti</th><th>Status</th><th>Waktu</th><th></th></tr></thead>
        <tbody>${list.length ? list.map((o) => {
          const p = o.payment;
          return `<tr>
            <td><strong>#${esc(o.code)}</strong></td>
            <td>${esc(o.customer.name)}<br /><small class="muted">${esc(o.customer.whatsapp)}</small></td>
            <td>${rupiah(o.total)}</td>
            <td>${p.hasProof ? `<a class="mini-btn" href="/api/admin/orders/${encodeURIComponent(o.code)}/proof" target="_blank" rel="noopener">${icon("image", 13)} Lihat bukti</a>` : "-"}</td>
            <td>${RC.admin.payBadge(p.status)}${p.status === "REJECTED" && p.rejectReason ? `<br /><small class="muted">${esc(p.rejectReason)}</small>` : ""}</td>
            <td>${RC.fmtDateTime(p.settlementAt || p.proofUploadedAt || o.createdAt)}</td>
            <td class="actions">${p.status === "PROOF_UPLOADED" ? `
              <button class="mini-btn" data-ok="${esc(o.code)}">${icon("check", 13)} Konfirmasi lunas</button>
              <button class="mini-btn danger" data-no="${esc(o.code)}">Tolak</button>` : ""}</td></tr>`;
        }).join("") : `<tr><td colspan="7" class="empty-cell">Tidak ada transaksi di filter ini.</td></tr>`}</tbody>
      </table></div></section>`);
  }

  async function verify(code, approve, reason) {
    try {
      await RC.api(`/api/admin/orders/${encodeURIComponent(code)}/verify`, { method: "POST", body: { approve, reason } });
      RC.toast(approve ? "Pembayaran dikonfirmasi, booking aktif" : "Bukti ditolak, customer bisa unggah ulang", "success");
    } catch (err) { RC.toast(err.message, "error"); }
    load();
  }

  content.addEventListener("click", (e) => {
    const f = e.target.closest("[data-f]");
    if (f) { filter = f.dataset.f; return draw(); }
    const ok = e.target.closest("[data-ok]");
    if (ok) {
      const o = payments.find((x) => x.code === ok.dataset.ok);
      if (confirm(`Konfirmasi pembayaran ${rupiah(o.total)} dari ${o.customer.name}? Pastikan dana sudah masuk ke rekening.`)) verify(o.code, true);
      return;
    }
    const no = e.target.closest("[data-no]");
    if (no) {
      const reason = prompt("Alasan penolakan (dilihat customer):", "Nominal tidak sesuai / bukti tidak jelas");
      if (reason !== null) verify(no.dataset.no, false, reason);
    }
  });

  content.addEventListener("submit", async (e) => {
    if (e.target.id !== "bank-form") return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await RC.api("/api/admin/payment-settings", { method: "PUT", body: d }); RC.toast("Rekening disimpan", "success"); }
    catch (err) { RC.toast(err.message, "error"); }
    load();
  });

  load();
})();
