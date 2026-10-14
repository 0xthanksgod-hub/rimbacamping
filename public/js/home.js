/* Beranda: produk populer, cek ketersediaan, FAQ. */
(async () => {
  const { icon, $, $$, render } = RC;

  // pencarian tanggal di hero -> ke katalog
  $("#hero-search").append(RC.dateSearch(() => (location.href = "/katalog.html")));

  const products = await RC.loadProducts();
  const avail = await RC.fetchAvailability(products, RC.dates.get());
  render($("#product-grid"), products.map((p) => RC.productCard(p, avail[p.id])).join(""));

  // FAQ accordion
  $$(".faq-item button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const open = item.classList.contains("open");
      $$(".faq-item").forEach((i) => { i.classList.remove("open"); i.querySelector("p").hidden = true; });
      if (!open) { item.classList.add("open"); item.querySelector("p").hidden = false; }
    }),
  );
})();
