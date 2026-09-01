import { defineConfig } from "vite";
import { alias } from "./aliases.mjs";

// Used by tooling that runs the source directly (vite-node, vitest).
// The Astro build reads astro.config.mjs, which imports the same alias map.
export default defineConfig({
  resolve: { alias }
});
