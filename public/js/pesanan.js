/* Pesanan Saya: daftar pesanan yang dibuat di browser ini + cari berdasarkan kode booking. */
(() => {
  const { esc, rupiah, icon, $, render } = RC;
  const KEY = "rc_orders";
  const list = $("#orders");
  let cfg = { bankAccount: {} };

  const codes = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
  const remember = (c) => { try { localStorage.setItem(KEY, JSON.stringify([c, ...codes().filter((x) => x !== c)].slice(0, 20))); } catch { /* abaikan */ } };

  const timeline = (o) => {
    const order = ["BOOKED", "PICKED_UP", "COMPLETED"];
    const idx = order.indexOf(o.status);
    return ["Booked", "Diambil", "Selesai"].map((l, i) =>
      `<div class="${idx >= i ? "done" : ""}"><span>${idx >= i ? icon("check", 14) : i + 1}</span><p>${l}</p></div>`).join("");
  };

  function card(o) {
    const pending = o.status === "PENDING_PAYMENT";
    const p = o.payment;
    return `<div class="order-card">
      <div class="order-top">
        <div>${RC.statusBadge(o.status, o.payment.status)}
          <h2>#${esc(o.code)}</h2>
          <p>Dibuat ${RC.fmtDateTime(o.createdAt)}</p></div>
        ${pending ? `<button class="outline-button" data-sync="${esc(o.code)}">Segarkan status</button>` : ""}
      </div>
      ${o.items.map((it) => `<div class="order-body"><div><strong>${esc(it.name)}</strong><span>${it.qty} unit · ${o.rentalDays} hari · ${RC.fmtRange(o.startDate, o.endDate)}</span></div><strong>${rupiah(it.lineTotal)}</strong></div>`).join("")}
      <div class="order-body total-line"><div><strong>Total</strong></div><strong>${rupiah(o.total)}</strong></div>
      ${pending ? `<div class="pay-block">${p.status === "PROOF_UPLOADED" ? "" : `<p class="hint">Transfer dan unggah bukti sebelum <b>${RC.fmtDateTime(o.holdExpiresAt)}</b>.</p>`}${RC.pay.actions(o, cfg)}</div>` : ""}
      <div class="pickup-note">${icon("calendar-days", 21)}
        <div><strong>Ambil ${RC.fmtDate(o.pickupAt.slice(0, 10), { weekday: "long", day: "numeric", month: "long" })} · ${esc(o.pickupSlot)}</strong>
        <span>RimbaCamp, Jl. Kaliurang KM 9, Sleman</span></div></div>
      ${["BOOKED", "PICKED_UP", "COMPLETED"].includes(o.status) ? `<div class="timeline">${timeline(o)}</div>` : ""}
    </div>`;
  }

  async function load() {
    try { cfg = await RC.api("/api/config"); } catch { /* abaikan */ }
    const cs = codes();
    if (!cs.length) return render(list, `<div class="order-card empty"><p>Belum ada pesanan di perangkat ini. Punya kode booking? Cari di atas.</p><a class="primary-button" href="/katalog.html">Mulai sewa alat</a></div>`);
    const results = await Promise.all(cs.map((c) => RC.api(`/api/orders/${encodeURIComponent(c)}`).catch(() => null)));
    const orders = results.filter(Boolean);
    render(list, orders.length ? orders.map(card).join("") : `<div class="order-card empty"><p>Pesanan tidak ditemukan.</p></div>`);
  }

  list.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sync]");
    if (!b) return;
    b.disabled = true;
    try { await RC.api(`/api/orders/${encodeURIComponent(b.dataset.sync)}`); } catch (err) { RC.toast(err.message, "error"); }
    load();
  });

  $("#lookup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("#lookup-code").value.trim().replace(/^#/, "").toUpperCase();
    if (!code) return;
    try { await RC.api(`/api/orders/${encodeURIComponent(code)}`); remember(code); $("#lookup-code").value = ""; load(); }
    catch (err) { RC.toast(err.message, "error"); }
  });

  RC.pay.bind(list, () => load());
  list.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copy]");
    if (!c) return;
    try { await navigator.clipboard.writeText(c.dataset.copy); RC.toast("Nomor rekening disalin", "success"); } catch { RC.toast("Salin manual: " + c.dataset.copy); }
  });

  load();
})();
