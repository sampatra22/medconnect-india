import { SITE_URL } from "@/lib/site";

// Site-level structured data (SEO) + the FAQ that answer-engines (AEO/GEO)
// quote. Kept in one place so the visible FAQ and its schema can never drift
// apart — the same array feeds both.

export const orgAndSiteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "MedicalOrganization",
      "@id": `${SITE_URL}#org`,
      name: "MedConnect India",
      url: SITE_URL,
      areaServed: "India",
      description:
        "A live directory of doctors' consulting availability across India — see who is sitting today before you travel.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: "MedConnect India",
      publisher: { "@id": `${SITE_URL}#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/doctors?q={query}` },
        "query-input": "required name=query",
      },
    },
  ],
};

// Plain, factual Q&A. These are written to be quoted verbatim by an answer
// engine, and to be genuinely useful to a patient reading the page.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I know if a doctor is available today?",
    a: "Each doctor's card shows a live status — Available, Busy, Token Full, No MR Today, OPD Closed or Holiday — confirmed today by the doctor, their chamber staff, or a visiting medical representative. If nobody has confirmed today, the card shows the doctor's usual hours instead, clearly marked as a pattern rather than a confirmation.",
  },
  {
    q: "Is MedConnect India free for patients?",
    a: "Yes. Browsing the doctor directory, checking live availability, and calling the chamber are free and need no account.",
  },
  {
    q: "How current is the availability information?",
    a: "A status is only shown as live if it was confirmed today. Statuses expire at midnight, so a directory never shows yesterday's availability as today's. Every status also shows how long ago it was confirmed.",
  },
  {
    q: "Can I call the doctor's chamber directly?",
    a: "Yes. Every doctor page has a Call button that dials the chamber desk — the number that actually answers during OPD hours — and a Directions button that routes you to the chamber from wherever you are.",
  },
  {
    q: "Should I still call before visiting?",
    a: "Yes. Availability is reported by people and can change without notice, so MedConnect India always advises calling the chamber before travelling. The information helps you plan, but it is not a guarantee and is not medical advice.",
  },
];

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};
