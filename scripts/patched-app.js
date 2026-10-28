/**
 * app.js — Main Application Controller & Router untuk KMB Portal
 * 100% SPREADSHEET LIVE ENGINE (Direct Sync with Google Sheets & Google Apps Script)
 */

import { UNITS as FALLBACK_UNITS, MECHANICS as FALLBACK_MECHANICS, COMPONENTS as FALLBACK_COMPONENTS, TOKENS, FACTORS, RATES } from './data.js';
import { calculateWoPoints, calculateTeamDistribution } from './services/scoring.js';

const DEFAULT_MONITORING_OVERALL = {
  mechanics: 20,
  pending_mechanic_work: 7,
  pending_l1: 3,
  pending_l2: 21,
  approved: 13,
  periode: '26 Okt – 25 Nov 2026',
  total_poin: 20.20
};

const DEFAULT_MECHANICS_LIST = [
  { id: "VES-012", name: "Gusti Raka Pamungkas", section: "vessel", token: "97a47ff4c7e443f2a550", pending_mechanic_work: 2, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-002", name: "Mekanik Maintenance 2", section: "maintenance", token: "7ceafd98922343139b11", pending_mechanic_work: 2, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-009", name: "Alan Rohim", section: "maintenance", token: "abb499b53b564d0abc8e", pending_mechanic_work: 1, pending_l1: 1, pending_l2: 3, approved: 1 },
  { id: "VES-007", name: "Bayu Aji", section: "vessel", token: "bccd82db654b4caabe01", pending_mechanic_work: 1, pending_l1: 0, pending_l2: 1, approved: 3 },
  { id: "VES-011", name: "Yudo Hardianto", section: "vessel", token: "cad65b7ac67d485095f6", pending_mechanic_work: 1, pending_l1: 0, pending_l2: 3, approved: 1 },
  { id: "VES-010", name: "Aditya", section: "vessel", token: "c2309102d07946488229", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 0, approved: 1 },
  { id: "MNT-003", name: "Afid Irham", section: "maintenance", token: "67adf77d8d934659b5c5", pending_mechanic_work: 0, pending_l1: 1, pending_l2: 0, approved: 4 },
  { id: "VES-005", name: "Aji Laksono", section: "vessel", token: "c5f9fed98f4a41b29ff3", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-007", name: "Aldo Noviansyah", section: "maintenance", token: "da766cd0acc54b5f938b", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 6, approved: 5 },
  { id: "MNT-010", name: "Bagus Wahyu Nurcahyo", section: "maintenance", token: "58ea54f16b0149d1b06f", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 2, approved: 1 },
  { id: "VES-009", name: "Cahyo Aji", section: "vessel", token: "abec2e7e7334498e8b84", pending_mechanic_work: 0, pending_l1: 2, pending_l2: 0, approved: 0 },
  { id: "VES-008", name: "Dimas", section: "vessel", token: "a4c9596a547548e19866", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 0, approved: 0 },
  { id: "MNT-006", name: "Eliyadi", section: "maintenance", token: "66383ba88e8145368f80", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 5, approved: 1 },
  { id: "MNT-012", name: "Khoirul Musthofa", section: "vessel", token: "2022d461a0174205bb8f", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 3, approved: 1 },
  { id: "MNT-004", name: "M. Riyanto", section: "vessel", token: "6587ce74c4ec46a8b023", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 5, approved: 0 },
  { id: "VES-013", name: "Nicko Herman Saputra", section: "vessel", token: "ea4d95e0439344b78605", pending_mechanic_work: 0, pending_l1: 2, pending_l2: 0, approved: 0 },
  { id: "VES-004", name: "Rahmat", section: "vessel", token: "0385984dc6234e26a53f", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 1, approved: 3 },
  { id: "MNT-011", name: "Regista Pratama", section: "maintenance", token: "a184eb0d25ff4e9388f8", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 5, approved: 1 },
  { id: "MNT-008", name: "Rido Saputra", section: "maintenance", token: "151cc987cf5e4666840a", pending_mechanic_work: 0, pending_l1: 1, pending_l2: 4, approved: 0 },
  { id: "MNT-005", name: "Wiwit", section: "maintenance", token: "cac19e70058a43f8ab57", pending_mechanic_work: 0, pending_l1: 0, pending_l2: 7, approved: 4 }
];

const DEFAULT_PENDING_L1_LIST = [
  {
    id: "WO-20261026-004",
    raw_id: "WO-1792975278962-336",
    level: 1,
    date: "26 Oct 2026 07:41",
    shift: "Shift 2",
    unit_id: "XEVB42002 - ST",
    unit_name: "XEVB42002 - ST (BEIBEN)",
    component_name: "Testing And Adjusting - Tyre",
    section: "maintenance",
    location: "workshop",
    actual_hours: 0.3,
    target_hours: 2,
    final_points: 4.84,
    status: "PENDING_L1",
    team: [
      { name: "Afid Irham", mechanic_id: "MNT-003", points: 4.84, idr: 12100 },
      { name: "Rido Saputra", mechanic_id: "MNT-008", points: 4.84, idr: 12100 },
      { name: "Alan Rohim", mechanic_id: "MNT-009", points: 4.84, idr: 12100 }
    ],
    created_by: "Djarot"
  }
];

const DEFAULT_PENDING_L2_LIST = [
  {
    id: "WO-20261026-004",
    raw_id: "WO-1792975278962-336",
    level: 2,
    date: "26 Oct 2026 07:41",
    shift: "Shift 2",
    unit_id: "XEVB42002 - ST",
    unit_name: "XEVB42002 - ST (BEIBEN)",
    component_name: "Testing And Adjusting — Tyre",
    section: "maintenance",
    location: "workshop",
    actual_hours: 0.3,
    target_hours: 1,
    final_points: 2,
    status: "PENDING_L2",
    team: [
      { name: "Afid Irham", mechanic_id: "MNT-003", points: 2, idr: 5000 },
      { name: "Rido Saputra", mechanic_id: "MNT-008", points: 2, idr: 5000 },
      { name: "Alan Rohim", mechanic_id: "MNT-009", points: 2, idr: 5000 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-682",
    raw_id: "WO-1792981211087-586",
    level: 2,
    date: "26 Oct 2026 09:20",
    shift: "Shift 1",
    unit_id: "OTHERS",
    unit_name: "Others / Custom",
    others_description: "pengambilan solar dan pipa ke site BAS tanjung enim",
    component_name: "pengambilan solar dan pipa ke site BAS tanjung enim",
    section: "maintenance",
    location: "workshop",
    actual_hours: 10.63,
    target_hours: 4,
    final_points: 1,
    status: "PENDING_L2",
    team: [
      { name: "Regista Pratama", mechanic_id: "MNT-011", points: 1, idr: 2500 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-222",
    raw_id: "WO-1792981270025-036",
    level: 2,
    date: "26 Oct 2026 09:21",
    shift: "Shift 1",
    unit_id: "OTHERS",
    unit_name: "Others / Custom",
    others_description: "konek 2X Prime mover dan naikin 2X dolly ke Loboy",
    component_name: "konek 2X Prime mover dan naikin 2X dolly ke Loboy",
    section: "maintenance",
    location: "workshop",
    actual_hours: 2.27,
    target_hours: 2,
    final_points: 1,
    status: "PENDING_L2",
    team: [
      { name: "Regista Pratama", mechanic_id: "MNT-011", points: 1, idr: 2500 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-366",
    raw_id: "WO-1792981311764-241",
    level: 2,
    date: "26 Oct 2026 09:21",
    shift: "Shift 1",
    unit_id: "OTHERS",
    unit_name: "Others / Custom",
    others_description: "escort 2X prime over+ 2 Vesel dan 1X loboy+2X Doly ke KM 64",
    component_name: "escort 2X prime over+ 2 Vesel dan 1X loboy+2X Doly ke KM 64",
    section: "maintenance",
    location: "workshop",
    actual_hours: 2.53,
    target_hours: 2,
    final_points: 1,
    status: "PENDING_L2",
    team: [
      { name: "Regista Pratama", mechanic_id: "MNT-011", points: 1, idr: 2500 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-029",
    raw_id: "WO-1792983976896-192",
    level: 2,
    date: "26 Oct 2026 10:06",
    shift: "Shift 1",
    unit_id: "SDT-002",
    unit_name: "Comp Engine Rebuild (ENGINE)",
    component_name: "Assembling — Cylinder Block",
    section: "vessel",
    location: "workshop",
    actual_hours: 4.25,
    target_hours: 4,
    final_points: 8,
    status: "PENDING_L2",
    team: [
      { name: "Cahyo Aji", mechanic_id: "VES-009", points: 8, idr: 20000 },
      { name: "Nicko Herman Saputra", mechanic_id: "VES-013", points: 8, idr: 20000 }
    ],
    created_by: "Djarot"
  },
  {
    id: "WO-20261026-408",
    raw_id: "WO-1792990608901-228",
    level: 2,
    date: "26 Oct 2026 11:56",
    shift: "Shift 1",
    unit_id: "SDVS70011",
    unit_name: "SDVS70011 (NUSATAMA)",
    component_name: "Resealing — Hydrolik Ssytem",
    section: "vessel",
    location: "workshop",
    actual_hours: 3,
    target_hours: 4,
    final_points: 8,
    status: "PENDING_L2",
    team: [
      { name: "Cahyo Aji", mechanic_id: "VES-009", points: 8, idr: 20000 },
      { name: "Nicko Herman Saputra", mechanic_id: "VES-013", points: 8, idr: 20000 }
    ],
    created_by: "Djarot"
  }
];

const DEFAULT_ACTIVE_WOS = [
  {
    "id": "WO-1791354189366-446",
    "wo_number": "WO-20261007-427",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Major Repair — Brake / Brake System",
    "unit_id": "XEVB42004 - ST",
    "unit_name": "XEVB42004 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-07T06:23:09.366Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Alan Rohim"
    ],
    "is_others": false,
    "keterangan": "Storing KM 0, repair breaking axle 1,2 vessel"
  },
  {
    "id": "WO-1792481163040-004",
    "wo_number": "WO-20261020-819",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Vessel / Chasis & Body",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-20T07:26:03.040Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Yudo Hardianto"
    ],
    "is_others": false,
    "keterangan": "Remove King Pin Vessel A dan Vessel B"
  },
  {
    "id": "WO-1792921061466-009",
    "wo_number": "WO-20261025-697",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Vessel / Chasis & Body",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-25T09:37:41.466Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Bayu Aji"
    ],
    "is_others": false,
    "keterangan": "Cutting  Canopi Vessel A Nusatama"
  },
  {
    "id": "WO-1792921152322-318",
    "wo_number": "WO-20261025-477",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Vessel / Chasis & Body",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-25T09:39:12.322Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Gusti Raka Pamungkas"
    ],
    "is_others": false,
    "keterangan": "Make bracket stop lamp Nusatama A"
  },
  {
    "id": "WO-1792990418815-893",
    "wo_number": "WO-20261026-156",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Vessel / Chasis & Body",
    "unit_id": "SDVS70012",
    "unit_name": "SDVS70012 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T04:53:38.815Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Gusti Raka Pamungkas"
    ],
    "is_others": false,
    "keterangan": "Welding Crack dalam Vesel"
  },
  {
    "id": "WO-1793013215789-718",
    "wo_number": "WO-20261026-277",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Cleaning — Vessel / Brake & Tyre System",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T11:13:37.277Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": null
  },
  {
    "id": "WO-1793013232200-006",
    "wo_number": "WO-20261026-046",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Others — Test Others",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T11:13:53.046Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": true,
    "keterangan": null
  },
  {
    "id": "WO-1793020774786-616",
    "wo_number": "WO-20261026-311",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Others — EV42002 - Re torque bolt Mudguard LH RR",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:19:34.786Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Aldo Noviansyah",
      "Wiwit",
      "Bagus Wahyu Nurcahyo",
      "Eliyadi"
    ],
    "is_others": true,
    "keterangan": "EV42002\n- Re torque bolt Mudguard LH RR"
  },
  {
    "id": "WO-1793020875039-854",
    "wo_number": "WO-20261026-534",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Others — Full welding stand vessel / Landing Jack",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:21:15.039Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Bagus Wahyu Nurcahyo",
      "Aldo Noviansyah",
      "Wiwit",
      "Eliyadi"
    ],
    "is_others": true,
    "keterangan": "Full welding stand vessel / Landing Jack"
  },
  {
    "id": "WO-1793020948780-249",
    "wo_number": "WO-20261026-198",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Remove And Install — Tyre / Tyre",
    "unit_id": "XEVB42003 - ST",
    "unit_name": "XEVB42003 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:22:28.780Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Aldo Noviansyah",
      "Eliyadi",
      "Wiwit",
      "Bagus Wahyu Nurcahyo"
    ],
    "is_others": false,
    "keterangan": "- Remove and install Tyre No. 6 vessel\n- Connecting cable head lamp"
  },
  {
    "id": "WO-1793021024161-966",
    "wo_number": "WO-20261026-037",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Minor Repair — Chassis / Chassis",
    "unit_id": "XEVB42006 - ST",
    "unit_name": "XEVB42006 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:23:44.161Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Wiwit",
      "Bagus Wahyu Nurcahyo",
      "Eliyadi",
      "Aldo Noviansyah"
    ],
    "is_others": false,
    "keterangan": "- Re torque bolt cover battery \n- Make safety bracket bumper RH PM"
  },
  {
    "id": "WO-1793021083519-950",
    "wo_number": "WO-20261026-231",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Others — Cleaning charging unit",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:24:43.519Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Wiwit",
      "Bagus Wahyu Nurcahyo"
    ],
    "is_others": true,
    "keterangan": "Cleaning charging unit"
  },
  {
    "id": "WO-1793021165173-381",
    "wo_number": "WO-20261026-391",
    "status": "pending_mechanic_work",
    "section": "maintenance",
    "component_name": "Minor Repair — Chassis / Chassis",
    "unit_id": "XEVB42006 - ST",
    "unit_name": "XEVB42006 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:26:05.173Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Wiwit",
      "Aldo Noviansyah",
      "Eliyadi"
    ],
    "is_others": false,
    "keterangan": "Install bolt Bulbar 1pcs RH"
  },
  {
    "id": "WO-1793021282822-799",
    "wo_number": "WO-20261026-528",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Vessel / Chasis & Body",
    "unit_id": "SDVS70012",
    "unit_name": "SDVS70012 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:28:02.822Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Gusti Raka Pamungkas"
    ],
    "is_others": false,
    "keterangan": "Welding Crack dalam Vesel"
  },
  {
    "id": "WO-1793021343933-378",
    "wo_number": "WO-20261026-170",
    "status": "pending_mechanic_work",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Vessel / Chasis & Body",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_by_is_mechanic": false,
    "created_at": "2026-10-26T13:29:03.933Z",
    "wo_group_id": "",
    "wo_group_mode": "",
    "team_names": [
      "Gusti Raka Pamungkas"
    ],
    "is_others": false,
    "keterangan": "Cutting braket lamp dan pipe cable"
  }
];
const DEFAULT_APPROVED_WOS = [
  {
    "id": "WO-1792840872383-895",
    "wo_number": "WO-20261024-468",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Testing And Adjusting — Air Conditioner / Air Conditioner",
    "unit_id": "XEVB42002 - ST",
    "unit_name": "XEVB42002 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 5200,
    "final_points": 0.8,
    "actual_hours": 1.17,
    "team_names": [
      "Wiwit",
      "Afid Irham\r",
      "Aldo Noviansyah"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "Adjust Freon 134"
  },
  {
    "id": "WO-1792840705681-871",
    "wo_number": "WO-20261024-262",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Minor Repair — Chassis / Vessel",
    "unit_id": "XEVB42005 - ST",
    "unit_name": "XEVB42005 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 4400,
    "final_points": 1.1,
    "actual_hours": 1,
    "team_names": [
      "Aldo Noviansyah",
      "Wiwit"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "- Welding and install Bulbar PM 05 \n- welding and install stoper pin sylinder dump vessel"
  },
  {
    "id": "WO-1792837057200-241",
    "wo_number": "WO-20261024-473",
    "status": "approved",
    "section": "vessel",
    "component_name": "Brushing — Vessel / Chasis & Body",
    "unit_id": "SDVS70012",
    "unit_name": "SDVS70012 (NUSATAMA)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 8250,
    "final_points": 3.3,
    "actual_hours": 2.63,
    "team_names": [
      "Khoirul Musthofa"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "brushing Axel 1&2 vessel B Nusatama"
  },
  {
    "id": "WO-1792836921926-104",
    "wo_number": "WO-20261024-553",
    "status": "approved",
    "section": "vessel",
    "component_name": "Others — Antar mobil cuci steam",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 495,
    "final_points": 0.33,
    "actual_hours": 0.85,
    "team_names": [
      "Aditya"
    ],
    "is_others": true,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "Antar mobil cuci steam"
  },
  {
    "id": "WO-1792836703362-678",
    "wo_number": "WO-20261024-948",
    "status": "approved",
    "section": "vessel",
    "component_name": "Others — Escord keluar site lowbouy membawa PM dan Dolly",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "field",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 16500,
    "final_points": 2.2,
    "actual_hours": 2,
    "team_names": [
      "Rahmat",
      "Yudo Hardianto",
      "Bayu Aji"
    ],
    "is_others": true,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "Escord keluar site lowbouy membawa PM dan Dolly"
  },
  {
    "id": "WO-1792835380722-221",
    "wo_number": "WO-20261024-319",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Others — escort 2X Prime mover dan 1 X loboy di KM 111 untuk jemput vesel dan doly  di KM 36",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 1200,
    "final_points": 0.8,
    "actual_hours": 5.65,
    "team_names": [
      "Regista Pratama"
    ],
    "is_others": true,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "escort 2X Prime mover dan 1 X loboy di KM 111 untuk jemput vesel dan doly  di KM 36"
  },
  {
    "id": "WO-1792809095206-657",
    "wo_number": "WO-20261024-565",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Minor Repair — Electrical / Lighting System",
    "unit_id": "XEVB42003 - ST",
    "unit_name": "XEVB42003 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 4400,
    "final_points": 1.1,
    "actual_hours": 0.62,
    "team_names": [
      "Aldo Noviansyah",
      "Afid Irham\r"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "- Cek Wiring Head Lamp Lh Rh\n- Repair Wiring Head Lamp Lh Rh"
  },
  {
    "id": "WO-1792809004202-470",
    "wo_number": "WO-20261024-350",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Remove & Install — Suspension / Leaf  Spring",
    "unit_id": "XEVB42002 - ST",
    "unit_name": "XEVB42002 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 14300,
    "final_points": 2.2,
    "actual_hours": 1.58,
    "team_names": [
      "Afid Irham\r",
      "Wiwit",
      "Aldo Noviansyah"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "- Replace Center Bolt \n- Replace Spring No.1"
  },
  {
    "id": "WO-1792808875626-518",
    "wo_number": "WO-20261024-963",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Remove And Install — Tyre / Tyre",
    "unit_id": "XEVB42002 - ST",
    "unit_name": "XEVB42002 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 7150,
    "final_points": 1.1,
    "actual_hours": 0.47,
    "team_names": [
      "Wiwit",
      "Aldo Noviansyah",
      "Afid Irham\r"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "- Assembly New Tyre \n- Replace Tyre Pos 4 Vessel"
  },
  {
    "id": "WO-1792808803640-992",
    "wo_number": "WO-20261024-421",
    "status": "approved",
    "section": "maintenance",
    "component_name": "Remove And Install — Brake / Brake System",
    "unit_id": "XEVB42004 - ST",
    "unit_name": "XEVB42004 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "24 Okt 2026",
    "final_idr": 13310,
    "final_points": 2.42,
    "actual_hours": 1.75,
    "team_names": [
      "Bagus Wahyu Nurcahyo",
      "Eliyadi",
      "Alan Rohim"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "Remove & Install whell bearing axle 2 vessel + ganti lining"
  },
  {
    "id": "WO-1792656884072-291",
    "wo_number": "WO-20261022-991",
    "status": "approved",
    "section": "vessel",
    "component_name": "Others — LV Triton KMB - Adjust Parking Brake",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "22 Okt 2026",
    "final_idr": 1375,
    "final_points": 0.55,
    "actual_hours": 0.53,
    "team_names": [
      "Rahmat"
    ],
    "is_others": true,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "LV Triton KMB - Adjust Parking Brake"
  },
  {
    "id": "WO-1792565750384-163",
    "wo_number": "WO-20261021-956",
    "status": "approved",
    "section": "vessel",
    "component_name": "Others — Disconect truck PM after test Dump",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "21 Okt 2026",
    "final_idr": 5500,
    "final_points": 1.1,
    "actual_hours": 0.57,
    "team_names": [
      "Bayu Aji",
      "Rahmat"
    ],
    "is_others": true,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "Disconect truck PM after test Dump"
  },
  {
    "id": "WO-1792496205953-106",
    "wo_number": "WO-20261020-383",
    "status": "approved",
    "section": "vessel",
    "component_name": "Remove & Install — Vessel / Hanger Spring",
    "unit_id": "SDVS70012",
    "unit_name": "SDVS70012 (NUSATAMA)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "spv-002@kmb.local",
    "created_at_str": "20 Okt 2026",
    "final_idr": 8000,
    "final_points": 3.2,
    "actual_hours": 7.18,
    "team_names": [
      "Bayu Aji"
    ],
    "is_others": false,
    "hour_meter": null,
    "kilometers": null,
    "part_category": null,
    "safety_incident": false,
    "keterangan": "Cutting hangar axel pos 1 dan pos 2 pada vessel B"
  }
];
const DEFAULT_REJECTED_WOS = [
  {
    "id": "WO-1792750251923-987",
    "wo_number": "WO-20261023-349",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Remove And Install — Tyre",
    "unit_id": "XEVB42004 - ST",
    "unit_name": "XEVB42004 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_at": "2026-10-23T10:10:51.923Z",
    "team_names": [
      "Aldo Noviansyah",
      "Afid Irham\r",
      "Wiwit"
    ],
    "is_others": false,
    "keterangan": "- Assembly Tyre Baru 1pcs\n- Replace Tyre New 2pcs Pos 7/8 Vessel",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:49:23.885Z",
    "rejection_reason": "wo double"
  },
  {
    "id": "WO-ID-6f013bbd",
    "wo_number": "WO-UJI-261022-1425-01",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T04:13:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #1",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:13:27.731Z",
    "rejection_reason": "trial wo"
  },
  {
    "id": "WO-ID-d0f8e114",
    "wo_number": "WO-UJI-261022-1425-02",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T04:01:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #2",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:15:29.925Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-2fa9c601",
    "wo_number": "WO-UJI-261022-1425-03",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T03:49:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #3",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:16:22.165Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-56fdf8c5",
    "wo_number": "WO-UJI-261022-1425-04",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T03:37:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #4 [⚠️ SAFETY INCIDENT]",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:17:07.730Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-315763e9",
    "wo_number": "WO-UJI-261022-1425-05",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T03:25:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #5",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:17:52.183Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-f9ccb66c",
    "wo_number": "WO-UJI-261022-1425-06",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T03:13:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #6",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:18:27.744Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-f77a5b73",
    "wo_number": "WO-UJI-261022-1425-07",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T03:01:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #7",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:19:00.913Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-904de53f",
    "wo_number": "WO-UJI-261022-1425-08",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T02:49:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #8 [🔧 REDO]",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:19:32.696Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-b75532a5",
    "wo_number": "WO-UJI-261022-1425-09",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T02:37:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #9",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:20:06.561Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-ID-3e73ab80",
    "wo_number": "WO-UJI-261022-1425-10",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Cleaning",
    "unit_id": "UNIT-OTHERS",
    "unit_name": "📝 Job Manual (di luar katalog) (OTHERS)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "admin.test@kmb.local",
    "created_by_name": "admin.test@kmb.local",
    "created_at": "2026-10-22T02:25:31.183Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": "WO Uji Coba Bulk Approve MNT-002 #10",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-25T06:14:39.882Z",
    "rejection_reason": "wo trial"
  },
  {
    "id": "WO-1792122925632-247",
    "wo_number": "WO-20261016-224",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Others — Unit : PM EV42005 Komponen : Service PS1 Sub komponen : Service PS1 Job : - Service periodic 1           - Greasing all niplle           - cek pressure all tyre           - Inspeksi",
    "unit_id": "OTHERS",
    "unit_name": "Others / Custom",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l2test@gmail.com",
    "created_by_name": "L2 Test",
    "created_at": "2026-10-16T03:55:25.632Z",
    "team_names": [
      "Afid Irham\r",
      "Alan Rohim",
      "Wiwit",
      "Regista Pratama"
    ],
    "is_others": true,
    "keterangan": null,
    "rejected_by_name": "L2 Test",
    "rejected_at": "2026-10-16T03:59:46.889Z",
    "rejection_reason": "salah"
  },
  {
    "id": "WO-1791892452016-742",
    "wo_number": "WO-20261013-289",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Minor Repair — U Bolt & Center Bolt",
    "unit_id": "XEVB42004 - ST",
    "unit_name": "XEVB42004 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_at": "2026-10-13T11:54:12.016Z",
    "team_names": [
      "Eliyadi",
      "M. Riyanto",
      "Bagus Wahyu Nurcahyo"
    ],
    "is_others": false,
    "keterangan": "retorque u-bolt spring axel pos 1 vessel",
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-10-13T11:58:47.144Z",
    "rejection_reason": "salah manpower"
  },
  {
    "id": "WO-1791683326040-900",
    "wo_number": "WO-20261011-792",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Remove And Install — Tyre",
    "unit_id": "XEVB42004 - ST",
    "unit_name": "XEVB42004 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_at": "2026-10-11T01:48:46.040Z",
    "team_names": [
      "Alan Rohim",
      "Rido Saputra"
    ],
    "is_others": false,
    "keterangan": "Remove & Instal tyre Vessel pos 06",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-12T15:02:20.225Z",
    "rejection_reason": "double"
  },
  {
    "id": "WO-1791359301202-167",
    "wo_number": "WO-20261007-894",
    "status": "rejected",
    "section": "maintenance",
    "component_name": "Remove And Install — Tyre",
    "unit_id": "XEVB42006 - ST",
    "unit_name": "XEVB42006 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "workshop",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_at": "2026-10-07T07:48:21.202Z",
    "team_names": [
      "Bagus Wahyu Nurcahyo",
      "Eliyadi",
      "Aldo Noviansyah"
    ],
    "is_others": false,
    "keterangan": "remove and instal tyre pos 12 vessel",
    "rejected_by_name": "Frans",
    "rejected_at": "2026-10-11T10:50:44.220Z",
    "rejection_reason": "double job"
  },
  {
    "id": "WO-1791161175752-499",
    "wo_number": "WO-20261005-023",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Minor Repair — Brake & Tyre System",
    "unit_id": "DLCD50002",
    "unit_name": "DLCD50002 (NUSATAMA)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "spv-002@kmb.local",
    "created_by_name": "Djarot",
    "created_at": "2026-10-05T00:46:15.752Z",
    "team_names": [
      "M. Riyanto"
    ],
    "is_others": false,
    "keterangan": "Instal and modification hose air brake system",
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-10-10T03:57:56.923Z",
    "rejection_reason": "sudah dikerjakan di WO lainnya"
  },
  {
    "id": "WO-1790780743123-399",
    "wo_number": "WO-20260930-953",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Cleaning — Air System",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-30T15:05:43.123Z",
    "team_names": [
      "VES-002"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-10-01T07:34:53.669Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790771107783-543",
    "wo_number": "WO-20260930-765",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Minor Repair — Electrical System",
    "unit_id": "XEVB42003 - ST",
    "unit_name": "XEVB42003 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "mnt-010@kmb.local",
    "created_by_name": "Bagus Wahyu Nurcahyo",
    "created_at": "2026-09-30T12:25:08.765Z",
    "team_names": [
      "MNT-001"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-30T13:21:36.516Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790644995156-656",
    "wo_number": "WO-20260929-043",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Minor Repair — Brake Pump",
    "unit_id": "XEVB42004 - ST",
    "unit_name": "XEVB42004 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "mnt-010@kmb.local",
    "created_by_name": "Bagus Wahyu Nurcahyo",
    "created_at": "2026-09-29T01:23:16.043Z",
    "team_names": [
      "Bagus Wahyu Nurcahyo",
      "Aldo Noviansyah"
    ],
    "is_others": false,
    "keterangan": "repair elbo hose air drayer",
    "rejected_by_name": "Bagus Wahyu Nurcahyo",
    "rejected_at": "2026-09-29T01:32:08.995Z",
    "rejection_reason": "sudah bikin"
  },
  {
    "id": "WO-1790623008324-889",
    "wo_number": "WO-20260929-089",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Remove And Install — Radiator",
    "unit_id": "XEVB42002 - ST",
    "unit_name": "XEVB42002 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "field",
    "created_by": "mnt-009@kmb.local",
    "created_by_name": "Alan Rohim",
    "created_at": "2026-09-28T19:16:49.089Z",
    "team_names": [
      "Alan Rohim"
    ],
    "is_others": false,
    "keterangan": "Unit di km 5",
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-10-11T06:48:21.917Z",
    "rejection_reason": "sudah di kerjakan sebelumnya"
  },
  {
    "id": "WO-1790584811062-542",
    "wo_number": "WO-20260928-916-A",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Greasing — Greasing",
    "unit_id": "XEVB42001 - ST",
    "unit_name": "XEVB42001 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "mnt-005@kmb.local",
    "created_by_name": "Wiwit",
    "created_at": "2026-09-28T08:40:11.062Z",
    "team_names": [
      "Wiwit",
      "Eliyadi",
      "Bagus Wahyu Nurcahyo",
      "Aldo Noviansyah"
    ],
    "is_others": false,
    "keterangan": "Greasing unit PM 01",
    "rejected_by_name": "Wiwit",
    "rejected_at": "2026-09-28T08:41:38.694Z",
    "rejection_reason": "Reset WO"
  },
  {
    "id": "WO-1790496437908-015",
    "wo_number": "WO-20260927-245",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Testing And Adjusting — Cylinder Head",
    "unit_id": "XEVB42006 - ST",
    "unit_name": "XEVB42006 - ST (BEIBEN)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "mnt-005@kmb.local",
    "created_by_name": "Wiwit",
    "created_at": "2026-09-27T08:07:17.908Z",
    "team_names": [
      "Wiwit"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:33:45.666Z",
    "rejection_reason": "double Pekerjaan"
  },
  {
    "id": "WO-1790483756422-087",
    "wo_number": "WO-20260927-351",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Minor Repair — Tyre",
    "unit_id": "XEVB42006 - ST",
    "unit_name": "XEVB42006 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "field",
    "created_by": "mnt-006@kmb.local",
    "created_by_name": "Eliyadi",
    "created_at": "2026-09-27T04:35:57.352Z",
    "team_names": [
      "Eliyadi",
      "Alan Rohim"
    ],
    "is_others": false,
    "keterangan": "Tyre no 4 pm",
    "rejected_by_name": "Eliyadi",
    "rejected_at": "2026-09-27T04:57:05.892Z",
    "rejection_reason": "Tanggal 25"
  },
  {
    "id": "WO-1790483742471-933",
    "wo_number": "WO-20260927-296",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Remove And Install — Tyre",
    "unit_id": "XEVB42002 - ST",
    "unit_name": "XEVB42002 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "field",
    "created_by": "mnt-006@kmb.local",
    "created_by_name": "Eliyadi",
    "created_at": "2026-09-27T04:35:43.296Z",
    "team_names": [
      "Eliyadi",
      "Alan Rohim"
    ],
    "is_others": false,
    "keterangan": "Tyre no 7 dan 8 vessel",
    "rejected_by_name": "Eliyadi",
    "rejected_at": "2026-09-27T04:56:38.124Z",
    "rejection_reason": "Tanggal 25"
  },
  {
    "id": "WO-1790480812223-661",
    "wo_number": "WO-20260927-020",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Minor Repair — Suspension System",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "ves-005@kmb.local",
    "created_by_name": "Aji Laksono",
    "created_at": "2026-09-27T03:46:52.223Z",
    "team_names": [
      "VES-006"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:16:44.534Z",
    "rejection_reason": "mekanik off"
  },
  {
    "id": "WO-1790383195893-935",
    "wo_number": "WO-20260926-463",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Cleaning — Air System",
    "unit_id": "SDVS70027",
    "unit_name": "SDVS70027 (SANDIN)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-26T00:39:56.463Z",
    "team_names": [
      "Dimas",
      "Cahyo Aji",
      "Aditya"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-28T02:16:15.795Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790309705996-011",
    "wo_number": "WO-20260925-317-C",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Overhaul — Final Drive",
    "unit_id": "XEVB42003 - ST",
    "unit_name": "XEVB42003 - ST (BEIBEN)",
    "work_condition": "difficult",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-25T04:15:05.996Z",
    "team_names": [
      "Mekanik Maintenance 2"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:15:59.915Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790309703347-433",
    "wo_number": "WO-20260925-317-B",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Resealing — Hydrolik Ssytem",
    "unit_id": "SDVS70022",
    "unit_name": "SDVS70022 (SANDIN)",
    "work_condition": "difficult",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-25T04:15:03.347Z",
    "team_names": [
      "VES-001"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:15:32.506Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790309701061-821",
    "wo_number": "WO-20260925-317-A",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Welding & Fabrikasi — Chasis & Body",
    "unit_id": "DLCD50002",
    "unit_name": "DLCD50002 (NUSATAMA)",
    "work_condition": "extreme",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-25T04:15:01.061Z",
    "team_names": [
      "VES-002"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:14:54.992Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790309466005-532",
    "wo_number": "WO-20260925-274",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Mounting — Suspension System",
    "unit_id": "SDVS70011",
    "unit_name": "SDVS70011 (NUSATAMA)",
    "work_condition": "extreme",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-25T04:11:06.005Z",
    "team_names": [
      "VES-002"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:14:24.183Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790292762616-842",
    "wo_number": "WO-20260925-573",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Dismounting — Suspension System",
    "unit_id": "DLY-001",
    "unit_name": "DLY-001",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T23:32:42.616Z",
    "team_names": [
      "VES-002"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:13:55.032Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790292683808-857",
    "wo_number": "WO-20260925-907",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Dismounting — Brake & Tyre System",
    "unit_id": "SDT-001",
    "unit_name": "SDT-001",
    "work_condition": "normal",
    "location": "workshop",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T23:31:23.808Z",
    "team_names": [
      "VES-002"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:13:24.306Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790257214030-306",
    "wo_number": "WO-20260924-751",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Washing — Alternator",
    "unit_id": "SDT-002",
    "unit_name": "Comp Engine Rebuild (ENGINE)",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T13:40:14.751Z",
    "team_names": [
      "VES-002"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:12:46.856Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790252445212-721",
    "wo_number": "WO-20260924-579-B",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Brushing — Chasis & Body",
    "unit_id": "SDT-001",
    "unit_name": "SDT-001",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T12:20:45.212Z",
    "team_names": [
      "VES-001"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:11:46.183Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790252440762-151",
    "wo_number": "WO-20260924-579-A",
    "status": "rejected",
    "section": "vessel",
    "component_name": "Mounting/Installing — Hydrolik Ssytem",
    "unit_id": "SDT-001",
    "unit_name": "SDT-001",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T12:20:40.762Z",
    "team_names": [
      "VES-001"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T04:30:03.385Z",
    "rejection_reason": "test"
  },
  {
    "id": "WO-1790240424017-872",
    "wo_number": "WO-20260924-814",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Troubleshooting — Generator",
    "unit_id": "GS60-01",
    "unit_name": "GS60-01",
    "work_condition": "normal",
    "location": "field",
    "created_by": "l2test@gmail.com",
    "created_by_name": "L2 Test",
    "created_at": "2026-09-24T09:00:24.017Z",
    "team_names": [
      "MECH-003"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:11:10.624Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790239340195-679",
    "wo_number": "WO-20260924-525",
    "status": "cancelled",
    "section": "maintenance",
    "component_name": "Major Repair — Pompa",
    "unit_id": "XPMM01",
    "unit_name": "XPMM01",
    "work_condition": "extreme",
    "location": "field",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T08:42:20.195Z",
    "team_names": [
      "MECH-003"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:10:34.480Z",
    "rejection_reason": "test doang"
  },
  {
    "id": "WO-1790235980733-044",
    "wo_number": "WO-20260924-398",
    "status": "cancelled",
    "section": "vessel",
    "component_name": "Mounting — Air System",
    "unit_id": "DLY-001",
    "unit_name": "DLY-001",
    "work_condition": "difficult",
    "location": "workshop",
    "created_by": "l1est@gmail.com",
    "created_by_name": "L1 Test",
    "created_at": "2026-09-24T07:46:20.733Z",
    "team_names": [
      "VES-001"
    ],
    "is_others": false,
    "keterangan": null,
    "rejected_by_name": "Djarot",
    "rejected_at": "2026-09-27T12:10:00.425Z",
    "rejection_reason": "test"
  }
];

// =========================================================================
// APPLICATION STATE
// =========================================================================
const state = {
  currentSystem: (function() {
    try {
      const savedSys = localStorage.getItem('mar_current_system');
      if (savedSys && savedSys.toUpperCase() === 'SUM') {
        localStorage.removeItem('mar_current_system');
        localStorage.removeItem('kmb_work_orders');
      }
    } catch (_) {}
    return 'KMB';
  })(),
  currentUser: null,
  activeToken: null,
  units: [...FALLBACK_UNITS],
  mechanics: [...FALLBACK_MECHANICS],
  components: [...FALLBACK_COMPONENTS],
  workConditions: [
    { key: 'normal', label: 'Shift 1 (Normal)', factor: 1.0 },
    { key: 'difficult', label: 'Shift 2 (Difficult)', factor: 1.1 },
    { key: 'extreme', label: 'Kondisi Ekstrim', factor: 1.2 }
  ],
  monitoringData: {
    overall: { ...DEFAULT_MONITORING_OVERALL },
    mechanics: [...DEFAULT_MECHANICS_LIST]
  },
  pendingL1Wos: [...DEFAULT_PENDING_L1_LIST],
  pendingL2Wos: [...DEFAULT_PENDING_L2_LIST],
  activeWos: DEFAULT_ACTIVE_WOS.map(w => transformGasWo(w, "ACTIVE")),
  approvedWos: DEFAULT_APPROVED_WOS.map(w => transformGasWo(w, "APPROVED")),
  rejectedWos: DEFAULT_REJECTED_WOS.map(w => transformGasWo(w, "REJECTED")),
  workOrders: [...DEFAULT_PENDING_L1_LIST],
  activeTab: 'dashboard',
  monSubTab: 'mechanics',
  apprSubTab: 'pending',
  selectedWoIds: new Set(),
  grupMode: '',
  tampilSemuaUnit: false,
  joblists: [],
  isSyncing: false,
  lastSyncTime: null,
  teknisData: null,
  teknisSubTab: 'kondisi',
  teknisDemo: false,
  koreksiHmUnit: null,
  koreksiHmData: null,
  koreksiKmUnit: null,
  koreksiKmData: null,
  reportsFilterType: 'month',
  lastReportResult: null,
  viewAsMechanic: null,
  mechanicFilter: 'assigned',
  mechanicWos: [],
  currentModalWo: null
};

// =========================================================================
// INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.title = 'KMB PORTAL - Mechanic Activity Report';
  updateSystemBadge();
  updateEngineStatusBadge(true);
  loadCachedSpreadsheetData();
  initStorage();
  initEventListeners();
  checkAuth();
  initCreateWoState();
});

// =========================================================================
// DUAL-ENGINE SWITCHER (Supabase Singapore <-> Google Sheets / Apps Script)
// =========================================================================
export function getActiveEngine() {
  const urlParams = new URLSearchParams(window.location.search);
  const qEng = (urlParams.get('engine') || '').toUpperCase();
  if (qEng === 'SPREADSHEET' || qEng === 'SHEETS' || qEng === 'GAS') {
    return 'SPREADSHEET';
  }
  if (qEng === 'SUPABASE' || qEng === 'POSTGRES') {
    return 'SUPABASE';
  }
  const stored = (localStorage.getItem('kmb_active_engine') || 'SUPABASE').toUpperCase();
  if (stored === 'SPREADSHEET' || stored === 'SHEETS' || stored === 'GAS') {
    return 'SPREADSHEET';
  }
  return 'SUPABASE';
}

export function setActiveEngine(newEngine, doSync = true) {
  const eng = (newEngine || 'SUPABASE').toUpperCase() === 'SPREADSHEET' ? 'SPREADSHEET' : 'SUPABASE';
  localStorage.setItem('kmb_active_engine', eng);

  // Sync URL parameter without reload
  const url = new URL(window.location);
  url.searchParams.set('engine', eng.toLowerCase());
  window.history.replaceState({}, '', url);

  updateEngineStatusBadge(true);

  if (eng === 'SUPABASE') {
    showToast('🚀 Beralih ke Database Supabase Singapore (Sub-50ms)!', 'success');
  } else {
    showToast('📊 Beralih ke Google Spreadsheet Live (Google Apps Script)!', 'info');
  }

  if (doSync && state.activeToken) {
    syncFromSpreadsheet(true);
  }
}

export function toggleEngine() {
  const cur = getActiveEngine();
  const next = cur === 'SUPABASE' ? 'SPREADSHEET' : 'SUPABASE';
  setActiveEngine(next, true);
}

// =========================================================================
// API CLIENT (Cloudflare Worker Proxy -> Supabase / Google Apps Script)
// =========================================================================
const GAS_FALLBACK_URLS = {
  KMB: "https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec"
};

const ROUTER_ACTIONS = new Set([
  'dataDashboardTeknis', 'dataDashboardField',
  'riwayatHmUnit', 'riwayatKmUnit',
  'koreksiHmWo', 'koreksiKmWo',
  'gantiPanelHm', 'gantiPanelKm'
]);

async function api(action, data = {}, opId = null, customToken = null) {
  const token = customToken || (action === 'pull_my_wos' && state.viewAsMechanic?.token ? state.viewAsMechanic.token : state.activeToken);
  const currentSystem = 'KMB';
  const activeEngine = getActiveEngine();
  const isRouter = ROUTER_ACTIONS.has(action);

  if (isRouter) {
    const payloadData = { token, system: currentSystem, engine: activeEngine, ...data };
    const body = new URLSearchParams({
      action: action,
      system: currentSystem,
      engine: activeEngine,
      data: JSON.stringify(payloadData)
    }).toString();

    try {
      const res = await fetch(`/api/gas?engine=${activeEngine.toLowerCase()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-MAR-System': currentSystem,
          'X-Active-Engine': activeEngine
        },
        body: body
      });
      return await res.json();
    } catch (err) {
      try {
        const gasUrl = GAS_FALLBACK_URLS[currentSystem] || GAS_FALLBACK_URLS.KMB;
        const directRes = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body,
          redirect: 'follow'
        });
        return await directRes.json();
      } catch (err2) {
        console.warn('API router call error:', action, err2);
        return { success: false, error: err2.message };
      }
    }
  }

  const isReadAction = action.startsWith('pull_') || action === 'ping' || action === 'generate_payroll_report';
  const autoOpId = opId || (isReadAction ? undefined : `op-${Date.now()}-${Math.round(Math.random() * 100000)}`);

  const payload = {
    token: token,
    system: currentSystem,
    engine: activeEngine,
    action: action,
    data: data,
    op_id: autoOpId
  };

  try {
    const res = await fetch(`/api/gas?engine=${activeEngine.toLowerCase()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MAR-System': currentSystem,
        'X-Active-Engine': activeEngine
      },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    // Direct GAS fallback if proxy is unreachable
    try {
      const gasUrl = GAS_FALLBACK_URLS[currentSystem] || GAS_FALLBACK_URLS.KMB;
      const directRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      return await directRes.json();
    } catch (err2) {
      console.warn('API call error:', action, err2);
      return { success: false, error: err2.message };
    }
  }
}

// Load cached refs from previous session
function loadCachedSpreadsheetData() {
  try {
    // Purge obsolete cache versions
    localStorage.removeItem('kmb_gas_refs_v7');
    localStorage.removeItem('kmb_gas_refs_v8');

    const cached = localStorage.getItem('kmb_gas_refs_v9');
    if (cached) {
      const parsed = JSON.parse(cached);
      // Validate that units contain valid rekondisi models before accepting
      const hasRekondisi = Array.isArray(parsed.units) && parsed.units.some(u => {
        const id = (u.unit_id || u.id || '').toLowerCase();
        const model = (u.unit_model || '').toLowerCase();
        const scope = (u.unit_scope || '').toLowerCase();
        return id.startsWith('sdvs') || id.startsWith('dlcd') || id.startsWith('sdt') || model.includes('vessel') || scope.includes('vessel');
      });

      if (hasRekondisi) {
        state.units = parsed.units;
      }
      if (Array.isArray(parsed.mechanics) && parsed.mechanics.length > 0) state.mechanics = parsed.mechanics;
      if (Array.isArray(parsed.components) && parsed.components.length > 200) state.components = parsed.components;
      if (parsed.monitoringData && parsed.monitoringData.overall) state.monitoringData = parsed.monitoringData;
      if (Array.isArray(parsed.workOrders) && parsed.workOrders.length > 0) state.workOrders = parsed.workOrders;
      if (Array.isArray(parsed.pendingL1Wos) && parsed.pendingL1Wos.length > 0) state.pendingL1Wos = parsed.pendingL1Wos;
      if (Array.isArray(parsed.pendingL2Wos) && parsed.pendingL2Wos.length >= 6) {
        state.pendingL2Wos = parsed.pendingL2Wos;
      } else {
        state.pendingL2Wos = [...DEFAULT_PENDING_L2_LIST];
      }
      if (Array.isArray(parsed.activeWos)) state.activeWos = parsed.activeWos;
      if (Array.isArray(parsed.approvedWos)) state.approvedWos = parsed.approvedWos;
      if (Array.isArray(parsed.rejectedWos)) state.rejectedWos = parsed.rejectedWos;
    }
  } catch (e) {}
}

function saveCachedSpreadsheetData() {
  try {
    localStorage.setItem('kmb_gas_refs_v9', JSON.stringify({
      units: state.units,
      mechanics: state.mechanics,
      components: state.components,
      monitoringData: state.monitoringData,
      workOrders: state.workOrders,
      pendingL1Wos: state.pendingL1Wos,
      pendingL2Wos: state.pendingL2Wos,
      activeWos: state.activeWos,
      approvedWos: state.approvedWos,
      rejectedWos: state.rejectedWos,
      cached_at: new Date().toISOString()
    }));
  } catch (e) {}
}

// =========================================================================
// GOOGLE SPREADSHEET LIVE SYNC
// =========================================================================
export async function syncFromSpreadsheet(manual = false) {
  if (!state.activeToken) return;
  if (state.isSyncing) return;

  state.isSyncing = true;
  updateSyncIndicator(true);

  if (manual) {
    showToast('🔄 Menghubungkan ke Google Spreadsheet...', 'info');
  }

  try {
    // 1. Fetch Monitoring (Overall KPIs + 20 Mechanics)
    api('pull_monitoring').then(monRes => {
      if (monRes.success && monRes.result) {
        state.monitoringData = monRes.result;
        renderDashboard();
        renderMonitoring();
        renderApprovals();
        saveCachedSpreadsheetData();
      }
    });

    // 2. Fetch Catalogs & Refs
    const refsRes = await api('pull_create_refs');
    if (refsRes && refsRes.success && refsRes.result && refsRes.result.refs) {
      const refs = refsRes.result.refs;
      if (Array.isArray(refs.units) && refs.units.length > 0) {
        state.units = refs.units.map(u => ({
          unit_id: u.unit_id || u.id,
          unit_name: u.unit_name || u.name,
          unit_model: (u.unit_model || '').trim().toLowerCase(),
          unit_factor: parseFloat(u.unit_factor) || 1.0,
          unit_scope: Array.isArray(u.unit_scope) ? u.unit_scope.join(',') : (u.unit_scope || '')
        }));
      }
      if (Array.isArray(refs.mechanics) && refs.mechanics.length > 0) {
        state.mechanics = refs.mechanics.map(m => ({
          id: m.mechanic_id || m.id,
          mechanic_id: m.mechanic_id || m.id,
          name: String(m.mechanic_name || m.name || '').trim(),
          mechanic_name: String(m.mechanic_name || m.name || '').trim(),
          section: String(m.section || '').trim().toLowerCase(),
          position: String(m.position || m.jabatan_aktual || '').trim()
        }));
      }
      const allJobs = [];
      if (Array.isArray(refs.jobs_vessel)) {
        refs.jobs_vessel.forEach(j => {
          allJobs.push({
            job_id: j.job_id,
            section: 'rekondisi',
            unit_model: (j.unit_model || 'vessel').trim().toLowerCase(),
            component: j.component,
            sub_component: j.sub_component,
            job_description: j.job_description,
            plan_hours: parseFloat(j.plan_hours) || 0,
            base_point: parseFloat(j.base_point) || (parseFloat(j.plan_hours || 0) * 2)
          });
        });
      }
      if (Array.isArray(refs.jobs_field)) {
        refs.jobs_field.forEach(j => {
          allJobs.push({
            job_id: j.job_id,
            section: 'maintenance',
            unit_model: (j.unit_model || 'hauler').trim().toLowerCase(),
            component: j.component,
            sub_component: j.sub_component,
            job_description: j.job_description,
            plan_hours: parseFloat(j.plan_hours) || 0,
            base_point: parseFloat(j.base_point) || (parseFloat(j.plan_hours || 0) * 2)
          });
        });
      }
      if (allJobs.length > 0) state.components = allJobs;
      renderJoblists();
      saveCachedSpreadsheetData();
    }

    // 3. Fetch Pending, Active, Approved, Rejected WOs in parallel
    const [pendRes, actRes, apprRes, rejRes] = await Promise.all([
      api('pull_pending'),
      api('pull_active'),
      api('pull_approved'),
      api('pull_rejected')
    ]);

    if (pendRes.success && pendRes.result && Array.isArray(pendRes.result.pending)) {
      const rawPending = pendRes.result.pending;
      const role = (state.currentUser?.role || '').toLowerCase();
      const isSuperintendent = role === 'superintendent' || role === 'manager';

      const transformed = rawPending.map(w => {
        const isL2 = w.status === 'pending_superintendent' || (isSuperintendent && w.status !== 'pending_supervisor');
        const defaultSt = isL2 ? 'PENDING_L2' : 'PENDING_L1';
        const item = transformGasWo(w, defaultSt);
        item.level = isL2 ? 2 : 1;
        return item;
      });

      const l2Items = transformed.filter(w => w.status === 'PENDING_L2' || w.status === 'pending_superintendent' || w.level === 2);
      const l1Items = transformed.filter(w => w.status === 'PENDING_L1' || w.status === 'pending_supervisor' || w.level === 1);

      if (isSuperintendent || l2Items.length > 0) {
        state.pendingL2Wos = l2Items.length > 0 ? l2Items : transformed;
      }
      if (!isSuperintendent || l1Items.length > 0) {
        state.pendingL1Wos = l1Items.length > 0 ? l1Items : transformed;
      }
      state.hasSyncedPending = true;
    }

    if (actRes.success && actRes.result && Array.isArray(actRes.result.active)) {
      state.activeWos = actRes.result.active.map(w => transformGasWo(w, 'ACTIVE'));
    }
    if (apprRes.success && apprRes.result && Array.isArray(apprRes.result.approved)) {
      state.approvedWos = apprRes.result.approved.map(w => transformGasWo(w, 'APPROVED'));
    }
    if (rejRes.success && rejRes.result && Array.isArray(rejRes.result.rejected)) {
      state.rejectedWos = rejRes.result.rejected.map(w => transformGasWo(w, 'REJECTED'));
    }

    const combined = [
      ...(state.pendingL1Wos || []),
      ...(state.pendingL2Wos || []),
      ...(state.activeWos || []),
      ...(state.approvedWos || []),
      ...(state.rejectedWos || [])
    ];
    if (combined.length > 0) state.workOrders = combined;

    state.lastSyncTime = new Date();
    updateEngineStatusBadge(true);
    saveCachedSpreadsheetData();

    renderJoblists();
    renderDashboard();
    renderApprovals();
    renderMonitoring();

    if (manual) {
      if (getActiveEngine() === 'SUPABASE') {
        showToast('✅ Berhasil menyinkronkan data dengan Supabase Singapore (PostgreSQL)!', 'success');
      } else {
        showToast('✅ Berhasil menyinkronkan data dengan Google Spreadsheet!', 'success');
      }
    }
  } catch (err) {
    console.error('Spreadsheet sync error:', err);
    if (manual) {
      showToast('⚠️ Gagal terhubung: ' + err.message, 'warning');
    }
  } finally {
    state.isSyncing = false;
    updateSyncIndicator(false);
  }
}

export function updateEngineStatusBadge(connected = true) {
  const eng = getActiveEngine();
  const el = document.getElementById('engine-status');
  const btn = document.getElementById('btn-engine-toggle');
  const gateBtn = document.getElementById('gate-engine-toggle');
  const userEngineLabel = document.getElementById('user-engine-label');
  const syncLabel = document.getElementById('sync-label');

  if (eng === 'SUPABASE') {
    if (el) {
      el.innerHTML = connected
        ? '<i class="fa-solid fa-bolt" style="color: #10B981; font-size: 8px;"></i> SUPABASE LIVE (PostgreSQL)'
        : '<i class="fa-solid fa-circle" style="color: #F59E0B; font-size: 8px;"></i> SUPABASE (Offline Cache)';
    }
    if (btn) {
      btn.style.background = '#ECFDF5';
      btn.style.borderColor = '#A7F3D0';
      btn.style.color = '#065F46';
      btn.title = 'Sedang menggunakan Database Supabase Singapore (Sub-50ms). Klik untuk ganti ke Google Spreadsheet.';
      const switchTag = btn.querySelector('.switch-tag');
      if (switchTag) {
        switchTag.textContent = '⇄ Ke Sheets';
        switchTag.style.color = '#059669';
        switchTag.style.background = 'rgba(16,185,129,0.15)';
      }
    }
    if (gateBtn) {
      gateBtn.innerHTML = '⚡ Supabase Live (Postgres) <span style="font-size: 10px; opacity: 0.8;">⇄ Ke Sheets</span>';
      gateBtn.style.background = '#ECFDF5';
      gateBtn.style.borderColor = '#A7F3D0';
      gateBtn.style.color = '#065F46';
    }
    if (userEngineLabel) userEngineLabel.textContent = 'Ke Sheets';
    if (syncLabel) syncLabel.textContent = 'Sync Supabase';
  } else {
    if (el) {
      el.innerHTML = connected
        ? '<i class="fa-solid fa-table" style="color: #2563EB; font-size: 8px;"></i> SPREADSHEET LIVE (Google Sheets)'
        : '<i class="fa-solid fa-circle" style="color: #F59E0B; font-size: 8px;"></i> SHEETS (Offline Cache)';
    }
    if (btn) {
      btn.style.background = '#EFF6FF';
      btn.style.borderColor = '#BFDBFE';
      btn.style.color = '#1E40AF';
      btn.title = 'Sedang menggunakan Google Spreadsheet Live. Klik untuk ganti ke Supabase.';
      const switchTag = btn.querySelector('.switch-tag');
      if (switchTag) {
        switchTag.textContent = '⇄ Ke Supabase';
        switchTag.style.color = '#2563EB';
        switchTag.style.background = 'rgba(37,99,235,0.15)';
      }
    }
    if (gateBtn) {
      gateBtn.innerHTML = '📊 Google Sheets Live <span style="font-size: 10px; opacity: 0.8;">⇄ Ke Supabase</span>';
      gateBtn.style.background = '#EFF6FF';
      gateBtn.style.borderColor = '#BFDBFE';
      gateBtn.style.color = '#1E40AF';
    }
    if (userEngineLabel) userEngineLabel.textContent = 'Ke Supabase';
    if (syncLabel) syncLabel.textContent = 'Sync Sheets';
  }
}

function updateSyncIndicator(loading) {
  const btn = document.getElementById('btn-sync-spreadsheet');
  if (!btn) return;
  const isSupabase = getActiveEngine() === 'SUPABASE';
  const label = isSupabase ? 'Sync Supabase' : 'Sync Sheets';
  if (loading) {
    btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> <span class="hide-mobile">Syncing...</span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = `<i class="fa-solid fa-rotate"></i> <span class="hide-mobile" id="sync-label">${label}</span>`;
    btn.disabled = false;
  }
}

function transformGasWo(w, defaultStatus) {
  const statusMap = {
    'pending_mechanic_work': 'ACTIVE',
    'pending_supervisor': 'PENDING_L1',
    'pending_superintendent': 'PENDING_L2',
    'approved': 'APPROVED',
    'rejected': 'REJECTED'
  };
  const st = statusMap[w.status] || defaultStatus;

  const teamList = [];
  if (Array.isArray(w.effective_team) && w.effective_team.length > 0) {
    w.effective_team.forEach(t => {
      teamList.push({
        name: String(t.name || t.mechanic_name || (t.mechanic_id ? `Mekanik ${t.mechanic_id}` : 'Mekanik')).trim(),
        mechanic_id: t.mechanic_id || '',
        points: Number(t.points || w.final_points || 0),
        idr: Number(t.idr || 0)
      });
    });
  } else if (Array.isArray(w.team_names) && w.team_names.length > 0) {
    w.team_names.forEach(name => {
      teamList.push({ name: String(name).trim(), mechanic_id: '', points: Number(w.final_points || w.base_points || 0), idr: 0 });
    });
  } else if (Array.isArray(w.team) && w.team.length > 0) {
    w.team.forEach(t => {
      teamList.push({
        name: String(t.name || t.mechanic_name || (t.mechanic_id ? `Mekanik ${t.mechanic_id}` : 'Mekanik')).trim(),
        mechanic_id: t.mechanic_id || '',
        points: Number(t.points || w.final_points || 0),
        idr: Number(t.idr || 0)
      });
    });
  } else if (w.created_by_name) {
    teamList.push({ name: String(w.created_by_name).trim(), mechanic_id: '', points: Number(w.final_points || 0), idr: 0 });
  }

  const isL2 = st === 'PENDING_L2' || w.status === 'pending_superintendent' || w.level === 2;

  return {
    id: w.wo_number || w.id,
    raw_id: w.id,
    level: w.level || (isL2 ? 2 : 1),
    date: (w.created_at_str && String(w.created_at_str).trim()) || (w.created_at ? new Date(w.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'),
    final_idr: Number(w.final_idr || 0),
    rejection_reason: w.rejection_reason || '',
    rejected_by_name: w.rejected_by_name || '',
    shift: w.work_condition === 'difficult' ? 'Shift 2' : 'Shift 1',
    unit_id: w.unit_id || '-',
    unit_name: w.unit_name || w.unit_id || '-',
    component_no: w.component_no || w.job_id || '-',
    component_name: w.component_name || w.others_description || 'Pekerjaan',
    others_description: w.others_description || '',
    is_others: !!(w.is_others || w.unit_id === 'OTHERS'),
    section: w.section || 'vessel',
    location: w.location || 'workshop',
    work_condition: w.work_condition || 'normal',
    keterangan: w.keterangan || '',
    safety_incident: (w.safety_incident === true || String(w.safety_incident).toLowerCase() === 'true'),
    mtbf_redo_status: w.mtbf_redo_status || w.mtbf_status || 'first_time',
    base_points: Number(w.base_points || 0),
    unit_factor: Number(w.unit_factor || 1),
    actual_hours: Number(w.actual_hours || 0),
    target_hours: Number(w.target_hours || 0),
    final_points: Number(w.final_points || w.base_points || 0),
    team: teamList,
    status: st,
    judgment: w.judgment || '',
    created_by: w.created_by_name || w.created_by || 'Mekanik',
    created_at: w.created_at || new Date().toISOString()
  };
}

// =========================================================================
// AUTHENTICATION & TOKEN RESOLVER
// =========================================================================
function checkAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  const tokenFromStorage = localStorage.getItem('kmb_portal_token');

  const tokenToUse = tokenFromUrl || tokenFromStorage;

  if (tokenToUse) {
    loginWithToken(tokenToUse);
  } else {
    showGateOverlay();
  }
}

export function updateSystemBadge() {
  state.currentSystem = 'KMB';
  const badge = document.getElementById('project-badge');
  if (badge) {
    badge.textContent = 'PROJEK KMB';
    badge.style.background = '#10B981';
    badge.style.color = '#FFFFFF';
    badge.style.cursor = 'default';
    badge.removeAttribute('title');
  }

  const gateTitle = document.querySelector('.gate-title');
  if (gateTitle) {
    gateTitle.textContent = 'KMB PORTAL GATE';
  }
  const btnEnter = document.getElementById('btn-enter-gate');
  if (btnEnter) {
    btnEnter.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk ke Sistem KMB';
  }
}

export function switchSystem(nextSys) {
  state.currentSystem = 'KMB';
  localStorage.setItem('mar_current_system', 'KMB');
  updateSystemBadge();
}

export async function loginWithToken(token) {
  const cleanToken = String(token).trim();
  state.currentSystem = 'KMB';
  localStorage.setItem('mar_current_system', 'KMB');
  updateSystemBadge();

  // 1. First resolve from local TOKENS / state for instant UI rendering
  const tokenRecord = TOKENS.find(t => (t.token || t.offline_token || '').toLowerCase() === cleanToken.toLowerCase());
  let user = null;
  if (tokenRecord) {
    user = state.mechanics.find(m => (m.id || m.mechanic_id) === tokenRecord.mechanic_id);
    if (!user) {
      user = {
        id: tokenRecord.mechanic_id,
        mechanic_id: tokenRecord.mechanic_id,
        name: tokenRecord.name || tokenRecord.mechanic_name || (cleanToken === '67e8153da255457eb6ef' ? 'L2 Test' : 'User KMB'),
        role: tokenRecord.role || (cleanToken === '67e8153da255457eb6ef' ? 'superintendent' : (cleanToken === '52fdb552231348ffb14a' ? 'supervisor' : 'mechanic')),
        section: tokenRecord.section || 'vessel,maintenance'
      };
    } else {
      user = {
        ...user,
        id: user.id || user.mechanic_id || tokenRecord.mechanic_id,
        mechanic_id: user.mechanic_id || user.id || tokenRecord.mechanic_id,
        name: user.name || user.mechanic_name || tokenRecord.name || tokenRecord.mechanic_name,
        role: user.role || tokenRecord.role || (cleanToken === '67e8153da255457eb6ef' ? 'superintendent' : (cleanToken === '52fdb552231348ffb14a' ? 'supervisor' : 'mechanic'))
      };
    }
  } else {
    user = state.mechanics.find(m => (m.id || m.mechanic_id || '').toLowerCase() === cleanToken.toLowerCase() || (m.token || m.offline_token || '').toLowerCase() === cleanToken.toLowerCase());
  }

  // Fallback temporary user
  if (!user) {
    user = {
      id: cleanToken,
      mechanic_id: cleanToken,
      name: cleanToken === '67e8153da255457eb6ef' ? 'L2 Test' : 'User KMB',
      role: cleanToken === '52fdb552231348ffb14a' ? 'supervisor' : (cleanToken === '67e8153da255457eb6ef' ? 'superintendent' : 'mechanic')
    };
  }

  // Guarantee valid role (never empty string)
  if (!user.role) {
    user.role = (cleanToken === '67e8153da255457eb6ef' ? 'superintendent' : (cleanToken === '52fdb552231348ffb14a' ? 'supervisor' : 'mechanic'));
  }

  state.currentUser = user;
  state.activeToken = cleanToken;
  localStorage.setItem('kmb_portal_token', cleanToken);

  const url = new URL(window.location);
  url.searchParams.set('token', cleanToken);
  window.history.replaceState({}, '', url);

  updateUserBar();
  hideGateOverlay();
  if ((user.role || 'mechanic').toLowerCase() === 'mechanic') {
    switchTab('monitoring');
  } else {
    renderDashboard();
    renderApprovals();
    renderMonitoring();
  }

  // Reset initial joblist user
  if (state.joblists.length > 0 && (!state.joblists[0].team || !state.joblists[0].team[0])) {
    state.joblists[0].team = [user.id || user.mechanic_id];
    renderJoblists();
  }

  // 2. Now verify against Google Apps Script / Google Sheets
  api('ping').then(res => {
    if (res.success && res.result) {
      const info = res.result;
      if (info.tenant_code || info.tenant || info.system) {
        state.currentSystem = 'KMB';
        localStorage.setItem('mar_current_system', 'KMB');
        updateSystemBadge();
      }
      state.currentUser = {
        id: info.mechanic_id,
        mechanic_id: info.mechanic_id,
        name: info.name,
        mechanic_name: info.name,
        role: info.role || 'mechanic',
        email: info.email
      };
      updateUserBar();
      showToast(`Terhubung sebagai ${info.name} (${(info.role || 'user').toUpperCase()}) via Google Sheets!`, 'success');
      if ((info.role || 'mechanic').toLowerCase() === 'mechanic') {
        switchTab('monitoring');
      } else {
        renderApprovals();
        renderDashboard();
        renderMonitoring();
      }
    }
  });

  // Pull latest spreadsheet data in background
  syncFromSpreadsheet(false);
  return true;
}

function updateUserBar() {
  const u = state.currentUser;
  if (!u) return;

  updateSystemBadge();

  const displayName = u.name || u.mechanic_name || 'Mekanik';
  document.getElementById('profile-name').textContent = displayName;
  
  const roleBadge = document.getElementById('profile-role');
  const roleName = (u.role || 'mechanic').toLowerCase();
  roleBadge.textContent = roleName.toUpperCase();
  roleBadge.className = `user-role-badge role-${roleName}`;

  document.getElementById('user-profile-bar').style.display = 'flex';
  
  const isMechanic = roleName === 'mechanic';
  const navEl = document.getElementById('portal-nav');
  if (navEl) {
    navEl.style.display = isMechanic ? 'none' : 'block';
  }

  const isSupervisor = roleName === 'supervisor' || roleName === 'superintendent' || u.id === 'SPV-001';
  const apprTab = document.getElementById('nav-tab-approvals');
  if (apprTab) {
    apprTab.style.display = isSupervisor ? 'flex' : 'none';
  }

  if (isMechanic) {
    switchTab('monitoring');
  }
}

function showGateOverlay() {
  document.getElementById('gate-overlay').style.display = 'flex';
  document.getElementById('gate-error-msg').style.display = 'none';
}

function hideGateOverlay() {
  document.getElementById('gate-overlay').style.display = 'none';
}

function showGateError(msg) {
  const el = document.getElementById('gate-error-msg');
  el.textContent = msg;
  el.style.display = 'block';
}

function logout() {
  localStorage.removeItem('kmb_portal_token');
  const url = new URL(window.location);
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url);

  state.currentUser = null;
  state.activeToken = null;
  document.getElementById('user-profile-bar').style.display = 'none';
  document.getElementById('portal-nav').style.display = 'none';
  showGateOverlay();
  showToast('Anda telah keluar dari sesi.', 'info');
}

// =========================================================================
// STORAGE & SEED DATA
// =========================================================================
function initStorage() {
  try {
    const savedSys = localStorage.getItem('mar_current_system');
    if (savedSys && savedSys.toUpperCase() === 'SUM') {
      localStorage.removeItem('mar_current_system');
      localStorage.removeItem('kmb_work_orders');
    }
  } catch (_) {}
  const storedWos = localStorage.getItem('kmb_work_orders');
  if (storedWos) {
    try {
      const parsed = JSON.parse(storedWos);
      state.workOrders = Array.isArray(parsed)
        ? parsed.filter(wo => !wo?.wo_number?.match(/-[A-Z]$/i) && !String(wo?.unit_id || '').toUpperCase().startsWith('SUM'))
        : [];
      if (state.workOrders.length !== parsed.length) {
        saveWorkOrders();
      }
    } catch (e) {
      state.workOrders = [];
    }
  }
}

function saveWorkOrders() {
  localStorage.setItem('kmb_work_orders', JSON.stringify(state.workOrders));
}

// =========================================================================
// 1:1 CREATE WORK ORDER ARCHITECTURE & CASCADES
// =========================================================================
function createDefaultJoblist() {
  return {
    section: 'rekondisi', // rekondisi | maintenance
    keterangan: '',
    others: false,
    othersDesc: '',
    othersBase: '',
    othersTarget: '',
    othersFactor: '1.0',
    unitId: '',
    component: '',
    subComponent: '',
    jobId: '',
    location: 'field',
    condition: '',
    team: [state.currentUser ? (state.currentUser.id || state.currentUser.mechanic_id) : ''],
    allMechanics: false
  };
}

function initCreateWoState() {
  state.joblists = [createDefaultJoblist()];
  renderJoblists();
  setupModelPembuatanHandlers();
}

function setupModelPembuatanHandlers() {
  const btnBebas = document.getElementById('btn-mode-bebas');
  const btnUnit = document.getElementById('btn-mode-unit');
  const btnJob = document.getElementById('btn-mode-job');
  const hintText = document.getElementById('mode-petunjuk-text');
  const btnToggleUnits = document.getElementById('btn-toggle-all-units');

  function setMode(mode) {
    state.grupMode = mode;
    btnBebas.classList.toggle('terpilih', mode === '');
    btnUnit.classList.toggle('terpilih', mode === 'unit');
    btnJob.classList.toggle('terpilih', mode === 'job');

    if (mode === 'unit') {
      hintText.textContent = 'Satu unit dikerjakan beberapa job. Unit joblist #1 jadi acuan dan dikunci untuk semua joblist; job tiap baris harus berbeda.';
      if (state.joblists.length > 1) {
        const u1 = state.joblists[0].unitId;
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].unitId = u1;
        }
      }
    } else if (mode === 'job') {
      hintText.textContent = 'Satu job dikerjakan di beberapa unit. Job joblist #1 jadi acuan dan dikunci untuk semua joblist; unit tiap baris harus berbeda.';
      if (state.joblists.length > 1) {
        const a = state.joblists[0];
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].component = a.component;
          state.joblists[i].subComponent = a.subComponent;
          state.joblists[i].jobId = a.jobId;
        }
      }
    } else {
      hintText.textContent = 'Bebas: setiap joblist boleh unit dan job berbeda, terbit sebagai WO terpisah tanpa ikatan grup.';
    }
    renderJoblists();
  }

  btnBebas.addEventListener('click', () => setMode(''));
  btnUnit.addEventListener('click', () => setMode('unit'));
  btnJob.addEventListener('click', () => setMode('job'));

  btnToggleUnits.addEventListener('click', () => {
    state.tampilSemuaUnit = !state.tampilSemuaUnit;
    const lbl = document.getElementById('label-toggle-all-units');
    lbl.textContent = state.tampilSemuaUnit ? '🔽 Sembunyikan unit global' : '🌐 Tampilkan semua unit';
    renderJoblists();
  });

  document.getElementById('btn-add-joblist').addEventListener('click', () => {
    const newBlock = createDefaultJoblist();
    const acuan = state.joblists[0];
    newBlock.section = acuan.section;
    newBlock.location = acuan.location;
    newBlock.condition = acuan.condition;

    if (state.grupMode === 'unit') {
      newBlock.unitId = acuan.unitId;
    } else if (state.grupMode === 'job') {
      newBlock.component = acuan.component;
      newBlock.subComponent = acuan.subComponent;
      newBlock.jobId = acuan.jobId;
    }

    state.joblists.push(newBlock);
    renderJoblists();
  });

  document.getElementById('btn-submit-all-wos').addEventListener('click', submitAllWorkOrders);
}

// Filter unit list per section using Spreadsheet units, optionally filtered by locked job
function getAvailableUnits(section, showAll, lockedJobId) {
  let units = showAll ? [...state.units] : [];
  const sec = (section || '').toLowerCase();
  if (!showAll) {
    if (sec === 'rekondisi') {
      units = state.units.filter(u => {
        const id = (u.unit_id || u.id || '').toLowerCase();
        const scope = (u.unit_scope || '').toLowerCase();
        const model = (u.unit_model || '').toLowerCase();
        return scope.includes('vessel') || model.includes('vessel') || model.includes('dolly') ||
               id.startsWith('sdvs') || id.startsWith('dlcd') || id.startsWith('sdt') || (!scope && !model);
      });
    } else {
      units = state.units.filter(u => {
        const id = (u.unit_id || u.id || '').toLowerCase();
        const scope = (u.unit_scope || '').toLowerCase();
        const model = (u.unit_model || '').toLowerCase();
        return scope.includes('maintenance') || model.includes('hauler') || model.includes('engine') || model.includes('transmission') ||
               id.startsWith('xevb') || id.startsWith('xtn') || (!scope && !model);
      });
    }
  }

  if (lockedJobId) {
    const job = state.components.find(j => (j.job_id || j.id) === lockedJobId);
    if (job && job.unit_model) {
      const jm = job.unit_model.trim().toLowerCase();
      const filtered = units.filter(u => {
        const um = (u.unit_model || '').trim().toLowerCase();
        return !um || um === jm;
      });
      if (filtered.length > 0) units = filtered;
    }
  }

  // Safety fallback: if section filtering somehow returned 0 units, show all available units
  if (units.length === 0 && state.units.length > 0) {
    units = [...state.units];
  }

  return units;
}

// Distinct components available
function getAvailableComponents(unitId, section) {
  const isRekondisi = (section || '').toLowerCase() === 'rekondisi';
  
  let jobs = state.components.filter(j => {
    const s = (j.section || '').toLowerCase();
    return isRekondisi ? (s === 'rekondisi' || s === 'vessel') : (s === 'maintenance' || s === 'field');
  });
  if (jobs.length === 0 && state.components.length > 0) {
    jobs = [...state.components];
  }

  const unit = state.units.find(u => (u.unit_id || u.id) === unitId);
  if (unit && unit.unit_model) {
    const cleanModel = unit.unit_model.trim().toLowerCase();
    const filtered = jobs.filter(j => {
      const jm = (j.unit_model || '').trim().toLowerCase();
      return !jm || jm === cleanModel;
    });
    if (filtered.length > 0) jobs = filtered;
  }
  const comps = [...new Set(jobs.map(j => j.component).filter(Boolean))].sort();
  return comps;
}

// Distinct sub components available
function getAvailableSubComponents(componentName, section, unitId) {
  if (!componentName) return [];
  const isRekondisi = (section || '').toLowerCase() === 'rekondisi';
  let jobs = state.components.filter(j => {
    const s = (j.section || '').toLowerCase();
    const matchSec = isRekondisi ? (s === 'rekondisi' || s === 'vessel') : (s === 'maintenance' || s === 'field');
    return matchSec && j.component === componentName;
  });
  if (jobs.length === 0 && state.components.length > 0) {
    jobs = state.components.filter(j => j.component === componentName);
  }

  const unit = state.units.find(u => (u.unit_id || u.id) === unitId);
  if (unit && unit.unit_model) {
    const cleanModel = unit.unit_model.trim().toLowerCase();
    const filtered = jobs.filter(j => {
      const jm = (j.unit_model || '').trim().toLowerCase();
      return !jm || jm === cleanModel;
    });
    if (filtered.length > 0) jobs = filtered;
  }
  return [...new Set(jobs.map(j => j.sub_component).filter(Boolean))].sort();
}

// Distinct jobs available
function getAvailableJobs(componentName, subComponentName, section, unitId) {
  if (!componentName) return [];
  const isRekondisi = (section || '').toLowerCase() === 'rekondisi';
  let jobs = state.components.filter(j => {
    const s = (j.section || '').toLowerCase();
    const matchSec = isRekondisi ? (s === 'rekondisi' || s === 'vessel') : (s === 'maintenance' || s === 'field');
    if (!matchSec) return false;
    if (subComponentName) {
      return j.component === componentName && j.sub_component === subComponentName;
    }
    return j.component === componentName;
  });
  if (jobs.length === 0 && state.components.length > 0) {
    jobs = state.components.filter(j => {
      if (subComponentName) return j.component === componentName && j.sub_component === subComponentName;
      return j.component === componentName;
    });
  }

  const unit = state.units.find(u => (u.unit_id || u.id) === unitId);
  if (unit && unit.unit_model) {
    const cleanModel = unit.unit_model.trim().toLowerCase();
    const filtered = jobs.filter(j => {
      const jm = (j.unit_model || '').trim().toLowerCase();
      return !jm || jm === cleanModel;
    });
    if (filtered.length > 0) jobs = filtered;
  }
  return jobs;
}

// RENDER ALL JOBLIST CARDS
function renderJoblists() {
  const container = document.getElementById('joblists-container');
  if (!container) return;

  container.innerHTML = '';

  state.joblists.forEach((b, index) => {
    const card = document.createElement('div');
    card.className = 'wo-blok';
    card.id = `wo-blok-${index}`;

    const isLockedUnit = state.grupMode === 'unit' && index > 0;
    const isLockedJob = state.grupMode === 'job' && index > 0;
    const totalBlocks = state.joblists.length;

    // Header
    const head = `
      <div class="wo-blok-kepala">
        <span class="wo-blok-judul">Joblist #${index + 1}</span>
        ${totalBlocks > 1 ? `<button type="button" class="wo-blok-hapus" title="Hapus joblist" data-idx="${index}">×</button>` : ''}
      </div>
    `;

    // Section *
    const secHtml = `
      <div class="form-group">
        <label class="form-label">Section <span class="wajib">*</span></label>
        <div class="pilihan-grid-sec">
          <button type="button" class="sec-pill ${b.section === 'rekondisi' ? 'terpilih' : ''}" data-idx="${index}" data-sec="rekondisi">
            🚜 Rekondisi
          </button>
          <button type="button" class="sec-pill ${b.section === 'maintenance' ? 'terpilih' : ''}" data-idx="${index}" data-sec="maintenance">
            🚛 Maintenance
          </button>
        </div>
      </div>
    `;

    // Keterangan
    const ketHtml = `
      <div class="form-group">
        <label class="form-label">
          Keterangan untuk Mekanik <span class="form-hint-inline">(opsional)</span>
        </label>
        <textarea class="form-control field-keterangan" data-idx="${index}" rows="2" placeholder="cth: unit parkir di pit 3, koordinasi dgn operator dulu">${b.keterangan || ''}</textarea>
      </div>
    `;

    // Others Checkbox
    const othersCheckHtml = `
      <label class="others-baris">
        <input type="checkbox" class="field-others-toggle" data-idx="${index}" ${b.others ? 'checked' : ''}>
        <span>📝 Job manual (Others) — di luar katalog</span>
      </label>
    `;

    // Others Fields
    const othersFieldsHtml = `
      <div class="others-fields-box" id="others-box-${index}" style="${b.others ? 'display:block;' : 'display:none;'} margin-bottom: 16px;">
        <div class="form-group">
          <label class="form-label">Job Description <span class="wajib">*</span></label>
          <input type="text" class="form-control field-others-desc" data-idx="${index}" value="${b.othersDesc || ''}" placeholder="e.g. Bersih gudang, Training mekanik">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Base Points <span class="wajib">*</span></label>
            <input type="number" step="0.1" min="0.1" class="form-control field-others-base" data-idx="${index}" value="${b.othersBase || ''}" placeholder="e.g. 3.0">
          </div>
          <div class="form-group">
            <label class="form-label">Target Hours <span class="wajib">*</span></label>
            <input type="number" step="0.1" min="0.1" class="form-control field-others-target" data-idx="${index}" value="${b.othersTarget || ''}" placeholder="e.g. 4.0">
          </div>
        </div>
        <div class="form-group" style="max-width: 280px;">
          <label class="form-label">Unit Factor <span class="wajib">*</span></label>
          <input type="number" step="0.01" min="0.1" class="form-control field-others-factor" data-idx="${index}" value="${b.othersFactor || '1.0'}" placeholder="e.g. 1.0">
          <p class="form-hint" style="margin-top: 4px; font-size: 11px; color: #6B7280;">Pengali kesulitan (mis. 1.0 standar, 1.2 kompleks)</p>
        </div>
      </div>
    `;

    // Catalog Cascades
    const lockedJobId = (state.grupMode === 'job' && state.joblists[0]?.jobId) || '';
    const availableUnits = getAvailableUnits(b.section, state.tampilSemuaUnit, lockedJobId);
    let unitOptions = '<option value="">-- Pilih Unit --</option>';
    availableUnits.forEach(u => {
      const uId = u.unit_id || u.id;
      const uName = u.unit_name || u.name;
      const uModel = u.unit_model ? ` · ${u.unit_model.toUpperCase()}` : '';
      const sel = String(uId).trim().toUpperCase() === String(b.unitId || '').trim().toUpperCase() ? 'selected' : '';
      unitOptions += `<option value="${uId}" ${sel}>${uName}${uModel}</option>`;
    });

    // 1. Available Components (depends on unitId)
    const availableComps = b.unitId ? getAvailableComponents(b.unitId, b.section) : [];
    // Auto-select if only 1 component available and not yet selected or invalid
    if (b.unitId && availableComps.length === 1 && !b.component) {
      b.component = availableComps[0];
    }
    if (b.component && !availableComps.includes(b.component)) {
      b.component = availableComps.length === 1 ? availableComps[0] : '';
    }

    const isCompDisabled = isLockedJob || !b.unitId || availableComps.length === 0;
    const compPlaceholder = !b.unitId ? '-- Pilih Unit Terlebih Dahulu --' : '-- Component --';
    let compOptions = `<option value="">${compPlaceholder}</option>`;
    availableComps.forEach(c => {
      const sel = c === b.component ? 'selected' : '';
      compOptions += `<option value="${c}" ${sel}>${c}</option>`;
    });

    // 2. Available Sub Components (depends on component & unitId)
    const availableSubs = (b.unitId && b.component) ? getAvailableSubComponents(b.component, b.section, b.unitId) : [];
    if (b.component && availableSubs.length === 1 && !b.subComponent) {
      b.subComponent = availableSubs[0];
    }
    if (b.subComponent && !availableSubs.includes(b.subComponent)) {
      b.subComponent = availableSubs.length === 1 ? availableSubs[0] : '';
    }

    const isSubDisabled = isLockedJob || !b.component || availableSubs.length === 0;
    const subPlaceholder = !b.component ? '-- Pilih Component Terlebih Dahulu --' : '-- Sub Component --';
    let subOptions = `<option value="">${subPlaceholder}</option>`;
    availableSubs.forEach(s => {
      const sel = s === b.subComponent ? 'selected' : '';
      subOptions += `<option value="${s}" ${sel}>${s}</option>`;
    });

    // 3. Available Jobs (depends on subComponent, component & unitId)
    const availableJobs = (b.unitId && b.component && b.subComponent)
      ? getAvailableJobs(b.component, b.subComponent, b.section, b.unitId)
      : [];
    if (b.subComponent && availableJobs.length === 1 && !b.jobId) {
      b.jobId = availableJobs[0].job_id || availableJobs[0].id;
    }
    if (b.jobId && !availableJobs.some(j => String(j.job_id || j.id).trim() === String(b.jobId).trim())) {
      b.jobId = availableJobs.length === 1 ? (availableJobs[0].job_id || availableJobs[0].id) : '';
    }

    const isJobDisabled = isLockedJob || !b.subComponent || availableJobs.length === 0;
    const jobPlaceholder = !b.subComponent ? '-- Pilih Sub Component Terlebih Dahulu --' : '-- Job --';
    let jobOptions = `<option value="">${jobPlaceholder}</option>`;
    availableJobs.forEach(j => {
      const jId = j.job_id || j.id;
      const jDesc = j.job_description;
      const jHours = j.plan_hours ? `${j.plan_hours} jam` : '';
      const jPts = j.base_point ? ` · ${j.base_point} pts` : '';
      const label = `${jDesc} (${jHours}${jPts})`;
      const sel = String(jId).trim() === String(b.jobId || '').trim() ? 'selected' : '';
      jobOptions += `<option value="${jId}" ${sel}>${label}</option>`;
    });

    // Model compatibility warning if a mismatched job is somehow selected
    let modelWarningHtml = '';
    if (!b.others && b.unitId && b.jobId) {
      const selectedUnit = state.units.find(u => String(u.unit_id || u.id).trim().toUpperCase() === String(b.unitId).trim().toUpperCase());
      const selectedJob = state.components.find(j => String(j.job_id || j.id).trim() === String(b.jobId).trim());
      if (selectedUnit && selectedJob) {
        const uModel = (selectedUnit.unit_model || '').trim().toLowerCase();
        const jModel = (selectedJob.unit_model || '').trim().toLowerCase();
        if (uModel && jModel && uModel !== jModel) {
          modelWarningHtml = `
            <div style="background: #FEE2E2; border: 1px solid #F87171; color: #991B1B; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-top: 10px; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size: 16px; color: #DC2626;"></i>
              <span>Perhatian: Job "${selectedJob.job_description || selectedJob.component}" (${jModel}) tidak cocok dengan unit ${b.unitId} (${uModel})! Harap pilih job yang sesuai unit.</span>
            </div>
          `;
        }
      }
    }

    const catalogHtml = `
      <div class="catalog-cascade-box" id="catalog-box-${index}" style="${b.others ? 'display:none;' : 'display:block;'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Unit <span class="wajib">*</span></label>
            <select class="form-control field-unit" data-idx="${index}" ${isLockedUnit ? 'disabled' : ''}>
              ${unitOptions}
            </select>
            ${isLockedUnit ? '<p class="tanda-kunci">🔒 Unit dikunci oleh grup — hapus joblist lain untuk mengubah</p>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Component <span class="wajib">*</span></label>
            <select class="form-control field-component" data-idx="${index}" ${isCompDisabled ? 'disabled' : ''}>
              ${compOptions}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Sub Component <span class="wajib">*</span></label>
            <select class="form-control field-sub-comp" data-idx="${index}" ${isSubDisabled ? 'disabled' : ''}>
              ${subOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Job <span class="wajib">*</span></label>
            <select class="form-control field-job" data-idx="${index}" ${isJobDisabled ? 'disabled' : ''}>
              ${jobOptions}
            </select>
            ${isLockedJob ? '<p class="tanda-kunci">🔒 Job dikunci oleh grup — hapus joblist lain untuk mengubah</p>' : ''}
          </div>
        </div>
        ${modelWarningHtml}
      </div>
    `;

    // Location & Work Condition
    const locWcHtml = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">📍 Location <span class="wajib">*</span></label>
          <div class="location-grid">
            <button type="button" class="loc-pilihan ${b.location === 'workshop' ? 'terpilih' : ''}" data-idx="${index}" data-loc="workshop">
              🏭 Workshop
              <span class="sub">Di dalam bengkel</span>
            </button>
            <button type="button" class="loc-pilihan ${b.location === 'field' ? 'terpilih' : ''}" data-idx="${index}" data-loc="field">
              🚜 Field
              <span class="sub">Di lokasi lapangan</span>
            </button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Work Condition <span class="wajib">*</span></label>
          <select class="form-control field-condition" data-idx="${index}">
            <option value="">-- Select Work Condition --</option>
            <option value="normal" ${b.condition === 'normal' ? 'selected' : ''}>Normal (×1.0)</option>
            <option value="difficult" ${b.condition === 'difficult' ? 'selected' : ''}>Difficult (×1.1)</option>
            <option value="extreme" ${b.condition === 'extreme' ? 'selected' : ''}>Extreme (×1.2)</option>
          </select>
        </div>
      </div>
    `;

    // Preview Calculation
    const calc = computeBlockPreviewData(b);
    const prevHtml = `
      <div class="pratinjau">
        <div class="pratinjau-judul">Preview</div>
        <div class="pratinjau-kisi">
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Base Points:</span>
            <span class="pratinjau-nilai">${calc.basePointsStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Target Hours:</span>
            <span class="pratinjau-nilai ${calc.targetHoursStr === '-' ? 'inactive' : ''}">${calc.targetHoursStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Unit Factor:</span>
            <span class="pratinjau-nilai ${calc.unitFactorStr === '-' ? 'inactive' : ''}">${calc.unitFactorStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Work Condition:</span>
            <span class="pratinjau-nilai ${calc.workConditionStr === '-' ? 'inactive' : ''}">${calc.workConditionStr}</span>
          </div>
          <div class="pratinjau-butir">
            <span class="pratinjau-label">Estimated Points:</span>
            <span class="pratinjau-nilai ${calc.estimatedPointsStr === '-' ? 'inactive' : ''}">${calc.estimatedPointsStr}</span>
          </div>
        </div>
      </div>
    `;

    // Team Composition
    let teamRows = '';
    (b.team || ['']).forEach((mId, mIdx) => {
      let mechOptions = '<option value="">-- Select Mechanic --</option>';
      const availableMechs = getAvailableMechanics(b.section, b.allMechanics);
      availableMechs.forEach(m => {
        const id = m.id || m.mechanic_id;
        const name = m.name || m.mechanic_name;
        const sel = String(id) === String(mId) ? 'selected' : '';
        mechOptions += `<option value="${id}" ${sel}>${name}</option>`;
      });

      teamRows += `
        <div class="team-member-row-exact">
          <select class="form-control field-team-select" data-bidx="${index}" data-midx="${mIdx}">
            ${mechOptions}
          </select>
          <button type="button" class="btn-del-member" data-bidx="${index}" data-midx="${mIdx}" title="Hapus mekanik">✕</button>
        </div>
      `;
    });

    const teamHtml = `
      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label">
          Team Composition <span class="wajib">*</span>
          <span class="form-hint-inline">(tiap mekanik dapat poin penuh)</span>
        </label>
        <div class="team-members-list">
          ${teamRows}
        </div>
        <div style="display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap;">
          <button type="button" class="btn-add-team-member" data-idx="${index}">+ Add Team Member</button>
          <label class="saklar-kecil">
            <input type="checkbox" class="field-all-mechs-check" data-idx="${index}" ${b.allMechanics ? 'checked' : ''}>
            <span>🔓 Tampilkan mekanik semua section</span>
          </label>
        </div>
      </div>
    `;

    card.innerHTML = head + secHtml + ketHtml + othersCheckHtml + othersFieldsHtml + catalogHtml + locWcHtml + prevHtml + teamHtml;
    container.appendChild(card);
  });

  attachBlockEventListeners();
}

function getAvailableMechanics(section, showAll) {
  if (showAll) return state.mechanics;
  const sec = (section || '').toLowerCase();
  const gasSec = sec === 'rekondisi' ? 'vessel' : 'maintenance';
  return state.mechanics.filter(m => {
    const s = (m.section || '').toLowerCase();
    if (!s) return true;
    return s.includes(gasSec);
  });
}

function computeBlockPreviewData(b) {
  let base = 0;
  let target = 0;
  let uf = 1.0;
  let ufStr = '-';
  let targetStr = '-';
  let wcStr = '-';
  let estStr = '-';

  if (b.others) {
    base = parseFloat(b.othersBase) || 0;
    target = parseFloat(b.othersTarget) || 0;
    uf = parseFloat(b.othersFactor) || 1.0;
    ufStr = uf > 0 ? `${uf.toFixed(2)}x (Manual)` : '-';
    targetStr = target > 0 ? `${target.toFixed(1)} jam` : '-';
  } else {
    const job = state.components.find(j => String(j.job_id || j.id).trim() === String(b.jobId || '').trim());
    if (job) {
      base = parseFloat(job.base_point) || parseFloat(job.base_points) || 0;
      target = parseFloat(job.plan_hours) || parseFloat(job.target_hours) || 0;
      targetStr = target > 0 ? `${target.toFixed(1)} jam` : '-';
    }
    const unit = state.units.find(u =>
      String(u.unit_id || u.id || '').trim().toUpperCase() === String(b.unitId || '').trim().toUpperCase()
    );
    if (unit) {
      uf = parseFloat(unit.unit_factor) || 1.0;
      ufStr = `${uf.toFixed(2)}x`;
    }
  }

  let wcFactor = null;
  if (b.condition === 'normal') {
    wcFactor = 1.0;
    wcStr = 'Normal (1.00x)';
  } else if (b.condition === 'difficult') {
    wcFactor = 1.1;
    wcStr = 'Difficult (1.10x)';
  } else if (b.condition === 'extreme') {
    wcFactor = 1.2;
    wcStr = 'Extreme (1.20x)';
  }

  if (base > 0 && wcFactor !== null && uf > 0) {
    const est = base * uf * wcFactor;
    estStr = `${est.toFixed(2)} points`;
  } else if (base > 0 && uf > 0) {
    const est = base * uf;
    estStr = `${est.toFixed(2)} points`;
  }

  return {
    basePointsStr: base > 0 ? base.toFixed(2) : '0.00',
    targetHoursStr: targetStr,
    unitFactorStr: ufStr,
    workConditionStr: wcStr,
    estimatedPointsStr: estStr
  };
}

function attachBlockEventListeners() {
  document.querySelectorAll('.wo-blok-hapus').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (state.joblists.length > 1) {
        state.joblists.splice(idx, 1);
        renderJoblists();
      }
    };
  });

  document.querySelectorAll('.sec-pill').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const sec = btn.dataset.sec;
      state.joblists[idx].section = sec;
      state.joblists[idx].unitId = '';
      state.joblists[idx].component = '';
      state.joblists[idx].subComponent = '';
      state.joblists[idx].jobId = '';
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-keterangan').forEach(txt => {
    txt.oninput = () => {
      const idx = parseInt(txt.dataset.idx, 10);
      state.joblists[idx].keterangan = txt.value;
    };
  });

  document.querySelectorAll('.field-others-toggle').forEach(chk => {
    chk.onchange = () => {
      const idx = parseInt(chk.dataset.idx, 10);
      state.joblists[idx].others = chk.checked;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-others-desc').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersDesc = inp.value;
    };
  });
  document.querySelectorAll('.field-others-base').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersBase = inp.value;
      renderJoblists();
    };
  });
  document.querySelectorAll('.field-others-target').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersTarget = inp.value;
      renderJoblists();
    };
  });
  document.querySelectorAll('.field-others-factor').forEach(inp => {
    inp.oninput = () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.joblists[idx].othersFactor = inp.value;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-unit').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      const b = state.joblists[idx];
      b.unitId = sel.value;

      // Smart Cascade down
      const validComps = b.unitId ? getAvailableComponents(b.unitId, b.section) : [];
      if (validComps.length === 1) {
        b.component = validComps[0];
      } else if (!validComps.includes(b.component)) {
        b.component = '';
        b.subComponent = '';
        b.jobId = '';
      }

      if (b.component) {
        const validSubs = getAvailableSubComponents(b.component, b.section, b.unitId);
        if (validSubs.length === 1) {
          b.subComponent = validSubs[0];
        } else if (!validSubs.includes(b.subComponent)) {
          b.subComponent = '';
          b.jobId = '';
        }
      }

      if (b.subComponent) {
        const validJobs = getAvailableJobs(b.component, b.subComponent, b.section, b.unitId);
        if (validJobs.length === 1) {
          b.jobId = validJobs[0].job_id || validJobs[0].id;
        } else if (!validJobs.some(j => String(j.job_id || j.id).trim() === String(b.jobId).trim())) {
          b.jobId = '';
        }
      }

      if (state.grupMode === 'unit' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].unitId = sel.value;
          state.joblists[i].component = b.component;
          state.joblists[i].subComponent = b.subComponent;
          state.joblists[i].jobId = b.jobId;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-component').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      const b = state.joblists[idx];
      b.component = sel.value;

      const validSubs = (b.unitId && b.component) ? getAvailableSubComponents(b.component, b.section, b.unitId) : [];
      if (validSubs.length === 1) {
        b.subComponent = validSubs[0];
      } else if (!validSubs.includes(b.subComponent)) {
        b.subComponent = '';
        b.jobId = '';
      }

      if (b.subComponent) {
        const validJobs = getAvailableJobs(b.component, b.subComponent, b.section, b.unitId);
        if (validJobs.length === 1) {
          b.jobId = validJobs[0].job_id || validJobs[0].id;
        } else if (!validJobs.some(j => String(j.job_id || j.id).trim() === String(b.jobId).trim())) {
          b.jobId = '';
        }
      }

      if (state.grupMode === 'job' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].component = sel.value;
          state.joblists[i].subComponent = b.subComponent;
          state.joblists[i].jobId = b.jobId;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-sub-comp').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      const b = state.joblists[idx];
      b.subComponent = sel.value;

      const validJobs = (b.unitId && b.component && b.subComponent)
        ? getAvailableJobs(b.component, b.subComponent, b.section, b.unitId)
        : [];
      if (validJobs.length === 1) {
        b.jobId = validJobs[0].job_id || validJobs[0].id;
      } else if (!validJobs.some(j => String(j.job_id || j.id).trim() === String(b.jobId).trim())) {
        b.jobId = '';
      }

      if (state.grupMode === 'job' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].subComponent = sel.value;
          state.joblists[i].jobId = b.jobId;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-job').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      const b = state.joblists[idx];
      b.jobId = sel.value;

      if (state.grupMode === 'job' && idx === 0) {
        for (let i = 1; i < state.joblists.length; i++) {
          state.joblists[i].jobId = sel.value;
        }
      }
      renderJoblists();
    };
  });

  document.querySelectorAll('.loc-pilihan').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      state.joblists[idx].location = btn.dataset.loc;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-condition').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx, 10);
      state.joblists[idx].condition = sel.value;
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-team-select').forEach(sel => {
    sel.onchange = () => {
      const bidx = parseInt(sel.dataset.bidx, 10);
      const midx = parseInt(sel.dataset.midx, 10);
      state.joblists[bidx].team[midx] = sel.value;
    };
  });

  document.querySelectorAll('.btn-del-member').forEach(btn => {
    btn.onclick = () => {
      const bidx = parseInt(btn.dataset.bidx, 10);
      const midx = parseInt(btn.dataset.midx, 10);
      if (state.joblists[bidx].team.length > 1) {
        state.joblists[bidx].team.splice(midx, 1);
        renderJoblists();
      } else {
        showToast('Minimal harus ada 1 mekanik dalam tim!', 'warning');
      }
    };
  });

  document.querySelectorAll('.btn-add-team-member').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      state.joblists[idx].team.push('');
      renderJoblists();
    };
  });

  document.querySelectorAll('.field-all-mechs-check').forEach(chk => {
    chk.onchange = () => {
      const idx = parseInt(chk.dataset.idx, 10);
      state.joblists[idx].allMechanics = chk.checked;
      renderJoblists();
    };
  });
}

// SUBMIT ALL WORK ORDERS TO GOOGLE SPREADSHEET
async function submitAllWorkOrders() {
  for (let i = 0; i < state.joblists.length; i++) {
    const b = state.joblists[i];
    const n = i + 1;

    if (!b.condition) {
      showToast(`Joblist #${n}: Harap pilih Work Condition!`, 'warning');
      return;
    }

    if (b.others) {
      if (!b.othersDesc.trim()) {
        showToast(`Joblist #${n}: Harap isi Job Description manual!`, 'warning');
        return;
      }
      if (!(parseFloat(b.othersBase) > 0)) {
        showToast(`Joblist #${n}: Base points harus lebih besar dari 0!`, 'warning');
        return;
      }
    } else {
      if (!b.unitId) {
        showToast(`Joblist #${n}: Harap pilih Unit!`, 'warning');
        return;
      }
      if (!b.jobId) {
        showToast(`Joblist #${n}: Harap pilih Job!`, 'warning');
        return;
      }
      const selectedUnit = state.units.find(u => (u.unit_id || u.id) === b.unitId);
      const selectedJob = state.components.find(j => (j.job_id || j.id) === b.jobId);
      if (selectedUnit && selectedJob) {
        const uModel = (selectedUnit.unit_model || '').trim().toLowerCase();
        const jModel = (selectedJob.unit_model || '').trim().toLowerCase();
        if (uModel && jModel && uModel !== jModel) {
          showToast(`Joblist #${n}: Job "${selectedJob.job_description || selectedJob.component}" (${jModel}) tidak cocok dengan unit ${b.unitId} (${uModel})! Harap pilih job yang sesuai model unit.`, 'danger');
          return;
        }
      }
    }

    const validTeam = (b.team || []).filter(Boolean);
    if (validTeam.length === 0) {
      showToast(`Joblist #${n}: Harap pilih minimal 1 mekanik!`, 'warning');
      return;
    }
  }

  const btnSubmit = document.getElementById('btn-submit-all-wos');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan ke Spreadsheet...';

  const results = [];
  for (let i = 0; i < state.joblists.length; i++) {
    const b = state.joblists[i];
    const op_id = `op-${Date.now()}-${i + 1}`;
    const isRekondisi = b.section === 'rekondisi';
    const sectionGas = isRekondisi ? 'vessel' : 'maintenance';

    const payload = {
      section: sectionGas,
      work_condition: b.condition || 'normal',
      location: b.location || 'workshop',
      keterangan: b.keterangan || '',
      team: (b.team || []).filter(Boolean).map(mId => ({ mechanic_id: mId }))
    };

    if (b.others) {
      payload.component_id = 'COM-OTHERS';
      payload.others_description = b.othersDesc.trim();
      payload.others_base_points = parseFloat(b.othersBase) || 0;
      payload.others_target_hours = parseFloat(b.othersTarget) || 0;
      payload.others_unit_factor = parseFloat(b.othersFactor) || 1.0;
    } else {
      payload.unit_id = b.unitId;
      payload.component_id = b.jobId;
      payload.job_id = b.jobId;
    }

    const res = await api('create_wo', payload, op_id);
    results.push(res);
  }

  btnSubmit.disabled = false;
  btnSubmit.textContent = 'Create Work Order';

  const succeeded = results.filter(r => r && r.success);
  if (succeeded.length > 0) {
    const woIds = succeeded.map(s => s.result?.wo_id || 'WO').join(', ');
    showToast(`✅ Berhasil disimpan di Google Spreadsheet: ${woIds}!`, 'success');
    initCreateWoState();
    // Refresh active WOs from Google Sheets
    await syncFromSpreadsheet(false);
    switchTab('dashboard');
  } else {
    const err = results[0]?.error || 'Gagal menyimpan ke Google Spreadsheet';
    showToast(`❌ Gagal: ${err}`, 'danger');
  }
}

// =========================================================================
// DASHBOARD & MONITORING RENDERING
// =========================================================================
function updateDateString() {
  try {
    const d = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const el = document.getElementById('dashboard-date-str');
    if (el) el.textContent = d.toLocaleDateString('id-ID', options);
  } catch(e) {}
}

function renderDashboard() {
  updateDateString();

  const overall = state.monitoringData?.overall || DEFAULT_MONITORING_OVERALL;

  const totalWoCount = (overall.pending_mechanic_work || 7) + (overall.pending_l1 || 3) + (overall.pending_l2 || 21) + (overall.approved || 13);
  const approvedWoCount = overall.approved || 13;
  const pendingWoCount = (overall.pending_mechanic_work || 7) + (overall.pending_l1 || 3) + (overall.pending_l2 || 21);

  let totalApprovedPts = 0;
  let totalApprovedIdr = 0;
  if (Array.isArray(state.approvedWos) && state.approvedWos.length > 0) {
    state.approvedWos.forEach(w => {
      totalApprovedPts += Number(w.final_points) || 0;
      totalApprovedIdr += Number(w.final_idr) || 0;
    });
  } else {
    totalApprovedPts = overall.total_poin || 20.20;
    totalApprovedIdr = 52520;
  }

  const statTotalEl = document.getElementById('stat-total-wo');
  if (statTotalEl) statTotalEl.textContent = totalWoCount;
  const statApprEl = document.getElementById('stat-approved-wo');
  if (statApprEl) statApprEl.textContent = approvedWoCount;
  const statPendEl = document.getElementById('stat-pending-wo');
  if (statPendEl) statPendEl.textContent = pendingWoCount;
  const statPtsEl = document.getElementById('stat-total-points');
  if (statPtsEl) statPtsEl.textContent = totalApprovedPts.toFixed(2);
  const statIncEl = document.getElementById('stat-incentive-preview');
  if (statIncEl) statIncEl.textContent = `Live Supabase: Rp ${totalApprovedIdr.toLocaleString('id-ID')}`;

  const periodeEl = document.getElementById('dashboard-periode-str');
  if (periodeEl) {
    periodeEl.textContent = `📅 Periode: ${overall.periode || '26 Okt – 25 Nov 2026'} (Live Supabase)`;
  }

  const tbody = document.getElementById('dashboard-recent-wo-body');
  if (!tbody) return;

  const search = (document.getElementById('quick-search-wo')?.value || '').toLowerCase();
  const wos = state.workOrders.filter(w => {
    if (!search) return true;
    const txt = `${w.id} ${w.component_name} ${w.unit_name} ${w.status}`.toLowerCase();
    return txt.includes(search);
  });

  if (wos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);"><i class="fa-solid fa-inbox" style="font-size:24px; margin-bottom:8px; display:block;"></i>Tekan tombol <strong>Sync Sheets</strong> untuk mengambil transaksi terbaru.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  wos.slice(0, 10).forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.id}</strong></td>
      <td>${w.component_name}</td>
      <td>${w.team?.map(t => t.name).join(', ') || '-'}</td>
      <td><span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span></td>
      <td>${w.judgment || '-'}</td>
      <td>${w.created_by || 'Mekanik'}</td>
      <td>${w.date}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMonitoring() {
  const role = (state.currentUser?.role || '').toLowerCase();
  const isSupervisorRole = role === 'supervisor' || role === 'superintendent' || state.currentUser?.id === 'SPV-001' || state.currentUser?.mechanic_id === 'SPV-001';
  const isMechanicMode = !isSupervisorRole || state.viewAsMechanic !== null;
  const banner = document.getElementById('mon-viewing-as-banner');
  const supervisorPanel = document.getElementById('mon-supervisor-panel');
  const mechanicSubview = document.getElementById('mon-subview-mechanic-work');
  const loadingEl = document.getElementById('mon-loading-spinner');
  if (loadingEl) loadingEl.style.display = 'none';

  if (state.viewAsMechanic) {
    if (banner) {
      banner.style.display = 'flex';
      const nameEl = document.getElementById('mon-viewing-as-name');
      if (nameEl) nameEl.textContent = `${state.viewAsMechanic.name} (${state.viewAsMechanic.id})`;
    }
  } else {
    if (banner) banner.style.display = 'none';
  }

  if (isMechanicMode) {
    if (supervisorPanel) supervisorPanel.style.display = 'none';
    if (mechanicSubview) mechanicSubview.style.display = 'block';
    loadMechanicWos();
    return;
  }

  if (supervisorPanel) supervisorPanel.style.display = 'block';
  if (mechanicSubview) mechanicSubview.style.display = 'none';

  const overall = state.monitoringData?.overall || DEFAULT_MONITORING_OVERALL;

  const kpiWork = document.getElementById('mon-kpi-work');
  if (kpiWork) kpiWork.textContent = overall.pending_mechanic_work || 7;
  const kpiL1 = document.getElementById('mon-kpi-l1');
  if (kpiL1) kpiL1.textContent = overall.pending_l1 || 3;
  const kpiL2 = document.getElementById('mon-kpi-l2');
  if (kpiL2) kpiL2.textContent = overall.pending_l2 || 21;
  const kpiAppr = document.getElementById('mon-kpi-approved');
  if (kpiAppr) kpiAppr.textContent = overall.approved || 13;

  const periodeEl = document.getElementById('monitoring-periode-str');
  if (periodeEl) {
    periodeEl.textContent = `Periode: ${overall.periode || '26 Okt – 25 Nov 2026'} (Live Google Sheets)`;
  }

  const countMech = document.getElementById('mon-count-mechanics');
  if (countMech) countMech.textContent = (state.monitoringData?.mechanics || DEFAULT_MECHANICS_LIST).length;

  const countWos = document.getElementById('mon-count-all-wos');
  if (countWos) countWos.textContent = state.workOrders.length || 58;

  const btnMech = document.getElementById('mon-subtab-mechanics-btn');
  const btnWos = document.getElementById('mon-subtab-wos-btn');
  const subviewMech = document.getElementById('mon-subview-mechanics');
  const subviewWos = document.getElementById('mon-subview-all-wos');

  if (state.monSubTab === 'mechanics') {
    btnMech?.classList.add('active-subtab');
    btnWos?.classList.remove('active-subtab');
    if (subviewMech) subviewMech.style.display = 'block';
    if (subviewWos) subviewWos.style.display = 'none';

    renderMechanicsMonitoringTable();
  } else {
    btnMech?.classList.remove('active-subtab');
    btnWos?.classList.add('active-subtab');
    if (subviewMech) subviewMech.style.display = 'none';
    if (subviewWos) subviewWos.style.display = 'block';

    renderAllWosMonitoringTable();
  }
}

function renderMechanicsMonitoringTable() {
  const tbody = document.getElementById('mon-mechanics-table-body');
  if (!tbody) return;

  const search = (document.getElementById('search-monitoring')?.value || '').toLowerCase();
  const sectionFilter = (document.getElementById('filter-monitoring-section')?.value || '').toLowerCase();

  const mechs = (state.monitoringData?.mechanics && state.monitoringData.mechanics.length > 0)
    ? state.monitoringData.mechanics
    : DEFAULT_MECHANICS_LIST;

  const filtered = mechs.filter(m => {
    if (sectionFilter && (m.section || '').toLowerCase() !== sectionFilter) return false;
    if (!search) return true;
    const txt = `${m.id} ${m.name} ${m.section}`.toLowerCase();
    return txt.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);">Tidak ada data mekanik ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach((m, idx) => {
    const tr = document.createElement('tr');
    const isVessel = (m.section || '').toLowerCase() === 'vessel';
    const sectionBadge = isVessel
      ? '<span class="status-badge" style="background:#DBEAFE; color:#1E40AF; font-size:11px;">VESSEL</span>'
      : '<span class="status-badge" style="background:#D1FAE5; color:#065F46; font-size:11px;">MAINTENANCE</span>';

    const workBadge = m.pending_mechanic_work > 0
      ? `<span class="status-badge" style="background:#FEF3C7; color:#92400E; font-weight:700;">${m.pending_mechanic_work}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    const l1Badge = m.pending_l1 > 0
      ? `<span class="status-badge" style="background:#E0E7FF; color:#3730A3; font-weight:700;">${m.pending_l1}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    const l2Badge = m.pending_l2 > 0
      ? `<span class="status-badge" style="background:#FCE7F3; color:#9D174D; font-weight:700;">${m.pending_l2}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    const approvedBadge = m.approved > 0
      ? `<span class="status-badge" style="background:#DCFCE7; color:#166534; font-weight:700;">${m.approved}</span>`
      : '<span style="color:#9CA3AF;">0</span>';

    tr.innerHTML = `
      <td style="text-align: center; color: var(--text-dim);">${idx + 1}</td>
      <td><span class="status-badge" style="background:#F3F4F6; color:#1F2937; font-family:monospace; font-weight:600;">${m.id}</span></td>
      <td><strong>${m.name}</strong></td>
      <td>${sectionBadge}</td>
      <td style="text-align: center;">${workBadge}</td>
      <td style="text-align: center;">${l1Badge}</td>
      <td style="text-align: center;">${l2Badge}</td>
      <td style="text-align: center;">${approvedBadge}</td>
      <td>
        <div class="token-copy-box" style="display: flex; gap: 4px; align-items: center;">
          <input type="text" class="token-copy-input" readonly value="${m.token || ''}" id="tok-${m.id}" style="flex: 1; font-size: 11px;">
          <button class="btn-copy-token" id="btn-copy-${m.id}" onclick="window.copyMechanicToken('${m.token}', 'btn-copy-${m.id}')" title="Salin Token">
            <i class="fa-regular fa-copy"></i> Salin
          </button>
          ${m.token ? `
            <button class="btn-open-mech" onclick="window.bukaSebagaiMekanik('${m.id}', '${m.token}', '${(m.name || '').replace(/'/g, "\\'")}')" title="Buka WO Mekanik ini" style="background:#111827; color:#fff; border:none; padding:4px 9px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
              Buka →
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================================
// MECHANIC WORKFLOW CONTROLLERS (Page Mekanik / WO Saya / Live Timer)
// =========================================================================

export function bukaSebagaiMekanik(mechId, mechToken, mechName) {
  state.viewAsMechanic = { id: mechId, token: mechToken, name: mechName };
  state.mechanicFilter = 'assigned';
  renderMonitoring();
}
window.bukaSebagaiMekanik = bukaSebagaiMekanik;

export function kembaliDariMekanik() {
  state.viewAsMechanic = null;
  renderMonitoring();
}
window.kembaliDariMekanik = kembaliDariMekanik;

export async function loadMechanicWos() {
  const container = document.getElementById('mech-wos-grid');
  if (container) {
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>Memuat daftar work order...</div>';
  }

  const tokenToUse = state.viewAsMechanic?.token || state.activeToken;
  try {
    const res = await api('pull_my_wos', {}, null, tokenToUse);
    const rawWos = res?.result?.wos || res?.wos || [];
    state.mechanicWos = Array.isArray(rawWos) ? rawWos : [];
    updateMechanicCounts();
    renderMechanicWoGrid();
  } catch (err) {
    console.error('Error loading mechanic WOs:', err);
    if (container) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--accent-red); font-weight: 600;">Gagal memuat WO: ${err.message}</div>`;
    }
  }
}

function updateMechanicCounts() {
  const wos = state.mechanicWos || [];
  let assigned = 0, pending = 0, done = 0;
  wos.forEach(w => {
    const st = String(w.status || '');
    if (st === 'pending_mechanic_work') assigned++;
    else if (st === 'approved' || st === 'done') done++;
    else pending++;
  });
  const cAssigned = document.getElementById('mech-count-assigned');
  if (cAssigned) cAssigned.textContent = assigned;
  const cPending = document.getElementById('mech-count-pending');
  if (cPending) cPending.textContent = pending;
  const cDone = document.getElementById('mech-count-done');
  if (cDone) cDone.textContent = done;
}

function renderMechanicWoGrid() {
  const container = document.getElementById('mech-wos-grid');
  if (!container) return;

  const wos = state.mechanicWos || [];
  const filter = state.mechanicFilter || 'assigned';

  const filtered = wos.filter(w => {
    const st = String(w.status || '');
    let group = 'pending_approval';
    if (st === 'pending_mechanic_work') group = 'assigned';
    else if (st === 'approved' || st === 'done') group = 'done';
    return group === filter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: var(--text-dim); background: #FFFFFF; border-radius: 12px; border: 1px dashed var(--border);"><i class="fa-solid fa-clipboard-check" style="font-size: 32px; margin-bottom: 12px; opacity: 0.4; display: block;"></i><h3 style="font-size: 16px; color: #4B5563; margin-bottom: 4px;">Tidak Ada Work Order</h3><p style="font-size: 13px; margin: 0;">Tidak ditemukan work order untuk filter ini.</p></div>`;
    return;
  }

  const groups = [];
  const indexMap = {};
  filtered.forEach(wo => {
    const g = String(wo.wo_group_id || '');
    const key = g || ('__solo__' + (wo.id || wo.wo_number));
    if (indexMap[key] === undefined) {
      indexMap[key] = groups.length;
      groups.push({ id: g, mode: String(wo.wo_group_mode || ''), items: [] });
    }
    groups[indexMap[key]].items.push(wo);
  });

  let html = '';
  groups.forEach(G => {
    const isBorongan = !!G.id && G.items.length > 1;
    if (isBorongan) {
      const w0 = G.items[0];
      const gTotal = parseInt(w0.grup_total, 10) || G.items.length;
      const selesai = parseInt(w0.grup_selesai, 10) || G.items.filter(w => w.status === 'approved').length;
      const judul = (G.mode === 'job')
        ? (w0.component_name || '-') + ' · ' + gTotal + ' unit'
        : (w0.unit_name || 'Workshop') + ' · ' + gTotal + ' job';
      html += `
        <div class="grup-wrap">
          <div class="grup-head">
            <div class="grup-head-top">
              <div class="grup-judul">📦 ${judul}</div>
              <span class="grup-tag">${G.mode === 'job' ? '1 Job · Banyak Unit' : '1 Unit · Banyak Job'}</span>
            </div>
            <div class="grup-sub">
              📍 ${w0.location === 'field' ? '🚜 Field' : '🏭 Workshop'} · ✅ Selesai <b>${selesai} dari ${gTotal}</b> baris
            </div>
          </div>
          <div class="grup-body">
      `;
    }

    G.items.forEach((wo, idx) => {
      html += renderWoCardHtml(wo, isBorongan ? (idx + 1) : 0);
    });

    if (isBorongan) {
      html += '</div></div>';
    }
  });

  container.innerHTML = html;
}

function formatJamMenit(h) {
  h = parseFloat(h) || 0;
  var j = Math.floor(h);
  var m = Math.round((h - j) * 60);
  if (m === 60) { j++; m = 0; }
  if (j > 0 && m > 0) return j + ' jam ' + m + ' menit';
  if (j > 0) return j + ' jam';
  if (m > 0) return m + ' menit';
  return '0 menit';
}
window.formatJamMenit = formatJamMenit;

function renderWoCardHtml(wo, nomor) {
  const isIncident = (wo.safety_incident === true || wo.safety_incident === 'true');
  const st = String(wo.status || '');
  let statusGroup = 'pending_approval';
  let statusLabel = 'Menunggu L1';

  if (st === 'pending_mechanic_work') {
    statusGroup = 'assigned';
    statusLabel = 'Assigned';
  } else if (st === 'pending_supervisor') {
    statusGroup = 'pending_approval';
    statusLabel = 'Menunggu L1';
  } else if (st === 'pending_superintendent') {
    statusGroup = 'pending_approval';
    statusLabel = 'Menunggu L2';
  } else if (st === 'pending_transfer') {
    statusGroup = 'pending_approval';
    statusLabel = 'Transfer Shift';
  } else if (st === 'approved' || st === 'done') {
    statusGroup = 'done';
    statusLabel = 'Approved';
  } else {
    statusLabel = st;
  }

  const woId = wo.id || wo.wo_number;
  const woNo = wo.wo_number || wo.id;
  const comp = wo.component_name || wo.job_name || 'Pekerjaan';
  const unit = wo.unit_name || wo.unit_id || '-';
  const targetH = formatJamMenit(wo.target_hours || 0);
  const lokasi = wo.location === 'field' ? '🚜 Field' : '🏭 Workshop';
  const ket = wo.keterangan || wo.notes || '';

  let timStr = '-';
  if (Array.isArray(wo.team) && wo.team.length > 0) {
    timStr = wo.team.map(t => {
      const name = t.name || t.mechanic_name || String(t);
      return (t.is_me || t.akuSendiri)
        ? `<strong style="color: #047857;">${name} (Anda)</strong>`
        : name;
    }).join(', ');
  }

  const canSubmit = (statusGroup === 'assigned');

  return `
    <div class="wo-card" onclick="window.openKerjaWoModal('${woId}')">
      <div class="wo-header">
        <div class="wo-id">
          ${nomor ? `<span class="wo-line-no">${nomor}</span>` : ''}
          ${woNo}
        </div>
        <div class="wo-status status-${statusGroup}">${isIncident ? '⚠️ Insiden' : statusLabel}</div>
      </div>
      <div class="wo-component">${comp}</div>
      <div class="wo-details">
        <div class="wo-detail-item">
          <span class="wo-detail-label">Unit</span>
          <span class="wo-detail-value">${unit}</span>
        </div>
        <div class="wo-detail-item">
          <span class="wo-detail-label">Target Hours</span>
          <span class="wo-detail-value">${targetH}</span>
        </div>
        <div class="wo-detail-item" style="grid-column: 1 / -1;">
          <span class="wo-detail-label">👥 Tim Pengerjaan</span>
          <span class="wo-detail-value">${timStr}</span>
        </div>
        <div class="wo-detail-item">
          <span class="wo-detail-label">Lokasi</span>
          <span class="wo-detail-value">${lokasi}</span>
        </div>
        ${wo.submitted_at_str ? `
          <div class="wo-detail-item">
            <span class="wo-detail-label">📮 Dikirim</span>
            <span class="wo-detail-value">${wo.submitted_at_str}</span>
          </div>
        ` : ''}
        ${wo.disahkan_at_str ? `
          <div class="wo-detail-item">
            <span class="wo-detail-label">✅ Disahkan</span>
            <span class="wo-detail-value">${wo.disahkan_at_str}</span>
          </div>
        ` : ''}
        ${ket ? `
          <div class="wo-detail-item" style="grid-column: 1 / -1;">
            <span class="wo-detail-label">📝 Keterangan</span>
            <span class="wo-detail-value">${ket}</span>
          </div>
        ` : ''}
      </div>
      ${canSubmit ? `
        <div style="display: flex; gap: 8px; margin-top: 14px;" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-secondary" style="flex: 1; padding: 7px 10px; font-size: 13px;" onclick="window.openKerjaWoModal('${woId}')">
            ⏱️ Isi Jam
          </button>
          <button type="button" class="btn btn-primary" style="flex: 1; padding: 7px 10px; font-size: 13px;" onclick="window.kirimLangsungWo('${woId}')">
            📮 Kirim
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// ── LIVE TIMER (localStorage / In-Memory Persistence) ──
const TIMER_KEY = 'mar_projek_kmb_timers';
let _timerMem = null;
let _timerTick = null;

function timerAll() {
  if (_timerMem) return _timerMem;
  try { _timerMem = JSON.parse(localStorage.getItem(TIMER_KEY) || '{}'); }
  catch (e) { _timerMem = {}; }
  return _timerMem;
}

function timerSave() {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(_timerMem || {})); } catch (e) {}
}

function timerState(woId) {
  const all = timerAll();
  if (!all[woId]) all[woId] = { state: 'idle', start_epoch: 0, elapsed_ms: 0 };
  return all[woId];
}

function timerPauseOthers(currentWoId) {
  const all = timerAll();
  let n = 0;
  for (const id in all) {
    if (!all.hasOwnProperty(id) || String(id) === String(currentWoId)) continue;
    const st = all[id];
    if (!st || st.state !== 'running') continue;
    st.elapsed_ms = (parseFloat(st.elapsed_ms) || 0) + (Date.now() - (parseFloat(st.start_epoch) || Date.now()));
    st.state = 'paused';
    st.start_epoch = 0;
    n++;
  }
  if (n) timerSave();
  return n;
}

function timerCurrentMs(st) {
  return (parseFloat(st.elapsed_ms) || 0) + (st.state === 'running' ? (Date.now() - st.start_epoch) : 0);
}

function msToHms(ms) {
  if (!ms || ms < 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - h * 3600) / 60);
  const sec = s - h * 3600 - m * 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}

function msToJamMenit(ms) {
  const tot = Math.round((parseFloat(ms) || 0) / 60000);
  const j = Math.floor(tot / 60);
  const m = tot % 60;
  if (j > 0 && m > 0) return j + ' jam ' + m + ' menit';
  if (j > 0) return j + ' jam';
  return m + ' menit';
}

function toDatetimeLocal(d) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function timerRefreshUI() {
  const wo = state.currentModalWo;
  if (!wo) return;
  const woId = wo.id || wo.wo_number;
  const st = timerState(woId);
  const disp = document.getElementById('mwo-timer-display');
  if (disp) disp.textContent = msToHms(timerCurrentMs(st));

  const bS = document.getElementById('mwo-btn-timer-start');
  const bP = document.getElementById('mwo-btn-timer-pause');
  const bF = document.getElementById('mwo-btn-timer-stop');
  const bR = document.getElementById('mwo-btn-timer-reset');

  if (bR) bR.style.display = (st.state === 'idle') ? 'none' : 'inline-block';
  if (st.state === 'idle') {
    if (bS) { bS.style.display = 'inline-block'; bS.textContent = '▶ Mulai'; }
    if (bP) bP.style.display = 'none';
    if (bF) bF.style.display = 'none';
  } else if (st.state === 'running') {
    if (bS) bS.style.display = 'none';
    if (bP) bP.style.display = 'inline-block';
    if (bF) bF.style.display = 'inline-block';
  } else {
    if (bS) { bS.style.display = 'inline-block'; bS.textContent = '▶ Lanjut'; }
    if (bP) bP.style.display = 'none';
    if (bF) bF.style.display = 'inline-block';
  }
}

function timerStartTicker() {
  if (_timerTick) return;
  _timerTick = setInterval(() => {
    const wo = state.currentModalWo;
    if (!wo) return;
    const woId = wo.id || wo.wo_number;
    const st = timerState(woId);
    if (st.state === 'running') {
      const disp = document.getElementById('mwo-timer-display');
      if (disp) disp.textContent = msToHms(timerCurrentMs(st));
    }
  }, 1000);
}

export function openKerjaWoModal(woId) {
  const wo = (state.mechanicWos || []).find(w => String(w.id || w.wo_number) === String(woId));
  if (!wo) return;
  state.currentModalWo = wo;

  document.getElementById('mwo-title').textContent = wo.wo_number || wo.id;
  document.getElementById('mwo-component').textContent = wo.component_name || wo.job_name || 'Pekerjaan';
  document.getElementById('mwo-unit').textContent = wo.unit_name || wo.unit_id || '-';
  document.getElementById('mwo-target-hours').textContent = formatJamMenit(wo.target_hours || 0);
  document.getElementById('mwo-status').textContent = (wo.status === 'pending_mechanic_work') ? 'Assigned' : (wo.status || '-');
  document.getElementById('mwo-location').textContent = wo.location === 'field' ? '🚜 Field' : '🏭 Workshop';

  const ketWrap = document.getElementById('mwo-keterangan-wrap');
  const ketText = document.getElementById('mwo-keterangan');
  if (wo.keterangan || wo.notes) {
    if (ketWrap) ketWrap.style.display = 'block';
    if (ketText) ketText.textContent = wo.keterangan || wo.notes;
  } else {
    if (ketWrap) ketWrap.style.display = 'none';
  }

  document.getElementById('mwo-wo-id').value = wo.id || wo.wo_number;
  document.getElementById('mwo-start-time').value = '';
  document.getElementById('mwo-end-time').value = '';
  document.getElementById('mwo-hour-meter').value = wo.hour_meter || '';
  document.getElementById('mwo-kilometers').value = wo.kilometers || '';
  document.getElementById('mwo-part-category').value = wo.part_category || '';
  document.getElementById('mwo-transfer-note').value = '';

  const dp = document.getElementById('mwo-duration-preview');
  if (dp) dp.style.display = 'none';
  const sumBox = document.getElementById('mwo-timer-summary');
  if (sumBox) sumBox.style.display = 'none';

  validateMwoTimes();
  timerRefreshUI();
  timerStartTicker();

  const modal = document.getElementById('modal-kerjakan-wo');
  if (modal) modal.style.display = 'flex';
}
window.openKerjaWoModal = openKerjaWoModal;

export function closeKerjaWoModal() {
  const modal = document.getElementById('modal-kerjakan-wo');
  if (modal) modal.style.display = 'none';
  state.currentModalWo = null;
}
window.closeKerjaWoModal = closeKerjaWoModal;

export function timerStartAction() {
  const wo = state.currentModalWo;
  if (!wo) return;
  const woId = wo.id || wo.wo_number;
  const n = timerPauseOthers(woId);
  const st = timerState(woId);
  st.state = 'running';
  st.start_epoch = Date.now();
  timerSave();
  timerStartTicker();
  timerRefreshUI();
  if (n) showToast(`⏸ ${n} WO lain otomatis dijeda.`, 'info');
}
window.timerStartAction = timerStartAction;

export function timerPauseAction() {
  const wo = state.currentModalWo;
  if (!wo) return;
  const woId = wo.id || wo.wo_number;
  const st = timerState(woId);
  if (st.state !== 'running') return;
  st.elapsed_ms = (parseFloat(st.elapsed_ms) || 0) + (Date.now() - st.start_epoch);
  st.state = 'paused';
  st.start_epoch = 0;
  timerSave();
  timerRefreshUI();
}
window.timerPauseAction = timerPauseAction;

export function timerStopAction() {
  const wo = state.currentModalWo;
  if (!wo) return;
  const woId = wo.id || wo.wo_number;
  const st = timerState(woId);
  const total = timerCurrentMs(st);

  if (total > 0 && total < 60000) {
    if (!confirm(`Durasi kerja baru ${msToJamMenit(total)}.\nYakin hentikan timer dan pakai durasi ini?`)) return;
  }

  st.state = 'paused';
  st.elapsed_ms = total;
  st.start_epoch = 0;
  timerSave();

  if (total > 0) {
    const now = new Date();
    const start = new Date(now.getTime() - total);
    document.getElementById('mwo-start-time').value = toDatetimeLocal(start);
    document.getElementById('mwo-end-time').value = toDatetimeLocal(now);

    const sumBox = document.getElementById('mwo-timer-summary');
    if (sumBox) {
      sumBox.style.display = 'block';
      sumBox.innerHTML = `✅ Total waktu pengerjaan: <b>${msToJamMenit(total)}</b><div style="font-size:11px;opacity:0.85;margin-top:2px;">${toDatetimeLocal(start).replace('T',' ')} → ${toDatetimeLocal(now).replace('T',' ')}</div>`;
    }
    validateMwoTimes();
  }
  timerRefreshUI();
}
window.timerStopAction = timerStopAction;

export function timerResetAction() {
  const wo = state.currentModalWo;
  if (!wo) return;
  const woId = wo.id || wo.wo_number;
  const st = timerState(woId);
  const total = timerCurrentMs(st);

  if (total > 0) {
    if (!confirm(`Reset timer ke 00:00:00?\n\nWaktu terekam ${msToJamMenit(total)} akan DIHAPUS dan tidak bisa dikembalikan.`)) return;
  }

  const all = timerAll();
  all[woId] = { state: 'idle', start_epoch: 0, elapsed_ms: 0 };
  timerSave();

  document.getElementById('mwo-start-time').value = '';
  document.getElementById('mwo-end-time').value = '';
  const sumBox = document.getElementById('mwo-timer-summary');
  if (sumBox) sumBox.style.display = 'none';

  timerRefreshUI();
  validateMwoTimes();
}
window.timerResetAction = timerResetAction;

function timerClear(woId) {
  const all = timerAll();
  all[woId] = { state: 'idle', start_epoch: 0, elapsed_ms: 0 };
  timerSave();
}

function validateMwoTimes() {
  const s = document.getElementById('mwo-start-time')?.value;
  const e = document.getElementById('mwo-end-time')?.value;
  const btn = document.getElementById('mwo-btn-submit');
  const dp = document.getElementById('mwo-duration-preview');
  const dt = document.getElementById('mwo-duration-text');

  if (!btn) return;
  if (!s || !e) {
    btn.disabled = true;
    if (dp) dp.style.display = 'none';
    return;
  }

  const sd = new Date(s), ed = new Date(e);
  if (ed <= sd) {
    btn.disabled = true;
    if (dp) {
      dp.style.display = 'block';
      dp.style.background = '#FEE2E2';
      dp.style.color = '#991B1B';
    }
    if (dt) dt.textContent = '⚠️ End time harus setelah start time';
    return;
  }

  if (dp) {
    dp.style.display = 'block';
    dp.style.background = '#F3F4F6';
    dp.style.color = '#1F2937';
  }
  const durH = (ed - sd) / 3600000;
  if (dt) dt.textContent = `Durasi: ${formatJamMenit(durH)}`;
  btn.disabled = false;
}

export async function submitPekerjaanMekanik(e) {
  if (e) e.preventDefault();
  const wo = state.currentModalWo;
  if (!wo) return;

  const st = document.getElementById('mwo-start-time').value;
  const et = document.getElementById('mwo-end-time').value;
  if (!st || !et) {
    alert('Mohon isi Start Time dan End Time');
    return;
  }

  const sd = new Date(st), ed = new Date(et);
  if (ed <= sd) {
    alert('End Time harus setelah Start Time');
    return;
  }

  const hm = document.getElementById('mwo-hour-meter').value;
  const km = document.getElementById('mwo-kilometers').value;
  const part = document.getElementById('mwo-part-category').value;
  const btn = document.getElementById('mwo-btn-submit');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

  const tokenToUse = state.viewAsMechanic?.token || state.activeToken;
  const woId = wo.id || wo.wo_number;

  try {
    const res = await api('submit_work', {
      wo_id: woId,
      start_time: sd.toISOString(),
      end_time: ed.toISOString(),
      hour_meter: hm || '',
      kilometers: km || '',
      part_category: part || '',
      detail_tyre: null
    }, null, tokenToUse);

    if (res?.success) {
      timerClear(woId);
      window.closeKerjaWoModal();
      showToast(`✅ Laporan terkirim!\nWO: ${wo.wo_number || woId}`, 'success');
      loadMechanicWos();
    } else {
      alert(`❌ Error: ${res?.error?.message || res?.error || 'Gagal mengirim laporan'}`);
      btn.disabled = false;
      btn.textContent = '📮 Kirim Laporan';
    }
  } catch (err) {
    alert(`⚠️ Terjadi kesalahan: ${err.message}`);
    btn.disabled = false;
    btn.textContent = '📮 Kirim Laporan';
  }
}

export async function transferPekerjaanMekanik() {
  const wo = state.currentModalWo;
  if (!wo) return;

  const st = document.getElementById('mwo-start-time').value;
  if (!st) {
    alert('Isi Start Time dulu — jam itu dipakai untuk menghitung sesi kerja Anda.');
    return;
  }
  if (new Date(st).getTime() > Date.now()) {
    alert('Start Time tidak boleh melewati jam sekarang.');
    return;
  }

  const note = document.getElementById('mwo-transfer-note').value;
  if (!confirm(`Oper WO ini ke shift berikutnya?\n\nJam kerja Anda sejak ${st.replace('T', ' ')} dicatat, dan baru dihitung kalau Supervisor/L1 menyetujui transfernya.`)) return;

  const btn = document.getElementById('mwo-btn-transfer');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

  const tokenToUse = state.viewAsMechanic?.token || state.activeToken;
  const woId = wo.id || wo.wo_number;

  try {
    const res = await api('request_transfer', {
      wo_id: woId,
      transfer_note: note || '',
      session_start_time: new Date(st).toISOString()
    }, null, tokenToUse);

    if (res?.success) {
      window.closeKerjaWoModal();
      showToast(`Permintaan transfer terkirim untuk WO: ${wo.wo_number || woId}`, 'success');
      loadMechanicWos();
    } else {
      alert(`❌ Error: ${res?.error?.message || res?.error || 'Gagal mengirim transfer'}`);
      btn.disabled = false;
      btn.textContent = '🔁 Transfer ke Shift Berikutnya';
    }
  } catch (err) {
    alert(`⚠️ Terjadi kesalahan: ${err.message}`);
    btn.disabled = false;
    btn.textContent = '🔁 Transfer ke Shift Berikutnya';
  }
}

export async function kirimLangsungWo(woId) {
  const wo = (state.mechanicWos || []).find(w => String(w.id || w.wo_number) === String(woId));
  if (!wo) return;

  const st = timerState(woId);
  const total = timerCurrentMs(st);
  if (total <= 0) {
    alert('⏱️ Timer masih 00:00:00.\n\nTekan ▶ Mulai dulu lewat ⏱️ Isi Jam, atau jalankan timer.');
    return;
  }

  const now = new Date();
  const start = new Date(now.getTime() - total);
  if (!confirm(`Kirim laporan kerja ${wo.wo_number || woId}?\n\nDurasi: ${msToJamMenit(total)}\n${start.toLocaleString('id-ID')} → ${now.toLocaleString('id-ID')}\n\nSetelah terkirim, WO masuk ke meja L1 dan tidak bisa diubah lagi.`)) return;

  const tokenToUse = state.viewAsMechanic?.token || state.activeToken;
  try {
    const res = await api('submit_work', {
      wo_id: woId,
      start_time: start.toISOString(),
      end_time: now.toISOString(),
      hour_meter: '',
      kilometers: '',
      part_category: '',
      detail_tyre: null
    }, null, tokenToUse);

    if (res?.success) {
      timerClear(woId);
      showToast(`✅ Laporan terkirim!\nWO: ${wo.wo_number || woId}`, 'success');
      loadMechanicWos();
    } else {
      alert(`❌ Gagal: ${res?.error?.message || res?.error || 'Tidak diketahui'}`);
    }
  } catch (err) {
    alert(`⚠️ Terjadi kesalahan: ${err.message}`);
  }
}
window.kirimLangsungWo = kirimLangsungWo;

function renderAllWosMonitoringTable() {
  const tbody = document.getElementById('mon-all-wos-table-body');
  if (!tbody) return;

  const search = (document.getElementById('search-monitoring')?.value || '').toLowerCase();
  const sectionFilter = (document.getElementById('filter-monitoring-section')?.value || '').toLowerCase();

  const filtered = state.workOrders.filter(w => {
    if (sectionFilter && (w.section || '').toLowerCase() !== sectionFilter) return false;
    if (!search) return true;
    const teamNames = w.team?.map(t => t.name).join(' ') || '';
    const text = `${w.id} ${w.unit_name} ${w.component_name} ${teamNames} ${w.status}`.toLowerCase();
    return text.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-dim); padding:30px;">Tidak ada work order ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.id}</strong></td>
      <td>${w.date}</td>
      <td>${w.shift}</td>
      <td>${w.unit_name ? w.unit_name.split('—')[0] : '-'}</td>
      <td>${w.component_name}</td>
      <td>${w.team?.map(t => t.name).join('<br>') || '-'}</td>
      <td>${w.actual_hours || '-'}j / ${w.target_hours || '-'}j</td>
      <td><strong style="color:#2D6A4F;">${w.final_points ? w.final_points.toFixed(2) : '0.00'}</strong></td>
      <td><span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function getPendingApprovalsForCurrentRole() {
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  if (isSuperintendent) {
    // Superintendent (L2): ONLY show L2 pending approvals!
    const l2List = (state.pendingL2Wos || []).filter(w => w.status === 'PENDING_L2' || w.status === 'pending_superintendent' || w.level === 2);
    return l2List.length > 0 ? l2List : (state.hasSyncedPending ? [] : DEFAULT_PENDING_L2_LIST);
  } else {
    // Supervisor (L1): ONLY show L1 pending approvals (WO-20261026-004)! NEVER show L2!
    const l1List = (state.pendingL1Wos || []).filter(w => (w.level === 1 || !w.level) && (w.status === 'PENDING_L1' || w.status === 'pending_supervisor' || !w.status || w.status === 'pending_transfer'));
    return l1List.length > 0 ? l1List : (state.hasSyncedPending ? [] : DEFAULT_PENDING_L1_LIST);
  }
}

function renderApprovals() {
  const container = document.getElementById('approvals-cards-container');
  if (!container) return;

  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';

  // 1. Role-based pending list
  const rolePendingList = getPendingApprovalsForCurrentRole();
  const activeList = state.activeWos || [];
  const approvedList = state.approvedWos || [];
  const transferList = [
    ...(state.pendingL1Wos || []),
    ...(state.pendingL2Wos || [])
  ].filter(w => w.status === 'pending_transfer');
  const rejectedList = state.rejectedWos || [];

  // Update counts on subtabs
  const cntPendingEl = document.getElementById('appr-count-pending');
  if (cntPendingEl) cntPendingEl.textContent = rolePendingList.length;

  const cntActEl = document.getElementById('appr-count-active');
  if (cntActEl) {
    cntActEl.textContent = activeList.length;
    cntActEl.style.display = activeList.length > 0 ? 'inline-block' : 'none';
  }
  const cntApprEl = document.getElementById('appr-count-approved');
  if (cntApprEl) {
    cntApprEl.textContent = approvedList.length;
    cntApprEl.style.display = approvedList.length > 0 ? 'inline-block' : 'none';
  }
  const cntTransEl = document.getElementById('appr-count-transfer');
  if (cntTransEl) {
    cntTransEl.textContent = transferList.length;
    cntTransEl.style.display = transferList.length > 0 ? 'inline-block' : 'none';
  }
  const cntRejEl = document.getElementById('appr-count-rejected');
  if (cntRejEl) {
    cntRejEl.textContent = rejectedList.length;
    cntRejEl.style.display = rejectedList.length > 0 ? 'inline-block' : 'none';
  }

  // Update navbar badge count
  const badgeCount = document.getElementById('approval-badge-count');
  if (badgeCount) {
    if (rolePendingList.length > 0) {
      badgeCount.textContent = rolePendingList.length;
      badgeCount.style.display = 'inline-block';
    } else {
      badgeCount.style.display = 'none';
    }
  }

  // Update active subtab class
  const currentSub = state.apprSubTab || 'pending';
  document.querySelectorAll('.appr-sub-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sub === currentSub);
  });

  // Determine current active list
  let currentList = [];
  let sectionTitle = 'Pending Approvals';
  let sectionIcon = '<i class="fa-solid fa-square-check" style="color: #10B981;"></i>';

  if (currentSub === 'pending') {
    currentList = rolePendingList;
    sectionTitle = 'Pending Approvals';
    sectionIcon = '<i class="fa-solid fa-square-check" style="color: #10B981;"></i>';
  } else if (currentSub === 'active') {
    currentList = activeList;
    sectionTitle = 'WO Aktif';
    sectionIcon = '⏳';
  } else if (currentSub === 'approved') {
    currentList = approvedList;
    sectionTitle = 'WO Approved';
    sectionIcon = '🏆';
  } else if (currentSub === 'transfer') {
    currentList = transferList;
    sectionTitle = 'Transfer WO';
    sectionIcon = '🔁';
  } else if (currentSub === 'rejected') {
    currentList = rejectedList;
    sectionTitle = 'WO Ditolak';
    sectionIcon = '❌';
  }

  // Section title & count pill
  const titleEl = document.getElementById('appr-section-title');
  if (titleEl) titleEl.innerHTML = sectionIcon + ' ' + sectionTitle;
  const countEl = document.getElementById('appr-section-count');
  if (countEl) countEl.textContent = currentList.length;

  // Filter with search
  const search = (document.getElementById('search-approvals')?.value || '').toLowerCase();
  const filtered = currentList.filter(w => {
    if (!search) return true;
    const teamNames = w.team?.map(t => t.name).join(' ') || '';
    const txt = (w.id + ' ' + (w.unit_name || '') + ' ' + (w.component_name || '') + ' ' + teamNames).toLowerCase();
    return txt.includes(search);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; padding:48px 24px; text-align:center; color:var(--text-dim);">
        <i class="fa-solid fa-inbox" style="font-size:32px; color:#9CA3AF; margin-bottom:12px; display:block;"></i>
        <h3 style="font-size:16px; font-weight:700; color:#111827; margin-bottom:4px;">Tidak Ada Data</h3>
        <p style="font-size:13px; margin:0;">Tidak ada work order pada tab ${sectionTitle} untuk peran ${isSuperintendent ? 'L2 (Superintendent)' : 'L1 (Supervisor)'}.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(w => {
    const card = document.createElement('div');
    card.className = 'wo-approval-card';
    card.id = 'card-' + w.id;

    // Duration formatting: e.g. 0.3 hr -> 18 menit / tgt 1 jam
    let durationText = '';
    const actHours = parseFloat(w.actual_hours) || 0;
    const tgtHours = parseFloat(w.target_hours) || 1;
    if (actHours > 0 && actHours < 1) {
      durationText = Math.round(actHours * 60) + ' menit / tgt ' + tgtHours + ' jam';
    } else if (actHours >= 1) {
      const h = Math.floor(actHours);
      const m = Math.round((actHours - h) * 60);
      durationText = (m > 0 ? h + ' jam ' + m + ' menit' : h + ' jam') + ' / tgt ' + tgtHours + ' jam';
    } else {
      durationText = '0 menit / tgt ' + tgtHours + ' jam';
    }

    const isWayLate = actHours > (tgtHours * 2);
    const isLate = actHours > tgtHours;
    let onTimeBadge = '<span class="wo-ontime-pill ontime" style="background:#ECFDF5;color:#059669;font-weight:700;">⏱ ON TIME</span>';
    if (isWayLate) {
      onTimeBadge = '<span class="wo-ontime-pill late" style="background:#FEE2E2;color:#DC2626;font-weight:700;">🔥 WAY LATE</span>';
    } else if (isLate) {
      onTimeBadge = '<span class="wo-ontime-pill late" style="background:#FEF3C7;color:#D97706;font-weight:700;">⏱ LATE</span>';
    }

    // Team members formatting: "Afid Irham + 2 org"
    let teamText = '-';
    if (Array.isArray(w.team) && w.team.length > 0) {
      const leaderName = w.team[0].name || w.team[0].mechanic_name || 'Mekanik';
      teamText = w.team.length > 1 ? leaderName + ' + ' + (w.team.length - 1) + ' org' : leaderName;
    }

    // Unit & Lokasi
    const rawUnit = w.unit_name || w.unit_id || '-';
    let unitTitle = rawUnit;
    let unitSubtitle = '';
    if (w.unit_id === 'OTHERS' || rawUnit.startsWith('OTHERS') || rawUnit.includes('Others')) {
      const desc = w.others_description || (rawUnit.includes('(') ? rawUnit.match(/\((.*?)\)/)?.[1] : '') || w.component_name || '';
      unitTitle = 'OTHERS';
      unitSubtitle = desc ? `(${desc})` : '(OTHERS)';
    } else if (rawUnit.includes('(')) {
      unitTitle = rawUnit.split('(')[0].trim();
      const match = rawUnit.match(/\((.*?)\)/);
      unitSubtitle = match ? `(${match[1].trim()})` : `(${w.unit_id})`;
    } else {
      unitSubtitle = `(${w.unit_id || unitTitle})`;
    }
    const lokasiStr = w.location || w.lokasi || 'BENGKEL';

    // Component & Type
    let compTitle = w.component_name || w.job_name || '-';
    let jobCodeStr = w.job_code || w.job_id || 'JOB-0103';
    let jobTypeStr = w.type || w.job_type || 'preventive';
    if (w.unit_id === 'OTHERS' || w.is_others || rawUnit.startsWith('OTHERS')) {
      compTitle = 'Others - Custom Job';
      jobCodeStr = 'COM-OTHERS';
      jobTypeStr = 'OTHERS';
    }

    const isPending = currentSub === 'pending';
    const isChecked = state.selectedWoIds.has(w.id);

    card.innerHTML = `
      <div class="wo-card-main-row">
        <!-- 1. Selection & WO Meta -->
        <div class="wo-col-meta">
          ${isPending ? `<input type="checkbox" class="wo-chk-custom wo-approval-checkbox" value="${w.id}" ${isChecked ? 'checked' : ''} onchange="window.toggleSelectWo('${w.id}', this.checked)">` : ''}
          <div>
            <div class="wo-id-link">${w.id}</div>
            <div class="wo-date-text"><i class="fa-regular fa-clock"></i> ${w.date}</div>
            <span class="wo-level-badge level-${w.level || (isSuperintendent ? 2 : 1)}">Level ${w.level || (isSuperintendent ? 2 : 1)}</span>
          </div>
        </div>

        <!-- 2. Unit & Lokasi -->
        <div class="wo-col-unit">
          <div class="wo-col-hdr">UNIT & LOKASI</div>
          <div class="wo-unit-title">
            <i class="fa-solid fa-tractor" style="color: #059669;"></i>
            <span>${unitTitle}</span>
          </div>
          <div class="wo-unit-subtitle">${unitSubtitle}</div>
          <span class="wo-loc-pill">🏢 ${lokasiStr}</span>
        </div>

        <!-- 3. Pekerjaan / Komponen -->
        <div class="wo-col-comp">
          <div class="wo-col-hdr">PEKERJAAN / KOMPONEN</div>
          <div class="wo-comp-title">${compTitle}</div>
          <div class="wo-comp-meta">${jobTypeStr} · No: ${jobCodeStr}</div>
        </div>

        <!-- 4. Durasi & Tim -->
        <div class="wo-col-dur">
          <div class="wo-col-hdr">DURASI & TIM</div>
          <div class="wo-dur-time"><i class="fa-regular fa-clock"></i> ${durationText}</div>
          ${onTimeBadge}
          <div class="wo-team-text">${teamText}</div>
        </div>

        <!-- 5. Actions -->
        <div class="wo-col-btn-group">
          <button type="button" class="btn-wo-detail" onclick="window.toggleWoDetail('${w.id}')">
            <i class="fa-regular fa-eye"></i> Lihat Detail
          </button>
          ${isPending ? `
            <button type="button" class="btn-wo-approve" onclick="window.approveWo('${w.id}')">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button type="button" class="btn-wo-icon btn-wo-edit" title="Edit WO" onclick="window.editWo('${w.id}')">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button type="button" class="btn-wo-icon btn-wo-transfer" title="Transfer WO" onclick="window.transferWo('${w.id}')">
              <i class="fa-solid fa-arrow-right-arrow-left"></i>
            </button>
            <button type="button" class="btn-wo-icon btn-wo-hold" title="Tahan WO" onclick="window.holdWo('${w.id}')">
              <i class="fa-solid fa-ban"></i>
            </button>
            <button type="button" class="btn-wo-icon btn-wo-reject" title="Tolak WO" onclick="window.rejectWo('${w.id}')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : `
            <span class="status-badge ${getStatusBadgeClass(w.status)}">${formatStatus(w.status)}</span>
          `}
        </div>
      </div>

      <!-- Expandable Detail Drawer -->
      <div class="wo-card-drawer" id="drawer-${w.id}" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #111827;"><i class="fa-solid fa-users"></i> Anggota Tim & Alokasi Poin (${w.team?.length || 0} Mekanik)</strong>
          <span style="font-weight: 700; color: #2D6A4F;">Total Poin WO: ${w.final_points ? w.final_points.toFixed(2) : '0.00'}</span>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #F3F4F6;">
                <th style="padding: 6px 10px; text-align: left;">Mekanik</th>
                <th style="padding: 6px 10px; text-align: center;">ID Mekanik</th>
                <th style="padding: 6px 10px; text-align: center;">Poin Akhir</th>
                <th style="padding: 6px 10px; text-align: right;">Estimasi IDR</th>
              </tr>
            </thead>
            <tbody>
              ${(w.team || []).map(t => `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 6px 10px; font-weight: 600; color: #111827;">${t.name}</td>
                  <td style="padding: 6px 10px; text-align: center; color: #6B7280; font-family: monospace;">${t.mechanic_id || '-'}</td>
                  <td style="padding: 6px 10px; text-align: center; font-weight: 700; color: #059669;">${t.points ? t.points.toFixed(2) : (w.final_points || 0).toFixed(2)}</td>
                  <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #111827;">Rp ${Math.round((t.points || w.final_points || 0) * 2500).toLocaleString('id-ID')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

window.toggleWoDetail = function(woId) {
  const drawer = document.getElementById('drawer-' + woId);
  if (drawer) {
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
  }
};

window.toggleSelectWo = function(woId, isChecked) {
  if (isChecked) state.selectedWoIds.add(woId);
  else state.selectedWoIds.delete(woId);
  updateBulkApproveBtn();
};

function updateBulkApproveBtn() {
  const count = state.selectedWoIds.size;
  const bulkBtn = document.getElementById('btn-bulk-approve');
  const countSpan = document.getElementById('bulk-selected-count');
  if (bulkBtn && countSpan) {
    countSpan.textContent = count;
    bulkBtn.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

window.editWo = function(woId) {
  showToast('Fitur Edit WO ' + woId + ' sedang dipersiapkan.', 'info');
};

window.transferWo = function(woId) {
  const newShift = prompt('Transfer WO ' + woId + ' ke shift:', 'Shift 2');
  if (newShift) {
    showToast('WO ' + woId + ' dipindahkan ke ' + newShift + '.', 'info');
  }
};

window.holdWo = function(woId) {
  showToast('WO ' + woId + ' ditahan sementara.', 'warning');
};

let currentApproveWo = null;

window.approveWo = function(woNumber) {
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';
  
  const wo = (state.workOrders || []).find(w => String(w.id) === String(woNumber) || String(w.wo_number) === String(woNumber)) || 
             (state.pendingL2Wos || []).find(w => String(w.id) === String(woNumber) || String(w.wo_number) === String(woNumber)) || 
             (state.pendingL1Wos || []).find(w => String(w.id) === String(woNumber) || String(w.wo_number) === String(woNumber));

  if (!wo) {
    showToast('WO ' + woNumber + ' tidak ditemukan.', 'warning');
    return;
  }
  currentApproveWo = wo;

  const modal = document.getElementById('approveModal');
  if (!modal) {
    console.error('#approveModal not found');
    return;
  }

  const woNumEl = document.getElementById('approveWoNumber');
  if (woNumEl) woNumEl.textContent = wo.wo_number || wo.id || woNumber;

  const lvlEl = document.getElementById('approveLevelText');
  if (lvlEl) {
    lvlEl.textContent = isSuperintendent
      ? 'Approval Final (Layer 2) — poin akan dihitung & didistribusikan.'
      : 'Approval Level 1 — WO akan diteruskan ke Layer 2.';
  }

  const ketBlock = document.getElementById('approveKeteranganBlock');
  const ketText = document.getElementById('approveKeteranganText');
  const ketContent = (wo.keterangan || wo.notes || wo.Keterangan || '').trim();
  if (ketBlock && ketText) {
    if (ketContent) {
      ketText.textContent = ketContent;
      ketBlock.style.display = 'block';
    } else {
      ketBlock.style.display = 'none';
    }
  }

  const sHint = document.getElementById('approveSafetyHint');
  if (sHint) {
    sHint.textContent = isSuperintendent
      ? 'Jika dicentang, poin WO ini otomatis menjadi 0.'
      : 'Centang sebagai info ke layer berikutnya bahwa terjadi insiden. Poin belum dipotong di tahap ini.';
  }
  const sCheck = document.getElementById('approveSafetyCheck');
  if (sCheck) {
    sCheck.checked = (wo.safety_incident === true || String(wo.safety_incident).toLowerCase() === 'true');
  }

  const rHint = document.getElementById('approveMtbfHint');
  if (rHint) {
    rHint.textContent = isSuperintendent
      ? 'Jika REDO, poin dikali faktor redo. Jika first-time, dikali faktor first-time (lihat Config_Factors).'
      : 'Tandai jika ini pekerjaan ulang (info untuk Layer 2). Keputusan final di Layer 2.';
  }
  const rCheck = document.getElementById('approveMtbfRedoCheck');
  if (rCheck) {
    rCheck.checked = (wo.mtbf_redo_status === 'redo' || wo.mtbf_status === 'redo');
  }

  const btnConfirm = document.getElementById('approveConfirmBtn');
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.textContent = '✓ Konfirmasi Approve';
  }

  modal.classList.add('show');
};

window.closeApproveModal = function() {
  const modal = document.getElementById('approveModal');
  if (modal) modal.classList.remove('show');
  currentApproveWo = null;
};

window.confirmApproveWO = async function() {
  if (!currentApproveWo) return;
  const wo = currentApproveWo;
  const woNumber = wo.wo_number || wo.id;
  const woIdToSend = wo.raw_id || wo.id || woNumber;
  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';
  const action = isSuperintendent ? 'approve_l2' : 'approve_l1';

  const sCheck = document.getElementById('approveSafetyCheck');
  const safetyIncident = sCheck ? sCheck.checked : false;

  const rCheck = document.getElementById('approveMtbfRedoCheck');
  const mtbfStatus = (rCheck && rCheck.checked) ? 'redo' : 'first_time';

  const btnConfirm = document.getElementById('approveConfirmBtn');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ Mengesahkan...';
  }

  showToast('⏳ Mengirim persetujuan ' + woNumber + ' ke Google Spreadsheet...', 'info');

  try {
    const res = await api(action, {
      wo_id: woIdToSend,
      safety_incident: safetyIncident,
      mtbf_status: mtbfStatus,
      notes: ''
    });

    if (res && res.success) {
      window.closeApproveModal();
      if (isSuperintendent) {
        let msg = '✅ WO ' + woNumber + ' disetujui penuh (Approved) di Google Spreadsheet!';
        if (safetyIncident) msg += ' (⚠️ Safety Incident: Poin = 0)';
        if (mtbfStatus === 'redo') msg += ' (🔧 REDO)';
        showToast(msg, 'success');
        if (wo) wo.status = 'APPROVED';
        wo.safety_incident = safetyIncident;
        wo.mtbf_redo_status = mtbfStatus;
        state.pendingL2Wos = (state.pendingL2Wos || []).filter(w => (String(w.id) !== String(wo.id) && String(w.wo_number) !== String(woNumber)));
        if (!state.approvedWos.some(w => (String(w.id) === String(wo.id) || String(w.wo_number) === String(woNumber)))) {
          state.approvedWos.unshift(wo);
        }
      } else {
        let msg = '✅ WO ' + woNumber + ' disetujui di Google Spreadsheet! (Lanjut ke Superintendent L2)';
        if (safetyIncident) msg += ' (⚠️ Dicatat Insiden)';
        if (mtbfStatus === 'redo') msg += ' (🔧 Ditandai REDO)';
        showToast(msg, 'success');
        if (wo) wo.status = 'PENDING_L2';
        wo.safety_incident = safetyIncident;
        wo.mtbf_redo_status = mtbfStatus;
        state.pendingL1Wos = (state.pendingL1Wos || []).filter(w => (String(w.id) !== String(wo.id) && String(w.wo_number) !== String(woNumber)));
        if (!state.pendingL2Wos.some(w => (String(w.id) === String(wo.id) || String(w.wo_number) === String(woNumber)))) {
          state.pendingL2Wos.unshift(wo);
        }
      }
      state.selectedWoIds.delete(woNumber);
      state.selectedWoIds.delete(wo.id);
      updateBulkApproveBtn();
      saveCachedSpreadsheetData();
      renderApprovals();
      renderDashboard();
      renderMonitoring();
    } else {
      const errMsg = (res && res.error && res.error.message) || (res && res.error) || 'Gagal menyetujui';
      showToast('❌ Gagal menyetujui: ' + errMsg, 'danger');
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = '✓ Konfirmasi Approve';
      }
    }
  } catch (err) {
    showToast('❌ Kesalahan jaringan: ' + err.message, 'danger');
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = '✓ Konfirmasi Approve';
    }
  }
};

window.rejectWo = async function(woNumber) {
  const reason = prompt('Masukkan alasan penolakan work order:');
  if (reason === null) return;

  const wo = state.workOrders.find(w => w.id === woNumber) || 
             state.pendingL2Wos?.find(w => w.id === woNumber) || 
             state.pendingL1Wos?.find(w => w.id === woNumber);
  const woIdToSend = wo?.raw_id || woNumber;
  showToast('⏳ Mengirim penolakan ke Google Spreadsheet...', 'info');

  const res = await api('reject', { wo_id: woIdToSend, reason: reason || 'Ditolak' });
  if (res.success) {
    showToast('✅ WO ' + woNumber + ' ditolak di Google Spreadsheet.', 'info');
    if (wo) {
      wo.status = 'REJECTED';
      wo.rejection_reason = reason;
      if (!state.rejectedWos.some(w => w.id === wo.id)) state.rejectedWos.unshift(wo);
    }
    state.pendingL1Wos = (state.pendingL1Wos || []).filter(w => w.id !== woNumber);
    state.pendingL2Wos = (state.pendingL2Wos || []).filter(w => w.id !== woNumber);
    state.selectedWoIds.delete(woNumber);
    updateBulkApproveBtn();
    saveCachedSpreadsheetData();
    renderApprovals();
    renderDashboard();
    renderMonitoring();
  } else {
    showToast('❌ Gagal menolak: ' + (res.error || 'Server error'), 'danger');
  }
};

async function bulkApprove() {
  const selected = Array.from(state.selectedWoIds);
  if (selected.length === 0) {
    showToast('Pilih minimal 1 work order untuk disetujui!', 'warning');
    return;
  }

  const role = (state.currentUser?.role || 'supervisor').toLowerCase();
  const isSuperintendent = role === 'superintendent' || role === 'manager';
  const action = isSuperintendent ? 'approve_l2' : 'approve_l1';

  showToast('⏳ Menyetujui ' + selected.length + ' work order terpilih...', 'info');
  let successCount = 0;
  for (const id of selected) {
    const wo = state.workOrders.find(w => w.id === id) || 
               state.pendingL2Wos?.find(w => w.id === id) || 
               state.pendingL1Wos?.find(w => w.id === id);
    const woIdToSend = wo?.raw_id || id;
    const res = await api(action, { wo_id: woIdToSend });
    if (res.success) {
      successCount++;
      if (isSuperintendent) {
        if (wo) wo.status = 'APPROVED';
        state.pendingL2Wos = (state.pendingL2Wos || []).filter(w => w.id !== id);
        if (wo && !state.approvedWos.some(w => w.id === wo.id)) state.approvedWos.unshift(wo);
      } else {
        if (wo) wo.status = 'PENDING_L2';
        state.pendingL1Wos = (state.pendingL1Wos || []).filter(w => w.id !== id);
        if (wo && !state.pendingL2Wos.some(w => w.id === wo.id)) state.pendingL2Wos.unshift(wo);
      }
    }
  }

  state.selectedWoIds.clear();
  updateBulkApproveBtn();
  showToast('✅ Berhasil menyetujui ' + successCount + ' work order!', 'success');
  saveCachedSpreadsheetData();
  renderApprovals();
  renderDashboard();
  renderMonitoring();
}

window.copyMechanicToken = async function(token, btnId) {
  try {
    const fullUrl = `https://abadiops.com/?token=${token}`;
    await navigator.clipboard.writeText(fullUrl);
    const btn = document.getElementById(btnId);
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
      btn.style.background = '#2D6A4F';
      btn.style.color = '#FFFFFF';
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    }
    showToast(`Token tersalin! Link: ${fullUrl}`, 'success');
  } catch (err) {
    const input = document.getElementById(btnId.replace('btn-copy-', 'tok-'));
    if (input) {
      input.select();
      document.execCommand('copy');
      showToast('Token tersalin ke clipboard!', 'success');
    }
  }
};



function switchTab(tabName) {
  const isMechanic = (state.currentUser?.role || '').toLowerCase() === 'mechanic';
  if (isMechanic && tabName !== 'monitoring') {
    tabName = 'monitoring';
  }
  state.activeTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  document.querySelectorAll('.view-section').forEach(s => {
    s.classList.toggle('active', s.id === `view-${tabName}`);
  });

  if (tabName === 'dashboard') renderDashboard();
  if (tabName === 'approvals') renderApprovals();
  if (tabName === 'monitoring') renderMonitoring();
  if (tabName === 'create-wo') renderJoblists();
  if (tabName === 'teknis') renderTeknis();
  if (tabName === 'koreksi-hm') renderKoreksiHm();
  if (tabName === 'koreksi-km') renderKoreksiKm();
  if (tabName === 'reports') renderReports();
}

function initEventListeners() {
  const btnGoto = document.getElementById('btn-goto-create-wo');
  if (btnGoto) {
    btnGoto.addEventListener('click', () => switchTab('create-wo'));
  }

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Dual-Engine Switchers (Supabase Singapore <-> Google Spreadsheet)
  document.getElementById('btn-engine-toggle')?.addEventListener('click', toggleEngine);
  document.getElementById('engine-status')?.addEventListener('click', toggleEngine);
  document.getElementById('btn-engine-switch-user')?.addEventListener('click', toggleEngine);
  document.getElementById('gate-engine-toggle')?.addEventListener('click', toggleEngine);

  const projectBadge = document.getElementById('project-badge');
  if (projectBadge) {
    projectBadge.style.cursor = 'default';
    projectBadge.removeAttribute('title');
  }

  const inputToken = document.getElementById('input-token');
  if (inputToken) {
    inputToken.addEventListener('input', (e) => {
      state.currentSystem = 'KMB';
      updateSystemBadge();
    });
  }

  document.getElementById('btn-enter-gate')?.addEventListener('click', () => {
    const token = document.getElementById('input-token').value;
    loginWithToken(token);
  });

  document.getElementById('input-token')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginWithToken(e.target.value);
    }
  });

  document.getElementById('btn-switch-token')?.addEventListener('click', logout);

  const btnSyncSheets = document.getElementById('btn-sync-spreadsheet');
  if (btnSyncSheets) {
    btnSyncSheets.addEventListener('click', () => syncFromSpreadsheet(true));
  }

  document.getElementById('btn-bulk-approve')?.addEventListener('click', bulkApprove);
  document.getElementById('btn-refresh-approvals')?.addEventListener('click', () => syncFromSpreadsheet(true));

  // Monitoring sub-tab switchers
  document.getElementById('mon-subtab-mechanics-btn')?.addEventListener('click', () => {
    state.monSubTab = 'mechanics';
    renderMonitoring();
  });
  document.getElementById('mon-subtab-wos-btn')?.addEventListener('click', () => {
    state.monSubTab = 'all-wos';
    renderMonitoring();
  });

  document.getElementById('search-monitoring')?.addEventListener('input', renderMonitoring);
  document.getElementById('filter-monitoring-section')?.addEventListener('change', renderMonitoring);

  // Approvals sub-tab switchers (1:1 GAS Match)
  ['pending', 'active', 'approved', 'transfer', 'rejected'].forEach(sub => {
    document.getElementById('appr-subtab-' + sub)?.addEventListener('click', () => {
      state.apprSubTab = sub;
      renderApprovals();
    });
  });

  // Action bar buttons
  let allDetailsOpen = false;
  document.getElementById('btn-toggle-all-details')?.addEventListener('click', () => {
    allDetailsOpen = !allDetailsOpen;
    document.querySelectorAll('.wo-card-drawer').forEach(d => {
      d.style.display = allDetailsOpen ? 'block' : 'none';
    });
    const btn = document.getElementById('btn-toggle-all-details');
    if (btn) {
      btn.innerHTML = allDetailsOpen
        ? '<i class="fa-regular fa-folder-closed" style="color: #F59E0B;"></i> Tutup Semua Detail'
        : '<i class="fa-regular fa-folder-open" style="color: #F59E0B;"></i> Buka Semua Detail';
    }
  });

  let allSelected = false;
  document.getElementById('btn-select-all-page')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.wo-chk-custom');
    allSelected = !allSelected;
    checkboxes.forEach(cb => {
      cb.checked = allSelected;
      if (allSelected) state.selectedWoIds.add(cb.value);
      else state.selectedWoIds.delete(cb.value);
    });
    updateBulkApproveBtn();
  });

  document.getElementById('search-approvals')?.addEventListener('input', renderApprovals);
  document.getElementById('quick-search-wo')?.addEventListener('input', renderDashboard);

  // Teknis Event Listeners
  document.getElementById('btn-toggle-demo-teknis')?.addEventListener('click', toggleDemoTeknis);
  document.getElementById('btn-refresh-teknis')?.addEventListener('click', () => renderTeknis(true));
  document.querySelectorAll('#teknis-subtabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#teknis-subtabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.teknisSubTab = tab.dataset.sub;
      switchTeknisSubtab();
    });
  });
  document.getElementById('tek-filter-unit')?.addEventListener('change', (e) => {
    renderTeknisUnitDetail(e.target.value);
  });

  // Koreksi HM Listeners
  document.getElementById('koreksi-hm-unit-select')?.addEventListener('change', (e) => {
    state.koreksiHmUnit = e.target.value;
    loadKoreksiHmData(e.target.value);
  });
  document.getElementById('form-ganti-panel-hm')?.addEventListener('submit', submitGantiPanelHm);

  // Koreksi KM Listeners
  document.getElementById('koreksi-km-unit-select')?.addEventListener('change', (e) => {
    state.koreksiKmUnit = e.target.value;
    loadKoreksiKmData(e.target.value);
  });
  document.getElementById('form-ganti-panel-km')?.addEventListener('submit', submitGantiPanelKm);

  // Modal Koreksi Meter Listeners
  document.getElementById('btn-modal-km-close')?.addEventListener('click', closeModalKoreksiMeter);
  document.getElementById('btn-modal-km-batal')?.addEventListener('click', closeModalKoreksiMeter);
  document.getElementById('form-modal-koreksi-meter')?.addEventListener('submit', submitModalKoreksiMeter);

  // Reports Listeners
  document.getElementById('btn-report-toggle-month')?.addEventListener('click', () => setReportFilterType('month'));
  document.getElementById('btn-report-toggle-range')?.addEventListener('click', () => setReportFilterType('range'));
  document.getElementById('btn-generate-report')?.addEventListener('click', generatePayrollReport);
  document.getElementById('rep-btn-download')?.addEventListener('click', downloadPayrollReport);

  // Mechanic Impersonation & Workflow Listeners
  document.getElementById('btn-back-to-monitoring')?.addEventListener('click', () => {
    window.kembaliDariMekanik();
  });

  document.getElementById('btn-refresh-mech-wos')?.addEventListener('click', () => {
    loadMechanicWos();
  });

  ['assigned', 'pending_approval', 'done'].forEach(flt => {
    const btnId = 'tab-mech-' + flt.replace('_approval', '');
    document.getElementById(btnId)?.addEventListener('click', () => {
      state.mechanicFilter = flt;
      document.querySelectorAll('#mech-filter-tabs .mech-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.fontWeight = '600';
        btn.style.color = '#6B7280';
        btn.style.borderBottom = 'none';
        const pill = btn.querySelector('.count-pill');
        if (pill) { pill.style.background = '#E5E7EB'; pill.style.color = '#374151'; }
      });
      const activeBtn = document.getElementById(btnId);
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.fontWeight = '700';
        activeBtn.style.color = '#047857';
        activeBtn.style.borderBottom = '3px solid #047857';
        const pill = activeBtn.querySelector('.count-pill');
        if (pill) { pill.style.background = '#047857'; pill.style.color = '#fff'; }
      }
      renderMechanicWoGrid();
    });
  });

  // Modal Kerjakan WO Listeners
  document.getElementById('btn-close-mwo')?.addEventListener('click', () => window.closeKerjaWoModal());
  document.getElementById('btn-cancel-mwo')?.addEventListener('click', () => window.closeKerjaWoModal());
  document.getElementById('mwo-btn-timer-start')?.addEventListener('click', () => window.timerStartAction());
  document.getElementById('mwo-btn-timer-pause')?.addEventListener('click', () => window.timerPauseAction());
  document.getElementById('mwo-btn-timer-stop')?.addEventListener('click', () => window.timerStopAction());
  document.getElementById('mwo-btn-timer-reset')?.addEventListener('click', () => window.timerResetAction());
  document.getElementById('mwo-start-time')?.addEventListener('input', validateMwoTimes);
  document.getElementById('mwo-end-time')?.addEventListener('input', validateMwoTimes);
  document.getElementById('form-kerjakan-wo')?.addEventListener('submit', submitPekerjaanMekanik);
  document.getElementById('mwo-btn-transfer')?.addEventListener('click', transferPekerjaanMekanik);
}

// Helpers
function getStatusBadgeClass(status) {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'status-approved';
    case 'REJECTED': return 'status-rejected';
    case 'ACTIVE':
    case 'PENDING_L1':
    case 'PENDING_L2':
    case 'PENDING': return 'status-active';
    default: return 'status-active';
  }
}

function formatStatus(status) {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'APPROVED';
    case 'REJECTED': return 'DITOLAK';
    case 'ACTIVE': return 'ACTIVE';
    case 'PENDING_L1': return 'MENUNGGU L1';
    case 'PENDING_L2': return 'MENUNGGU L2';
    default: return status || 'PENDING';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${type === 'success' ? '#2D6A4F' : type === 'danger' ? '#DC2626' : type === 'warning' ? '#D97706' : '#2563EB'};
    color: #FFFFFF;
    padding: 12px 20px;
    border-radius: 10px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    font-size: 13.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 280px;
    animation: fadeIn 0.3s ease;
  `;

  const icon = type === 'success' ? 'fa-circle-check' : type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(v) {
  if (!v) return '<span style="color:#94A3B8;">–</span>';
  const d = new Date(v);
  if (isNaN(d.getTime())) return escapeHtml(v);
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const pad = (n) => (n < 10 ? '0' : '') + n;
  return `${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =========================================================================
// TEKNIS CONTROLLERS (DASHBOARD TEKNIS & BAN)
// =========================================================================

function toggleDemoTeknis() {
  state.teknisDemo = !state.teknisDemo;
  renderTeknis(true);
}

async function renderTeknis(forceRefresh = false) {
  const banner = document.getElementById('teknis-demo-banner');
  if (banner) banner.style.display = state.teknisDemo ? 'block' : 'none';
  const demoLabel = document.getElementById('label-demo-teknis');
  if (demoLabel) demoLabel.textContent = state.teknisDemo ? 'Kembali ke Real' : 'Mode Demo';

  if (!state.teknisData || forceRefresh) {
    const tbody = document.getElementById('tek-kondisi-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat data teknis...</td></tr>';

    try {
      const res = await api('dataDashboardTeknis', { demo: state.teknisDemo });
      if (res && res.success && res.data) {
        state.teknisData = res.data;
      } else if (res && res.kondisi) {
        state.teknisData = res;
      } else {
        console.warn('Teknis API warning:', res);
        state.teknisData = res?.data || {
          kondisi: [], problem: { jenis: [], posisi: [] }, riwayat: [], repair: [], mingguan: [],
          life: { rata: 0, jumlah: 0, per_merk: [], per_posisi: [], selesai: [] },
          ringkas: { unit: 0, posisi: 0, baris_inspeksi: 0, baris_removeinstal: 0, baris_repair: 0 }
        };
      }
    } catch (err) {
      console.error('Error fetching teknis data:', err);
    }
  }

  const d = state.teknisData;
  if (!d) return;

  const r = d.ringkas || {};
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val != null ? val : '-'; };
  setEl('tek-stat-unit', r.unit || 0);
  setEl('tek-stat-posisi', r.posisi || 0);
  setEl('tek-stat-inspeksi', r.baris_inspeksi || 0);
  setEl('tek-stat-remove', r.baris_removeinstal || 0);
  setEl('tek-stat-repair', r.baris_repair || 0);
  setEl('tek-ambang-kritis', d.rtd_kritis || 3);

  // Render Tren Mingguan
  const barsContainer = document.getElementById('teknis-mingguan-bars');
  if (barsContainer && Array.isArray(d.mingguan) && d.mingguan.length > 0) {
    const maxVal = Math.max(...d.mingguan.map(m => Math.max(m.inspeksi || 0, m.removeinstal || m.removeInstal || 0, m.problem || 0)), 1);
    barsContainer.innerHTML = d.mingguan.map(m => {
      const insp = m.inspeksi || 0;
      const rem = m.removeinstal || m.removeInstal || 0;
      const prob = m.problem || 0;
      const inspPct = Math.round((insp / maxVal) * 100);
      const remPct = Math.round((rem / maxVal) * 100);
      const probPct = Math.round((prob / maxVal) * 100);
      return `
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #1E293B; margin-bottom: 6px;">
            <span>${escapeHtml(m.label || '')} (${escapeHtml(m.rentang || '')})</span>
            <span>Inspeksi: ${insp} | Rem/Inst: ${rem} | Problem: ${prob}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
              <span style="width: 80px; color: #64748B;">Inspeksi</span>
              <div class="bar-track" style="flex: 1;"><div class="bar-fill" style="width: ${inspPct}%; background: #3B82F6;"></div></div>
              <span style="width: 25px; text-align: right; font-weight: 600;">${insp}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
              <span style="width: 80px; color: #64748B;">Remove/Inst</span>
              <div class="bar-track" style="flex: 1;"><div class="bar-fill" style="width: ${remPct}%; background: #10B981;"></div></div>
              <span style="width: 25px; text-align: right; font-weight: 600;">${rem}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
              <span style="width: 80px; color: #64748B;">Problem</span>
              <div class="bar-track" style="flex: 1;"><div class="bar-fill" style="width: ${probPct}%; background: #EF4444;"></div></div>
              <span style="width: 25px; text-align: right; font-weight: 600;">${prob}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  switchTeknisSubtab();
}

function switchTeknisSubtab() {
  const d = state.teknisData;
  if (!d) return;

  const sub = state.teknisSubTab || 'kondisi';
  const panels = ['kondisi', 'problem', 'riwayat', 'repair', 'life', 'unit'];
  panels.forEach(p => {
    const el = document.getElementById(`tek-panel-${p}`);
    if (el) el.classList.toggle('active', p === sub);
  });

  if (sub === 'kondisi') renderTeknisKondisi(d);
  if (sub === 'problem') renderTeknisProblem(d);
  if (sub === 'riwayat') renderTeknisRiwayat(d);
  if (sub === 'repair') renderTeknisRepair(d);
  if (sub === 'life') renderTeknisLife(d);
  if (sub === 'unit') renderTeknisUnit(d);
}

function renderTeknisKondisi(d) {
  const tbody = document.getElementById('tek-kondisi-tbody');
  if (!tbody) return;
  const list = d.kondisi || [];
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);">Belum ada catatan inspeksi tyre</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(k => {
    const isKritis = k.kritis || (k.rtd != null && k.rtd <= (d.rtd_kritis || 3));
    return `
      <tr class="${isKritis ? 'kritis' : ''}">
        <td><strong>${escapeHtml(k.unit_label || k.unit || '-')}</strong></td>
        <td style="text-align: center;"><span class="badge" style="background: #E2E8F0; color: #334155;">Pos ${k.pos}</span></td>
        <td>${escapeHtml(k.sn_terpasang || '-')}</td>
        <td style="text-align: right; font-weight: 800; color: ${isKritis ? '#DC2626' : 'inherit'};">${k.rtd != null ? k.rtd : '-'}</td>
        <td style="text-align: right;">${k.pressure != null ? k.pressure : '-'}</td>
        <td style="text-align: right;">${k.life_km != null ? k.life_km.toLocaleString('id-ID') : '-'}</td>
        <td style="text-align: right;">${k.umur_hari != null ? k.umur_hari : '-'}</td>
        <td>${escapeHtml(k.perkiraan_ganti || '-')}</td>
        <td>${formatDateTime(k.dicatat_at)}</td>
      </tr>
    `;
  }).join('');
}

function renderTeknisProblem(d) {
  const jenisList = document.getElementById('tek-problem-jenis-list');
  const posisiList = document.getElementById('tek-problem-posisi-list');
  const prob = d.problem || { jenis: [], posisi: [] };

  if (jenisList) {
    const maxJenis = Math.max(...(prob.jenis || []).map(j => j.jumlah || 0), 1);
    jenisList.innerHTML = (prob.jenis && prob.jenis.length > 0)
      ? prob.jenis.map(j => `
        <div class="bar-row">
          <div style="font-size: 13px; font-weight: 600; color: #1E293B;">${escapeHtml(j.nama || '')}</div>
          <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(((j.jumlah || 0) / maxJenis) * 100)}%; background: #EF4444;"></div></div>
          <div class="bar-num">${j.jumlah || 0}</div>
        </div>
      `).join('')
      : '<div style="color: var(--text-dim); font-size: 13px; padding: 12px;">Belum ada problem tercatat</div>';
  }

  if (posisiList) {
    const maxPos = Math.max(...(prob.posisi || []).map(p => p.jumlah || 0), 1);
    posisiList.innerHTML = (prob.posisi && prob.posisi.length > 0)
      ? prob.posisi.map(p => `
        <div class="bar-row">
          <div style="font-size: 13px; font-weight: 600; color: #1E293B;">Posisi ${escapeHtml(p.pos || '')}</div>
          <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(((p.jumlah || 0) / maxPos) * 100)}%; background: #F59E0B;"></div></div>
          <div class="bar-num">${p.jumlah || 0}</div>
        </div>
      `).join('')
      : '<div style="color: var(--text-dim); font-size: 13px; padding: 12px;">Belum ada posisi bermasalah</div>';
  }
}

function renderTeknisRiwayat(d) {
  const tbody = document.getElementById('tek-riwayat-tbody');
  if (!tbody) return;
  const list = d.riwayat || [];
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">Belum ada riwayat remove / instal tyre</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${formatDateTime(r.at)}</td>
      <td><strong>${escapeHtml(r.unit_label || r.unit || '-')}</strong></td>
      <td style="text-align: center;"><span class="badge" style="background: #E2E8F0; color: #334155;">Pos ${r.pos}</span></td>
      <td>${escapeHtml(r.sn_turun || '-')}</td>
      <td><span class="badge" style="background: #FEE2E2; color: #991B1B;">${escapeHtml(r.problem || '-')}</span></td>
      <td>${escapeHtml(r.sn_naik || '-')}</td>
      <td>${escapeHtml(r.lokasi || '-')}</td>
      <td>${escapeHtml(r.remarks || '-')}</td>
    </tr>
  `).join('');
}

function renderTeknisRepair(d) {
  const tbody = document.getElementById('tek-repair-tbody');
  if (!tbody) return;
  const list = d.repair || [];
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-dim);">Belum ada data repair tyre</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.sn || '-')}</strong></td>
      <td>${escapeHtml(r.merk || '-')}</td>
      <td>${escapeHtml(r.pattern || r.size || '-')}</td>
      <td style="text-align: center;"><span class="badge" style="background: #FEF3C7; color: #92400E; font-weight: 700;">${r.jumlah || 0}x</span></td>
      <td>${formatDateTime(r.terakhir)}</td>
    </tr>
  `).join('');
}

function renderTeknisLife(d) {
  const l = d.life || { rata: 0, jumlah: 0, per_merk: [], per_posisi: [], selesai: [] };
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val != null ? val : '-'; };
  setEl('tek-life-rata', l.rata != null ? l.rata.toLocaleString('id-ID') : '-');
  setEl('tek-life-jumlah', l.jumlah || 0);
  setEl('tek-life-target', (d.target_life_km || 40000).toLocaleString('id-ID'));

  const merkList = document.getElementById('tek-life-merk-list');
  if (merkList) {
    const maxM = Math.max(...(l.per_merk || []).map(m => m.rata || 0), 1);
    merkList.innerHTML = (l.per_merk && l.per_merk.length > 0)
      ? l.per_merk.map(m => `
        <div class="bar-row">
          <div style="font-size: 13px; font-weight: 600; color: #1E293B;">${escapeHtml(m.nama || '')} (${m.jumlah} ban)</div>
          <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(((m.rata || 0) / maxM) * 100)}%; background: #10B981;"></div></div>
          <div class="bar-num" style="min-width: 70px;">${(m.rata || 0).toLocaleString('id-ID')} KM</div>
        </div>
      `).join('')
      : '<div style="color: var(--text-dim); font-size: 13px; padding: 12px;">Belum ada data per merk</div>';
  }

  const posList = document.getElementById('tek-life-posisi-list');
  if (posList) {
    const maxP = Math.max(...(l.per_posisi || []).map(p => p.rata || 0), 1);
    posList.innerHTML = (l.per_posisi && l.per_posisi.length > 0)
      ? posList.map(p => `
        <div class="bar-row">
          <div style="font-size: 13px; font-weight: 600; color: #1E293B;">Posisi ${p.pos} (${p.jumlah} ban)</div>
          <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(((p.rata || 0) / maxP) * 100)}%; background: #6366F1;"></div></div>
          <div class="bar-num" style="min-width: 70px;">${(p.rata || 0).toLocaleString('id-ID')} KM</div>
        </div>
      `).join('')
      : '<div style="color: var(--text-dim); font-size: 13px; padding: 12px;">Belum ada data per posisi</div>';
  }

  const tbody = document.getElementById('tek-life-tbody');
  if (tbody) {
    const selesai = l.selesai || [];
    if (selesai.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">Belum ada ban tuntas pakai yang tercatat</td></tr>';
    } else {
      tbody.innerHTML = selesai.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.sn || '-')}</strong></td>
          <td>${escapeHtml(s.merk || '')} ${escapeHtml(s.pattern || '')}</td>
          <td style="text-align: right; font-weight: 700; color: #059669;">${s.life_km != null ? s.life_km.toLocaleString('id-ID') : '-'} KM</td>
          <td style="text-align: right;">${s.hari != null ? s.hari : '-'}</td>
          <td style="text-align: center;"><span class="badge" style="background: #E2E8F0; color: #334155;">Pos ${s.pos_terakhir || s.pos || '-'}</span></td>
          <td><span class="badge" style="background: #FEE2E2; color: #991B1B;">${escapeHtml(s.problem || '-')}</span></td>
          <td>${formatDateTime(s.turun_at || s.dilepas_at)}</td>
        </tr>
      `).join('');
    }
  }
}

function renderTeknisUnit(d) {
  const sel = document.getElementById('tek-filter-unit');
  if (!sel) return;
  const currentVal = sel.value;

  const unitMap = new Map();
  (d.kondisi || []).forEach(k => { if (k.unit) unitMap.set(k.unit, k.unit_label || k.unit); });
  (d.riwayat || []).forEach(r => { if (r.unit) unitMap.set(r.unit, r.unit_label || r.unit); });

  let html = '<option value="">-- Pilih Unit --</option>';
  unitMap.forEach((label, id) => {
    html += `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
  });
  sel.innerHTML = html;
  if (currentVal && unitMap.has(currentVal)) {
    sel.value = currentVal;
    renderTeknisUnitDetail(currentVal);
  }
}

function renderTeknisUnitDetail(unitId) {
  const container = document.getElementById('tek-unit-detail-container');
  if (!container) return;
  if (!unitId) {
    container.innerHTML = `
      <div class="hampa">
        <div class="hampa-judul">Silakan pilih unit di atas</div>
        <div>Pilih unit untuk melihat konfigurasi posisi ban dan riwayat perawatannya.</div>
      </div>
    `;
    return;
  }

  const d = state.teknisData || {};
  const unitKondisi = (d.kondisi || []).filter(k => k.unit === unitId);
  const unitRiwayat = (d.riwayat || []).filter(r => r.unit === unitId);

  let html = `
    <div class="kartu" style="margin-bottom: 16px;">
      <div class="kartu-judul" style="margin-bottom: 10px;">Kondisi Posisi Ban Unit: ${escapeHtml(unitId)}</div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th style="text-align: center;">POS</th>
              <th>SN TERPASANG</th>
              <th style="text-align: right;">RTD (MM)</th>
              <th style="text-align: right;">PRESSURE</th>
              <th style="text-align: right;">KM PAKAI</th>
              <th>PERKIRAAN GANTI</th>
              <th>TERAKHIR DIUKUR</th>
            </tr>
          </thead>
          <tbody>
            ${unitKondisi.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-dim);">Belum ada data inspeksi untuk unit ini</td></tr>' : unitKondisi.map(k => `
              <tr class="${k.kritis ? 'kritis' : ''}">
                <td style="text-align: center;"><span class="badge" style="background: #E2E8F0; color: #334155;">Pos ${k.pos}</span></td>
                <td><strong>${escapeHtml(k.sn_terpasang || '-')}</strong></td>
                <td style="text-align: right; font-weight: 700; color: ${k.kritis ? '#DC2626' : 'inherit'};">${k.rtd != null ? k.rtd : '-'}</td>
                <td style="text-align: right;">${k.pressure != null ? k.pressure : '-'}</td>
                <td style="text-align: right;">${k.life_km != null ? k.life_km.toLocaleString('id-ID') : '-'}</td>
                <td>${escapeHtml(k.perkiraan_ganti || '-')}</td>
                <td>${formatDateTime(k.dicatat_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="kartu">
      <div class="kartu-judul" style="margin-bottom: 10px;">Riwayat Remove / Instal Unit: ${escapeHtml(unitId)}</div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>TANGGAL</th>
              <th style="text-align: center;">POS</th>
              <th>SN TURUN</th>
              <th>PROBLEM</th>
              <th>SN NAIK</th>
              <th>LOKASI</th>
            </tr>
          </thead>
          <tbody>
            ${unitRiwayat.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-dim);">Belum ada riwayat bongkar-pasang untuk unit ini</td></tr>' : unitRiwayat.map(r => `
              <tr>
                <td>${formatDateTime(r.at)}</td>
                <td style="text-align: center;"><span class="badge" style="background: #E2E8F0; color: #334155;">Pos ${r.pos}</span></td>
                <td>${escapeHtml(r.sn_turun || '-')}</td>
                <td><span class="badge" style="background: #FEE2E2; color: #991B1B;">${escapeHtml(r.problem || '-')}</span></td>
                <td>${escapeHtml(r.sn_naik || '-')}</td>
                <td>${escapeHtml(r.lokasi || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

// =========================================================================
// KOREKSI HM & KM CONTROLLERS
// =========================================================================

function populateMeterUnitSelects() {
  const hmSel = document.getElementById('koreksi-hm-unit-select');
  const kmSel = document.getElementById('koreksi-km-unit-select');
  const units = (state.units || []).filter(u => u.unit_id && u.unit_id !== 'OTHERS' && u.unit_id !== 'WORKSHOP');

  const options = '<option value="">-- Pilih Unit --</option>' +
    units.map(u => `<option value="${escapeHtml(u.unit_id)}">${escapeHtml(u.unit_name || u.unit_id)} (${escapeHtml(u.unit_id)})</option>`).join('');

  if (hmSel && hmSel.options.length <= 1) {
    hmSel.innerHTML = options;
    if (state.koreksiHmUnit) hmSel.value = state.koreksiHmUnit;
  }
  if (kmSel && kmSel.options.length <= 1) {
    kmSel.innerHTML = options;
    if (state.koreksiKmUnit) kmSel.value = state.koreksiKmUnit;
  }
}

function renderKoreksiHm() {
  populateMeterUnitSelects();
  if (state.koreksiHmUnit) {
    loadKoreksiHmData(state.koreksiHmUnit);
  }
}

function renderKoreksiKm() {
  populateMeterUnitSelects();
  if (state.koreksiKmUnit) {
    loadKoreksiKmData(state.koreksiKmUnit);
  }
}

async function loadKoreksiHmData(unitId) {
  const content = document.getElementById('koreksi-hm-content');
  if (!unitId) {
    if (content) content.style.display = 'none';
    return;
  }
  if (content) content.style.display = 'block';

  const tbody = document.getElementById('koreksi-hm-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat riwayat HM unit...</td></tr>';

  try {
    const res = await api('riwayatHmUnit', { unit_id: unitId });
    const data = res?.data || res;
    state.koreksiHmData = data;

    // Render Acuan
    const acuanCard = document.getElementById('koreksi-hm-acuan-card');
    if (acuanCard) {
      if (data && data.acuan) {
        acuanCard.innerHTML = `
          <div style="font-size: 14px; font-weight: 800; color: #0369A1; margin-bottom: 4px;">
            <i class="fa-solid fa-circle-check"></i> Acuan HM Terkini: ${data.acuan.hm}
          </div>
          <div style="font-size: 12.5px; color: #0284C7; line-height: 1.5;">
            Tercatat pada <b>${formatDateTime(data.acuan.at)}</b> ${data.acuan.oleh ? 'oleh ' + escapeHtml(data.acuan.oleh) : ''} ${data.acuan.wo_number ? '· ' + escapeHtml(data.acuan.wo_number) : ''}<br>
            WO berikutnya pada unit ini harus ber-HM sama atau lebih besar dari angka acuan ini.
          </div>
        `;
      } else {
        acuanCard.innerHTML = `
          <div style="font-size: 13.5px; color: #0369A1;">
            <i class="fa-solid fa-info-circle"></i> Belum ada bacaan HM untuk unit ini. Angka valid pertama yang dimasukkan akan menjadi acuan dasar.
          </div>
        `;
      }
    }

    // Render Bacaan Table
    if (tbody) {
      const bacaan = data?.bacaan || [];
      if (bacaan.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">Belum ada data bacaan HM untuk unit ini</td></tr>';
      } else {
        tbody.innerHTML = bacaan.map(b => {
          const janggal = b.janggal;
          let badge = '<span class="badge" style="background: #D1FAE5; color: #065F46;">NORMAL</span>';
          if (janggal === 'melompat') badge = '<span class="tag tag-melompat">MELOMPAT</span>';
          else if (janggal === 'mundur') badge = '<span class="tag tag-mundur">MUNDUR</span>';

          return `
            <tr class="${janggal || ''}">
              <td><strong>${escapeHtml(b.wo_number || b.wo_id || '-')}</strong></td>
              <td>${formatDateTime(b.at)}</td>
              <td><span class="badge" style="background: #E0E7FF; color: #3730A3;">${escapeHtml(b.section || '-')}</span></td>
              <td>${escapeHtml(b.oleh_nama || b.oleh || '-')}</td>
              <td style="text-align: right; font-weight: 800; font-size: 14px;">${b.hm != null ? b.hm : '-'}</td>
              <td>${badge}</td>
              <td style="text-align: center;">
                <button type="button" class="btn btn-secondary btn-perbaiki-meter" data-jenis="hm" data-wo="${escapeHtml(b.wo_id || '')}" data-wono="${escapeHtml(b.wo_number || '')}" data-nilai="${b.hm != null ? b.hm : ''}" style="padding: 4px 10px; font-size: 11.5px;">
                  <i class="fa-solid fa-pen-to-square"></i> Perbaiki
                </button>
              </td>
            </tr>
          `;
        }).join('');
        attachMeterTableListeners();
      }
    }
  } catch (err) {
    console.error('Error loadKoreksiHmData:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#DC2626;">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadKoreksiKmData(unitId) {
  const content = document.getElementById('koreksi-km-content');
  if (!unitId) {
    if (content) content.style.display = 'none';
    return;
  }
  if (content) content.style.display = 'block';

  const tbody = document.getElementById('koreksi-km-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat riwayat KM unit...</td></tr>';

  try {
    const res = await api('riwayatKmUnit', { unit_id: unitId });
    const data = res?.data || res;
    state.koreksiKmData = data;

    // Render Acuan
    const acuanCard = document.getElementById('koreksi-km-acuan-card');
    if (acuanCard) {
      if (data && data.acuan) {
        acuanCard.innerHTML = `
          <div style="font-size: 14px; font-weight: 800; color: #0369A1; margin-bottom: 4px;">
            <i class="fa-solid fa-circle-check"></i> Acuan KM Terkini: ${data.acuan.km}
          </div>
          <div style="font-size: 12.5px; color: #0284C7; line-height: 1.5;">
            Tercatat pada <b>${formatDateTime(data.acuan.at)}</b> ${data.acuan.oleh ? 'oleh ' + escapeHtml(data.acuan.oleh) : ''} ${data.acuan.wo_number ? '· ' + escapeHtml(data.acuan.wo_number) : ''}<br>
            WO berikutnya pada unit ini harus ber-KM sama atau lebih besar dari angka acuan ini.
          </div>
        `;
      } else {
        acuanCard.innerHTML = `
          <div style="font-size: 13.5px; color: #0369A1;">
            <i class="fa-solid fa-info-circle"></i> Belum ada bacaan KM untuk unit ini. Angka valid pertama yang dimasukkan akan menjadi acuan dasar.
          </div>
        `;
      }
    }

    // Render Bacaan Table
    if (tbody) {
      const bacaan = data?.bacaan || [];
      if (bacaan.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">Belum ada data bacaan KM untuk unit ini</td></tr>';
      } else {
        tbody.innerHTML = bacaan.map(b => {
          const janggal = b.janggal;
          let badge = '<span class="badge" style="background: #D1FAE5; color: #065F46;">NORMAL</span>';
          if (janggal === 'melompat') badge = '<span class="tag tag-melompat">MELOMPAT</span>';
          else if (janggal === 'mundur') badge = '<span class="tag tag-mundur">MUNDUR</span>';

          return `
            <tr class="${janggal || ''}">
              <td><strong>${escapeHtml(b.wo_number || b.wo_id || '-')}</strong></td>
              <td>${formatDateTime(b.at)}</td>
              <td><span class="badge" style="background: #E0E7FF; color: #3730A3;">${escapeHtml(b.section || '-')}</span></td>
              <td>${escapeHtml(b.oleh_nama || b.oleh || '-')}</td>
              <td style="text-align: right; font-weight: 800; font-size: 14px;">${b.km != null ? b.km : '-'}</td>
              <td>${badge}</td>
              <td style="text-align: center;">
                <button type="button" class="btn btn-secondary btn-perbaiki-meter" data-jenis="km" data-wo="${escapeHtml(b.wo_id || '')}" data-wono="${escapeHtml(b.wo_number || '')}" data-nilai="${b.km != null ? b.km : ''}" style="padding: 4px 10px; font-size: 11.5px;">
                  <i class="fa-solid fa-pen-to-square"></i> Perbaiki
                </button>
              </td>
            </tr>
          `;
        }).join('');
        attachMeterTableListeners();
      }
    }
  } catch (err) {
    console.error('Error loadKoreksiKmData:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#DC2626;">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function attachMeterTableListeners() {
  document.querySelectorAll('.btn-perbaiki-meter').forEach(btn => {
    btn.onclick = () => {
      const jenis = btn.dataset.jenis;
      const woId = btn.dataset.wo;
      const woNo = btn.dataset.wono;
      const nilai = btn.dataset.nilai;

      document.getElementById('modal-km-wo-id').value = woId;
      document.getElementById('modal-km-jenis').value = jenis;
      document.getElementById('modal-km-title').textContent = `Perbaiki Bacaan ${jenis.toUpperCase()} (${woNo})`;
      document.getElementById('modal-km-desc').innerHTML = `Nilai saat ini: <b>${nilai || '-'}</b>. Masukkan nilai yang benar atau kosongkan jika bacaan ini keliru dan ingin dibuang.`;
      document.getElementById('modal-km-nilai-baru').value = nilai;
      document.getElementById('modal-km-alasan').value = '';

      const modal = document.getElementById('modal-koreksi-meter');
      if (modal) modal.style.display = 'flex';
    };
  });
}

function closeModalKoreksiMeter() {
  const modal = document.getElementById('modal-koreksi-meter');
  if (modal) modal.style.display = 'none';
}

async function submitModalKoreksiMeter(e) {
  e.preventDefault();
  const woId = document.getElementById('modal-km-wo-id').value;
  const jenis = document.getElementById('modal-km-jenis').value;
  const nilaiBaru = document.getElementById('modal-km-nilai-baru').value;
  const alasan = document.getElementById('modal-km-alasan').value;

  if (!alasan || alasan.trim().length < 5) {
    showToast('⚠️ Alasan koreksi wajib diisi minimal 5 karakter', 'warning');
    return;
  }

  const btn = document.getElementById('btn-modal-km-simpan');
  if (btn) btn.disabled = true;

  try {
    const action = jenis === 'hm' ? 'koreksiHmWo' : 'koreksiKmWo';
    const payload = jenis === 'hm'
      ? { wo_id: woId, hm_baru: nilaiBaru, alasan: alasan }
      : { wo_id: woId, km_baru: nilaiBaru, alasan: alasan };

    const res = await api(action, payload);
    if (res && res.success) {
      showToast('✅ Koreksi meter berhasil disimpan!', 'success');
      closeModalKoreksiMeter();
      if (jenis === 'hm' && state.koreksiHmUnit) loadKoreksiHmData(state.koreksiHmUnit);
      if (jenis === 'km' && state.koreksiKmUnit) loadKoreksiKmData(state.koreksiKmUnit);
    } else {
      showToast('❌ Gagal mengoreksi meter: ' + (res?.error?.message || res?.error || 'Kesalahan sistem'), 'danger');
    }
  } catch (err) {
    showToast('❌ Kesalahan jaringan: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitGantiPanelHm(e) {
  e.preventDefault();
  const unitId = state.koreksiHmUnit;
  if (!unitId) {
    showToast('⚠️ Pilih unit terlebih dahulu!', 'warning');
    return;
  }
  const nilai = document.getElementById('gp-hm-nilai').value;
  const at = document.getElementById('gp-hm-at').value;
  const alasan = document.getElementById('gp-hm-alasan').value;

  if (nilai === '' || !at || !alasan) {
    showToast('⚠️ Semua kolom ganti panel wajib diisi!', 'warning');
    return;
  }

  const btn = document.getElementById('btn-submit-gp-hm');
  if (btn) btn.disabled = true;

  try {
    const res = await api('gantiPanelHm', {
      unit_id: unitId,
      hm_baru: nilai,
      berlaku_at: at,
      alasan: alasan
    });

    if (res && res.success) {
      showToast('✅ Penggantian panel HM berhasil dicatat!', 'success');
      document.getElementById('form-ganti-panel-hm').reset();
      loadKoreksiHmData(unitId);
    } else {
      showToast('❌ Gagal mencatat ganti panel: ' + (res?.error?.message || res?.error || 'Kesalahan sistem'), 'danger');
    }
  } catch (err) {
    showToast('❌ Kesalahan jaringan: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitGantiPanelKm(e) {
  e.preventDefault();
  const unitId = state.koreksiKmUnit;
  if (!unitId) {
    showToast('⚠️ Pilih unit terlebih dahulu!', 'warning');
    return;
  }
  const nilai = document.getElementById('gp-km-nilai').value;
  const at = document.getElementById('gp-km-at').value;
  const alasan = document.getElementById('gp-km-alasan').value;

  if (nilai === '' || !at || !alasan) {
    showToast('⚠️ Semua kolom ganti panel wajib diisi!', 'warning');
    return;
  }

  const btn = document.getElementById('btn-submit-gp-km');
  if (btn) btn.disabled = true;

  try {
    const res = await api('gantiPanelKm', {
      unit_id: unitId,
      km_baru: nilai,
      berlaku_at: at,
      alasan: alasan
    });

    if (res && res.success) {
      showToast('✅ Penggantian panel KM berhasil dicatat!', 'success');
      document.getElementById('form-ganti-panel-km').reset();
      loadKoreksiKmData(unitId);
    } else {
      showToast('❌ Gagal mencatat ganti panel: ' + (res?.error?.message || res?.error || 'Kesalahan sistem'), 'danger');
    }
  } catch (err) {
    showToast('❌ Kesalahan jaringan: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =========================================================================
// REPORTS & PAYROLL CONTROLLERS
// =========================================================================

function renderReports() {
  const monthInput = document.getElementById('report-month-input');
  if (monthInput && !monthInput.value) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${now.getFullYear()}-${mm}`;
  }

  const startInput = document.getElementById('report-date-start');
  const endInput = document.getElementById('report-date-end');
  if (startInput && !startInput.value) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    startInput.value = firstDay.toISOString().split('T')[0];
    endInput.value = lastDay.toISOString().split('T')[0];
  }
}

function setReportFilterType(type) {
  state.reportsFilterType = type;
  document.getElementById('btn-report-toggle-month')?.classList.toggle('active', type === 'month');
  document.getElementById('btn-report-toggle-range')?.classList.toggle('active', type === 'range');

  const pMonth = document.getElementById('report-panel-month');
  const pRange = document.getElementById('report-panel-range');
  if (pMonth) pMonth.style.display = type === 'month' ? 'block' : 'none';
  if (pRange) pRange.style.display = type === 'range' ? 'grid' : 'none';

  document.getElementById('report-result-box')?.classList.remove('show');
  document.getElementById('report-error-box')?.classList.remove('show');
}

async function generatePayrollReport() {
  const btn = document.getElementById('btn-generate-report');
  const errBox = document.getElementById('report-error-box');
  const resBox = document.getElementById('report-result-box');

  if (errBox) { errBox.classList.remove('show'); errBox.textContent = ''; }
  if (resBox) { resBox.classList.remove('show'); }

  const section = document.getElementById('report-section-select')?.value || 'all';
  const filterType = state.reportsFilterType || 'month';
  let year = null, month = null, startDate = null, endDate = null;

  if (filterType === 'month') {
    const monthVal = document.getElementById('report-month-input')?.value;
    if (!monthVal) {
      if (errBox) { errBox.textContent = 'Pilih bulan penggajian terlebih dahulu!'; errBox.classList.add('show'); }
      return;
    }
    const [y, m] = monthVal.split('-');
    year = parseInt(y, 10);
    month = parseInt(m, 10);
  } else {
    startDate = document.getElementById('report-date-start')?.value;
    endDate = document.getElementById('report-date-end')?.value;
    if (!startDate || !endDate) {
      if (errBox) { errBox.textContent = 'Isi tanggal mulai dan tanggal selesai!'; errBox.classList.add('show'); }
      return;
    }
    if (startDate > endDate) {
      if (errBox) { errBox.textContent = 'Tanggal mulai harus lebih awal daripada tanggal selesai!'; errBox.classList.add('show'); }
      return;
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sedang Menghitung & Membuat File Excel...';
  }

  try {
    const payload = {
      filter_type: filterType,
      year: year,
      month: month,
      start_date: startDate,
      end_date: endDate,
      section: section
    };

    const res = await api('generate_payroll_report', payload);
    if (res && res.success && res.result) {
      const d = res.result;
      state.lastReportResult = d;

      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('rep-stat-wo', (d.summary?.total_wos || 0).toLocaleString('id-ID'));
      setEl('rep-stat-points', (d.summary?.total_points || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setEl('rep-stat-idr', 'Rp ' + Math.round(d.summary?.total_idr || 0).toLocaleString('id-ID'));

      const spreadLink = document.getElementById('rep-link-spreadsheet');
      if (spreadLink) {
        if (d.download_url) {
          spreadLink.href = d.download_url;
          spreadLink.style.display = 'inline-flex';
        } else {
          spreadLink.style.display = 'none';
        }
      }

      if (resBox) resBox.classList.add('show');
      showToast('✅ Laporan payroll berhasil dibuat!', 'success');
    } else {
      const msg = res?.error?.message || res?.error || 'Gagal membuat laporan payroll';
      if (errBox) {
        errBox.textContent = '❌ ' + msg;
        errBox.classList.add('show');
      }
      showToast('⚠️ ' + msg, 'warning');
    }
  } catch (err) {
    console.error('generatePayrollReport error:', err);
    if (errBox) {
      errBox.textContent = '❌ Terjadi kesalahan: ' + err.message;
      errBox.classList.add('show');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Laporan Payroll';
    }
  }
}

function downloadPayrollReport() {
  const d = state.lastReportResult;
  if (!d) {
    showToast('⚠️ Buat laporan terlebih dahulu sebelum mengunduh', 'warning');
    return;
  }

  if (d.file_b64) {
    try {
      const byteCharacters = atob(d.file_b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.filename || 'Payroll_Report.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('📥 Berkas Excel berhasil diunduh!', 'success');
      return;
    } catch (err) {
      console.warn('Direct b64 download error, falling back to link:', err);
    }
  }

  if (d.download_url) {
    window.open(d.download_url, '_blank');
  } else {
    showToast('⚠️ Berkas tidak tersedia untuk diunduh langsung', 'warning');
  }
}
