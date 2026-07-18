"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Emergency SOS for MRs in the field.
// One tap → grabs live GPS location → sends "I need help" + a Google Maps
// link to the MR's emergency contact via WhatsApp / SMS, or calls directly.
// The contact is saved on the device (localStorage) — no server round-trip,
// works even if our API is down. 112 (India's emergency number) is always
// one tap away.
// ─────────────────────────────────────────────────────────────────────────────

type Contact = { name: string; phone: string };

const LS_KEY = "mc_sos_contact";

// "98300 12345" → "919830012345" (wa.me needs country code, no + sign)
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits; // bare Indian mobile
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return digits;
}

export function SosButton({ mrName }: { mrName: string }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Contact>({ name: "", phone: "" });
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setContact(JSON.parse(raw) as Contact);
    } catch {
      /* corrupted storage — treat as no contact saved */
    }
  }, []);

  function saveContact() {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || normalizePhone(phone).length < 12) return;
    const c: Contact = { name, phone };
    localStorage.setItem(LS_KEY, JSON.stringify(c));
    setContact(c);
    setEditing(false);
  }

  function openSos() {
    setOpen(true);
    setEditing(false);
    setLocError("");
    setCoords(null);
    if (!("geolocation" in navigator)) {
      setLocError("Location not supported on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocError("Couldn't get location — the alert will be sent without it.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  const now = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const mapsUrl = coords ? `https://maps.google.com/?q=${coords.lat},${coords.lng}` : "";
  const message = [
    `🆘 EMERGENCY — ${mrName || "an MR"} needs help!`,
    coords ? `📍 Live location: ${mapsUrl}` : `📍 Location unavailable`,
    `🕑 ${now} IST`,
    `Sent from MedConnect India`,
  ].join("\n");

  const phoneDigits = contact ? normalizePhone(contact.phone) : "";
  const needsSetup = !contact || editing;

  return (
    <>
      {/* Floating SOS — visible on every tab, thumb-reachable on mobile */}
      <button
        onClick={openSos}
        title="Emergency SOS — share your live location"
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-rose-600 text-sm font-extrabold text-white shadow-lg ring-4 ring-rose-600/20 transition hover:bg-rose-700 active:scale-95"
      >
        SOS
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-rose-100 text-lg">🆘</span>
              <div>
                <div className="text-lg font-bold leading-tight">Emergency SOS</div>
                <div className="text-xs text-slate-500">
                  {needsSetup
                    ? "Set your emergency contact once — then help is one tap away."
                    : `Alert goes to ${contact!.name}`}
                </div>
              </div>
            </div>

            {needsSetup ? (
              /* One-time setup: who should we alert? */
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Contact name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Wife / Manager / Friend"
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">WhatsApp / mobile number</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="98300 12345"
                    inputMode="tel"
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-rose-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">10-digit Indian number, or full number with country code.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  {contact ? (
                    <button
                      onClick={() => setEditing(false)}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => setOpen(false)}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold"
                    >
                      Later
                    </button>
                  )}
                  <button
                    onClick={saveContact}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700"
                  >
                    Save contact
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Location state — the alert works either way */}
                <div
                  className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${
                    coords
                      ? "bg-emerald-50 text-emerald-700"
                      : locating
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {coords
                    ? "✓ Live location attached to the alert"
                    : locating
                      ? "⏳ Getting your location…"
                      : locError || "Location unavailable"}
                </div>

                <div className="mt-3 space-y-2">
                  <a
                    href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-emerald-600 py-3 text-center text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    🟢 Send on WhatsApp
                  </a>
                  <a
                    href={`sms:+${phoneDigits}?body=${encodeURIComponent(message)}`}
                    className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-bold text-white hover:bg-blue-700"
                  >
                    💬 Send SMS
                  </a>
                  <div className="flex gap-2">
                    <a
                      href={`tel:+${phoneDigits}`}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-center text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      📞 Call {contact!.name}
                    </a>
                    <a
                      href="tel:112"
                      title="India's national emergency number"
                      className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-center text-sm font-bold text-rose-700 hover:bg-rose-100"
                    >
                      🚨 Call 112
                    </a>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setForm(contact ?? { name: "", phone: "" });
                      setEditing(true);
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                  >
                    Change contact
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
