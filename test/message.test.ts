import { describe, expect, it } from "vitest";
import { buildFeedbackMessage } from "../lib/message";

const item = (o: Partial<{ uid: string; prompt: string; selector: string; tag: string; text: string; target: unknown }>) => ({ id: "x", sessionId: "s", revisionId: "r", createdAt: 0, uid: "u", prompt: "", selector: "", tag: "", text: "", target: null, ...o });

describe("buildFeedbackMessage", () => {
  it("formats element, table, text-range, and freeform items", () => {
    const msg = buildFeedbackMessage({
      displayPath: "plans/plan.html", revisionNumber: 3, freeform: "Overall: shorter.", endSession: false, reviewedInThreadId: null, replyThreadId: "thr_p",
      items: [
        item({ prompt: "Make this the recommended option.", selector: "#card-a > p", tag: "p", text: "Option A: native plugin, reuse Lavish SDK." }),
        item({ prompt: "Replace with a real range.", selector: "#tbl tr:nth-of-type(2) > td:nth-of-type(2)", tag: "td", text: "Low", target: { kind: "table-cell", row: "A", column: "Cost" } }),
        item({ prompt: "Drop this option.", selector: "#para-b", tag: "p", text: "embed Lavish server", target: { type: "text-range" } }),
      ],
    });
    const lines = msg.split("\n");
    expect(lines[0]).toBe("Noted: feedback on plans/plan.html (revision 3, 4 items)");
    expect(msg).toContain('1. p `#card-a > p` — "Option A: native plugin, reuse Lavish SDK." → Make this the recommended option.');
    expect(msg).toContain('2. td `#tbl tr:nth-of-type(2) > td:nth-of-type(2)` (row "A", column "Cost") — "Low" → Replace with a real range.');
    expect(msg).toContain('3. text in `#para-b`: "embed Lavish server" → Drop this option.');
    expect(msg).toContain("4. message → Overall: shorter.");
    expect(msg.trimEnd().endsWith("Edit the file in place. Reply in chat or with `bb noted reply <text>`; the reviewer is watching the panel.")).toBe(true);
  });
  it("adds the review location and the end-session line", () => {
    const msg = buildFeedbackMessage({ displayPath: "packet.html", revisionNumber: 1, items: [], freeform: "ship it", endSession: true, reviewedInThreadId: "thr_v", replyThreadId: "thr_p" });
    expect(msg).toContain("Reviewed in thread thr_v by Michael.");
    expect(msg).toContain("The reviewer ended the session. Do not reopen it.");
    expect(msg.split("\n")[0]).toBe("Noted: feedback on packet.html (revision 1, 1 items)");
  });
  it("truncates long excerpts at 120 chars with an ellipsis", () => {
    const msg = buildFeedbackMessage({ displayPath: "a.html", revisionNumber: 1, items: [item({ prompt: "p", selector: "#x", tag: "p", text: "y".repeat(300) })], freeform: null, endSession: false, reviewedInThreadId: null, replyThreadId: "t" });
    expect(msg).toContain('"' + "y".repeat(120) + '…"');
  });
});
