// Phase 3 demo data: 200 doctors, 125 assigned to the MR (ravi@medconnect.com)
// as 50 core doctors (3×/month) + 75 regular (2×/month) = 300 monthly calls,
// grouped into 10 Kolkata area patches. Re-runnable: wipes old demo data first.
//
// Run with:  node prisma/seed-demo.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MR_EMAIL = "ravi@medconnect.com";
const DEMO_PHONE_PREFIX = "+91-9000"; // marks demo doctors so re-runs clean up

// Deterministic random so every run produces the same demo data.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const between = (min, max) => min + Math.floor(rng() * (max - min + 1));

const FIRST = ["Rajesh","Ananya","Amit","Priya","Sourav","Kavita","Arjun","Meera","Vikram","Sunita","Rahul","Deepa","Sanjay","Ritu","Manish","Pooja","Alok","Shreya","Nikhil","Lakshmi","Debashish","Ipsita","Kunal","Madhuri","Tapan","Rina","Gaurav","Swati","Pranab","Nandini","Suresh","Anita","Biswajit","Payal","Harish","Moushumi","Ashok","Tanushree","Ranjan","Sharmila"];
const LAST = ["Kumar","Sen","Banerjee","Sharma","Ghosh","Mukherjee","Chatterjee","Das","Roy","Bose","Dutta","Mitra","Verma","Gupta","Nair","Iyer","Reddy","Patel","Singh","Chakraborty","Basu","Saha","Mandal","Kar","Halder"];
const SPECIALTIES = ["Cardiology","General Medicine","Pediatrics","Orthopedics","Dermatology","Gynecology","Neurology","ENT","Ophthalmology","Psychiatry","Gastroenterology","Pulmonology","Endocrinology","Urology","Nephrology"];
const QUALS = ["MBBS, MD","MBBS, MS","MBBS, DNB","MBBS, MD, DM","MBBS, DGO","MBBS, MD, FRCP"];
const LANGS = ["Hindi, English","Bengali, English","Bengali, Hindi, English","Hindi, English, Marathi","Tamil, English","Telugu, Hindi, English"];
const TIMINGS = ["9 AM - 1 PM","10 AM - 2 PM","11 AM - 3 PM","5 PM - 9 PM","6 PM - 10 PM","4 PM - 8 PM"];
const MR_SLOTS = ["1 PM - 2 PM","2 PM - 4 PM","12 PM - 1 PM","8 PM - 9 PM","4 PM - 5 PM","10 AM - 11 AM"];

// The MR's territory: 10 Kolkata areas → these become the 10 call patches.
const KOLKATA_AREAS = ["Salt Lake","Park Street","Ballygunge","Behala","Dum Dum","Howrah","Garia","New Town","Shyambazar","Tollygunge"];
const KOLKATA_HOSPITALS = ["AMRI Hospital","Apollo Gleneagles","Fortis Anandapur","Ruby General","Woodlands Hospital","CMRI","Belle Vue Clinic","Peerless Hospital"];
// The other 75 directory doctors live in other cities (not on the MR's list).
const OTHER_CITIES = [
  { city: "Delhi", areas: ["Karol Bagh","Saket","Dwarka"], hospitals: ["AIIMS Delhi","Max Saket","Fortis Vasant Kunj"] },
  { city: "Mumbai", areas: ["Andheri","Bandra","Dadar"], hospitals: ["Lilavati Hospital","Kokilaben Hospital","Hinduja Hospital"] },
  { city: "Chennai", areas: ["T Nagar","Adyar","Anna Nagar"], hospitals: ["Apollo Chennai","MIOT Hospital","Fortis Malar"] },
  { city: "Bengaluru", areas: ["Indiranagar","Jayanagar","Whitefield"], hospitals: ["Manipal Hospital","Narayana Health","St. John's"] },
  { city: "Hyderabad", areas: ["Banjara Hills","Secunderabad","Gachibowli"], hospitals: ["Care Hospital","Yashoda Hospital","KIMS"] },
];

// Weighted live statuses — variety so the plan's status badges mean something.
const STATUSES = [
  ["available", 40], ["busy", 15], ["no_mr_today", 15],
  ["token_full", 10], ["holiday", 10], ["opd_closed", 10],
];
function pickStatus() {
  let r = rng() * 100;
  for (const [s, w] of STATUSES) { if ((r -= w) < 0) return s; }
  return "available";
}

function makeDoctor(i, city, area, hospital) {
  const name = `Dr. ${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
  const status = pickStatus();
  const active = status === "available" || status === "busy" || status === "token_full";
  return {
    name,
    specialty: pick(SPECIALTIES),
    qualification: pick(QUALS),
    hospital: `${hospital}, ${city}`,
    chamberAddress: `${area}, ${city}`,
    consultationTiming: pick(TIMINGS),
    mrVisitingTime: pick(MR_SLOTS),
    phone: `${DEMO_PHONE_PREFIX}${String(10000 + i).slice(-5)}`,
    secretaryContact: rng() < 0.5 ? `+91-98${between(10000000, 99999999)}` : null,
    languages: pick(LANGS),
    experience: between(4, 30),
    rating: Math.round((3.5 + rng() * 1.5) * 10) / 10,
    status,
    patientsLeft: active ? between(0, 25) : null,
    patientsSource: active ? (rng() < 0.5 ? "clinic_staff" : "mr_estimate") : null,
    statusUpdatedAt: new Date(Date.now() - between(5, 600) * 60 * 1000), // 5 min – 10 h ago
    statusUpdatedByRole: pick(["clinic_staff", "doctor", "mr"]),
    statusUpdatedByName: pick(["Front Desk", "Chamber Staff", "Field MR"]),
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const mr = await prisma.user.findFirst({ where: { email: MR_EMAIL } });
  if (!mr) throw new Error(`MR user ${MR_EMAIL} not found — run "npx prisma db seed" first.`);

  // ── Clean up any previous demo run (cascades remove visits/plan/list rows) ──
  const wiped = await prisma.doctor.deleteMany({ where: { phone: { startsWith: DEMO_PHONE_PREFIX } } });
  await prisma.mrDoctor.deleteMany({ where: { mrId: mr.id } });
  await prisma.patch.deleteMany({ where: { mrId: mr.id } });
  if (wiped.count) console.log(`Wiped ${wiped.count} old demo doctors.`);

  // ── 125 Kolkata doctors (the MR's territory), ~12–13 per area ──
  const docs = [];
  for (let i = 0; i < 125; i++) {
    const area = KOLKATA_AREAS[i % KOLKATA_AREAS.length];
    docs.push(makeDoctor(i, "Kolkata", area, pick(KOLKATA_HOSPITALS)));
  }
  // ── 75 doctors in other cities (directory only) ──
  for (let i = 125; i < 200; i++) {
    const c = OTHER_CITIES[i % OTHER_CITIES.length];
    docs.push(makeDoctor(i, c.city, pick(c.areas), pick(c.hospitals)));
  }
  await prisma.doctor.createMany({ data: docs });
  const created = await prisma.doctor.findMany({
    where: { phone: { startsWith: DEMO_PHONE_PREFIX } },
  });
  console.log(`Created ${created.length} demo doctors (125 Kolkata + 75 other cities).`);

  // ── 10 call patches, one per Kolkata area ──
  const patchByArea = {};
  for (const area of KOLKATA_AREAS) {
    patchByArea[area] = await prisma.patch.create({ data: { mrId: mr.id, name: area } });
  }

  // ── Assign all 125 Kolkata doctors to the MR: 50 core (3×) + 75 regular (2×) ──
  const kolkata = shuffle(created.filter((d) => d.chamberAddress.endsWith("Kolkata")));
  const rows = kolkata.map((d, idx) => ({
    mrId: mr.id,
    doctorId: d.id,
    frequency: idx < 50 ? 3 : 2, // first 50 are core doctors
    patchId: patchByArea[d.chamberAddress.split(",")[0].trim()]?.id ?? null,
  }));
  await prisma.mrDoctor.createMany({ data: rows });

  const target = rows.reduce((s, r) => s + r.frequency, 0);
  console.log(`Assigned ${rows.length} doctors to ${mr.name} (${MR_EMAIL}).`);
  console.log(`  Core 3×/month: 50 · Regular 2×/month: 75 · Monthly call target: ${target}`);
  console.log(`  Call patches: ${KOLKATA_AREAS.map((a) => `${a} (${rows.filter((r) => r.patchId === patchByArea[a].id).length})`).join(", ")}`);
  console.log("Done ✅  Log in as ravi@medconnect.com / ravi123 → ⭐ My Doctors.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
