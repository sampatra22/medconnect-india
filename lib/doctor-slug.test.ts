import { test } from "node:test";
import assert from "node:assert/strict";
import { doctorSlug, idFromSlug, slugifyName } from "@/lib/doctor-slug";

test("slug is readable and round-trips back to the id", () => {
  const d = { id: "cmresbzpm0009e8999rdokb3l", name: "Dr. Anjali Mehta" };
  const slug = doctorSlug(d);
  assert.equal(slug, "dr-anjali-mehta-cmresbzpm0009e8999rdokb3l");
  assert.equal(idFromSlug(slug), d.id); // the lookup key survives
});

test("odd names never break the id extraction", () => {
  for (const name of ["Dr. A. K. Banerjee", "SOUMADEEP  DUTTA", "Dr O'Brien", "प्रोफेसर", ""]) {
    const id = "cmxyz123";
    assert.equal(idFromSlug(doctorSlug({ id, name })), id, `name=${name}`);
  }
});

test("a bare id (no readable prefix) still resolves", () => {
  assert.equal(idFromSlug("cmabc999"), "cmabc999");
});

test("slugifyName strips punctuation and caps length", () => {
  assert.equal(slugifyName("Dr. Anjali Mehta!!!"), "dr-anjali-mehta");
  assert.ok(slugifyName("x".repeat(200)).length <= 60);
});
