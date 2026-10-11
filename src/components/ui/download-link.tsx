"use client";

import { type AnchorHTMLAttributes, type MouseEvent, forwardRef } from "react";
import { toast } from "sonner";
import { downloadName } from "@/lib/download";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "download"> & { href: string; download?: string | boolean };

/** True when the page runs as a home-screen app: no browser bars, so nothing to go back with. */
function inHomeScreenApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const isError = (error: unknown, name: string) => error instanceof DOMException && error.name === name;

/**
 * A download link that is safe in the home-screen app. There, a plain download link replaces the whole app
 * with a file preview and no way back, so the file goes to the phone's share sheet instead (Save to Files,
 * AirDrop, Mail…) and the app stays where it is. In a normal browser it is just an ordinary download link.
 */
export const DownloadLink = forwardRef<HTMLAnchorElement, Props>(function DownloadLink({ href, download, onClick, children, ...rest }, ref) {
  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (!inHomeScreenApp() || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return; // let the browser download it

    event.preventDefault();
    try {
      const response = await fetch(href, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`The server answered ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], downloadName(response.headers.get("content-disposition"), download, href), { type: blob.type });
      if (!navigator.canShare({ files: [file] })) throw new Error("This file can't be shared from here");
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        if (isError(error, "AbortError")) return; // you closed the share sheet
        if (!isError(error, "NotAllowedError")) throw error;
        // the phone wants a fresh tap for the share sheet (the file took a while): one more tap does it
        toast("Your file is ready", { action: { label: "Share", onClick: () => void navigator.share({ files: [file] }).catch(() => undefined) } });
      }
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Couldn't prepare the file. Please try again.");
    }
  }

  return (
    <a ref={ref} href={href} download={download} onClick={(event) => void handleClick(event)} {...rest}>
      {children}
    </a>
  );
});
