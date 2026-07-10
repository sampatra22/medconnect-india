import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";

const prisma = new PrismaClient();

const UI_TO_ROLE = {
  admin: "ADMIN",
  mr: "MEDICAL_REP",
  doctor: "DOCTOR",
  chemist: "CHEMIST",
  stockist: "STOCKIST",
  recruiter: "PHARMA_COMPANY", // legacy alias: Recruiter was merged into Company
  company: "PHARMA_COMPANY",
  clinic_staff: "CLINIC_STAFF",
};

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

async function main() {
  // Users: same emails/passwords as before, but passwords are bcrypt-hashed.
  for (const u of readJson("data/users.json")) {
    if (!u.email || !u.password) continue;
    const email = String(u.email).toLowerCase().trim();
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: u.name || email.split("@")[0],
        password: await bcrypt.hash(String(u.password), 10),
        role: UI_TO_ROLE[String(u.role || "mr").toLowerCase()] ?? "MEDICAL_REP",
      },
    });
  }

  if ((await prisma.doctor.count()) === 0) {
    const idMap = new Map();
    for (const d of readJson("data/doctors.json")) {
      const created = await prisma.doctor.create({
        data: {
          name: d.name,
          specialty: d.specialty ?? "General",
          qualification: d.qualification ?? "",
          hospital: d.hospital ?? "",
          chamberAddress: d.chamber_address ?? "",
          phone: d.phone ?? "",
          secretaryContact: d.secretary_contact ?? null,
          consultationTiming: d.consultation_timing ?? "",
          mrVisitingTime: d.mr_visiting_time ?? null,
          languages: Array.isArray(d.languages) ? d.languages.join(", ") : (d.languages ?? ""),
          experience: Number(d.experience) || 0,
          rating: Number(d.rating) || 0,
          status: d.status ?? "available",
          patientsLeft: d.patients_left ?? null,
          patientsSource: d.patients_source ?? null,
          statusUpdatedAt: d.status_updated_at ? new Date(d.status_updated_at) : null,
          statusUpdatedByName: d.status_updated_by_name ?? null,
          statusUpdatedByRole: d.status_updated_by_role ?? null,
          updates: {
            create: (Array.isArray(d.updateHistory) ? d.updateHistory : []).map((h) => ({
              userId: h.user_id != null ? String(h.user_id) : null,
              userName: h.user_name ?? null,
              userEmail: h.user_email ?? null,
              role: h.role ?? null,
              changes: h.changes ?? {},
              createdAt: h.timestamp ? new Date(h.timestamp) : new Date(),
            })),
          },
        },
      });
      idMap.set(String(d.id), created.id);
    }

    for (const v of readJson("data/visits.json")) {
      const doctorId = idMap.get(String(v.doctor_id));
      if (!doctorId) continue;
      await prisma.visit.create({
        data: {
          doctorId,
          date: v.date,
          time: v.time,
          status: v.status ?? "Visit Done",
          notes: v.notes ?? null,
          mrId: v.mr_id != null ? String(v.mr_id) : null,
          mrName: v.mr_name ?? null,
          mrEmail: v.mr_email ?? null,
          createdAt: v.created_at ? new Date(v.created_at) : new Date(),
        },
      });
    }
  }

  console.log(
    "seeded -> users:", await prisma.user.count(),
    "doctors:", await prisma.doctor.count(),
    "visits:", await prisma.visit.count(),
    "audit entries:", await prisma.doctorUpdate.count()
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
