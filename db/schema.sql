-- ════════════════════════════════════════════════════════════════════════════
-- KMB PROJECT — SKEMA POSTGRES
--
-- Setiap constraint di berkas ini menggantikan satu penjagaan yang di KMB V2
-- ditulis tangan di JavaScript. Rujukan insiden ada di docs/PETA-KMB-V2.md.
--
-- Prinsip: aturan yang menyangkut UANG atau KEHILANGAN WO ditegakkan mesin.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS citext;      -- pencocokan tanpa peduli huruf besar
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- hash token

-- ─── ENUM ───────────────────────────────────────────────────────────────────

CREATE TYPE wo_status AS ENUM (
  'pending_mechanic_work',
  'in_progress',
  'pending_transfer',
  'pending_supervisor',
  'pending_superintendent',
  'approved',
  'rejected',
  'cancelled'                 -- KMB V2: status ini dipakai tapi TIDAK terdaftar
);                            -- di mesin transisi. Di sini ia warga penuh.

CREATE TYPE user_role       AS ENUM ('mechanic','supervisor','superintendent');
CREATE TYPE approval_stage  AS ENUM ('supervisor','superintendent');
CREATE TYPE approval_decision AS ENUM ('approve','reject');
CREATE TYPE picker_style    AS ENUM ('flat','cascade');
CREATE TYPE odometer_type   AS ENUM ('KM','HM');
CREATE TYPE override_level  AS ENUM ('supervisor','superintendent');
CREATE TYPE override_kind   AS ENUM (
  'base_points','target_hours','team','time','unit','work_condition','judgment'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 1. TENANT
-- ════════════════════════════════════════════════════════════════════════════
-- Ada sejak baris pertama. Menambahkannya belakangan berarti memigrasi ulang
-- seluruh tabel — dan inilah satu-satunya pintu agar KMB, SUM, dan plant lain
-- bisa jadi satu produk, bukan salinan bercabang.

CREATE TABLE tenants (
  id          smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code        citext UNIQUE NOT NULL,          -- 'KMB'
  name        text NOT NULL,
  timezone    text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. ORANG, PERAN, TARIF
-- ════════════════════════════════════════════════════════════════════════════

-- Tarif per jabatan. Di KMB V2 ini pasangan kunci-nilai bernama
-- 'rate_<position>'; kalau kuncinya tak ketemu, sistem DIAM-DIAM memakai
-- angka cadangan 50.000 — 11-20x lipat rate asli, tanpa error, tanpa log.
-- Di sini jabatan adalah baris, dan mekanik menunjuknya lewat foreign key:
-- tidak ada jalan untuk gagal cocok.
CREATE TABLE pay_rates (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id   smallint NOT NULL REFERENCES tenants(id),
  position    citext NOT NULL,                 -- 'junior','senior','advisor'
  label       text NOT NULL,
  idr_per_point numeric(12,2) NOT NULL CHECK (idr_per_point > 0),
  section     citext,                          -- NULL = berlaku semua section
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, position, section)
);

CREATE TABLE mechanics (
  id            integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id     smallint NOT NULL REFERENCES tenants(id),
  mechanic_code citext NOT NULL,               -- 'MECH-001'
  name          text NOT NULL,
  email         citext,
  role          user_role NOT NULL DEFAULT 'mechanic',
  pay_rate_id   integer NOT NULL REFERENCES pay_rates(id),   -- WAJIB. Tak ada fallback.
  grade         text,                          -- label tampilan saja
  keterangan    text,
  is_active     boolean NOT NULL DEFAULT true,
  is_test_account boolean NOT NULL DEFAULT false,  -- dikecualikan dari payroll
  -- penanda akses layar (KMB V2: Config_Mechanics.boleh_lihat_*)
  may_view_performance boolean NOT NULL DEFAULT false,
  may_view_technical   boolean NOT NULL DEFAULT false,
  may_view_report      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mechanic_code),
  UNIQUE (tenant_id, email)
);

-- KMB V2 menyimpan ini sebagai string berkoma ("tyreman,field") lalu
-- membandingkannya sebagai string UTUH — sehingga orang ber-section ganda
-- tidak pernah lolos penyaring dan HILANG dari Monitoring, daftar approval,
-- dan seluruh dropdown. Di 25 tempat, 7 berkas.
CREATE TABLE mechanic_sections (
  mechanic_id integer NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  section     citext  NOT NULL,
  PRIMARY KEY (mechanic_id, section)
);
-- Tidak punya baris sama sekali = boleh melihat semua section (perilaku V2).

-- ════════════════════════════════════════════════════════════════════════════
-- 3. SECTION, UNIT, KATALOG
-- ════════════════════════════════════════════════════════════════════════════

-- Section jadi baris, bukan konstanta di kode dan bukan nama sheet.
-- Menambah section baru = satu INSERT, bukan deploy.
CREATE TABLE sections (
  id            smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id     smallint NOT NULL REFERENCES tenants(id),
  code          citext NOT NULL,               -- 'tyreman','field','workshop'
  name          text NOT NULL,
  picker_style  picker_style NOT NULL,         -- flat (tyreman) | cascade
  requires_unit boolean NOT NULL DEFAULT true, -- workshop: false
  sort_order    smallint NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);

-- Kelas joblist. Di KMB V2 ini kolom teks bebas di dua tempat yang dicocokkan
-- sebagai string: SATU SPASI di ujungnya membuat seluruh model lenyap dari
-- dropdown tanpa galat apa pun (10 Sep 2026).
CREATE TABLE unit_models (
  id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id  smallint NOT NULL REFERENCES tenants(id),
  code       citext NOT NULL,                  -- 'hauler','bulldozer'
  name       text NOT NULL,
  section_id smallint NOT NULL REFERENCES sections(id),
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code, section_id)
);

CREATE TABLE units (
  id             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id      smallint NOT NULL REFERENCES tenants(id),
  unit_code      citext NOT NULL,              -- 'UNIT-001'
  unit_name      text NOT NULL,                -- nomor lambung, 'XDTTN93001'
  unit_model_id  integer REFERENCES unit_models(id),   -- NULL utk unit semu
  brand          text,
  model_type     text,                         -- 'TLD93A'
  unit_factor    numeric(6,3) NOT NULL DEFAULT 1.0 CHECK (unit_factor > 0),
  odometer       odometer_type,
  mtbf_eligible  boolean NOT NULL DEFAULT false,
  is_virtual     boolean NOT NULL DEFAULT false,  -- ex sentinel 'OTHERS'/'WORKSHOP'
  notes          text,
  is_active      boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, unit_code)
);

CREATE TABLE unit_sections (
  unit_id    integer NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  section_id smallint NOT NULL REFERENCES sections(id),
  PRIMARY KEY (unit_id, section_id)
);
-- Tidak punya baris = milik semua section (perilaku V2 dipertahankan).

CREATE TABLE job_components (
  id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  section_id smallint NOT NULL REFERENCES sections(id),
  name       citext NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  UNIQUE (section_id, name)
);

CREATE TABLE job_sub_components (
  id           integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  component_id integer NOT NULL REFERENCES job_components(id) ON DELETE CASCADE,
  name         citext NOT NULL,
  sort_order   smallint NOT NULL DEFAULT 0,
  UNIQUE (component_id, name)
);

-- Tingkat kesulitan. Di KMB V2 rasio base_point/plan_hours hanya pernah bernilai
-- 2,0 / 2,5 / 3,0 pada seluruh 1.399 baris — pola sempurna yang TIDAK tertulis
-- di kolom mana pun. Dieksplisitkan di sini supaya kebijakan poin bisa diubah
-- lewat satu baris, bukan 1.209 sel. (Perlu konfirmasi pemilik produk.)
CREATE TABLE difficulty_tiers (
  id         smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id  smallint NOT NULL REFERENCES tenants(id),
  code       citext NOT NULL,
  name       text NOT NULL,
  multiplier numeric(5,2) NOT NULL CHECK (multiplier > 0),
  UNIQUE (tenant_id, code)
);

-- SATU tabel job. Di KMB V2 ada dua sheet fisik (Field/Workshop) plus satu
-- sheet component terpisah untuk tyreman, dengan DUA nama berbeda untuk konsep
-- yang sama (base_point/plan_hours vs base_points/target_hours) — yang memaksa
-- scoring bercabang hanya karena penamaan.
CREATE TABLE jobs (
  id                integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id         smallint NOT NULL REFERENCES tenants(id),
  job_code          citext NOT NULL,           -- 'JOB-0001','COM-001'
  section_id        smallint NOT NULL REFERENCES sections(id),
  unit_model_id     integer REFERENCES unit_models(id),        -- NULL utk flat
  sub_component_id  integer REFERENCES job_sub_components(id), -- NULL utk flat
  job_description   text NOT NULL,
  plan_hours        numeric(8,2) NOT NULL CHECK (plan_hours >= 0),
  difficulty_tier_id smallint REFERENCES difficulty_tiers(id),
  base_points       numeric(10,3) NOT NULL CHECK (base_points >= 0),
  job_type          citext,                    -- 'breakdown','preventive'
  default_team_size smallint NOT NULL DEFAULT 1 CHECK (default_team_size > 0),
  is_manual_entry   boolean NOT NULL DEFAULT false,  -- ex 'COM-OTHERS'
  detail_form_id    integer,                   -- FK dipasang setelah tabel form
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_code),
  CONSTRAINT bentuk_cascade CHECK (
    (unit_model_id IS NOT NULL AND sub_component_id IS NOT NULL)  -- cascade
    OR (unit_model_id IS NULL AND sub_component_id IS NULL)       -- flat
  )
);
CREATE INDEX jobs_pilih_idx ON jobs (section_id, unit_model_id) WHERE is_active;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. FAKTOR & SETELAN
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE factors (
  id           integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id    smallint NOT NULL REFERENCES tenants(id),
  factor_type  citext NOT NULL CHECK (factor_type IN
                 ('work_condition','timeliness','safety','mtbf')),
  factor_key   citext NOT NULL,
  factor_value numeric(6,3) NOT NULL CHECK (factor_value >= 0),
  description  text,
  UNIQUE (tenant_id, factor_type, factor_key)
);

CREATE TABLE settings (
  tenant_id     smallint NOT NULL REFERENCES tenants(id),
  setting_key   citext NOT NULL,
  setting_value text,
  description   text,
  PRIMARY KEY (tenant_id, setting_key)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. NOMOR WO — dijamin unik oleh basis data
-- ════════════════════════════════════════════════════════════════════════════
-- KMB V2: 'WO-YYYYMMDD-' + (epoch_ms % 1000) = 1.000 slot/hari untuk ~100 WO.
-- Tabrakan bukan kemungkinan melainkan kepastian: 6 Agu 2026 ditemukan 3 pasang
-- WO berbeda bernomor sama, SEMUANYA SUDAH DIBAYAR. Tambalannya di V2 adalah
-- memindai seluruh riwayat lalu retry 50 kali.

CREATE TABLE wo_number_counters (
  tenant_id smallint NOT NULL REFERENCES tenants(id),
  for_date  date     NOT NULL,
  last_seq  integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, for_date)
);

CREATE FUNCTION next_wo_number(p_tenant smallint, p_date date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_seq integer;
BEGIN
  INSERT INTO wo_number_counters (tenant_id, for_date, last_seq)
  VALUES (p_tenant, p_date, 1)
  ON CONFLICT (tenant_id, for_date)
  DO UPDATE SET last_seq = wo_number_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'WO-' || to_char(p_date,'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. WORK ORDER
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE work_orders (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id       smallint NOT NULL REFERENCES tenants(id),
  wo_number       text NOT NULL,
  section_id      smallint NOT NULL REFERENCES sections(id),

  -- apa yang dikerjakan
  job_id          integer REFERENCES jobs(id),
  unit_id         integer REFERENCES units(id),
  work_condition  citext NOT NULL DEFAULT 'normal',
  location        text,
  keterangan      text,

  -- nilai manual (ex "Others"). Kolom SENDIRI, tidak menumpang kolom override —
  -- di KMB V2 ia menumpang, sehingga badge "SPV override" muncul di setiap WO
  -- Others padahal tak seorang pun meng-override.
  is_manual       boolean NOT NULL DEFAULT false,
  manual_description text,
  manual_base_points numeric(10,3) CHECK (manual_base_points > 0),
  manual_target_hours numeric(8,2) CHECK (manual_target_hours > 0),
  manual_unit_factor  numeric(6,3) CHECK (manual_unit_factor > 0),

  -- grup
  wo_group_id     uuid,
  wo_group_mode   citext CHECK (wo_group_mode IN ('unit','job')),

  -- meter saat WO dibuat
  hour_meter      numeric(12,2),
  kilometers      numeric(12,2),

  status          wo_status NOT NULL DEFAULT 'pending_mechanic_work',
  putaran         smallint NOT NULL DEFAULT 1,

  -- pelaksanaan
  start_time      timestamptz,
  end_time        timestamptz,
  session_hours   numeric(8,2),                -- sesi terakhir saja
  partial_hours   numeric(8,2) NOT NULL DEFAULT 0,  -- akumulasi sebelum transfer
  actual_hours    numeric(8,2) GENERATED ALWAYS AS
                    (coalesce(session_hours,0) + partial_hours) STORED,
  part_category   citext,
  safety_incident boolean NOT NULL DEFAULT false,
  mtbf_redo_status citext,                     -- 'first_time' | 'redo'
  submitted_at    timestamptz,

  -- jejak keputusan
  created_by      integer NOT NULL REFERENCES mechanics(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_l1_by  integer REFERENCES mechanics(id),
  approved_l1_at  timestamptz,
  approved_l2_by  integer REFERENCES mechanics(id),
  approved_l2_at  timestamptz,
  rejected_by     integer REFERENCES mechanics(id),
  rejected_at     timestamptz,
  rejection_reason text,
  returned_by     integer REFERENCES mechanics(id),
  returned_at     timestamptz,
  return_reason   text,

  final_points    numeric(12,3),

  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, wo_number),
  CONSTRAINT waktu_masuk_akal CHECK (end_time IS NULL OR start_time IS NULL
                                     OR end_time > start_time),
  -- WO manual wajib lengkap; WO katalog wajib punya job
  CONSTRAINT sumber_poin_jelas CHECK (
    (is_manual AND manual_base_points IS NOT NULL
                AND manual_target_hours IS NOT NULL
                AND manual_unit_factor IS NOT NULL)
    OR (NOT is_manual AND job_id IS NOT NULL)
  )
);

CREATE INDEX wo_antrean_idx  ON work_orders (tenant_id, status, section_id);
CREATE INDEX wo_unit_idx     ON work_orders (unit_id);
CREATE INDEX wo_grup_idx     ON work_orders (wo_group_id) WHERE wo_group_id IS NOT NULL;
CREATE INDEX wo_approved_idx ON work_orders (tenant_id, approved_l2_at)
                               WHERE status = 'approved';
-- Tidak ada tabel arsip terpisah. Di KMB V2 arsip ada semata supaya sheet panas
-- kecil; dengan index alasan itu hilang — dan dua skema paralel yang harus
-- dijaga identik secara manual ikut hilang bersamanya.

-- ─── Mesin transisi status ──────────────────────────────────────────────────
CREATE TABLE status_transitions (
  from_status wo_status NOT NULL,
  to_status   wo_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

INSERT INTO status_transitions (from_status, to_status) VALUES
  ('pending_mechanic_work','in_progress'),
  ('pending_mechanic_work','pending_supervisor'),
  ('pending_mechanic_work','pending_transfer'),
  ('pending_mechanic_work','rejected'),
  ('pending_mechanic_work','cancelled'),
  ('in_progress','pending_supervisor'),
  ('in_progress','pending_transfer'),
  ('in_progress','cancelled'),
  ('pending_transfer','pending_mechanic_work'),
  ('pending_transfer','in_progress'),
  ('pending_transfer','cancelled'),
  ('pending_supervisor','pending_superintendent'),
  ('pending_supervisor','pending_mechanic_work'),   -- dikembalikan ke mekanik
  ('pending_supervisor','rejected'),
  ('pending_supervisor','cancelled'),
  ('pending_superintendent','approved'),
  ('pending_superintendent','pending_supervisor'),
  ('pending_superintendent','pending_mechanic_work'),
  ('pending_superintendent','rejected'),
  ('pending_superintendent','cancelled'),
  ('approved','cancelled');                        -- poin di-nol-kan, lihat §8

CREATE FUNCTION jaga_transisi_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM status_transitions
                   WHERE from_status = OLD.status AND to_status = NEW.status) THEN
      RAISE EXCEPTION 'Transisi status tidak sah: % -> % (WO %)',
        OLD.status, NEW.status, OLD.wo_number;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER wo_jaga_transisi BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION jaga_transisi_status();

-- ─── Tim ────────────────────────────────────────────────────────────────────
-- Model poin PENUH: setiap anggota menerima poin utuh, bukan porsi.
-- Menambah anggota tidak memecah kue — ia menggandakan pengeluaran.
CREATE TABLE work_order_team (
  work_order_id bigint  NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  mechanic_id   integer NOT NULL REFERENCES mechanics(id),
  added_at      timestamptz NOT NULL DEFAULT now(),
  added_by      integer REFERENCES mechanics(id),
  PRIMARY KEY (work_order_id, mechanic_id)   -- tim kembar mustahil
);

-- ─── Transfer ───────────────────────────────────────────────────────────────
CREATE TABLE work_order_transfers (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  work_order_id bigint NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  requested_by  integer NOT NULL REFERENCES mechanics(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  session_start timestamptz,
  session_stop  timestamptz,
  session_hours numeric(8,2),                -- masuk ke partial_hours saat disetujui
  note          text,
  decided_by    integer REFERENCES mechanics(id),
  decided_at    timestamptz,
  decision      approval_decision
);

CREATE TABLE work_order_transfer_recipients (
  transfer_id bigint  NOT NULL REFERENCES work_order_transfers(id) ON DELETE CASCADE,
  mechanic_id integer NOT NULL REFERENCES mechanics(id),
  PRIMARY KEY (transfer_id, mechanic_id)
);

-- ─── Override ───────────────────────────────────────────────────────────────
-- KMB V2 menyebarkan ini ke 20 kolom di WorkOrders. Di sini satu baris per
-- (WO, level, jenis) — riwayatnya terbaca, dan menambah jenis baru tidak
-- menuntut ALTER TABLE.
CREATE TABLE work_order_overrides (
  work_order_id bigint NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  level         override_level NOT NULL,
  kind          override_kind  NOT NULL,
  value         jsonb NOT NULL,
  reason        text,
  set_by        integer NOT NULL REFERENCES mechanics(id),
  set_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_order_id, level, kind)
);
-- L2 menang atas L1. Baris yang ADA berarti "level ini pernah menyentuh" —
-- termasuk ketika ia sengaja mengosongkan (value = 'null'::jsonb). Di KMB V2
-- perbedaan ini butuh kolom penanda terpisah (judgment_at_*).

-- ════════════════════════════════════════════════════════════════════════════
-- 7. APPROVAL, SNAPSHOT, POIN
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE approvals (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  work_order_id bigint NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage         approval_stage NOT NULL,
  decision      approval_decision NOT NULL,
  putaran       smallint NOT NULL DEFAULT 1,
  approver_id   integer NOT NULL REFERENCES mechanics(id),
  judgment      text,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, stage, decision, putaran)
);

-- Riwayat yang dibekukan. Mengubah katalog atau faktor SETELAH WO approved
-- tidak boleh mengubah angka yang sudah terbit.
CREATE TABLE scoring_snapshots (
  work_order_id         bigint PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
  base_points           numeric(10,3) NOT NULL,
  target_hours          numeric(8,2)  NOT NULL,
  actual_hours          numeric(8,2)  NOT NULL,
  unit_factor           numeric(6,3)  NOT NULL,
  work_condition_factor numeric(6,3)  NOT NULL,
  timeliness_factor     numeric(6,3)  NOT NULL,
  timeliness_status     citext        NOT NULL,
  safety_factor         numeric(6,3)  NOT NULL,
  mtbf_factor           numeric(6,3)  NOT NULL,
  final_points          numeric(12,3) NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Satu (WO, mekanik) satu baris. Di KMB V2 kuncinya kolom `id` acak yang
-- TERBUKTI bisa bertabrakan; kunci sebenarnya selalu (wo, mekanik).
CREATE TABLE mechanic_points (
  work_order_id bigint  NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  mechanic_id   integer NOT NULL REFERENCES mechanics(id),
  section_id    smallint NOT NULL REFERENCES sections(id),
  points        numeric(12,3) NOT NULL CHECK (points >= 0),
  idr_per_point numeric(12,2) NOT NULL CHECK (idr_per_point >= 0),  -- DIBEKUKAN
  idr_value     numeric(14,2) GENERATED ALWAYS AS
                  (round(points * idr_per_point, 0)) STORED,
  awarded_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_order_id, mechanic_id)
);
-- `idr_value` kolom turunan menutup DUA luka KMB V2 sekaligus:
--   1. Dashboard memakai idr_value tersimpan, payroll menghitung ulang dengan
--      rate SAAT INI — dua layar tak pernah cocok kalau rate pernah berubah.
--   2. cancelWorkOrder pernah menol-kan `points` tapi lupa `idr_value`,
--      meninggalkan "rupiah hantu" yang tetap tampil terbayar.
CREATE INDEX mp_mekanik_idx ON mechanic_points (mechanic_id, awarded_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. IDEMPOTENSI — penjaga WO ganda
-- ════════════════════════════════════════════════════════════════════════════
-- HTTP 502 tidak membedakan "server tak menerima" dari "server sudah menulis
-- semua, jawabannya yang putus". Dari layar keduanya identik. Kejadian acuan:
-- 17 WO borongan masuk semua, jawaban putus, pembuat klik ulang -> 17 WO kembar
-- bernomor berbeda, tak terdeteksi pemeriksaan apa pun (dua WO utuh bukan
-- duplikat menurut definisi mana pun).

CREATE TABLE processed_ops (
  op_id       text PRIMARY KEY,                -- op_id dari klien, lahir sekali
  tenant_id   smallint NOT NULL REFERENCES tenants(id),
  mechanic_id integer REFERENCES mechanics(id),
  action      text NOT NULL,
  result      jsonb NOT NULL,                  -- struk: jawaban yang dulu dikirim
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_pangkas_idx ON processed_ops (created_at);
-- Hanya diisi pada jalur BERHASIL. Kegagalan tidak boleh punya struk — kalau
-- di-cache, tombol "Coba lagi" mengembalikan error lama tanpa mengeksekusi ulang.
-- Pemangkasan: DELETE FROM processed_ops WHERE created_at < now() - interval '30 days';
-- Satu statement. Di GAS ini loop hapus-satu-per-satu yang gagal menabrak
-- batas 6 menit lalu gagal lagi setiap malam berikutnya.

-- ════════════════════════════════════════════════════════════════════════════
-- 9. TOKEN & PUSH
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE api_tokens (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id   smallint NOT NULL REFERENCES tenants(id),
  mechanic_id integer NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,            -- sha256. Tak pernah disimpan telanjang.
  token_hint  text NOT NULL,                   -- 4 huruf terakhir, untuk layar
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  last_used_at timestamptz
);
-- Di KMB V2 tab Monitoring memamerkan token setiap mekanik ke L1 dan L2.
-- Dengan hash, layar itu tidak bisa lagi menampilkannya; ia berubah jadi tombol
-- "Reset token" — yang memang fungsinya.

CREATE TABLE push_subscriptions (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id   smallint NOT NULL REFERENCES tenants(id),
  mechanic_id integer NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, endpoint)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 10. METER (HM/KM)
-- ════════════════════════════════════════════════════════════════════════════
-- HM menopang MTBF unit, KM menopang umur pakai ban. Keduanya hanya boleh naik,
-- kecuali panel fisik diganti.

CREATE TABLE meter_readings (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  unit_id       integer NOT NULL REFERENCES units(id),
  kind          odometer_type NOT NULL,
  value         numeric(12,2) NOT NULL CHECK (value >= 0),
  work_order_id bigint REFERENCES work_orders(id) ON DELETE SET NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  recorded_by   integer REFERENCES mechanics(id)
);
CREATE INDEX meter_unit_idx ON meter_readings (unit_id, kind, recorded_at DESC);

CREATE TABLE meter_panel_changes (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  unit_id     integer NOT NULL REFERENCES units(id),
  kind        odometer_type NOT NULL,
  changed_at  timestamptz NOT NULL,
  value_after numeric(12,2) NOT NULL DEFAULT 0,
  reason      text NOT NULL CHECK (length(reason) >= 5),
  recorded_by integer NOT NULL REFERENCES mechanics(id)
);

CREATE TABLE meter_corrections (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  work_order_id bigint NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  kind          odometer_type NOT NULL,
  value_before  numeric(12,2),
  value_after   numeric(12,2),
  reason        text NOT NULL CHECK (length(reason) >= 5),
  corrected_by  integer NOT NULL REFERENCES mechanics(id),
  corrected_at  timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 11. FORM DETAIL (ban, dst) — struktur jadi data, bukan kode
-- ════════════════════════════════════════════════════════════════════════════
-- Paket tyreman KMB V2 terbangun penuh lalu ditidurkan lewat satu tetapan di
-- kode (MODE_SEDERHANA). Di sini menidurkannya = UPDATE satu baris.

CREATE TABLE job_detail_forms (
  id             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id      smallint NOT NULL REFERENCES tenants(id),
  code           citext NOT NULL,
  name           text NOT NULL,
  is_positional  boolean NOT NULL DEFAULT false,
  position_count smallint,                     -- 10 posisi ban
  is_enabled     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code),
  CHECK (NOT is_positional OR position_count > 0)
);

ALTER TABLE jobs
  ADD CONSTRAINT jobs_detail_form_fk
  FOREIGN KEY (detail_form_id) REFERENCES job_detail_forms(id);

CREATE TABLE option_lists (
  id        integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id smallint NOT NULL REFERENCES tenants(id),
  code      citext NOT NULL,
  name      text NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE TABLE option_values (
  list_id    integer NOT NULL REFERENCES option_lists(id) ON DELETE CASCADE,
  value      text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (list_id, value)
);

CREATE TABLE job_detail_fields (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  form_id          integer NOT NULL REFERENCES job_detail_forms(id) ON DELETE CASCADE,
  field_key        citext NOT NULL,
  label            text NOT NULL,
  data_type        citext NOT NULL CHECK (data_type IN ('numeric','text','enum','date')),
  has_before_after boolean NOT NULL DEFAULT false,   -- pressure/rtd/suhu
  option_list_id   integer REFERENCES option_lists(id),
  is_required      boolean NOT NULL DEFAULT false,
  sort_order       smallint NOT NULL DEFAULT 0,
  UNIQUE (form_id, field_key)
);

CREATE TABLE work_order_detail_values (
  work_order_id bigint  NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  form_id       integer NOT NULL REFERENCES job_detail_forms(id),
  position      smallint NOT NULL DEFAULT 0,    -- 0 = non-posisional
  field_key     citext  NOT NULL,
  value_before  text,
  value_after   text,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  recorded_by   integer REFERENCES mechanics(id),
  PRIMARY KEY (work_order_id, form_id, position, field_key)
);
-- Kunci gabungan ini membuat kiriman ulang MENIMPA baris yang sama, bukan
-- melahirkan baris kedua: ON CONFLICT DO UPDATE. Tidak ada penghapusan,
-- tidak ada baris siapa pun yang perlu digeser.

-- ════════════════════════════════════════════════════════════════════════════
-- 12. AUDIT
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tenant_id   smallint NOT NULL REFERENCES tenants(id),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  actor_id    integer REFERENCES mechanics(id),
  details     jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entitas_idx ON audit_logs (tenant_id, entity_type, entity_id);
CREATE INDEX audit_waktu_idx   ON audit_logs (tenant_id, occurred_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 13. DETEKSI WO KEMBAR — menandai, bukan memblokir
-- ════════════════════════════════════════════════════════════════════════════
-- Kembar BERNOMOR BERBEDA tidak terlihat oleh constraint mana pun. Deteksi ini
-- sengaja advisory: kerja ulang yang sah harus tetap bisa lewat. Keputusan
-- tetap di tangan approver.

CREATE VIEW wo_kembar_dicurigai AS
SELECT a.id AS wo_id, b.id AS kembar_dengan,
       a.wo_number, b.wo_number AS kembar_nomor,
       a.unit_id, a.job_id,
       abs(extract(epoch FROM (a.start_time - b.start_time))/60)::int AS selisih_menit
FROM work_orders a
JOIN work_orders b
  ON  b.tenant_id = a.tenant_id
  AND b.id <> a.id
  AND b.unit_id IS NOT DISTINCT FROM a.unit_id
  AND b.job_id  IS NOT DISTINCT FROM a.job_id
  AND a.start_time IS NOT NULL AND b.start_time IS NOT NULL
  AND abs(extract(epoch FROM (a.start_time - b.start_time))) <= 30*60
WHERE a.status NOT IN ('rejected','cancelled')
  AND b.status NOT IN ('rejected','cancelled');

-- ════════════════════════════════════════════════════════════════════════════
-- 14. AKSES — ditegakkan di lapisan data
-- ════════════════════════════════════════════════════════════════════════════
-- Di KMB V2, halaman `reports` dibatasi L2 tetapi fungsi di belakangnya
-- menerima L1 juga. Gerbang layar bukan gerbang data.

ALTER TABLE work_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanic_points ENABLE ROW LEVEL SECURITY;

-- Identitas pemanggil ditetapkan per transaksi:  SET LOCAL app.mechanic_id = '...'
CREATE FUNCTION app_mechanic_id() RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.mechanic_id', true), '')::integer
$$;

CREATE FUNCTION app_role() RETURNS user_role LANGUAGE sql STABLE AS $$
  SELECT role FROM mechanics WHERE id = app_mechanic_id()
$$;

-- Mekanik melihat WO yang ia buat atau ia kerjakan; approver melihat WO dalam
-- section scope-nya (tanpa baris scope = semua section).
CREATE POLICY wo_baca ON work_orders FOR SELECT USING (
  app_role() IN ('supervisor','superintendent')
  AND (
    NOT EXISTS (SELECT 1 FROM mechanic_sections ms WHERE ms.mechanic_id = app_mechanic_id())
    OR EXISTS (
      SELECT 1 FROM mechanic_sections ms
      JOIN sections s ON s.code = ms.section
      WHERE ms.mechanic_id = app_mechanic_id() AND s.id = work_orders.section_id
    )
  )
  OR created_by = app_mechanic_id()
  OR EXISTS (SELECT 1 FROM work_order_team t
             WHERE t.work_order_id = work_orders.id
               AND t.mechanic_id = app_mechanic_id())
);

CREATE POLICY poin_baca ON mechanic_points FOR SELECT USING (
  mechanic_id = app_mechanic_id()
  OR app_role() IN ('supervisor','superintendent')
);
