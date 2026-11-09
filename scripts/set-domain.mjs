// Usage: npm run seo:domain -- https://your-real-domain.com
// Replaces the YOUR-DOMAIN.com placeholder in canonical/OG/schema tags, sitemap.xml and robots.txt.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const arg = process.argv[2];
if (!arg || !/^https?:\/\/[^/\s]+$/.test(arg)) {
  console.error("Usage: npm run seo:domain -- https://your-domain.com   (no trailing slash)");
  process.exit(1);
}
const PLACEHOLDER = "https://YOUR-DOMAIN.com";
let changed = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(html|xml|txt)$/.test(name)) continue;
    const s = readFileSync(p, "utf8");
    if (s.includes(PLACEHOLDER)) { writeFileSync(p, s.split(PLACEHOLDER).join(arg)); changed++; }
  }
};
walk("public");
console.log(`Updated ${changed} files to ${arg}`);
