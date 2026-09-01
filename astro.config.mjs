import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://silicon-index.github.io",
  output: "static",
  integrations: [tailwind()]
});
