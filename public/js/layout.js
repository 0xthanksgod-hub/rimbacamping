/* Header, footer, navigasi mobile, dan tombol WhatsApp untuk halaman publik.
   Pakai: <div id="site-header" data-active="beranda"></div> dst. */
(() => {
  const { icon, render, $ } = RC;

  const brand = RC.brand;

  const nav = [
    ["Beranda", "/", "beranda"],
    ["Katalog", "/katalog.html", "katalog"],
    ["Pesanan Saya", "/pesanan.html", "pesanan"],
  ];

  function header(active) {
    return `
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand-button" href="/" aria-label="RimbaCamp - beranda">${brand()}</a>
        <nav class="desktop-nav" aria-label="Navigasi utama">
          ${nav.map(([l, href, key]) => `<a href="${href}" class="${active === key ? "active" : ""}">${l}</a>`).join("")}
        </nav>
        <div class="header-actions">
          <a class="admin-link" href="/admin/">${icon("layout-dashboard", 18)} Admin</a>
          <a class="profile-button" href="/pesanan.html" aria-label="Pesanan saya">${icon("user-round", 19)}</a>
        </div>
      </div>
    </header>`;
  }

  function footer() {
    return `
    <footer>
      <div class="container footer-grid">
        <div>${brand()}<p>Teman perjalanan untuk petualangan yang lebih ringan dan berkesan.</p></div>
        <div>
          <strong>Jelajahi</strong>
          <a href="/katalog.html">Katalog alat</a>
          <a href="/pesanan.html">Pesanan saya</a>
          <a href="/#lokasi">Tentang kami</a>
        </div>
        <div>
          <strong>Bantuan</strong>
          <a href="/#cara-sewa">Cara sewa</a>
          <a href="/#faq">Syarat &amp; ketentuan</a>
          <a href="/#faq">Kebijakan privasi</a>
        </div>
        <div>
          <strong>Hubungi kami</strong>
          <span>+62 812 3456 7890</span>
          <span>halo@rimbacamp.id</span>
          <span>Setiap hari, 08.00–20.00</span>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© ${new Date().getFullYear()} RimbaCamp. Dibuat untuk petualang Indonesia.</span>
        <span>Pembayaran via transfer bank</span>
      </div>
    </footer>`;
  }

  function mobileNav(active) {
    const items = [
      ["house", "Beranda", "/", "beranda"],
      ["search", "Katalog", "/katalog.html", "katalog"],
      ["shopping-bag", "Pesanan", "/pesanan.html", "pesanan"],
      ["user-round", "Admin", "/admin/", "admin"],
    ];
    return `<nav class="mobile-nav" aria-label="Navigasi bawah">
      ${items.map(([ic, l, href, key]) => `<a href="${href}" class="${active === key ? "active" : ""}">${icon(ic, 20)}<span>${l}</span></a>`).join("")}
    </nav>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const h = $("#site-header");
    const active = h?.dataset.active || "";
    if (h) render(h, header(active));
    const f = $("#site-footer");
    if (f) render(f, footer());
    const extra = document.createElement("div");
    extra.innerHTML = `<a class="whatsapp-float" href="https://wa.me/6281234567890" target="_blank" rel="noopener" aria-label="Chat lewat WhatsApp">${icon("message-circle", 24, 'fill="currentColor"')}</a>${mobileNav(active)}`;
    document.body.append(...extra.children);
    RC.paintIcons();
  });
})();
