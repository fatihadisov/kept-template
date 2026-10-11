import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

/**
 * What makes "Add to Home Screen" behave like an app: its own name and icon, and full screen with no
 * browser bars. Served at /manifest.webmanifest. The phone fetches it (and the icons) without your
 * sign-in cookie, so src/proxy.ts lets those few files through; they hold nothing private.
 *
 * No theme_color / background_color on purpose: a manifest can name only ONE colour, and the iPhone paints
 * the strip behind the clock with it. That left a cream band on top of the dark theme. Without them the
 * phone follows the page's own colours (the theme-color tags in layout.tsx), so the strip matches in both
 * light and dark mode.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
