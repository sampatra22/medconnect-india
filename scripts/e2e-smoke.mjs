#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// End-to-end smoke test against the LIVE deployment, played as real people:
// fresh MR signups, the doctor account, the admin, a PA holding an update
// link, and an anonymous patient. Exercises the happy paths AND attacks the
// permission boundaries. Creates only ZZTEST-prefixed data and deletes it at
// the end.
//
//   node scripts/e2e-smoke.mjs https://medconnect-india.vercel.app
//
// Budget-aware: stays inside every rate limit (login 5/5min per email,
// signup 5/hr per IP, bulk 5/hr per user).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.argv[2] ?? "https://medconnect-india.vercel.app";
const STAMP = Date.now().toString(36);
const results = [];
let bugNotes = [];

function check(name, ok, note = "") {
  results.push({ name, ok: !!ok, note });
  console.log(`${ok ? "✅" : "❌"} ${name}${note ? ` — ${note}` : ""}`);
  if (!ok && note) bugNotes.push(`${name}: ${note}`);
}

// Minimal cookie jar per persona.
function jar() {
  const cookies = new Map();
  return {
    absorb(res) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1).trim();
        if (v === "" || /expires=Thu, 01 Jan 1970/i.test(c)) cookies.delete(k);
        else cookies.set(k, v);
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function req(j, method, path, body, extraHeaders = {}) {
  const headers = { cookie: j.header(), origin: BASE, ...extraHeaders };
  let payload;
  if (body !== undefined) {
    if (extraHeaders["content-type"]?.includes("form")) payload = body;
    else {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: "manual" });
  j.absorb(res);
  let data = null;
  try { data = await res.clone().json(); } catch { /* not JSON */ }
  return { status: res.status, data, res };
}

async function login(j, email, password) {
  const csrf = await req(j, "GET", "/api/auth/csrf");
  const token = csrf.data?.csrfToken;
  await req(
    j, "POST", "/api/auth/callback/credentials",
    new URLSearchParams({ csrfToken: token, email, password }).toString(),
    { "content-type": "application/x-www-form-urlencoded" }
  );
  const s = await req(j, "GET", "/api/auth/session");
  return s.data?.user ?? null;
}

const cleanup = { doctorIds: [], userEmails: [] };

async function main() {
  console.log(`\n— MedConnect E2E vs ${BASE} · run ${STAMP} —\n`);

  const guest = jar();
  const mr1 = jar();
  const mr2 = jar();
  const doc = jar();
  const admin = jar();
  const pa = jar(); // the PA has NO account — that's the point

  // ── 1 · Public surface (anonymous patient) ────────────────────────────────
  const pub = await req(guest, "GET", "/api/doctors?per=3");
  check("public directory readable without login", pub.status === 200 && Array.isArray(pub.data?.doctors));
  check("public paging shape (total/page/has_more)", typeof pub.data?.total === "number" && "has_more" in (pub.data ?? {}));
  const mrUpdated = (await req(guest, "GET", "/api/doctors?per=500")).data?.doctors?.find(
    (d) => ["mr", "medical_representative"].includes(d.status_updated_by_role ?? "")
  );
  check(
    "MR identity hidden from public attribution",
    !mrUpdated || (mrUpdated.status_updated_by_name == null && mrUpdated.status_updated_by_company == null),
    mrUpdated ? `saw name=${mrUpdated.status_updated_by_name}` : "no MR-updated doctor to check"
  );
  const q = await req(guest, "GET", "/api/doctors?q=anjali");
  check("name search finds Dr. Anjali", q.data?.doctors?.some((d) => /anjali/i.test(d.name)));
  const avail = await req(guest, "GET", "/api/doctors?status=available&per=500");
  check("'available now' filter returns only live rows", (avail.data?.doctors ?? []).every((d) => d.freshness?.isLive && d.status === "available"));

  // ── 2 · Auth boundaries (guest attacks) ───────────────────────────────────
  check("guest cannot set a status", (await req(guest, "PUT", "/api/doctors/anything/status", { status: "available" })).status === 401);
  check("guest cannot read a doctor's history", (await req(guest, "GET", `/api/doctors/${pub.data.doctors[0].id}`)).status === 401);
  check("guest cannot reach admin users", [401, 403].includes((await req(guest, "GET", "/api/admin/users")).status));
  check("guest cannot use the vocab helper", (await req(guest, "GET", "/api/vocab")).status === 401);

  // ── 3 · Signup ────────────────────────────────────────────────────────────
  const em1 = `zztest-mr1-${STAMP}@example.com`;
  const em2 = `zztest-mr2-${STAMP}@example.com`;
  const PW = "ZzTest!Pass1";
  const s1 = await req(guest, "POST", "/api/signup", { name: "ZZTEST MR One", email: em1, password: PW, company: "ZZTEST Pharma" });
  check("MR signup works", s1.status === 201, `status ${s1.status}`);
  cleanup.userEmails.push(em1);
  check("duplicate signup rejected", (await req(guest, "POST", "/api/signup", { name: "x", email: em1, password: PW })).status >= 400);
  const s2 = await req(guest, "POST", "/api/signup", { name: "ZZTEST MR Two", email: em2, password: PW, company: "ZZTEST Labs" });
  check("second MR signup works", s2.status === 201);
  cleanup.userEmails.push(em2);

  // ── 4 · Login ─────────────────────────────────────────────────────────────
  check("wrong password rejected", (await login(jar(), em1, "wrongwrong")) === null);
  const u1 = await login(mr1, em1, PW);
  check("MR1 login", u1?.role === "mr", JSON.stringify(u1));
  const u2 = await login(mr2, em2, PW);
  check("MR2 login", u2?.role === "mr");
  const ua = await login(admin, "sam@medconnect.com", "sam123");
  check("admin login", ua?.role === "admin");
  const ud = await login(doc, "anjali@medconnect.com", "anjali123");
  check("doctor login", ud?.role === "doctor");

  // ── 5 · MR adds & edits doctors ───────────────────────────────────────────
  check("add doctor without consent is refused", (await req(mr1, "POST", "/api/doctors", { name: `ZZTEST Dr NoConsent ${STAMP}` })).status === 400);
  const created = await req(mr1, "POST", "/api/doctors", {
    name: `ZZTEST Dr Alpha ${STAMP}`, specialty: "Cardiology", hospital: "ZZTEST Hospital",
    chamber_address: "Salt Lake, Kolkata", phone: "+91-9000000001", consent_given: true, consent_note: "test",
  });
  check("add doctor with consent", created.status === 201 && created.data?.verified === false, `status ${created.status}`);
  const docId = created.data?.id;
  if (docId) cleanup.doctorIds.push(docId);
  const pubList = await req(guest, "GET", `/api/doctors?q=ZZTEST Dr Alpha&per=500`);
  check("unverified doctor invisible to public", !(pubList.data?.doctors ?? []).some((d) => d.id === docId));
  check("MR2 cannot edit MR1's doctor", (await req(mr2, "PATCH", `/api/doctors/${docId}`, { phone: "+91-9999999999" })).status === 403);
  const edit = await req(mr1, "PATCH", `/api/doctors/${docId}`, { phone: "+91-9000000002", secretary_contact: "+91-9000000003" });
  check("MR1 edits own doctor", edit.status === 200 && edit.data?.doctor?.secretary_contact === "+91-9000000003");

  // ── 6 · Status updates + trust rules ──────────────────────────────────────
  const st = await req(mr1, "PUT", `/api/doctors/${docId}/status`, { status: "available", patients_left: 4 });
  check("MR sets status (mr_estimate)", st.status === 200 && st.data?.doctor?.patients_source === "mr_estimate");
  const closed = await req(mr1, "PUT", `/api/doctors/${docId}/status`, { status: "opd_closed" });
  check("queue cleared when OPD closes", closed.status === 200 && closed.data?.doctor?.patients_left === null);
  check("junk status rejected", (await req(mr1, "PUT", `/api/doctors/${docId}/status`, { status: "sleeping" })).status === 400);
  const otherDoc = pub.data.doctors.find((d) => d.id !== docId);
  const docOwn = await req(doc, "PUT", `/api/doctors/${otherDoc.id}/status`, { status: "available" });
  check("doctor cannot set another doctor's status", docOwn.status === 403, `status ${docOwn.status}`);

  // ── 7 · PA link lifecycle ─────────────────────────────────────────────────
  const key1 = await req(mr1, "POST", `/api/doctors/${docId}/status-key`);
  check("MR issues PA link", key1.status === 200 && key1.data?.path?.startsWith("/update/"));
  const k1 = key1.data.path.split("/").pop();
  const paView = await req(pa, "GET", `/api/status-link/${k1}`);
  check("PA link shows the doctor without login", paView.status === 200 && paView.data?.doctor?.name?.includes("ZZTEST Dr Alpha"));
  const paSet = await req(pa, "PUT", `/api/status-link/${k1}`, { status: "available", patients_left: 7 });
  check("PA sets status via link (clinic tier)", paSet.status === 200 && paSet.data?.doctor?.patients_left === 7);
  const key2 = await req(mr1, "POST", `/api/doctors/${docId}/status-key`);
  const k2 = key2.data?.path?.split("/").pop();
  check("rotation kills the old link", (await req(pa, "GET", `/api/status-link/${k1}`)).status === 404);
  check("new link works after rotation", (await req(pa, "GET", `/api/status-link/${k2}`)).status === 200);
  await req(mr1, "DELETE", `/api/doctors/${docId}/status-key`);
  check("revocation kills the link", (await req(pa, "GET", `/api/status-link/${k2}`)).status === 404);
  check("garbage key is a clean 404", (await req(pa, "GET", "/api/status-link/notakey123")).status === 404);

  // ── 8 · Bulk import (small, in-budget) ────────────────────────────────────
  const bulk = await req(mr1, "POST", "/api/doctors/bulk", {
    rows: [
      { name: `ZZTEST Dr Bulk ${STAMP}`, specialty: "ORT", hospital: "ZZTEST Bulk Hosp", chamber_address: "Behala, Kolkata" },
      { name: "Dr. Rajesh Kumar", hospital: "City Hospital, Delhi" }, // seed duplicate
      { specialty: "Nothing" }, // no name
    ],
  });
  check("bulk import classifies rows", bulk.data?.created === 1 && bulk.data?.duplicates === 1 && bulk.data?.invalid === 1, JSON.stringify(bulk.data));
  const bulkId = bulk.data?.results?.find((r) => r.status === "created")?.id;
  if (bulkId) cleanup.doctorIds.push(bulkId);

  // ── 9 · Admin approvals + consent gate ────────────────────────────────────
  const gate = await req(admin, "PUT", `/api/doctors/${bulkId}/verify`, {});
  check("approval blocked without consent (bulk row)", gate.status === 409 && gate.data?.needs_consent === true, `status ${gate.status}`);
  const vouch = await req(admin, "PUT", `/api/doctors/${bulkId}/verify`, { confirm_consent: true });
  check("admin vouch approves + records consent", vouch.status === 200 && vouch.data?.doctor?.consent_given === true);
  const ok1 = await req(admin, "PUT", `/api/doctors/${docId}/verify`, {});
  check("consented doctor approves cleanly", ok1.status === 200);
  check("re-approval refused", (await req(admin, "PUT", `/api/doctors/${docId}/verify`, {})).status === 409);
  const nowPublic = await req(guest, "GET", `/api/doctors?q=ZZTEST Dr Alpha&per=500`);
  check("approved doctor now public", (nowPublic.data?.doctors ?? []).some((d) => d.id === docId));
  check("MR cannot approve", (await req(mr1, "PUT", `/api/doctors/${bulkId}/verify`, {})).status === 403);
  check("pending count responds", typeof (await req(admin, "GET", "/api/admin/pending-count")).data?.pending === "number");

  // ── 10 · Account password change ──────────────────────────────────────────
  check("password change refuses wrong current", (await req(mr2, "PUT", "/api/account/password", { current_password: "nope", new_password: "NewPass!234" })).status === 403);
  check("password change works", (await req(mr2, "PUT", "/api/account/password", { current_password: PW, new_password: "NewPass!234" })).status === 200);
  check("old password now fails", (await login(jar(), em2, PW)) === null);
  check("new password logs in", (await login(jar(), em2, "NewPass!234"))?.role === "mr");

  // ── 11 · Cleanup (leave no trace) ─────────────────────────────────────────
  console.log("\n— cleanup —");
  for (const id of cleanup.doctorIds) {
    const del = await req(admin, "DELETE", `/api/doctors/${id}`);
    console.log(`  delete doctor ${id}: ${del.status}`);
  }
  const users = await req(admin, "GET", "/api/admin/users");
  for (const em of cleanup.userEmails) {
    const u = (users.data?.users ?? []).find((x) => x.email === em);
    if (u) {
      const del = await req(admin, "DELETE", "/api/admin/users", { id: u.id });
      console.log(`  delete user ${em}: ${del.status}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`RESULT: ${pass}/${results.length} checks passed`);
  if (bugNotes.length) {
    console.log("\nFAILURES:");
    bugNotes.forEach((b) => console.log(` · ${b}`));
  }
}

main().catch((e) => {
  console.error("HARNESS CRASH:", e);
  process.exit(1);
});
