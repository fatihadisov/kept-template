import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { config } from "@/proxy";

// The proxy's matcher is a plain regular expression behind a leading slash: a path that matches is guarded.
const pattern = new RegExp(`^${config.matcher[0]}$`);
const guarded = (pathname: string) => pattern.test(pathname);

const publicFile = (src: string) => path.resolve(process.cwd(), "public", src.replace(/^\//, ""));
/** Width and height of a PNG, read straight from its header. */
function pngSize(file: string) {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("the home-screen manifest", () => {
  const m = manifest();

  it("opens full screen, from the start page, under a short name", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.short_name).toBe(m.name);
    expect(m.short_name?.length).toBeLessThanOrEqual(12);
  });

  it("leaves the colours to the page, so the status bar follows light and dark mode", () => {
    // a manifest colour is a single fixed value; it painted a cream strip above the dark theme
    expect(m.theme_color).toBeUndefined();
    expect(m.background_color).toBeUndefined();
  });

  it("points at icons that exist, at the sizes it claims", () => {
    expect(m.icons?.length).toBeGreaterThanOrEqual(2);
    for (const icon of m.icons ?? []) {
      expect(fs.existsSync(publicFile(icon.src))).toBe(true);
      expect(pngSize(publicFile(icon.src))).toBe(icon.sizes);
    }
  });
});

describe("what the sign-in guard lets through without a cookie", () => {
  it("lets the phone fetch the manifest and every icon, which hold nothing private", () => {
    const m = manifest();
    for (const icon of m.icons ?? []) expect(guarded(icon.src)).toBe(false);
    for (const open of ["/manifest.webmanifest", "/apple-icon.png", "/icon.svg", "/robots.txt", "/favicon.ico", "/_next/static/chunks/app.js"]) {
      expect(guarded(open)).toBe(false);
    }
  });

  it("still guards the app, the downloads and anything that merely looks similar", () => {
    for (const closed of ["/", "/wallets", "/wallets/abc", "/settings", "/api/export/backup", "/api/export/transactions", "/login", "/iconsfolder", "/manifest", "/icons"]) {
      expect(guarded(closed)).toBe(true);
    }
  });
});
