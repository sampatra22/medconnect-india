import { NextRequest, NextResponse } from "next/server";

const USERS = [
  { id: 1, name: "Sam Patra",        email: "sam@medconnect.com",    password: "sam123",    role: "admin" },
  { id: 2, name: "Ravi Kumar",       email: "ravi@medconnect.com",   password: "ravi123",   role: "mr" },
  { id: 3, name: "Dr. Anjali Mehta", email: "anjali@medconnect.com", password: "anjali123", role: "doctor" },
  { id: 4, name: "Priya Sharma",     email: "priya@medconnect.com",  password: "priya123",  role: "chemist" },
  { id: 5, name: "Cipla HR",         email: "hr@cipla.com",          password: "cipla123",  role: "recruiter" },
];

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const user = USERS.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}