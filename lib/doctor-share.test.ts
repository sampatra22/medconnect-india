import { test } from "node:test";
import assert from "node:assert/strict";
import { doctorShareMessage } from "@/lib/doctor-share";

const base = {
  name: "Dr. Anjali Mehta",
  specialty: "Dermatology",
  place: "Apollo Clinic, Andheri West",
  number: "+91-9812345671",
  link: "https://medconnect-india.vercel.app/doctors?q=Anjali%20Mehta",
  todayHours: "11 AM – 3 PM",
};

test("live status speaks in the present tense, with exact chamber count", () => {
  const msg = doctorShareMessage({
    ...base,
    status: "available",
    isLive: true,
    confidence: "fresh",
    patientsLeft: 3,
    patientsSource: "clinic_staff",
  });
  assert.match(msg, /Available now · 3 patients waiting/);
  assert.match(msg, /🕐 Today: 11 AM – 3 PM/);
  assert.doesNotMatch(msg, /~3/); // chamber count is exact, no estimate mark
  assert.match(msg, /📞 \+91-9812345671/);
});

test("MR estimates carry the ~, and ageing statuses drop the count", () => {
  const mr = doctorShareMessage({
    ...base,
    status: "available",
    isLive: true,
    confidence: "fresh",
    patientsLeft: 5,
    patientsSource: "mr_estimate",
  });
  assert.match(mr, /~5 patients waiting/);

  const ageing = doctorShareMessage({
    ...base,
    status: "available",
    isLive: true,
    confidence: "ageing",
    patientsLeft: 5,
    patientsSource: "clinic_staff",
  });
  assert.doesNotMatch(ageing, /patients waiting/); // yesterday's queue is noise
});

test("stale status never fakes 'now' — falls back to the usual pattern", () => {
  const msg = doctorShareMessage({
    ...base,
    status: "available", // raw field says available, but it is old news
    isLive: false,
    confidence: "stale",
    patientsLeft: 3,
    patientsSource: "clinic_staff",
  });
  assert.doesNotMatch(msg, /now/);
  assert.doesNotMatch(msg, /patients waiting/);
  assert.match(msg, /Usually today: 11 AM – 3 PM/);

  const noHours = doctorShareMessage({
    ...base,
    todayHours: null,
    status: "available",
    isLive: false,
    confidence: "stale",
    patientsLeft: null,
    patientsSource: null,
  });
  assert.match(noHours, /Timing not confirmed today — check live:/);
});
