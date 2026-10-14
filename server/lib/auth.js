// Sesi admin: cookie bertanda tangan HMAC (HttpOnly, SameSite=Strict) + pembatasan percobaan login.
const crypto = require("crypto");

const COOKIE = "rc_admin";
const TTL_MS = 8 * 3600 * 1000;

function createAuth({ email, password, sessionSecret, isProduction }) {
  const secret = sessionSecret || crypto.randomBytes(32).toString("hex"); // tanpa SESSION_SECRET: sesi hilang saat restart
  const sign = (v) => crypto.createHmac("sha256", secret).update(v).digest("base64url");
  const safeEqual = (a, b) => {
    const x = crypto.createHash("sha256").update(String(a)).digest();
    const y = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };
  const attempts = new Map();

  return {
    enabled: Boolean(password),

    login(inputEmail, inputPassword, ip) {
      const rec = attempts.get(ip) || { n: 0, until: 0 };
      if (rec.until > Date.now()) return { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.", status: 429 };
      const ok = Boolean(password) && safeEqual(inputEmail, email) & safeEqual(inputPassword, password);
      if (!ok) {
        rec.n += 1;
        if (rec.n >= 5) { rec.until = Date.now() + 15 * 60000; rec.n = 0; }
        attempts.set(ip, rec);
        return { error: "Email atau password salah", status: 401 };
      }
      attempts.delete(ip);
      const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + TTL_MS })).toString("base64url");
      const token = `${payload}.${sign(payload)}`;
      const flags = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}${isProduction ? "; Secure" : ""}`;
      return { cookie: `${COOKIE}=${token}; ${flags}` };
    },

    logoutCookie: () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,

    verify(cookieHeader) {
      const m = /(?:^|;\s*)rc_admin=([^;]+)/.exec(cookieHeader || "");
      if (!m) return null;
      const [payload, sig] = m[1].split(".");
      if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
      try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString());
        return data.exp > Date.now() ? { email: data.email } : null;
      } catch { return null; }
    },
  };
}

module.exports = { createAuth };
