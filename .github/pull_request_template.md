## Apa yang berubah, dan kenapa

<!-- Satu paragraf. Kenapa lebih penting daripada apa — apa bisa dibaca dari diff. -->

## Perilaku yang dijamin

<!--
Sebutkan uji yang MENYEBUT PERILAKU, bukan nama fungsi.

  ✅ 'kiriman luring yang di-flush dua kali hanya menghasilkan satu WO'
  ❌ 'test flushOutbox()'

Kalau tidak ada uji baru, tulis kenapa perubahan ini tidak bisa diuji.
-->

## Loop 5 — periksa ulang

<!--
Kembali ke temuan loop 1-2. Apa yang ternyata masih salah, dan sudah diperbaiki?

Empat bug dengan bentuk yang sama pernah lolos di repo ini dalam satu hari,
semuanya "ditulis, tidak pernah dipanggil, gagal tanpa bersuara". Tidak ada
galat di mana pun. Yang menemukannya loop 5, bukan uji.

Kalau tidak menemukan apa-apa, tulis "tidak ada" — jangan dikosongkan.
-->

---

## Daftar periksa

- [ ] `npm run typecheck` bersih
- [ ] `npm test` hijau
- [ ] Uji skrip yang berkaitan juga hijau (sebutkan yang mana)
- [ ] Tidak ada `.env`, `.env.jauh`, `*.xlsx`, atau `*.dump` yang ikut
- [ ] Skrip baru yang menulis ke basis data sudah berpagar `:5433`
- [ ] Kata-kata di layar tidak berubah tanpa sengaja — orang lapangan hafal
      kalimat lama, dan `docs/PETA-KMB-V2.md` mencatat yang mana

## Menyentuh uang?

<!--
Centang kalau PR ini menyentuh scoring, approval, payroll, faktor, atau tarif.
Kalau ya, sebutkan bagaimana Anda memastikan tidak ada WO hilang dan tidak ada
mekanik kurang bayar atau dibayar dua kali.
-->

- [ ] PR ini **tidak** menyentuh jalur uang
- [ ] PR ini menyentuh jalur uang, dan penjelasannya ada di atas
