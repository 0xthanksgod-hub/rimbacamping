(async () => {
  const { esc, render } = RC;
  const content = await RC.admin.init({ page: "stok", title: "Kalender Stok" });
  const grid = await RC.api(`/api/admin/stock?from=${RC.today()}`);
  render(content, `
    <section class="admin-card action-card"><div class="card-title"><div><h3>Stok tersedia 7 hari ke depan</h3><p>Sudah memperhitungkan booking dibayar dan hold pembayaran aktif.</p></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Alat</th><th>Total</th>${grid[0].days.map((d) => `<th>${RC.fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</th>`).join("")}</tr></thead>
      <tbody>${grid.map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.total}</td>
        ${r.days.map((d) => `<td><span class="stock-pill ${d.available === 0 ? "out" : d.available < r.total ? "low" : ""}">${d.available}</span></td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></section>`);
})();
