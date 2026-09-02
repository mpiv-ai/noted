import { describe, expect, it } from "vitest";
import { buildCompanionNote } from "../lib/kb-note";

describe("buildCompanionNote", () => {
  it("writes vault frontmatter with a link to the html and the thread", () => {
    const n = buildCompanionNote({ title: "Plan A", created: "20260902150000", summary: "Why A.", htmlFileName: "20260902150000_Plan_A.html", threadId: "thr_x", profile: "durable_research" });
    expect(n.startsWith('---\ntitle: "Plan A"\ncreated: "20260902150000"\nprofile: durable_research\n')).toBe(true);
    expect(n).toContain('executive_summary: "Why A."');
    expect(n).toContain("[[20260902150000_Plan_A.html]]");
    expect(n).toContain("bb thread: thr_x");
  });
});
