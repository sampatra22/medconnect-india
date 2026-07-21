import { test } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeHtml,
  htmlTableToGrid,
  findHeaderRow,
  detectColumns,
} from "@/lib/import-parse";

// A faithful miniature of the real thing: an ASP.NET GridView page saved with
// an .xls extension by a pharma company portal (the shape of Sam's actual
// export — title rows, span-wrapped cells, "Listed Doctor Name" headers).
const GRIDVIEW_HTML = `
<div align="center">
  <span id="lblHead" style="font-weight:bold;">View All Listed Doctor Details</span>
  <br>
  <span id="Label1">SOME MR - MR - KOLKATA</span>
</div>
<table cellspacing="0" id="grdDoctor" style="border-collapse:collapse;">
  <tr>
    <th scope="col">SVL.No</th><th scope="col">Dr uni code</th>
    <th scope="col">Listed Doctor Name</th><th scope="col">Qual.</th>
    <th scope="col">Address</th><th scope="col">Speciality</th>
    <th scope="col">Territory</th><th scope="col">Mobile</th>
  </tr>
  <tr>
    <td><span id="a">1</span></td><td>DOC001</td>
    <td><span id="b">A SAMPLE DOCTOR</span></td><td>MS ORTHO</td>
    <td>VIP APEX</td><td>ORT</td><td>SC</td><td>98300&nbsp;00000</td>
  </tr>
  <tr>
    <td>2</td><td>DOC002</td>
    <td>ANOTHER &amp; DOCTOR</td><td>MD</td>
    <td>BAGUIATI</td><td>MED</td><td>NC</td><td></td>
  </tr>
</table>`;

test("recognises HTML saved as .xls", () => {
  assert.equal(looksLikeHtml(GRIDVIEW_HTML), true);
  assert.equal(looksLikeHtml("name,specialty\nDr X,Cardio"), false);
});

test("extracts the GridView table through the span/entity noise", () => {
  const grid = htmlTableToGrid(GRIDVIEW_HTML);
  assert.equal(grid.length, 3); // header + 2 data rows
  assert.equal(grid[1][2], "A SAMPLE DOCTOR"); // span unwrapped
  assert.equal(grid[2][2], "ANOTHER & DOCTOR"); // &amp; decoded
  assert.equal(grid[1][7], "98300 00000"); // &nbsp; became a space
});

test("finds the header row and maps portal spellings", () => {
  const grid = htmlTableToGrid(GRIDVIEW_HTML);
  const found = findHeaderRow(grid);
  assert.ok(found, "header row must be found");
  const fields = Object.values(found!.colMap);
  assert.ok(fields.includes("name")); // "Listed Doctor Name" (fuzzy)
  assert.ok(fields.includes("qualification")); // "Qual."
  assert.ok(fields.includes("specialty")); // "Speciality"
  assert.ok(fields.includes("chamber_address")); // "Address"
  assert.ok(fields.includes("city")); // "Territory" → appended to address
  assert.ok(fields.includes("phone")); // "Mobile"
});

test("header row need not be row one — preamble rows are skipped", () => {
  const grid = [
    ["View All Listed Doctor Details"],
    ["SOME MR - KOLKATA"],
    [""],
    ["Doctor Name", "Speciality", "Address"],
    ["Dr X", "Cardio", "Salt Lake"],
  ];
  const found = findHeaderRow(grid);
  assert.equal(found?.row, 3);
});

test("exact aliases claim columns before fuzzy fills gaps", () => {
  // Both Address and Territory present: Address wins chamber_address exactly,
  // Territory falls through to the city-append field, never clobbering it.
  const map = detectColumns(["Address", "Territory", "Doctor Name"]);
  assert.equal(map[0], "chamber_address");
  assert.equal(map[1], "city");
  assert.equal(map[2], "name");
});

test("a file with no recognisable name column is rejected, not guessed", () => {
  const found = findHeaderRow([
    ["Product", "Batch", "Expiry"],
    ["Paracetamol", "B123", "2027-01"],
  ]);
  assert.equal(found, null);
});
