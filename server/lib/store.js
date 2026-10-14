// Penyimpanan JSON berbasis file dengan tulis atomik + folder bukti transfer.
// Cukup untuk toko kecil. Untuk skala besar gunakan PostgreSQL (lihat database/schema.prisma).
const fs = require("fs");
const path = require("path");

function createStore(dataDir, defaultBank = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const proofDir = path.join(dataDir, "proofs");
  fs.mkdirSync(proofDir, { recursive: true });
  const file = path.join(dataDir, "db.json");
  const bank = { bankName: "", accountNumber: "", accountHolder: "", ...defaultBank };
  let db = { orders: [], settings: { bankAccount: bank } };

  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    db = { orders: saved.orders || [], settings: { bankAccount: saved.settings?.bankAccount || bank } };
  }

  function save() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    get orders() { return db.orders; },
    get settings() { return db.settings; },
    proofDir,
    save,
  };
}

module.exports = { createStore };
