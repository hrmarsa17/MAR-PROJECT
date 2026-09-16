# ════════════════════════════════════════════════════════════════════════════
# KMB — image aplikasi
# ════════════════════════════════════════════════════════════════════════════
# Empat tahap, dan pembagiannya bukan gaya-gayaan:
#
#   deps    memasang node_modules sekali, dan lapisan ini hanya dibangun ulang
#           kalau package-lock.json berubah — bukan setiap kali satu berkas .tsx
#           disentuh.
#   bangun  menjalankan next build.
#   alat    node_modules LENGKAP + sumber, dipakai menjalankan migrasi dan
#           cadangan. Ia tidak pernah melayani permintaan.
#   jalan   HANYA keluaran standalone. Inilah yang berjalan, dan ia tidak
#           membawa tsx, vitest, exceljs build-time, maupun sumber TypeScript.
#
# Kenapa `jalan` dipisah dari `alat`: yang melayani internet tidak perlu bisa
# menjalankan skrip apa pun. Setiap alat yang ikut ke sana adalah alat yang
# tersedia juga bagi siapa pun yang berhasil masuk.
# ════════════════════════════════════════════════════════════════════════════

# Node 22 — versi yang dipakai mengembangkan dan menjalankan seluruh uji.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS bangun
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL dibutuhkan src/lib/db.ts saat modul dimuat. Saat MEMBANGUN tidak
# ada basis data, dan memang tidak perlu ada — nilai ini tidak pernah dipakai
# menyambung. Ia cuma menyenangkan pemeriksaan "alamat tidak boleh ditebak".
ENV DATABASE_URL=postgres://bangun@127.0.0.1:5433/bangun
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Alat: migrasi, cadangan, pemeriksaan. Bukan pelayan permintaan. ──────────
FROM node:22-alpine AS alat
WORKDIR /app
# pg_dump/pg_restore/psql untuk cadangan & pemulihan. Versi klien harus >= server.
RUN apk add --no-cache postgresql18-client
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["npx", "tsx", "scripts/migrasi.ts", "--terapkan", "--izinkan-luar"]

# ── Yang benar-benar melayani ────────────────────────────────────────────────
FROM node:22-alpine AS jalan
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Tidak berjalan sebagai root. Wadah yang dibobol lewat root bisa menulis ke
# mana pun yang ter-mount; sebagai pengguna biasa, ia jauh lebih sempit.
RUN addgroup -g 1001 -S kmb && adduser -u 1001 -S kmb -G kmb

# Keluaran standalone sudah memuat server.js beserta modul yang benar-benar
# dipakai. `static` dan `public` tidak ikut di dalamnya dan harus disalin
# sendiri — kalau terlewat, halaman terbuka tanpa CSS dan tanpa JS.
COPY --from=bangun --chown=kmb:kmb /app/.next/standalone ./
COPY --from=bangun --chown=kmb:kmb /app/.next/static ./.next/static

USER kmb
EXPOSE 3000

# Healthcheck memakai titik periksa yang menyentuh BASIS DATA, bukan sekadar
# halaman apa pun: proses yang hidup tapi tak bisa menyentuh basis data sama
# sekali tidak berguna, dan tidak boleh dinyatakan sehat.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/sehat').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
