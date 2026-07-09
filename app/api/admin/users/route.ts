import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "users.json");

// Make sure data folder exists
function ensureDB() {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([
      { id: 1, name: "Sam Patra",        email: "sam@medconnect.com",    password: "sam123",    role: "admin" },
      { id: 2, name: "Ravi Kumar",       email: "ravi@medconnect.com",   password: "ravi123",   role: "mr" },
      { id: 3, name: "Dr. Anjali Mehta", email: "anjali@medconnect.com", password: "anjali123", role: "doctor" },
      { id: 4, name: "Priya Sharma",     email: "priya@medconnect.com",  password: "priya123",  role: "chemist" },
      { id: 5, name: "Cipla HR",         email: "hr@cipla.com",          password: "cipla123",  role: "recruiter" },
    ]));
  }
}

function readUsers() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeUsers(users: any[]) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

// GET - load all users
export async function GET() {
  const users = readUsers();
  return NextResponse.json({ users });
}

// POST - add new user
export async function POST(req: NextRequest) {
  const { name, email, password, role } = await req.json();
  const users = readUsers();

  if (users.find((u: any) => u.email === email)) {
    return NextResponse.json({ error: "Email already exists!" }, { status: 400 });
  }

  const newUser = { id: users.length + 1, name, email, password, role };
  users.push(newUser);
  writeUsers(users);

  // Also update login route.ts
  updateLoginRoute(users);

  return NextResponse.json({ users });
}

// DELETE - remove user
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const users = readUsers().filter((u: any) => u.id !== id);
  writeUsers(users);
  updateLoginRoute(users);
  return NextResponse.json({ users });
}

// Auto-update login route.ts
function updateLoginRoute(users: any[]) {
  const routePath = path.join(process.cwd(), "app", "api", "login", "route.ts");
  const code = `import { NextRequest, NextResponse } from "next/server";

const USERS = [
${users.map((u) => `  { id: ${u.id}, name: "${u.name}", email: "${u.email}", password: "${u.password}", role: "${u.role}" },`).join("\n")}
];

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const user = USERS.find((u) => u.email === email && u.password === password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
`;
  fs.writeFileSync(routePath, code);
}