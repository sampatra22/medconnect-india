// A doctor's public URL is "/doctors/<readable-name>-<id>". The readable part
// is for humans and search engines ("dr-anjali-mehta-…"); the trailing id is
// the unambiguous key we actually look up by. CUIDs contain no hyphens, so the
// id is always the final hyphen-separated segment — the readable prefix can be
// anything without breaking the lookup.

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function doctorSlug(d: { id: string; name: string }): string {
  const readable = slugifyName(d.name);
  return readable ? `${readable}-${d.id}` : d.id;
}

/** The id is whatever follows the last hyphen (or the whole thing if none). */
export function idFromSlug(slug: string): string {
  const i = slug.lastIndexOf("-");
  return i === -1 ? slug : slug.slice(i + 1);
}
