// Lets `node --test` resolve the project's "@/…" imports the same way Next.js
// and tsconfig do, so unit tests import the REAL modules rather than a copy.
// Paired with --experimental-strip-types, this means no build step and no
// second source of truth to drift out of sync.
import { pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    // TypeScript source imports are extensionless; strip-types needs the real file.
    const base = resolvePath(ROOT, specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
      try {
        return await nextResolve(pathToFileURL(candidate).href, context);
      } catch {
        // try the next extension
      }
    }
  }
  return nextResolve(specifier, context);
}
