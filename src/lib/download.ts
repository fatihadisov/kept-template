const clean = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "download";

/**
 * The name a downloaded file should get: what the server announced (Content-Disposition), else the link's
 * own `download="…"`, else the last part of its address.
 */
export function downloadName(contentDisposition: string | null, hint: string | boolean | undefined, href: string): string {
  const announced = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition ?? "")?.[1];
  if (announced) {
    try {
      return clean(decodeURIComponent(announced));
    } catch {
      return clean(announced); // a stray % in the name: use it as it is
    }
  }
  if (typeof hint === "string" && hint) return clean(hint);
  return clean(href.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "");
}
