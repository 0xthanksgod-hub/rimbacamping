# RimbaCamp — Website Penyewaan Alat Camping

Versi HTML/CSS/JS biasa (tanpa React/Vite/build step) + server Node kecil.
Pembayaran lewat **transfer bank manual + unggah bukti**, diverifikasi admin.

## Struktur folder

```
rimbacamp/
├── public/                  ← semua yang dibuka browser
│   ├── index.html           Beranda
│   ├── katalog.html         Katalog + filter
│   ├── pesanan.html         Pesanan Saya
│   ├── admin/               Dashboard admin
│   │   ├── login.html
│   │   ├── index.html       Dashboard
│   │   ├── booking.html     Daftar booking + ubah status
│   │   ├── pembayaran.html  Verifikasi bukti transfer + atur rekening toko
│   │   ├── katalog.html · jadwal.html · stok.html · pengaturan.html
│   ├── css/
│   │   ├── style.css        Desain asli dari Figma Make
│   │   └── extra.css        Tambahan (toast, pembayaran, halaman admin)
│   ├── js/
│   │   ├── common.js        Utilitas (format rupiah, API, tanggal, toast)
│   │   ├── layout.js        Header/footer/nav mobile
│   │   ├── product-ui.js    Kartu produk, pencarian tanggal, modal detail
│   │   ├── booking.js       Wizard booking 5 langkah (+ payment-ui.js: rekening & unggah bukti)
│   │   ├── home.js · katalog.js · pesanan.js
│   │   └── admin/           admin.js (kerangka) + satu file per halaman
│   ├── data/products.json   Daftar produk (edit di sini)
│   └── img/
├── server/                  ← backend Node (tanpa dependensi, Node 18+)
│   ├── index.js             Router, file statis, API
│   └── lib/                 env, store (JSON + foto bukti), orders, auth
├── database/schema.prisma   Skema PostgreSQL untuk fase produksi (dari project awal)
├── railway.json             Konfigurasi deploy Railway
├── .env.example
└── package.json
```

## Menjalankan

```bash
cp .env.example .env     # isi rekening toko + password admin
npm start                # http://localhost:3000
```

Tidak ada `npm install` — server hanya memakai modul bawaan Node.
Buka lewat server ini (bukan klik ganda file HTML) karena halaman memanggil `/api/...`.

- Situs: http://localhost:3000
- Admin: http://localhost:3000/admin/ (email & password dari `.env`)

## Pembayaran: transfer bank manual

Midtrans sudah dihapus. Alurnya:

1. Customer booking → server memvalidasi, menghitung harga di server, menahan stok (`HOLD_MINUTES`, default 180 menit).
2. Customer melihat **nama bank, nomor rekening, atas nama, dan nominal** lalu transfer.
3. Customer mengunggah **foto bukti transfer** (JPG/PNG/WEBP, maks 4 MB) di wizard booking atau halaman *Pesanan Saya*.
4. Admin buka **Admin → Pembayaran**, klik *Lihat bukti*, cocokkan dengan mutasi rekening, lalu **Konfirmasi lunas** (status jadi `BOOKED`) atau **Tolak** (customer bisa unggah ulang).
5. Stok tidak dilepas otomatis selama ada bukti yang menunggu verifikasi. Tanpa bukti sampai batas waktu → `EXPIRED`.

Rekening toko: `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_HOLDER` hanya jadi **data awal**
(dipakai saat `db.json` belum ada). Selanjutnya ubah di **Admin → Pembayaran → Rekening tujuan transfer**.
Foto bukti hanya bisa dilihat admin yang login.

## Hosting di Railway

Railway menjalankan server Node ini langsung (tanpa build). Data (`db.json`) dan foto bukti
disimpan di **Volume** supaya tidak hilang saat deploy ulang.

1. **Push ke GitHub.** Buat repo (privat disarankan), lalu dari folder proyek:
   `git init && git add . && git commit -m "RimbaCamp" && git branch -M main && git remote add origin <url-repo> && git push -u origin main`
   (`.env` dan `server/data/` sudah di `.gitignore`.)
2. Di https://railway.com → **New Project → Deploy from GitHub repo** → pilih repo. Railway mendeteksi Node dan memakai
   `railway.json` (start `node server/index.js`, healthcheck `/api/health`).
3. **Tambah Volume:** klik service → **Settings → Volumes** (atau klik kanan canvas → *Volume*) → *Mount path* `/data`.
   Server otomatis memakai path ini lewat `RAILWAY_VOLUME_MOUNT_PATH`; untuk eksplisit, set juga `DATA_DIR=/data`.
4. **Variables** (tab *Variables* pada service):

   | Variabel | Isi |
   |---|---|
   | `NODE_ENV` | `production` |
   | `ADMIN_EMAIL` | email login admin |
   | `ADMIN_PASSWORD` | minimal 12 karakter |
   | `SESSION_SECRET` | hasil `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `IDENTITY_ENCRYPTION_KEY` | hasil `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (simpan baik-baik; hilang = nomor identitas tak bisa dibuka) |
   | `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_HOLDER` | rekening toko (data awal) |
   | `DATA_DIR` | `/data` |

   `PORT` diisi Railway otomatis, jangan diubah.
5. **Domain:** **Settings → Networking → Generate Domain** (HTTPS gratis), atau *Custom Domain* lalu arahkan CNAME
   dari penyedia domain Anda sesuai petunjuk Railway.
6. Buka `https://DOMAIN-ANDA/admin/`, login, cek **Pembayaran → Rekening**, lalu coba satu booking uji dan unggah bukti.

Catatan Railway:
- Jalankan **satu instance saja** (jangan scale ke banyak replika) karena data berupa file di satu Volume.
- Jangan hapus Volume-nya. Cadangkan berkala (unduh `db.json` dan folder `proofs/`, mis. lewat Railway CLI) atau
  aktifkan *Backups* Volume bila tersedia di paket Anda.
- Setiap push ke branch yang terhubung memicu deploy ulang otomatis; data di Volume tetap aman.

## Yang perlu diketahui

- **Penyimpanan** order memakai file `db.json` + foto di `proofs/` (lokal: `server/data/`, Railway: Volume) (cukup untuk toko kecil/uji coba).
  Untuk produksi besar, pindahkan ke PostgreSQL memakai `database/schema.prisma`.
- **Foto identitas** belum diunggah/disimpan (di versi awal hanya tampilan). Menyimpannya
  butuh bucket privat; nomor identitas sudah dienkripsi AES-256-GCM bila `IDENTITY_ENCRYPTION_KEY` diisi.
- **Ikon** memuat Lucide dari CDN unpkg. Untuk offline, unduh `lucide.min.js` ke `public/js/` dan ubah tag `<script>`.
- **Pesanan Saya** ditautkan ke browser (localStorage) + pencarian kode booking; belum ada login customer.
- Refund tidak otomatis: kembalikan dana lewat transfer manual ke customer.
- Jangan commit `.env`. Ganti password admin sebelum online.
