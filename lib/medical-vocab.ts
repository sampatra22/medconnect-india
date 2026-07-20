// ─────────────────────────────────────────────────────────────────────────────
// Controlled vocabulary for doctor data entry.
//
// Typed-in medical text drifts fast: "MD medicine", "M.D.(Gen)", "md" are one
// qualification spelled three ways, and every variant splits the directory's
// filters and breaks search. Suggesting a canonical form AT ENTRY is far
// cheaper than normalising later (the parking-lot AI-normalisation idea exists
// precisely because this wasn't done).
//
// These lists are seeds, not a cage — the combobox always accepts free text,
// and the API merges these with values already used in the directory, so the
// vocabulary grows with real field use.
// ─────────────────────────────────────────────────────────────────────────────

/** Specialties as Indian practices actually name them. */
export const SPECIALTIES = [
  "General Medicine",
  "General Surgery",
  "Cardiology",
  "Dermatology",
  "Diabetology",
  "ENT",
  "Endocrinology",
  "Gastroenterology",
  "General Practice",
  "Gynecology",
  "Hematology",
  "Nephrology",
  "Neurology",
  "Neurosurgery",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Pediatrics",
  "Psychiatry",
  "Pulmonology",
  "Rheumatology",
  "Urology",
  "Anesthesiology",
  "Dentistry",
  "Physiotherapy",
  "Radiology",
  "Pathology",
  "Plastic Surgery",
  "Ayurveda",
  "Homeopathy",
] as const;

/** Qualification strings in the canonical form we want stored. */
export const QUALIFICATIONS = [
  "MBBS",
  "MBBS, MD",
  "MBBS, MD (Medicine)",
  "MBBS, MD (Paediatrics)",
  "MBBS, MD (Dermatology)",
  "MBBS, MD (Psychiatry)",
  "MBBS, MD (Radiology)",
  "MBBS, MD, DM",
  "MBBS, MD, DM (Cardiology)",
  "MBBS, MD, DM (Neurology)",
  "MBBS, MD, DM (Gastroenterology)",
  "MBBS, MD, DM (Nephrology)",
  "MBBS, MS",
  "MBBS, MS (Ortho)",
  "MBBS, MS (ENT)",
  "MBBS, MS (Ophthalmology)",
  "MBBS, MS (General Surgery)",
  "MBBS, MS, MCh",
  "MBBS, MS, MCh (Urology)",
  "MBBS, DNB",
  "MBBS, DGO",
  "MBBS, DCH",
  "MBBS, DLO",
  "MBBS, DO",
  "MBBS, DA",
  "MBBS, MD (Gynaecology)",
  "MBBS, MS (OBG)",
  "MBBS, FRCS",
  "MBBS, MRCP",
  "BDS",
  "MDS",
  "BAMS",
  "BHMS",
  "BPT",
  "MPT",
] as const;

/**
 * Rank suggestions for what someone has typed so far.
 * Prefix matches first ("ort" → Orthopedics before Plastic Surgery), then
 * word-start matches, then anything containing it. Case/punctuation-insensitive
 * so "md gen" still finds "MBBS, MD (Medicine)"-style entries.
 */
export function rankSuggestions(
  options: readonly string[],
  query: string,
  limit = 8
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);

  const norm = (s: string) => s.toLowerCase();
  const scored: { value: string; score: number }[] = [];

  for (const opt of options) {
    const o = norm(opt);
    let score = -1;
    if (o.startsWith(q)) score = 0;
    else if (o.split(/[\s,()./-]+/).some((w) => w.startsWith(q))) score = 1;
    else if (o.includes(q)) score = 2;
    if (score >= 0) scored.push({ value: opt, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.value.length - b.value.length)
    .slice(0, limit)
    .map((s) => s.value);
}
