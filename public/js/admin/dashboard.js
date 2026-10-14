(async () => {
  const { icon, esc, rupiah, render } = RC;
  const content = await RC.admin.init({ page: "dashboard", title: "Dashboard" });
  const s = await RC.api("/api/admin/summary");

  const delta = s.prevRevenue ? Math.round(((s.monthRevenue - s.prevRevenue) / s.prevRevenue) * 100) : null;
  const short = (v) => (v >= 1e6 ? `Rp ${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : rupiah(v));
  const stats = [
    ["shopping-bag", "Booking hari ini", s.bookingsToday, `${s.pendingPayments} menunggu pembayaran`, "green"],
    ["calendar-days", "Pengambilan hari ini", s.pickupsToday, "sudah dibayar, siap diambil", "orange"],
    ["package", "Pengembalian hari ini", s.returnsToday, "alat sedang disewa", "blue"],
    ["circle-dollar-sign", "Pendapatan bulan ini", short(s.monthRevenue), delta === null ? "belum ada data bulan lalu" : `${delta >= 0 ? "+" : ""}${delta}% dari bulan lalu`, "purple"],
  ];
  const max = Math.max(1, ...s.months.map((m) => m.revenue));
  const monthName = (k) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(k + "-01T00:00:00Z"));

  render(content, `
    <div class="welcome-row">
      <div><h2>Selamat datang kembali</h2><p>Ini yang perlu diperhatikan di toko hari ini.</p></div>
      <a class="outline-button" href="/admin/stok.html">${icon("calendar", 17)} Lihat kalender stok</a>
    </div>
    <div class="admin-stats">
      ${stats.map(([ic, label, value, sub, color]) => `<div class="stat-card"><span class="stat-icon ${color}">${icon(ic, 20)}</span><p>${label}</p><strong>${value}</strong><small>${icon("trending-up", 13)} ${sub}</small></div>`).join("")}
    </div>
    <div class="admin-grid">
      <section class="admin-card revenue-card">
        <div class="card-title"><div><h3>Pendapatan</h3><p>6 bulan terakhir (pembayaran lunas)</p></div></div>
        <div class="chart">${s.months.map((m) => `<div title="${rupiah(m.revenue)}"><span style="height:${Math.max(3, (m.revenue / max) * 100)}%"></span><small>${monthName(m.month)}</small></div>`).join("")}</div>
      </section>
      <section class="admin-card popular-list">
        <div class="card-title"><div><h3>Alat terlaris</h3><p>Bulan ini</p></div></div>
        ${s.topProducts.length ? s.topProducts.map((p, i) => `<div class="popular-item"><span>${i + 1}</span><div><strong>${esc(p.name)}</strong><small>${p.times} kali disewa</small></div><strong>${rupiah(p.revenue)}</strong></div>`).join("") : `<p class="empty-note">Belum ada penyewaan bulan ini.</p>`}
      </section>
    </div>
    <section class="admin-card action-card">
      <div class="card-title"><div><h3>Perlu tindakan</h3><p>Pengambilan hari ini, pembayaran tertunda, dan pengembalian</p></div>
        <a class="row-action" href="/admin/booking.html">Lihat semua ${icon("arrow-right", 16)}</a></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Kode</th><th>Customer</th><th>Jadwal ambil</th><th>Pesanan</th><th>Status</th></tr></thead>
        <tbody>${s.needsAction.length ? s.needsAction.map((o) => `<tr>
          <td><strong>#${esc(o.code)}</strong></td><td>${esc(o.customer.name)}</td>
          <td>${RC.fmtDate(o.pickupAt.slice(0, 10), { day: "numeric", month: "short" })}, ${esc(o.pickupSlot)}</td>
          <td>${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(", ")}</td><td>${RC.statusBadge(o.status, o.payment.status)}</td></tr>`).join("")
          : `<tr><td colspan="5" class="empty-cell">Tidak ada yang perlu ditindaklanjuti.</td></tr>`}</tbody>
      </table></div>
    </section>`);
})();
