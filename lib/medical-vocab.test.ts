import { test } from "node:test";
import assert from "node:assert/strict";
import { rankSuggestions, SPECIALTIES, QUALIFICATIONS } from "@/lib/medical-vocab";

test("typing a prefix puts the obvious match first", () => {
  // The case from the field: type "ort", expect Orthopedics — not Plastic
  // Surgery, which merely contains no "ort" at a word start.
  assert.equal(rankSuggestions(SPECIALTIES, "ort")[0], "Orthopedics");
  assert.equal(rankSuggestions(SPECIALTIES, "cardio")[0], "Cardiology");
  assert.equal(rankSuggestions(SPECIALTIES, "gyn")[0], "Gynecology");
});

test("word-start matches beat mid-word ones", () => {
  // "surgery" starts no option, but starts a WORD in several.
  const r = rankSuggestions(SPECIALTIES, "surgery");
  assert.ok(r.includes("General Surgery"));
  assert.ok(r.includes("Plastic Surgery"));
});

test("qualifications match the way people actually type them", () => {
  assert.equal(rankSuggestions(QUALIFICATIONS, "mbbs")[0], "MBBS");
  // Lowercase, no punctuation — still finds the canonical form.
  assert.ok(rankSuggestions(QUALIFICATIONS, "dnb").includes("MBBS, DNB"));
  assert.ok(rankSuggestions(QUALIFICATIONS, "ortho").includes("MBBS, MS (Ortho)"));
});

test("empty query returns a starting list, and limit is respected", () => {
  assert.equal(rankSuggestions(SPECIALTIES, "").length, 8);
  assert.equal(rankSuggestions(SPECIALTIES, "", 3).length, 3);
  assert.equal(rankSuggestions(SPECIALTIES, "  ", 5).length, 5);
});

test("no match returns nothing rather than noise", () => {
  assert.deepEqual(rankSuggestions(SPECIALTIES, "zzzzz"), []);
});

test("shorter canonical forms win ties", () => {
  // "MBBS" and "MBBS, MD…" all prefix-match "mbbs"; the plain one ranks first.
  const r = rankSuggestions(QUALIFICATIONS, "mbbs");
  assert.equal(r[0], "MBBS");
});
