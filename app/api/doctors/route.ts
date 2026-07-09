import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const doctorsFile = path.join(process.cwd(), "data", "doctors.json");

export async function GET() {
  const doctors = JSON.parse(fs.readFileSync(doctorsFile, "utf-8"));
  return NextResponse.json(doctors);
}
