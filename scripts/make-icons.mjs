/**
 * node scripts/make-icons.mjs
 *
 * Renders the home-screen icons used by the web app manifest (public/icons/icon-192.png, icon-512.png)
 * from the brand mark in src/app/icon.svg. They are full-bleed squares with no transparency: the phone
 * rounds the corners itself, so rounded corners drawn in would show as a dark rim. (src/app/apple-icon.png
 * is the same idea at 180 px, for the iPhone's own "Add to Home Screen".)
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(root, "src", "app", "icon.svg"), "utf8").replace(/ rx="\d+(\.\d+)?"/, "");
const out = path.join(root, "public", "icons");
fs.mkdirSync(out, { recursive: true });

for (const size of [192, 512]) {
  const file = path.join(out, `icon-${size}.png`);
  await sharp(Buffer.from(svg), { density: 72 * (size / 64) * 2 })
    .resize(size, size)
    .flatten({ background: "#4E8D6E" })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`wrote ${path.relative(root, file)}`);
}
