(async () => {
  const { render, icon, esc } = RC;
  const content = await RC.admin.init({ page: "pengaturan", title: "Pengaturan" });
  const s = await RC.api("/api/admin/payment-settings");
  render(content, `
    <section class="admin-card pad">
      <h3>Toko</h3>
      <dl class="kv">
        <dt>Nama toko</dt><dd>RimbaCamp Kaliurang</dd>
        <dt>Alamat</dt><dd>Jl. Kaliurang KM 9, Sleman, Yogyakarta</dd>
        <dt>Jam buka</dt><dd>08.00–20.00 WIB (slot per 1 jam, kapasitas 5 booking/slot)</dd>
        <dt>Aturan ambil</dt><dd>H-1 sebelum tanggal sewa</dd>
        <dt>Zona waktu</dt><dd>Asia/Jakarta</dd>
      </dl>
    </section>
    <section class="admin-card pad">
      <h3>Pembayaran</h3>
      <dl class="kv">
        <dt>Metode</dt><dd>Transfer bank manual + unggah bukti, diverifikasi admin</dd>
        <dt>Rekening</dt><dd>${s.paymentEnabled ? `${esc(s.bankAccount.bankName)} ${esc(s.bankAccount.accountNumber)} a.n. ${esc(s.bankAccount.accountHolder)}` : "Belum diatur"}</dd>
      </dl>
      <a class="outline-button" href="/admin/pembayaran.html">${icon("landmark", 17)} Ubah rekening di halaman Pembayaran</a>
    </section>`);
})();
