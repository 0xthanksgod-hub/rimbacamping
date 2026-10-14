(async () => {
  const { esc, render } = RC;
  const content = await RC.admin.init({ page: "jadwal", title: "Jadwal Ambil" });
  const orders = (await RC.api("/api/admin/orders"))
    .filter((o) => o.status === "BOOKED" && o.pickupAt.slice(0, 10) >= RC.today())
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const byDate = {};
  for (const o of orders) (byDate[o.pickupAt.slice(0, 10)] ||= []).push(o);

  render(content, Object.keys(byDate).length ? Object.entries(byDate).map(([d, list]) => `
    <section class="admin-card action-card"><div class="card-title"><div><h3>${RC.fmtDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3><p>${list.length} pengambilan</p></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Jam</th><th>Kode</th><th>Customer</th><th>WhatsApp</th><th>Identitas</th><th>Pesanan</th></tr></thead>
      <tbody>${list.map((o) => `<tr><td><strong>${esc(o.pickupSlot)}</strong></td><td>#${esc(o.code)}</td><td>${esc(o.customer.name)}</td>
        <td><a href="https://wa.me/${esc(o.customer.whatsapp.replace(/^0/, "62").replace(/\D/g, ""))}" target="_blank" rel="noopener">${esc(o.customer.whatsapp)}</a></td>
        <td>${esc(o.customer.identityType)} ••••${esc(o.customer.identityLast4)}</td>
        <td>${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(", ")}</td></tr>`).join("")}</tbody>
    </table></div></section>`).join("") : `<div class="admin-card admin-empty"><h2>Belum ada jadwal pengambilan</h2><p>Booking yang sudah dibayar akan muncul di sini.</p></div>`);
})();
