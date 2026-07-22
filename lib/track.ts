"use client";

// Client-side event beacon. sendBeacon so a tap that navigates away (tel:,
// maps, wa.me) still gets counted; silent always — analytics must never cost
// a user anything.
export function track(event: string): void {
  try {
    const payload = JSON.stringify({ event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/metrics", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/metrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    /* never */
  }
}
