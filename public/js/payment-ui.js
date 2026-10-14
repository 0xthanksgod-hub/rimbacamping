/* Bagian pembayaran transfer manual yang dipakai wizard booking dan halaman Pesanan Saya. */
RC.pay = (() => {
  const { icon, esc, rupiah } = RC;

  /** Kotak rekening tujuan transfer. */
  const bankBox = (cfg, total) => {
    const b = cfg.bankAccount || {};
    return `<div class="va-box">
      <span>Transfer ke ${esc(b.bankName)}</span>
      <strong>${esc(b.accountNumber)}</strong>
      <small>a.n. <b>${esc(b.accountHolder)}</b></small>
      <button type="button" class="outline-button" data-act="copy" data-copy="${esc((b.accountNumber || "").replace(/\D/g, ""))}">${icon("copy", 16)} Salin nomor rekening</button>
      ${total != null ? `<small>Nominal tepat: <b>${rupiah(total)}</b></small>` : ""}
    </div>`;
  };

  /** Bagian aksi sesuai status pembayaran order. */
  const actions = (o, cfg) => {
    const p = o.payment;
    if (p.status === "PROOF_UPLOADED") {
      return `<div class="notice">${icon("hourglass", 15)} Bukti transfer sudah diterima${p.proofUploadedAt ? ` (${RC.fmtDateTime(p.proofUploadedAt)})` : ""}. Admin akan memverifikasi, biasanya dalam jam buka toko. Stok kamu tetap ditahan.</div>`;
    }
    return `${p.status === "REJECTED" ? `<div class="notice danger">Bukti sebelumnya ditolak: ${esc(p.rejectReason || "tidak sesuai")}. Silakan unggah ulang.</div>` : ""}
      ${bankBox(cfg, o.total)}
      <form class="proof-form" data-code="${esc(o.code)}">
        <label class="proof-pick">${icon("upload", 18)} <span>Pilih foto bukti transfer</span>
          <input type="file" name="proof" accept="image/jpeg,image/png,image/webp" required /></label>
        <button class="secondary-button" type="submit">Kirim bukti transfer</button>
        <small class="hint">Foto JPG/PNG/WEBP, maksimal 4 MB. Pastikan nominal dan tanggal terlihat jelas.</small>
      </form>`;
  };

  /** Pasang di container; onDone dipanggil dengan order terbaru setelah unggah berhasil. */
  const bind = (root, onDone) => {
    root.addEventListener("change", (e) => {
      const f = e.target.closest(".proof-pick input");
      if (f) f.closest(".proof-pick").querySelector("span").textContent = f.files[0]?.name || "Pilih foto bukti transfer";
    });
    root.addEventListener("submit", async (e) => {
      const form = e.target.closest(".proof-form");
      if (!form) return;
      e.preventDefault();
      const file = form.proof.files[0];
      if (!file) return RC.toast("Pilih foto bukti transfer dulu.", "error");
      if (file.size > 4 * 1024 * 1024) return RC.toast("Ukuran foto maksimal 4 MB.", "error");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Mengirim…";
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(form.dataset.code)}/proof`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Gagal mengirim bukti");
        RC.toast("Bukti terkirim. Menunggu verifikasi admin.", "success");
        onDone(data);
      } catch (err) {
        RC.toast(err.message, "error");
        btn.disabled = false; btn.textContent = "Kirim bukti transfer";
      }
    });
  };

  return { bankBox, actions, bind };
})();
