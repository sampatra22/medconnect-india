/* eslint-disable @next/next/no-img-element */
"use client";

// Every doctor gets a face on the card: the real photo when one has been
// uploaded, otherwise initials on a gradient — the placeholder IS the upload
// prompt ("small placeholder space if no photo yet", per the card blueprint).
// Data URLs render via <img>; next/image adds nothing for inline base64.

function initials(name: string): string {
  const parts = name
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean);
  const chars = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return chars.toUpperCase() || "?";
}

export function DoctorAvatar({
  name,
  photo,
  size = 48,
}: {
  name: string;
  photo?: string | null;
  size?: number;
}) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        className="flex-none rounded-xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex-none grid place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.34) }}
    >
      {initials(name)}
    </div>
  );
}
