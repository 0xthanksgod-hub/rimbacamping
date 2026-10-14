(async () => {
  const { esc, rupiah, render } = RC;
  const content = await RC.admin.init({ page: "katalog", title: "Katalog" });
  const products = await RC.api("/api/admin/products");
  render(content, `
    <div class="notice">Daftar alat dibaca dari <code>public/data/products.json</code>. Edit file tersebut untuk menambah atau mengubah produk, lalu restart server.</div>
    <section class="admin-card action-card"><div class="table-wrap"><table>
      <thead><tr><th></th><th>Nama</th><th>Kategori</th><th>Harga / hari</th><th>Stok total</th></tr></thead>
      <tbody>${products.map((p) => `<tr>
        <td><img class="thumb" src="${esc(p.image)}" alt="" loading="lazy" /></td>
        <td><strong>${esc(p.name)}</strong>${p.popular ? ' <span class="status-badge warning">Populer</span>' : ""}</td>
        <td>${esc(p.category)}</td><td>${rupiah(p.price)}</td><td>${p.stock} unit</td></tr>`).join("")}</tbody>
    </table></div></section>`);
})();
