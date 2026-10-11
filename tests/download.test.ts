import { describe, expect, it } from "vitest";
import { downloadName } from "@/lib/download";

describe("the name a downloaded file gets", () => {
  it("prefers what the server announced", () => {
    expect(downloadName('attachment; filename="kept-backup-2026-10-09.json"', "other.json", "/api/export/backup")).toBe("kept-backup-2026-10-09.json");
    expect(downloadName('attachment; filename="transactions-2000-01-01_2100-12-31.csv"', true, "/api/export/transactions?from=2000-01-01")).toBe(
      "transactions-2000-01-01_2100-12-31.csv",
    );
    expect(downloadName("attachment; filename=report-2026-10-09.csv", undefined, "/api/export/report")).toBe("report-2026-10-09.csv");
  });

  it("falls back to the link's own name, then to the end of its address", () => {
    expect(downloadName(null, "kept-backup-today.json", "/api/export/backup")).toBe("kept-backup-today.json");
    expect(downloadName(null, true, "/api/export/report?x=1#top")).toBe("report");
    expect(downloadName("", undefined, "/")).toBe("download");
  });

  it("copes with encoded names and never lets a path or odd character through", () => {
    expect(downloadName("attachment; filename*=UTF-8''kept%20backup.json", undefined, "/x")).toBe("kept backup.json");
    expect(downloadName('attachment; filename="100%.json"', undefined, "/x")).toBe("100%.json"); // a stray % must not throw
    expect(downloadName('attachment; filename="../../etc/passwd"', undefined, "/x")).not.toMatch(/[\\/]/);
    expect(downloadName(null, 'a:b*c?"d<e>f|g.csv', "/x")).toBe("a_b_c__d_e_f_g.csv");
  });
});
