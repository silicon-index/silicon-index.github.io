import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import { alias } from "./aliases.mjs";

export default defineConfig({
  site: "https://silicon-index.github.io",
  output: "static",
  integrations: [tailwind()],
  // Declared explicitly (rather than relying only on tsconfig paths) so the
  // app build and tooling resolve `@modules/*` identically.
  vite: { resolve: { alias } }
});
