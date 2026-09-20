import { defineNitroConfig } from "nitro/config";
import { fileURLToPath } from "node:url";

export default defineNitroConfig({
  // workflow/nitro registers its directive transform on rollup:before.
  builder: "rollup",
  preset: "vercel",
  modules: ["workflow/nitro"],
  vercel: { entryFormat: "node" },
  routes: {
    "/api/admin/background": { handler: "./server/background-management.ts", format: "web" },
    "/**": { handler: "./server/vercel.ts", format: "node" },
  },
  alias: {
    "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  },
  publicAssets: [{ dir: "./dist/public", baseURL: "/" }],
});