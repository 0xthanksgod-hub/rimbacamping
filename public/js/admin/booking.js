(async () => {
  const { icon, esc, rupiah, render, $ } = RC;
  const content = await RC.admin.init({ page: "booking", title: "Booking" });
  let orders = [], filter = "ALL", q = "";

  const filters = [["ALL", "Semua"], ["PENDING_PAYMENT", "Menunggu bayar"], ["BOOKED", "Sudah dibayar"], ["PICKED_UP", "Disewa"], ["COMPLETED", "Selesai"], ["EXPIRED", "Kedaluwarsa"], ["CANCELLED", "Dibatalkan"]];
  const next = { BOOKED: ["PICKED_UP", "Tandai diambil"], PICKED_UP: ["COMPLETED", "Tandai selesai"] };

  async function load() { orders = await RC.api("/api/admin/orders"); draw(); }

  function draw() {
    const list = orders.filter((o) => (filter === "ALL" || o.status === filter) &&
      (o.code + o.customer.name + o.customer.whatsapp).toLowerCase().includes(q.toLowerCase()));
    render(content, `
      <div class="toolbar">
        <div class="search-input">${icon("search", 18)}<input id="q" placeholder="Cari kode, nama, atau WhatsApp..." value="${esc(q)}" /></div>
        <div class="chips">${filters.map(([k, l]) => `<button data-f="${k}" class="${filter === k ? "selected" : ""}">${l}</button>`).join("")}</div>
      </div>
      <section class="admin-card action-card"><div class="table-wrap"><table>
        <thead><tr><th>Kode</th><th>Customer</th><th>Pesanan</th><th>Tanggal sewa</th><th>Ambil</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.length ? list.map((o) => `<tr>
          <td><strong>#${esc(o.code)}</strong></td>
          <td>${esc(o.customer.name)}<br /><small class="muted">${esc(o.customer.whatsapp)} · ${esc(o.customer.identityType)} ••••${esc(o.customer.identityLast4)}</small></td>
          <td>${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join("<br />")}</td>
          <td>${RC.fmtRange(o.startDate, o.endDate)}</td>
          <td>${RC.fmtDate(o.pickupAt.slice(0, 10), { day: "numeric", month: "short" })}, ${esc(o.pickupSlot)}</td>
          <td>${rupiah(o.total)}</td>
          <td>${RC.statusBadge(o.status, o.payment.status)}</td>
          <td class="actions">
            ${next[o.status] ? `<button class="mini-btn" data-code="${esc(o.code)}" data-to="${next[o.status][0]}">${next[o.status][1]}</button>` : ""}
            ${["BOOKED", "PENDING_PAYMENT"].includes(o.status) ? `<button class="mini-btn danger" data-code="${esc(o.code)}" data-to="CANCELLED">Batalkan</button>` : ""}
          </td></tr>`).join("") : `<tr><td colspan="8" class="empty-cell">Tidak ada booking.</td></tr>`}</tbody>
      </table></div></section>`);
    const input = $("#q");
    input.addEventListener("input", (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); });
  }

  content.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-f]");
    if (f) { filter = f.dataset.f; return draw(); }
    const b = e.target.closest("[data-to]");
    if (!b) return;
    if (b.dataset.to === "CANCELLED" && !confirm(`Batalkan booking #${b.dataset.code}? Jika sudah dibayar, pengembalian dana dilakukan manual lewat transfer ke customer.`)) return;
    try { await RC.api(`/api/admin/orders/${encodeURIComponent(b.dataset.code)}/status`, { method: "PATCH", body: { status: b.dataset.to } }); RC.toast("Status diperbarui", "success"); load(); }
    catch (err) { RC.toast(err.message, "error"); }
  });

  load();
})();
