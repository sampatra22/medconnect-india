// ─────────────────────────────────────────────────────────────────────────────
// Bulk-import parsing — React-free on purpose, so `node --test` exercises the
// EXACT code the browser runs against real portal files. Everything ugly
// about field reality lives here: HTML saved as ".xls", report titles above
// the header row, and header spellings nobody would invent ("Listed Doctor
// Name", "Qual.", "Territory").
// ─────────────────────────────────────────────────────────────────────────────

// field → header spellings seen in the wild (normalized: lowercase, alnum only)
export const HEADER_MAP: Record<string, string[]> = {
  name: ["name", "doctor", "doctorname", "drname", "dr", "doctorsname", "listeddoctorname", "listeddoctor", "nameofdoctor", "nameofthedoctor"],
  specialty: ["specialty", "speciality", "spl", "dept", "department", "specialisation", "specialization"],
  qualification: ["qualification", "qual", "degree", "degrees"],
  hospital: ["hospital", "institution", "clinic", "hospitalclinic", "hospitalname"],
  chamber_address: ["address", "chamber", "chamberaddress", "area", "location", "addr"],
  phone: ["phone", "mobile", "contact", "phoneno", "mobileno", "contactno", "phonenumber", "mobilenumber"],
  secretary_contact: ["secretary", "pa", "chamberno", "secretaryno", "clinicno"],
  consultation_timing: ["timing", "opd", "opdtiming", "consultationtiming", "hours", "time"],
  mr_visiting_days: ["visitingdays", "mrvisitingdays", "visitdays", "days"],
  mr_visiting_time: ["visitingtime", "mrvisitingtime", "visittime"],
  // Appended to the address rather than stored separately — our address
  // convention is "Area, City" and portals split it.
  city: ["city", "town", "hq", "headquarter", "headquarters", "territory"],
};

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const normName = (s: string) =>
  s.toLowerCase().replace(/^dr\.?\s*/i, "").replace(/\s+/g, " ").trim();

// Exact alias miss → fuzzy: real portals write "Listed Doctor Name",
// "Doctor's Name", "Mobile Number of Dr" — contains-matching catches the
// long tail without the dictionary having to enumerate the universe.
export function fuzzyField(n: string): string | null {
  if (n.includes("doctorname") || n.includes("drname") || n.includes("nameofdoctor")) return "name";
  if (n.includes("special")) return "specialty";
  if (n.includes("qual") || n.includes("degree")) return "qualification";
  if (n.includes("hospital") || n.includes("clinic") || n.includes("institution")) return "hospital";
  if (n.includes("address") || n.includes("chamber")) return "chamber_address";
  if (n.includes("mobile") || n.includes("phone") || n.includes("contact")) return "phone";
  if (n.includes("territory") || n.includes("headquarter")) return "city";
  if (n.includes("timing") || n.includes("opd")) return "consultation_timing";
  return null;
}

export function detectColumns(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  const taken = new Set<string>();
  // Two passes: exact aliases claim their columns first, fuzzy fills gaps —
  // so a file with both "Address" and "Territory" maps each correctly.
  headers.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      if (!taken.has(field) && aliases.includes(n)) {
        map[i] = field;
        taken.add(field);
        return;
      }
    }
  });
  headers.forEach((h, i) => {
    if (map[i] !== undefined) return;
    const n = norm(h);
    if (!n) return;
    const f = fuzzyField(n);
    if (f && !taken.has(f)) {
      map[i] = f;
      taken.add(f);
    }
  });
  return map;
}

/**
 * Portal exports bury the table under title rows ("View All Listed Doctor
 * Details", the MR's own name, blank lines) — the header is ALMOST NEVER row
 * one. Scan the first 30 rows and pick the one whose cells map to the most
 * fields; it must at least name the doctor column to count.
 */
export function findHeaderRow(grid: string[][]): { row: number; colMap: Record<number, string> } | null {
  let best: { row: number; colMap: Record<number, string>; score: number } | null = null;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const colMap = detectColumns(grid[r].map((c) => String(c ?? "")));
    const fields = Object.values(colMap);
    if (!fields.includes("name")) continue;
    if (!best || fields.length > best.score) best = { row: r, colMap, score: fields.length };
  }
  return best ? { row: best.row, colMap: best.colMap } : null;
}

// ── HTML-masquerading-as-XLS ────────────────────────────────────────────────
// The single most common "Excel" export from Indian company portals is an
// ASP.NET GridView page saved as .xls — raw HTML that Excel happens to open.
// SheetJS reads it as text soup, so we parse the <table> ourselves with
// regexes (deliberately not DOMParser: this stays testable in plain Node).
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
export function looksLikeHtml(text: string): boolean {
  return /<\s*(table|tr|td|th|html|div)\b/i.test(text.slice(0, 8192));
}
/** Extract the largest <table> in an HTML string as a grid of cell texts. */
export function htmlTableToGrid(html: string): string[][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [html];
  let bestGrid: string[][] = [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const grid: string[][] = [];
    for (const row of rows) {
      const cells = row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? [];
      if (!cells.length) continue;
      grid.push(cells.map(stripTags));
    }
    if (grid.length > bestGrid.length) bestGrid = grid;
  }
  return bestGrid;
}

