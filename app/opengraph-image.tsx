import { ImageResponse } from "next/og";

// The card every forwarded WhatsApp link renders. Generated at build time —
// no design tool, no binary asset to keep in sync with the brand.
export const alt = "MedConnect India — live doctor availability";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 55%, #ecfdf5 100%)",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#1d4ed8", fontSize: 32, fontWeight: 700 }}>
          🩺 MedConnect India
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 24,
            fontSize: 76,
            fontWeight: 800,
            color: "#1e293b",
            lineHeight: 1.1,
          }}
        >
          <span>Is the doctor</span>
          {/* Satori collapses whitespace between elements — the gap has to be
              a flex gap, not a space character, or the words run together. */}
          <span style={{ display: "flex", gap: 18 }}>
            <span>available</span>
            <span style={{ color: "#059669" }}>right now?</span>
          </span>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#475569", maxWidth: 900 }}>
          Live availability confirmed by chambers and MRs — check before you travel.
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
          {[
            { t: "🟢 Available", c: "#dcfce7", f: "#15803d" },
            { t: "🟣 Token Full", c: "#f3e8ff", f: "#7e22ce" },
            { t: "🔴 OPD Closed", c: "#fee2e2", f: "#b91c1c" },
          ].map((p) => (
            <div
              key={p.t}
              style={{
                display: "flex",
                background: p.c,
                color: p.f,
                fontSize: 26,
                fontWeight: 700,
                padding: "12px 22px",
                borderRadius: 999,
              }}
            >
              {p.t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
