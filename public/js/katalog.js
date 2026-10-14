/* Katalog: filter kategori, pencarian, urutan, ketersediaan per tanggal. */
(async () => {
  const { $, $$, render } = RC;
  const categories = ["Semua", "Tenda", "Carrier", "Sleeping Bag", "Kompor"];
  const state = { query: "", category: "Semua", sort: "populer" };
  let products = [], avail = {};

  $("#catalog-search").append(
    RC.dateSearch(async (d) => { avail = await RC.fetchAvailability(products, d); draw(); }),
  );

  function draw() {
    let list = products.filter(
      (p) => (state.category === "Semua" || p.category === state.category) && p.name.toLowerCase().includes(state.query.toLowerCase()),
    );
    if (state.sort === "murah") list.sort((a, b) => a.price - b.price);
    else if (state.sort === "mahal") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => Number(!!b.popular) - Number(!!a.popular));

    $("#chips").innerHTML = categories
      .map((c) => `<button class="${state.category === c ? "selected" : ""}" data-cat="${c}">${c}</button>`).join("");
    $("#result-count").textContent = `${list.length} alat`;
    render($("#product-grid"), list.length
      ? list.map((p) => RC.productCard(p, avail[p.id] ?? p.stock)).join("")
      : `<p class="empty-note">Tidak ada alat yang cocok dengan pencarianmu.</p>`);
  }

  $("#q").addEventListener("input", (e) => { state.query = e.target.value; draw(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; draw(); });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (b) { state.category = b.dataset.cat; draw(); }
  });

  products = await RC.loadProducts();
  avail = await RC.fetchAvailability(products, RC.dates.get());
  draw();
})();
