// One place for the address printed across legal pages and the footer.
// It MUST be an inbox Sam actually reads — a takedown request that bounces is
// worse than no address at all. Override in production via env if the domain
// mailbox differs from the personal one.
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "shyampatra22@gmail.com";
