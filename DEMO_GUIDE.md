# MedConnect India — Demo Guide (for showing a friend)

## What you're showing (say this first)

> "MedConnect India connects India's pharma ecosystem — MRs, doctors, clinic staff,
> chemists and companies — in one place. A doctor updates their availability once,
> and every MR planning visits sees it live. MRs plan their day, track visits and
> targets, and doctors can even request a call back — all on one platform."

It's a real working product: live cloud database (Neon PostgreSQL), secure logins
(bcrypt + brute-force limits), role-based dashboards, 206 doctors of demo data.

## Before your friend arrives (5 minutes)

1. Internet ON (the database is in the cloud).
2. Open PowerShell:
   ```powershell
   cd C:\Users\Sam\medconnect-india
   npm run dev
   ```
3. Wait for "Ready", then open **http://localhost:3000** in Chrome.
4. Keep these logins on a sticky note:

| Role   | Email                 | Password  |
|--------|-----------------------|-----------|
| MR     | ravi@medconnect.com   | ravi123   |
| Doctor | anjali@medconnect.com | anjali123 |
| Admin  | sam@medconnect.com    | sam123    |

## The 5-minute demo script

**1. Homepage** — the pitch: hero, stats, testimonials. "This is the public face."

**2. Doctor Directory** (Find Doctors) — no login needed. Search a specialty,
expand a card: live status (Available / OPD Closed…), weekly timetable, today's
shared plan, who updated what. "MRs check this before travelling anywhere."

**3. Log in as the MR (ravi)** — the daily workhorse:
- Stat cards: planned today, done, calls logged, month total.
- **Today's Plan**: add doctors, reorder the route with ▲▼, tick visits done.
- **My Doctors**: his personal list of 125 doctors in 10 Kolkata patches,
  each with a monthly visit target and progress.
- **Visit Calendar**: every call he logged this month.

**4. Open an Incognito window** → log in as the doctor (anjali):
- Set today's status (e.g. "Token Full") and patients left.
- Edit the day plan / timetable.
- **Call MR**: search "Ravi", add a note like "New stock query", send.

**5. Back in the MR window** — refresh: a blue **📞 Call-back requests** card has
appeared with Anjali's note. Click **✓ Called back**. *This is the wow moment —
two different roles talking to each other through the platform, live.*

**6. (Optional) Admin** — log in as sam, open /admin/users: full user management.

## If something goes wrong

- **Page looks broken / odd error** → stop the server (Ctrl+C), delete the
  `.next` folder in the project, run `npm run dev` again.
- **"Can't reach database"** → check internet; the cloud DB sleeps when idle —
  refresh once or twice and it wakes up.
- **Port 3000 already in use** → `npx kill-port 3000` then `npm run dev`.

## After the demo — save your work (important!)

Your Module 4 + 5 work is NOT committed to git yet. Run:
```powershell
cd C:\Users\Sam\medconnect-india
git add -A
git commit -m "Modules 4-5: doctor day plan, timetable, Call MR + full error-free pass"
git push
```
