/* Kerangka dashboard admin: cek login, sidebar, header. Pakai: const content = await RC.admin.init({ page, title }) */
(() => {
  const { icon, esc, $, render } = RC;

  const MENU = [
    ["layout-dashboard", "Dashboard", "/admin/", "dashboard"],
    ["clipboard-check", "Booking", "/admin/booking.html", "booking"],
    ["landmark", "Pembayaran", "/admin/pembayaran.html", "pembayaran"],
    ["package", "Katalog", "/admin/katalog.html", "katalog"],
    ["calendar-days", "Jadwal Ambil", "/admin/jadwal.html", "jadwal"],
    ["warehouse", "Kalender Stok", "/admin/stok.html", "stok"],
    ["settings", "Pengaturan", "/admin/pengaturan.html", "pengaturan"],
  ];

  async function init({ page, title }) {
    let me;
    try {
      me = await RC.api("/api/admin/me");
    } catch {
      location.replace("/admin/login.html");
      return new Promise(() => {}); // hentikan eksekusi halaman
    }
    const initials = me.email.slice(0, 2).toUpperCase();
    const dateLabel = RC.fmtDate(RC.today(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    render(document.body, `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <a class="brand-button" href="/" aria-label="Ke situs">${RC.brand()}</a>
        <div class="admin-store"><span>RT</span><div><strong>RimbaCamp Kaliurang</strong><small>Admin toko</small></div></div>
        <nav aria-label="Menu admin">
          ${MENU.map(([ic, l, href, key]) => `<a href="${href}" class="${key === page ? "active" : ""}">${icon(ic, 19)} ${l}</a>`).join("")}
        </nav>
        <div class="admin-profile"><span>${esc(initials)}</span><div><strong>Admin</strong><small>${esc(me.email)}</small></div>
          <button id="logout" class="icon-btn" aria-label="Keluar" title="Keluar">${icon("log-out", 18)}</button></div>
      </aside>
      <main class="admin-main">
        <header class="admin-header">
          <div><span>${dateLabel}</span><h1>${esc(title)}</h1></div>
          <div class="admin-header-actions" id="admin-actions"></div>
        </header>
        <div class="admin-content" id="content"></div>
      </main>
    </div>`);
    $("#logout").addEventListener("click", async () => {
      await RC.api("/api/admin/logout", { method: "POST" }).catch(() => {});
      location.href = "/admin/login.html";
    });
    return $("#content");
  }

  const payBadge = (s) => {
    const map = { PENDING: ["Belum transfer", "warning"], PROOF_UPLOADED: ["Perlu verifikasi", "info"], REJECTED: ["Ditolak", "danger"], SETTLEMENT: ["Lunas", "success"], EXPIRE: ["Kedaluwarsa", "neutral"], CANCEL: ["Dibatalkan", "danger"], DENY: ["Ditolak", "danger"], REFUND: ["Refund", "info"] };
    const [l, t] = map[s] || [s, "neutral"];
    return `<span class="status-badge ${t}">${l}</span>`;
  };

  RC.admin = { init, payBadge };
})();
