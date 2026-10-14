// Pemuat .env sederhana (tanpa dependensi). Nilai yang sudah ada di environment tidak ditimpa.
const fs = require("fs");
const path = require("path");

function loadEnv(file = path.join(__dirname, "..", "..", ".env")) {
  if (fs.existsSync(file)) {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  const e = process.env;
  return {
    port: Number(e.PORT) || 3000,
    isProduction: e.NODE_ENV === "production",
    // Data awal rekening toko. Setelah server pertama kali jalan, data diubah lewat Admin -> Pembayaran.
    bank: {
      bankName: e.BANK_NAME || "",
      accountNumber: e.BANK_ACCOUNT_NUMBER || "",
      accountHolder: e.BANK_ACCOUNT_HOLDER || "",
    },
    admin: {
      email: e.ADMIN_EMAIL || "admin@rimbacamp.id",
      password: e.ADMIN_PASSWORD || "",
      sessionSecret: e.SESSION_SECRET || "",
    },
    identityKey: e.IDENTITY_ENCRYPTION_KEY || "",
    holdMinutes: Number(e.HOLD_MINUTES) || 180,
    // Di Railway: pasang Volume, path-nya otomatis ada di RAILWAY_VOLUME_MOUNT_PATH.
    dataDir: e.DATA_DIR || e.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "..", "data"),
  };
}

module.exports = { loadEnv };
