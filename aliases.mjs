import { fileURLToPath } from "node:url";

/**
 * Single source of truth for module path aliases.
 *
 * Imported by both `astro.config.mjs` (the app build) and `vite.config.mjs`
 * (test/tooling runs such as vite-node), so the two can never drift. Keep in
 * sync with the `paths` entry in tsconfig.json, which is what the editor and
 * `astro check` read.
 */
export const alias = {
  "@modules": fileURLToPath(new URL("./src/modules", import.meta.url)),
  "@": fileURLToPath(new URL("./src", import.meta.url))
};
