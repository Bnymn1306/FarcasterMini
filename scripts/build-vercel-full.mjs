import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/public");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!process.argv.includes("--backend-only")) {
  run(process.execPath, ["node_modules/vite/bin/vite.js", "build"]);
} else if (!existsSync(path.join(output, "index.html"))) {
  throw new Error("--backend-only requires an existing full frontend build");
}

function copyPublic(directory, relative = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const name = path.join(relative, entry.name);
    const source = path.join(directory, entry.name);
    const destination = path.join(output, name);
    if (entry.isSymbolicLink()) throw new Error(`Public asset symlink: ${name}`);
    if (entry.isDirectory()) copyPublic(source, name);
    else if (entry.isFile()) {
      if (existsSync(destination) && !readFileSync(source).equals(readFileSync(destination))) {
        throw new Error(`Conflicting public asset: ${name}`);
      }
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
  }
}
copyPublic(path.join(root, "public"));
const manifest = JSON.parse(readFileSync(path.join(output, ".well-known/farcaster.json"), "utf8"));
if (!manifest.accountAssociation || !(manifest.miniapp || manifest.frame)) {
  throw new Error("A signed static Farcaster manifest is required");
}
run(path.join(root, "node_modules/.bin/nitro"), ["build"]);

// Preserve Nitro's generated workflow routes and function settings. Add SPA
// routing only after filesystem serving, before the generic Express catch-all.
const configPath = path.join(root, ".vercel/output/config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const filesystem = config.routes.findIndex((route) => route.handle === "filesystem");
if (filesystem === -1) throw new Error("Nitro output lacks a filesystem route; refusing unsafe SPA routing");
config.routes.splice(filesystem + 1, 0, {
  src: "/((?!api(?:/|$)|mcp(?:/|$)|frame(?:/|$)|token-logo(?:/|$)|\\.well-known(?:/|$)|assets(?:/|$)|_.*).*)",
  dest: "/index.html"
});
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
for (const asset of ["index.html", ".well-known/farcaster.json"]) {
  if (!existsSync(path.join(root, ".vercel/output/static", asset))) {
    throw new Error(`Missing standalone static asset: ${asset}`);
  }
}