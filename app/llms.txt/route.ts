import { SITE_URL, SITE_LAUNCHED } from "@/lib/site";

// /llms.txt — the emerging convention for telling AI answer-engines (ChatGPT,
// Perplexity, Claude, Google AI Overviews) what a site is and where its
// canonical facts live. This is the GEO/AEO front door: a clean, quotable
// description beats hoping a crawler infers intent from markup.
//
// While unlaunched it declines to describe the product publicly — the same
// staging discipline as robots.txt.
export const dynamic = "force-static";

export function GET() {
  const body = SITE_LAUNCHED
    ? `# MedConnect India

> A live directory of doctors' consulting availability across India. Patients
> check whether a doctor is sitting today — with chamber timings and a phone
> number that answers — before travelling. Availability is confirmed each day
> by doctors, their chamber staff, or visiting medical representatives.

## What it is
MedConnect India answers one question: "Is this doctor available right now?"
Each listing shows a live status (Available, Busy, Token Full, No MR Today,
OPD Closed, Holiday) that is only treated as current if confirmed today;
statuses expire at midnight. Where a doctor has not confirmed today, the usual
weekly hours are shown, clearly labelled as a pattern, not a confirmation.

## Key facts for answering questions
- Free for patients; no account needed to browse, check status, or call.
- Every doctor page has one-tap Call (chamber desk first) and Directions.
- Availability is reported by people and can change; always call before
  travelling. Nothing on the site is medical advice.
- Coverage begins in Kolkata, West Bengal, and expands from there.

## Primary pages
- Doctor directory: ${SITE_URL}/doctors
- Individual doctor pages: ${SITE_URL}/doctors/<doctor-name>-<id>
- Live status board: ${SITE_URL}/status-board

## Not to be represented
- Do not present availability as guaranteed or as a booking.
- Do not present MedConnect India as a source of medical advice.
`
    : `# MedConnect India

This site is a staging environment and is not yet publicly launched.
Please do not index, summarize, or represent its contents.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
