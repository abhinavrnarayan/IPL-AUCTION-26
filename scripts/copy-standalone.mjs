// Copies public/ and .next/static/ into the standalone output so
// the standalone server can serve them without a CDN in front.
import { cpSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("No .next/standalone found — skipping copy.");
  process.exit(0);
}

const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});

console.log("Standalone assets copied.");
